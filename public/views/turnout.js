import { $, esc, fmt, fmtPct, kpi, getJson, sortableTable, onSortClick, setHtml, matchBallot, ballotSearch, markRefreshed, signed, staleNote } from '../ui.js';
import { getState, setState } from '../url-state.js';
import { lineChart } from '../line-chart.js';

const CITY_ROWS_LIMIT = 150;

let data = null;
let lastReport = null;
let kalpis = { city: null, features: [] };
const citySort = { key: 'eligible', dir: 'desc' };
const kalpiSort = { key: 'kalpi', dir: 'asc' };

export function initTurnout() {
  const state = getState();
  $('#turnout-q').value = state.tq || '';
  $('#turnout-size').value = state.tsize || '';
  $('#turnout-q').addEventListener('input', () => { setState({ tq: $('#turnout-q').value }); renderCities(); });
  $('#turnout-size').addEventListener('change', () => { setState({ tsize: $('#turnout-size').value }); renderCities(); });
  $('#turnout-group').addEventListener('change', () => { setState({ tgroup: $('#turnout-group').value }); renderCities(); });
}

function fillGroupSelect() {
  const select = $('#turnout-group');
  if (select.options.length > 1) return;
  select.innerHTML = `<option value="">כל הקבוצות</option>${data.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('')}`;
  select.value = getState().tgroup || '';
}

