// Renders the Meta-Analyse tabs as HTML strings from already-filtered
// per-game records (metaRecords.js). Pure presentation: no state, no I/O -
// js/meta/metaController.js owns the data and calls renderMetaTab() again on
// every filter or tab change. Charts are small hand-drawn SVG/HTML (no
// Chart.js) so a re-render is just one innerHTML swap.

import { timeClassStyle } from '../timeClassStyle.js';
import { flagHtml, countryName } from '../ui/playerLabel.js';
import { TERMINATION_LABEL, PIECE_LABEL, OPENING_LAST_MOVE, mateInOne, isCoachGame } from './metaRecords.js';
import { CATEGORIES, CATEGORY_ORDER } from '../analysis/categories.js';
import { pieceUrl } from './openingBoard.js';

export const META_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'openings', label: 'Eröffnungen' },
  { id: 'opponents', label: 'Gegner & Länder' },
  { id: 'quality', label: 'Spielqualität' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'time', label: 'Zeit & Partieende' },
  { id: 'games', label: 'Partien' },
];

const TC_ORDER = ['bullet', 'blitz', 'rapid', 'daily'];
const TC_LABEL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily' };
const RES_LETTER = { W: 'S', D: 'R', L: 'N' };
const RES_CIRCLE = { W: '🟢', D: '⚪', L: '🔴' }; // same as the game picker's (js/main.js's OUTCOME_CIRCLE)
const RES_WORD ={ W: 'Sieg', D: 'Remis', L: 'Niederlage' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const HEAT_RAMP = ['#1d2a3d', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];

// ---------- small helpers ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pts = (r) => (r.result === 'W' ? 1 : r.result === 'D' ? 0.5 : 0);
const score = (rs) => (rs.length ? rs.reduce((a, r) => a + pts(r), 0) / rs.length : null);
const wdl = (rs) => {
  const c = { W: 0, D: 0, L: 0 };
  for (const r of rs) c[r.result]++;
  return c;
};
const avg = (rs, f) => {
  const v = rs.map(f).filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pc = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const f1 = (x) => (x == null ? '–' : x.toFixed(1).replace('.', ','));
const f0 = (x) => (x == null ? '–' : String(Math.round(x)));
const groupBy = (rs, f) => {
  const m = new Map();
  for (const r of rs) {
    const k = f(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
const byCountDesc = (a, b) => b[1].length - a[1].length;
const fmtDate = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const flag = (code) => (code ? flagHtml(code).trim() : '');

function wdlBar(rs) {
  const c = wdl(rs);
  const n = rs.length || 1;
  const seg = (k, cls, label) =>
    c[k] ? `<span class="${cls}" style="width:${(c[k] / n) * 100}%" data-tip="${label}: ${c[k]} (${pc(c[k] / n)})"></span>` : '';
  return `<div class="meta-wdl">${seg('W', 'w', 'Siege')}${seg('D', 'd', 'Remis')}${seg('L', 'l', 'Niederlagen')}</div>`;
}

const WDL_LEGEND = `<div class="meta-legend"><span><i style="background:var(--meta-win)"></i>Sieg</span><span><i style="background:var(--meta-draw)"></i>Remis</span><span><i style="background:var(--meta-loss)"></i>Niederlage</span></div>`;

/** Horizontal bars. rows: {label, labelHtml?, v, tip?, color?} */
function hbars(rows, { color = 'var(--meta-s1)', fmt = (v) => v, max } = {}) {
  if (!rows.length) return '<p class="meta-muted">Keine Daten.</p>';
  const m = max ?? Math.max(1, ...rows.map((r) => r.v));
  return `<div class="meta-rows">${rows
    .map(
      (r) => `<div class="meta-hrow"><span class="meta-lab" title="${esc(r.label)}">${r.labelHtml ?? esc(r.label)}</span>`
        + `<div class="meta-hbar"><i style="width:${(r.v / m) * 100}%;background:${r.color ?? color}" data-tip="${esc(r.tip ?? `${r.label}: ${fmt(r.v)}`)}"></i></div>`
        + `<span class="meta-val">${fmt(r.v)}</span></div>`
    )
    .join('')}</div>`;
}

// Icon in front of each card title: a piece from the user's piece theme
// (string starting with "piece:") or an emoji. Titles with a dynamic part
// (opponent name, game count) match by prefix.
const CARD_ICONS = {
  'Noch keine Engine-Werte': '⚙️',
  'Übersicht': '🧾',
  'Sieg, Remis, Niederlage': '📊',
  'Nach Farbe und Spielart': '🎨',
  'Wertungsverlauf': '📈',
  'Eröffnungen': '📖',
  'Mit Weiß': 'piece:wP',
  'Mit Schwarz': 'piece:bP',
  'Erster Zug als Weiß': 'piece:wN',
  'Als Schwarz gegen …': 'piece:bN',
  'Stärkste und schwächste': '🏅',
  'Gegner': '👥',
  'Direktvergleich': '⚔️',
  'Woher kommen deine Gegner?': '🌍',
  'Quote nach Land': '🗺️',
  'Häufigste Gegner': '🔁',
  'Gegen Stärkere und Schwächere': '💪',
  'Spielqualität': '🎯',
  'Schlag-Heatmap': '🔥',
  'Zusammenfassung': '🧮',
  'Die heißesten Felder': '📍',
  'Welche Figuren du verlierst': '💀',
  'Womit du schlägst': '⚔️',
  'Verteilung der Genauigkeit': '📶',
  'Genauigkeit nach Phase': '🧭',
  'Verwertung': '🏁',
  'Wann passieren deine Patzer?': '💥',
  'Zeit': '⏱️',
  'Wie du gewinnst': '🏆',
  'Wie du verlierst': '💔',
  'Wie Remis entstehen': '🤝',
  'Uhr': '⏰',
  'Zeit pro Zug': '⏱️',
  'Längste Partien': '📏',
  'Kürzeste Partien': '⚡',
  'Längste Königsreisen': '👑',
  'Dauer der Partien': '⌛',
  'Quote nach Partielänge': '📏',
  'Wann du spielst': '📅',
  'Quote nach Tageszeit': '🕒',
  'Serien und Tilt': '🔥',
  'Partien': '📋',
};

function cardIcon(title) {
  const icon = CARD_ICONS[title] ?? Object.entries(CARD_ICONS).find(([k]) => title.startsWith(`${k} `))?.[1];
  if (!icon) return '';
  return icon.startsWith('piece:')
    ? `<img class="meta-card-icon" src="${pieceUrl(icon.slice(6))}" alt="">`
    : `<span class="meta-card-icon" aria-hidden="true">${icon}</span>`;
}

/** head: extra controls right of the title, before the badge (e.g. limitPicker). */
/** accent: optional color for the same colored top edge and glow as a stat tile (kpi()). */
function card(title, src, body, { cls = 'w6', note = '', head = '', accent = '' } = {}) {
  const badge = src ? `<span class="meta-src ${src}">${src === 'fast' ? 'ohne Engine' : 'Engine'}</span>` : '';
  const right = head ? `<span class="meta-card-tools">${head}${badge}</span>` : badge;
  const attrs = accent ? `class="meta-card ${cls} accent" style="--kpi-accent:${accent}"` : `class="meta-card ${cls}"`;
  return `<section ${attrs}><div class="meta-card-head"><h2>${cardIcon(title)}${title}</h2>${right}</div>${body}${
    note ? `<p class="meta-note">${note}</p>` : ''
  }</section>`;
}

const EMPTY = '<p class="meta-muted">Keine Partien für diese Filter.</p>';

/** A stat tile. accent: its color (top edge and a soft glow), any CSS color. */
function kpi(label, value, detail = '', cls = '', accent = '') {
  const style = accent ? ` style="--kpi-accent:${accent}"` : '';
  return `<div class="meta-kpi"${style}><span class="l">${label}</span><span class="v ${cls}">${value}</span><span class="d">${detail}</span></div>`;
}

// Tile accents for stats in your favor / against you.
const GOOD = 'var(--meta-win)';
const BAD = 'var(--meta-loss)';

/** How many games the list behind a count shows at first, and adds per "more" click. */
export const LISTED_GAMES_STEP = 10;

// The games behind each count of the current render, by the id in its data-games.
const gameLists = new Map();

/** @returns {object[]} the games behind a count's data-games id (empty once re-rendered) */
export function gameListById(id) {
  return gameLists.get(id) ?? [];
}

/** A count that opens the list of its games on click (metaController's
 *  #meta-games-pop), newest first, LISTED_GAMES_STEP at a time. `text`
 *  replaces the count as the shown value (e.g. "+9" for a record game). */
function gamesCount(list, text = list.length) {
  if (!list.length) return text === list.length ? '0' : '–';
  const id = String(gameLists.size + 1);
  gameLists.set(id, list);
  return `<button type="button" class="meta-count" data-games="${id}" title="Partien anzeigen">${text}</button>`;
}

/** The games with the most extreme value of `key` (all of them on a tie), e.g. the biggest lead that was still lost. */
function recordGames(list, key, pickMax) {
  if (!list.length) return { games: [], value: null };
  const value = pickMax ? Math.max(...list.map((r) => r[key])) : Math.min(...list.map((r) => r[key]));
  return { games: list.filter((r) => r[key] === value), value };
}

const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

/** The floating game list behind gamesCount() - styled like the game picker:
 *  the first `shown` games of `list` in a scroll box, plus a "more" button
 *  while some are left. */
export function gameListHtml(list, shown) {
  const items = list.slice(0, shown).map((r) => {
    const style = timeClassStyle(r.timeClass);
    const elo = r.oppRating ? ` (${r.oppRating})` : '';
    return `<button type="button" class="custom-select-option" role="menuitem" data-game="${esc(r.url)}" style="color:${style.color}">${style.emoji} vs ${esc(r.opponent)}${elo} — ${esc(r.summary.dateLabel)} — ${r.moves} Zg. ${RES_CIRCLE[r.result]}</button>`;
  });
  const n = Math.min(shown, list.length);
  const left = list.length - n;
  const head = list.length > LISTED_GAMES_STEP ? `<p class="meta-pop-head">${n} von ${list.length}</p>` : '';
  const more = left > 0 ? `<button type="button" class="meta-pop-more" data-more>+ ${Math.min(LISTED_GAMES_STEP, left)} weitere (noch ${left})</button>` : '';
  return `${head}<div class="meta-pop-list">${items.join('')}</div>${more}`;
}

/** items: [value, label, color?, tip?]; cls: extra class, e.g. 'two' for a fixed 2-column grid. */
function bigStats(items, cls = '') {
  return `<div class="meta-big${cls ? ` ${cls}` : ''}">${items
    .map(([v, l, color, tip]) => `<div${tip ? ` data-tip="${esc(tip)}"` : ''}><b${color ? ` style="color:${color}"` : ''}>${v}</b><span>${l}</span></div>`)
    .join('')}</div>`;
}

function donut(rs) {
  const c = wdl(rs);
  const n = rs.length || 1;
  const R = 58;
  const C = 2 * Math.PI * R;
  let off = 0;
  let arcs = '';
  for (const [k, col, label] of [['W', 'var(--meta-win)', 'Siege'], ['D', 'var(--meta-draw)', 'Remis'], ['L', 'var(--meta-loss)', 'Niederlagen']]) {
    const len = (c[k] / n) * C;
    if (!len) continue;
    arcs += `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${col}" stroke-width="20" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)" data-tip="${label}: ${c[k]} (${pc(c[k] / n)})"></circle>`;
    off += len;
  }
  return `<div class="meta-donut"><svg viewBox="0 0 150 150" role="img" aria-label="Sieg-Remis-Niederlage-Verteilung">${arcs}
      <text x="75" y="72" text-anchor="middle" class="meta-donut-big">${pc(score(rs))}</text>
      <text x="75" y="92" text-anchor="middle">Punkte-Quote</text></svg>
    <div class="meta-donut-legend">
      <div><i style="background:var(--meta-win)"></i><span>Siege</span><b>${c.W}</b></div>
      <div><i style="background:var(--meta-draw)"></i><span>Remis</span><b>${c.D}</b></div>
      <div><i style="background:var(--meta-loss)"></i><span>Niederlagen</span><b>${c.L}</b></div>
    </div></div>`;
}

/** The i-th of n shades of one base color for a pie's slices, dark to light:
 *  from 50 % black mixed in, through the base, to 35 % white. */
function shade(base, i, n) {
  const t = n > 1 ? 1 - i / (n - 1) : 0.5;
  if (t === 0.5) return base;
  return t < 0.5
    ? `color-mix(in srgb, ${base} ${Math.round(100 - (0.5 - t) * 70)}%, white)`
    : `color-mix(in srgb, ${base} ${Math.round(100 - (t - 0.5) * 100)}%, black)`;
}

/** Pie chart with a legend. slices: {label, v, color} - largest first. */
// total: true shows the sum under the legend, a list of games makes it clickable.
function pie(slices, { total = false } = {}) {
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
  return `<div class="meta-donut meta-pie"><svg viewBox="0 0 130 130" role="img">${paths}</svg><div class="meta-donut-legend">${legend}${total ? `<div class="meta-total"><span>Gesamt:</span><span>${Array.isArray(total) ? gamesCount(total) : n}</span></div>` : ''}</div></div>`;
}

/** Vertical bars on one shared scale. bins: {label, v, tip?, color?}
 *  W/H: the drawing size - fitChart() passes the box's real pixel size. */
function columns(bins, { color = 'var(--meta-s1)', H = 170, W = 640 } = {}) {
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
  return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

// Charts drawn at their box's real pixel size instead of a fixed viewBox
// scaled into it - for cards whose height comes from their neighbors
// (.meta-stack.fit), where scaling would shrink text and bars alike.
// renderMetaTab() puts placeholders into the HTML; layoutFitCharts() draws
// them once the HTML is in the page, and again whenever the size changes.
const fitDraws = new Map();
let fitSeq = 0;

/**
 * @param {(W: number, H: number) => string} draw returns the chart's SVG
 * @param {{height?: number}} [opts] height: a fixed height in px instead of the usual proportions
 */
function fitChart(draw, { height } = {}) {
  const id = `fit${++fitSeq}`;
  fitDraws.set(id, draw);
  const style = height ? ` style="aspect-ratio:auto;height:${height}px"` : '';
  return `<div class="meta-fit" data-fit="${id}"${style}></div>`;
}

/** Draws every fitChart() placeholder in root at its current size. */
export function layoutFitCharts(root) {
  for (const box of root.querySelectorAll('[data-fit]')) {
    const draw = fitDraws.get(box.dataset.fit);
    if (!draw) continue;
    const W = Math.max(240, Math.floor(box.clientWidth));
    const H = Math.max(90, Math.floor(box.clientHeight));
    if (box.dataset.size === `${W}x${H}`) continue;
    box.dataset.size = `${W}x${H}`;
    box.innerHTML = draw(W, H);
  }
}

const MOVE_TIME_MOVES = 50;
const MOVE_TIME_MIN_GAMES = 3; // fewer games at a move number make the line jump around

/** "1:05" / "0:08" for an axis or tooltip; whole seconds, minutes unpadded. */
function fmtSeconds(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const DURATION_MINUTES = 20;

/** Games per minute of duration, 0–1 to 19–20; anything longer gets one
 *  extra "20+" column, only when there is such a game. */
function durationColumns(timed) {
  if (!timed.length) return '<p class="meta-muted">Keine Partien mit Uhrzeiten.</p>';
  const counts = Array(DURATION_MINUTES + 1).fill(0);
  for (const r of timed) counts[Math.min(DURATION_MINUTES, Math.floor(r.duration / 60))]++;
  const games = (n) => `${n} ${n === 1 ? 'Partie' : 'Partien'}`;
  const bins = counts.slice(0, DURATION_MINUTES).map((n, m) => ({ label: `${m}–${m + 1}`, v: n, tip: `${m}–${m + 1} Min.: ${games(n)}` }));
  const longer = counts[DURATION_MINUTES];
  if (longer) bins.push({ label: `${DURATION_MINUTES}+`, v: longer, tip: `ab ${DURATION_MINUTES} Min.: ${games(longer)}` });
  return `<p class="meta-muted small">Dauer in Minuten</p>${fitChart((W, H) => columns(bins, { W, H }))}`;
}

/** Average time spent on own move 1-50, one line per time class (Daily has no clock). */
function moveTimeChart(rs) {
  const series = ['bullet', 'blitz', 'rapid']
    .map((tc) => {
      const games = rs.filter((r) => r.timeClass === tc && r.ownMoveSeconds?.length);
      const points = [];
      for (let m = 1; m <= MOVE_TIME_MOVES; m++) {
        const xs = games.map((r) => r.ownMoveSeconds[m - 1]).filter((x) => x != null);
        if (xs.length >= MOVE_TIME_MIN_GAMES) points.push({ m, v: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length });
      }
      return { tc, points };
    })
    .filter((s) => s.points.length >= 2);
  if (!series.length) return '<p class="meta-muted">Zu wenige Partien mit Uhrzeiten.</p>';
  const top = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.v)));
  const legend = series.map(({ tc }) => `<span><i style="background:${timeClassStyle(tc).color}"></i>${TC_LABEL[tc]}</span>`).join('');
  const draw = (W, H) => {
    const P = { l: 40, r: 10, t: 10, b: 24 };
    const lines = Math.max(2, Math.floor((H - P.t - P.b) / 22));
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((x) => top / x <= lines) ?? 600;
    const y1 = Math.ceil(top / step) * step;
    const X = (m) => P.l + ((m - 1) / (MOVE_TIME_MOVES - 1)) * (W - P.l - P.r);
    const Y = (v) => H - P.b - (v / y1) * (H - P.t - P.b);
    let s = '';
    for (let v = 0; v <= y1; v += step) {
      s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtSeconds(v)}</text>`;
    }
    for (const m of [1, 10, 20, 30, 40, 50]) s += `<text x="${X(m)}" y="${H - 6}" text-anchor="middle">${m}</text>`;
    s += `<line class="meta-axis" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    for (const { tc, points } of series) {
      const col = timeClassStyle(tc).color;
      s += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${points.map((p) => `${X(p.m).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}"/>`;
      for (const p of points) {
        s += `<circle cx="${X(p.m).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="5" fill="transparent" data-tip="${TC_LABEL[tc]} · Zug ${p.m}: Ø ${fmtSeconds(p.v)} (aus ${p.n} Partien)"/>`;
      }
    }
    return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zeit pro Zug">${s}</svg>`;
  };
  return `<div class="meta-legend">${legend}</div>${fitChart(draw)}`;
}

/** Rating of a game that actually counted for it - unrated games (e.g. against
 *  Chess.com's coach bots) carry placeholder ratings that would distort every
 *  rating-based stat. Coach games never get here (metaController drops them),
 *  the check stays as a safety net. */
const hasRealRating = (r) => r.rated && !isCoachGame(r) && r.ownRating != null;

function ratingChart(rs) {
  const series = TC_ORDER.map((tc) => [tc, rs.filter((r) => r.timeClass === tc && hasRealRating(r))]).filter(([, l]) => l.length >= 2);
  if (!series.length) return '<p class="meta-muted">Zu wenige Partien mit Wertung.</p>';
  const all = series.flatMap(([, l]) => l);
  const x0 = Math.min(...all.map((r) => r.endTime));
  const x1 = Math.max(...all.map((r) => r.endTime));
  const ys = all.map((r) => r.ownRating);
  const span = Math.max(...ys) - Math.min(...ys);
  const step = span > 600 ? 200 : span > 250 ? 100 : 50;
  const y0 = Math.floor((Math.min(...ys) - 10) / step) * step;
  const y1 = Math.ceil((Math.max(...ys) + 10) / step) * step;
  const months = [];
  const d = new Date(x0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + 1);
  for (; +d <= x1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const lines = series.map(([tc, list]) => [tc, [...list].sort((a, b) => a.endTime - b.endTime)]);
  const legend = lines
    .map(([tc, sorted]) => `<span><i style="background:${timeClassStyle(tc).color}"></i>${TC_LABEL[tc]} ${sorted[0].ownRating} → ${sorted[sorted.length - 1].ownRating}</span>`)
    .join('');
  // Drawn at the box's pixel size (fitChart), so text and lines keep their size on a wide card.
  const draw = (W, H) => {
    const P = { l: 40, r: 14, t: 8, b: 22 };
    const X = (x) => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
    const Y = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
    let s = '';
    for (let y = y0; y <= y1; y += step) {
      s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${P.l - 6}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`;
    }
    // Month ticks, thinned so labels never collide (~70 px each).
    const every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor((W - P.l - P.r) / 70))));
    months.forEach((m, i) => {
      if (i % every) return;
      const label = m.getMonth() === 0 ? String(m.getFullYear()) : m.toLocaleDateString('de-DE', { month: 'short' });
      s += `<text x="${X(+m)}" y="${H - 6}" text-anchor="middle">${label}</text>`;
    });
    for (const [tc, sorted] of lines) {
      const col = timeClassStyle(tc).color;
      s += `<polyline fill="none" stroke="${col}" stroke-width="1.25" stroke-linejoin="round" points="${sorted.map((r) => `${X(r.endTime).toFixed(1)},${Y(r.ownRating).toFixed(1)}`).join(' ')}"/>`;
      for (const r of sorted) {
        s += `<circle cx="${X(r.endTime).toFixed(1)}" cy="${Y(r.ownRating).toFixed(1)}" r="5" fill="transparent" data-tip="${TC_LABEL[tc]} · ${fmtDate(r.endTime)}\nWertung ${r.ownRating} · ${RES_WORD[r.result]} gegen ${esc(r.opponent)}"/>`;
      }
      const last = sorted[sorted.length - 1];
      s += `<circle cx="${X(last.endTime)}" cy="${Y(last.ownRating)}" r="3" fill="${col}" stroke="var(--meta-panel)" stroke-width="1.5"/>`;
    }
    return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wertungsverlauf">${s}</svg>`;
  };
  return `<div class="meta-legend">${legend}</div>${fitChart(draw, { height: 180 })}`;
}

function longestStreak(rs, result) {
  let cur = 0;
  let best = 0;
  for (const r of rs) {
    cur = r.result === result ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/** A tile with the first 5 games of an already-sorted list - a row opens the game.
 *  value: the ranked number's cell content (default: the game length). */
/** The five top games as a clickable table (rank, value, result, opponent, date). */
function topGamesTable(sorted, value = (r) => `<b>${r.moves}</b> Zg.`) {
  const rows = sorted.slice(0, 5).map((r, i) => {
    const style = timeClassStyle(r.timeClass);
    return `<tr class="click" data-game="${esc(r.url)}" title="In der Spiel-Analyse öffnen"><td class="meta-rank">${i + 1}</td><td class="r">${value(r)}</td><td><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span></td><td class="meta-top-opp" style="color:${style.color}">${style.emoji} ${esc(r.opponent)}</td><td class="r meta-muted">${fmtDate(r.endTime)}</td></tr>`;
  });
  return rows.length ? `<div class="meta-tbl"><table class="meta-top">${rows.join('')}</table></div>` : '<p class="meta-muted">Keine Partien.</p>';
}

// Endings "Längste Partien" / "Kürzeste Partien" can be narrowed to (endingPicker).
const ENDING_FILTERS = [['checkmate', 'Matt'], ['timeout', 'Zeit'], ['resign', 'Aufgabe'], ['abandon', 'Abbruch']];
const ENDING_NOTE = 'Ohne Auswahl alle Partien, sonst nur die mit einem der gewählten Partieenden.';

/** A copy of rs with only the chosen endings - all of them when none is chosen. */
const byEnding = (rs, chosen) => (chosen.size ? rs.filter((r) => chosen.has(r.termination)) : [...rs]);

/** Toggle chips over a top-games card; table: which card's set (metaController's endings). */
function endingPicker(table, chosen) {
  const btns = ENDING_FILTERS.map(([key, label]) => {
    const on = chosen.has(key);
    return `<button type="button" class="${on ? 'on' : ''}" data-ending-table="${table}" data-ending="${key}" aria-pressed="${on}">${label}</button>`;
  });
  return `<span class="meta-seg" role="group" aria-label="Nach Partieende filtern">${btns.join('')}</span>`;
}

function topGamesTile(label, sorted, accent, detail = '', value) {
  return `<div class="meta-kpi list" style="--kpi-accent:${accent}"><span class="l">${label}${detail ? ` <span class="meta-faint">· ${detail}</span>` : ''}</span>${topGamesTable(sorted, value)}</div>`;
}

/** "Basis: 180 von 220 Partien" under engine cards when not every game is analyzed yet. */
function coverageNote(ctx, withEngine, total) {
  if (withEngine === total) return '';
  return `Basis: ${withEngine} von ${total} Partien mit Engine-Werten (${esc(ctx.engineLabel)}). Die Lupe analysiert die fehlenden.`;
}

function noEngineCard(ctx) {
  return card('Noch keine Engine-Werte', 'eng',
    `<p class="meta-muted">Für <b>${esc(ctx.engineLabel)}</b> ist für diese Partien noch nichts analysiert. Die Lupe oben startet die Analyse.</p>`,
    { cls: 'w12' });
}

// ---------- tabs ----------

function overview(rs, ctx) {
  if (!rs.length) return card('Übersicht', '', EMPTY, { cls: 'w12' });
  const c = wdl(rs);
  const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
  const withEngine = rs.filter((r) => ctx.engineOf(r));
  const [mainTc, mainList] = [...groupBy(chrono.filter(hasRealRating), (r) => r.timeClass)].sort(byCountDesc)[0] ?? [];
  let ratingKpi = kpi('📈 Wertung', '–', '', '', 'var(--meta-s1)');
  if (mainList?.length) {
    const delta = mainList[mainList.length - 1].ownRating - mainList[0].ownRating;
    ratingKpi = kpi(`📈 Wertung ${TC_LABEL[mainTc] ?? mainTc}`, `${delta >= 0 ? '+' : ''}${delta}`, `${mainList[0].ownRating} → ${mainList[mainList.length - 1].ownRating}`, delta >= 0 ? 'up' : 'down', delta >= 0 ? 'var(--meta-win)' : 'var(--meta-loss)');
  }
  const wdlDetail = `<span class="meta-wdl-nums"><b class="w">${c.W} S</b><b class="d">${c.D} R</b><b class="l">${c.L} N</b></span>`;
  const promoted = rs.filter((r) => r.promotions);
  const promotions = promoted.reduce((a, r) => a + r.promotions, 0);
  const kpis = `<div class="meta-kpis">
    ${kpi('♟️ Partien', rs.length, wdlDetail, '', 'var(--meta-s1)')}
    ${kpi('🎯 Punkte-Quote', pc(score(rs)), 'Sieg = 1, Remis = ½', '', '#e2b84a')}
    ${kpi('🧠 Ø Genauigkeit', f1(avg(withEngine, (r) => ctx.engineOf(r).accuracy)), withEngine.length ? `Gegner ${f1(avg(withEngine, (r) => ctx.engineOf(r).oppAccuracy))}` : 'noch keine Engine-Werte', '', '#4bc2a3')}
    ${ratingKpi}
    ${kpi('🔥 Längste Siegesserie', longestStreak(chrono, 'W'), 'Partien in Folge', '', '#f08a3c')}
    ${kpi('♛ Umgewandelte Bauern', gamesCount(promoted, promotions), `in ${promoted.length} ${promoted.length === 1 ? 'Partie' : 'Partien'}`, '', '#9b7fe0')}
  </div>`;
  const row = (label, list) =>
    list.length
      ? `<div class="meta-pair"><div class="meta-card-head small"><span>${label}</span><span class="meta-muted">${list.length} Partien · ${pc(score(list))}</span></div>${wdlBar(list)}</div>`
      : '';
  const byColor = row('<span class="meta-colordot w"></span> Mit Weiß', rs.filter((r) => r.color === 'w'))
    + row('<span class="meta-colordot b"></span> Mit Schwarz', rs.filter((r) => r.color === 'b'));
  const byTc = TC_ORDER.map((tc) => row(`${timeClassStyle(tc).emoji} ${TC_LABEL[tc]}`, rs.filter((r) => r.timeClass === tc))).join('');
  return kpis + `<div class="meta-grid">
    ${card('Sieg, Remis, Niederlage', 'fast', donut(rs), { cls: 'w4' })}
    ${card('Nach Farbe und Spielart', 'fast', `<div class="meta-rows">${byColor}${byTc}</div>${WDL_LEGEND}`, { cls: 'w8' })}
    ${card('Wertungsverlauf', 'fast', ratingChart(rs), { cls: 'w12', note: 'Jeder Punkt ist eine Partie, Wertung laut Chess.com nach der Partie. Ungewertete Partien (z. B. gegen Bots) zählen nicht.' })}
  </div>`;
}

/** A sortable column head of `table` - metaController flips ctx.sorts[table] on click. */
function sortHead(table, sort, key, label, cls) {
  const on = key === sort.key;
  const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th class="sort${cls ? ` ${cls}` : ''}${on ? ' on' : ''}" data-sort-table="${table}" data-sort="${key}" aria-sort="${aria}" title="Sortieren">${label}${on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
}

/** Rows {v, l} by v - rows without a value (e.g. no engine accuracy yet) always last, ties by game count. */
function sortRows(rows, dir) {
  return rows.sort((a, b) => (a.v == null) - (b.v == null) || (dir === 'asc' ? a.v - b.v : b.v - a.v) || b.l.length - a.l.length);
}

function openings(rs, ctx) {
  if (!rs.length) return card('Eröffnungen', '', EMPTY, { cls: 'w12' });
  const name = (r) => r.family ?? 'Ohne Eröffnungsnamen';
  const sort = ctx.sorts.openings;
  // "Ergebnis" sorts by share of wins, then of draws.
  const sortValue = {
    games: (l) => l.length,
    result: (l) => {
      const c = wdl(l);
      return (c.W + c.D / 1000) / l.length;
    },
    score: (l) => score(l),
    acc: (l) => avg(l, (r) => ctx.engineOf(r)?.accuracy),
  }[sort.key] ?? ((l) => l.length);
  const sortTh = (key, label, cls) => sortHead('openings', sort, key, label, cls);
  const table = (list) => {
    const rows = sortRows([...groupBy(list, name)].map(([fam, l]) => ({ fam, l, v: sortValue(l) })), sort.dir);
    if (!rows.length) return '<p class="meta-muted">Keine Partien mit dieser Farbe.</p>';
    return `<div class="meta-tbl"><table><thead><tr><th>Eröffnung</th>${sortTh('games', 'Partien', 'r')}${sortTh('result', 'Ergebnis', 'wide')}${sortTh('score', 'Quote', 'r')}${sortTh('acc', 'Ø Gen.', 'r')}<th class="r">Ø Theoriezüge</th></tr></thead><tbody>
      ${rows
        .map(({ fam, l }) => {
          const variants = [...new Set(l.map((r) => r.opening).filter(Boolean))];
          // Variations without the family prefix ("Scandinavian Defense: Panov Transfer" -> "Panov Transfer").
          const others = variants.filter((v) => v !== fam).map((v) => v.slice(v.indexOf(':') + 1).trim());
          const tip = l[0].family
            ? ` data-opening="${esc(fam)}"${others.length ? ` data-variants="${esc(others.slice(0, 8).join(', '))}${others.length > 8 ? ', …' : ''}"` : ''}`
            : '';
          const acc = avg(l, (r) => ctx.engineOf(r)?.accuracy);
          return `<tr><td${tip}>${esc(fam)}</td><td class="r">${gamesCount(l)}</td><td>${wdlBar(l)}</td><td class="r">${pc(score(l))}</td><td class="r">${f1(acc)}</td><td class="r">${f1(avg(l, (r) => r.bookPlies / 2))}</td></tr>`;
        })
        .join('')}
    </tbody></table></div>`;
  };
  const white = rs.filter((r) => r.color === 'w');
  const black = rs.filter((r) => r.color === 'b');
  const moveRows = (list, prefix) =>
    [...groupBy(list.filter((r) => r.firstMove), (r) => r.firstMove)]
      .sort(byCountDesc)
      .slice(0, 8)
      .map(([mv, l]) => ({ label: `${prefix}1. ${mv}`, v: l.length, tip: `${prefix}1. ${mv}: ${l.length} Partien, Quote ${pc(score(l))}` }));
  const ranked = [...groupBy(rs.filter((r) => r.family), name)]
    .filter(([, l]) => l.length >= 5)
    .map(([fam, l]) => ({ fam, s: score(l), n: l.length }))
    .sort((a, b) => b.s - a.s);
  const list = (arr) =>
    arr.length
      ? `<div class="meta-rows">${arr.map((r) => `<div class="meta-card-head small"><span data-opening="${esc(r.fam)}">${esc(r.fam)}</span><span class="meta-muted">${pc(r.s)} · ${r.n} P.</span></div>`).join('')}</div>`
      : '<p class="meta-muted">Noch keine Eröffnung mit 5 oder mehr Partien.</p>';
  return `<div class="meta-grid">
    ${card('Mit Weiß', 'fast', table(white), { cls: 'w12' })}
    ${card('Mit Schwarz', 'fast', table(black), { cls: 'w12', note: 'Namen aus dem Eröffnungsbuch der App (Lichess-ECO-Daten), gruppiert nach Eröffnung. Tooltip: Grundstellung der Eröffnung und gespielte Varianten. „Ø Theoriezüge“: wie lange die Partie im Buch blieb.' })}
    ${card('Erster Zug als Weiß', 'fast', hbars(moveRows(white, '')), { cls: 'w4' })}
    ${card('Als Schwarz gegen …', 'fast', hbars(moveRows(black, 'gegen '), { color: 'var(--meta-s2)' }), { cls: 'w4' })}
    ${card('Stärkste und schwächste', 'fast', `<h3>Beste Quote</h3>${list(ranked.slice(0, 3))}<h3>Schwächste Quote</h3>${list(ranked.length > 3 ? ranked.slice(-3).reverse() : [])}`, { cls: 'w4', note: 'Nur Eröffnungen mit mindestens 5 Partien.' })}
  </div>`;
}

const COUNTRY_LIMITS = [10, 25, 50, 0];

/** Segmented "Top 10 · 25 · 50 · Alle" switch for the country cards - metaController handles data-country-limit. */
function limitPicker(current) {
  const btns = COUNTRY_LIMITS.map((n) => {
    const on = n === current;
    return `<button type="button" class="${on ? 'on' : ''}" data-country-limit="${n}" aria-pressed="${on}" title="${n ? `Top ${n} Länder zeigen` : 'Alle Länder zeigen'}">${n || 'Alle'}</button>`;
  });
  return `<span class="meta-seg" role="group" aria-label="Anzahl Länder"><span class="meta-seg-l">Top</span>${btns.join('')}</span>`;
}

function opponents(rs, ctx) {
  if (!rs.length) return card('Gegner', '', EMPTY, { cls: 'w12' });
  let h2h = '';
  if (ctx.opponent) {
    const c = wdl(rs);
    const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
    const withEngine = rs.filter((r) => ctx.engineOf(r));
    const fam = [...groupBy(rs.filter((r) => r.family), (r) => r.family)].sort(byCountDesc)[0]?.[0];
    const oppName = rs[0].opponent;
    h2h = card(`Direktvergleich mit ${esc(oppName)}`, 'fast', `
      <div class="meta-h2h">
        <div><div class="name">${esc(ctx.username)}</div><div class="meta-muted small">Ø Gen. ${f1(avg(withEngine, (r) => ctx.engineOf(r).accuracy))}</div></div>
        <div class="rec">${c.W} – ${c.D} – ${c.L}</div>
        <div><div class="name">${flag(ctx.countryOf(oppName))} ${esc(oppName)}</div><div class="meta-muted small">Ø Gen. ${f1(avg(withEngine, (r) => ctx.engineOf(r).oppAccuracy))}</div></div>
      </div>
      ${wdlBar(rs)}
      <div class="meta-lastres" aria-label="Letzte Ergebnisse">${chrono.slice(-20).map((r) => `<span class="meta-res ${r.result}" data-tip="${fmtDate(r.endTime)} · ${esc(r.family ?? '')}">${RES_LETTER[r.result]}</span>`).join('')}</div>
      ${bigStats([[rs.length, 'Partien'], [pc(score(rs)), 'Punkte-Quote'], [esc(fam ?? '–'), 'häufigste Eröffnung'], [f0(avg(rs, (r) => r.moves)), 'Ø Züge']])}`,
      { cls: 'w12', note: 'Alle Tabs zeigen jetzt nur Partien gegen diesen Gegner.' });
  }

  const pending = ctx.countriesPending;
  const countryOf = (r) => ctx.countryOf(r.opponent) ?? null;
  const known = rs.filter((r) => countryOf(r));
  const countries = [...groupBy(known, countryOf)].sort(byCountDesc);
  const countryLabel = (code) => `<span class="meta-country">${flag(code)}${esc(countryName(code))}</span>`;
  // Both country cards show the top ctx.countryLimit countries by game count
  // (0 = all) - the table then sorts just those.
  const topCountries = ctx.countryLimit ? countries.slice(0, ctx.countryLimit) : countries;
  const countryRows = topCountries.map(([code, l]) => ({ label: countryName(code), labelHtml: countryLabel(code), v: l.length, tip: `${countryName(code)}: ${l.length} Partien` }));
  const limitNote = countries.length > topCountries.length ? `Top ${topCountries.length} von ${countries.length} Ländern nach Anzahl Partien.` : `Alle ${countries.length} Länder.`;
  const pendingNote = pending ? `Länder werden noch geladen (${ctx.countriesDone} von ${ctx.countriesTotal} Gegnern).` : 'Land aus dem Chess.com-Profil des Gegners.';
  const cSort = ctx.sorts.countries;
  const countryTable = `<div class="meta-tbl"><table><thead><tr><th>Land</th>${sortHead('countries', cSort, 'games', 'Partien', 'r')}<th class="wide">Ergebnis</th>${sortHead('countries', cSort, 'score', 'Quote', 'r')}</tr></thead><tbody>
    ${sortRows(
      topCountries.map(([code, l]) => ({ code, l, v: cSort.key === 'games' ? l.length : score(l) })),
      cSort.dir
    )
      .map((x) => `<tr><td>${countryLabel(x.code)}</td><td class="r">${gamesCount(x.l)}</td><td>${wdlBar(x.l)}</td><td class="r">${pc(score(x.l))}</td></tr>`)
      .join('')}
    </tbody></table></div>`;

  const opps = [...groupBy(rs, (r) => r.opponent.toLowerCase())].sort(byCountDesc).slice(0, 10);
  const oppTable = `<div class="meta-tbl"><table><thead><tr><th>Gegner</th><th class="r">Partien</th><th class="wide">Ergebnis</th><th class="r">Quote</th></tr></thead><tbody>
    ${opps
      .map(([, l]) => {
        const name = l[0].opponent;
        return `<tr class="click" data-opp="${esc(name)}" title="Nur Partien gegen ${esc(name)} zeigen"><td>${flag(ctx.countryOf(name))} ${esc(name)}</td><td class="r">${l.length}</td><td>${wdlBar(l)}</td><td class="r">${pc(score(l))}</td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;

  const buckets = [['≥ 150 schwächer', -Infinity, -150], ['50–150 schwächer', -150, -50], ['etwa gleich (±50)', -50, 50], ['50–150 stärker', 50, 150], ['≥ 150 stärker', 150, Infinity]];
  const rated = rs.filter((r) => hasRealRating(r) && r.oppRating != null);
  const diffRows = buckets
    .map(([label, a, b]) => {
      const l = rated.filter((r) => r.oppRating - r.ownRating >= a && r.oppRating - r.ownRating < b);
      const exp = avg(l, (r) => 1 / (1 + 10 ** ((r.oppRating - r.ownRating) / 400)));
      const act = score(l);
      return `<div class="meta-pair"><div class="meta-card-head small"><span>Gegner ${label}</span><span class="meta-muted">${l.length} P.</span></div>
        <div class="meta-hrow narrow"><span class="meta-muted">erwartet</span><div class="meta-hbar"><i style="width:${(exp ?? 0) * 100}%;background:var(--meta-draw)" data-tip="Erwartet laut Elo-Formel: ${pc(exp)}"></i></div><span class="meta-val">${pc(exp)}</span></div>
        <div class="meta-hrow narrow"><span class="meta-muted">erreicht</span><div class="meta-hbar"><i style="width:${(act ?? 0) * 100}%;background:var(--meta-s1)" data-tip="Tatsächlich: ${pc(act)}"></i></div><span class="meta-val">${pc(act)}</span></div></div>`;
    })
    .join('');

  return `<div class="meta-grid">${h2h}
    ${card('Woher kommen deine Gegner?', 'fast', countries.length ? hbars(countryRows) : `<p class="meta-muted">${pending ? 'Länder werden geladen …' : 'Keine Länderangaben.'}</p>`, { note: `${countries.length ? `${limitNote} ` : ''}${pendingNote}`, head: limitPicker(ctx.countryLimit) })}
    ${card('Quote nach Land', 'fast', countries.length ? countryTable : '<p class="meta-muted">Noch keine Daten.</p>', { note: countries.length ? limitNote : '', head: limitPicker(ctx.countryLimit) })}
    ${card('Häufigste Gegner', 'fast', oppTable, { note: 'Zeile anklicken: Statistik nur gegen diesen Gegner.' })}
    ${card('Gegen Stärkere und Schwächere', 'fast', `<div class="meta-rows">${diffRows}</div>`, { note: 'Erwartete Quote nach Elo-Formel aus dem Wertungsunterschied, verglichen mit dem tatsächlichen Ergebnis. Nur gewertete Partien.' })}
  </div>`;
}

// Move categories in the "Zugqualität" tile, best to worst - all but BRILLIANT.
const MIX_CATEGORIES = CATEGORY_ORDER.filter((id) => id !== 'BRILLIANT');
const MIX_GOOD = new Set(['GREAT', 'BEST', 'EXCELLENT', 'GOOD']);
const MIX_BAD = new Set(['INACCURACY', 'MISTAKE', 'MISS', 'BLUNDER']);

/** Share of each move category in all moves played, yours vs. the opponents' -
 *  a 100 % stacked bar each, plus a chip per category with your share. */
function categoryMix(es, E) {
  const totals = (key) => {
    const t = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, 0]));
    for (const r of es) for (const [id, n] of Object.entries(E(r)[key] ?? {})) if (id in t) t[id] += n;
    return { t, n: Object.values(t).reduce((a, b) => a + b, 0) };
  };
  const own = totals('counts');
  const opp = totals('oppCounts');
  const share = (side, id) => (side.n ? side.t[id] / side.n : 0);
  const fmt = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
  const bar = (side, who) =>
    `<div class="meta-mix-bar">${MIX_CATEGORIES.map((id) => {
      const s = share(side, id);
      return s ? `<i style="width:${s * 100}%;background:${CATEGORIES[id].color}" data-tip="${who} · ${CATEGORIES[id].label}: ${fmt(s)} (${side.t[id]} von ${side.n} Zügen)"></i>` : '';
    }).join('')}</div>`;
  const chips = MIX_CATEGORIES.map((id) => {
    const s = share(own, id);
    const diff = s - share(opp, id);
    // Green when the difference is in your favor (more good moves, fewer bad ones), neutral for book/forced moves.
    const verdict = MIX_GOOD.has(id) ? Math.sign(diff) : MIX_BAD.has(id) ? -Math.sign(diff) : 0;
    const arrow = Math.abs(diff) < 0.0005 ? '' : `<em class="${verdict > 0 ? 'good' : verdict < 0 ? 'bad' : ''}">${diff > 0 ? '▲' : '▼'}</em>`;
    return `<div class="meta-mix-chip" style="--c:${CATEGORIES[id].color}" data-tip="${CATEGORIES[id].label}: ${fmt(s)} deiner Züge (${own.t[id]} von ${own.n})\nGegner: ${fmt(share(opp, id))}">
      <img src="${CATEGORIES[id].icon}" alt=""><span class="k">${CATEGORIES[id].label}</span><b>${fmt(s)}</b>${arrow}</div>`;
  }).join('');
  return `<div class="meta-kpi mix" style="--kpi-accent:#86b54c"><span class="l">🧩 Zugqualität · Anteil an allen ${own.n} gespielten Zügen</span>
    <div class="meta-mix-rows"><span class="meta-muted">Du</span>${bar(own, 'Du')}<span class="meta-muted">Gegner</span>${bar(opp, 'Gegner')}</div>
    <div class="meta-mix-chips">${chips}</div>
    <span class="d">▲ / ▼: höherer / niedrigerer Anteil als bei deinen Gegnern. Brilliant-Züge zählen hier nicht mit.</span></div>`;
}

function quality(rs, ctx) {
  if (!rs.length) return card('Spielqualität', '', EMPTY, { cls: 'w12' });
  const es = rs.filter((r) => ctx.engineOf(r));
  if (!es.length) return `<div class="meta-grid">${noEngineCard(ctx)}</div>`;
  const E = (r) => ctx.engineOf(r);
  const note = coverageNote(ctx, es.length, rs.length);
  const kpis = `<div class="meta-kpis quality">
    ${kpi('🧠 Ø Genauigkeit', f1(avg(es, (r) => E(r).accuracy)), `Gegner ${f1(avg(es, (r) => E(r).oppAccuracy))}`, '', '#4bc2a3')}
    ${categoryMix(es, E)}
  </div>`;

  const accs = es.map((r) => E(r).accuracy).filter((x) => x != null);
  const lo = Math.min(70, Math.floor(Math.min(...accs) / 5) * 5);
  const bins = [];
  for (let a = lo; a < 100; a += 5) {
    const n = accs.filter((x) => x >= a && (x < a + 5 || (a === 95 && x <= 100))).length;
    bins.push({ label: a, v: n, tip: `Genauigkeit ${a}–${a + 5}: ${n} Partien` });
  }
  const phase = [['Eröffnung', 'opening'], ['Mittelspiel', 'middlegame'], ['Endspiel', 'endgame']].map(([label, k]) => {
    // The total over exactly the games that reached this phase - the fair comparison.
    const games = es.filter((r) => E(r).phaseAccuracy[k] != null);
    const v = avg(games, (r) => E(r).phaseAccuracy[k]);
    const total = avg(games, (r) => E(r).accuracy);
    return { label, v: v ?? 0, tip: `${label}: ${f1(v)} · Gesamt in diesen Partien: ${f1(total)} (aus ${games.length} Partien)` };
  });
  const byRes = [['Siege', 'W', 'var(--meta-win)'], ['Remis', 'D', 'var(--meta-draw)'], ['Niederlagen', 'L', 'var(--meta-loss)']].map(([label, k, color]) => ({
    label, v: avg(es.filter((r) => r.result === k), (r) => E(r).accuracy) ?? 0, color,
  }));

  const blunders = es.flatMap((r) => E(r).blunders);
  const moveBins = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, Infinity]].map(([a, b]) => {
    const n = blunders.filter((x) => x.move >= a && x.move <= b).length;
    const label = b === Infinity ? `${a}+` : `${a}–${b}`;
    return { label, v: n, color: 'var(--meta-loss)', tip: `Zug ${label}: ${n} Patzer` };
  });
  const pieceRows = Object.entries(PIECE_LABEL)
    .map(([p, label]) => ({
      label,
      labelHtml: `<img class="meta-piece-icon" src="${pieceUrl(`w${p.toUpperCase()}`)}" alt="">${label}`,
      v: blunders.filter((x) => x.piece === p).length,
    }))
    .sort((a, b) => b.v - a.v);

  const winning = es.filter((r) => E(r).maxCp >= 300);
  const converted = winning.filter((r) => r.result === 'W');
  const saved = es.filter((r) => E(r).minCp <= -300 && r.result !== 'L');
  // From the moves alone (no engine), so over all games, not just analyzed ones.
  const thrown = rs.filter((r) => r.maxMaterial >= 3 && r.result === 'L');
  const thrownBig = thrown.filter((r) => r.maxMaterial >= 9);
  const turned = rs.filter((r) => r.minMaterial <= -3 && r.result === 'W');
  const turnedBig = turned.filter((r) => r.minMaterial <= -9);
  const m1 = es.map((r) => ({ r, m: mateInOne(E(r), r) })).filter((x) => x.m);
  const m1Chances = m1.reduce((a, x) => a + x.m.chances, 0);
  const m1Missed = m1.filter((x) => x.m.missed);
  const m1MissedCount = m1Missed.reduce((a, x) => a + x.m.missed, 0);
  const m1Top = [...m1Missed].sort((a, b) => b.m.missed - a.m.missed || b.r.endTime - a.r.endTime);
  const m1Of = new Map(m1Missed.map((x) => [x.r, x.m.missed]));
  const blownLead = recordGames(rs.filter((r) => r.result === 'L' && r.maxMaterial > 0), 'maxMaterial', true);
  const comeback = recordGames(rs.filter((r) => r.result === 'W' && r.minMaterial < 0), 'minMaterial', false);
  const clockBlunders = es.filter((r) => r.initialClock).flatMap((r) => E(r).blunders);
  const tt = clockBlunders.filter((x) => x.timeTrouble).length;

  return kpis + `<div class="meta-grid">
    ${card('Verteilung der Genauigkeit', 'eng', columns(bins), { cls: 'w8', note: note || 'Genauigkeit je Partie, nach derselben Formel wie in der Einzelanalyse.' })}
    ${card('Genauigkeit nach Phase', 'eng', hbars(phase, { fmt: f1, max: 100 }) + '<h3>Nach Ergebnis</h3>' + hbars(byRes, { fmt: f1, max: 100 }), { cls: 'w4', note: `Eröffnung: Züge 1–${OPENING_LAST_MOVE}. Endspiel: ab höchstens 20 Punkten Figurenmaterial auf dem Brett (ohne Bauern und Könige).` })}
    ${card('Verwertung', 'eng', `<div class="meta-kpis five">
      ${kpi('🏁 Gewinnstellungen verwertet', pc(winning.length ? converted.length / winning.length : null), `${converted.length} von ${winning.length}`, '', GOOD)}
      ${kpi('🛟 Aus Verluststellung gerettet', gamesCount(saved), 'Remis oder Sieg', '', GOOD)}
      ${kpi('🛡️ Niederlagen abgewiesen', gamesCount(turned), 'mit −3 Material-Rückstand noch gewonnen', '', GOOD)}
      ${kpi('💀 Dem Tod von der Schippe gesprungen', gamesCount(turnedBig), 'mit −9 Material-Rückstand noch gewonnen', '', GOOD)}
      ${kpi('📈 Größte Aufholjagd', gamesCount(comeback.games, signed(comeback.value)), 'Material, und doch gewonnen', '', GOOD)}
    </div>
    <div class="meta-kpis five">
      ${kpi('♚ Matt in 1 nicht verwertet', gamesCount(m1Missed.map((x) => x.r), String(m1MissedCount)), `von ${m1Chances} M1-Chancen${m1Chances ? `, ${pc(m1MissedCount / m1Chances)}` : ''}`, '', BAD)}
      ${kpi('⏳ Patzer in Zeitnot', pc(clockBlunders.length ? tt / clockBlunders.length : null), 'Anteil, unter 10 % Restzeit', '', BAD)}
      ${kpi('🎁 Siege verschenkt', gamesCount(thrown), 'mit +3 Material-Vorsprung noch verloren', '', BAD)}
      ${kpi('💸 Must-Wins verschenkt', gamesCount(thrownBig), 'mit +9 Material-Vorsprung noch verloren', '', BAD)}
      ${kpi('📉 Größter verspielter Vorsprung', gamesCount(blownLead.games, signed(blownLead.value)), 'Material, und doch verloren', '', BAD)}
    </div>
    <div class="meta-kpis wide">
      ${topGamesTile('♚ Meiste verpasste Matt-in-1 in einer Partie', m1Top.map((x) => x.r), BAD, 'Matt in 1 möglich, aber anders gezogen', (r) => `<b>${m1Of.get(r)}</b>× M1`)}
    </div>`, { cls: 'w12', note: '„Gewinnstellung“: Engine-Bewertung mindestens +3 aus deiner Sicht. „Verluststellung“: höchstens −3. Verschenkte Siege, abgewiesene Niederlagen, Vorsprung und Aufholjagd: Materialbilanz in Bauerneinheiten (Bauer 1, Springer/Läufer 3, Turm 5, Dame 9), die mindestens einen Gegenzug lang bestand – aus allen Partien, auch ohne Engine. Die ±9-Werte sind jeweils ein Teil der ±3-Werte. Matt in 1: Stellungen, in denen die Engine ein Matt in einem Zug fand, du aber anders gezogen hast.' })}
    ${card('Wann passieren deine Patzer?', 'eng', columns(moveBins), { cls: 'w8', note: 'Nach Zugnummer.' })}
    ${card('Patzer mit welcher Figur?', 'eng', hbars(pieceRows, { color: 'var(--meta-loss)' }), { cls: 'w4', note: 'Die Figur, die beim Patzer gezogen wurde.' })}
  </div>`;
}

function timeTab(rs, ctx) {
  if (!rs.length) return card('Zeit', '', EMPTY, { cls: 'w12' });
  const how = (result, color) => {
    const l = rs.filter((r) => r.result === result);
    const slices = [...groupBy(l, (r) => r.termination)]
      .sort(byCountDesc)
      .map(([k, x], i, all) => ({ label: TERMINATION_LABEL[k] ?? k, v: x.length, games: x, color: shade(color, i, all.length) }));
    if (!slices.length) return '<p class="meta-muted">Keine Partien.</p>';
    return pie(slices, { total: l });
  };
  const losses = rs.filter((r) => r.result === 'L');
  const timeLosses = losses.filter((r) => r.termination === 'timeout');
  const timed = rs.filter((r) => r.duration != null);
  const avgDuration = avg(timed, (r) => r.duration);
  const avgClockLeft = avg(rs.filter((r) => r.ownClockEnd != null), (r) => r.ownClockEnd);
  const pctFmt = (v) => `${Math.round(v)} %`;
  const lengthRows = [[0, 20, 'bis 20'], [21, 30, '21–30'], [31, 40, '31–40'], [41, 50, '41–50'], [51, Infinity, '51+']]
    .map(([a, b, label]) => {
      const l = rs.filter((r) => r.moves >= a && r.moves <= b);
      return l.length ? { label: `${label} Züge`, v: score(l) * 100, tip: `${label} Züge: ${l.length} Partien, Quote ${pc(score(l))}` } : null;
    })
    .filter(Boolean);

  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
  const points = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rs) {
    const d = new Date(r.endTime);
    counts[d.getDay()][d.getHours()]++;
    points[d.getDay()][d.getHours()] += pts(r);
  }
  const mx = Math.max(1, ...counts.flat());
  let heat = '<span></span>' + Array.from({ length: 24 }, (_, h) => `<span class="h">${h % 3 === 0 ? h : ''}</span>`).join('');
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    heat += `<span>${WEEKDAYS[day]}</span>`;
    for (let h = 0; h < 24; h++) {
      const n = counts[day][h];
      const bg = n ? HEAT_RAMP[Math.min(7, Math.ceil((n / mx) * 7))] : 'var(--meta-empty)';
      heat += `<span class="c" style="background:${bg}" data-tip="${WEEKDAYS[day]} ${h}–${h + 1} Uhr: ${n} Partien${n ? `, Quote ${pc(points[day][h] / n)}` : ''}"></span>`;
    }
  }
  const slots = [['Morgens (6–12)', 6, 12], ['Nachmittags (12–18)', 12, 18], ['Abends (18–23)', 18, 23], ['Nachts (23–6)', 23, 30]]
    .map(([label, a, b]) => {
      const l = rs.filter((r) => {
        const h = new Date(r.endTime).getHours();
        const hh = h < 6 ? h + 24 : h;
        return hh >= a && hh < b;
      });
      return l.length ? { label, v: score(l) * 100, tip: `${label}: ${l.length} Partien, Quote ${pc(score(l))}` } : null;
    })
    .filter(Boolean);

  const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
  const afterWin = [];
  const afterLoss = [];
  for (let i = 1; i < chrono.length; i++) {
    if (chrono[i - 1].result === 'W') afterWin.push(chrono[i]);
    if (chrono[i - 1].result === 'L') afterLoss.push(chrono[i]);
  }

  return `<div class="meta-grid">
    ${card('Wie du gewinnst', 'fast', how('W', 'var(--meta-win)'), { cls: 'w4', accent: 'var(--meta-win)' })}
    ${card('Wie du verlierst', 'fast', how('L', 'var(--meta-loss)'), { cls: 'w4', accent: 'var(--meta-loss)' })}
    ${card('Wie Remis entstehen', 'fast', how('D', 'var(--meta-draw)'), { cls: 'w4', accent: 'var(--meta-draw)' })}
    ${card('Kürzeste Partien', 'fast', topGamesTable(byEnding(rs, ctx.endings.shortest).sort((a, b) => a.moves - b.moves || b.endTime - a.endTime)), { head: endingPicker('shortest', ctx.endings.shortest), note: ENDING_NOTE })}
    ${card('Längste Partien', 'fast', topGamesTable(byEnding(rs, ctx.endings.longest).sort((a, b) => b.moves - a.moves || b.endTime - a.endTime)), { head: endingPicker('longest', ctx.endings.longest), note: ENDING_NOTE })}
    <div class="meta-stack">
      ${card('Uhr', 'fast', bigStats([
        [avgDuration == null ? '–' : fmtSeconds(avgDuration), 'Ø Dauer pro Partie'],
        [f0(avg(rs, (r) => r.moves)), 'Ø Züge pro Partie'],
        [pc(losses.length ? timeLosses.length / losses.length : null), 'der Niederlagen auf Zeit'],
        [avgClockLeft == null ? '–' : fmtSeconds(avgClockLeft), 'Ø Restzeit auf deiner Uhr'],
      ]), { note: 'Dauer: verbrauchte Zeit beider Uhren aus dem PGN. Restzeit: was am Ende der Partie noch auf deiner Uhr stand, auch bei Niederlagen. Beides ohne Daily-Partien.' })}
      ${card('Quote nach Partielänge', 'fast', hbars(lengthRows, { fmt: pctFmt, max: 100 }))}
    </div>
    <div class="meta-stack w8 fit">
      <div class="meta-side-by-side">
        ${card('Zeit pro Zug', 'fast', moveTimeChart(rs), { note: 'Ø Bedenkzeit für deinen 1. bis 50. Zug, je Spielart. Ein Punkt erscheint ab 3 Partien, die so lange gingen.' })}
        ${card('Längste Königsreisen', 'fast', topGamesTable(rs.filter((r) => r.kingMoves > 0).sort((a, b) => b.kingMoves - a.kingMoves || b.endTime - a.endTime), (r) => `<b>${r.kingMoves}</b> Königszüge`), { note: 'Partien, in denen dein König am häufigsten gezogen hat (Rochade eingerechnet).' })}
      </div>
      ${card('Dauer der Partien', 'fast', durationColumns(timed), { note: 'Verbrauchte Zeit beider Uhren aus dem PGN, ohne Daily-Partien. Längere Partien als 20 Minuten stehen gesammelt in „20+“.' })}
    </div>
    ${card('Wann du spielst', 'fast', `<div class="meta-tbl"><div class="meta-heat">${heat}</div></div>`, { cls: 'w8', note: 'Farbe = Anzahl Partien (Ende der Partie, Ortszeit). Tooltip zeigt die Quote.' })}
    <div class="meta-stack">
      ${card('Quote nach Tageszeit', 'fast', hbars(slots, { fmt: pctFmt, max: 100 }))}
      ${card('Serien und Tilt', 'fast', bigStats([
        [longestStreak(chrono, 'W'), 'längste Siegesserie'],
        [longestStreak(chrono, 'L'), 'längste Niederlagenserie'],
        [pc(score(afterWin)), 'Quote direkt nach einem Sieg'],
        [pc(score(afterLoss)), 'Quote direkt nach einer Niederlage'],
      ]))}
    </div>
  </div>`;
}

const GAMES_LIMIT = 200;

// ---------- Heatmap tab ----------

// Icons with a tooltip (metaController's shared data-tip one) instead of a label.
const HEAT_MODES = [
  ['taken', '⚔️', 'Zeigt an, wie oft ich auf diesem Feld eine gegnerische Figur geschlagen habe'],
  ['lost', '💀', 'Zeigt an, wie oft eine meiner Figuren auf diesem Feld geschlagen wurde'],
];
const HEAT_PIECES = ['p', 'n', 'b', 'r', 'q']; // + the king where it can capture (piecePicker)
const FILES = 'abcdefgh';

/** Segmented control; attr: the data attribute metaController listens for.
 *  options: [key, text, tip?] - with a tip, the text is only an icon and the tip names it. */
function segPicker(options, current, attr, label) {
  const btns = options.map(([key, text, tip]) => {
    const on = key === current;
    const tipAttrs = tip ? ` class="${on ? 'on ' : ''}icon" data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ` class="${on ? 'on' : ''}"`;
    return `<button type="button"${tipAttrs} data-${attr}="${key}" aria-pressed="${on}">${text}</button>`;
  });
  return `<span class="meta-seg" role="group" aria-label="${label}">${btns.join('')}</span>`;
}

/** Toggle chips, one per piece type; none on = all pieces.
 *  side: 'own' | 'opp' - which piece of a capture (metaController's heatmap.pieces / oppPieces).
 *  The king only where it can take part: capturing, never captured. */
// German nouns for the summary's sentences: 'Bauer' changes in the accusative/dative, the Dame is the only feminine one.
const PIECE_NOUN = { p: ['Bauer', 'Bauern'], n: ['Springer', 'Springer'], b: ['Läufer', 'Läufer'], r: ['Turm', 'Turm'], q: ['Dame', 'Dame'], k: ['König', 'König'] };
const joinOr = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} oder ${xs.at(-1)}`);

/** The chosen pieces as one phrase, e.g. "einen gegnerischen Bauern oder Läufer".
 *  kase: 'nom' | 'acc' | 'dat'; masc/fem: the article + adjective for each gender. */
function piecePhrase(ps, kase, masc, fem) {
  const inflected = (p) => PIECE_NOUN[p][kase === 'nom' ? 0 : 1];
  const m = ps.filter((p) => p !== 'q').map(inflected);
  return joinOr([...(m.length ? [`${masc} ${joinOr(m)}`] : []), ...(ps.includes('q') ? [`${fem} Dame`] : [])]);
}

/** The summary's tooltips: what its two counts mean under the current piece filters. */
function heatSentences(own, opp, count) {
  const times = (n) => (n === 1 ? 'einmal' : `${n}-mal`);
  const takenBy = own.length ? piecePhrase(own, 'nom', 'dein', 'deine') : 'eine deiner Figuren';
  const taken = opp.length ? piecePhrase(opp, 'acc', 'einen gegnerischen', 'eine gegnerische') : 'eine gegnerische Figur';
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const lostWho = own.length ? `${cap(piecePhrase(own, 'nom', 'dein', 'deine'))} wurde` : 'Deine Figuren wurden';
  const lostBy = opp.length ? piecePhrase(opp, 'dat', 'einem gegnerischen', 'einer gegnerischen') : 'gegnerischen Figuren';
  return {
    taken: `${count.taken === 1 ? 'In einem Fall' : `In ${count.taken} Fällen`} hat ${takenBy} ${taken} geschlagen.`,
    lost: `${lostWho} ${times(count.lost)} von ${lostBy} geschlagen.`,
  };
}

// Between the two piece pickers, so the row reads as a sentence: "Meine Figuren schlägt / geschlagen von Gegnerische Figuren".
function heatVerb(mode) {
  return mode === 'lost'
    ? '<span class="meta-heat-verb lost">geschlagen von</span>'
    : '<span class="meta-heat-verb taken">schlägt</span>';
}

function piecePicker(side, chosen, mode) {
  const kingFits = side === 'own' ? mode === 'taken' : mode === 'lost';
  const btns = [...HEAT_PIECES, ...(kingFits ? ['k'] : [])].map((p) => {
    const on = chosen.includes(p);
    return `<button type="button" class="${on ? 'on' : ''}" data-heat-piece="${p}" data-heat-side="${side}" aria-pressed="${on}">${PIECE_LABEL[p]}</button>`;
  });
  const label = side === 'own' ? 'Meine Figuren' : 'Gegnerische Figuren';
  return `<span class="meta-seg" role="group" aria-label="${label}"><span class="meta-seg-l">${label}</span>${btns.join('')}</span>`;
}

/** Heat for a share t (0..1) of the busiest square, in the mode's color like
 *  the mode switch: light to dark blue for "taken", light to dark red for "lost". */
function heatColor(t, mode) {
  const [h0, h1] = mode === 'lost' ? [12, 0] : [200, 222];
  return `hsl(${Math.round(h0 + (h1 - h0) * t)} 85% ${Math.round(72 - 34 * t)}% / ${(0.35 + 0.6 * t).toFixed(2)})`;
}

function heatmapTab(rs, ctx) {
  if (!rs.length) return card('Heatmap', '', EMPTY, { cls: 'w12' });
  const { mode, pieces, oppPieces } = ctx.heatmap;
  const games = rs; // the top bar's color filter decides which games
  // Captures are "<square><own piece><opponent's piece>" (metaRecords' captureSquares),
  // so one filter row is always the user's piece, the other the opponent's.
  // A king chosen for the other direction (piecePicker hides it there) is left out.
  const ownSel = pieces.filter((p) => p !== 'k' || mode === 'taken');
  const oppSel = oppPieces.filter((p) => p !== 'k' || mode === 'lost');
  const counts = (c) => (!ownSel.length || ownSel.includes(c[2])) && (!oppSel.length || oppSel.includes(c[3]));
  const bySquare = new Map(); // "e4" -> {n, own: {q: 3, ...}, opp: {r: 2, ...}}
  const byPiece = {}; // own piece -> count
  const tally = (o, k) => (o[k] = (o[k] ?? 0) + 1);
  for (const r of games) {
    for (const c of (r.captures?.[mode] ?? []).filter(counts)) {
      const sq = c.slice(0, 2);
      const e = bySquare.get(sq) ?? { n: 0, own: {}, opp: {} };
      e.n++;
      tally(e.own, c[2]);
      tally(e.opp, c[3]);
      bySquare.set(sq, e);
      tally(byPiece, c[2]);
    }
  }
  const total = [...bySquare.values()].reduce((a, e) => a + e.n, 0);
  const modeColor = mode === 'lost' ? 'var(--meta-loss)' : 'var(--meta-s1)'; // as the mode switch (css .meta-seg [data-heat-mode])
  // Both directions for the summary, whichever the board shows.
  const count = { lost: 0, taken: 0 };
  for (const r of games) for (const k of ['lost', 'taken']) count[k] += (r.captures?.[k] ?? []).filter(counts).length;
  const perGame = (n) => f1(games.length ? n / games.length : null);
  const sentence = heatSentences(ownSel, oppSel, count); // the same filters as the counts
  const max = Math.max(1, ...[...bySquare.values()].map((e) => e.n));
  const pieceList = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${PIECE_LABEL[p]} ${n}`).join(', ');
  const [ownLabel, oppLabel] = mode === 'lost' ? ['Verloren', 'Geschlagen von'] : ['Geschlagen mit', 'Geschlagen wurde'];

  // Black at the bottom only when every game is as Black (top bar's color filter) -
  // with both colors there is no single own side.
  const flipped = games.every((r) => r.color === 'b');
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [...FILES].reverse() : [...FILES];
  let squares = '';
  for (const rank of ranks) {
    for (const f of files) {
      const sq = `${f}${rank}`;
      const e = bySquare.get(sq);
      const light = (FILES.indexOf(f) + rank) % 2 === 0;
      const detail = e ? `\n${ownLabel}: ${pieceList(e.own)}\n${oppLabel}: ${pieceList(e.opp)}` : '';
      const tip = `${sq}: ${e?.n ?? 0} ${e?.n === 1 ? 'Schlag' : 'Schläge'}${detail}`;
      squares += `<div class="meta-heat-sq ${light ? 'l' : 'd'}" data-tip="${esc(tip)}">${
        e ? `<i style="background:${heatColor(e.n / max, mode)}"></i><b>${e.n}</b>` : ''
      }${f === files[0] ? `<span class="rk">${rank}</span>` : ''}${rank === ranks[7] ? `<span class="fl">${f}</span>` : ''}</div>`;
    }
  }
  const legend = `<div class="meta-heat-legend"><span>wenig</span><i style="background:linear-gradient(90deg, ${heatColor(0, mode)}, ${heatColor(0.5, mode)}, ${heatColor(1, mode)})"></i><span>viel</span></div>`;
  const board = total
    ? `<div class="meta-heat-board">${squares}</div>${legend}`
    : `<p class="meta-muted">Keine Schlagzüge in diesen Partien.</p>`;

  const topSquares = [...bySquare.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([sq, e]) => ({ label: sq, v: e.n, tip: `${sq}: ${e.n} von ${total} (${pc(e.n / total)})`, color: modeColor }));
  // Own pieces, so icons in the own color (with both colors: white).
  const own = flipped ? 'b' : 'w';
  const pieceRows = Object.entries(PIECE_LABEL)
    .filter(([p]) => byPiece[p])
    .map(([p, label]) => ({
      label,
      labelHtml: `<img class="meta-piece-icon" src="${pieceUrl(`${own}${p.toUpperCase()}`)}" alt="">${label}`,
      v: byPiece[p],
      tip: `${label}: ${byPiece[p]} (${pc(byPiece[p] / total)})`,
    }))
    .sort((a, b) => b.v - a.v);

  const controls = `<div class="meta-heat-controls">${segPicker(HEAT_MODES, mode, 'heat-mode', 'Was zeigen')}${piecePicker('own', pieces, mode)}${heatVerb(mode)}${piecePicker('opp', oppPieces, mode)}</div>`;
  const what = mode === 'lost'
    ? 'Felder, auf denen der Gegner deine Figuren geschlagen hat. „Meine Figuren“ wählt deine geschlagene Figur, „Gegnerische Figuren“ die schlagende'
    : 'Felder, auf denen du gegnerische Figuren geschlagen hast. „Meine Figuren“ wählt deine schlagende Figur, „Gegnerische Figuren“ die geschlagene';
  return `${controls}<div class="meta-grid">
    ${card('Schlag-Heatmap', 'fast', board, { cls: 'w8', note: `${what}. Farbe = Anzahl Schläge auf dem Feld, der Tooltip zeigt, welche Figuren beteiligt waren.${flipped ? ' Brett aus Sicht von Schwarz.' : ''}` })}
    <div class="meta-stack">
      ${card('Zusammenfassung', 'fast', bigStats([
        [count.taken, 'gegnerische Figuren geschlagen', 'var(--meta-s1)', sentence.taken],
        [perGame(count.taken), 'pro Partie', 'var(--meta-s1)', `Im Schnitt ${perGame(count.taken)}-mal pro Partie (${games.length} Partien).`],
        [count.lost, 'eigene Figuren verloren', 'var(--meta-loss)', sentence.lost],
        [perGame(count.lost), 'pro Partie', 'var(--meta-loss)', `Im Schnitt ${perGame(count.lost)}-mal pro Partie (${games.length} Partien).`],
      ], 'two'))}
      ${card(mode === 'lost' ? 'Welche Figuren du verlierst' : 'Womit du schlägst', 'fast', hbars(pieceRows, { color: modeColor }))}
      ${card('Die heißesten Felder', 'fast', hbars(topSquares))}
    </div>
  </div>`;
}

function gamesTab(rs, ctx) {
  const sort = ctx.sorts.games;
  const sortValue = {
    date: (r) => r.endTime,
    elo: (r) => r.oppRating,
    moves: (r) => r.moves,
    acc: (r) => ctx.engineOf(r)?.accuracy,
    blunders: (r) => {
      const e = ctx.engineOf(r);
      return e ? e.counts.BLUNDER ?? 0 : null;
    },
  }[sort.key] ?? ((r) => r.endTime);
  // Games without a value (no engine record yet, no rating) always last, ties newest first.
  const list = rs
    .map((r) => ({ r, v: sortValue(r) }))
    .sort((a, b) => (a.v == null) - (b.v == null) || (sort.dir === 'asc' ? a.v - b.v : b.v - a.v) || b.r.endTime - a.r.endTime)
    .slice(0, GAMES_LIMIT)
    .map((x) => x.r);
  const sortTh = (key, label, cls) => sortHead('games', sort, key, label, cls);
  const body = rs.length
    ? `<div class="meta-tbl"><table><thead><tr>${sortTh('date', 'Datum')}<th>Art</th><th></th><th>Gegner</th>${sortTh('elo', 'Elo', 'r')}<th>Eröffnung</th>${sortTh('moves', 'Züge', 'r')}${sortTh('acc', 'Gen.', 'r')}${sortTh('blunders', 'Patzer', 'r')}<th></th></tr></thead><tbody>
      ${list
        .map((r) => {
          const e = ctx.engineOf(r);
          const style = timeClassStyle(r.timeClass);
          return `<tr class="click" data-game="${esc(r.url)}" title="In der Spiel-Analyse öffnen"><td>${fmtDate(r.endTime)}</td><td style="color:${style.color}">${style.emoji} ${TC_LABEL[r.timeClass] ?? r.timeClass}</td><td><span class="meta-colordot ${r.color}"></span></td><td>${flag(ctx.countryOf(r.opponent))} ${esc(r.opponent)}</td><td class="r">${r.oppRating ?? '–'}</td><td${r.opening ? ` data-opening="${esc(r.opening)}"` : ''}>${esc(r.family ?? '–')}</td><td class="r">${r.moves}</td><td class="r">${f1(e?.accuracy)}</td><td class="r">${e ? e.counts.BLUNDER ?? 0 : '–'}</td><td><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span></td></tr>`;
        })
        .join('')}
      </tbody></table></div>`
    : EMPTY;
  const more = rs.length > GAMES_LIMIT ? ` Gezeigt werden die ersten ${GAMES_LIMIT} von ${rs.length} in dieser Sortierung.` : '';
  return card(`Partien (${rs.length})`, 'fast', body, { cls: 'w12', note: `Zeile anklicken: Partie in der Spiel-Analyse öffnen. Spaltenkopf anklicken: sortieren.${more}` });
}

const RENDERERS = { overview, openings, opponents, quality, heatmap: heatmapTab, time: timeTab, games: gamesTab };

/**
 * @param {string} tab one of META_TABS' ids
 * @param {object[]} records filtered fast records
 * @param {{engineOf: (r) => object|null, countryOf: (name) => string|null, opponent: string|null,
 *   username: string, engineLabel: string, countriesPending: boolean, countriesDone: number, countriesTotal: number}} ctx
 */
export function renderMetaTab(tab, records, ctx) {
  fitDraws.clear(); // the previous render's charts are about to be replaced
  gameLists.clear(); // ... and so are its counts
  return (RENDERERS[tab] ?? overview)(records, ctx);
}
