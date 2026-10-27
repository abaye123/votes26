import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOfficialResults, parseOfficialResults } from './lib/results.js';
import { fetchPolls } from './lib/polls.js';
import { fetchTurnoutCatalog, fetchTurnoutLayer, parseTurnoutLayer, turnoutLayerUrl } from './lib/turnout.js';
import { fetchSamples } from './lib/samples.js';
import { GROUPS } from './lib/baseline.js';
import { loadEnv } from './lib/env.js';
import { createRelayStore, tokenMatches } from './lib/relay-store.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
loadEnv(join(ROOT, '.env'));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8026;
const HOST = process.env.HOST || '127.0.0.1';
const OFFICIAL_TTL_MS = 30_000;
const POLLS_TTL_MS = 10 * 60_000;
const TURNOUT_TTL_MS = 60_000;
const SAMPLES_TTL_MS = 30_000;
// Relay data newer than this is used instead of downloading from the source.
const RELAY_FRESH_MS = 3 * 60_000;
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const elections = JSON.parse(await readFile(join(ROOT, 'data', 'elections.json'), 'utf8'));
const turnoutHistory = JSON.parse(await readFile(join(ROOT, 'data', 'turnout-history.json'), 'utf8'));
// Per-city 2022 turnout and voting group, precomputed by scripts/build-baseline.js.
const baseline2022 = JSON.parse(await readFile(join(ROOT, 'data', 'baseline-2022.json'), 'utf8'));
const cache = new Map();
const relay = createRelayStore(join(ROOT, 'var', 'relay'));
await relay.load();

// Cache entries that a relay upload replaces.
const RELAY_CACHE_KEYS = {
  'results-26': 'official:26',
  'turnout-municipal': 'turnout:26:municipal',
  'turnout-kalpi': 'turnout:26:kalpi',
};

/**
 * Uses fresh relay data when there is some, otherwise downloads directly,
 * and falls back to older relay data when the direct download fails.
 */
async function withRelay(name, parse, direct) {
  const entry = relay.get(name);
  const fromRelay = (stale) => ({ ...parse(entry), via: 'relay', relayReceivedAt: entry.receivedAt, relayStale: stale });
  if (entry && Date.now() - entry.receivedAt < RELAY_FRESH_MS) return fromRelay(false);
  try {
    return { ...(await direct()), via: 'direct' };
  } catch (err) {
    if (entry) return fromRelay(true);
    throw err;
  }
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Upload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleIngest(req, url, res) {
  if (!RELAY_TOKEN) return sendJson(res, 503, { error: 'Relay is not configured on this server (RELAY_TOKEN is not set)' });
  if (!tokenMatches(req.headers.authorization, RELAY_TOKEN)) return sendJson(res, 401, { error: 'Invalid relay token' });
  const name = decodeURIComponent(url.pathname.slice('/api/ingest/'.length));
  try {
    const body = await readBody(req, 25 * 1024 * 1024);
    const meta = await relay.put(name, body, { sourceLastModified: req.headers['x-source-last-modified'] || null });
    if (RELAY_CACHE_KEYS[name]) cache.delete(RELAY_CACHE_KEYS[name]);
    console.log(`Relay upload ${name}: ${meta.bytes} bytes`);
    return sendJson(res, 200, { ok: true, ...meta });
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }
}

// On a failed refresh the last good value is served again and the error is
// kept on the entry, so a busy or blocked source does not blank the dashboard.
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.checkedAt < ttl) return hit.value;
  try {
    const value = await load();
    cache.set(key, { at: Date.now(), checkedAt: Date.now(), value, error: null });
    return value;
  } catch (err) {
    if (!hit) throw err;
    console.error(`Serving stale ${key}: ${err.message}`);
    hit.checkedAt = Date.now();
    hit.error = err.message;
    return hit.value;
  }
}

