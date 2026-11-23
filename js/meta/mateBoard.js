// Small example board for the "Matt" tab's pattern tooltips: one textbook
// position per checkmate pattern (js/analysis/mateType.js), cut down to the
// part of the board where it happens, the mating move highlighted, plus a
// one-line explanation. Same look as the opening tooltips (openingBoard.js).

import { MATE_LABEL } from './metaRecords.js';
import { pieceUrl } from './openingBoard.js';
import { loadPieceTheme } from '../persistence.js';

const FILES = 'abcdefgh';

// [board part of a FEN with just the pieces that matter, mating move from, to, explanation]
const EXAMPLES = {
  scholars: ['r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/8/8', 'h5', 'f7', 'Die Dame schlägt früh auf f7 und setzt matt, gedeckt vom Läufer.'],
  fools: ['rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR', 'd8', 'h4', 'Matt im 2. Zug: Weiß hat f- und g-Bauern gezogen, die Dame trifft über h4.'],
  smothered: ['6rk/5Npp/8/8/8/8/8/8', 'g5', 'f7', 'Der Springer setzt matt, der König ist von den eigenen Figuren eingemauert.'],
  kq: ['7k/6Q1/6K1/8/8/8/8/8', 'e5', 'g7', 'König und Dame gegen den nackten König.'],
  kr: ['R6k/8/6K1/8/8/8/8/8', 'a5', 'a8', 'König und Turm gegen den nackten König.'],
  kbn: ['k7/3N4/1K6/3B4/8/8/8/8', 'e4', 'd5', 'König, Läufer und Springer gegen den nackten König.'],
  kbb: ['k7/8/1K6/3BB3/8/8/8/8', 'e4', 'd5', 'König und zwei Läufer gegen den nackten König.'],
  arabian: ['7k/7R/5N2/8/8/8/8/8', 'h4', 'h7', 'König in der Ecke: der Turm setzt daneben matt, der Springer deckt ihn.'],
  hook: ['3nkr2/4R3/8/3N4/4P3/8/8/8', 'b7', 'e7', 'Der Turm setzt daneben matt, gedeckt vom Springer, den ein Bauer deckt.'],
  corner: ['7k/5N1p/8/6R1/8/8/8/8', 'e5', 'f7', 'König in der Ecke: der Springer gibt Schach, der Turm sperrt die Nachbarlinie.'],
  anastasia: ['8/4N1pk/8/8/8/7R/8/8', 'e3', 'h3', 'König am Rand: Turm oder Dame setzen auf der Randlinie matt, der Springer sperrt die Flucht.'],
  morphy: ['7k/7p/8/8/3B2R1/8/8/8', 'c3', 'd4', 'König in der Ecke: der Läufer gibt Schach, der Turm sperrt die Nachbarlinie.'],
  greco: ['7k/6p1/8/8/2B5/7R/8/8', 'e3', 'h3', 'König in der Ecke: Matt auf der Randlinie, der Läufer deckt das Fluchtfeld.'],
  boden: ['2kr4/3p4/B7/8/5B2/8/8/8', 'b5', 'a6', 'Zwei Läufer auf sich kreuzenden Diagonalen.'],
  opera: ['3Rk3/4pp2/8/B7/8/8/8/8', 'd5', 'd8', 'Der Turm setzt auf der Grundreihe matt, gedeckt vom Läufer.'],
  epaulette: ['3rkr2/8/4Q3/8/8/8/8/8', 'c4', 'e6', 'Die eigenen Figuren links und rechts sperren den König, die Dame setzt frontal matt.'],
  dovetail: ['8/4p3/3pk3/5Q2/6P1/8/8/8', 'f3', 'f5', 'Die Dame steht schräg vor dem König, die eigenen Figuren versperren die Flucht nach hinten.'],
  gueridon: ['8/3p1p2/4k3/4Q3/5P2/8/8/8', 'e3', 'e5', 'Die Dame steht direkt vor dem König, die Felder schräg dahinter sind versperrt.'],
  damiano: ['5rk1/5p1Q/6P1/8/8/8/8/8', 'h4', 'h7', 'Die Dame setzt schräg daneben matt, gedeckt von einem Bauern.'],
  lolli: ['6k1/6Q1/5P2/8/8/8/8/8', 'g4', 'g7', 'Die Dame setzt direkt vor dem König matt, gedeckt von einem Bauern.'],
  kiss: ['6k1/6Q1/8/8/8/2B5/8/8', 'g4', 'g7', 'Die Dame steht direkt am König und ist gedeckt.'],
  ladder: ['R6k/1R6/8/8/8/8/8/8', 'a4', 'a8', 'Zwei Schwerfiguren treiben den König an den Rand: eine sperrt, eine setzt matt.'],
  backrank: ['R5k1/5ppp/8/8/8/8/8/8', 'a4', 'a8', 'Matt auf der Grundreihe, die eigenen Bauern versperren die Flucht.'],
  pawn: ['6bk/6Pp/5K2/8/8/8/8/8', 'g6', 'g7', 'Ein Bauer setzt matt.'],
};

const cache = new Map();

/** "e4" -> [file 0-7, row 0-7 from the top] */
const pos = (sq) => [FILES.indexOf(sq[0]), 8 - Number(sq[1])];

/** Rows of 8 entries (piece code like "wQ" or null) from a FEN board part. */
function parseBoard(fen) {
  return fen.split('/').map((row) => {
    const out = [];
    for (const ch of row) {
      if (/\d/.test(ch)) out.push(...Array(Number(ch)).fill(null));
      else out.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
    }
    return out;
  });
}

/** Tooltip HTML for a pattern id, or null (no example, e.g. "Sonstiges Matt"). */
export function mateBoardHtml(type) {
  const ex = EXAMPLES[type];
  if (!ex) return null;
  const key = `${loadPieceTheme()}|${type}`;
  if (!cache.has(key)) {
    const [fen, from, to, text] = ex;
    const board = parseBoard(fen);
    // The part of the board that matters: every piece and the move, one square of margin, at least 4×4.
    const cells = [pos(from), pos(to)];
    board.forEach((row, r) => row.forEach((p, f) => p && cells.push([f, r])));
    const span = (vals) => {
      let lo = Math.max(0, Math.min(...vals) - 1);
      let hi = Math.min(7, Math.max(...vals) + 1);
      while (hi - lo < 3) (lo > 0 ? lo-- : hi++);
      return [lo, hi];
    };
    const [f0, f1] = span(cells.map(([f]) => f));
    const [r0, r1] = span(cells.map(([, r]) => r));
    const moved = new Set([from, to]);
    let squares = '';
    for (let r = r0; r <= r1; r++) {
      for (let f = f0; f <= f1; f++) {
        const sq = FILES[f] + (8 - r);
        const p = board[r][f];
        squares += `<span class="${(r + f) % 2 ? 'd' : 'l'}${moved.has(sq) ? ' hl' : ''}">${p ? `<img src="${pieceUrl(p)}" alt="">` : ''}</span>`;
      }
    }
    const cols = f1 - f0 + 1;
    const rows = r1 - r0 + 1;
    cache.set(key, `<div class="meta-ob-name">${MATE_LABEL[type]}</div>`
      + `<div class="meta-ob" style="grid-template-columns:repeat(${cols},22px);grid-template-rows:repeat(${rows},22px);width:${cols * 22}px;height:${rows * 22}px">${squares}</div>`
      + `<div class="meta-ob-moves">${text}</div>`);
  }
  return cache.get(key);
}
