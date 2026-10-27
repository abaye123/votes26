import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOfficialResults } from './lib/results.js';
import { fetchPolls } from './lib/polls.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8026;
const HOST = process.env.HOST || '127.0.0.1';
const OFFICIAL_TTL_MS = 30_000;
const POLLS_TTL_MS = 10 * 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const elections = JSON.parse(await readFile(join(ROOT, 'data', 'elections.json'), 'utf8'));
const cache = new Map();

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(url, res) {
  if (url.pathname === '/api/config') return sendJson(res, 200, elections);

  if (url.pathname === '/api/official') {
    const knesset = url.searchParams.get('knesset') || '26';
    const election = elections[knesset];
    if (!election) return sendJson(res, 404, { error: `Unknown Knesset ${knesset}` });
    const data = await cached(`official:${knesset}`, OFFICIAL_TTL_MS, () => fetchOfficialResults(election.csvBase));
    return sendJson(res, 200, { ...data, fetchedAt: cache.get(`official:${knesset}`).at });
  }

  if (url.pathname === '/api/polls') {
    const data = await cached('polls', POLLS_TTL_MS, () => fetchPolls(elections['26'].parties));
    return sendJson(res, 200, { ...data, fetchedAt: cache.get('polls').at });
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
    if (url.pathname.startsWith('/api/')) await handleApi(url, res);
    else await serveStatic(url, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: err.message });
  }
}).listen(PORT, HOST, () => {
  console.log(`Elections dashboard: http://${HOST}:${PORT}`);
});
