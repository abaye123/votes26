import { $, esc, SEATS, getJson, partyName, blocOf, bars } from '../ui.js';
import { getState, setState } from '../url-state.js';
import { blocSummary } from './allocation.js';

export const PUBLISHERS_HE = {
  'HaHadashot 12': 'חדשות 12 (N12)', 'Kan 11': 'כאן 11', 'Channel 13': 'חדשות 13', 'Maariv': 'מעריב',
  'Channel 14': 'ערוץ 14', 'Israel Hayom': 'ישראל היום', 'i24 News': 'i24NEWS', 'Walla': 'וואלה',
  'Zman Yisrael': 'זמן ישראל', 'Channel 16': 'ערוץ 16', 'The Times of Israel': 'טיימס אוף ישראל',
};

let config;
let pollsData = null;
let onSimulate;

export function initPolls(cfg, simulate) {
  config = cfg;
  onSimulate = simulate;
  const state = getState();
  if (state.limit) $('#poll-limit').value = state.limit;
  $('#publisher').addEventListener('change', () => { setState({ pub: $('#publisher').value }); renderPolls(); });
  $('#poll-limit').addEventListener('change', () => { setState({ limit: $('#poll-limit').value === '30' ? null : $('#poll-limit').value }); renderPolls(); });
}

export async function loadPolls() {
  if (pollsData) return;
  $('#polls-status').textContent = 'טוען סקרים...';
  try {
    pollsData = await getJson('/api/polls');
    const publishers = [...new Set(pollsData.polls.map((p) => p.publisher).filter((p) => p && p !== '–'))];
    $('#publisher').innerHTML = `<option value="">כל הגופים</option>${publishers.map((p) =>
      `<option value="${esc(p)}">${esc(PUBLISHERS_HE[p] || p)}</option>`).join('')}`;
    const wanted = getState().pub || '';
    $('#publisher').value = publishers.includes(wanted) ? wanted : '';
    $('#polls-status').innerHTML = `${pollsData.polls.length} סקרים · מקור: <a href="${esc(pollsData.source)}" target="_blank" rel="noopener">ויקיפדיה</a>`;
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
  const avgEntries = Object.entries(avg).filter(([, n]) => n >= 0.5).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, seats: Math.round(n * 10) / 10 }));

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
        ${bars(avgEntries.map((e) => ({ name: partyName(parties, e.id), value: e.seats, color: `var(--bloc-${blocOf(parties, e.id)})`, tip: `${partyName(parties, e.id)}: ${e.seats}` })))}
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
  $('#polls-body').querySelectorAll('[data-poll]').forEach((btn) => btn.addEventListener('click', () => {
    const p = polls[Number(btn.dataset.poll)];
    onSimulate(p.seats, p.belowThreshold, `סקר ${PUBLISHERS_HE[p.publisher] || p.publisher} ${p.dateLabel}`);
  }));
}
