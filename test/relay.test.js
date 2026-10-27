import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRelayStore, tokenMatches, hashOf } from '../lib/relay-store.js';

const CSV = 'סמל ועדה,שם ישוב,סמל ישוב,קלפי,בזב,מצביעים,פסולים,כשרים,מחל\n1,א,10,1,100,80,2,78,78\n';
const TURNOUT = JSON.stringify({ version: 1, layer: 'municipal', features: {}, total: {} });

test('checks the relay token', () => {
  assert.equal(tokenMatches('Bearer secret-1', 'secret-1'), true);
  assert.equal(tokenMatches('Bearer secret-2', 'secret-1'), false);
  assert.equal(tokenMatches(undefined, 'secret-1'), false);
  assert.equal(tokenMatches('Bearer ', ''), false);
});

test('accepts valid uploads, rejects broken ones and persists the latest copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-'));
  try {
    const store = createRelayStore(dir);
    await store.put('results-26', Buffer.from(CSV), { sourceLastModified: 'Tue, 27 Oct 2026 20:00:00 GMT' });
    await store.put('turnout-municipal', Buffer.from(TURNOUT));

    await assert.rejects(store.put('results-26', Buffer.from('<!DOCTYPE html><html>busy</html>')), { status: 422 });
    await assert.rejects(store.put('turnout-municipal', Buffer.from('{"layer":"kalpi","features":{}}')), { status: 422 });
    await assert.rejects(store.put('other', Buffer.from('x')), { status: 404 });

    const first = store.get('results-26').receivedAt;
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(await store.confirm('results-26', hashOf(Buffer.from(CSV))), true);
    assert.ok(store.get('results-26').receivedAt > first);
    assert.equal(await store.confirm('results-26', hashOf(Buffer.from('other'))), false);
    assert.equal(await store.confirm('turnout-kalpi', hashOf(Buffer.from(CSV))), false);

    const reloaded = createRelayStore(dir);
    await reloaded.load();
    assert.equal(reloaded.get('results-26').body.toString(), CSV);
    assert.equal(reloaded.get('results-26').sourceLastModified, 'Tue, 27 Oct 2026 20:00:00 GMT');
    assert.equal(reloaded.get('turnout-municipal').body.toString(), TURNOUT);
    assert.equal(reloaded.get('turnout-kalpi'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
