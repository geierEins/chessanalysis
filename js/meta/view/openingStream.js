// The "Eröffnungen" tab's opening stream: one color's opening paths as bands
// flowing left to right, as thick as their game count and colored by score.
// buildStream() makes the tree (the same nodes as the tab's opening trees).

import { score, esc } from './format.js';
import { fitChart } from './charts.js';

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
  // "1. Zug Weiß" - or "1." / "1…" when the columns are too narrow for it (phones).
  const plyLabel = (p) => (colW * z < 72 ? `${Math.ceil(p / 2)}${p % 2 ? '.' : '…'}` : `${Math.ceil(p / 2)}. Zug ${p % 2 ? 'Weiß' : 'Schwarz'}`);
  let grid = '';
  for (let p = 1; p <= Math.max(maxPly, layout.cols0); p++) {
    const gx = sx(x(p));
    if (gx < 0 || gx > W) continue;
    grid += `<line x1="${f(gx)}" x2="${f(gx)}" y1="0" y2="${H - 18}" stroke="var(--meta-line)" stroke-width="1"/>`
      + `<text x="${f(gx)}" y="${H - 6}" text-anchor="middle">${plyLabel(p)}</text>`;
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
    // The label: along the band's middle, if readable and short enough -
    // move and name, or just the move when the name doesn't fit.
    const font = Math.min(MAX_FONT_PX, hs * 0.5);
    const ya = a0 + hs / 2;
    const yb = b0 + hs / 2;
    const chord = Math.hypot(xb - xa - 2 * LABEL_INSET, yb - ya);
    const fits = (text) => text.length * CHAR_W * font <= 0.94 * chord;
    if (font < MIN_FONT_PX || !fits(n.move)) continue;
    const withName = n.named && fits(`${n.move} ${n.label}`);
    const id = `ostream-p${pathId++}`;
    const la = xa + LABEL_INSET;
    const lb = xb - LABEL_INSET;
    const lm = (la + lb) / 2;
    defs += `<path id="${id}" d="M${f(la)},${f(ya)} C${f(lm)},${f(ya)} ${f(lm)},${f(yb)} ${f(lb)},${f(yb)}"/>`;
    const body = withName
      ?`<tspan font-weight="500" opacity=".75">${esc(n.move)}</tspan> <tspan font-weight="700">${esc(n.label)}</tspan>`
      : `<tspan font-weight="700">${esc(n.move)}</tspan>`;
    // Inline style: #meta-panel svg text (css/styles.css) would beat attributes.
    labels += `<text style="font-size:${f(font)}px;fill:#141414" dy="${f(font * 0.36)}"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${body}</textPath></text>`;
  }
  for (const s of stubs) {
    const x0 = sx(x(s.node.ply));
    const w = STUB * colW * z;
    const y0 = sy(s.top);
    const hs = s.h * z;
    if (!inView(x0, x0 + w, y0, y0 + hs)) continue;
    shapes += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(Math.max(hs, 0.5))}" fill="${scoreColor(s.node.score)}" mask="url(#ostream-fade)"/>`;
  }
  return `<svg class="meta-svg ostream" viewBox="0 0 ${W} ${H}" role="img" aria-label="Eröffnungsstrom"><defs>${defs}</defs>${grid}${shapes}<g class="ostream-labels" pointer-events="none">${labels}</g></svg>`;
}

// The view per color ({zoom, x, y}, see streamSvg) - kept across re-renders of
// the tab, reset when it is left (resetStreamViews).
const streamViews = new Map();
const START = { zoom: 1, x: 0, y: 0 };

/** Leaving the tab: both colors start unzoomed the next time. */
export function resetStreamViews() {
  streamViews.clear();
}

/** A view kept inside the stream: zoom 1..MAX_ZOOM, no panning past its drawn end or edges. */
function clampView(v, root, layout, { W, H }) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const { maxPly } = visibleBands(root, layout, zoom);
  const contentW = layout.x(maxPly) + STUB * layout.colW + PAD_X;
  const x = Math.min(Math.max(0, contentW - W / zoom), Math.max(0, v.x));
  const y = Math.min(H - H / zoom, Math.max(0, v.y));
  return { zoom, x, y };
}

