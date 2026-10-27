import { allocateSeats } from './lib/allocation.js';

const fmt = new Intl.NumberFormat('he-IL');
const fmtPct = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SEATS = 120;
const MAJORITY = 61;
const OFFICIAL_REFRESH_MS = 30_000;

const BLOCS = [
  { id: 'coalition', label: 'גוש הקואליציה' },
  { id: 'change', label: 'גוש השינוי' },
  { id: 'arab', label: 'המפלגות הערביות' },
  { id: 'other', label: 'אחרות' },
];
const PUBLISHERS_HE = {
  'HaHadashot 12': 'חדשות 12 (N12)', 'Kan 11': 'כאן 11', 'Channel 13': 'חדשות 13', 'Maariv': 'מעריב',
  'Channel 14': 'ערוץ 14', 'Israel Hayom': 'ישראל היום', 'i24 News': 'i24NEWS', 'Walla': 'וואלה',
  'Zman Yisrael': 'זמן ישראל', 'Channel 16': 'ערוץ 16', 'The Times of Israel': 'טיימס אוף ישראל',
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pairKey = ([a, b]) => `${a}|${b}`;

let config;
// Allocation settings are kept per view so toggling one does not affect another.
const settings = {};
function settingsFor(view, agreements) {
  settings[view] ??= { threshold: 3.25, enabled: new Set(agreements.map(pairKey)) };
  return settings[view];
}

// ---------- shared allocation view ----------

function partyName(parties, id) {
  return parties[id]?.name || (id.startsWith('?') ? id.slice(1) : id);
}

function renderAllocation(view, { votes, parties, agreements }) {
  const s = settingsFor(view, agreements);
  const active = agreements.filter((p) => s.enabled.has(pairKey(p)));
  const opts = { seats: SEATS, threshold: s.threshold / 100 };
  const withAgr = allocateSeats(votes, { ...opts, agreements: active });
  const without = allocateSeats(votes, opts);
  const ids = Object.keys(votes).filter((id) => votes[id] > 0).sort((a, b) => votes[b] - votes[a]);
  const seated = ids.filter((id) => withAgr.lists[id].seats > 0).sort((a, b) => withAgr.lists[b].seats - withAgr.lists[a].seats);

  const controls = `
    <div class="card">
      <div class="toolbar" style="margin:0 0 8px">
        <label>אחוז החסימה
          <input type="number" step="0.05" min="0" max="20" value="${s.threshold}" data-view="${view}" data-role="threshold" style="width:80px"> %
        </label>
      </div>
      <div class="agreements">
        <strong>הסכמי עודפים:</strong>
        ${agreements.map((p) => `
          <label class="check"><input type="checkbox" data-view="${view}" data-role="agreement" data-pair="${esc(pairKey(p))}" ${s.enabled.has(pairKey(p)) ? 'checked' : ''}>
            ${esc(partyName(parties, p[0]))} + ${esc(partyName(parties, p[1]))}</label>`).join('')}
      </div>
    </div>`;

  const kpis = `
    <div class="kpis">
      ${kpi('קולות כשרים', fmt.format(withAgr.totalValid))}
      ${kpi('רף החסימה', fmt.format(Math.ceil(withAgr.thresholdVotes)), `${s.threshold}% מהכשרים`)}
      ${kpi('קולות לרשימות שעברו', fmt.format(withAgr.passingVotes), `${fmtPct.format(pct(withAgr.passingVotes, withAgr.totalValid))}% מהכשרים`)}
      ${kpi('המודד (קולות למנדט)', fmt.format(Math.round(withAgr.quota)))}
      ${kpi('רשימות שעברו', `${ids.filter((id) => withAgr.lists[id].passed).length}`, `מתוך ${ids.length} שקיבלו קולות`)}
    </div>`;

  return `${kpis}${controls}
    <div class="grid-2">
      <div class="card"><h2>מנדטים לפי רשימה</h2>${seatBars(seated, withAgr, without, parties)}</div>
      <div class="card"><h2>גושים</h2>${blocSummary(seated.map((id) => ({ id, seats: withAgr.lists[id].seats })), parties)}</div>
    </div>
    <div class="card"><h2>קולות ומנדטים</h2>${allocationTable(ids, withAgr, without, parties)}</div>`;
}

function kpi(label, value, sub = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

const pct = (n, total) => (total ? (n / total) * 100 : 0);
const blocOf = (parties, id) => parties[id]?.bloc || 'other';

function seatBars(ids, withAgr, without, parties) {
  if (!ids.length) return '<p class="muted">אין עדיין רשימות עם מנדטים.</p>';
  const max = Math.max(...ids.map((id) => withAgr.lists[id].seats));
  return `<div class="bars">${ids.map((id) => {
    const l = withAgr.lists[id];
    const diff = l.seats - without.lists[id].seats;
    const tip = `${partyName(parties, id)}: ${l.seats} מנדטים (${l.quotaSeats} מלאים + ${l.extraSeats} מעודפים), ${fmt.format(l.votes)} קולות`;
    return `<div class="name" title="${esc(tip)}">${esc(partyName(parties, id))}</div>
      <div class="track" title="${esc(tip)}" style="display:flex;align-items:center;gap:6px">
        <div class="bar" style="width:${(l.seats / max) * 85}%;background:var(--bloc-${blocOf(parties, id)})"></div>
        <span>${l.seats}${diff ? ` <span class="${diff > 0 ? 'pos' : 'neg'}">(${diff > 0 ? '+' : ''}${diff} מהסכם)</span>` : ''}</span>
      </div>`;
  }).join('')}</div>`;
}

function blocSummary(entries, parties) {
  const totals = Object.fromEntries(BLOCS.map((b) => [b.id, 0]));
  for (const e of entries) totals[blocOf(parties, e.id)] += e.seats;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || SEATS;
  const segs = BLOCS.filter((b) => totals[b.id] > 0).map((b) =>
    `<div class="seg" style="flex:${totals[b.id]};background:var(--bloc-${b.id})" title="${b.label}: ${totals[b.id]}">${totals[b.id]}</div>`).join('');
  return `<div class="blocs">
      <div class="stack">${segs}<div class="majority" style="right:calc(${(60 / sum) * 100}% - 1px)" title="רוב: ${MAJORITY}"></div></div>
      <p class="muted" style="font-size:.8rem">הקו מסמן 60 מנדטים; רוב בכנסת הוא ${MAJORITY}.</p>
      <div class="legend" style="margin-top:8px">${BLOCS.map((b) =>
        `<span><span class="swatch" style="background:var(--bloc-${b.id})"></span>${b.label}: <strong>${totals[b.id]}</strong></span>`).join('')}</div>
      <table style="margin-top:12px"><tbody>${BLOCS.map((b) => {
        const members = entries.filter((e) => blocOf(parties, e.id) === b.id);
        return members.length ? `<tr><td>${b.label}</td><td>${members.map((e) => `${esc(partyName(parties, e.id))} ${e.seats}`).join(', ')}</td></tr>` : '';
      }).join('')}</tbody></table>
    </div>`;
}

function allocationTable(ids, withAgr, without, parties) {
  const rows = ids.map((id) => {
    const l = withAgr.lists[id];
    const diff = l.seats - without.lists[id].seats;
    const share = pct(l.votes, withAgr.totalValid);
    const gap = l.passed ? '' : `<span class="tag">חסרים ${fmt.format(Math.ceil(withAgr.thresholdVotes - l.votes))} קולות</span>`;
    return `<tr class="${l.passed ? '' : 'below'}">
      <td><strong>${esc(id.startsWith('?') ? '' : id)}</strong></td>
      <td>${esc(partyName(parties, id))}</td>
      <td><span class="swatch" style="background:var(--bloc-${blocOf(parties, id)})"></span>${BLOCS.find((b) => b.id === blocOf(parties, id)).label}</td>
      <td class="num">${fmt.format(Math.round(l.votes))}</td>
      <td class="num">${fmtPct.format(share)}%</td>
      <td>${l.passed ? 'עברה' : gap}</td>
      <td class="num">${l.passed ? l.quotaSeats : ''}</td>
      <td class="num">${l.passed ? l.extraSeats : ''}</td>
      <td class="num"><strong>${l.passed ? l.seats : ''}</strong></td>
      <td class="num">${l.passed ? without.lists[id].seats : ''}</td>
      <td class="num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${diff ? (diff > 0 ? '+' : '') + diff : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>אותיות</th><th>רשימה</th><th>גוש</th><th class="num">קולות</th><th class="num">אחוז</th><th>אחוז החסימה</th>
      <th class="num">מנדטים מלאים</th><th class="num">מעודפים</th><th class="num">סה"כ מנדטים</th><th class="num">ללא הסכמי עודפים</th><th class="num">השפעת ההסכם</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Controls inside a rendered allocation re-render only their own view.
const rerender = {};
document.addEventListener('change', (e) => {
  const { view, role } = e.target.dataset;
  if (!view || !settings[view]) return;
  if (role === 'threshold') settings[view].threshold = Number(e.target.value) || 0;
  if (role === 'agreement') {
    const set = settings[view].enabled;
    e.target.checked ? set.add(e.target.dataset.pair) : set.delete(e.target.dataset.pair);
  }
  rerender[view]?.();
});

// ---------- official results ----------

let officialData = null;
let officialTimer = null;

async function loadOfficial() {
  const knesset = $('#knesset').value;
  const election = config[knesset];
  $('#official-status').textContent = 'טוען...';
  try {
    const res = await fetch(`/api/official?knesset=${encodeURIComponent(knesset)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    officialData = { knesset, ...data };
    const when = new Date(data.fetchedAt).toLocaleTimeString('he-IL');
    $('#official-status').innerHTML = `עודכן ב-${when}${data.lastModified ? ` · קובץ המקור עודכן ב-${new Date(data.lastModified).toLocaleTimeString('he-IL')}` : ''} · <a href="${esc(election.resultsSite)}" target="_blank" rel="noopener">אתר ועדת הבחירות</a>`;
  } catch (err) {
    officialData = null;
    $('#official-status').innerHTML = `<span class="error">שגיאה בטעינה: ${esc(err.message)}</span>`;
  }
  renderOfficial();
}

function renderOfficial() {
  const body = $('#official-body');
  if (!officialData) { body.innerHTML = ''; return; }
  const election = config[officialData.knesset];
  if (officialData.status === 'waiting') {
    body.innerHTML = `<div class="card waiting">
      <div class="big">ממתינים לספירת הקולות</div>
      <p class="muted">קובץ התוצאות של ועדת הבחירות עדיין לא פורסם. הדף ימשוך אותו אוטומטית ברגע שיעלה.</p>
      <p class="muted" style="margin-top:8px">בינתיים אפשר לבחור "הכנסת ה-25" כדי לראות איך הדשבורד נראה עם נתונים אמיתיים, או לעבור ללשונית הסקרים.</p>
    </div>`;
    return;
  }
  const t = officialData.totals;
  body.innerHTML = `<div class="kpis">
      ${kpi('קלפיות שנספרו', fmt.format(t.ballots), `ב-${fmt.format(t.cities)} יישובים`)}
      ${kpi('בעלי זכות בחירה (בקלפיות שנספרו)', fmt.format(t.eligible))}
      ${kpi('מצביעים', fmt.format(t.voters), `שיעור הצבעה ${fmtPct.format(pct(t.voters, t.eligible))}%`)}
      ${kpi('קולות פסולים', fmt.format(t.invalid), `${fmtPct.format(pct(t.invalid, t.voters))}% מהמצביעים`)}
    </div>
    ${renderAllocation(`official-${officialData.knesset}`, { votes: officialData.votes, parties: election.parties, agreements: election.agreements })}`;
}

function scheduleOfficial() {
  clearInterval(officialTimer);
  if ($('#auto-refresh').checked) officialTimer = setInterval(loadOfficial, OFFICIAL_REFRESH_MS);
}

// ---------- polls ----------

let pollsData = null;

async function loadPolls() {
  $('#polls-status').textContent = 'טוען סקרים...';
  try {
    const res = await fetch('/api/polls');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    pollsData = data;
    const publishers = [...new Set(data.polls.map((p) => p.publisher).filter((p) => p && p !== '–'))];
    $('#publisher').innerHTML = `<option value="">כל הגופים</option>${publishers.map((p) =>
      `<option value="${esc(p)}">${esc(PUBLISHERS_HE[p] || p)}</option>`).join('')}`;
    $('#polls-status').innerHTML = `${data.polls.length} סקרים · מקור: <a href="${esc(data.source)}" target="_blank" rel="noopener">ויקיפדיה</a>`;
  } catch (err) {
    $('#polls-status').innerHTML = `<span class="error">שגיאה בטעינת הסקרים: ${esc(err.message)}</span>`;
  }
  renderPolls();
}

function renderPolls() {
  if (!pollsData) return;
  const parties = config['26'].parties;
  const publisher = $('#publisher').value;
  const limit = Number($('#poll-limit').value);
  const polls = pollsData.polls.filter((p) => !publisher || p.publisher === publisher);
  if (!polls.length) { $('#polls-body').innerHTML = '<p class="muted">אין סקרים.</p>'; return; }

  // Average of each publisher's latest poll within two weeks of the newest one.
  const newest = new Date(polls[0].date);
  const latestByPublisher = new Map();
  for (const p of polls) {
    if ((newest - new Date(p.date)) / 86_400_000 > 14) break;
    const key = p.publisher || p.firm;
    if (!latestByPublisher.has(key)) latestByPublisher.set(key, p);
  }
  const recent = [...latestByPublisher.values()];
  const avg = {};
  for (const p of recent) for (const [id, n] of Object.entries(p.seats)) avg[id] = (avg[id] || 0) + n / recent.length;
  const avgEntries = Object.entries(avg).filter(([, n]) => n >= 0.5).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, seats: Math.round(n * 10) / 10 }));
  const max = Math.max(...avgEntries.map((e) => e.seats));

  const columns = Object.keys(parties).filter((id) => parties[id].wiki);
  const rows = polls.slice(0, limit).map((p, i) => {
    const total = Object.values(p.seats).reduce((a, b) => a + b, 0);
    const otherSeats = Object.entries(p.seats).filter(([id]) => !columns.includes(id)).reduce((a, [, n]) => a + n, 0);
    const coalition = Object.entries(p.seats).filter(([id]) => blocOf(parties, id) === 'coalition').reduce((a, [, n]) => a + n, 0);
    return `<tr>
      <td>${esc(p.dateLabel)}</td><td>${esc(PUBLISHERS_HE[p.publisher] || p.publisher)}</td><td>${esc(p.firm)}</td>
      ${columns.map((id) => {
        const below = p.belowThreshold[id];
        const v = p.seats[id];
        return `<td class="num" title="${below !== undefined ? `מתחת לאחוז החסימה: ${below}%` : ''}">${v === undefined ? '' : below !== undefined ? `<span class="muted">${below}%</span>` : v}</td>`;
      }).join('')}
      <td class="num">${otherSeats || ''}</td>
      <td class="num ${total !== SEATS ? 'neg' : ''}">${total}</td>
      <td class="num"><strong>${coalition}</strong></td>
      <td><button data-poll="${i}" title="העבר לסימולציה ידנית כדי לבחון אחוז חסימה והסכמי עודפים">לסימולציה</button></td>
    </tr>`;
  }).join('');

  $('#polls-body').innerHTML = `
    <div class="grid-2">
      <div class="card"><h2>ממוצע הסקרים האחרונים</h2>
        <p class="muted" style="margin-bottom:12px">הסקר האחרון של כל גוף (${recent.length} סקרים: ${recent.map((p) => esc(PUBLISHERS_HE[p.publisher] || p.publisher)).join(', ')})</p>
        <div class="bars">${avgEntries.map((e) => `<div class="name">${esc(partyName(parties, e.id))}</div>
          <div class="track" style="display:flex;align-items:center;gap:6px" title="${esc(partyName(parties, e.id))}: ${e.seats}">
            <div class="bar" style="width:${(e.seats / max) * 85}%;background:var(--bloc-${blocOf(parties, e.id)})"></div><span>${e.seats}</span></div>`).join('')}</div>
      </div>
      <div class="card"><h2>גושים בממוצע</h2>${blocSummary(avgEntries.map((e) => ({ id: e.id, seats: Math.round(e.seats) })), parties)}</div>
    </div>
    <div class="card"><h2>כל הסקרים</h2>
      <p class="muted" style="margin-bottom:8px">מנדטים כפי שפורסמו. אחוז באפור = רשימה מתחת לאחוז החסימה. סה"כ באדום = הסקר כפי שרוכז בוויקיפדיה לא מסתכם ל-120 (בדרך כלל בגלל מפלגות שהתאחדו מאז).</p>
      <div class="table-wrap"><table>
        <thead><tr><th>תאריך</th><th>גוף מפרסם</th><th>מכון</th>${columns.map((id) => `<th class="num">${esc(parties[id].name)}</th>`).join('')}
          <th class="num">אחרות</th><th class="num">סה"כ</th><th class="num">קואליציה</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
  $('#polls-body').querySelectorAll('[data-poll]').forEach((btn) =>
    btn.addEventListener('click', () => pollToManual(polls[Number(btn.dataset.poll)])));
}

// Polls publish seats, so vote shares are estimated: lists above the threshold
// share what is left after the published below-threshold percentages.
function pollToManual(poll) {
  const belowTotal = Object.values(poll.belowThreshold).reduce((a, b) => a + b, 0);
  const seatTotal = Object.values(poll.seats).reduce((a, b) => a + b, 0) || SEATS;
  manualValues = {};
  for (const [id, n] of Object.entries(poll.seats)) {
    if (poll.belowThreshold[id] !== undefined) manualValues[id] = poll.belowThreshold[id];
    else if (n > 0) manualValues[id] = Math.round(((n / seatTotal) * (100 - belowTotal)) * 100) / 100;
  }
  $('#manual-unit').value = 'pct';
  showTab('manual');
  renderManualInputs();
  renderManual();
  $('#manual-sum').textContent += ` · נטען מסקר ${PUBLISHERS_HE[poll.publisher] || poll.publisher} ${poll.dateLabel} (הערכת אחוזים לפי המנדטים)`;
}

// ---------- manual simulation ----------

let manualValues = {};

function renderManualInputs() {
  const parties = config['26'].parties;
  const ids = [...new Set([...Object.keys(parties).filter((id) => parties[id].bloc !== 'other' || parties[id].wiki), ...Object.keys(manualValues)])];
  $('#manual-inputs').innerHTML = ids.map((id) => `<label><span>${esc(partyName(parties, id))} <span class="muted">${id.startsWith('?') ? '' : esc(id)}</span></span>
    <input type="number" min="0" step="any" data-manual="${esc(id)}" value="${manualValues[id] ?? ''}"></label>`).join('');
}

function renderManual() {
  const election = config['26'];
  const unit = $('#manual-unit').value;
  const votes = {};
  for (const [id, v] of Object.entries(manualValues)) if (v > 0) votes[id] = v;
  const sum = Object.values(votes).reduce((a, b) => a + b, 0);
  // Unassigned percentage counts as valid votes for lists that did not pass.
  if (unit === 'pct' && sum < 100) votes['?שאר הרשימות'] = 100 - sum;
  $('#manual-sum').textContent = unit === 'pct' ? `סה"כ הוזן: ${fmtPct.format(sum)}%` : `סה"כ הוזן: ${fmt.format(sum)} קולות`;
  $('#manual-body').innerHTML = sum ? renderAllocation('manual', { votes, parties: election.parties, agreements: election.agreements }) : '';
}

// ---------- wiring ----------

function showTab(name) {
  document.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  if (name === 'polls' && !pollsData) loadPolls();
}

async function init() {
  config = await (await fetch('/api/config')).json();
  $('#knesset').innerHTML = Object.keys(config).sort().reverse().map((k) => `<option value="${k}">${esc(config[k].label)}</option>`).join('');

  rerender.manual = renderManual;
  for (const k of Object.keys(config)) rerender[`official-${k}`] = renderOfficial;

  document.querySelectorAll('[role="tab"]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#knesset').addEventListener('change', loadOfficial);
  $('#refresh').addEventListener('click', loadOfficial);
  $('#auto-refresh').addEventListener('change', scheduleOfficial);
  $('#publisher').addEventListener('change', renderPolls);
  $('#poll-limit').addEventListener('change', renderPolls);
  $('#manual-unit').addEventListener('change', renderManual);
  $('#manual-clear').addEventListener('click', () => { manualValues = {}; renderManualInputs(); renderManual(); });
  $('#manual-inputs').addEventListener('input', (e) => {
    const id = e.target.dataset.manual;
    if (id === undefined) return;
    manualValues[id] = Number(e.target.value) || 0;
    renderManual();
  });

  renderManualInputs();
  await loadOfficial();
  scheduleOfficial();
}

init();
