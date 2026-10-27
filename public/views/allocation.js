import { allocateSeats } from '../lib/allocation.js';
import { fmt, fmtPct, SEATS, MAJORITY, BLOCS, esc, pct, partyName, blocOf, blocLabel, kpi, signed } from '../ui.js';
// Elements carrying data-k are compared across renders and flashed when they change.

const pairKey = ([a, b]) => `${a}|${b}`;

// Allocation settings are kept per view so toggling one does not affect another.
const settings = {};
const rerenderers = {};

function settingsFor(view, agreements) {
  settings[view] ??= { threshold: 3.25, enabled: new Set(agreements.map(pairKey)) };
  return settings[view];
}

document.addEventListener('change', (e) => {
  const { view, role } = e.target.dataset;
  if (!view || !settings[view]) return;
  if (role === 'threshold') settings[view].threshold = Number(e.target.value) || 0;
  if (role === 'agreement') {
    const set = settings[view].enabled;
    e.target.checked ? set.add(e.target.dataset.pair) : set.delete(e.target.dataset.pair);
  }
  rerenderers[view]?.();
});

/** Returns the seat allocation for a view's current threshold and agreements. */
export function allocateForView(view, votes, agreements) {
  const s = settingsFor(view, agreements);
  const active = agreements.filter((p) => s.enabled.has(pairKey(p)));
  const opts = { seats: SEATS, threshold: s.threshold / 100 };
  return { withAgr: allocateSeats(votes, { ...opts, agreements: active }), without: allocateSeats(votes, opts) };
}

export function renderAllocation(view, { votes, parties, agreements, agreementsSource }, rerender) {
  rerenderers[view] = rerender;
  const s = settingsFor(view, agreements);
  const { withAgr, without } = allocateForView(view, votes, agreements);
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
        <strong>הסכמי עודפים${agreementsSource ? ` (<a href="${esc(agreementsSource)}" target="_blank" rel="noopener">מקור</a>)` : ''}:</strong>
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

function seatBars(ids, withAgr, without, parties) {
  if (!ids.length) return '<p class="muted">אין עדיין רשימות עם מנדטים.</p>';
  const max = Math.max(...ids.map((id) => withAgr.lists[id].seats));
  return `<div class="bars">${ids.map((id) => {
    const l = withAgr.lists[id];
    const diff = l.seats - without.lists[id].seats;
    const tip = `${partyName(parties, id)}: ${l.seats} מנדטים (${l.quotaSeats} מלאים + ${l.extraSeats} מעודפים), ${fmt.format(l.votes)} קולות`;
    return `<div class="name" title="${esc(tip)}">${esc(partyName(parties, id))}</div>
      <div class="track" title="${esc(tip)}">
        <div class="bar" style="width:${(l.seats / max) * 85}%;background:var(--bloc-${blocOf(parties, id)})"></div>
        <span data-k="seats:${esc(id)}">${l.seats}${diff ? ` <span class="${diff > 0 ? 'pos' : 'neg'}">(${signed(diff, fmt)} מהסכם)</span>` : ''}</span>
      </div>`;
  }).join('')}</div>`;
}

export function blocSummary(entries, parties) {
  const totals = Object.fromEntries(BLOCS.map((b) => [b.id, 0]));
  for (const e of entries) totals[blocOf(parties, e.id)] += e.seats;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || SEATS;
  const segs = BLOCS.filter((b) => totals[b.id] > 0).map((b) =>
    `<div class="seg" style="flex:${totals[b.id]};background:var(--bloc-${b.id})" title="${b.label}: ${totals[b.id]}" data-k="bloc:${b.id}">${totals[b.id]}</div>`).join('');
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
    const gap = l.passed ? '' : `<span class="tag">חסרים ${fmt.format(Math.ceil(withAgr.thresholdVotes - l.votes))} קולות</span>`;
    return `<tr class="${l.passed ? '' : 'below'}">
      <td><strong>${esc(id.startsWith('?') ? '' : id)}</strong></td>
      <td>${esc(partyName(parties, id))}</td>
      <td><span class="swatch" style="background:var(--bloc-${blocOf(parties, id)})"></span>${blocLabel(blocOf(parties, id))}</td>
      <td class="num" data-k="votes:${esc(id)}">${fmt.format(Math.round(l.votes))}</td>
      <td class="num" data-k="pct:${esc(id)}">${fmtPct.format(pct(l.votes, withAgr.totalValid))}%</td>
      <td data-k="passed:${esc(id)}">${l.passed ? 'עברה' : gap}</td>
      <td class="num">${l.passed ? l.quotaSeats : ''}</td>
      <td class="num">${l.passed ? l.extraSeats : ''}</td>
      <td class="num" data-k="tseats:${esc(id)}"><strong>${l.passed ? l.seats : ''}</strong></td>
      <td class="num">${l.passed ? without.lists[id].seats : ''}</td>
      <td class="num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${diff ? signed(diff, fmt) : ''}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>אותיות</th><th>רשימה</th><th>גוש</th><th class="num">קולות</th><th class="num">אחוז</th><th>אחוז החסימה</th>
      <th class="num">מנדטים מלאים</th><th class="num">מעודפים</th><th class="num">סה"כ מנדטים</th><th class="num">ללא הסכמי עודפים</th><th class="num">השפעת ההסכם</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