/**
 * The card body for one color's games: the stream drawn at its box's pixel
 * size (fitChart), zoomed with Ctrl + wheel or two fingers, panned by
 * dragging (on touch only while zoomed), reset by double-click or the
 * "Zoom zurücksetzen" button (moved into the card's title row).
 */
export function streamCard(records, color) {
  const root = buildStream(records);
  if (!root.n) return '<p class="meta-muted">Keine Partien mit dieser Farbe.</p>';
  let layout = null;
  let size = null;
  const view = () => streamViews.get(color) ?? START;
  const draw = (W, H) => {
    if (size?.W !== W || size?.H !== H) {
      size = { W, H };
      layout = layoutStream(root, size);
    }
    const v = clampView(view(), root, layout, size);
    streamViews.set(color, v);
    return streamSvg(root, layout, v, size);
  };
  const bind = (box, redraw) => {
    const wrap = box.parentElement;
    const reset = wrap.querySelector('.meta-zoom-reset');
    const head = box.closest('.meta-card')?.querySelector(':scope > .meta-card-head');
    const tools = head?.querySelector('.meta-card-tools');
    if (tools) tools.prepend(reset);
    else head?.append(reset);
    const sync = () => {
      const zoomed = view().zoom > 1;
      reset.classList.toggle('hidden', !zoomed);
      wrap.classList.toggle('zoomed', zoomed);
    };
    let frame = 0;
    const set = (v) => {
      streamViews.set(color, v);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        redraw();
        sync();
      });
    };
    // Zooms by factor around the box point (px, py): the content under it stays put.
    const zoomAround = (base, factor, px, py, to = { px, py }) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, base.zoom * factor));
      set({ zoom, x: base.x + px / base.zoom - to.px / zoom, y: base.y + py / base.zoom - to.py / zoom });
    };
    const local = (e) => {
      const r = box.getBoundingClientRect();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };
    box.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return; // a plain wheel keeps scrolling the page
      e.preventDefault();
      const { px, py } = local(e);
      zoomAround(view(), Math.exp(-e.deltaY * 0.0015), px, py);
    }, { passive: false });
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    const startDrag = () => {
      const [p] = pointers.values();
      drag = p ? { ...p, view: view() } : null;
    };
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, local(e));
      // Touch: one finger scrolls the page until the stream is zoomed.
      if (e.pointerType !== 'mouse' && pointers.size === 1 && view().zoom <= 1) return;
      box.setPointerCapture(e.pointerId);
      wrap.classList.add('drag');
      if (pointers.size === 2) {
        const [a, b] = pointers.values();
        pinch = { dist: Math.hypot(a.px - b.px, a.py - b.py), mid: { px: (a.px + b.px) / 2, py: (a.py + b.py) / 2 }, view: view() };
        drag = null;
      } else startDrag();
    });
    box.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, local(e));
      if (pinch && pointers.size === 2) {
        const [a, b] = pointers.values();
        const dist = Math.hypot(a.px - b.px, a.py - b.py);
        zoomAround(pinch.view, dist / Math.max(1, pinch.dist), pinch.mid.px, pinch.mid.py, { px: (a.px + b.px) / 2, py: (a.py + b.py) / 2 });
      } else if (drag) {
        const p = pointers.get(e.pointerId);
        set({ ...drag.view, x: drag.view.x - (p.px - drag.px) / drag.view.zoom, y: drag.view.y - (p.py - drag.py) / drag.view.zoom });
      }
    });
    const end = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) startDrag();
      if (!pointers.size) {
        drag = null;
        wrap.classList.remove('drag');
      }
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('dblclick', () => set(START));
    reset.addEventListener('click', () => set(START));
    sync();
  };
  const zoomed = view().zoom > 1;
  return `<div class="meta-ostream${zoomed ? ' zoomed' : ''}">${fitChart(draw, { bind })}<button type="button" class="meta-zoom-reset${zoomed ? '' : ' hidden'}">Zoom zurücksetzen</button></div>`;
}
