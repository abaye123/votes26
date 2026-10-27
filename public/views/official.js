import { $, esc, fmt, fmtPct, pct, kpi, getJson, partyName, blocOf, bars, sortableTable, onSortClick, setHtml, markRefreshed, signed } from '../ui.js';
import { getState, setState } from '../url-state.js';
import { renderAllocation } from './allocation.js';

const CITY_ROWS_LIMIT = 150;

let config;
let national = null;
let lastSignature = null;
let cities = [];
let cityBallots = { city: null, ballots: [] };
const citySort = { key: 'voters', dir: 'desc' };
const ballotSort = { key: 'ballot', dir: 'asc' };

export function initOfficial(cfg) {
  config = cfg;
  const state = getState();
  $('#knesset').innerHTML = Object.keys(config).sort().reverse()
    .map((k) => `<option value="${k}">${esc(config[k].label)}</option>`).join('');
  $('#knesset').value = config[state.k] ? state.k : '26';
  $('#city-q').value = state.q || '';

  $('#knesset').addEventListener('change', () => {
    setState({ k: $('#knesset').value, city: null, party: null });
    cities = [];
    cityBallots = { city: null, ballots: [] };
    loadOfficial();
  });
  $('#refresh').addEventListener('click', loadOfficial);
  $('#city-q').addEventListener('input', () => { setState({ q: $('#city-q').value }); renderCities(); });
  $('#city-party').addEventListener('change', () => { setState({ party: $('#city-party').value }); renderCities(); renderCity(); });
}

const election = () => config[$('#knesset').value];

export async function loadOfficial() {
  const knesset = $('#knesset').value;
  $('#official-status').textContent = 'טוען...';
  try {
    national = { knesset, ...(await getJson(`/api/official?knesset=${encodeURIComponent(knesset)}`)) };
    const when = new Date(national.fetchedAt).toLocaleTimeString('he-IL');
    const modified = national.lastModified ? ` · קובץ המקור עודכן ב-${new Date(national.lastModified).toLocaleTimeString('he-IL')}` : '';
    $('#official-status').innerHTML = `עודכן ב-${when}${modified} · <a href="${esc(election().resultsSite)}" target="_blank" rel="noopener">אתר ועדת הבחירות</a>`;
    if (national.status === 'ok') {
      cities = (await getJson(`/api/official/cities?knesset=${encodeURIComponent(knesset)}`)).cities;
      const city = getState().city;
      if (city) cityBallots = { city, ballots: (await getJson(`/api/official/ballots?knesset=${encodeURIComponent(knesset)}&city=${encodeURIComponent(city)}`)).ballots };
    }
    const signature = `${knesset}|${national.status}|${national.lastModified}|${national.totals?.ballots}|${national.totals?.valid}`;
    markRefreshed(lastSignature !== null && signature !== lastSignature);
    lastSignature = signature;
  } catch (err) {
    national = null;
    $('#official-status').innerHTML = `<span class="error">שגיאה בטעינה: ${esc(err.message)}</span>`;
  }
  renderOfficial();
}

function renderOfficial() {
  const body = $('#official-body');
  $('#official-breakdown').hidden = !(national && national.status === 'ok');
  if (!national) { setHtml(body, ''); return; }
  const e = election();
  if (national.status === 'waiting') {
    setHtml(body, `<div class="card waiting">
      <div class="big">ממתינים לספירת הקולות</div>
      <p class="muted">קובץ התוצאות של ועדת הבחירות עדיין לא פורסם. הדף ימשוך אותו אוטומטית ברגע שיעלה.</p>
      <p class="muted" style="margin-top:8px">בינתיים אפשר לבחור "הכנסת ה-25" כדי לראות את הדשבורד עם נתונים אמיתיים, או לעבור ללשונית אחוזי ההצבעה.</p>
    </div>`);
    return;
  }
  const t = national.totals;
  setHtml(body, `<div class="kpis">
      ${kpi('קלפיות שנספרו', fmt.format(t.ballots), `ב-${fmt.format(t.cities)} יישובים`)}
      ${kpi('בעלי זכות בחירה (בקלפיות שנספרו)', fmt.format(t.eligible))}
      ${kpi('מצביעים', fmt.format(t.voters), `שיעור הצבעה ${fmtPct.format(pct(t.voters, t.eligible))}%`)}
      ${kpi('קולות פסולים', fmt.format(t.invalid), `${fmtPct.format(pct(t.invalid, t.voters))}% מהמצביעים`)}
    </div>
    ${renderAllocation(`official-${national.knesset}`, { votes: national.votes, parties: e.parties, agreements: e.agreements, agreementsSource: e.agreementsSource }, renderOfficial)}`);
  fillPartySelect();
  renderCities();
  renderCity();
}

