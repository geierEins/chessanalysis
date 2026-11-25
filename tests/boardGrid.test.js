import { describe, test, expectEqual, expectTrue } from './test-runner.js';
import { boardGridHtml } from '../js/meta/boardGrid.js';
import { finalTip } from '../js/meta/view/format.js';
import { finalBoardHtml } from '../js/meta/openingBoard.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const url = (code) => `p/${code}.png`;
const squares = (html) => html.match(/<span class="[^"]*">(?:<img[^>]*>)?<\/span>/g) ?? [];

describe('boardGrid', () => {
  test('64 squares, white at the bottom', () => {
    const sq = squares(boardGridHtml(START, { pieceUrl: url }));
    expectEqual(sq.length, 64);
    expectTrue(sq[0].includes('p/bR.png'), 'a8 first');
    expectTrue(sq[63].includes('p/wR.png'), 'h1 last');
  });

  test('flipped: black at the bottom', () => {
    const sq = squares(boardGridHtml(START, { flip: true, pieceUrl: url }));
    expectTrue(sq[0].includes('p/wR.png'), 'h1 first');
    expectTrue(sq[3].includes('p/wK.png'), 'e1 fourth');
  });

  test('the last move is highlighted', () => {
    const html = boardGridHtml(START, { lastMove: 'e2e4', pieceUrl: url });
    expectEqual(html.split(' hl"').length - 1, 2);
  });
});

describe('result badge tooltip', () => {
  // The row's native title ("In der Spiel-Analyse öffnen") would show on top of the board.
  test('the badge blocks inherited native titles', () => {
    expectEqual(finalTip({ url: 'u' }), ' data-final="u" title=""');
  });
});

describe('final board', () => {
  const game = { finalFen: START, lastMove: null, color: 'w', result: 'L', moves: 31, opponent: 'Bob', termination: 'resign' };

  test('below the board: how the game ended, not the opponent', () => {
    const html = finalBoardHtml(game);
    expectTrue(html.includes('<div class="meta-ob-moves">Aufgabe</div>'), 'termination');
    expectTrue(!html.includes('Bob'), 'no opponent');
  });
});
