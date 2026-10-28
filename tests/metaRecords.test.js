import { describe, test, expectEqual, expectTrue } from './test-runner.js';
import { buildFastRecord, buildEngineRecord, nonPawnMaterial, phaseOf, openingFamily, mateInOne } from '../js/meta/metaRecords.js';
import { openingLine } from '../js/analysis/openingBook.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Scholar's mate, white (alice) wins, with clocks.
const PGN = `[Event "Live Chess"]
[TimeControl "180+2"]
[Result "1-0"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Bc4 {[%clk 0:02:58]} 2... Nc6 {[%clk 0:02:55]}
3. Qh5 {[%clk 0:02:50]} 3... Nf6 {[%clk 0:02:40]} 4. Qxf7# {[%clk 0:02:45]} 1-0`;

function rawGame(overrides = {}) {
  return {
    url: 'https://www.chess.com/game/live/1',
    pgn: PGN,
    time_class: 'blitz',
    time_control: '180+2',
    end_time: 1760000000,
    rated: true,
    white: { username: 'Alice', rating: 900, result: 'win' },
    black: { username: 'Bob', rating: 950, result: 'checkmated' },
    ...overrides,
  };
}

describe('metaRecords: buildFastRecord', () => {
  test('a win as white, seen from the searched user', () => {
    const r = buildFastRecord(rawGame(), 'alice');
    expectEqual(r.color, 'w');
    expectEqual(r.result, 'W');
    expectEqual(r.opponent, 'Bob');
    expectEqual(r.oppRating, 950);
    expectEqual(r.termination, 'checkmate');
    expectEqual(r.plies, 7);
    expectEqual(r.moves, 4);
    expectEqual(r.firstMove, 'e4');
    expectEqual(r.initialClock, 180);
    expectEqual(r.ownClockEnd, 165); // white's last clock, 0:02:45
  });

  test('the same game from the loser', () => {
    const r = buildFastRecord(rawGame(), 'BOB');
    expectEqual(r.color, 'b');
    expectEqual(r.result, 'L');
    expectEqual(r.ownClockEnd, 160); // black's last clock, 0:02:40
  });

  test('captures: who took what where', () => {
    // Qxf7# - white's queen takes the f7 pawn, black never captures. Own piece first.
    expectEqual(buildFastRecord(rawGame(), 'alice').captures.taken.join(), 'f7qp');
    expectEqual(buildFastRecord(rawGame(), 'alice').captures.lost.join(), '');
    expectEqual(buildFastRecord(rawGame(), 'bob').captures.lost.join(), 'f7pq');
  });

  test('captures: en passant counts the square the pawn stood on', () => {
    const pgn = '[Event "Live Chess"]\n[Result "*"]\n\n1. e4 a6 2. e5 d5 3. exd6 *';
    const r = buildFastRecord(rawGame({ pgn }), 'alice');
    expectEqual(r.captures.taken.join(), 'd5pp');
  });

  test('draw reasons count as draws', () => {
    const r = buildFastRecord(rawGame({ white: { username: 'Alice', result: 'repetition' }, black: { username: 'Bob', result: 'repetition' } }), 'alice');
    expectEqual(r.result, 'D');
    expectEqual(r.termination, 'repetition');
  });

  test('a game the user did not play in is skipped', () => {
    expectEqual(buildFastRecord(rawGame(), 'carol'), null);
  });

  test('daily games carry no clock', () => {
    const r = buildFastRecord(rawGame({ time_class: 'daily', time_control: '1/86400' }), 'alice');
    expectEqual(r.initialClock, null);
    expectEqual(r.ownClockEnd, null);
  });
});

describe('metaRecords: phases', () => {
  test('full starting material is 62 (2Q + 4R + 4B + 4N)', () => {
    expectEqual(nonPawnMaterial(START_FEN), 62);
  });

  test('early move is opening, late move with full material is middlegame', () => {
    expectEqual(phaseOf({ fenBefore: START_FEN, moveNumber: 5 }), 'opening');
    expectEqual(phaseOf({ fenBefore: START_FEN, moveNumber: 20 }), 'middlegame');
  });

  test('little material left is endgame, even early', () => {
    expectEqual(phaseOf({ fenBefore: '4k3/8/8/8/8/8/8/R3K2R w - - 0 1', moveNumber: 8 }), 'endgame');
  });

  test('opening family drops the variation', () => {
    expectEqual(openingFamily('Italian Game: Two Knights Defense'), 'Italian Game');
    expectEqual(openingFamily(null), null);
  });
});

