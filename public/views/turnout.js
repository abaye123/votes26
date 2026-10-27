import { $, esc, fmt, fmtPct, kpi, getJson, bars, sortableTable, onSortClick, setHtml, markRefreshed } from '../ui.js';
import { getState, setState } from '../url-state.js';

const CITY_ROWS_LIMIT = 150;

let data = null;
let lastReport = null;
let kalpis = { city: null, features: [] };
const citySort = { key: 'eligible', dir: 'desc' };
const kalpiSort = { key: 'kalpi', dir: 'asc' };

export function initTurnout() {
  $('#turnout-q').value = getState().tq || '';
  $('#turnout-q').addEventListener('input', () => { setState({ tq: $('#turnout-q').value }); renderCities(); });
}

export async function loadTurnout() {
  $('#turnout-status').textContent = 'טוען...';
  try {
    data = await getJson('/api/turnout?knesset=26');
    $('#turnout-status').innerHTML = `דיווח אחרון: ${esc(data.reportTime || '')} · נמשך ב-${new Date(data.fetchedAt).toLocaleTimeString('he-IL')} · <a href="${esc(data.hourlySource || data.source)}" target="_blank" rel="noopener">ועדת הבחירות</a>`;
    const city = getState().tcity;
    if (city) await loadKalpis(city);
    const report = `${data.reportTime}|${data.total?.voters}`;
    markRefreshed(lastReport !== null && report !== lastReport);
    lastReport = report;
  } catch (err) {
    $('#turnout-status').innerHTML = `<span class="error">שגיאה בטעינה: ${esc(err.message)}</span>`;
  }
  renderTurnout();
}

async function loadKalpis(city) {
  kalpis = { city, features: (await getJson(`/api/turnout/kalpis?knesset=26&city=${encodeURIComponent(city)}`)).features };
}

function hourlySeries() {
  const series = [...(data.hourly || [])];
  const t = data.total;
  // Add the live map report when it is newer than the last published hourly estimate.
  if (t?.percent != null && data.reportTime) {
    const time = data.reportTime.slice(0, 5);
    const last = series[series.length - 1];
    if (!last || (time > last.time && t.voters !== last.voters)) series.push({ time, percent: t.percent, voters: t.voters, live: true });
  }
  return series;
}