const freshness = (key) => ({ fetchedAt: cache.get(key)?.at, staleError: cache.get(key)?.error || null });

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(url, res) {
  if (url.pathname === '/api/config') return sendJson(res, 200, elections);

  const knesset = url.searchParams.get('knesset') || '26';
  const election = elections[knesset];
  if (url.pathname.startsWith('/api/official') || url.pathname.startsWith('/api/turnout')) {
    if (!election) return sendJson(res, 404, { error: `Unknown Knesset ${knesset}` });
  }

  if (url.pathname.startsWith('/api/official')) {
    const key = `official:${knesset}`;
    const load = knesset === '26'
      ? () => withRelay('results-26',
        (e) => parseOfficialResults(e.body, { url: new URL('expb.csv', election.csvBase).href, lastModified: e.sourceLastModified }),
        () => fetchOfficialResults(election.csvBase))
      : () => fetchOfficialResults(election.csvBase);
    const { cities, ballots, ...national } = await cached(key, OFFICIAL_TTL_MS, load);
    const meta = freshness(key);
    if (url.pathname === '/api/official') return sendJson(res, 200, { ...national, ...meta });
    if (url.pathname === '/api/official/cities') {
      return sendJson(res, 200, { status: national.status, cities: cities || [], ...meta });
    }
    if (url.pathname === '/api/official/ballots') {
      const city = url.searchParams.get('city');
      return sendJson(res, 200, { status: national.status, ballots: (ballots || []).filter((b) => b.city === city), ...meta });
    }
  }

  if (url.pathname.startsWith('/api/turnout')) {
    // The catalog is only needed for elections without a fixed path in the config.
    const path = election.turnoutPath || (await cached('turnout:catalog', 60 * 60_000, () => fetchTurnoutCatalog()))[knesset];
    const loadLayer = (layer) => (knesset === '26'
      ? () => withRelay(`turnout-${layer}`, (e) => parseTurnoutLayer(JSON.parse(e.body.toString('utf8')), turnoutLayerUrl(path, layer)),
        () => fetchTurnoutLayer(path, layer))
      : () => fetchTurnoutLayer(path, layer));
    if (!path) return sendJson(res, 404, { error: `No turnout data for Knesset ${knesset}` });
    if (url.pathname === '/api/turnout') {
      const key = `turnout:${knesset}:municipal`;
      const data = await cached(key, TURNOUT_TTL_MS, loadLayer('municipal'));
      const baseline = baseline2022.cities;
      return sendJson(res, 200, {
        ...data,
        features: data.features.map((f) => ({ ...f, final2022: baseline[f.id]?.turnout ?? null, group: baseline[f.id]?.group ?? null })),
        groups: GROUPS,
        hourly: election.turnoutHourly || [],
        hourlySource: election.turnoutSource || null,
        history: turnoutHistory,
        ...freshness(key),
      });
    }
    if (url.pathname === '/api/turnout/kalpis') {
      const key = `turnout:${knesset}:kalpi`;
      const data = await cached(key, TURNOUT_TTL_MS, loadLayer('kalpi'));
      const city = url.searchParams.get('city');
      return sendJson(res, 200, { ...data, features: data.features.filter((f) => f.city === city), ...freshness(key) });
    }
  }

  if (url.pathname === '/api/samples') {
    const data = await cached('samples', SAMPLES_TTL_MS, () => fetchSamples());
    return sendJson(res, 200, { ...data, ...freshness('samples') });
  }

  if (url.pathname === '/api/polls') {
    const data = await cached('polls', POLLS_TTL_MS, () => fetchPolls(elections['26'].parties));
    return sendJson(res, 200, { ...data, ...freshness('polls') });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

async function serveStatic(url, res) {
  const path = normalize(join(PUBLIC, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!path.startsWith(PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname.startsWith('/api/ingest/')) await handleIngest(req, url, res);
    else if (url.pathname.startsWith('/api/')) await handleApi(url, res);
    else await serveStatic(url, res);
  } catch (err) {
    console.error(err);
    // 503 rather than 502: Cloudflare replaces origin 502 responses with its own HTML page.
    sendJson(res, 503, { error: err.message });
  }
}).listen(PORT, HOST, () => {
  console.log(`Elections dashboard: http://${HOST}:${PORT}${RELAY_TOKEN ? ' (relay uploads enabled)' : ''}`);
});
