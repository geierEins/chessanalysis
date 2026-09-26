// Move accuracy and whole-game accuracy, following Lichess's published,
// open-source algorithm (reverse-confirmed from their repositories):
// - lichess-org/lila, modules/analyse/src/main/AccuracyPercent.scala
// - lichess-org/scalalib, lila/src/main/scala/Maths.scala

/**
 * ΔW for move-classification purposes only (Brilliant/Good/Blunder/... in
 * classification.js) - unrelated to the accuracy SCORE computed below, kept
 * separate on purpose since Lichess's own move/game classifications and its
 * accuracy score are two different, only loosely related features.
 * @param {number} winPercentBeforeForMover
 * @param {number} winPercentAfterForMover
 * @returns {number} deltaW, clamped to >= 0
 */
export function computeDeltaW(winPercentBeforeForMover, winPercentAfterForMover) {
  return Math.max(0, winPercentBeforeForMover - winPercentAfterForMover);
}

// Curve-fitted constants from AccuracyPercent.scala (scipy curve_fit against
// hand-picked (winPercentLoss -> accuracy) sample points).
const CURVE_A = 103.1668100711649;
const CURVE_B = -0.04354415386753951;
const CURVE_C = -3.166924740191411;
const UNCERTAINTY_BONUS = 1; // added on top of the raw curve fit

/**
 * Per-move accuracy, Lichess's `AccuracyPercent.fromWinPercents`.
 * @param {number} winPercentBeforeForMover
 * @param {number} winPercentAfterForMover
 * @returns {number} accuracy in [0, 100]
 */
export function moveAccuracyFromWinPercents(winPercentBeforeForMover, winPercentAfterForMover) {
  if (winPercentAfterForMover >= winPercentBeforeForMover) return 100;
  const winDiff = winPercentBeforeForMover - winPercentAfterForMover;
  const raw = CURVE_A * Math.exp(CURVE_B * winDiff) + CURVE_C + UNCERTAINTY_BONUS;
  return Math.max(0, Math.min(100, raw));
}

/** Population standard deviation (`scalalib.Maths.standardDeviation`). */
function populationStandardDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** `scalalib.Maths.weightedMean`: sum(v*w) / sum(w). */
function weightedMean(pairs) {
  let sumWV = 0;
  let sumW = 0;
  for (const [v, w] of pairs) {
    sumWV += v * w;
    sumW += w;
  }
  return sumW === 0 ? null : sumWV / sumW;
}

/** `scalalib.Maths.harmonicMean`: n / sum(1 / max(1, v)). */
function harmonicMean(values) {
  if (values.length === 0) return null;
  const sumInv = values.reduce((acc, v) => acc + 1 / Math.max(1, v), 0);
  return values.length / sumInv;
}

/**
 * Whole-game accuracy per color, following `AccuracyPercent.gameAccuracy`:
 * moves are grouped into sliding windows of the game's white-perspective
 * win%, sized 10% of the move count (clamped 2-8 plies, "stuck" on the first
 * window until enough history accumulates). Each window's standard deviation
 * (clamped 0.5-12) becomes that move's "volatility" weight. The final score
 * is the mean of the volatility-weighted mean and the harmonic mean of the
 * per-move accuracies - the harmonic mean punishes a single bad blunder much
 * harder than an arithmetic mean would.
 * @param {number[]} allWinPercentsWhite - white-perspective win% at every
 *   position in the game, start position through the final move (length =
 *   moveCount + 1).
 * @param {Array<'w'|'b'>} moveColors - which color played move i (length = moveCount).
 * @returns {{white: number|null, black: number|null}}
 */
export function computeGameAccuracy(allWinPercentsWhite, moveColors) {
  const n = allWinPercentsWhite.length;
  const moveCount = moveColors.length;
  if (moveCount === 0 || n !== moveCount + 1) return { white: null, black: null };

  const windowSize = Math.max(2, Math.min(8, Math.floor(moveCount / 10)));
  const firstWindow = allWinPercentsWhite.slice(0, windowSize);
  const prependCount = Math.max(0, Math.min(windowSize, n) - 2);

  const windows = [];
  for (let i = 0; i < prependCount; i++) windows.push(firstWindow);
  for (let start = 0; start + windowSize <= n; start++) {
    windows.push(allWinPercentsWhite.slice(start, start + windowSize));
  }
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, populationStandardDeviation(w))));

  const perColor = { w: { pairs: [], accuracies: [] }, b: { pairs: [], accuracies: [] } };
  for (let i = 0; i < moveCount; i++) {
    const before = allWinPercentsWhite[i];
    const after = allWinPercentsWhite[i + 1];
    const color = moveColors[i];
    // The win% sigmoid is antisymmetric, so swapping before/after for Black
    // is equivalent to inverting both to Black's own perspective (100 - x).
    const [moverBefore, moverAfter] = color === 'w' ? [before, after] : [after, before];
    const acc = moveAccuracyFromWinPercents(moverBefore, moverAfter);
    perColor[color].pairs.push([acc, weights[i]]);
    perColor[color].accuracies.push(acc);
  }

  const finalFor = (color) => {
    const { pairs, accuracies } = perColor[color];
    if (accuracies.length === 0) return null;
    const wMean = weightedMean(pairs);
    const hMean = harmonicMean(accuracies);
    return wMean === null || hMean === null ? null : (wMean + hMean) / 2;
  };

  return { white: finalFor('w'), black: finalFor('b') };
}
