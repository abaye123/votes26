import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocateSeats } from '../public/lib/allocation.js';

const k25 = JSON.parse(readFileSync(new URL('./fixtures/k25-national.json', import.meta.url), 'utf8'));
const elections = JSON.parse(readFileSync(new URL('../data/elections.json', import.meta.url), 'utf8'));

test('reproduces the official 25th Knesset seat allocation', () => {
  const { lists } = allocateSeats(k25.votes, { agreements: elections['25'].agreements });
  const seats = Object.fromEntries(Object.entries(lists).filter(([, l]) => l.seats).map(([id, l]) => [id, l.seats]));
  assert.deepEqual(seats, { 'מחל': 32, 'פה': 24, 'ט': 14, 'כן': 12, 'שס': 11, 'ג': 7, 'ל': 6, 'עם': 5, 'ום': 5, 'אמת': 4 });
});

test('lists below the threshold get no seats and do not count toward the quota', () => {
  const r = allocateSeats({ a: 600, b: 370, c: 30 }, { seats: 10 });
  assert.equal(r.lists.c.passed, false);
  assert.equal(r.lists.c.seats, 0);
  assert.equal(r.quota, 97);
  assert.equal(r.lists.a.seats + r.lists.b.seats, 10);
});

test('a surplus agreement can move a seat to the pair', () => {
  const votes = { a: 3300, b: 3300, c: 3400 };
  const without = allocateSeats(votes, { seats: 10 });
  const withPair = allocateSeats(votes, { seats: 10, agreements: [['a', 'b']] });
  assert.deepEqual([without.lists.a.seats, without.lists.b.seats, without.lists.c.seats], [3, 3, 4]);
  assert.deepEqual([withPair.lists.a.seats, withPair.lists.b.seats, withPair.lists.c.seats], [4, 3, 3]);
});

test('an agreement is ignored when one side fails the threshold', () => {
  const votes = { a: 6000, b: 200, c: 3800 };
  const r = allocateSeats(votes, { seats: 10, agreements: [['a', 'b']] });
  assert.equal(r.units.length, 2);
  assert.equal(r.lists.b.seats, 0);
});
