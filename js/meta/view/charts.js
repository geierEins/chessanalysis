// Charts shared by the Meta-Analyse tabs: pies, columns, and charts drawn at
// their box's real size (fitChart/layoutFitCharts, with optional zoom) - their
// draw functions live here until renderMetaTab clears them (clearFitCharts).

import { esc, pc, score, DAY_MS } from './format.js';
import { gamesCount } from './gameLists.js';

/** Wins, draws and losses as a pie like "Zeit & Partieende"'s, each count opening its games. */
export function resultPie(rs) {
  const slices = [['W', 'var(--meta-win)', 'Siege'], ['D', 'var(--meta-draw)', 'Remis'], ['L', 'var(--meta-loss)', 'Niederlagen']]
    .map(([k, color, label]) => ({ label, color, games: rs.filter((r) => r.result === k) }))
    .filter((s) => s.games.length)
    .map((s) => ({ ...s, v: s.games.length }));
  return pie(slices, { total: rs, center: { value: pc(score(rs)), label: 'Punkte-Quote' } });
}

/** The i-th of n shades of one base color for a pie's slices, dark to light:
 *  from 50 % black mixed in, through the base, to 35 % white. */
export function shade(base, i, n) {
  const t = n > 1 ? 1 - i / (n - 1) : 0.5;
  if (t === 0.5) return base;
  return t < 0.5
    ? `color-mix(in srgb, ${base} ${Math.round(100 - (0.5 - t) * 70)}%, white)`
    : `color-mix(in srgb, ${base} ${Math.round(100 - (t - 0.5) * 100)}%, black)`;
}

/** Pie chart with a legend. slices: {label, v, color} - largest first. */
// total: true shows the sum under the legend, a list of games makes it clickable.
// center: {value, label} turns it into a ring with that text in its free middle.
export function pie(slices, { total = false, center = null } = {}) {
  const n = slices.reduce((a, s) => a + s.v, 0);
  const R = 60;
  const C = 65;
  const point = (f) => [C + R * Math.sin(2 * Math.PI * f), C - R * Math.cos(2 * Math.PI * f)];
  let from = 0;
  let paths = '';
  for (const s of slices) {
    const tip = `data-tip="${esc(`${s.label}: ${s.v} (${pc(s.v / n)})`)}"`;
    if (s.v === n) {
      paths += `<circle cx="${C}" cy="${C}" r="${R}" style="fill:${s.color}" ${tip}></circle>`;
      break;
    }
    const to = from + s.v / n;
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    paths += `<path d="M${C} ${C}L${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z" style="fill:${s.color}" ${tip}></path>`;
    from = to;
  }
  const legend = slices
    .map((s) => `<div><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${s.games ? gamesCount(s.games) : s.v} · ${pc(s.v / n)}</b></div>`)
    .join('');
  // The ring: the panel color over the pie's middle (covering the slice edges there too).
  const hole = center
    ? `<circle cx="${C}" cy="${C}" r="${R - 17}" class="meta-pie-hole"></circle><text x="${C}" y="${C + 3}" text-anchor="middle" class="meta-donut-big">${center.value}</text><text x="${C}" y="${C + 19}" text-anchor="middle">${center.label}</text>`
    : '';
  return `<div class="meta-donut meta-pie${center ? ' meta-pie-ring' : ''}"><svg viewBox="0 0 130 130" role="img">${paths}${hole}</svg><div class="meta-donut-legend">${legend}${total ? `<div class="meta-total"><span>Gesamt:</span><span>${Array.isArray(total) ? gamesCount(total) : n}</span></div>` : ''}</div></div>`;
}

/** Vertical bars on one shared scale. bins: {label, v, tip?, color?}
 *  W/H: the drawing size - fitChart() passes the box's real pixel size. */