function renderTurnout() {
  if (!data) return;
  const t = data.total || {};
  const series = hourlySeries();
  setHtml($('#turnout-body'), `
    <div class="kpis">
      ${kpi('שיעור הצבעה', t.percent != null ? `${fmtPct.format(t.percent)}%` : '-', `נכון לדיווח של ${esc(data.reportTime || '')}`)}
      ${kpi('מצביעים', t.voters != null ? fmt.format(t.voters) : '-', t.prevVoters != null ? `+${fmt.format(t.voters - t.prevVoters)} מאז ${esc(data.previousReportTime || 'הדיווח הקודם')}` : '')}
      ${kpi('בעלי זכות בחירה', t.eligible != null ? fmt.format(t.eligible) : '-')}
      ${kpi('קלפיות שדיווחו', t.kalpis != null ? fmt.format(t.kalpis) : '-')}
      ${kpi('שינוי מהדיווח הקודם', t.delta != null ? `+${fmtPct.format(t.delta)} נק'` : '-', t.prevPercent != null ? `היה ${fmtPct.format(t.prevPercent)}%` : '')}
    </div>
    <div class="grid-2">
      <div class="card"><h2>שיעור הצבעה מצטבר לפי שעה</h2>
        ${bars(series.map((s) => ({ name: s.time, value: s.percent, color: 'var(--accent)', tip: `${s.time}: ${fmt.format(s.voters)} מצביעים` })),
          { max: 100, label: (e) => `${fmtPct.format(e.value)}%` })}
        <p class="muted" style="margin-top:8px;font-size:.8rem">אומדן ארצי משוקלל של ועדת הבחירות (כולל מעטפות חיצוניות), ודיווח הקלפיות האחרון.</p>
      </div>
      <div class="card"><h2>טבלה</h2>
        <table><thead><tr><th>עד השעה</th><th class="num">אחוז</th><th class="num">מצביעים</th></tr></thead>
          <tbody>${series.map((s) => `<tr><td>${esc(s.time)}${s.live ? ' <span class="tag">דיווח קלפיות</span>' : ''}</td><td class="num" data-k="hp:${esc(s.time)}">${fmtPct.format(s.percent)}%</td><td class="num" data-k="hv:${esc(s.time)}">${fmt.format(s.voters)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>`);
  renderCities();
  renderCity();
}

function renderCities() {
  if (!data) return;
  const q = $('#turnout-q').value.trim();
  const rows = data.features.filter((f) => !q || (f.name || '').includes(q) || f.id === q);
  const columns = [
    { key: 'name', label: 'יישוב', value: (f) => f.name || f.id, html: (f) => `<a href="#" data-tcity="${esc(f.id)}">${esc(f.name || f.id)}</a>` },
    { key: 'kalpis', label: 'קלפיות', num: true, value: (f) => f.kalpis ?? 0, html: (f) => fmt.format(f.kalpis ?? 0) },
    { key: 'eligible', label: 'בזב', num: true, value: (f) => f.eligible ?? 0, html: (f) => fmt.format(f.eligible ?? 0) },
    { key: 'voters', label: 'מצביעים', num: true, value: (f) => f.voters ?? 0, html: (f) => fmt.format(f.voters ?? 0) },
    { key: 'percent', label: 'שיעור הצבעה', num: true, value: (f) => f.percent ?? 0, html: (f) => `${fmtPct.format(f.percent ?? 0)}%` },
    { key: 'delta', label: 'שינוי מהדיווח הקודם', num: true, value: (f) => f.delta ?? 0, html: (f) => (f.delta != null ? `+${fmtPct.format(f.delta)}` : '') },
    { key: 'updated', label: 'עודכן', value: (f) => f.updated || '', html: (f) => esc(f.updated || '') },
  ];
  const container = $('#turnout-cities');
  setHtml(container, sortableTable('tcities', columns, rows, citySort, { limit: CITY_ROWS_LIMIT, rowKey: (f) => f.id }));
  onSortClick(container, 'tcities', citySort, renderCities);
  container.querySelectorAll('[data-tcity]').forEach((a) => a.addEventListener('click', async (ev) => {
    ev.preventDefault();
    setState({ tcity: a.dataset.tcity });
    kalpis = { city: a.dataset.tcity, features: [] };
    renderCity();
    await loadKalpis(a.dataset.tcity);
    renderCity();
    $('#turnout-city').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderCity() {
  const container = $('#turnout-city');
  const code = getState().tcity;
  const city = data?.features.find((f) => f.id === code);
  if (!code || !city) { setHtml(container, ''); return; }
  const columns = [
    { key: 'kalpi', label: 'קלפי', value: (f) => Number(f.kalpi) || 0, html: (f) => esc(f.kalpi) },
    { key: 'eligible', label: 'בזב', num: true, value: (f) => f.eligible ?? 0, html: (f) => fmt.format(f.eligible ?? 0) },
    { key: 'voters', label: 'מצביעים', num: true, value: (f) => f.voters ?? 0, html: (f) => fmt.format(f.voters ?? 0) },
    { key: 'percent', label: 'שיעור הצבעה', num: true, value: (f) => f.percent ?? 0, html: (f) => `${fmtPct.format(f.percent ?? 0)}%` },
    { key: 'delta', label: 'שינוי מהדיווח הקודם', num: true, value: (f) => f.delta ?? 0, html: (f) => (f.delta != null ? `+${fmtPct.format(f.delta)}` : '') },
    { key: 'updated', label: 'עודכן', value: (f) => f.updated || '', html: (f) => esc(f.updated || '') },
  ];
  setHtml(container, `<div class="card">
    <div class="toolbar" style="justify-content:space-between">
      <h2 style="margin:0">${esc(city.name || code)} <span class="muted">(סמל ${esc(code)})</span></h2>
      <button id="close-tcity">סגירה</button>
    </div>
    <div class="kpis">
      ${kpi('שיעור הצבעה', `${fmtPct.format(city.percent ?? 0)}%`, city.prevPercent != null ? `היה ${fmtPct.format(city.prevPercent)}% בדיווח הקודם` : '')}
      ${kpi('מצביעים', fmt.format(city.voters ?? 0))}
      ${kpi('בזב', fmt.format(city.eligible ?? 0))}
      ${kpi('קלפיות', fmt.format(city.kalpis ?? 0))}
    </div>
    ${kalpis.city === code && kalpis.features.length ? sortableTable('tkalpis', columns, kalpis.features, kalpiSort, { rowKey: (f) => f.id }) : '<p class="muted">טוען קלפיות...</p>'}
  </div>`);
  onSortClick(container, 'tkalpis', kalpiSort, renderCity);
  $('#close-tcity').addEventListener('click', () => { setState({ tcity: null }); renderCity(); });
}
