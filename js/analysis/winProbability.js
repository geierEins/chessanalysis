// Centipawn -> Win% conversion, matching Lichess's published formula
// (lichess-org/scalachess, chess.eval.WinPercent.fromCentiPawns/fromMate).

const K = 0.00368208; // https://github.com/lichess-org/lila/pull/11148
const CP_CEILING = 1000; // eval magnitude is capped here before the sigmoid

function ceilCp(cp) {
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, cp));
}

function evalToCp(evaluation) {
  // A forced mate is treated as a (very, but not perfectly) winning position,
  // equivalent to being capped at +-1000cp - not a flat 100/0.
  return evaluation.mate !== undefined && evaluation.mate !== null
    ? (evaluation.mate > 0 ? CP_CEILING : -CP_CEILING)
    : ceilCp(evaluation.cp ?? 0);
}

function sigmoidWinPercent(cp, k) {
  const winningChances = Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-k * cp)) - 1));
  return 50 + 50 * winningChances;
}

/**
 * @param {{cp?: number, mate?: number}} evaluation - always from White's perspective.
 * @returns {number} win percentage for White, in [0, 100].
 */
export function evalToWinPercent(evaluation) {
  return sigmoidWinPercent(evalToCp(evaluation), K);
}

// Chess.com's own move-classification win-probability model is explicitly
// rating-adjusted (per their support article: "based on...rating and the
// engine evaluation"), unlike the fixed formula above - but the exact
// coefficients they use were never published, so this is a reasonable,
// clearly-approximate stand-in: the sigmoid's steepness (K) scales with the
// game's average rating, since a given centipawn edge should translate to a
// more decisive win probability for stronger players (who convert it more
// reliably) and a less decisive one for weaker players (who don't) - purely
// a classification-pathway concept, never used for the (Lichess-exact)
// accuracy score, eval bar or eval graph.
const RATING_MIDPOINT = 1500; // K stays at its base value at this rating
const RATING_SCALE_RANGE = 1000; // ratings this far from the midpoint hit the min/max multiplier
const MIN_K_MULTIPLIER = 0.6; // flatter curve (less decisive win%) for weak players
const MAX_K_MULTIPLIER = 1.4; // steeper curve (more decisive win%) for strong players

function kMultiplierForRating(rating) {
  if (!rating) return 1;
  const t = Math.max(-1, Math.min(1, (rating - RATING_MIDPOINT) / RATING_SCALE_RANGE));
  return t >= 0 ? 1 + t * (MAX_K_MULTIPLIER - 1) : 1 + t * (1 - MIN_K_MULTIPLIER);
}

/**
 * Rating-adjusted counterpart of evalToWinPercent(), for move classification
 * only (js/analysis/classification.js via gameAnalyzer.js).
 * @param {{cp?: number, mate?: number}} evaluation
 * @param {number|null|undefined} avgRating - average of both players' ratings
 * @returns {number} win percentage for White, in [0, 100]
 */
export function evalToWinPercentForRating(evaluation, avgRating) {
  return sigmoidWinPercent(evalToCp(evaluation), K * kMultiplierForRating(avgRating));
}
