import { $, esc, getJson, partyName, blocOf, bars, setHtml, markRefreshed, staleNote } from '../ui.js';
import { blocSummary } from './allocation.js';

let config;
let data = null;
let lastSignature = null;
let onSimulate;

export function initSamples(cfg, simulate) {
  config = cfg;
  onSimulate = simulate;
}

export async function loadSamples() {
  $('#samples-status').textContent = 'טוען...';
  try {
    data = await getJson('/api/samples');
    const signature = JSON.stringify(data.samples);
    markRefreshed(lastSignature !== null && signature !== lastSignature);
    lastSignature = signature;
    $('#samples-status').innerHTML = `נמשך ב-${new Date(data.fetchedAt).toLocaleTimeString('he-IL')} · מקור: <a href="https://elections.jdn.co.il/" target="_blank" rel="noopener">הברומטר (JDN)</a>${staleNote(data)}`;
  } catch (err) {
    data = null;
    $('#samples-status').innerHTML = `<span class="error">שגיאה בטעינה: ${esc(err.message)}</span>`;
  }
  renderSamples();
}

function renderSamples() {
  const body = $('#samples-body');
  if (!data) { setHtml(body, ''); return; }
  const parties = config['26'].parties;
  if (!data.samples.length) {
    setHtml(body, `<div class="card waiting">
      <div class="big">המדגמים עדיין לא פורסמו</div>
      <p class="muted">ערוצי הטלוויזיה מפרסמים מדגמים עם סגירת הקלפיות ב-22:00. הדף בודק כל 30 שניות.</p>
      ${data.statusText ? `<p class="muted" style="margin-top:8px">הודעת המקור: ${esc(data.statusText)}</p>` : ''}
    </div>`);
    return;
  }

  const ids = [...new Set(data.samples.flatMap((s) => Object.keys(s.seats)))]
    .sort((a, b) => Math.max(...data.samples.map((s) => s.seats[b] || 0)) - Math.max(...data.samples.map((s) => s.seats[a] || 0)));

  const cards = data.samples.map((s, i) => {
    const entries = Object.entries(s.seats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const unknown = Object.entries(s.unknown).filter(([, n]) => n);
    return `<div class="card">
      <div class="toolbar" style="justify-content:space-between">
        <h2 style="margin:0">${esc(s.source)}</h2>
        <span class="muted">${s.publishedAt ? new Date(s.publishedAt).toLocaleTimeString('he-IL') : ''}</span>
        <button data-sample="${i}">לסימולציה</button>
      </div>
      ${bars(entries.map(([id, n]) => ({ name: partyName(parties, id), value: n, color: `var(--bloc-${blocOf(parties, id)})` })))}
      ${unknown.length ? `<p class="muted" style="margin-top:8px">רשימות שלא זוהו: ${unknown.map(([name, n]) => `${esc(name)} ${n}`).join(', ')}</p>` : ''}
      <div style="margin-top:12px">${blocSummary(entries.map(([id, n]) => ({ id, seats: n })), parties)}</div>
    </div>`;
  }).join('');

  const table = `<div class="card"><h2>השוואת המדגמים</h2><div class="table-wrap"><table>
    <thead><tr><th>רשימה</th>${data.samples.map((s) => `<th class="num">${esc(s.source)}</th>`).join('')}</tr></thead>
    <tbody>${ids.map((id) => `<tr><td><span class="swatch" style="background:var(--bloc-${blocOf(parties, id)})"></span>${esc(partyName(parties, id))}</td>
      ${data.samples.map((s) => `<td class="num" data-k="${esc(`s:${s.key}:${id}`)}">${s.seats[id] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></div>`;

  setHtml(body, `${table}<div class="grid-2">${cards}</div>`);
  body.querySelectorAll('[data-sample]').forEach((btn) => btn.addEventListener('click', () => {
    const s = data.samples[Number(btn.dataset.sample)];
    onSimulate(s.seats, {}, `מדגם ${s.source}`, s.percents);
  }));
}
