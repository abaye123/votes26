// Builds a per-city baseline from the 2022 (25th Knesset) results: final
// turnout and a voting-pattern group, used to compare today's turnout with it.

// 2022 ballot letters by camp.
const ARAB = ['עם', 'ום', 'ד'];
const HAREDI = ['שס', 'ג'];
const RIGHT = ['מחל', 'ט', 'ב', 'שס', 'ג'];
const LEFT = ['פה', 'כן', 'ל', 'אמת', 'מרצ'];

export const GROUPS = [
  { id: 'right', label: 'ימין מובהק', rule: 'מעל 65% לימין מתוך קולות הגושים' },
  { id: 'leanRight', label: 'נוטה ימין', rule: '50%-65% לימין' },
  { id: 'haredi', label: 'חרדי', rule: 'ש"ס ויהדות התורה מעל 50% מהקולות' },
  { id: 'leanLeft', label: 'נוטה שמאל', rule: '35%-50% לימין' },
  { id: 'left', label: 'שמאל מובהק', rule: 'פחות מ-35% לימין' },
  { id: 'arab', label: 'ערבי', rule: 'רע"ם, חד"ש-תע"ל ובל"ד מעל 50% מהקולות' },
];

const sum = (votes, ids) => ids.reduce((s, id) => s + (votes[id] || 0), 0);

export function classifyCity(votes, valid) {
  if (!valid) return null;
  if (sum(votes, ARAB) / valid >= 0.5) return 'arab';
  if (sum(votes, HAREDI) / valid >= 0.5) return 'haredi';
  const right = sum(votes, RIGHT);
  const left = sum(votes, LEFT);
  if (!right && !left) return null;
  const share = right / (right + left);
  if (share >= 0.65) return 'right';
  if (share >= 0.5) return 'leanRight';
  if (share >= 0.35) return 'leanLeft';
  return 'left';
}

/** @param cities per-city aggregates from aggregateBallots() of the 2022 file */
export function buildBaseline(cities) {
  const byCode = {};
  for (const c of cities) {
    byCode[c.code] = {
      eligible: c.eligible,
      voters: c.voters,
      turnout: c.eligible ? (c.voters / c.eligible) * 100 : null,
      group: classifyCity(c.votes, c.valid),
    };
  }
  return byCode;
}