export function columns(bins, { color = 'var(--meta-s1)', H = 170, W = 640 } = {}) {
  const P = { l: 34, r: 8, t: 8, b: 22 };
  const m = Math.max(1, ...bins.map((b) => b.v));
  // At most one grid line per ~22 px, so a low chart doesn't get crowded.
  const lines = Math.max(2, Math.floor((H - P.t - P.b) / 22));
  const step = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].find((x) => m / x <= lines) ?? 2500;
  const top = Math.ceil(m / step) * step;
  const bw = (W - P.l - P.r) / bins.length;
  // Every 2nd/3rd label only, where they would run into each other (tooltips still name every column).
  const labelEvery = Math.max(1, Math.ceil(36 / bw));
  const Y = (v) => H - P.b - (v / top) * (H - P.t - P.b);
  let s = '';
  for (let v = 0; v <= top; v += step) {
    s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  bins.forEach((b, i) => {
    const x = P.l + i * bw + 1;
    const h = Y(0) - Y(b.v);
    if (b.v > 0) {
      const r = Math.min(3, h);
      s += `<path d="M${x},${Y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${b.color ?? color}"/>`;
    }
    s += `<rect x="${x - 1}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-tip="${esc(b.tip ?? `${b.label}: ${b.v}`)}"/>`;
    if (i % labelEvery === 0) s += `<text x="${x + bw / 2 - 1}" y="${H - 6}" text-anchor="middle">${b.label}</text>`;
  });
  s += `<line class="meta-axis" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  return `<svg class="meta-svg meta-cols" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

// Charts drawn at their box's real pixel size instead of a fixed viewBox
// scaled into it - for cards whose height comes from their neighbors
// (.meta-stack.fit), where scaling would shrink text and bars alike.
// renderMetaTab() puts placeholders into the HTML; layoutFitCharts() draws
// them once the HTML is in the page, and again whenever the size changes.
const fitDraws = new Map();
// Zoomable charts: id -> {key, min, max, minSpan, l, r, from, to} (from/to: the visible x range).
const fitZooms = new Map();
// Charts with their own mouse handling: id -> bind(box, redraw), see fitChart's bind.
const fitBinds = new Map();
// The last zoom per chart key, so a re-render with the same points keeps it.
const zoomMemory = new Map();
let fitSeq = 0;

/** renderMetaTab: the previous render's charts are about to be replaced. */
export function clearFitCharts() {
  fitDraws.clear();
  fitBinds.clear();
}

/** Leaving a tab: its charts start unzoomed the next time. */
export function resetZooms() {
  zoomMemory.clear();
}

/**
 * @param {(W: number, H: number, view?: {from: number, to: number}) => string} draw returns the chart's SVG
 * @param {{height?: number, zoom?: {key: string, min: number, max: number, minSpan: number, l: number, r: number}}} [opts]
 *   height: a fixed height in px instead of the usual proportions.
 *   zoom: makes the x axis zoomable (drag a range, Ctrl + wheel, double-click resets);
 *   min/max: the full x range, minSpan: the narrowest zoom, l/r: the plot's left/right
 *   padding in px. draw then gets the visible range as its third argument.
 * @param {(box: HTMLElement, redraw: () => void) => void} [opts.bind] wires the box's own
 *   mouse handling, once per rendered box before its first drawing; redraw draws it again.
 */
export function fitChart(draw, { height, zoom, bind } = {}) {
  const id = `fit${++fitSeq}`;
  fitDraws.set(id, draw);
  if (bind) fitBinds.set(id, bind);
  const style = height ? ` style="aspect-ratio:auto;height:${height}px"` : '';
  const box = `<div class="meta-fit" data-fit="${id}"${style}></div>`;
  if (!zoom) return box;
  const prev = zoomMemory.get(zoom.key);
  const view = prev?.min === zoom.min && prev?.max === zoom.max ? prev : { from: zoom.min, to: zoom.max };
  fitZooms.set(id, { ...zoom, from: view.from, to: view.to });
  const zoomed = view.from > zoom.min || view.to < zoom.max;
  return `<div class="meta-zoom">${box}<div class="meta-zoom-sel hidden"></div>`
    + `<button type="button" class="meta-zoom-reset${zoomed ? '' : ' hidden'}">Zoom zurücksetzen</button></div>`;
}

/** Wires a zoomable chart's mouse handling, once per rendered box. */
function bindZoom(box, z) {
  const wrap = box.parentElement;
  const sel = wrap.querySelector('.meta-zoom-sel');
  const reset = wrap.querySelector('.meta-zoom-reset');
  // The reset button sits at the right end of the card's title row, not over the chart.
  box.closest('.meta-card')?.querySelector(':scope > .meta-card-head')?.append(reset);
  const xOf = (e) => e.clientX - box.getBoundingClientRect().left;
  const indexAt = (px) => {
    const x0 = z.l;
    const x1 = box.clientWidth - z.r;
    const t = Math.max(0, Math.min(1, (px - x0) / Math.max(1, x1 - x0)));
    return z.from + t * (z.to - z.from);
  };
  const apply = (from, to) => {
    const span = Math.min(z.max - z.min, z.minSpan);
    if (to - from < span) {
      const c = (from + to) / 2;
      [from, to] = [c - span / 2, c + span / 2];
    }
    if (from < z.min) [from, to] = [z.min, to + (z.min - from)];
    if (to > z.max) [from, to] = [Math.max(z.min, from - (to - z.max)), z.max];
    Object.assign(z, { from, to });
    zoomMemory.set(z.key, { min: z.min, max: z.max, from, to });
    reset.classList.toggle('hidden', from <= z.min && to >= z.max);
    delete box.dataset.size;
    layoutFitCharts(wrap);
  };
  let start = null;
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = xOf(e);
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (start == null) return;
    const x = Math.max(z.l, Math.min(box.clientWidth - z.r, xOf(e)));
    const a = Math.max(z.l, Math.min(start, x));
    sel.style.left = `${a}px`;
    sel.style.width = `${Math.abs(x - Math.max(z.l, start))}px`;
    sel.classList.remove('hidden');
  });
  const end = (e) => {
    if (start == null) return;
    const x = xOf(e);
    const [a, b] = [Math.min(start, x), Math.max(start, x)];
    start = null;
    sel.classList.add('hidden');
    if (b - a > 6) apply(indexAt(a), indexAt(b));
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', () => { start = null; sel.classList.add('hidden'); });
  box.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // a plain wheel keeps scrolling the page
    e.preventDefault();
    const c = indexAt(xOf(e));
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    apply(c - (c - z.from) * f, c + (z.to - c) * f);
  }, { passive: false });
  box.addEventListener('dblclick', () => apply(z.min, z.max));
  reset.addEventListener('click', () => apply(z.min, z.max));
}

