// Orchestrates a full game review: replays the PGN move by move, evaluates every
// resulting position exactly once with Stockfish (N+1 evaluations for N moves),
// and derives win%, accuracy and a classification for every move.

import { Chess } from '../chessLib.js';
import { evalToWinPercent, evalToWinPercentForRating } from './winProbability.js';
import { computeDeltaW, moveAccuracyFromWinPercents, computeGameAccuracy } from './accuracy.js';
import { classifyMove } from './classification.js';
import { createBookTracker } from './openingBook.js';
import { isSacrifice } from './material.js';
import { parseClockSeconds } from './pgnClock.js';

export const MATE_CP_EQUIVALENT = 10000;

// Exported: js/main.js's background engine evaluation for branch moves
// (see moveTree.js) reuses these exact same helpers, so a branch move is
// classified identically to a main-line one.
export function toWhitePerspective(score, sideToMove) {
  if (!score) return { cp: 0 };
  if (score.mate !== undefined) {
    return { mate: sideToMove === 'w' ? score.mate : -score.mate };
  }
  return { cp: sideToMove === 'w' ? score.cp : -score.cp };
}

/** Win% for whichever side the raw engine score is already expressed for. */
function scoreWinPercent(score) {
  return evalToWinPercent(score ?? { cp: 0 });
}

/** Rating-adjusted counterpart of scoreWinPercent(), classification-only. */
function scoreWinPercentForRating(score, avgRating) {
  return evalToWinPercentForRating(score ?? { cp: 0 }, avgRating);
}

export function bestMoveSanFor(fenBefore, uci) {
  if (!uci || uci === '(none)' || uci.length < 4) return null;
  const probe = new Chess(fenBefore);
  const move = probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
  return move ? move.san : null;
}

