import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCity, buildBaseline } from '../lib/baseline.js';

test('classifies cities by their 2022 vote', () => {
  assert.equal(classifyCity({ 'עם': 400, 'ום': 300, 'מחל': 100 }, 1000), 'arab');
  assert.equal(classifyCity({ 'ג': 400, 'שס': 300, 'פה': 100 }, 1000), 'haredi');
  assert.equal(classifyCity({ 'מחל': 700, 'פה': 300 }, 1000), 'right');
  assert.equal(classifyCity({ 'מחל': 550, 'פה': 450 }, 1000), 'leanRight');
  assert.equal(classifyCity({ 'מחל': 400, 'פה': 600 }, 1000), 'leanLeft');
  assert.equal(classifyCity({ 'מחל': 200, 'פה': 800 }, 1000), 'left');
  assert.equal(classifyCity({}, 0), null);
});

test('builds final turnout per city code', () => {
  const baseline = buildBaseline([{ code: '10', eligible: 200, voters: 150, valid: 148, votes: { 'מחל': 100, 'פה': 48 } }]);
  assert.equal(baseline['10'].turnout, 75);
  assert.equal(baseline['10'].group, 'right');
});
