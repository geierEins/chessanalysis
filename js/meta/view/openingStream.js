// The "Eröffnungen" tab's opening stream: one color's opening paths as bands
// flowing left to right, as thick as their game count and colored by score.
// buildStream() makes the tree (the same nodes as the tab's opening trees).

import { score, esc } from './format.js';

export const MAX_PLY = 16; // the stream never goes deeper than this

/**
 * The games' opening paths (metaRecords' openingPath) as a tree, cut at maxPly.
 * A node is identified by its path of step keys, as in the opening trees.
 * Games without a path are left out. Children are sorted by game count
 * (descending, ties in order of first appearance).
 * @returns {{key: string, ply: number, move: string, label: string, named: boolean, name: string|null, line: string, n: number, score: number|null, children: object[]}}
 */
export function buildStream(records, maxPly = MAX_PLY) {
  const node = (step, ply) => ({ key: step?.key ?? '', ply, move: step?.move ?? '', label: step?.label ?? '', named: step?.named ?? false, name: step?.name ?? null, line: step?.line ?? '', games: [], kids: new Map() });
  const root = node(null, 0);
  for (const r of records) {
    const path = r.openingPath ?? [];
    if (!path.length) continue;
    root.games.push(r);
    let cur = root;
    for (const step of path.slice(0, maxPly)) {
      let next = cur.kids.get(step.key);
      if (!next) cur.kids.set(step.key, (next = node(step, cur.ply + 1)));
      next.games.push(r);
      cur = next;
    }
  }
  const finish = (n) => {
    const children = [...n.kids.values()].map(finish).sort((a, b) => b.n - a.n); // stable: ties keep insertion order
    const { kids, games, ...rest } = n;
    return { ...rest, n: games.length, score: score(games), children };
  };
  return finish(root);
}

export const MIN_BAND_PX = 4; // a band thinner than this on screen is not drawn (its share ends in a stub)
export const MAX_ZOOM = 14;
const PAD_X = 24;
const PAD_TOP = 8;
const PAD_BOTTOM = 22; // room for the ply labels
const FILL = 0.82; // share of the drawing height the bands take; the rest is air to fan out into
const MIN_COLS = 6;

/**
 * The stream's geometry in content coordinates (px at zoom 1). Every node gets
 * a vertical range proportional to its game count (children split their
 * parent's range in order); its band, n * k tall, is centered in that range
 * (top). At the parent's column the children's bands are stacked without gaps
 * from the parent band's top (srcTop) - so they flow out of it and fan apart.
 * cols0: the columns of the start view - as deep as bands are still drawn at
 * zoom 1, at least 6, at most MAX_PLY.
 */
export function layoutStream(root, { W, H }) {
  const Hp = H - PAD_TOP - PAD_BOTTOM;
  const k = root.n ? (FILL * Hp) / root.n : 0;
  const top = new Map();
  const srcTop = new Map();
  let deepest = 0;
  const place = (node, y0, y1) => {
    top.set(node, (y0 + y1) / 2 - (node.n * k) / 2);
    if (node.ply && node.n * k >= MIN_BAND_PX) deepest = Math.max(deepest, node.ply);
    let y = y0;
    let src = top.get(node);
    for (const c of node.children) {
      const span = ((y1 - y0) * c.n) / node.n;
      srcTop.set(c, src);
      src += c.n * k;
      place(c, y, y + span);
      y += span;
    }
  };
  place(root, PAD_TOP, PAD_TOP + Hp);
  const cols0 = Math.min(MAX_PLY, Math.max(MIN_COLS, deepest));
  const colW = (W - 2 * PAD_X) / cols0;
  return { k, colW, cols0, x: (ply) => PAD_X + ply * colW, top, srcTop };
}

/**
 * What is drawn at a zoom: a node's band when its parent's is (the root counts
 * as drawn) and it is at least MIN_BAND_PX thick on screen. Each drawn node
 * whose drawn children don't hold all its games ends the rest in a stub - games
 * that left the book there, or went on in bands too thin to draw. The stub sits
 * in the node's band below the drawn children.
 */
export function visibleBands(root, layout, zoom) {
  const { k } = layout;
  const bands = [];
  const stubs = [];
  let maxPly = 0;
  const walk = (node) => {
    let held = 0;
    for (const c of node.children) {
      if (c.n * k * zoom < MIN_BAND_PX) continue;
      bands.push(c);
      maxPly = Math.max(maxPly, c.ply);
      held += c.n;
      walk(c);
    }
    const rest = node.n - held;
    if (rest > 0) stubs.push({ node, top: layout.top.get(node) + held * k, h: rest * k, n: rest });
  };
  walk(root);
  return { bands, stubs, maxPly };
}

const STUB = 0.35; // a stub's length, in columns
const MIN_FONT_PX = 8.5;
const MAX_FONT_PX = 13;
const CHAR_W = 0.56; // estimated glyph width per font px (no measuring: the output must be deterministic)
const LABEL_INSET = 4;

