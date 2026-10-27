// Reads polling-station turnout reports published during election day by the
// Central Elections Committee for its turnout map (mapvotes.bechirot.gov.il).
// Each file holds the latest report and the one before it.

const BASE = 'https://mapvotes.bechirot.gov.il/data/votes/';
const UPSTREAM_TIMEOUT_MS = 20_000;

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Turnout request failed: HTTP ${res.status} for ${url}`);
  if (!/json/.test(res.headers.get('content-type') || '')) {
    throw new Error(`Turnout source answered HTTP ${res.status} with ${res.headers.get('content-type') || 'no content type'} instead of JSON; the elections committee site may be blocking this server (${url})`);
  }
  return res.json();
}

/** Maps each Knesset number to its folder in the turnout map data. */
export async function fetchTurnoutCatalog(fetchImpl = fetch) {
  const catalog = await fetchJson(`${BASE}elections.json`, fetchImpl);
  return Object.fromEntries(Object.entries(catalog.elections).map(([k, e]) => [k, e.path]));
}

function normalizeRecord(r) {
  return {
    eligible: r['בזב'] ?? null,
    voters: r['מצביעים'] ?? null,
    percent: r.percent ?? null,
    kalpis: r.kalpis ?? null,
    updated: r.updated ?? null,
    prevVoters: r.prev_voters ?? null,
    prevPercent: r.prev_percent ?? null,
    delta: r.delta ?? null,
  };
}

/** @param {'municipal'|'kalpi'|'neighborhood'} layer */
export async function fetchTurnoutLayer(path, layer, fetchImpl = fetch) {
  const data = await fetchJson(`${BASE}${path}/${layer}_data.json`, fetchImpl);
  const features = Object.entries(data.features || {}).map(([id, r]) => ({
    id,
    name: r['שם ישוב'] ?? null,
    city: r.code != null ? String(r.code) : id,
    kalpi: r.kalpi ?? null,
    ...normalizeRecord(r),
  }));
  return {
    source: `${BASE}${path}/${layer}_data.json`,
    generated: data.generated,
    reportTime: data.time,
    previousReportTime: data.previous?.time ?? null,
    total: data.total ? normalizeRecord(data.total) : null,
    features,
  };
}
