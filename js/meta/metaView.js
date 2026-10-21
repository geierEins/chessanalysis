// Renders the Meta-Analyse tabs as HTML strings from already-filtered
// per-game records (metaRecords.js). Pure presentation: no state, no I/O -
// js/meta/metaController.js owns the data and calls renderMetaTab() again on
// every filter or tab change. Charts are small hand-drawn SVG/HTML (no
// Chart.js) so a re-render is just one innerHTML swap.

import { timeClassStyle } from '../timeClassStyle.js';
import { flagHtml, countryName } from '../ui/playerLabel.js';
import { TERMINATION_LABEL, PIECE_LABEL, OPENING_LAST_MOVE } from './metaRecords.js';
import { pieceUrl } from './openingBoard.js';

export const META_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'openings', label: 'Eröffnungen' },
  { id: 'opponents', label: 'Gegner & Länder' },
  { id: 'quality', label: 'Spielqualität' },
  { id: 'time', label: 'Zeit & Partieende' },
  { id: 'games', label: 'Partien' },
];

const TC_ORDER = ['bullet', 'blitz', 'rapid', 'daily'];
const TC_LABEL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily' };
const RES_LETTER = { W: 'S', D: 'R', L: 'N' };
const RES_CIRCLE = { W: '🟢', D: '⚪', L: '🔴' }; // same as the game picker's (js/main.js's OUTCOME_CIRCLE)
const RES_WORD ={ W: 'Sieg', D: 'Remis', L: 'Niederlage' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
// "Wann du spielst" sub-tabs - result: only games with that result (null = all).
const HEAT_VIEWS = [
  { id: 'all', label: 'Wann du spielst', result: null, color: null },
  { id: 'W', label: 'Wann du gewinnst', result: 'W', color: 'var(--meta-win)', one: 'Sieg', many: 'Siege' },
  { id: 'L', label: 'Wann du verlierst', result: 'L', color: 'var(--meta-loss)', one: 'Niederlage', many: 'Niederlagen' },
  { id: 'D', label: 'Wann Remis entsteht', result: 'D', color: 'var(--meta-draw)', one: 'Remis', many: 'Remis' },
];
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
const sum = (rs, f) => rs.reduce((a, r) => a + (f(r) ?? 0), 0);
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
  'Verteilung der Genauigkeit': '📶',
  'Genauigkeit nach Phase': '🧭',
  'Verwertung': '🏁',
  'Wann passieren deine Patzer?': '💥',
  'Zeit': '⏱️',
  'Wie du gewinnst': '🏆',
  'Wie du verlierst': '💔',
  'Wie Remis entstehen': '🤝',
  'Uhr': '⏰',
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

function card(title, src, body, { cls = 'w6', note = '' } = {}) {
  const badge = src ? `<span class="meta-src ${src}">${src === 'fast' ? 'ohne Engine' : 'Engine'}</span>` : '';
  return `<section class="meta-card ${cls}"><div class="meta-card-head"><h2>${cardIcon(title)}${title}</h2>${badge}</div>${body}${
    note ? `<p class="meta-note">${note}</p>` : ''
  }</section>`;
}

const EMPTY = '<p class="meta-muted">Keine Partien für diese Filter.</p>';

function kpi(label, value, detail = '', cls = '') {
  return `<div class="meta-kpi"><span class="l">${label}</span><span class="v ${cls}">${value}</span><span class="d">${detail}</span></div>`;
}

/** bigStats labels as "<b>Title</b> / (detail)" - the part before " (" bold, the bracket on its own line. */
function headedLabels(items) {
  return items.map(([v, l]) => {
    const i = l.indexOf(' (');
    return [v, i < 0 ? `<strong>${l}</strong>` : `<strong>${l.slice(0, i)}</strong><br>${l.slice(i + 1)}`];
  });
}

const MAX_LISTED_GAMES = 10;

/** A count that opens the list of its games on click (metaController's
 *  #meta-games-pop) - the newest MAX_LISTED_GAMES of them. `text` replaces
 *  the count as the shown value (e.g. "+9" for a record game). */
function gamesCount(list, text = list.length) {
  if (!list.length) return text === list.length ? '0' : '–';
  const urls = list.slice(0, MAX_LISTED_GAMES).map((r) => r.url).join(' ');
  return `<button type="button" class="meta-count" data-games="${esc(urls)}" data-total="${list.length}" title="Partien anzeigen">${text}</button>`;
}

/** The games with the most extreme value of `key` (all of them on a tie), e.g. the biggest lead that was still lost. */
function recordGames(list, key, pickMax) {
  if (!list.length) return { games: [], value: null };
  const value = pickMax ? Math.max(...list.map((r) => r[key])) : Math.min(...list.map((r) => r[key]));
  return { games: list.filter((r) => r[key] === value), value };
}

const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

/** The floating game list behind gamesCount() - styled like the game picker. */
export function gameListHtml(rs, total) {
  const items = rs.map((r) => {
    const style = timeClassStyle(r.timeClass);
    const elo = r.oppRating ? ` (${r.oppRating})` : '';
    return `<button type="button" class="custom-select-option" role="menuitem" data-game="${esc(r.url)}" style="color:${style.color}">${style.emoji} vs ${esc(r.opponent)}${elo} — ${esc(r.summary.dateLabel)} — ${r.moves} Zg. ${RES_CIRCLE[r.result]}</button>`;
  });
  const more = total > rs.length ? `<p class="meta-pop-more">… und ${total - rs.length} weitere</p>` : '';
  return items.join('') + more;
}

function bigStats(items) {
  return `<div class="meta-big">${items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
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

/** Vertical bars on one shared scale. bins: {label, v, tip?, color?} */
function columns(bins, { color = 'var(--meta-s1)', H = 170 } = {}) {
  const W = 640;
  const P = { l: 34, r: 8, t: 8, b: 22 };
  const m = Math.max(1, ...bins.map((b) => b.v));
  const step = m <= 5 ? 1 : m <= 12 ? 2 : m <= 30 ? 5 : m <= 60 ? 10 : m <= 150 ? 25 : 50;
  const top = Math.ceil(m / step) * step;
  const bw = (W - P.l - P.r) / bins.length;
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
    s += `<text x="${x + bw / 2 - 1}" y="${H - 6}" text-anchor="middle">${b.label}</text>`;
  });
  s += `<line class="meta-axis" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
  return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

function ratingChart(rs) {
  const series = TC_ORDER.map((tc) => [tc, rs.filter((r) => r.timeClass === tc && r.ownRating != null)]).filter(([, l]) => l.length >= 2);
  if (!series.length) return '<p class="meta-muted">Zu wenige Partien mit Wertung.</p>';
  const all = series.flatMap(([, l]) => l);
  const W = 640;
  const H = 220;
  const P = { l: 40, r: 14, t: 10, b: 24 };
  const x0 = Math.min(...all.map((r) => r.endTime));
  const x1 = Math.max(...all.map((r) => r.endTime));
  const ys = all.map((r) => r.ownRating);
  const span = Math.max(...ys) - Math.min(...ys);
  const step = span > 600 ? 200 : span > 250 ? 100 : 50;
  const y0 = Math.floor((Math.min(...ys) - 10) / step) * step;
  const y1 = Math.ceil((Math.max(...ys) + 10) / step) * step;
  const X = (x) => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const Y = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  let s = '';
  for (let y = y0; y <= y1; y += step) {
    s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${P.l - 6}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`;
  }
  // Month ticks, thinned so labels never collide.
  const months = [];
  const d = new Date(x0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + 1);
  for (; +d <= x1; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
  const every = Math.max(1, Math.ceil(months.length / 8));
  months.forEach((m, i) => {
    if (i % every) return;
    const label = m.getMonth() === 0 ? String(m.getFullYear()) : m.toLocaleDateString('de-DE', { month: 'short' });
    s += `<text x="${X(+m)}" y="${H - 6}" text-anchor="middle">${label}</text>`;
  });
  let legend = '';
  for (const [tc, list] of series) {
    const col = timeClassStyle(tc).color;
    const sorted = [...list].sort((a, b) => a.endTime - b.endTime);
    s += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${sorted.map((r) => `${X(r.endTime).toFixed(1)},${Y(r.ownRating).toFixed(1)}`).join(' ')}"/>`;
    for (const r of sorted) {
      s += `<circle cx="${X(r.endTime).toFixed(1)}" cy="${Y(r.ownRating).toFixed(1)}" r="6" fill="transparent" data-tip="${TC_LABEL[tc]} · ${fmtDate(r.endTime)}\nWertung ${r.ownRating} · ${RES_WORD[r.result]} gegen ${esc(r.opponent)}"/>`;
    }
    const last = sorted[sorted.length - 1];
    s += `<circle cx="${X(last.endTime)}" cy="${Y(last.ownRating)}" r="4" fill="${col}" stroke="var(--meta-panel)" stroke-width="2"/>`;
    legend += `<span><i style="background:${col}"></i>${TC_LABEL[tc]} ${sorted[0].ownRating} → ${last.ownRating}</span>`;
  }
  return `<div class="meta-legend">${legend}</div><svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wertungsverlauf">${s}</svg>`;
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

/** "Basis: 180 von 220 Partien" under engine cards when not every game is analyzed yet. */
function coverageNote(ctx, withEngine, total) {
  if (withEngine === total) return '';
  return `Basis: ${withEngine} von ${total} Partien mit Engine-Werten (${esc(ctx.engineLabel)}). Die Lupe analysiert die fehlenden.`;
}

function noEngineCard(ctx) {
  return card('Noch keine Engine-Werte', 'eng',
    `<p class="meta-muted">Für <b>${esc(ctx.engineLabel)}</b> ist für diese Partien noch nichts analysiert. Die Lupe oben startet die Analyse, oder eine gespeicherte Analyse importieren.</p>`,
    { cls: 'w12' });
}

// ---------- tabs ----------

function overview(rs, ctx) {
  if (!rs.length) return card('Übersicht', '', EMPTY, { cls: 'w12' });
  const c = wdl(rs);
  const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
  const withEngine = rs.filter((r) => ctx.engineOf(r));
  const [mainTc, mainList] = [...groupBy(chrono.filter((r) => r.ownRating != null), (r) => r.timeClass)].sort(byCountDesc)[0] ?? [];
  let ratingKpi = kpi('Wertung', '–');
  if (mainList?.length) {
    const delta = mainList[mainList.length - 1].ownRating - mainList[0].ownRating;
    ratingKpi = kpi(`Wertung ${TC_LABEL[mainTc] ?? mainTc}`, `${delta >= 0 ? '+' : ''}${delta}`, `${mainList[0].ownRating} → ${mainList[mainList.length - 1].ownRating}`, delta >= 0 ? 'up' : 'down');
  }
  const kpis = `<div class="meta-kpis">
    ${kpi('Partien', rs.length, `${c.W} S · ${c.D} R · ${c.L} N`)}
    ${kpi('Punkte-Quote', pc(score(rs)), 'Sieg = 1, Remis = ½')}
    ${kpi('Ø Genauigkeit', f1(avg(withEngine, (r) => ctx.engineOf(r).accuracy)), withEngine.length ? `Gegner ${f1(avg(withEngine, (r) => ctx.engineOf(r).oppAccuracy))}` : 'noch keine Engine-Werte')}
    ${ratingKpi}
    ${kpi('Längste Siegesserie', longestStreak(chrono, 'W'), 'Partien in Folge')}
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
    ${card('Wertungsverlauf', 'fast', ratingChart(rs), { cls: 'w12', note: 'Jeder Punkt ist eine Partie, Wertung laut Chess.com nach der Partie.' })}
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
  const countryLabel = (code) => `${flag(code)} ${esc(countryName(code))}`;
  // "Quote nach Land" lists every country - only past 45 does it drop the
  // ones with fewer than 3 games. The list on the left is never shorter than
  // that table, and at least 12 long.
  const minGames = countries.length > 45 ? 3 : 1;
  const rankedCountries = countries.filter(([, l]) => l.length >= minGames).length;
  const countryRows = countries.slice(0, Math.max(12, rankedCountries)).map(([code, l]) => ({ label: countryName(code), labelHtml: countryLabel(code), v: l.length, tip: `${countryName(code)}: ${l.length} Partien` }));
  const pendingNote = pending ? `Länder werden noch geladen (${ctx.countriesDone} von ${ctx.countriesTotal} Gegnern).` : 'Land aus dem Chess.com-Profil des Gegners.';
  const cSort = ctx.sorts.countries;
  const countryTable = `<div class="meta-tbl"><table><thead><tr><th>Land</th>${sortHead('countries', cSort, 'games', 'Partien', 'r')}<th class="wide">Ergebnis</th>${sortHead('countries', cSort, 'score', 'Quote', 'r')}</tr></thead><tbody>
    ${sortRows(
      countries
        .filter(([, l]) => l.length >= minGames)
        .map(([code, l]) => ({ code, l, v: cSort.key === 'games' ? l.length : score(l) })),
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
  const rated = rs.filter((r) => r.ownRating != null && r.oppRating != null);
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
    ${card('Woher kommen deine Gegner?', 'fast', countries.length ? hbars(countryRows) : `<p class="meta-muted">${pending ? 'Länder werden geladen …' : 'Keine Länderangaben.'}</p>`, { note: pendingNote })}
    ${card('Quote nach Land', 'fast', countries.length ? countryTable : '<p class="meta-muted">Noch keine Daten.</p>', { note: minGames > 1 ? 'Länder mit mindestens 3 Partien.' : '' })}
    ${card('Häufigste Gegner', 'fast', oppTable, { note: 'Zeile anklicken: Statistik nur gegen diesen Gegner.' })}
    ${card('Gegen Stärkere und Schwächere', 'fast', `<div class="meta-rows">${diffRows}</div>`, { note: 'Erwartete Quote nach Elo-Formel aus dem Wertungsunterschied, verglichen mit dem tatsächlichen Ergebnis.' })}
  </div>`;
}

function quality(rs, ctx) {
  if (!rs.length) return card('Spielqualität', '', EMPTY, { cls: 'w12' });
  const es = rs.filter((r) => ctx.engineOf(r));
  if (!es.length) return `<div class="meta-grid">${noEngineCard(ctx)}</div>`;
  const E = (r) => ctx.engineOf(r);
  const count = (id) => (r) => E(r).counts[id] ?? 0;
  const note = coverageNote(ctx, es.length, rs.length);
  const kpis = `<div class="meta-kpis">
    ${kpi('Ø Genauigkeit', f1(avg(es, (r) => E(r).accuracy)), `Gegner ${f1(avg(es, (r) => E(r).oppAccuracy))}`)}
    ${kpi('Patzer pro Partie', f1(avg(es, count('BLUNDER'))), `${sum(es, count('BLUNDER'))} insgesamt`, 'bad')}
    ${kpi('Fehler pro Partie', f1(avg(es, count('MISTAKE'))), `Verpasst ${f1(avg(es, count('MISS')))} · Ungenau ${f1(avg(es, count('INACCURACY')))}`)}
    ${kpi('Brillant / Großartig', `${sum(es, count('BRILLIANT'))} / ${sum(es, count('GREAT'))}`, `in ${es.length} Partien`)}
  </div>`;

  const accs = es.map((r) => E(r).accuracy).filter((x) => x != null);
  const lo = Math.min(70, Math.floor(Math.min(...accs) / 5) * 5);
  const bins = [];
  for (let a = lo; a < 100; a += 5) {
    const n = accs.filter((x) => x >= a && (x < a + 5 || (a === 95 && x <= 100))).length;
    bins.push({ label: a, v: n, tip: `Genauigkeit ${a}–${a + 5}: ${n} Partien` });
  }
  const phase = [['Eröffnung', 'opening'], ['Mittelspiel', 'middlegame'], ['Endspiel', 'endgame']].map(([label, k]) => {
    const v = avg(es, (r) => E(r).phaseAccuracy[k]);
    return { label, v: v ?? 0, tip: `${label}: ${f1(v)} (aus ${es.filter((r) => E(r).phaseAccuracy[k] != null).length} Partien)` };
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
  const thrown = es.filter((r) => E(r).maxCp >= 300 && r.result === 'L');
  const thrownBig = thrown.filter((r) => E(r).maxCp >= 900);
  const turned = es.filter((r) => E(r).minCp <= -300 && r.result === 'W');
  const turnedBig = turned.filter((r) => E(r).minCp <= -900);
  // From the moves alone (no engine), so over all games, not just analyzed ones.
  const blownLead = recordGames(rs.filter((r) => r.result === 'L' && r.maxMaterial > 0), 'maxMaterial', true);
  const comeback = recordGames(rs.filter((r) => r.result === 'W' && r.minMaterial < 0), 'minMaterial', false);
  const clockBlunders = es.filter((r) => r.initialClock).flatMap((r) => E(r).blunders);
  const tt = clockBlunders.filter((x) => x.timeTrouble).length;

  return kpis + `<div class="meta-grid">
    ${card('Verteilung der Genauigkeit', 'eng', columns(bins), { cls: 'w8', note: note || 'Genauigkeit je Partie, nach derselben Formel wie in der Einzelanalyse.' })}
    ${card('Genauigkeit nach Phase', 'eng', hbars(phase, { fmt: f1, max: 100 }) + '<h3>Nach Ergebnis</h3>' + hbars(byRes, { fmt: f1, max: 100 }), { cls: 'w4', note: `Eröffnung: Züge 1–${OPENING_LAST_MOVE}. Endspiel: ab höchstens 20 Punkten Figurenmaterial auf dem Brett (ohne Bauern und Könige).` })}
    ${card('Verwertung', 'eng', bigStats(headedLabels([
      [pc(winning.length ? converted.length / winning.length : null), `Gewinnstellungen verwertet (${converted.length} von ${winning.length})`],
      [gamesCount(thrown), 'Siege verschenkt (von +3 noch verloren)'],
      [gamesCount(thrownBig), 'Must-Wins verschenkt (von +9 noch verloren)'],
      [gamesCount(saved), 'Partien aus Verluststellung gerettet (Remis oder Sieg)'],
      [gamesCount(turned), 'Niederlagen abgewiesen (von −3 noch gewonnen)'],
      [gamesCount(turnedBig), 'Dem Tod von der Schippe gesprungen (von −9 noch gewonnen)'],
      [gamesCount(blownLead.games, signed(blownLead.value)), 'Größter verspielter Vorsprung (Material, und doch verloren)'],
      [gamesCount(comeback.games, signed(comeback.value)), 'Größte Aufholjagd (Material, und doch gewonnen)'],
      [pc(clockBlunders.length ? tt / clockBlunders.length : null), 'der Patzer in Zeitnot (unter 10 % Restzeit)'],
    ])), { cls: 'w12', note: '„Gewinnstellung“: Bewertung mindestens +3 aus deiner Sicht. „Verluststellung“: höchstens −3. Ein erzwungenes Matt zählt als mehr als ±9. Die ±9-Werte sind jeweils ein Teil der ±3-Werte. Vorsprung und Aufholjagd: Materialbilanz in Bauerneinheiten (Bauer 1, Springer/Läufer 3, Turm 5, Dame 9), die mindestens einen Gegenzug lang bestand – aus allen Partien, auch ohne Engine.' })}
    ${card('Wann passieren deine Patzer?', 'eng', columns(moveBins), { cls: 'w8', note: 'Nach Zugnummer.' })}
    ${card('Mit welcher Figur?', 'eng', hbars(pieceRows, { color: 'var(--meta-loss)' }), { cls: 'w4', note: 'Die Figur, die beim Patzer gezogen wurde.' })}
  </div>`;
}

function timeTab(rs, ctx) {
  if (!rs.length) return card('Zeit', '', EMPTY, { cls: 'w12' });
  const how = (result, color) => {
    const l = rs.filter((r) => r.result === result);
    const rows = [...groupBy(l, (r) => r.termination)]
      .sort(byCountDesc)
      .map(([k, x]) => ({ label: TERMINATION_LABEL[k] ?? k, v: x.length, tip: `${TERMINATION_LABEL[k] ?? k}: ${x.length} (${pc(x.length / l.length)})` }));
    if (!rows.length) return '<p class="meta-muted">Keine Partien.</p>';
    return hbars(rows, { color }) + `<div class="meta-total"><span>Gesamt:</span><span>${l.length}</span></div>`;
  };
  const losses = rs.filter((r) => r.result === 'L');
  const timeLosses = losses.filter((r) => r.termination === 'timeout');
  const clocked = rs.filter((r) => r.initialClock && r.ownClockEnd != null && r.result !== 'L');
  const clockRows = ['bullet', 'blitz', 'rapid']
    .map((tc) => {
      const l = clocked.filter((r) => r.timeClass === tc);
      return l.length ? { label: TC_LABEL[tc], v: (avg(l, (r) => Math.min(1, r.ownClockEnd / r.initialClock)) ?? 0) * 100, tip: `${TC_LABEL[tc]}: ${l.length} Partien` } : null;
    })
    .filter(Boolean);
  const pctFmt = (v) => `${Math.round(v)} %`;
  const lengthRows = [[0, 20, 'bis 20'], [21, 30, '21–30'], [31, 40, '31–40'], [41, 50, '41–50'], [51, Infinity, '51+']]
    .map(([a, b, label]) => {
      const l = rs.filter((r) => r.moves >= a && r.moves <= b);
      return l.length ? { label: `${label} Züge`, v: score(l) * 100, tip: `${label} Züge: ${l.length} Partien, Quote ${pc(score(l))}` } : null;
    })
    .filter(Boolean);

  // Sub-tabs (ctx.heatView, switched by metaController): all games, or only wins / losses / draws.
  const view = HEAT_VIEWS.find((v) => v.id === ctx.heatView) ?? HEAT_VIEWS[0];
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0)); // games of this view
  const totals = Array.from({ length: 7 }, () => Array(24).fill(0)); // all games
  const points = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rs) {
    const d = new Date(r.endTime);
    totals[d.getDay()][d.getHours()]++;
    points[d.getDay()][d.getHours()] += pts(r);
    if (!view.result || r.result === view.result) counts[d.getDay()][d.getHours()]++;
  }
  const mx = Math.max(1, ...counts.flat());
  let heat = '<span></span>' + Array.from({ length: 24 }, (_, h) => `<span class="h">${h % 3 === 0 ? h : ''}</span>`).join('');
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    heat += `<span>${WEEKDAYS[day]}</span>`;
    for (let h = 0; h < 24; h++) {
      const n = counts[day][h];
      const all = totals[day][h];
      const step = Math.min(7, Math.ceil((n / mx) * 7));
      const bg = !n ? 'var(--meta-empty)' : view.result ? `color-mix(in srgb, ${view.color} ${30 + step * 10}%, var(--meta-empty))` : HEAT_RAMP[step];
      const tip = view.result
        ? `${n} ${n === 1 ? view.one : view.many}${all ? ` von ${all} Partien` : ''}`
        : `${n} Partien${n ? `, Quote ${pc(points[day][h] / n)}` : ''}`;
      heat += `<span class="c" style="background:${bg}" data-tip="${WEEKDAYS[day]} ${h}–${h + 1} Uhr: ${tip}"></span>`;
    }
  }
  const heatTabs = `<div class="meta-subtabs" role="tablist">${HEAT_VIEWS.map(
    (v) => `<button type="button" role="tab" data-heat="${v.id}" aria-selected="${v === view}"${v.color ? ` style="--tab-color:${v.color}"` : ''}>${v.label}</button>`
  ).join('')}</div>`;
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
    ${card('Wie du gewinnst', 'fast', how('W', 'var(--meta-win)'), { cls: 'w4' })}
    ${card('Wie du verlierst', 'fast', how('L', 'var(--meta-loss)'), { cls: 'w4' })}
    ${card('Wie Remis entstehen', 'fast', how('D', 'var(--meta-draw)'), { cls: 'w4' })}
    ${card('Uhr', 'fast', bigStats([[pc(losses.length ? timeLosses.length / losses.length : null), 'der Niederlagen auf Zeit'], [f0(avg(rs, (r) => r.moves)), 'Ø Züge pro Partie']])
      + '<h3>Ø Restzeit am Ende (ohne Niederlagen)</h3>' + hbars(clockRows, { fmt: pctFmt, max: 100 }), { note: 'Restzeit aus den Uhrzeiten im PGN, in Prozent der Startzeit. Daily-Partien zählen hier nicht.' })}
    ${card('Quote nach Partielänge', 'fast', hbars(lengthRows, { fmt: pctFmt, max: 100 }))}
    ${card('Wann du spielst', 'fast', `${heatTabs}<div class="meta-tbl"><div class="meta-heat">${heat}</div></div>`, { cls: 'w8', note: view.result ? `Farbe = Anzahl ${view.many} (Ende der Partie, Ortszeit). Tooltip: Anteil an allen Partien dieser Stunde.` : 'Farbe = Anzahl Partien (Ende der Partie, Ortszeit). Tooltip zeigt die Quote.' })}
    ${card('Quote nach Tageszeit', 'fast', hbars(slots, { fmt: pctFmt, max: 100 }), { cls: 'w4' })}
    ${card('Serien und Tilt', 'fast', bigStats([
      [pc(score(afterWin)), 'Quote direkt nach einem Sieg'],
      [pc(score(afterLoss)), 'Quote direkt nach einer Niederlage'],
      [longestStreak(chrono, 'W'), 'längste Siegesserie'],
      [longestStreak(chrono, 'L'), 'längste Niederlagenserie'],
    ]), { cls: 'w12', note: 'Ist die Quote nach Niederlagen deutlich schlechter, hilft oft eine kurze Pause nach einer verlorenen Partie.' })}
  </div>`;
}

const GAMES_LIMIT = 200;

function gamesTab(rs, ctx) {
  const list = [...rs].sort((a, b) => b.endTime - a.endTime).slice(0, GAMES_LIMIT);
  const body = rs.length
    ? `<div class="meta-tbl"><table><thead><tr><th>Datum</th><th>Art</th><th></th><th>Gegner</th><th class="r">Elo</th><th>Eröffnung</th><th class="r">Züge</th><th class="r">Gen.</th><th class="r">Patzer</th><th></th></tr></thead><tbody>
      ${list
        .map((r) => {
          const e = ctx.engineOf(r);
          const style = timeClassStyle(r.timeClass);
          return `<tr class="click" data-game="${esc(r.url)}" title="In der Spiel-Analyse öffnen"><td>${fmtDate(r.endTime)}</td><td style="color:${style.color}">${style.emoji} ${TC_LABEL[r.timeClass] ?? r.timeClass}</td><td><span class="meta-colordot ${r.color}"></span></td><td>${flag(ctx.countryOf(r.opponent))} ${esc(r.opponent)}</td><td class="r">${r.oppRating ?? '–'}</td><td${r.opening ? ` data-opening="${esc(r.opening)}"` : ''}>${esc(r.family ?? '–')}</td><td class="r">${r.moves}</td><td class="r">${f1(e?.accuracy)}</td><td class="r">${e ? e.counts.BLUNDER ?? 0 : '–'}</td><td><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span></td></tr>`;
        })
        .join('')}
      </tbody></table></div>`
    : EMPTY;
  const more = rs.length > GAMES_LIMIT ? ` Gezeigt werden die neuesten ${GAMES_LIMIT} von ${rs.length}.` : '';
  return card(`Partien (${rs.length})`, 'fast', body, { cls: 'w12', note: `Zeile anklicken: Partie in der Spiel-Analyse öffnen.${more}` });
}

const RENDERERS = { overview, openings, opponents, quality, time: timeTab, games: gamesTab };

/**
 * @param {string} tab one of META_TABS' ids
 * @param {object[]} records filtered fast records
 * @param {{engineOf: (r) => object|null, countryOf: (name) => string|null, opponent: string|null,
 *   username: string, engineLabel: string, countriesPending: boolean, countriesDone: number, countriesTotal: number}} ctx
 */
export function renderMetaTab(tab, records, ctx) {
  return (RENDERERS[tab] ?? overview)(records, ctx);
}
