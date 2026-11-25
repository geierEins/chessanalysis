// The squares of a small static board (the meta mode's tooltip boards, css
// .meta-ob) for a FEN: plain spans in reading order, light/dark by class,
// highlighted squares marked "hl". No DOM or theme access - the caller
// passes the piece image URLs - so it runs anywhere (also in the Node tests).

const FILES = 'abcdefgh';

/**
 * @param {string} fen
 * @param {{lastMove?: string|null, flip?: boolean, pieceUrl: (code: string) => string}} opts
 *   lastMove: "e2e4" - its two squares are highlighted; flip: black at the bottom.
 * @returns {string}
 */
export function boardGridHtml(fen, { lastMove = null, flip = false, pieceUrl }) {
  // board[rank 8..1][file a..h]: a piece code like "wN", or null.
  const board = fen.split(' ')[0].split('/').map((row) => {
    const out = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
    }
    return out;
  });
  const marked = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);
  let html = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const r = flip ? 7 - i : i;
      const f = flip ? 7 - j : j;
      const sq = FILES[f] + (8 - r);
      const p = board[r]?.[f];
      const cls = `${(r + f) % 2 ? 'd' : 'l'}${marked.has(sq) ? ' hl' : ''}`;
      html += `<span class="${cls}">${p ? `<img src="${pieceUrl(p)}" alt="">` : ''}</span>`;
    }
  }
  return html;
}
