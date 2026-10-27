// Fetches and aggregates the Central Elections Committee per-ballot CSV
// (expb.csv), published at media{N}.bechirot.gov.il once counting starts.

// The committee servers can hang under election-night load.
const UPSTREAM_TIMEOUT_MS = 20_000;

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

/**
 * Sums the per-ballot rows into national totals and votes per list letter,
 * and keeps per-city and per-ballot breakdowns.
 */
export function aggregateBallots(rows) {
  const [header, ...data] = rows;
  const validCol = header.indexOf(META.valid);
  if (validCol < 0) throw new Error(`Unexpected CSV header: missing "${META.valid}" column`);

  const partyCols = header
    .map((id, col) => ({ id, col }))
    .filter(({ id, col }) => col > validCol && id && !(id in EXTRA_META_LABELS));
  const metaCols = Object.fromEntries(
    [...Object.entries(META), ...Object.entries(EXTRA_META_LABELS).map(([name, k]) => [k, name])]
      .map(([k, name]) => [k, header.indexOf(name)])
      .filter(([, col]) => col >= 0));
  const cityCol = header.indexOf('סמל ישוב');
  const cityNameCol = header.indexOf('שם ישוב');
  const ballotCol = header.indexOf('קלפי');

  const emptyCounts = () => ({
    ballots: 0,
    ...Object.fromEntries(Object.keys(metaCols).map((k) => [k, 0])),
    votes: Object.fromEntries(partyCols.map((p) => [p.id, 0])),
  });
  const national = emptyCounts();
  const cities = new Map();
  const ballots = [];

  for (const row of data) {
    if (row.length < header.length) continue;
    const code = cityCol >= 0 ? row[cityCol] : '';
    if (!cities.has(code)) cities.set(code, { code, name: cityNameCol >= 0 ? row[cityNameCol] : code, ...emptyCounts() });
    const ballot = { city: code, ballot: ballotCol >= 0 ? row[ballotCol] : '', votes: {} };
    for (const [k, col] of Object.entries(metaCols)) ballot[k] = Number(row[col]) || 0;
    for (const p of partyCols) {
      const n = Number(row[p.col]) || 0;
      if (n) ballot.votes[p.id] = n;
    }
    ballots.push(ballot);
    for (const target of [national, cities.get(code)]) {
      target.ballots += 1;
      for (const k of Object.keys(metaCols)) target[k] += ballot[k];
      for (const [id, n] of Object.entries(ballot.votes)) target.votes[id] += n;
    }
  }

  const { votes, ...totals } = national;
  totals.cities = cities.size;
  return { totals, votes, cities: [...cities.values()], ballots };
}

export async function fetchOfficialResults(csvBase, fetchImpl = fetch) {
  const url = new URL('expb.csv', csvBase).href;
  const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (res.status === 404) return { status: 'waiting', url, httpStatus: res.status };
  if (!res.ok) throw new Error(`Results CSV request failed: HTTP ${res.status} for ${url}`);
  const type = res.headers.get('content-type') || '';
  if (!/octet-stream|csv|text\/plain/.test(type)) {
    throw new Error(`Results source answered HTTP ${res.status} with ${type || 'no content type'} instead of the CSV file; the elections committee site may be blocking this server (${url})`);
  }
  return parseOfficialResults(Buffer.from(await res.arrayBuffer()), { url, lastModified: res.headers.get('last-modified') });
}

/** Parses the per-ballot CSV, whether downloaded here or pushed by the relay. */
export function parseOfficialResults(buffer, { url, lastModified = null }) {
  const aggregate = aggregateBallots(parseCsv(decodeCsv(buffer)));
  return {
    // Before counting starts the file is published with a header row only.
    status: aggregate.totals.ballots ? 'ok' : 'waiting',
    url,
    lastModified,
    ...aggregate,
  };
}
