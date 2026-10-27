import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSamples } from '../lib/samples.js';

test('reports no samples while the source is waiting', () => {
  const r = parseSamples({ status: 'waiting', sample: { publishedAt: null, parties: [] }, samples: {} });
  assert.equal(r.samples.length, 0);
});

test('maps JDN party ids to ballot letters and keeps unknown lists', () => {
  const r = parseSamples({
    status: 'live',
    samples: {
      n12: {
        channelHebrewName: 'חדשות 12',
        publishedAt: '2026-10-27T22:00:00+02:00',
        parties: [
          { id: 'likud', name: 'הליכוד', mandates: 24 },
          { id: 'yashar', name: 'ישר!', mandates: 22, percent: 18.1 },
          { id: 'new_party', name: 'רשימה חדשה', mandates: 4 },
        ],
      },
    },
  });
  assert.equal(r.samples.length, 1);
  const [s] = r.samples;
  assert.equal(s.source, 'חדשות 12');
  assert.deepEqual(s.seats, { 'מחל': 24, 'דרך': 22 });
  assert.deepEqual(s.percents, { 'דרך': 18.1 });
  assert.deepEqual(s.unknown, { 'רשימה חדשה': 4 });
});
