// Reads the TV exit polls (election-night samples) that the JDN "Barometer"
// site publishes in a public JSON file. The file is empty until polls close,
// so parsing is defensive about the shape of each sample.

export const SAMPLES_URL = 'https://elections.jdn.co.il/data/live-results.json';
const UPSTREAM_TIMEOUT_MS = 20_000;

// JDN party ids -> ballot letters.
const JDN_IDS = {
  likud: 'מחל', yashar: 'דרך', beyahad: 'רק', hademokratim: 'אמת', reshima_meshutefet: 'ודם',
  shas: 'שס', ozma_yehudit: 'ב', yahadut_hatora: 'ג', ndi: 'ל', zionut_datit: 'ט', raam: 'עם',
  hendel_zeliha_party: 'די', ofer_vinter_party: 'ך', noam: 'ני', kahollavan: 'כן', israel_thila: 'י',
};

const number = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function normalizeSample(sample, key) {
  const seats = {};
  const percents = {};
  const unknown = {};
  for (const p of sample.parties || []) {
    const id = JDN_IDS[p.id] || p.letters || null;
    const n = number(p.mandates ?? p.seats);
    const share = number(p.percent ?? p.pct ?? p.share);
    if (!id) {
      unknown[p.name || p.id] = n;
      continue;
    }
    if (n !== null) seats[id] = n;
    if (share !== null) percents[id] = share;
  }
  return {
    key,
    source: sample.channelHebrewName || sample.sourceName || sample.name || key,
    publishedAt: sample.publishedAt || sample.updatedAt || null,
    seats,
    percents,
    unknown,
  };
}

export function parseSamples(data) {
  const samples = [];
  const many = data.samples || {};
  for (const [key, sample] of Array.isArray(many) ? many.map((s, i) => [String(i), s]) : Object.entries(many)) {
    if (sample?.parties?.length) samples.push(normalizeSample(sample, key));
  }
  if (!samples.length && data.sample?.parties?.length) samples.push(normalizeSample(data.sample, 'sample'));
  return {
    status: data.status,
    statusText: data.statusText,
    updatedAt: data.updatedAt,
    samples,
  };
}

export async function fetchSamples(fetchImpl = fetch) {
  const res = await fetchImpl(SAMPLES_URL, { cache: 'no-store', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Exit poll request failed: HTTP ${res.status}`);
  return { source: SAMPLES_URL, ...parseSamples(await res.json()) };
}
