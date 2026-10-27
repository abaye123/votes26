import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePollTables } from '../lib/polls.js';
import { parseCsv, aggregateBallots, decodeCsv } from '../lib/results.js';

const parties = { 'מחל': { wiki: 'Likud' }, 'דרך': { wiki: 'Yashar (political party)' }, 'ט': { wiki: 'Religious Zionist Party' } };

const table = `{| class="wikitable"
! rowspan="2" | Fieldwork<br />date
! rowspan="2" | Polling firm
! rowspan="2" | Publisher
! rowspan="2" | Sample<br />size
! [[Likud]]
! colspan="2" | [[Religious Zionist Party|RZP]]-<br/>[[Zehut]]
! [[Yashar (political party)|Yashar]]
! rowspan="2" | Others
|-
! style="background:red" |
|-
|23 Oct
| colspan="7" |No polls may be published<ref>{{Cite news |title=a|b}}</ref>
|-
|{{Opdrts|22|23|Oct|2026}}
|style=background:#FFDFCC |Midgam
|[[HaHadashot 12]]<ref>{{Cite web |title=x |url=y}}</ref>
|1018
|21
|colspan=2|{{small|(2.4%)}}
|style="background:{{party color|Yashar (political party)}}" |'''23'''
|0.5%{{efn|[[Noam]] at 0.5%}}
|}`;

test('parses seat cells, merged columns and below-threshold percentages', () => {
  const polls = parsePollTables(table, parties);
  assert.equal(polls.length, 1);
  const [p] = polls;
  assert.equal(p.date, '2026-10-23');
  assert.equal(p.publisher, 'HaHadashot 12');
  assert.equal(p.sample, 1018);
  assert.deepEqual(p.seats, { 'מחל': 21, 'ט': 0, 'דרך': 23 });
  assert.deepEqual(p.belowThreshold, { 'ט': 2.4 });
  assert.equal(p.others, '0.5%');
});

test('aggregates per-ballot CSV rows by list letter', () => {
  const csv = '﻿סמל ועדה,שם ישוב,סמל ישוב,קלפי,בזב,מצביעים,פסולים,כשרים,מחל,פה\n1,א,10,1,100,80,2,78,50,28\n1,א,10,2,90,60,0,60,10,50\n';
  const { totals, votes } = aggregateBallots(parseCsv(decodeCsv(Buffer.from(csv))));
  assert.deepEqual(votes, { 'מחל': 60, 'פה': 78 });
  assert.equal(totals.ballots, 2);
  assert.equal(totals.valid, 138);
  assert.equal(totals.cities, 1);
});

test('skips the non-list columns of the 2026 file layout', () => {
  const csv = 'סמל ועדה,ברזל,שם ישוב,סמל ישוב,קלפי,ריכוז,שופט,בזב,מצביעים,פסולים,כשרים,חיצוניות,קלפי אחרת,אמת,מחל,\n'
    + '1,1,א,10,1,1,0,100,80,2,78,3,0,28,50,\n';
  const { totals, votes } = aggregateBallots(parseCsv(csv));
  assert.deepEqual(votes, { 'אמת': 28, 'מחל': 50 });
  assert.equal(totals.external, 3);
  assert.equal(totals.otherBallot, 0);
});