export function squaresFromUci(uci) {
  if (!uci || uci === '(none)' || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

/**
 * @param {string} pgn
 * @param {import('../engine/stockfishEngine.js').StockfishEngine} engine
 * @param {{depth?: number, onProgress?: (done: number, total: number) => void, avgRating?: number|null}} [options]
 *   avgRating - average of both players' ratings, used only to adjust the
 *   win% model that drives move CLASSIFICATION (see winProbability.js's
 *   evalToWinPercentForRating) - never the accuracy score, eval bar or eval
 *   graph, which all stay on the fixed Lichess-exact formula.
 */
export async function analyzeGame(pgn, engine, { depth = 14, onProgress, avgRating = null } = {}) {
  const parser = new Chess();
  const ok = parser.load_pgn(pgn, { sloppy: true });
  if (!ok) throw new Error('PGN konnte nicht gelesen werden.');

  const verboseMoves = parser.history({ verbose: true });
  if (verboseMoves.length === 0) throw new Error('Die Partie enthält keine Züge.');

  // One entry per ply, in move order (see pgnClock.js) - shorter than
  // verboseMoves (or empty) if the PGN carries no [%clk] data at all.
  const clockSecondsByPly = parseClockSeconds(pgn);

  const headers = parser.header();
  const replay = headers.FEN ? new Chess(headers.FEN) : new Chess();
  const bookTracker = createBookTracker();

  const positions = [replay.fen()];
  const moveRecords = [];

  let currentEval = await engine.evaluate(replay.fen(), { depth, multiPv: 2 });
  // The best FIRST move - the root node's counterpart of each record's
  // nextBestMoveSquares below (js/main.js's "show best move before" setting).
  const startBestMoveSquares = squaresFromUci(currentEval.bestMoveUci);
  onProgress?.(0, verboseMoves.length);

  for (let i = 0; i < verboseMoves.length; i++) {
    const vMove = verboseMoves[i];
    const sideToMove = replay.turn();
    const fenBefore = replay.fen();
    const chessBefore = new Chess(fenBefore);

    // The only legal reply to a check - not a "choice", so not worth judging
    // for quality (see FORCED in classification.js).
    const isForcedMove = chessBefore.in_check() && chessBefore.moves().length === 1;

    const lines = currentEval.lines;
    const pv1 = lines.find((l) => l.multipv === 1) ?? lines[0];
    const pv2 = lines.find((l) => l.multipv === 2);
    const bestMoveUci = currentEval.bestMoveUci;

    const winPercentBeforeForMover = scoreWinPercent(pv1);
    // Classification-only, rating-adjusted counterpart - see the comment on
    // evalToWinPercentForRating in winProbability.js.
    const winPercentBeforeForMoverRated = scoreWinPercentForRating(pv1, avgRating);
    const playedUci = vMove.from + vMove.to + (vMove.promotion ?? '');
    const isBestMove = playedUci === bestMoveUci;
    // Gap threshold (18 points) matches chessdesk.app's reverse-engineered
    // reading of Chess.com's own "only move that holds" Great-move rule.
    const isOnlyGoodMove = Boolean(
      pv2 && isBestMove && winPercentBeforeForMoverRated - scoreWinPercentForRating(pv2, avgRating) >= 18
    );

    const moveResult = replay.move({ from: vMove.from, to: vMove.to, promotion: vMove.promotion });
    if (!moveResult) throw new Error(`Ungültiger Zug beim Nachspielen: ${vMove.san}`);
    const fenAfter = replay.fen();
    positions.push(fenAfter);

    const sacrifice = isSacrifice(chessBefore, replay, sideToMove);

    // A checkmating/stalemating move leaves the opponent with no legal moves, so
    // there is nothing to feed the engine - synthesize the outcome instead.
    let evalAfterWhite;
    if (replay.game_over()) {
      if (replay.in_checkmate()) {
        evalAfterWhite = { mate: sideToMove === 'w' ? 1 : -1 };
      } else {
        evalAfterWhite = { cp: 0 };
      }
      currentEval = { bestMoveUci: '(none)', lines: [] };
    } else {
      currentEval = await engine.evaluate(fenAfter, { depth, multiPv: 2 });
      const afterPv1 = currentEval.lines.find((l) => l.multipv === 1) ?? currentEval.lines[0];
      evalAfterWhite = toWhitePerspective(afterPv1, sideToMove === 'w' ? 'b' : 'w');
    }
    onProgress?.(i + 1, verboseMoves.length);

    // The win% sigmoid is antisymmetric, so deriving the mover's win% from the
    // White-perspective eval works regardless of who is to move.
    const winPercentAfterForMover =
      sideToMove === 'w' ? evalToWinPercent(evalAfterWhite) : 100 - evalToWinPercent(evalAfterWhite);
    const winPercentAfterForMoverRated =
      sideToMove === 'w'
        ? evalToWinPercentForRating(evalAfterWhite, avgRating)
        : 100 - evalToWinPercentForRating(evalAfterWhite, avgRating);

    const deltaW = computeDeltaW(winPercentBeforeForMover, winPercentAfterForMover);
    const deltaWRated = computeDeltaW(winPercentBeforeForMoverRated, winPercentAfterForMoverRated);
    const accuracy = moveAccuracyFromWinPercents(winPercentBeforeForMover, winPercentAfterForMover);
    const isBookMove = bookTracker.feed(vMove.san);
    const evalBeforeCpForMover =
      pv1?.mate !== undefined ? (pv1.mate > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT) : (pv1?.cp ?? 0);

    const { category } = classifyMove({
      isBookMove,
      isForcedMove,
      isBestMove,
      isOnlyGoodMove,
      isSacrifice: sacrifice,
      deltaW: deltaWRated,
      winPercentBeforeForMover: winPercentBeforeForMoverRated,
      winPercentAfterForMover: winPercentAfterForMoverRated,
      evalBeforeCpForMover,
      hadWinningTacticBefore: winPercentBeforeForMoverRated >= 90,
    });

    moveRecords.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: sideToMove,
      san: vMove.san,
      piece: vMove.piece, // 'p'|'n'|'b'|'r'|'q'|'k' - chess.js verbose move field
      // chess.js's own flag codes (e.g. "c"=capture, "e"=en passant, "k"/"q"=
      // castle) - used instead of parsing `san` for these in js/ui/sounds.js,
      // since it doesn't depend on SAN's exact textual format.
      flags: vMove.flags,
      from: vMove.from,
      to: vMove.to,
      // The mover's own remaining time right after this move, from the
      // PGN's [%clk] comments - null if this game's PGN doesn't have them.
      clockSeconds: clockSecondsByPly[i] ?? null,
      // Mover's relative material dropped by >=3 this move (material.js) -
      // used for the "Anzahl Opfer" stat (js/main.js's computeAdvancedStats),
      // independent of whether it also earned a BRILLIANT classification.
      isSacrifice: sacrifice,
      fenBefore,
      fenAfter,
      evalBeforeWhite: toWhitePerspective(pv1, sideToMove),
      evalAfterWhite,
      winPercentBeforeForMover,
      winPercentAfterForMover,
      deltaW,
      accuracy,
      category,
      bestMoveSan: isBestMove ? null : bestMoveSanFor(fenBefore, bestMoveUci),
      bestMoveSquares: isBestMove ? null : squaresFromUci(bestMoveUci),
      // The engine's best move in fenAfter (i.e. the NEXT move's best move,
      // even if that one then actually was played) - null at game end.
      nextBestMoveSquares: squaresFromUci(currentEval.bestMoveUci),
    });
  }

  // Lichess's game-accuracy algorithm needs the white-perspective win% at
  // every position in the game (start through the final move), not just each
  // move's own before/after pair.
  const allWinPercentsWhite = [evalToWinPercent(moveRecords[0].evalBeforeWhite)];
  for (const m of moveRecords) allWinPercentsWhite.push(evalToWinPercent(m.evalAfterWhite));
  const moveColors = moveRecords.map((m) => m.color);

  return {
    headers,
    positions,
    startBestMoveSquares,
    moves: moveRecords,
    accuracy: computeGameAccuracy(allWinPercentsWhite, moveColors),
  };
}
