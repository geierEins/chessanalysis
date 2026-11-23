import { describe, test, expectEqual, expectTrue } from './test-runner.js';
import { Chess } from '../js/chessLib.js';
import { detectMate, checkers, MATE_TYPES } from '../js/analysis/mateType.js';

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

describe('mateType: Muster', () => {
  const type = (fen, from, to, piece, opts, flags = 'n') => mate(fen, { from, to, piece, color: 'w', flags }, opts).type;

  test('Schäfermatt', () => {
    const fen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    expectEqual(type(fen, 'h5', 'f7', 'q', { standardStart: true, moveNumber: 4 }, 'c'), 'scholars');
  });

  test('no Schäfermatt from a set-up position (FEN header)', () => {
    const fen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    expectTrue(type(fen, 'h5', 'f7', 'q', { standardStart: false, moveNumber: 4 }, 'c') !== 'scholars');
  });

  test('Ersticktes Matt', () => {
    expectEqual(type('6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1', 'g5', 'f7', 'n'), 'smothered');
  });

  test('Grundmatt K+D gegen K (not Damenkuss)', () => {
    expectEqual(type('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', 'g1', 'g7', 'q'), 'kq');
  });

  test('Grundmatt K+T gegen K', () => {
    expectEqual(type('R6k/8/6K1/8/8/8/8/8 b - - 0 1', 'a1', 'a8', 'r'), 'kr');
  });

  test('Arabisches Matt', () => {
    expectEqual(type('7k/7R/5N2/8/8/8/8/6K1 b - - 0 1', 'h1', 'h7', 'r'), 'arabian');
  });

  test('Anastasia-Matt', () => {
    expectEqual(type('8/4N1pk/8/8/8/7R/8/6K1 b - - 0 1', 'h1', 'h3', 'r'), 'anastasia');
  });

  test('Epaulettenmatt', () => {
    expectEqual(type('3rkr2/8/4Q3/8/8/8/8/4K3 b - - 0 1', 'a2', 'e6', 'q'), 'epaulette');
  });

  test('Schwalbenschwanzmatt', () => {
    expectEqual(type('8/4p3/3pk3/5Q2/6P1/8/8/K7 b - - 0 1', 'f1', 'f5', 'q'), 'dovetail');
  });

  test('Damenkuss', () => {
    expectEqual(type('6k1/6Q1/5P2/8/8/8/8/K7 b - - 0 1', 'g2', 'g7', 'q'), 'kiss');
  });

  test('Damenkuss on the edge beats Treppenmatt', () => {
    expectEqual(type('6Qk/R4K2/8/8/8/8/8/8 b - - 0 1', 'g1', 'g8', 'q'), 'kiss');
  });

  test('Treppenmatt', () => {
    expectEqual(type('R6k/1R6/8/8/8/8/8/K7 b - - 0 1', 'a2', 'a8', 'r'), 'ladder');
  });

  test('Grundreihenmatt', () => {
    expectEqual(type('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', 'a1', 'a8', 'r'), 'backrank');
  });

  test('Bauernmatt', () => {
    expectEqual(type('6bk/6Pp/5K2/8/8/8/8/8 b - - 0 1', 'g6', 'g7', 'p'), 'pawn');
  });

  test('MATE_TYPES lists the 12 patterns in checking order, then other', () => {
    expectEqual(MATE_TYPES.join(','), 'scholars,smothered,kq,kr,arabian,anastasia,epaulette,dovetail,kiss,ladder,backrank,pawn,other');
  });
});
