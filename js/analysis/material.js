// Material balance helpers, used to detect sacrifices for the "Brilliant"
// classification, and to render the captured-pieces display next to the
// board's player rows.

import { Chess } from '../chessLib.js';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const STARTING_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 };
// Display order: most valuable captured piece first, matching chess.com's
// own captured-pieces tray.
const PIECE_DISPLAY_ORDER = ['q', 'r', 'b', 'n', 'p'];

/**
 * @param {import('chess.js').Chess} chess
 * @param {'w'|'b'} color
 * @returns {number} total material value for that color on the board.
 */
function materialFor(chess, color) {
  const board = chess.board();
  let total = 0;
  for (const row of board) {
    for (const square of row) {
      if (square && square.color === color) {
        total += PIECE_VALUES[square.type];
      }
    }
  }
  return total;
}

/**
 * Relative material balance (mover - opponent) from the mover's perspective.
 * @param {import('chess.js').Chess} chess
 * @param {'w'|'b'} moverColor
 */
export function relativeMaterial(chess, moverColor) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  return materialFor(chess, moverColor) - materialFor(chess, opponentColor);
}

/**
 * A move is a "sacrifice" if it immediately drops the mover's relative material
 * balance by at least ~2 pawns' worth, without instant recapture. Matches
 * chessdesk.app's reverse-engineered reading of Chess.com's Brilliant rule
 * ("give up at least 2 points of material") - loosened from a strict minor
 * piece (3) so a pure 2-pawn sacrifice can still qualify.
 * @param {import('chess.js').Chess} chessBefore - position before the move.
 * @param {import('chess.js').Chess} chessAfter - position after the move.
 * @param {'w'|'b'} moverColor
 */
export function isSacrifice(chessBefore, chessAfter, moverColor) {
  const before = relativeMaterial(chessBefore, moverColor);
  const after = relativeMaterial(chessAfter, moverColor);
  return before - after >= 2;
}

/**
 * For the board's captured-pieces display: which of the opponent's pieces
 * each side has captured so far (most valuable first), and that side's net
 * material point lead (0 or negative if not ahead - the UI only shows a
 * "+N" on whichever side is actually leading).
 * @param {string} fen
 * @returns {{white: {captured: string[], advantage: number}, black: {captured: string[], advantage: number}}}
 */
export function materialSummaryFromFen(fen) {
  const chess = new Chess(fen);
  const board = chess.board();
  const onBoard = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of board) {
    for (const square of row) {
      if (square && square.type !== 'k') onBoard[square.color][square.type]++;
    }
  }

  const capturedBy = (color) => {
    const opponent = color === 'w' ? 'b' : 'w';
    const captured = [];
    for (const type of PIECE_DISPLAY_ORDER) {
      const missing = STARTING_COUNTS[type] - onBoard[opponent][type];
      for (let i = 0; i < missing; i++) captured.push(type);
    }
    return captured;
  };

  const totalValue = (color) =>
    Object.entries(onBoard[color]).reduce((sum, [type, count]) => sum + PIECE_VALUES[type] * count, 0);
  const whiteValue = totalValue('w');
  const blackValue = totalValue('b');

  return {
    white: { captured: capturedBy('w'), advantage: whiteValue - blackValue },
    black: { captured: capturedBy('b'), advantage: blackValue - whiteValue },
  };
}
