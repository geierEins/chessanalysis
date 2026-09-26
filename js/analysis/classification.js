// Move classification: assigns one of the 10 CATEGORIES to a played move.
//
// Priority (first match wins). The standard-move thresholds (Excellent 0-2%,
// Good 2-5%, Inaccuracy 5-10%, Mistake 10-20%, Blunder 20-100% expected win%
// loss) match Chess.com's own published table exactly:
// https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
// The special-move conditions below follow that article's descriptions as
// closely as the engine data available here allows; the ordering and the
// dampening of severity in already-winning positions are still this app's
// own, since Chess.com doesn't publish those specifics.
//
// All win%/deltaW inputs here are the RATING-ADJUSTED values (see
// winProbability.js's evalToWinPercentForRating) - not the fixed-formula
// ones used for the accuracy score, eval bar and eval graph elsewhere.

import { CATEGORIES } from './categories.js';

const LOSING_THRESHOLD = 40; // rating-adjusted win% below this = "losing"
const WINNING_THRESHOLD = 60; // rating-adjusted win% above this = "winning" - between is "equal"

function outcomeBucket(winPercent) {
  if (winPercent < LOSING_THRESHOLD) return 'losing';
  if (winPercent > WINNING_THRESHOLD) return 'winning';
  return 'equal';
}

/**
 * @param {object} input
 * @param {boolean} input.isBookMove
 * @param {boolean} input.isForcedMove - mover was in check with exactly one legal reply
 * @param {boolean} input.isBestMove - played move equals engine's top (PV1) choice
 * @param {boolean} input.isOnlyGoodMove - PV1/PV2 win% gap > 15, and played move is PV1
 * @param {boolean} input.isSacrifice - mover's relative material dropped by >= 3 this move
 * @param {number} input.deltaW - rating-adjusted win% drop for the mover (>= 0)
 * @param {number} input.winPercentBeforeForMover - rating-adjusted
 * @param {number} input.winPercentAfterForMover - rating-adjusted
 * @param {number} input.evalBeforeCpForMover - centipawns, from mover's perspective, before the move
 * @param {boolean} input.hadWinningTacticBefore - mover had a large winning continuation (>=90% win or mate) before this move
 * @returns {{ category: typeof CATEGORIES[keyof typeof CATEGORIES] }}
 */
export function classifyMove(input) {
  const {
    isBookMove,
    isForcedMove,
    isBestMove,
    isOnlyGoodMove,
    isSacrifice,
    deltaW,
    winPercentBeforeForMover,
    winPercentAfterForMover,
    evalBeforeCpForMover,
    hadWinningTacticBefore,
  } = input;

  // Dampen severity when the mover is still clearly winning after the move -
  // avoids flagging harmless moves in crushing positions as Mistake/Blunder.
  const stillClearlyWinning = winPercentAfterForMover >= 90;
  const effectiveDeltaW = stillClearlyWinning ? Math.min(deltaW, 9) : deltaW;

  if (isBookMove) {
    return { category: CATEGORIES.BOOK };
  }

  // The only legal reply to a check isn't a "choice" to judge the quality
  // of - matches Chess.com not awarding e.g. Brilliant for a forced sacrifice.
  if (isForcedMove) {
    return { category: CATEGORIES.FORCED };
  }

  if (effectiveDeltaW > 15 && hadWinningTacticBefore && !stillClearlyWinning) {
    return { category: CATEGORIES.MISS };
  }

  // Chess.com: "best or nearly best move" - isBestMove here, rather than a
  // separate "nearly best" allowance, since the deltaW < 3 check just below
  // already covers a move that lost almost nothing without also being
  // engine-best (and requiring the exact best move rules out sacrifices that
  // merely happen to not be much worse than the alternatives).
  // winPercentAfterForMover >= 45 (chessdesk.app's reverse-engineered
  // reading of Chess.com's own rule) is the explicit floor that was missing
  // here before: without it, a sound-but-desperate sacrifice that merely
  // fails to make an already-losing position any worse could still qualify,
  // contradicting Chess.com's own "shouldn't be in a bad position afterward".
  if (isBestMove && isSacrifice && deltaW < 3 && evalBeforeCpForMover < 700 && winPercentAfterForMover >= 45) {
    return { category: CATEGORIES.BRILLIANT };
  }

  // Chess.com: "critical to the outcome of the game...converting a losing
  // position to equal, equal to winning, or finding the only viable option."
  const changedOutcome =
    outcomeBucket(winPercentBeforeForMover) === 'losing'
      ? outcomeBucket(winPercentAfterForMover) !== 'losing'
      : outcomeBucket(winPercentBeforeForMover) === 'equal' && outcomeBucket(winPercentAfterForMover) === 'winning';

  if (isBestMove && (isOnlyGoodMove || changedOutcome) && deltaW <= 2) {
    return { category: CATEGORIES.GREAT };
  }

  if (isBestMove || deltaW < 0.5) {
    return { category: CATEGORIES.BEST };
  }

  if (effectiveDeltaW <= 2) return { category: CATEGORIES.EXCELLENT };
  if (effectiveDeltaW <= 5) return { category: CATEGORIES.GOOD };
  if (effectiveDeltaW <= 10) return { category: CATEGORIES.INACCURACY };
  if (effectiveDeltaW <= 20) return { category: CATEGORIES.MISTAKE };
  return { category: CATEGORIES.BLUNDER };
}
