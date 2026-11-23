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
    expectEqual(m.king, 'g8');
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

  test('a castling mate: the castled rook gives it - no discovered mate', () => {
    const m = mate('2rkr3/2p1p3/8/8/8/8/8/2KR4 b - - 0 1', { from: 'e1', to: 'c1', piece: 'k', color: 'w', flags: 'q' });
    expectEqual(m.piece, 'r');
    expectEqual(m.discovered, false);
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
    expectEqual(type('6k1/6Q1/8/8/8/2B5/8/K7 b - - 0 1', 'g2', 'g7', 'q'), 'kiss');
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

  test('MATE_TYPES lists the 24 patterns in checking order, then other', () => {
    expectEqual(MATE_TYPES.join(','), 'scholars,fools,smothered,kq,kr,kbn,kbb,arabian,hook,corner,anastasia,morphy,greco,boden,opera,epaulette,dovetail,gueridon,damiano,lolli,kiss,ladder,backrank,pawn,other');
  });
});

describe('mateType: weitere Muster', () => {
  const type = (fen, from, to, piece, opts, flags = 'n') => mate(fen, { from, to, piece, color: 'w', flags }, opts).type;

  test('Narrenmatt', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expectEqual(mate(fen, { from: 'd8', to: 'h4', piece: 'q', color: 'b', flags: 'n' }, { standardStart: true, moveNumber: 2 }).type, 'fools');
  });
  test('Grundmatt K+L+S gegen K', () => {
    expectEqual(type('k7/3N4/1K6/3B4/8/8/8/8 b - - 0 1', 'e4', 'd5', 'b'), 'kbn');
  });
  test('Grundmatt K+L+L gegen K', () => {
    expectEqual(type('k7/8/1K6/3BB3/8/8/8/8 b - - 0 1', 'e4', 'd5', 'b'), 'kbb');
  });
  test('Hakenmatt', () => {
    expectEqual(type('3nkr2/4R3/8/3N4/4P3/8/8/6K1 b - - 0 1', 'a7', 'e7', 'r'), 'hook');
  });
  test('Eckmatt', () => {
    expectEqual(type('7k/5N1p/8/8/8/8/8/6RK b - - 0 1', 'e5', 'f7', 'n'), 'corner');
  });
  test('Morphy-Matt', () => {
    expectEqual(type('7k/7p/8/8/3B4/8/8/6RK b - - 0 1', 'a1', 'd4', 'b'), 'morphy');
  });
  test('Greco-Matt', () => {
    expectEqual(type('7k/6p1/8/8/2B5/7R/8/6K1 b - - 0 1', 'a3', 'h3', 'r'), 'greco');
  });
  test('Boden-Matt', () => {
    expectEqual(type('2kr4/3p4/B7/8/5B2/8/8/6K1 b - - 0 1', 'e2', 'a6', 'b'), 'boden');
  });
  test('Opera-Matt', () => {
    expectEqual(type('3Rk3/4pp2/8/B7/8/8/8/6K1 b - - 0 1', 'd1', 'd8', 'r'), 'opera');
  });
  test('Guéridon-Matt', () => {
    expectEqual(type('8/3p1p2/4k3/4Q3/5P2/8/8/6K1 b - - 0 1', 'e1', 'e5', 'q'), 'gueridon');
  });
  test('Damiano-Matt', () => {
    expectEqual(type('5rk1/5p1Q/6P1/8/8/8/8/6K1 b - - 0 1', 'h1', 'h7', 'q'), 'damiano');
  });
  test('Lolli-Matt', () => {
    expectEqual(type('6k1/6Q1/5P2/8/8/8/8/K7 b - - 0 1', 'g2', 'g7', 'q'), 'lolli');
  });
});

describe('mateType: keine Fehltreffer', () => {
  test('a back-rank mate with a far bishop seeing the rook stays Grundreihenmatt, not Opera-Matt', () => {
    expectEqual(mate('R5k1/5ppp/8/8/8/8/6B1/6K1 b - - 0 1', { from: 'a1', to: 'a8', piece: 'r', color: 'w', flags: 'n' }).type, 'backrank');
  });

  test('a heavy piece on the next rank that blocks no flight square makes no Treppenmatt', () => {
    expectEqual(mate('R5k1/2Q2ppp/8/8/8/8/8/6K1 b - - 0 1', { from: 'a1', to: 'a8', piece: 'r', color: 'w', flags: 'n' }).type, 'backrank');
  });
});

describe('mateType: Weiß wird mattgesetzt', () => {
  const black = (fen, from, to, piece, opts, flags = 'n') => mate(fen, { from, to, piece, color: 'b', flags }, opts).type;

  test('Schäfermatt on f2', () => {
    const fen = 'rnb1k1nr/pppp1ppp/P7/2b1p3/8/8/1PPPPqPP/RNBQKBNR w KQkq - 0 5';
    expectEqual(black(fen, 'h4', 'f2', 'q', { standardStart: true, moveNumber: 4 }, 'c'), 'scholars');
  });

  test('Grundreihenmatt on rank 1', () => {
    expectEqual(black('6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1', 'a8', 'a1', 'r'), 'backrank');
  });

  test('Opera-Matt on rank 1', () => {
    expectEqual(black('4k3/8/8/8/b7/8/4PP2/3rK3 w - - 0 1', 'd8', 'd1', 'r'), 'opera');
  });
});
