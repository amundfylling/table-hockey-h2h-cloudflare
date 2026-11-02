// Turning the single-game forecast ([win, draw, loss] for player A) into playoff chances.

// A playoff game can't end drawn: a regulation draw goes to golden-goal overtime. In the
// backtest (25,200 overtime games) overtime split almost exactly like decided regulation
// games, so a drawn game is shared out as win : loss.
export function playoffGameChance([win, , loss]) {
  const decided = win + loss;
  return decided > 0 ? win / decided : 0.5;
}

// Chance that A wins a first-to-`winsNeeded` series (4 = best of 7), treating games as
// independent with the same chance p each.
export function seriesWinChance(p, winsNeeded = 4) {
  let total = 0;
  let ways = 1; // C(winsNeeded - 1 + k, k)
  for (let k = 0; k < winsNeeded; k += 1) {
    if (k > 0) ways = (ways * (winsNeeded - 1 + k)) / k;
    total += ways * p ** winsNeeded * (1 - p) ** k;
  }
  return total;
}
