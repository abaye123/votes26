// Alerts the viewer, on screen and with a sound, whenever the official 2026
// results file changes. Runs on its own timer so it works from any tab, and
// adds a system notification when the page is in the background.

import { $, esc, fmt, getJson } from './ui.js';

const KNESSET = '26';
const CHECK_EVERY_MS = 30_000;
const TOAST_MS = 20_000;
const STORAGE_KEY = 'votes26:alerts';

let enabled = false;
let timer = null;
let last = null;
let audio = null;
let onUpdate = () => {};

function remember(value) {
  try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
}

function remembered() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

// Browsers only allow sound after a user gesture, so the audio context is
// created (or resumed) from a click.
function unlockAudio() {
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no Web Audio */ }
}

function chime() {
  if (!audio || audio.state !== 'running') return;
  const start = audio.currentTime;
  [880, 1175, 1568].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = start + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

function toast(title, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<button class="toast-close" aria-label="סגירה">×</button>
    <strong>${esc(title)}</strong><div>${esc(text)}</div>`;
  el.querySelector('.toast-close').addEventListener('click', (ev) => { ev.stopPropagation(); el.remove(); });
  el.addEventListener('click', () => { el.remove(); onUpdate({ open: true }); });
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), TOAST_MS);
}

let worker = null;

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  worker = navigator.serviceWorker.register('/sw.js').catch(() => null);
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'open-results') onUpdate({ open: true });
  });
}

async function systemNotification(title, text) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const options = { body: text, tag: 'votes26-results', renotify: true, lang: 'he', dir: 'rtl', vibrate: [200, 100, 200] };
  try {
    const registration = await worker;
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); onUpdate({ open: true }); n.close(); };
  } catch { /* notifications blocked or unsupported */ }
}

function describe(now, prev) {
  if (prev.status !== 'ok') return 'קובץ התוצאות פורסם - התחילה ספירת הקולות';
  const added = now.totals.ballots - prev.totals.ballots;
  const counted = `${fmt.format(now.totals.ballots)} קלפיות נספרו`;
  return added > 0 ? `${counted} (${fmt.format(added)} חדשות)` : `${counted} · הנתונים עודכנו`;
}

const signature = (d) => `${d.status}|${d.totals?.ballots}|${d.totals?.voters}|${d.totals?.valid}`;

async function check() {
  try {
    const data = await getJson(`/api/official?knesset=${KNESSET}`);
    if (last && signature(data) !== signature(last)) {
      const title = 'עדכון בתוצאות האמת';
      const text = describe(data, last);
      toast(title, text);
      chime();
      systemNotification(title, text);
      onUpdate({ open: false });
    }
    last = data;
  } catch {
    // A failed check is retried on the next tick; the dashboard shows errors itself.
  }
}

function setEnabled(value) {
  enabled = value;
  remember(value);
  $('#alerts-toggle').setAttribute('aria-pressed', String(value));
  $('#alerts-toggle .alerts-label').textContent = value ? 'התראות פעילות' : 'התראה על עדכון תוצאות';
  clearInterval(timer);
  last = null;
  if (!value) return;
  check();
  timer = setInterval(check, CHECK_EVERY_MS);
}

/** `update({ open })` is called after a change; `open` means the viewer asked to see the results. */
export function initAlerts(update) {
  onUpdate = update;
  registerWorker();
  $('#alerts-toggle').addEventListener('click', () => {
    const value = !enabled;
    if (value) {
      unlockAudio();
      chime();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }
    setEnabled(value);
  });
  // After a reload the sound stays blocked until the first click on the page.
  document.addEventListener('click', unlockAudio, { once: true });
  setEnabled(remembered());
}
