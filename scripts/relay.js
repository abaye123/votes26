// Relay: downloads election-night files from the elections committee sites
// on a machine that can reach them, and uploads each changed file to the
// dashboard server, which cannot reach those sites from its own address.
//
// Usage: npm run relay
// Settings come from .env (see .env.example): RELAY_URL, RELAY_TOKEN.

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
loadEnv(join(ROOT, '.env'));

const SERVER = (process.env.RELAY_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.RELAY_TOKEN || '';
const TIMEOUT_MS = 30_000;

const SOURCES = [
  { name: 'results-26', url: 'https://media26.bechirot.gov.il/files/expb.csv', type: /octet-stream|csv|text\/plain/, everyMs: 30_000 },
  { name: 'turnout-municipal', url: 'https://mapvotes.bechirot.gov.il/data/votes/latest/municipal_data.json', type: /json/, everyMs: 30_000 },
  { name: 'turnout-kalpi', url: 'https://mapvotes.bechirot.gov.il/data/votes/latest/kalpi_data.json', type: /json/, everyMs: 60_000 },
];

if (!SERVER || !TOKEN) {
  console.error('Set RELAY_URL and RELAY_TOKEN in .env (see .env.example).');
  process.exit(1);
}

const time = () => new Date().toLocaleTimeString('en-GB');
const lastSent = new Map();

async function relayOnce(source) {
  const res = await fetch(source.url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`source answered HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!source.type.test(type)) throw new Error(`source answered ${type || 'no content type'} (busy or maintenance page)`);
  const body = Buffer.from(await res.arrayBuffer());
  const hash = createHash('sha256').update(body).digest('hex');
  const ingestUrl = `${SERVER}/api/ingest/${encodeURIComponent(source.name)}`;

  if (lastSent.get(source.name) === hash) {
    // Tell the server the data is still current, so it is not shown as stale.
    const confirm = await fetch(ingestUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'x-relay-unchanged': hash },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (confirm.ok) return 'unchanged';
    if (confirm.status !== 409) throw new Error(`server rejected the confirmation: HTTP ${confirm.status} ${(await confirm.text()).slice(0, 200)}`);
    // The server lost or replaced its copy: upload the file again below.
  }

  // Compressed so uploads stay under typical proxy body limits (nginx: 1MB).
  const upload = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/octet-stream',
      'content-encoding': 'gzip',
      ...(res.headers.get('last-modified') ? { 'x-source-last-modified': res.headers.get('last-modified') } : {}),
    },
    body: gzipSync(body, { level: 9 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await upload.text();
  if (!upload.ok) throw new Error(`server rejected the upload: HTTP ${upload.status} ${text.slice(0, 200)}`);
  lastSent.set(source.name, hash);
  return `sent ${body.length} bytes`;
}

function loop(source) {
  relayOnce(source)
    .then((result) => console.log(`${time()} ${source.name}: ${result}`))
    .catch((err) => console.error(`${time()} ${source.name}: ${err.message}`))
    .finally(() => setTimeout(() => loop(source), source.everyMs));
}

console.log(`Relaying ${SOURCES.length} sources to ${SERVER}`);
for (const source of SOURCES) loop(source);