function fillPartySelect() {
  const parties = election().parties;
  const ids = Object.keys(national.votes).filter((id) => national.votes[id] > 0).sort((a, b) => national.votes[b] - national.votes[a]);
  const wanted = getState().party || '';
  $('#city-party').innerHTML = `<option value="">ללא</option>${ids.map((id) => `<option value="${esc(id)}">${esc(partyName(parties, id))}</option>`).join('')}`;
  $('#city-party').value = ids.includes(wanted) ? wanted : '';
}

function topParty(votes) {
  let best = null;
  for (const [id, n] of Object.entries(votes)) if (!best || n > votes[best]) best = id;
  return best;
}

function renderCities() {
  if (!national || national.status !== 'ok') return;
  const parties = election().parties;
  const q = $('#city-q').value.trim();
  const party = $('#city-party').value;
  const rows = cities.filter((c) => !q || c.name.includes(q) || c.code === q);
  const columns = [
    { key: 'name', label: 'יישוב', value: (c) => c.name, html: (c) => `<a href="#" data-city="${esc(c.code)}">${esc(c.name)}</a>` },
    { key: 'ballots', label: 'קלפיות', num: true, value: (c) => c.ballots, html: (c) => fmt.format(c.ballots) },
    { key: 'eligible', label: 'בזב', num: true, value: (c) => c.eligible, html: (c) => fmt.format(c.eligible) },
    { key: 'voters', label: 'מצביעים', num: true, value: (c) => c.voters, html: (c) => fmt.format(c.voters) },
    { key: 'turnout', label: 'הצבעה', num: true, value: (c) => pct(c.voters, c.eligible), html: (c) => `${fmtPct.format(pct(c.voters, c.eligible))}%` },
    { key: 'invalid', label: 'פסולים', num: true, value: (c) => c.invalid, html: (c) => fmt.format(c.invalid) },
    { key: 'top', label: 'רשימה מובילה', value: (c) => partyName(parties, topParty(c.votes) || ''), html: (c) => {
      const id = topParty(c.votes);
      return id ? `<span class="swatch" style="background:var(--bloc-${blocOf(parties, id)})"></span>${esc(partyName(parties, id))} ${fmtPct.format(pct(c.votes[id], c.valid))}%` : '';
    } },
  ];
  if (party) {
    columns.push(
      { key: 'partyVotes', label: `${partyName(parties, party)} - קולות`, num: true, value: (c) => c.votes[party] || 0, html: (c) => fmt.format(c.votes[party] || 0) },
      { key: 'partyPct', label: `${partyName(parties, party)} - אחוז`, num: true, value: (c) => pct(c.votes[party] || 0, c.valid), html: (c) => `${fmtPct.format(pct(c.votes[party] || 0, c.valid))}%` },
    );
  }
  const container = $('#official-cities');
  setHtml(container, sortableTable('cities', columns, rows, citySort, { limit: CITY_ROWS_LIMIT, rowKey: (c) => c.code }));
  onSortClick(container, 'cities', citySort, renderCities);
  container.querySelectorAll('[data-city]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    selectCity(a.dataset.city);
  }));
}

