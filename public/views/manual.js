import { $, esc, fmt, fmtPct, SEATS, partyName } from '../ui.js';
import { getState, setState } from '../url-state.js';
import { renderAllocation } from './allocation.js';

let config;
let values = {};
let note = '';

// Values are kept in the URL as "letters:value,letters:value".
const encodeValues = (v) => Object.entries(v).filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).join(',');
function decodeValues(s) {
  const out = {};
  for (const part of (s || '').split(',')) {
    const [id, n] = part.split(':');
    if (id && Number(n) > 0) out[id] = Number(n);
  }
  return out;
}

export function initManual(cfg) {
  config = cfg;
  const state = getState();
  values = decodeValues(state.m);
  if (state.unit) $('#manual-unit').value = state.unit;
  $('#manual-unit').addEventListener('change', () => { setState({ unit: $('#manual-unit').value === 'pct' ? null : $('#manual-unit').value }); renderManual(); });
  $('#manual-clear').addEventListener('click', () => { values = {}; note = ''; setState({ m: null }); renderInputs(); renderManual(); });
  $('#manual-inputs').addEventListener('input', (e) => {
    const id = e.target.dataset.manual;
    if (id === undefined) return;
    values[id] = Number(e.target.value) || 0;
    note = '';
    setState({ m: encodeValues(values) });
    renderManual();
  });
  renderInputs();
  renderManual();
}

/**
 * Loads seats (from a poll or exit poll) into the simulation. Seats are turned
 * into estimated vote shares: lists above the threshold share what is left
 * after the published below-threshold percentages.
 */
export function simulateFromSeats(seats, belowThreshold, label, percents = {}) {
  values = {};
  if (Object.keys(percents).length) {
    Object.assign(values, percents);
  } else {
    const belowTotal = Object.values(belowThreshold).reduce((a, b) => a + b, 0);
    const seatTotal = Object.values(seats).reduce((a, b) => a + b, 0) || SEATS;
    for (const [id, n] of Object.entries(seats)) {
      if (belowThreshold[id] !== undefined) values[id] = belowThreshold[id];
      else if (n > 0) values[id] = Math.round(((n / seatTotal) * (100 - belowTotal)) * 100) / 100;
    }
  }
  $('#manual-unit').value = 'pct';
  note = `נטען מ${label}${Object.keys(percents).length ? '' : ' (הערכת אחוזים לפי המנדטים)'}`;
  setState({ m: encodeValues(values), unit: null });
  renderInputs();
  renderManual();
}

function renderInputs() {
  const parties = config['26'].parties;
  const ids = [...new Set([...Object.keys(parties).filter((id) => parties[id].bloc !== 'other' || parties[id].wiki), ...Object.keys(values)])];
  $('#manual-inputs').innerHTML = ids.map((id) => `<label><span>${esc(partyName(parties, id))} <span class="muted">${id.startsWith('?') ? '' : esc(id)}</span></span>
    <input type="number" min="0" step="any" data-manual="${esc(id)}" value="${values[id] ?? ''}"></label>`).join('');
}

export function renderManual() {
  const election = config['26'];
  const unit = $('#manual-unit').value;
  const votes = {};
  for (const [id, v] of Object.entries(values)) if (v > 0) votes[id] = v;
  const sum = Object.values(votes).reduce((a, b) => a + b, 0);
  // Unassigned percentage counts as valid votes for lists that did not pass.
  if (unit === 'pct' && sum < 100) votes['?שאר הרשימות'] = 100 - sum;
  $('#manual-sum').textContent = `${unit === 'pct' ? `סה"כ הוזן: ${fmtPct.format(sum)}%` : `סה"כ הוזן: ${fmt.format(sum)} קולות`}${note ? ` · ${note}` : ''}`;
  $('#manual-body').innerHTML = sum
    ? renderAllocation('manual', { votes, parties: election.parties, agreements: election.agreements, agreementsSource: election.agreementsSource }, renderManual)
    : '';
}
