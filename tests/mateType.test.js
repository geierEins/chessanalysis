import { describe, test, expectEqual, expectTrue } from './test-runner.js';
import { Chess } from '../js/chessLib.js';
import { detectMate, checkers } from '../js/analysis/mateType.js';

/** A test position must really be checkmate - else the test proves nothing. */
function mate(fen, move, opts) {
  expectTrue(new Chess(fen).in_checkmate(), `${fen} is checkmate`);
  return detectMate(fen, move, opts);
}

describe('mateType: Merkmale', () => {
  test('no checkmate gives null', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expectEqual(detectMate(fen, { from: 'e2', to: 'e4', piece: 'p', color: 'w', flags: 'b' }), null);
  });

  test('a rook mate: rook, no double / discovered check, no promotion', () => {
    const m = mate('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', { from: 'a1', to: 'a8', piece: 'r', color: 'w', flags: 'n' });
    expectEqual(m.piece, 'r');
    expectEqual(m.doubleCheck, false);
    expectEqual(m.discovered, false);
    expectEqual(m.promotion, false);
  });

  test('a discovered mate: the checking piece, not the moved one', () => {
    const m = mate('R5k1/5ppp/2N5/8/8/8/8/6K1 b - - 0 1', { from: 'd8', to: 'c6', piece: 'n', color: 'w', flags: 'n' });
    expectEqual(m.discovered, true);
    expectEqual(m.doubleCheck, false);
    expectEqual(m.piece, 'r');
  });

  test('a double-check mate: the moved piece', () => {
    const m = mate('R5k1/5ppp/5N2/8/8/8/8/6K1 b - - 0 1', { from: 'e8', to: 'f6', piece: 'n', color: 'w', flags: 'n' });
    expectEqual(m.doubleCheck, true);
    expectEqual(m.piece, 'n');
  });

  test('a promotion mate counts as the new piece', () => {
    const m = mate('1Q5k/6pp/8/8/8/8/8/6K1 b - - 0 1', { from: 'b7', to: 'b8', piece: 'p', color: 'w', flags: 'np', promotion: 'q' });
    expectEqual(m.piece, 'q');
    expectEqual(m.promotion, true);
  });

  test('a castling mate: the rook gives it', () => {
    const m = mate('2rkr3/2p1p3/8/8/8/8/8/2KR4 b - - 0 1', { from: 'e1', to: 'c1', piece: 'k', color: 'w', flags: 'q' });
    expectEqual(m.piece, 'r');
    expectEqual(m.discovered, true);
  });

  test('checkers finds every piece giving check', () => {
    const board = new Chess('R5k1/5ppp/5N2/8/8/8/8/6K1 b - - 0 1').board();
    expectEqual(checkers(board, 'g8', 'w').sort().join(','), 'a8,f6');
  });
});