async function selectCity(code) {
  setState({ city: code });
  cityBallots = { city: code, ballots: [] };
  renderCity();
  const knesset = $('#knesset').value;
  cityBallots.ballots = (await getJson(`/api/official/ballots?knesset=${encodeURIComponent(knesset)}&city=${encodeURIComponent(code)}`)).ballots;
  renderCity();
  $('#official-city').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCity() {
  const container = $('#official-city');
  const code = getState().city;
  const city = cities.find((c) => c.code === code);
  if (!code || !city) { setHtml(container, ''); return; }
  const parties = election().parties;
  const party = $('#city-party').value;
  const ids = Object.keys(city.votes).filter((id) => city.votes[id] > 0).sort((a, b) => city.votes[b] - city.votes[a]);
  const nationalValid = national.totals.valid;

  const partyRows = ids.map((id) => {
    const local = pct(city.votes[id], city.valid);
    const nat = pct(national.votes[id], nationalValid);
    const diff = local - nat;
    return `<tr><td><strong>${esc(id)}</strong></td><td>${esc(partyName(parties, id))}</td>
      <td class="num" data-k="cvotes:${esc(id)}">${fmt.format(city.votes[id])}</td><td class="num" data-k="cpct:${esc(id)}">${fmtPct.format(local)}%</td>
      <td class="num">${fmtPct.format(nat)}%</td><td class="num ${diff > 0 ? 'pos' : 'neg'}">${signed(diff)}</td></tr>`;
  }).join('');

  const shownParties = ids.slice(0, 8);
  if (party && !shownParties.includes(party)) shownParties.push(party);
  const ballotColumns = [
    { key: 'ballot', label: 'קלפי', value: (b) => Number(b.ballot) || 0, html: (b) => esc(b.ballot) },
    { key: 'eligible', label: 'בזב', num: true, value: (b) => b.eligible, html: (b) => fmt.format(b.eligible) },
    { key: 'voters', label: 'מצביעים', num: true, value: (b) => b.voters, html: (b) => fmt.format(b.voters) },
    { key: 'turnout', label: 'הצבעה', num: true, value: (b) => pct(b.voters, b.eligible), html: (b) => `${fmtPct.format(pct(b.voters, b.eligible))}%` },
    { key: 'invalid', label: 'פסולים', num: true, value: (b) => b.invalid, html: (b) => fmt.format(b.invalid) },
    { key: 'valid', label: 'כשרים', num: true, value: (b) => b.valid, html: (b) => fmt.format(b.valid) },
    ...shownParties.map((id) => ({
      key: `p:${id}`, label: partyName(parties, id), num: true,
      value: (b) => pct(b.votes[id] || 0, b.valid),
      html: (b) => `${fmt.format(b.votes[id] || 0)} <span class="muted">(${fmtPct.format(pct(b.votes[id] || 0, b.valid))}%)</span>`,
    })),
  ];

  setHtml(container, `<div class="card">
    <div class="toolbar" style="justify-content:space-between">
      <h2 style="margin:0">${esc(city.name)} <span class="muted">(סמל ${esc(city.code)})</span></h2>
      <button id="close-city">סגירה</button>
    </div>
    <div class="kpis">
      ${kpi('קלפיות שנספרו', fmt.format(city.ballots))}
      ${kpi('בזב', fmt.format(city.eligible))}
      ${kpi('מצביעים', fmt.format(city.voters), `שיעור הצבעה ${fmtPct.format(pct(city.voters, city.eligible))}%`)}
      ${kpi('פסולים', fmt.format(city.invalid), `${fmtPct.format(pct(city.invalid, city.voters))}%`)}
      ${kpi('כשרים', fmt.format(city.valid))}
    </div>
    <div class="grid-2">
      <div>${bars(ids.slice(0, 15).map((id) => ({
        name: partyName(parties, id), value: pct(city.votes[id], city.valid), color: `var(--bloc-${blocOf(parties, id)})`,
        tip: `${partyName(parties, id)}: ${fmt.format(city.votes[id])} קולות`,
      })), { label: (e) => `${fmtPct.format(e.value)}%` })}</div>
      <div class="table-wrap"><table><thead><tr><th>אותיות</th><th>רשימה</th><th class="num">קולות</th><th class="num">ביישוב</th><th class="num">ארצי</th><th class="num">הפרש</th></tr></thead>
        <tbody>${partyRows}</tbody></table></div>
    </div>
    <h2 style="margin-top:16px">קלפיות (${fmt.format(cityBallots.ballots.length)})</h2>
    <div id="city-ballots">${cityBallots.city === code && cityBallots.ballots.length
      ? sortableTable('ballots', ballotColumns, cityBallots.ballots, ballotSort, { rowKey: (b) => b.ballot })
      : '<p class="muted">טוען קלפיות...</p>'}</div>
  </div>`);
  onSortClick(container, 'ballots', ballotSort, renderCity);
  $('#close-city').addEventListener('click', () => { setState({ city: null }); renderCity(); });
}
