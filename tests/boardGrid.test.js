import { describe, test, expectEqual, expectTrue } from './test-runner.js';
import { boardGridHtml } from '../js/meta/boardGrid.js';

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
