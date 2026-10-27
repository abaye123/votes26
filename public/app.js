import { $, getJson } from './ui.js';
import { getState, setState } from './url-state.js';
import { initOfficial, loadOfficial } from './views/official.js';
import { initTurnout, loadTurnout } from './views/turnout.js';
import { initSamples, loadSamples } from './views/samples.js';
import { initPolls, loadPolls } from './views/polls.js';
import { initManual, simulateFromSeats } from './views/manual.js';
import { initAlerts } from './alerts.js';

const TABS = ['official', 'turnout', 'samples', 'polls', 'manual'];
// Tabs with live data and how often to refresh them while visible.
const LOADERS = {
  official: { load: loadOfficial, everyMs: 30_000 },
  turnout: { load: loadTurnout, everyMs: 60_000 },
  samples: { load: loadSamples, everyMs: 30_000 },
  polls: { load: loadPolls },
};

let timer = null;

function showTab(name, { updateUrl = true } = {}) {
  if (!TABS.includes(name)) name = 'official';
  document.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  if (updateUrl) setState({ tab: name });

  clearInterval(timer);
  const loader = LOADERS[name];
  if (!loader) return;
  loader.load();
  if (loader.everyMs && $('#auto-refresh').checked) timer = setInterval(loader.load, loader.everyMs);
}

function simulate(...args) {
  showTab('manual');
  simulateFromSeats(...args);
}

async function init() {
  const config = await getJson('/api/config');
  initOfficial(config);
  initTurnout();
  initSamples(config, simulate);
  initPolls(config, simulate);
  initManual(config);

  document.querySelectorAll('[role="tab"]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#auto-refresh').addEventListener('change', () => showTab(getState().tab, { updateUrl: false }));
  showTab(getState().tab, { updateUrl: false });

  // A results update reloads the official tab when it shows the live election.
  initAlerts(({ open }) => {
    if (open && getState().tab !== 'official') showTab('official');
    else if (getState().tab === 'official' && $('#knesset').value === '26') loadOfficial();
  });
}

init();