describe('metaRecords: buildEngineRecord', () => {
  const cat = (id) => ({ category: { id } });
  const move = (color, moveNumber, id, cpWhite, extra = {}) => ({
    color,
    moveNumber,
    fenBefore: START_FEN,
    accuracy: id === 'BLUNDER' ? 20 : 90,
    evalAfterWhite: { cp: cpWhite },
    piece: 'q',
    clockSeconds: 100,
    ...cat(id),
    ...extra,
  });
  const analysis = {
    accuracy: { white: 81.24, black: 64.0 },
    moves: [
      move('w', 1, 'BEST', 20),
      move('b', 1, 'BEST', 30),
      move('w', 2, 'BLUNDER', -400, { clockSeconds: 10 }),
      move('b', 2, 'MISTAKE', 350),
    ],
    winPercentsWhite: [50, 52, 53, 10, 80],
  };

  test('accuracy, counts and blunders for white', () => {
    const e = buildEngineRecord(analysis, 'w', 180);
    expectEqual(e.accuracy, 81.2);
    expectEqual(e.oppAccuracy, 64);
    expectEqual(e.counts.BLUNDER, 1);
    expectEqual(e.oppCounts.MISTAKE, 1);
    expectEqual(e.blunders.length, 1);
    expectTrue(e.blunders[0].timeTrouble, '10s of 180s is time trouble');
    expectEqual(e.maxCp, 350);
    expectEqual(e.minCp, -400);
  });

  test('phase accuracy uses the game formula, so a blunder pulls it down', () => {
    const e = buildEngineRecord(analysis, 'w', 180);
    // Both white moves are in the opening; the plain mean of 100 and the
    // blunder's ~14 would be ~57, the game formula gives ~22.
    expectTrue(e.phaseAccuracy.opening < 30, `opening ${e.phaseAccuracy.opening}`);
    expectEqual(e.phaseAccuracy.endgame, null);
  });

  test('evals flip for black', () => {
    const e = buildEngineRecord(analysis, 'b', 180);
    expectEqual(e.maxCp, 400);
    expectEqual(e.minCp, -350);
    expectEqual(e.blunders.length, 0);
  });
});

describe('openingBook: openingLine', () => {
  test('a family name maps to its defining moves', () => {
    expectEqual(openingLine('Italian Game').join(' '), 'e4 e5 Nf3 Nc6 Bc4');
  });

  test('a name with several lines takes the shortest', () => {
    expectEqual(openingLine('Sicilian Defense').join(' '), 'e4 c5');
  });

  test('unknown names give null', () => {
    expectEqual(openingLine('Not An Opening'), null);
    expectEqual(openingLine(null), null);
  });
});

describe('metaRecords: mateInOne', () => {
  // Scholar's mate log: White "has" a mate in one before ply 5 (made up) and
  // before ply 7, where Qxf7# is played; Black's #1 (ply 6) is not White's.
  const evals = 'e2e4 30 20,e7e5 -30 -40,f1c4 30 20,b8c6 -30 -40,d1h5 #1 50,g8f6 #1 -40,h5f7 #1 400';

  test('a played mate is a used chance, any other one is missed', () => {
    const r = buildFastRecord(rawGame(), 'alice');
    expectEqual(JSON.stringify(mateInOne({ evals }, r)), JSON.stringify({ chances: 2, missed: 1 }));
  });

  test("only the user's own moves count", () => {
    const r = buildFastRecord(rawGame(), 'bob');
    expectEqual(JSON.stringify(mateInOne({ evals }, r)), JSON.stringify({ chances: 1, missed: 1 }));
  });

  test('no engine log gives null', () => {
    expectEqual(mateInOne({}, buildFastRecord(rawGame(), 'alice')), null);
  });
});