export async function loadTurnout() {
  $('#turnout-status').textContent = 'טוען...';
  try {
    data = await getJson('/api/turnout?knesset=26');
    $('#turnout-status').innerHTML = `דיווח אחרון: ${esc(data.reportTime || '')} · נמשך ב-${new Date(data.fetchedAt).toLocaleTimeString('he-IL')} · <a href="${esc(data.hourlySource || data.source)}" target="_blank" rel="noopener">ועדת הבחירות</a>${staleNote(data)}`;
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

const minutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const SERIES_COLORS = ['var(--bloc-coalition)', 'var(--bloc-change)', 'var(--bloc-arab)'];
const COMPARE_WITH = ['2022', '2021'];

function renderTurnout() {
  if (!data) return;
  const t = data.total || {};
  const series = hourlySeries();
  const history = data.history;
  const past = (label) => history.elections.find((e) => e.label === label);
  const pastAt = (label, time) => {
    const i = history.hours.indexOf(time);
    return i >= 0 ? past(label)?.percent[i] ?? null : null;
  };

  // Compare with 2022 at the latest published hour.
  const lastHourly = [...series].reverse().find((s) => !s.live);
  const same2022 = lastHourly ? pastAt('2022', lastHourly.time) : null;
  const final2022 = past('2022')?.percent.at(-1);

  const chart = lineChart([
    { label: '2026', color: SERIES_COLORS[0], endLabel: true, points: series.map((s) => ({ x: minutes(s.time), y: s.percent, tip: `2026 ${s.time}: ${fmtPct.format(s.percent)}%` })) },
    ...COMPARE_WITH.map((label, i) => ({
      label, color: SERIES_COLORS[i + 1], dashed: i > 0,
      points: history.hours.map((h, j) => ({ x: minutes(h), y: past(label).percent[j], tip: `${label} ${h}: ${fmtPct.format(past(label).percent[j])}%` })),
    })),
  ], { xMin: minutes('10:00'), xMax: minutes('22:00'), xTicks: history.hours.map((h) => ({ x: minutes(h), label: h })), yMax: 100 });

  const hours = [...new Set([...history.hours, ...series.map((s) => s.time)])].sort();
  const tableRows = hours.map((h) => {
    const now = series.find((s) => s.time === h);
    const p22 = pastAt('2022', h);
    const diff = now && p22 != null ? now.percent - p22 : null;
    return `<tr><td>${esc(h)}${now?.live ? ' <span class="tag">דיווח קלפיות</span>' : ''}</td>
      <td class="num" data-k="hp:${esc(h)}">${now ? `${fmtPct.format(now.percent)}%` : ''}</td>
      <td class="num">${p22 != null ? `${fmtPct.format(p22)}%` : ''}</td>
      <td class="num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${diff != null ? signed(diff) : ''}</td>
      <td class="num">${pastAt('2021', h) != null ? `${fmtPct.format(pastAt('2021', h))}%` : ''}</td>
      <td class="num">${pastAt('2020', h) != null ? `${fmtPct.format(pastAt('2020', h))}%` : ''}</td></tr>`;
  }).join('');

  setHtml($('#turnout-body'), `
    <div class="kpis">
      ${kpi('שיעור הצבעה', t.percent != null ? `${fmtPct.format(t.percent)}%` : '-', `נכון לדיווח של ${esc(data.reportTime || '')}`)}
      ${kpi('מצביעים', t.voters != null ? fmt.format(t.voters) : '-', t.prevVoters != null ? `${signed(t.voters - t.prevVoters, fmt)} מאז ${esc(data.previousReportTime || 'הדיווח הקודם')}` : '')}
      ${kpi(`מול 2022 באותה שעה`, same2022 != null ? `${signed(lastHourly.percent - same2022)} נק'` : '-', same2022 != null ? `ב-2022 עד ${esc(lastHourly.time)}: ${fmtPct.format(same2022)}%` : '')}
      ${kpi('אחוז סופי ב-2022', final2022 != null ? `${fmtPct.format(final2022)}%` : '-', `2021: ${fmtPct.format(past('2021').percent.at(-1))}% · 2020: ${fmtPct.format(past('2020').percent.at(-1))}%`)}
      ${kpi('בעלי זכות בחירה', t.eligible != null ? fmt.format(t.eligible) : '-', t.kalpis != null ? `${fmt.format(t.kalpis)} קלפיות דיווחו` : '')}
    </div>
    <div class="grid-2">
      <div class="card"><h2>שיעור הצבעה מצטבר לפי שעה, מול בחירות קודמות</h2>
        ${chart}
        <p class="muted" style="margin-top:8px;font-size:.8rem">אומדן ארצי משוקלל של ועדת הבחירות (כולל מעטפות חיצוניות), ודיווח הקלפיות האחרון. <a href="${esc(history.source)}" target="_blank" rel="noopener">נתוני עבר</a></p>
      </div>
      <div class="card"><h2>טבלה</h2>
        <div class="table-wrap"><table><thead><tr><th>עד השעה</th><th class="num">2026</th><th class="num">2022</th><th class="num">הפרש</th><th class="num">2021</th><th class="num">2020</th></tr></thead>
          <tbody>${tableRows}</tbody></table></div>
      </div>
    </div>
    ${groupsCard(t)}`);
  fillGroupSelect();
  renderCities();
  renderCity();
}

function groupStats(features) {
  let eligible = 0; let voters = 0; let prevVoters = 0; let weighted2022 = 0; let eligible2022 = 0;
  for (const f of features) {
    eligible += f.eligible || 0;
    voters += f.voters || 0;
    prevVoters += f.prevVoters ?? f.voters ?? 0;
    if (f.final2022 != null) { weighted2022 += f.final2022 * (f.eligible || 0); eligible2022 += f.eligible || 0; }
  }
  const percent = eligible ? (voters / eligible) * 100 : 0;
  const final2022 = eligible2022 ? weighted2022 / eligible2022 : null;
  return {
    cities: features.length, eligible, percent,
    delta: eligible ? ((voters - prevVoters) / eligible) * 100 : 0,
    final2022, ofFinal: final2022 ? (percent / final2022) * 100 : null,
  };
}

function groupsCard(total) {
  const stats = data.groups.map((g) => ({ ...g, ...groupStats(data.features.filter((f) => f.group === g.id)) }));
  const byId = Object.fromEntries(stats.map((s) => [s.id, s]));
  const camp = (ids) => groupStats(data.features.filter((f) => ids.includes(f.group)));
  const right = camp(['right', 'leanRight']);
  const left = camp(['left', 'leanLeft']);
  const pace = right.ofFinal != null && left.ofFinal != null ? left.ofFinal - right.ofFinal : null;
  const summary = pace == null ? '' : `עד הדיווח האחרון הושגו ביישובי הימין ${fmt.format(Math.round(right.ofFinal))}% מאחוז ההצבעה הסופי שלהם ב-2022,
    ביישובי השמאל ${fmt.format(Math.round(left.ofFinal))}% וביישובים הערביים ${fmt.format(Math.round(byId.arab.ofFinal ?? 0))}%.
    יישובי ${pace > 0 ? 'השמאל' : 'הימין'} מצביעים כרגע בקצב מהיר יותר ב-${fmtPct.format(Math.abs(pace))} נקודות (ביחס ל-2022).`;
  const rows = stats.map((s) => {
    const vsNational = total.percent != null ? s.percent - total.percent : null;
    return `<tr><td title="${esc(s.rule)}"><span class="swatch" style="background:var(--group-${s.id})"></span>${esc(s.label)}</td>
      <td class="num">${fmt.format(s.cities)}</td><td class="num">${fmt.format(s.eligible)}</td>
      <td class="num" data-k="g:${s.id}:p"><strong>${fmtPct.format(s.percent)}%</strong></td>
      <td class="num">${signed(s.delta)}</td>
      <td class="num">${s.final2022 != null ? `${fmtPct.format(s.final2022)}%` : ''}</td>
      <td class="num" data-k="g:${s.id}:of">${s.ofFinal != null ? `${fmt.format(Math.round(s.ofFinal))}%` : ''}</td>
      <td class="num ${vsNational > 0 ? 'pos' : 'neg'}">${vsNational != null ? signed(vsNational) : ''}</td></tr>`;
  }).join('');
  return `<div class="card"><h2>ימין מול שמאל: קצב ההצבעה לפי סוג יישוב</h2>
    <p class="muted" style="margin-bottom:10px">היישובים מחולקים לקבוצות לפי איך שהצביעו ב-2022 (ימין = הליכוד, הציונות הדתית, הבית היהודי, ש"ס ויהדות התורה; שמאל = יש עתיד, המחנה הממלכתי, ישראל ביתנו, העבודה ומרצ). מעבר עם העכבר על שם קבוצה מציג את ההגדרה.</p>
    ${summary ? `<p style="margin:0 0 12px">${summary}</p>` : ''}
    <div class="table-wrap"><table><thead><tr><th>קבוצה</th><th class="num">יישובים</th><th class="num">בעלי זכות</th><th class="num">הצבעה עכשיו</th>
      <th class="num">מאז הדיווח הקודם</th><th class="num">סופי 2022</th><th class="num">מתוך 2022</th><th class="num">מול הארצי</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

function renderCities() {
  if (!data) return;
  const q = $('#turnout-q').value.trim();
  const minEligible = Number($('#turnout-size').value) || 0;
  const group = $('#turnout-group').value;
  const groupLabel = (id) => data.groups.find((g) => g.id === id)?.label || '';
  const rows = data.features.filter((f) => (!q || (f.name || '').includes(q) || f.id === q)
    && (f.eligible || 0) >= minEligible && (!group || f.group === group));
  const ofFinal = (f) => (f.final2022 ? (f.percent / f.final2022) * 100 : null);
  const columns = [
    { key: 'name', label: 'יישוב', value: (f) => f.name || f.id, html: (f) => `<a href="#" data-tcity="${esc(f.id)}">${esc(f.name || f.id)}</a>` },
    { key: 'group', label: 'קבוצה (2022)', value: (f) => groupLabel(f.group), html: (f) => (f.group ? `<span class="swatch" style="background:var(--group-${f.group})"></span>${esc(groupLabel(f.group))}` : '') },
    { key: 'kalpis', label: 'קלפיות', num: true, value: (f) => f.kalpis ?? 0, html: (f) => fmt.format(f.kalpis ?? 0) },
    { key: 'eligible', label: 'בזב', num: true, value: (f) => f.eligible ?? 0, html: (f) => fmt.format(f.eligible ?? 0) },
    { key: 'voters', label: 'מצביעים', num: true, value: (f) => f.voters ?? 0, html: (f) => fmt.format(f.voters ?? 0) },
    { key: 'percent', label: 'שיעור הצבעה', num: true, value: (f) => f.percent ?? 0, html: (f) => `<strong>${fmtPct.format(f.percent ?? 0)}%</strong>` },
    { key: 'delta', label: 'מאז הדיווח הקודם', num: true, value: (f) => f.delta ?? 0, html: (f) => (f.delta != null ? signed(f.delta) : '') },
    { key: 'final2022', label: 'סופי 2022', num: true, value: (f) => f.final2022 ?? -1, html: (f) => (f.final2022 != null ? `${fmtPct.format(f.final2022)}%` : '') },
    { key: 'ofFinal', label: 'מתוך 2022', num: true, value: (f) => ofFinal(f) ?? -1, html: (f) => {
      const v = ofFinal(f);
      return v == null ? '' : `<span class="${v >= 100 ? 'pos' : ''}">${fmt.format(Math.round(v))}%</span>`;
    } },
    { key: 'updated', label: 'עודכן', value: (f) => f.updated || '', html: (f) => esc(f.updated || '') },
  ];
  const container = $('#turnout-cities');
  setHtml(container, sortableTable('tcities', columns, rows, citySort, { limit: CITY_ROWS_LIMIT, rowKey: (f) => f.id }));
  onSortClick(container, 'tcities', citySort, renderCities);
  container.querySelectorAll('[data-tcity]').forEach((a) => a.addEventListener('click', async (ev) => {
    ev.preventDefault();
    setState({ tcity: a.dataset.tcity, tkq: null });
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
    { key: 'delta', label: 'שינוי מהדיווח הקודם', num: true, value: (f) => f.delta ?? 0, html: (f) => (f.delta != null ? signed(f.delta) : '') },
    { key: 'updated', label: 'עודכן', value: (f) => f.updated || '', html: (f) => esc(f.updated || '') },
  ];
  const query = getState().tkq || '';
  const shown = kalpis.features.filter((f) => matchBallot(f.kalpi, query));
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
    <div class="toolbar">${ballotSearch('tkalpi-q', query)}</div>
    ${kalpis.city === code && kalpis.features.length
      ? (shown.length
        ? sortableTable('tkalpis', columns, shown, kalpiSort, { rowKey: (f) => f.id })
        : '<p class="muted">אין קלפי שמספרה מתחיל כך.</p>')
      : '<p class="muted">טוען קלפיות...</p>'}
  </div>`);
  onSortClick(container, 'tkalpis', kalpiSort, renderCity);
  $('#tkalpi-q').addEventListener('input', () => { setState({ tkq: $('#tkalpi-q').value.trim() }); renderCity(); });
  $('#close-tcity').addEventListener('click', () => { setState({ tcity: null, tkq: null }); renderCity(); });
}
