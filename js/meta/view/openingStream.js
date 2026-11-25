// The "Eröffnungen" tab's opening stream: one color's opening paths as bands
// flowing left to right, as thick as their game count and colored by score.
// buildStream() makes the tree (the same nodes as the tab's opening trees).

import { score } from './format.js';

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
