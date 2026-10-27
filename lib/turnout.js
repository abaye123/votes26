// Reads polling-station turnout reports published during election day by the
// Central Elections Committee for its turnout map (mapvotes.bechirot.gov.il).
// Each file holds the latest report and the one before it.

const BASE = 'https://mapvotes.bechirot.gov.il/data/votes/';

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Turnout request failed: HTTP ${res.status} for ${url}`);
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
