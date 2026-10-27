// Stores source files pushed by a trusted relay (scripts/relay.js) running on a
// machine that can reach the elections committee sites when the server cannot.
// Every upload is validated before it replaces the stored copy, and the latest
// copy is persisted so a server restart does not lose it.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { decodeCsv, parseCsv } from './results.js';

const MAX_BYTES = 25 * 1024 * 1024;

export const hashOf = (body) => createHash('sha256').update(body).digest('hex');

function validateResultsCsv(buffer) {
  const header = parseCsv(decodeCsv(buffer).split(/\r?\n/, 1)[0] || '')[0] || [];
  for (const column of ['בזב', 'מצביעים', 'כשרים']) {
    if (!header.includes(column)) throw new Error(`results CSV is missing the "${column}" column`);
  }
}

function validateTurnoutJson(layer) {
  return (buffer) => {
    let data;
    try {
      data = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new Error('turnout file is not valid JSON');
    }
    if (data.layer !== layer || typeof data.features !== 'object') {
      throw new Error(`turnout file is not a "${layer}" layer`);
    }
  };
}

// The only sources a relay may push, with the check each upload must pass.
export const RELAY_SOURCES = {
  'results-26': { validate: validateResultsCsv },
  'turnout-municipal': { validate: validateTurnoutJson('municipal') },
  'turnout-kalpi': { validate: validateTurnoutJson('kalpi') },
};

export function createRelayStore(dir) {
  const entries = new Map();

  async function load() {
    for (const name of Object.keys(RELAY_SOURCES)) {
      try {
        const meta = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'));
        const body = await readFile(join(dir, `${name}.bin`));
        entries.set(name, { ...meta, hash: meta.hash || hashOf(body), body });
      } catch {
        // Nothing stored yet for this source.
      }
    }
  }

  async function put(name, body, { sourceLastModified = null } = {}) {
    const source = RELAY_SOURCES[name];
    if (!source) throw Object.assign(new Error(`Unknown relay source "${name}"`), { status: 404 });
    if (body.length > MAX_BYTES) throw Object.assign(new Error('Upload too large'), { status: 413 });
    try {
      source.validate(body);
    } catch (err) {
      throw Object.assign(err, { status: 422 });
    }
    const meta = { receivedAt: Date.now(), sourceLastModified, bytes: body.length, hash: hashOf(body) };
    entries.set(name, { ...meta, body });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.bin`), body);
    await writeFile(join(dir, `${name}.json`), JSON.stringify(meta));
    return meta;
  }

  /**
   * Records that the relay checked the source and found the same content as the
   * stored copy, so unchanged data is not reported as stale. Returns false when
   * the stored copy differs and the relay must upload the file instead.
   */
  async function confirm(name, hash) {
    if (!RELAY_SOURCES[name]) throw Object.assign(new Error(`Unknown relay source "${name}"`), { status: 404 });
    const entry = entries.get(name);
    if (!entry || entry.hash !== hash) return false;
    entry.receivedAt = Date.now();
    const { body, ...meta } = entry;
    await writeFile(join(dir, `${name}.json`), JSON.stringify(meta));
    return true;
  }

  return { load, put, confirm, get: (name) => entries.get(name) || null };
}

export function tokenMatches(header, token) {
  if (!token) return false;
  const given = Buffer.from(String(header || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
