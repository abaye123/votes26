// Reads seat-projection polls from the English Wikipedia article
// "Opinion polling for the 2026 Israeli legislative election", which collects
// the polls published by HaHadashot 12 (N12), Kan 11, Channel 13, Maariv, etc.

const API = 'https://en.wikipedia.org/w/api.php';
export const POLLS_PAGE = 'Opinion_polling_for_the_2026_Israeli_legislative_election';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const FIXED_COLUMNS = {
  fieldwork: 'date', 'polling firm': 'firm', publisher: 'publisher', 'sample size': 'sample',
  others: 'others', lead: 'lead', 'gov.': 'gov',
};

async function wikiApi(params, fetchImpl) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
  // Wikimedia's API policy requires a descriptive User-Agent for scripted clients.
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'votes26-dashboard/1.0 (local election results dashboard; Node.js)' } });
  if (!res.ok) throw new Error(`Wikipedia API failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wikipedia API error: ${json.error.info}`);
  return json.parse;
}

export async function fetchPolls(parties, { sectionTitle = '2026', fetchImpl = fetch } = {}) {
  const { sections } = await wikiApi({ action: 'parse', page: POLLS_PAGE, prop: 'sections' }, fetchImpl);
  const section = sections.find((s) => s.line.trim() === sectionTitle);
  if (!section) throw new Error(`Section "${sectionTitle}" not found in ${POLLS_PAGE}`);
  const { wikitext, revid } = await wikiApi(
    { action: 'parse', page: POLLS_PAGE, prop: 'wikitext|revid', section: section.index }, fetchImpl);
  return { source: `https://en.wikipedia.org/wiki/${POLLS_PAGE}`, revid, polls: parsePollTables(wikitext, parties) };
}

export function parsePollTables(wikitext, parties) {
  const wikiToId = {};
  for (const [id, p] of Object.entries(parties)) if (p.wiki) wikiToId[p.wiki.toLowerCase()] = id;

  const text = stripNotes(wikitext);
  const polls = [];
  for (const table of text.match(/\{\|[\s\S]*?\n\|\}/g) || []) {
    const [headerBlock, ...rowBlocks] = table.split(/\n\|-[^\n]*/);
    const columns = parseHeader(headerBlock, wikiToId);
    if (!columns.length) continue;
    for (const block of rowBlocks) {
      const poll = parseRow(block, columns);
      if (poll) polls.push(poll);
    }
  }
  return polls.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function parseHeader(block, wikiToId) {
  const columns = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('!')) continue;
    for (const raw of splitTopLevel(line.slice(1), '!!')) {
      const { attrs, value } = splitCell(raw);
      const span = Number(attrs.colspan) || 1;
      const target = (value.match(/\[\[([^\]|]+)/) || [])[1];
      const label = cleanText(value).toLowerCase();
      const fixed = Object.entries(FIXED_COLUMNS).find(([k]) => label.startsWith(k));
      const key = fixed ? fixed[1] : (target && wikiToId[target.toLowerCase()]) || `?${cleanText(value)}`;
      for (let i = 0; i < span; i++) columns.push(i === 0 ? key : null);
    }
  }
  return columns;
}

function parseRow(block, columns) {
  const cells = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|}') || line.startsWith('|+')) continue;
    for (const raw of splitTopLevel(line.slice(1), '||')) {
      const { attrs, value } = splitCell(raw);
      const span = Number(attrs.colspan) || 1;
      cells.push(value);
      for (let i = 1; i < span; i++) cells.push(null);
    }
  }
  // Rows that do not fill the header exactly are notes (e.g. the publication ban).
  if (cells.length !== columns.length) return null;

  const poll = { seats: {}, belowThreshold: {}, merged: [] };
  for (let i = 0; i < columns.length; i++) {
    const key = columns[i];
    const value = cells[i];
    if (value === null) {
      if (key && !key.startsWith('?') && !FIXED_KEYS.has(key)) poll.merged.push(key);
      continue;
    }
    if (!key) continue;
    if (key === 'date') Object.assign(poll, parseDate(value));
    else if (key === 'firm' || key === 'publisher') poll[key] = cleanText(value);
    else if (key === 'sample') poll.sample = Number(cleanText(value).replace(/,/g, '')) || null;
    else if (key === 'others' || key === 'lead' || key === 'gov') poll[key] = cleanText(value);
    else {
      const cell = parseSeatCell(value);
      if (cell.seats !== null) poll.seats[key] = cell.seats;
      if (cell.pct !== null) poll.belowThreshold[key] = cell.pct;
    }
  }
  if (!poll.date || !Object.keys(poll.seats).length) return null;
  return poll;
}

const FIXED_KEYS = new Set(Object.values(FIXED_COLUMNS));

function parseSeatCell(value) {
  const text = cleanText(value);
  const pct = text.match(/([\d.]+)\s*%/);
  if (pct) return { seats: 0, pct: Number(pct[1]) };
  const n = text.match(/^\d+$/);
  return { seats: n ? Number(n[0]) : null, pct: null };
}

function parseDate(value) {
  const m = value.match(/\{\{\s*opdrts\s*\|([^}]*)\}\}/i);
  if (m) {
    const [d1, d2, mon, year] = m[1].split('|').map((s) => s.trim());
    const month = /^\d+$/.test(mon) ? Number(mon) : MONTHS[mon.slice(0, 3).toLowerCase()];
    const day = Number(d2 || d1);
    if (!month || !day) return {};
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dateLabel: `${d1 && d2 ? `${d1}-` : ''}${day}/${month}/${year}`,
    };
  }
  const text = cleanText(value);
  const t = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!t) return {};
  const month = MONTHS[t[2].toLowerCase()];
  return { date: `${t[3]}-${String(month).padStart(2, '0')}-${t[1].padStart(2, '0')}`, dateLabel: `${t[1]}/${month}/${t[3]}` };
}

// Removes <ref> tags and footnote templates, which may contain pipes.
function stripNotes(text) {
  let out = text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  for (;;) {
    const m = out.match(/\{\{\s*(efn|refn|efn-lr|sfn)\b/i);
    if (!m) return out;
    let depth = 0;
    let i = m.index;
    for (; i < out.length; i++) {
      if (out.startsWith('{{', i)) { depth++; i++; } else if (out.startsWith('}}', i)) { depth--; i++; if (!depth) break; }
    }
    out = out.slice(0, m.index) + out.slice(i + 1);
  }
}

// Splits on a separator that is not nested inside [[...]] or {{...}}.
function splitTopLevel(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('[[', i) || text.startsWith('{{', i)) { depth++; i++; }
    else if (text.startsWith(']]', i) || text.startsWith('}}', i)) { depth = Math.max(0, depth - 1); i++; }
    else if (!depth && text.startsWith(sep, i)) { parts.push(text.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

function splitCell(raw) {
  const parts = splitTopLevel(raw, '|');
  if (parts.length > 1 && /^\s*(style|colspan|rowspan|class|align|width|bgcolor|data-sort-value)\s*=/i.test(parts[0])) {
    const attrs = {};
    for (const m of parts[0].matchAll(/([\w-]+)\s*=\s*"?([^"\s]*)"?/g)) attrs[m[1].toLowerCase()] = m[2];
    return { attrs, value: parts.slice(1).join('|').trim() };
  }
  return { attrs: {}, value: raw.trim() };
}

function cleanText(value) {
  return value
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{\s*(?:small|nowrap|abbr)\s*\|([^|}]*)[^}]*\}\}/gi, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