/** Score 0..1 as red (weak) - yellow - green (strong). */
const scoreColor = (s) => `hsl(${Math.round((s ?? 0.5) * 125)}, 68%, 52%)`;
const f = (v) => Math.round(v * 10) / 10;

/**
 * The stream as SVG, drawn in screen px: content point (cx, cy) lands at
 * ((cx - view.x) * zoom, (cy - view.y) * zoom), so font sizes and thresholds
 * are px. Bands and stubs outside the W x H view are left out. A band's label
 * ("1.e4 King's Pawn Game", or just the move) runs along its middle when it
 * is at least MIN_FONT_PX tall and fits the band's length.
 * @param {{zoom: number, x: number, y: number}} view x/y: the content point at the view's top left
 */
export function streamSvg(root, layout, view, { W, H }) {
  const { zoom: z } = view;
  const sx = (cx) => (cx - view.x) * z;
  const sy = (cy) => (cy - view.y) * z;
  const { k, colW, x } = layout;
  const { bands, stubs, maxPly } = visibleBands(root, layout, z);
  const inView = (x0, x1, y0, y1) => x1 >= 0 && x0 <= W && y1 >= 0 && y0 <= H;
  let defs = '<linearGradient id="ostream-fade-g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    + '<mask id="ostream-fade" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#ostream-fade-g)"/></mask>';
  let grid = '';
  for (let p = 1; p <= Math.max(maxPly, layout.cols0); p++) {
    const gx = sx(x(p));
    if (gx < 0 || gx > W) continue;
    grid += `<line x1="${f(gx)}" x2="${f(gx)}" y1="0" y2="${H - 18}" stroke="var(--meta-line)" stroke-width="1"/>`
      + `<text x="${f(gx)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--meta-faint)">${Math.ceil(p / 2)}. Zug ${p % 2 ? 'Weiß' : 'Schwarz'}</text>`;
  }
  let shapes = '';
  let labels = '';
  let pathId = 0;
  for (const n of bands) {
    const h = n.n * k;
    const xa = sx(x(n.ply - 1));
    const xb = sx(x(n.ply));
    const a0 = sy(layout.srcTop.get(n));
    const b0 = sy(layout.top.get(n));
    const hs = h * z;
    if (!inView(xa, xb, Math.min(a0, b0), Math.max(a0, b0) + hs)) continue;
    const xm = (xa + xb) / 2;
    const d = `M${f(xa)},${f(a0)} C${f(xm)},${f(a0)} ${f(xm)},${f(b0)} ${f(xb)},${f(b0)} L${f(xb)},${f(b0 + hs)} C${f(xm)},${f(b0 + hs)} ${f(xm)},${f(a0 + hs)} ${f(xa)},${f(a0 + hs)} Z`;
    shapes += `<path class="ostream-band" d="${d}" fill="${scoreColor(n.score)}" stroke="var(--meta-panel)" stroke-width="0.6" data-opening="${esc(n.name ?? '')}" data-line="${esc(n.line)}"/>`;
    // The label: along the band's middle, if readable and short enough.
    const font = Math.min(MAX_FONT_PX, hs * 0.5);
    const text = n.named ? `${n.move} ${n.label}` : n.move;
    const ya = a0 + hs / 2;
    const yb = b0 + hs / 2;
    const chord = Math.hypot(xb - xa - 2 * LABEL_INSET, yb - ya);
    if (font < MIN_FONT_PX || text.length * CHAR_W * font > 0.94 * chord) continue;
    const id = `ostream-p${pathId++}`;
    const la = xa + LABEL_INSET;
    const lb = xb - LABEL_INSET;
    const lm = (la + lb) / 2;
    defs += `<path id="${id}" d="M${f(la)},${f(ya)} C${f(lm)},${f(ya)} ${f(lm)},${f(yb)} ${f(lb)},${f(yb)}"/>`;
    const body = n.named
      ? `<tspan font-weight="500" opacity=".75">${esc(n.move)}</tspan> <tspan font-weight="700">${esc(n.label)}</tspan>`
      : `<tspan font-weight="700">${esc(n.move)}</tspan>`;
    labels += `<text font-size="${f(font)}" dy="${f(font * 0.36)}" fill="#141414"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${body}</textPath></text>`;
  }
  for (const s of stubs) {
    const x0 = sx(x(s.node.ply));
    const w = STUB * colW * z;
    const y0 = sy(s.top);
    const hs = s.h * z;
    if (!inView(x0, x0 + w, y0, y0 + hs)) continue;
    shapes += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(Math.max(hs, 0.5))}" fill="${scoreColor(s.node.score)}" mask="url(#ostream-fade)"/>`;
  }
  return `<svg class="meta-svg ostream" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${grid}${shapes}<g class="ostream-labels" pointer-events="none">${labels}</g></svg>`;
}
