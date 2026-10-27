// Knesset seat allocation per the Knesset Elections Law, section 81:
// electoral threshold, general quota, then the Bader-Ofer (D'Hondt) method for
// the remaining seats, where two lists with a surplus agreement count as one.

/**
 * @param {Record<string, number>} votes valid votes per list id (ballot letters)
 * @param {object} [options]
 * @param {number} [options.seats=120]
 * @param {number} [options.threshold=0.0325] fraction of all valid votes
 * @param {Array<[string, string]>} [options.agreements=[]] surplus agreement pairs
 */
export function allocateSeats(votes, { seats = 120, threshold = 0.0325, agreements = [] } = {}) {
  const ids = Object.keys(votes);
  const totalValid = ids.reduce((sum, id) => sum + (votes[id] || 0), 0);
  const thresholdVotes = totalValid * threshold;
  const passing = ids.filter((id) => votes[id] > 0 && votes[id] >= thresholdVotes);
  const passingVotes = passing.reduce((sum, id) => sum + votes[id], 0);
  const quota = passing.length ? passingVotes / seats : 0;

  const result = {};
  for (const id of ids) {
    result[id] = { votes: votes[id] || 0, passed: passing.includes(id), quotaSeats: 0, extraSeats: 0, seats: 0 };
  }
  if (!passing.length) {
    return { totalValid, thresholdVotes, passingVotes, quota, lists: result, units: [] };
  }

  for (const id of passing) result[id].quotaSeats = Math.floor(votes[id] / quota);

  // Agreements only matter when both sides passed the threshold.
  const paired = new Set();
  const units = [];
  for (const [a, b] of agreements) {
    if (passing.includes(a) && passing.includes(b) && !paired.has(a) && !paired.has(b)) {
      units.push({ members: [a, b] });
      paired.add(a);
      paired.add(b);
    }
  }
  for (const id of passing) if (!paired.has(id)) units.push({ members: [id] });

  for (const unit of units) {
    unit.votes = unit.members.reduce((sum, id) => sum + votes[id], 0);
    unit.seats = unit.members.reduce((sum, id) => sum + result[id].quotaSeats, 0);
  }

  let remaining = seats - units.reduce((sum, u) => sum + u.seats, 0);
  while (remaining > 0) {
    const best = pickHighestAverage(units, (u) => u.votes, (u) => u.seats);
    best.seats += 1;
    remaining -= 1;
  }

  for (const unit of units) {
    if (unit.members.length === 1) {
      result[unit.members[0]].seats = unit.seats;
    } else {
      splitUnit(unit, votes, result);
    }
    for (const id of unit.members) {
      result[id].extraSeats = result[id].seats - result[id].quotaSeats;
    }
  }

  return { totalValid, thresholdVotes, passingVotes, quota, lists: result, units };
}

// Section 81(b): the unit's seats are divided between its two lists by a quota
// of the unit's votes over its seats, and leftovers by highest average.
function splitUnit(unit, votes, result) {
  const unitQuota = unit.votes / unit.seats;
  const shares = unit.members.map((id) => ({ id, votes: votes[id], seats: Math.floor(votes[id] / unitQuota) }));
  let remaining = unit.seats - shares.reduce((sum, s) => sum + s.seats, 0);
  while (remaining > 0) {
    pickHighestAverage(shares, (s) => s.votes, (s) => s.seats).seats += 1;
    remaining -= 1;
  }
  for (const s of shares) result[s.id].seats = s.seats;
}

function pickHighestAverage(items, getVotes, getSeats) {
  let best = null;
  let bestAvg = -1;
  for (const item of items) {
    const avg = getVotes(item) / (getSeats(item) + 1);
    if (avg > bestAvg || (avg === bestAvg && getVotes(item) > getVotes(best))) {
      best = item;
      bestAvg = avg;
    }
  }
  return best;
}
