// Fetches and aggregates the Central Elections Committee per-ballot CSV
// (expb.csv), published at media{N}.bechirot.gov.il once counting starts.

const META = {
  eligible: 'בזב',
  voters: 'מצביעים',
  invalid: 'פסולים',
  valid: 'כשרים',
};

// Non-list columns that the 2026 file adds between "valid" and the list letters.
const EXTRA_META_LABELS = {
  'חיצוניות': 'external',
  'קלפי אחרת': 'otherBallot',
};

export function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    // Older elections publish the files in Windows-1255.
    return new TextDecoder('windows-1255').decode(buffer);
  }
}

export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cell.trim()); cell = ''; }
      else cell += ch;
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

/** Sums the per-ballot rows into national totals and votes per list letter. */
export function aggregateBallots(rows) {
  const [header, ...data] = rows;
  const validCol = header.indexOf(META.valid);
  if (validCol < 0) throw new Error(`Unexpected CSV header: missing "${META.valid}" column`);

  const partyCols = header
    .map((id, col) => ({ id, col }))
    .filter(({ id, col }) => col > validCol && id && !(id in EXTRA_META_LABELS));
  const totals = { ballots: 0, eligible: 0, voters: 0, invalid: 0, valid: 0 };
  const metaCols = Object.fromEntries(
    [...Object.entries(META), ...Object.entries(EXTRA_META_LABELS).map(([name, k]) => [k, name])]
      .map(([k, name]) => [k, header.indexOf(name)])
      .filter(([, col]) => col >= 0));
  for (const k of Object.keys(metaCols)) totals[k] ??= 0;
  const votes = Object.fromEntries(partyCols.map((p) => [p.id, 0]));
  const cities = new Set();
  const cityCol = header.indexOf('סמל ישוב');

  for (const row of data) {
    if (row.length < header.length) continue;
    totals.ballots += 1;
    if (cityCol >= 0) cities.add(row[cityCol]);
    for (const [k, col] of Object.entries(metaCols)) totals[k] += Number(row[col]) || 0;
    for (const p of partyCols) votes[p.id] += Number(row[p.col]) || 0;
  }
  totals.cities = cities.size;
  return { totals, votes };
}

export async function fetchOfficialResults(csvBase, fetchImpl = fetch) {
  const url = new URL('expb.csv', csvBase).href;
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (res.status === 404 || !/octet-stream|csv|text\/plain/.test(res.headers.get('content-type') || '')) {
    return { status: 'waiting', url, httpStatus: res.status };
  }
  if (!res.ok) throw new Error(`Results CSV request failed: HTTP ${res.status} for ${url}`);
  const text = decodeCsv(Buffer.from(await res.arrayBuffer()));
  const aggregate = aggregateBallots(parseCsv(text));
  return {
    // Before counting starts the file is published with a header row only.
    status: aggregate.totals.ballots ? 'ok' : 'waiting',
    url,
    lastModified: res.headers.get('last-modified'),
    ...aggregate,
  };
}
