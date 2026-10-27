// Rebuilds data/baseline-2022.json: per-city final turnout and voting group
// from the 25th Knesset per-ballot results. The 2022 data does not change, so
// the dashboard reads this file instead of downloading it at runtime.
//
// Usage: node scripts/build-baseline.js [path/to/expb.csv]
// Without a path the file is downloaded from the elections committee.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodeCsv, parseCsv, aggregateBallots } from '../lib/results.js';
import { buildBaseline } from '../lib/baseline.js';

const SOURCE = 'https://media25.bechirot.gov.il/files/expb.csv';
const OUT = fileURLToPath(new URL('../data/baseline-2022.json', import.meta.url));

const input = process.argv[2]
  ? await readFile(process.argv[2])
  : Buffer.from(await (await fetch(SOURCE)).arrayBuffer());

const { cities } = aggregateBallots(parseCsv(decodeCsv(input)));
const compact = Object.fromEntries(Object.entries(buildBaseline(cities)).map(([code, b]) => [
  code,
  { turnout: b.turnout == null ? null : Math.round(b.turnout * 100) / 100, group: b.group },
]));
await writeFile(OUT, `${JSON.stringify({ source: SOURCE, knesset: 25, cities: compact })}\n`);
console.log(`Wrote ${Object.keys(compact).length} cities to ${OUT}`);