/** Draws every fitChart() placeholder in root at its current size. */
export function layoutFitCharts(root) {
  for (const box of root.querySelectorAll('[data-fit]')) {
    const draw = fitDraws.get(box.dataset.fit);
    if (!draw) continue;
    const z = fitZooms.get(box.dataset.fit);
    if (z && !box.dataset.zoomBound) {
      box.dataset.zoomBound = '1';
      bindZoom(box, z);
    }
    const bind = fitBinds.get(box.dataset.fit);
    if (bind && !box.dataset.bound) {
      box.dataset.bound = '1';
      bind(box, () => {
        delete box.dataset.size;
        layoutFitCharts(box.parentElement);
      });
    }
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = Math.max(90, Math.floor(box.clientHeight));
    if (box.dataset.size === `${W}x${H}`) continue;
    box.dataset.size = `${W}x${H}`;
    box.innerHTML = z ? draw(W, H, { from: z.from, to: z.to }) : draw(W, H);
  }
}

export const ZOOM_NOTE = 'Zoomen: Bereich mit der Maus aufziehen oder Strg + Mausrad; Doppelklick setzt zurück.';

/** Date labels for a time axis from..to (ms), about gap px apart over width px:
 *  every day for up to two weeks, Mondays up to two months, else each month's 1st
 *  (the year on January). @returns {{t: number, label: string}[]} */
export function timeTicks(from, to, width, gap) {
  const span = (to - from) / DAY_MS;
  const unit = span <= 14 ? 'day' : span <= 62 ? 'week' : 'month';
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  if (unit === 'month') d.setDate(1);
  const out = [];
  // setDate/setMonth steps keep local midnight across daylight-saving changes.
  for (; +d <= to; unit === 'month' ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1)) {
    if (+d < from || (unit === 'week' && d.getDay() !== 1)) continue;
    const label = unit === 'month'
      ? (d.getMonth() === 0 ? String(d.getFullYear()) : d.toLocaleDateString('de-DE', { month: 'short' }))
      : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    out.push({ t: +d, label });
  }
  const every = Math.max(1, Math.ceil(out.length / Math.max(2, Math.floor(width / gap))));
  return out.filter((_, i) => i % every === 0);
}

export const FILES = 'abcdefgh';

/** Heat for a share t (0..1) of the busiest square, in the mode's color like
 *  the mode switch: light to dark blue for "taken", light to dark red for "lost". */
export function heatColor(t, mode) {
  const [h0, h1] = mode === 'lost' ? [12, 0] : [200, 222];
  return `hsl(${Math.round(h0 + (h1 - h0) * t)} 85% ${Math.round(72 - 34 * t)}% / ${(0.35 + 0.6 * t).toFixed(2)})`;
}
