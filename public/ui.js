export const fmt = new Intl.NumberFormat('he-IL');
export const fmtPct = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const SEATS = 120;
export const MAJORITY = 61;

export const BLOCS = [
  { id: 'coalition', label: 'גוש הקואליציה' },
  { id: 'change', label: 'גוש השינוי' },
  { id: 'arab', label: 'המפלגות הערביות' },
  { id: 'other', label: 'אחרות' },
];

export const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const pct = (n, total) => (total ? (n / total) * 100 : 0);

/** A number with an explicit sign, isolated as LTR so RTL text does not move the sign. */
export function signed(v, format = fmtPct) {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `<span dir="ltr">${sign}${format.format(Math.abs(v))}</span>`;
}

export function partyName(parties, id) {
  return parties[id]?.name || (id.startsWith('?') ? id.slice(1) : id);
}

export const blocOf = (parties, id) => parties[id]?.bloc || 'other';
export const blocLabel = (id) => BLOCS.find((b) => b.id === id)?.label || id;

export function kpi(label, value, sub = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value" data-k="kpi:${esc(label)}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

/**
 * Replaces a container's content and briefly highlights every element marked
 * with data-k whose text changed since the previous render.
 * Returns the number of changed elements.
 */
export function setHtml(container, html) {
  const before = new Map([...container.querySelectorAll('[data-k]')].map((e) => [e.dataset.k, e.textContent]));
  container.innerHTML = html;
  let changed = 0;
  if (!before.size) return 0;
  for (const el of container.querySelectorAll('[data-k]')) {
    const old = before.get(el.dataset.k);
    if (old !== undefined && old !== el.textContent) {
      el.classList.add('flash');
      changed += 1;
    }
  }
  return changed;
}

// ---------- live update indicator ----------

let lastUpdate = null;
let lastChange = null;

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 5) return 'עכשיו';
  if (s < 60) return `לפני ${s} שניות`;
  const m = Math.round(s / 60);
  return m === 1 ? 'לפני דקה' : `לפני ${m} דקות`;
}

function paintIndicator() {
  const el = document.querySelector('#live-indicator');
  if (!el || !lastUpdate) return;
  const now = Date.now();
  el.querySelector('.live-text').textContent = `נבדק ${ago(now - lastUpdate)}${lastChange ? ` · שינוי אחרון ${ago(now - lastChange)}` : ''}`;
  el.hidden = false;
}
setInterval(paintIndicator, 1000);

/** Records a successful data refresh; `changed` pulses the indicator. */
export function markRefreshed(changed) {
  lastUpdate = Date.now();
  const el = document.querySelector('#live-indicator');
  if (changed && el) {
    lastChange = lastUpdate;
    el.classList.remove('pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('pulse');
  }
  paintIndicator();
}

/** Warning shown when the server served its last good copy because the source failed. */
export function staleNote(data) {
  let note = '';
  if (data?.via === 'relay' && data.relayReceivedAt) {
    const at = new Date(data.relayReceivedAt).toLocaleTimeString('he-IL');
    note += data.relayStale
      ? ` · <span class="error">הממסר לא שלח נתונים חדשים מאז ${at}, והשרת לא מצליח להוריד בעצמו.</span>`
      : ` · התקבל דרך הממסר ב-${at}`;
  }
  if (data?.staleError) {
    const at = data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString('he-IL') : '';
    note += ` · <span class="error" title="${esc(data.staleError)}">המקור לא מגיב כרגע (כנראה עומס באתר ועדת הבחירות). מוצגים הנתונים האחרונים שנטענו${at ? ` ב-${at}` : ''}.</span>`;
  }
  return note;
}

export async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // A proxy in front of the server (e.g. Cloudflare) may answer with an HTML error page.
    throw new Error(`השרת החזיר תשובה שאינה JSON (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function bars(entries, { max = Math.max(...entries.map((e) => e.value), 1), label = (e) => e.value } = {}) {
  return `<div class="bars">${entries.map((e) => `<div class="name" title="${esc(e.tip || '')}">${esc(e.name)}</div>
    <div class="track" title="${esc(e.tip || '')}">
      <div class="bar" style="width:${(e.value / max) * 85}%;background:${e.color}"></div><span data-k="bar:${esc(e.name)}">${label(e)}</span>
    </div>`).join('')}</div>`;
}

/**
 * Sortable table. Columns: { key, label, num?, value(row), html?(row) }.
 * Sorting state lives in `state` ({ key, dir }) and header clicks call onSort.
 */
export function sortableTable(id, columns, rows, state, { rowAttrs = () => '', limit = Infinity, rowKey = null } = {}) {
  const col = columns.find((c) => c.key === state.key) || columns[0];
  const sorted = [...rows].sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'he');
    return state.dir === 'asc' ? cmp : -cmp;
  });
  const shown = sorted.slice(0, limit);
  return `<div class="table-wrap"><table data-table="${id}">
    <thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''} sortable" data-sort="${esc(c.key)}">${esc(c.label)}${c.key === col.key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${shown.map((r) => `<tr ${rowAttrs(r)}>${columns.map((c) => `<td class="${c.num ? 'num' : ''}"${rowKey ? ` data-k="${esc(`${id}:${rowKey(r)}:${c.key}`)}"` : ''}>${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>${sorted.length > shown.length ? `<p class="muted" style="margin-top:6px">מוצגות ${shown.length} מתוך ${sorted.length} שורות. אפשר לצמצם עם החיפוש.</p>` : ''}`;
}

/** Wires header clicks of a sortable table rendered inside `container`. */
export function onSortClick(container, id, state, rerender) {
  container.querySelectorAll(`table[data-table="${id}"] th[data-sort]`).forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      state.dir = state.key === key && state.dir === 'desc' ? 'asc' : 'desc';
      state.key = key;
      rerender();
    });
  });
}
