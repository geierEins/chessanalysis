// Small static board for the meta mode's opening tooltips: the position that
// defines a named opening (its ECO line from js/analysis/openingBook.js),
// with the squares of the pieces that moved there highlighted, plus the move
// sequence underneath. Plain HTML grid instead of a chessboard.js instance so
// hovering over a long table stays cheap; colors and pieces follow the board
// and piece themes the user picked for single-game mode.

import { Chess } from '../chessLib.js';
import { openingLine } from '../analysis/openingBook.js';
import { PIECE_THEMES } from '../ui/pieceThemePicker.js';
import { loadPieceTheme } from '../persistence.js';

const FILES = 'abcdefgh';
const cache = new Map();

/** Image URL for a piece code like "wP" in the piece theme the user picked. */
export function pieceUrl(code) {
  const theme = PIECE_THEMES[loadPieceTheme()] ?? PIECE_THEMES.neo;
  return typeof theme.urlTemplate === 'function' ? theme.urlTemplate(code) : theme.urlTemplate.replace('{piece}', code);
}

/** Plays the line, tracking which squares hold a piece that has moved. */
function playLine(sans) {
  const chess = new Chess();
  const moved = new Set();
  for (const san of sans) {
    const m = chess.move(san);
    if (!m) return null;
    moved.delete(m.from);
    moved.add(m.to);
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.color === 'w' ? '1' : '8';
      const [rookFrom, rookTo] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
      moved.delete(rookFrom + rank);
      moved.add(rookTo + rank);
    }
    if (m.flags.includes('e')) moved.delete(m.to[0] + m.from[1]);
  }
  return { chess, moved };
}

function moveText(sans) {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ');
}

/**
 * Tooltip HTML for an opening name, or null if the name isn't in the book.
 * Cached per name and piece theme.
 * @param {string} name
 * @param {string} [extra] - plain text shown under the move list (e.g. played variations)
 */
export function openingBoardHtml(name, extra = '') {
  const key = `${loadPieceTheme()}|${name}`;
  if (!cache.has(key)) {
    const sans = openingLine(name);
    const played = sans && playLine(sans);
    let html = null;
    if (played) {
      const board = played.chess.board();
      let squares = '';
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = FILES[f] + (8 - r);
          const p = board[r][f];
          const cls = `${(r + f) % 2 ? 'd' : 'l'}${played.moved.has(sq) ? ' hl' : ''}`;
          const img = p ? `<img src="${pieceUrl(p.color + p.type.toUpperCase())}" alt="">` : '';
          squares += `<span class="${cls}">${img}</span>`;
        }
      }
      html = `<div class="meta-ob-name">${escapeHtml(name)}</div><div class="meta-ob">${squares}</div><div class="meta-ob-moves">${moveText(sans)}</div>`;
    }
    cache.set(key, html);
  }
  const html = cache.get(key);
  return html && extra ? `${html}<div class="meta-ob-extra">${escapeHtml(extra)}</div>` : html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
