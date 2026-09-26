// Computes per-move clock time spent for js/ui/timeManagementChart.js. Pure
// data transform (moves in, chart entries out) - no app state, so it's
// extracted out of main.js on its own.

/**
 * Time spent on each main-line move that actually had PGN clock data - a
 * move with none (rare, some PGNs only annotate some moves) is skipped
 * entirely rather than rendered as a misleading zero-second bar. Main-line
 * only, like the eval graph/accuracy table - a branch move never has real
 * PGN clock data of its own.
 * @param {object[]} moves - analysis.moves (gameAnalyzer.js's flat move records)
 * @param {number|null} initialSeconds
 * @param {number} incrementSeconds
 * @returns {Array<{label: string, categoryLabel: string|null, color: string, secondsSpent: number}>}
 */
export function computeMoveTimesSpent(moves, initialSeconds, incrementSeconds) {
  const lastClock = { w: initialSeconds, b: initialSeconds };
  const entries = [];
  for (const move of moves) {
    const previousClock = lastClock[move.color];
    if (move.clockSeconds != null) {
      if (previousClock != null) {
        entries.push({
          ply: move.ply,
          isWhite: move.color === 'w',
          // Blank for Black's bar - White's bar right next to it already
          // shows this pair's move number once, printing it again on every
          // single bar just repeats it needlessly. The bar's own border
          // (js/ui/timeManagementChart.js's setData) marks which side it is.
          axisLabel: move.color === 'w' ? `${move.moveNumber}.` : '',
          categoryLabel: move.category?.label ?? null,
          color: move.category?.color ?? '#737373',
          secondsSpent: Math.max(0, previousClock - move.clockSeconds + incrementSeconds),
        });
      }
      lastClock[move.color] = move.clockSeconds;
    }
  }
  return entries;
}
