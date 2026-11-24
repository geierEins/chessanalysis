// Renders the Meta-Analyse tabs as HTML strings from already-filtered
// per-game records (metaRecords.js). Pure presentation: no state, no I/O -
// js/meta/metaController.js owns the data and calls renderMetaTab() again on
// every filter or tab change. Charts are small hand-drawn SVG/HTML (no
// Chart.js) so a re-render is just one innerHTML swap.

import { timeClassStyle } from '../timeClassStyle.js';
import { countryName } from '../ui/playerLabel.js';
import { iconLabel } from './metaIcons.js';
import { TERMINATION_LABEL, MATE_LABEL, PIECE_LABEL, OPENING_LAST_MOVE, mateInOne, hasMoves } from './metaRecords.js';
import { CATEGORIES, CATEGORY_ORDER } from '../analysis/categories.js';
import { pieceUrl } from './openingBoard.js';
import { TC_ORDER, TC_LABEL, RES_LETTER, RES_WORD, WEEKDAYS, DAY_MS, esc, pts, score, wdl, avg, pc, f1, f0, signed, groupBy, byCountDesc, fold, fmtDate, fmtDateTime, hasRealRating } from './view/format.js';
import { flag, withFlag, setOppFlag, wdlBar, WDL_LEGEND, hbars, card, EMPTY, kpi, GOOD, BAD, bigStats, sortHead, sortRows } from './view/cards.js';
import { NO_MOVES, openTip, LISTED_GAMES_STEP, clearGameLists, gameListById, gamesCount, recordGames, gameListHtml, gameHintHtml, longestStreak, longestStreakGames, streakLink, topGamesTable, topGamesTile, analyzeCell } from './view/gameLists.js';

import { resultPie, shade, pie, columns, clearFitCharts, fitChart, layoutFitCharts, ZOOM_NOTE, timeTicks } from './view/charts.js';
import { mateTab } from './view/mate.js';
import { heatmapTab } from './view/heatmap.js';
import { openings } from './view/openings.js';

// Used by metaController.js, which imports them from here.
export { LISTED_GAMES_STEP, gameListById, gameListHtml, gameHintHtml, layoutFitCharts };

export const META_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'openings', label: 'Eröffnungen' },
  { id: 'opponents', label: 'Gegner & Länder' },
  // The only tab built on engine values - its tooltip says so (no per-card badges).
  {
    id: 'quality',
    label: 'Spielqualität',
    tip: 'Statistiken zur Genauigkeit deiner Züge: Die Engine bewertet jeden Zug. Nur Partien mit Engine-Analyse zählen, also mit der Lupe oder automatisch analysierte.',
  },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'mate', label: 'Matt', tip: 'Mit welchen Mattbildern deine Partien enden - gesetzt und kassiert. Erkannt aus der Schlussstellung, ohne Engine.' },
  { id: 'time', label: 'Zeit & Partieende' },
  { id: 'games', label: 'Partien' },
];

const HEAT_RAMP = ['#1d2a3d', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];

// ---------- small helpers ----------

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


/** @returns {{legend: string, body: string}} the legend (for the card's title row) and the chart */
function ratingChart(rs) {
  const series = TC_ORDER.map((tc) => [tc, rs.filter((r) => r.timeClass === tc && hasRealRating(r))]).filter(([, l]) => l.length >= 2);
  if (!series.length) return { legend: '', body: '<p class="meta-muted">Zu wenige Partien mit Wertung.</p>' };
  const all = series.flatMap(([, l]) => l);
  const x0 = Math.min(...all.map((r) => r.endTime));
  const x1 = Math.max(...all.map((r) => r.endTime));
  const lines = series.map(([tc, list]) => [tc, [...list].sort((a, b) => a.endTime - b.endTime)]);
  const legend = lines
    .map(([tc, sorted]) => `<span><i style="background:${timeClassStyle(tc).color}"></i>${TC_LABEL[tc]} ${sorted[0].ownRating} → <b style="color:${timeClassStyle(tc).color}">${sorted[sorted.length - 1].ownRating}</b></span>`)
    .join('');
  const P = { l: 40, r: 14, t: 8, b: 22 };
  // Drawn at the box's pixel size (fitChart), so text and lines keep their size on a wide card.
  // view: the visible time range, see fitChart's zoom.
  const draw = (W, H, view = { from: x0, to: x1 }) => {
    const { from, to } = view;
    // The y axis follows the games in view (all of them, should none be).
    const inView = all.filter((r) => r.endTime >= from && r.endTime <= to);
    const ys = (inView.length ? inView : all).map((r) => r.ownRating);
    const span = Math.max(...ys) - Math.min(...ys);
    const step = span > 600 ? 200 : span > 250 ? 100 : span > 100 ? 50 : 25;
    const y0 = Math.floor((Math.min(...ys) - 10) / step) * step;
    const y1 = Math.ceil((Math.max(...ys) + 10) / step) * step;
    const X = (x) => P.l + ((x - from) / Math.max(1, to - from)) * (W - P.l - P.r);
    const Y = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
    let s = `<defs><clipPath id="meta-elo-clip"><rect x="${P.l - 4}" y="0" width="${W - P.l - P.r + 8}" height="${H}"/></clipPath></defs>`;
    for (let y = y0; y <= y1; y += step) {
      s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${P.l - 6}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`;
    }
    for (const { t, label } of timeTicks(from, to, W - P.l - P.r, 70)) {
      s += `<text x="${X(t)}" y="${H - 6}" text-anchor="middle">${label}</text>`;
    }
    let marks = '';
    for (const [tc, sorted] of lines) {
      const col = timeClassStyle(tc).color;
      marks += `<polyline fill="none" stroke="${col}" stroke-width="1.25" stroke-linejoin="round" points="${sorted.map((r) => `${X(r.endTime).toFixed(1)},${Y(r.ownRating).toFixed(1)}`).join(' ')}"/>`;
      const last = sorted[sorted.length - 1];
      marks += `<circle cx="${X(last.endTime)}" cy="${Y(last.ownRating)}" r="3" fill="${col}" stroke="var(--meta-panel)" stroke-width="1.5"/>`;
    }
    s += `<g clip-path="url(#meta-elo-clip)">${marks}</g>`;
    for (const [tc, sorted] of lines) {
      for (const r of sorted) {
        if (r.endTime < from || r.endTime > to) continue;
        s += `<circle cx="${X(r.endTime).toFixed(1)}" cy="${Y(r.ownRating).toFixed(1)}" r="5" fill="transparent" data-tip="${TC_LABEL[tc]} · ${fmtDate(r.endTime)}\nWertung ${r.ownRating} · ${RES_WORD[r.result]} gegen ${esc(r.opponent)}"/>`;
      }
    }
    return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elo-Verlauf">${s}</svg>`;
  };
  return {
    legend: `<div class="meta-legend spaced">${legend}</div>`,
    body: fitChart(draw, { height: 180, zoom: { key: 'rating', min: x0, max: x1, minSpan: DAY_MS, l: P.l, r: P.r } }),
  };
}

/** One column per calendar day of the period (local time), stacked by game type;
 *  days without a game stay empty. @returns {{legend: string, body: string}} */
function gamesPerDayChart(rs) {
  const dayOf = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return +d;
  };
  const byDay = groupBy(rs, (r) => dayOf(r.endTime));
  const first = Math.min(...byDay.keys());
  const last = Math.max(...byDay.keys());
  const days = [];
  // setDate steps keep local midnight across daylight-saving changes.
  for (const d = new Date(first); +d <= last; d.setDate(d.getDate() + 1)) days.push(+d);
  const max = Math.max(...[...byDay.values()].map((l) => l.length));
  const types = TC_ORDER.filter((tc) => rs.some((r) => r.timeClass === tc));
  const active = byDay.size;
  const legend = types.map((tc) => `<span><i style="background:${timeClassStyle(tc).color}"></i>${TC_LABEL[tc]}</span>`).join('')
    + `<span class="meta-muted">${active} von ${days.length} Tagen gespielt · Ø ${f1(rs.length / active)} an Spieltagen · max. ${max}</span>`;
  const P = { l: 34, r: 10, t: 8, b: 22 };
  const dayIndex = new Map(days.map((t, i) => [t, i]));
  // x runs in days: day i's column covers i..i+1. view: the visible part, see fitChart's zoom.
  const draw = (W, H, view = { from: 0, to: days.length }) => {
    const { from, to } = view;
    const i0 = Math.max(0, Math.floor(from));
    const i1 = Math.min(days.length - 1, Math.ceil(to) - 1);
    // The y axis follows the days in view.
    let maxInView = 1;
    for (let i = i0; i <= i1; i++) maxInView = Math.max(maxInView, byDay.get(days[i])?.length ?? 0);
    const lines = Math.max(2, Math.floor((H - P.t - P.b) / 26));
    const step = [1, 2, 5, 10, 20, 25, 50, 100].find((x) => maxInView / x <= lines) ?? 200;
    const top = Math.ceil(maxInView / step) * step;
    const bw = (W - P.l - P.r) / Math.max(1e-9, to - from);
    const gap = bw > 6 ? 1.5 : bw > 3 ? 0.75 : 0;
    const X = (u) => P.l + (u - from) * bw;
    const Y = (v) => H - P.b - (v / top) * (H - P.t - P.b);
    let s = `<defs><clipPath id="meta-perday-clip"><rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}"/></clipPath></defs>`;
    for (let v = 0; v <= top; v += step) {
      s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    // Labels under the column centers whose day is in view, ~60 px apart.
    for (const { t, label } of timeTicks(days[i0], days[i1], W - P.l - P.r, 60)) {
      const i = dayIndex.get(t);
      if (i != null) s += `<text x="${X(i + 0.5)}" y="${H - 6}" text-anchor="middle">${label}</text>`;
    }
    let bars = '';
    for (let i = i0; i <= i1; i++) {
      const t = days[i];
      const list = byDay.get(t);
      if (!list) continue;
      const x = X(i) + gap / 2;
      let y = Y(0);
      const parts = [];
      for (const tc of types) {
        const n = list.filter((r) => r.timeClass === tc).length;
        if (!n) continue;
        const h = Y(0) - Y(n);
        y -= h;
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.8, bw - gap).toFixed(1)}" height="${h.toFixed(1)}" fill="${timeClassStyle(tc).color}"/>`;
        parts.push(`${TC_LABEL[tc]} ${n}`);
      }
      const c = wdl(list);
      const date = new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
      // Hover target: the whole column height, so even a 1-game day is easy to hit.
      bars += `<rect x="${X(i).toFixed(1)}" y="${P.t}" width="${bw.toFixed(1)}" height="${H - P.t - P.b}" fill="transparent" data-tip="${date}: **${list.length} ${list.length === 1 ? 'Partie' : 'Partien'}**\n${parts.join(' · ')}\n${c.W} S · ${c.D} R · ${c.L} N"/>`;
    }
    s += `<g clip-path="url(#meta-perday-clip)">${bars}</g>`;
    s += `<line class="meta-axis" x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Partien pro Tag">${s}</svg>`;
  };
  return {
    legend: `<div class="meta-legend spaced">${legend}</div>`,
    body: fitChart(draw, { height: 160, zoom: { key: 'perDay', min: 0, max: days.length, minSpan: Math.min(days.length, 3), l: P.l, r: P.r } }),
  };
}

const DAY_MIN_GAMES = 3; // a day with one won game would otherwise always be "the best"
const DAYS_NOTE = `Siegesquote = Siege / Partien des Tages, nur Tage mit mindestens ${DAY_MIN_GAMES} Partien. Bei Gleichstand zählt der Tag mit mehr Partien. Anzahl anklicken: die Partien des Tages.`;

/** The 3 days with the highest and the lowest win rate. @returns {{best: string, worst: string}} rows for two cards */
function bestWorstDays(rs) {
  const dayOf = (ms) => new Date(ms).setHours(0, 0, 0, 0);
  const days = [...groupBy(rs, (r) => dayOf(r.endTime))]
    .filter(([, l]) => l.length >= DAY_MIN_GAMES)
    .map(([day, l]) => ({ day, l, rate: wdl(l).W / l.length }));
  const rows = (list) => {
    if (!list.length) return `<p class="meta-muted">Keine Tage mit mindestens ${DAY_MIN_GAMES} Partien.</p>`;
    return `<div class="meta-rows">${list.map(({ day, l, rate }) => {
      const date = new Date(day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
      return `<div class="meta-pair"><div class="meta-card-head small"><span>${date}</span><span class="meta-muted">${gamesCount(l, `${l.length} Partien`)} · <b>${pc(rate)}</b> Siege</span></div>${wdlBar(l)}</div>`;
    }).join('')}</div>${WDL_LEGEND}`;
  };
  const best = [...days].sort((a, b) => b.rate - a.rate || b.l.length - a.l.length).slice(0, 3);
  const worst = [...days].sort((a, b) => a.rate - b.rate || b.l.length - a.l.length).slice(0, 3);
  return { best: rows(best), worst: rows(worst) };
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

/** "Basis: 180 von 220 Partien" under engine cards when not every game is analyzed yet. */
function coverageNote(ctx, withEngine, total) {
  if (withEngine === total) return '';
  return `Basis: ${withEngine} von ${total} Partien mit Engine-Werten (${esc(ctx.engineLabel)}). Die Lupe analysiert die fehlenden.`;
}

function noEngineCard(ctx) {
  return card('Noch keine Engine-Werte',
    `<p class="meta-muted">Für <b>${esc(ctx.engineLabel)}</b> ist für diese Partien noch nichts analysiert. Die Lupe oben startet die Analyse.</p>`,
    { cls: 'w12' });
}

// ---------- tabs ----------

/** The overview's newest games, one compact clickable row each: result, color,
 *  game type and opponent, then moves, accuracy and date. */
function recentGames(list, ctx) {
  const rows = list.map((r) => {
    const style = timeClassStyle(r.timeClass);
    const acc = ctx.engineOf(r)?.accuracy;
    return `<tr class="click" data-game="${esc(r.url)}"${openTip(r)}>`
      + `<td><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span></td>`
      + `<td><span class="meta-colordot ${r.color}" title="${r.color === 'w' ? 'Weiß' : 'Schwarz'}"></span></td>`
      + `<td class="meta-top-opp" style="color:${style.color}" title="${esc(TC_LABEL[r.timeClass] ?? r.timeClass)} vs ${esc(r.opponent)}">${style.icon} vs ${withFlag(r.opponent)}</td>`
      + `<td class="r">${r.moves} Zg.</td>`
      // Accuracy, a fixed-width column - without engine values the "Partien"
      // tab's magnifier / spinner / hourglass instead (analyzeCell).
      + (!hasMoves(r)
        ? `<td class="r meta-recent-acc">${NO_MOVES}</td>`
        : acc == null
          ? analyzeCell(r, ctx, 'r meta-recent-acc')
          : `<td class="r meta-recent-acc">${f1(acc)} %</td>`)
      + `<td class="r meta-muted" data-tip="${fmtDateTime(r.endTime)}">${fmtDate(r.endTime)}</td></tr>`;
  });
  return rows.length ? `<div class="meta-tbl"><table class="meta-top">${rows.join('')}</table></div>` : '<p class="meta-muted">Keine Partien.</p>';
}

/** Games per calendar day on average, days without a game included: from the
 *  first game's day to today (or to the time filter's end, if earlier). */
function gamesPerDayKpi(chrono, ctx) {
  const dayStart = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const first = dayStart(chrono[0].endTime);
  const last = dayStart(Math.min(Date.now(), ctx.filterTo ? +ctx.filterTo : Infinity));
  // Calendar-date difference via UTC, so a DST change doesn't shift the count.
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(1, Math.round((utc(last) - utc(first)) / 86400000) + 1);
  const perDay = chrono.length / days;
  return kpi('📅 Partien pro Tag', perDay.toLocaleString('de-DE', { maximumFractionDigits: perDay < 1 ? 2 : 1 }),
    `<span title="über ${days.toLocaleString('de-DE')} ${days === 1 ? 'Tag' : 'Tage'}">seit ${fmtDate(chrono[0].endTime)}</span>`, '', '#4a9fe2');
}

function overview(rs, ctx) {
  if (!rs.length) return card('Übersicht', EMPTY, { cls: 'w12' });
  const c = wdl(rs);
  const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
  const withEngine = rs.filter((r) => ctx.engineOf(r));
  const wdlDetail = `<span class="meta-wdl-nums"><b class="w">${c.W} S</b><b class="d">${c.D} R</b><b class="l">${c.L} N</b></span>`;
  const promoted = rs.filter((r) => r.promotions);
  const promotions = promoted.reduce((a, r) => a + r.promotions, 0);
  const kpis = `<div class="meta-kpis">
    ${kpi('♟️ Partien', rs.length, wdlDetail, '', 'var(--meta-s1)')}
    ${gamesPerDayKpi(chrono, ctx)}
    ${kpi('🧠 Genauigkeit', f1(avg(withEngine, (r) => ctx.engineOf(r).accuracy)), withEngine.length ? `Gegner ${f1(avg(withEngine, (r) => ctx.engineOf(r).oppAccuracy))}` : 'noch keine Engine-Werte', '', '#4bc2a3')}
    ${kpi('🎯 Punkte-Quote', pc(score(rs)), 'Sieg = 1, Remis = ½', '', '#e2b84a')}
    ${kpi('🔥 Längste Siegesserie', streakLink(longestStreakGames(chrono, 'W')), 'Partien in Folge', '', '#f08a3c')}
    ${kpi('💔 Niederlagen in Folge', streakLink(longestStreakGames(chrono, 'L')), 'längste Serie', '', 'var(--meta-loss)')}
    ${kpi('♛ Umgewandelte Bauern', gamesCount(promoted, promotions), `in ${promoted.length} ${promoted.length === 1 ? 'Partie' : 'Partien'}`, '', '#9b7fe0')}
  </div>`;
  const row = (label, list) =>
    list.length
      ? `<div class="meta-pair"><div class="meta-card-head small"><span>${label}</span><span class="meta-muted">${list.length} Partien · ${pc(score(list))}</span></div>${wdlBar(list)}</div>`
      : '';
  const byColor = row('<span class="meta-colordot w"></span> Mit Weiß', rs.filter((r) => r.color === 'w'))
    + row('<span class="meta-colordot b"></span> Mit Schwarz', rs.filter((r) => r.color === 'b'));
  const byTc = TC_ORDER.map((tc) => row(`<span style="color:${timeClassStyle(tc).color}">${timeClassStyle(tc).icon} ${TC_LABEL[tc]}</span>`, rs.filter((r) => r.timeClass === tc))).join('');
  const rating = ratingChart(rs);
  const perDay = gamesPerDayChart(rs);
  const days = bestWorstDays(rs);
  return kpis + `<div class="meta-grid">
    <div class="meta-overview-row">
      ${card('Sieg, Remis, Niederlage', resultPie(rs))}
      ${card('Nach Farbe und Spielart', `<div class="meta-rows">${byColor}${byTc}</div>${WDL_LEGEND}`)}
      ${card('Die letzten 7 Partien', recentGames(chrono.slice(-7).reverse(), ctx), { note: 'Die 7 neuesten Partien zu den Filtern. Genauigkeit nur mit Engine-Werten, sonst analysiert die Lupe die Partie.' })}
    </div>
    ${card('Elo-Verlauf', rating.body, { cls: 'w12', mid: rating.legend, note: ZOOM_NOTE })}
    ${card('Partien pro Tag', perDay.body, { cls: 'w12', mid: perDay.legend, note: ZOOM_NOTE })}
    ${card('Beste Tage', days.best, { cls: 'w6', note: DAYS_NOTE })}
    ${card('Schlechteste Tage', days.worst, { cls: 'w6', note: DAYS_NOTE })}
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
  if (!rs.length) return card('Gegner', EMPTY, { cls: 'w12' });
  let h2h = '';
  if (ctx.opponent) {
    const c = wdl(rs);
    const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
    const withEngine = rs.filter((r) => ctx.engineOf(r));
    const fam = [...groupBy(rs.filter((r) => r.family), (r) => r.family)].sort(byCountDesc)[0]?.[0];
    const oppName = rs[0].opponent;
    h2h = card(`Direktvergleich mit ${esc(oppName)}`, `
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
  // "Woher kommen deine Gegner?" can be narrowed by a search text (metaController's
  // countrySearch) - over all countries, not just the top ones; case and accents don't matter.
  const query = fold((ctx.countrySearch ?? '').trim());
  const shownCountries = query ? countries.filter(([code]) => fold(countryName(code)).includes(query) || code.toLowerCase() === query) : topCountries;
  const countryRows = shownCountries.map(([code, l]) => ({ label: countryName(code), labelHtml: countryLabel(code), v: l.length, valHtml: gamesCount(l), tip: `${countryName(code)}: ${l.length} Partien` }));
  const countrySearch = `<input type="search" class="meta-country-search" data-country-search value="${esc(ctx.countrySearch ?? '')}" placeholder="Land suchen …" aria-label="Land suchen" autocomplete="off">`;
  const countryBars = query && !countryRows.length
    ? `<p class="meta-muted">Kein Land passt zu „${esc(ctx.countrySearch.trim())}“.</p>`
    : hbars(countryRows, { max: Math.max(1, ...countries.map(([, l]) => l.length)) });
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
    ${card('Woher kommen deine Gegner?', countries.length ? `${countrySearch}${countryBars}` : `<p class="meta-muted">${pending ? 'Länder werden geladen …' : 'Keine Länderangaben.'}</p>`, { note: `${countries.length ? `${query ? `${shownCountries.length} von ${countries.length} Ländern passen zur Suche.` : limitNote} ` : ''}${pendingNote}`, head: limitPicker(ctx.countryLimit) })}
    ${card('Quote nach Land', countries.length ? countryTable : '<p class="meta-muted">Noch keine Daten.</p>', { note: countries.length ? limitNote : '', head: limitPicker(ctx.countryLimit) })}
    ${card('Häufigste Gegner', oppTable, { note: 'Zeile anklicken: Statistik nur gegen diesen Gegner.' })}
    ${card('Gegen Stärkere und Schwächere', `<div class="meta-rows">${diffRows}</div>`, { note: 'Erwartete Quote nach Elo-Formel aus dem Wertungsunterschied, verglichen mit dem tatsächlichen Ergebnis. Nur gewertete Partien.' })}
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
  return `<div class="meta-kpi mix" style="--kpi-accent:#86b54c"><span class="l">${iconLabel(`🧩 Zugqualität · Anteil an allen ${own.n} gespielten Zügen`)}</span>
    <div class="meta-mix-rows"><span class="meta-muted">Du</span>${bar(own, 'Du')}<span class="meta-muted">Gegner</span>${bar(opp, 'Gegner')}</div>
    <div class="meta-mix-chips">${chips}</div>
    <span class="d">▲ / ▼: höherer / niedrigerer Anteil als bei deinen Gegnern. Brilliant-Züge zählen hier nicht mit.</span></div>`;
}

// The gauge's red -> yellow -> green scale (the result colors), as [position 0..1, rgb].
const GAUGE_STOPS = [[0, [230, 103, 103]], [0.5, [242, 201, 76]], [1, [129, 182, 76]]];

/** The scale's color at position t (0..1), mixed between its two nearest stops. */
function gaugeColor(t) {
  const i = t <= 0.5 ? 0 : 1;
  const [[t0, c0], [t1, c1]] = [GAUGE_STOPS[i], GAUGE_STOPS[i + 1]];
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(' ')})`;
}

/** "Ø Genauigkeit" as a speedometer: a 0-100 half-circle scale filled up to
 *  your accuracy in a red-yellow-green gradient, a needle on it and a thin one
 *  for the opponents'. Yours is green, theirs takes the scale's color under its needle. */
function accuracyGauge(own, opp) {
  const R = 78;
  const angle = (v) => Math.PI * (1 - Math.max(0, Math.min(100, v ?? 0)) / 100);
  const at = (v, r = R) => {
    const a = angle(v);
    return [(100 + r * Math.cos(a)).toFixed(2), (98 - r * Math.sin(a)).toFixed(2)];
  };
  // The gradient runs left to right across the arc, so the color at a value is
  // the one at its point's horizontal position - not linear in the value itself.
  const colorAt = (v) => gaugeColor((1 - Math.cos(angle(v))) / 2);
  const ACC = 'var(--meta-win)'; // your needle, number and the tile's accent: green
  const oppColor = opp == null ? 'var(--meta-muted)' : colorAt(opp);
  const arc = (from, to) => `M${at(from).join(' ')}A${R} ${R} 0 0 1 ${at(to).join(' ')}`;
  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const [x1, y1] = at(v, R + 10);
    const [x2, y2] = at(v, R + 14);
    const [tx, ty] = at(v, R + 22);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="meta-gauge-tick"></line><text x="${tx}" y="${Number(ty) + 3}" text-anchor="middle" class="meta-gauge-label">${v}</text>`;
  }).join('');
  const [nx, ny] = at(own, R - 16);
  const [ox, oy] = at(opp, R - 16); // as long as your needle
  const stops = GAUGE_STOPS.map(([t]) => `<stop offset="${t}" stop-color="${gaugeColor(t)}"/>`).join('');
  return `<div class="meta-kpi meta-gauge" style="--kpi-accent:${ACC}"><span class="l">${iconLabel('🧠 Durchschnittliche Genauigkeit')}</span>
    <svg viewBox="-6 -10 212 140" role="img" aria-label="Ø Genauigkeit ${f1(own)}, Gegner ${f1(opp)}">
      <defs><linearGradient id="meta-gauge-scale" gradientUnits="userSpaceOnUse" x1="${100 - R}" y1="0" x2="${100 + R}" y2="0">${stops}</linearGradient></defs>
      <path d="${arc(0, 100)}" class="meta-gauge-track"></path>
      ${own == null ? '' : `<path d="${arc(0, own)}" class="meta-gauge-fill" style="--glow:${ACC}" data-tip="Deine Ø Genauigkeit: ${f1(own)}"></path>`}
      ${ticks}
      ${opp == null ? '' : `<line x1="100" y1="98" x2="${ox}" y2="${oy}" class="meta-gauge-needle opp" style="stroke:${oppColor}" data-tip="Ø Genauigkeit deiner Gegner: ${f1(opp)}"></line>`}
      ${own == null ? '' : `<line x1="100" y1="98" x2="${nx}" y2="${ny}" class="meta-gauge-needle" style="stroke:${ACC}"></line>`}
      <circle cx="100" cy="98" r="5" class="meta-gauge-pivot"></circle>
      <text x="100" y="124" text-anchor="middle" class="meta-gauge-value" style="fill:${ACC}">${f1(own)}</text>
    </svg>
    <span class="d">Gegner <b class="meta-gauge-oppval" style="color:${oppColor}">${f1(opp)}</b></span></div>`;
}

const RES_COLOR = { W: 'var(--meta-win)', D: 'var(--meta-draw)', L: 'var(--meta-loss)' };

/** Accuracy per game in playing order: one dot per game (colored by result) and a
 *  moving average for you and your opponents, so a trend shows through the noise.
 *  @returns {{legend: string, body: string}} */
function accuracyTrendChart(es, E) {
  const games = es.filter((r) => E(r).accuracy != null).sort((a, b) => a.endTime - b.endTime);
  if (games.length < 2) return { legend: '', body: '<p class="meta-muted">Zu wenige analysierte Partien.</p>' };
  const n = games.length;
  // Window grows with the number of games: smooth enough for many, still reactive for few.
  const win = Math.max(5, Math.min(50, Math.round(n / 15)));
  const rolling = (get) => games.map((_, i) => {
    const xs = games.slice(Math.max(0, i + 1 - win), i + 1).map(get).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  });
  const own = rolling((r) => E(r).accuracy);
  const opp = rolling((r) => E(r).oppAccuracy);
  const OWN = 'var(--meta-s1)';
  const OPP = 'var(--meta-muted)';
  const legend = `<span><i style="background:${OWN}"></i>Du (Ø ${win} Partien) <b style="color:${OWN}">${f1(own[n - 1])}</b></span>`
    + `<span><i style="background:${OPP}"></i>Gegner (Ø ${win} Partien) <b>${f1(opp[n - 1])}</b></span>`;
  const P = { l: 34, r: 14, t: 8, b: 22 };
  // view: the visible range of game indices (fractional while zoomed), see fitChart's zoom.
  const draw = (W, H, view = { from: 0, to: n - 1 }) => {
    const { from, to } = view;
    const i0 = Math.max(0, Math.floor(from));
    const i1 = Math.min(n - 1, Math.ceil(to));
    // One game beyond each edge, so the lines run out of the picture instead of stopping short.
    const idx = [];
    for (let i = Math.max(0, i0 - 1); i <= Math.min(n - 1, i1 + 1); i++) idx.push(i);
    const shown = idx.filter((i) => i >= from - 1e-9 && i <= to + 1e-9);
    // The y axis follows what is visible.
    const lo = Math.min(50, Math.floor(Math.min(...shown.map((i) => E(games[i]).accuracy)) / 10) * 10);
    const X = (i) => P.l + ((i - from) / Math.max(1e-9, to - from)) * (W - P.l - P.r);
    const Y = (v) => H - P.b - ((v - lo) / (100 - lo)) * (H - P.t - P.b);
    let s = `<defs><clipPath id="meta-acc-clip"><rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}"/></clipPath></defs>`;
    for (let v = lo; v <= 100; v += 10) {
      s += `<line class="meta-grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    // Game numbers on the x axis, ~70 px apart, on round steps.
    const span = to - from + 1;
    const want = Math.max(2, Math.floor((W - P.l - P.r) / 70));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((x) => span / x <= want) ?? 10000;
    for (let g = Math.ceil((from + 1) / step) * step; g <= to + 1; g += step) {
      s += `<text x="${X(g - 1)}" y="${H - 6}" text-anchor="middle">${g}</text>`;
    }
    s += `<line class="meta-axis" x1="${P.l}" x2="${W - P.r}" y1="${Y(lo)}" y2="${Y(lo)}"/>`;
    const dotR = shown.length > 300 ? 1.5 : shown.length > 100 ? 2 : shown.length > 30 ? 2.5 : 3.5;
    let marks = '';
    for (const i of shown) {
      marks += `<circle cx="${X(i).toFixed(1)}" cy="${Y(E(games[i]).accuracy).toFixed(1)}" r="${dotR}" fill="${RES_COLOR[games[i].result]}" opacity="0.45"/>`;
    }
    const line = (vals, col, width) => {
      const pts = idx.filter((i) => vals[i] != null).map((i) => `${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`);
      return `<polyline fill="none" stroke="${col}" stroke-width="${width}" stroke-linejoin="round" points="${pts.join(' ')}"/>`;
    };
    marks += line(opp, OPP, 1.5) + line(own, OWN, 2.5);
    s += `<g clip-path="url(#meta-acc-clip)">${marks}</g>`;
    // Invisible hover targets, one column per game.
    const bw = (W - P.l - P.r) / Math.max(1, to - from);
    for (const i of shown) {
      const r = games[i];
      const e = E(r);
      s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${P.t}" width="${Math.max(1, bw).toFixed(1)}" height="${H - P.t - P.b}" fill="transparent" data-tip="Partie ${i + 1} · ${fmtDate(r.endTime)}\n${RES_WORD[r.result]} gegen ${esc(r.opponent)}\nGenauigkeit ${f1(e.accuracy)} · Gegner ${f1(e.oppAccuracy)}\nØ ${win} Partien: du ${f1(own[i])} · Gegner ${f1(opp[i])}"/>`;
    }
    return `<svg class="meta-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Genauigkeit">${s}</svg>`;
  };
  return {
    legend: `<div class="meta-legend spaced">${legend}</div>`,
    body: fitChart(draw, { height: 220, zoom: { key: 'accuracyTrend', min: 0, max: n - 1, minSpan: 4, l: P.l, r: P.r } }),
  };
}

function quality(rs, ctx) {
  if (!rs.length) return card('Spielqualität', EMPTY, { cls: 'w12' });
  const es = rs.filter((r) => ctx.engineOf(r));
  if (!es.length) return `<div class="meta-grid">${noEngineCard(ctx)}</div>`;
  const E = (r) => ctx.engineOf(r);
  const note = coverageNote(ctx, es.length, rs.filter(hasMoves).length);
  const kpis = `<div class="meta-kpis quality">
    ${accuracyGauge(avg(es, (r) => E(r).accuracy), avg(es, (r) => E(r).oppAccuracy))}
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

  const trend = accuracyTrendChart(es, E);

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
    ${card('Verteilung der Genauigkeit', columns(bins), { cls: 'w8', note: note || 'Genauigkeit je Partie, nach derselben Formel wie in der Einzelanalyse.' })}
    ${card('Genauigkeit nach Phase', hbars(phase, { fmt: f1, max: 100 }) + '<h3>Nach Ergebnis</h3>' + hbars(byRes, { fmt: f1, max: 100 }), { cls: 'w4', note: `Eröffnung: Züge 1–${OPENING_LAST_MOVE}. Endspiel: ab höchstens 20 Punkten Figurenmaterial auf dem Brett (ohne Bauern und Könige).` })}
    ${card('Verlauf der Genauigkeit', trend.body, { cls: 'w12', mid: trend.legend, note: 'Jeder Punkt ist eine Partie (grün Sieg, gelb Remis, rot Niederlage), in der Reihenfolge, in der du sie gespielt hast. Die Linien zeigen den gleitenden Durchschnitt. ' + ZOOM_NOTE })}
    ${card('Verwertung', `<div class="meta-kpis five">
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
    ${card('Wann passieren deine Patzer?', columns(moveBins), { cls: 'w8', note: 'Nach Zugnummer.' })}
    ${card('Patzer mit welcher Figur?', hbars(pieceRows, { color: 'var(--meta-loss)' }), { cls: 'w4', note: 'Die Figur, die beim Patzer gezogen wurde.' })}
  </div>`;
}

function timeTab(rs, ctx) {
  if (!rs.length) return card('Zeit', EMPTY, { cls: 'w12' });
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
    ${card('Wie du gewinnst', how('W', 'var(--meta-win)'), { cls: 'w4', accent: 'var(--meta-win)' })}
    ${card('Wie du verlierst', how('L', 'var(--meta-loss)'), { cls: 'w4', accent: 'var(--meta-loss)' })}
    ${card('Wie Remis entstehen', how('D', 'var(--meta-draw)'), { cls: 'w4', accent: 'var(--meta-draw)' })}
    ${card('Kürzeste Partien', topGamesTable(byEnding(rs, ctx.endings.shortest).sort((a, b) => a.moves - b.moves || b.endTime - a.endTime)), { head: endingPicker('shortest', ctx.endings.shortest), note: ENDING_NOTE })}
    ${card('Längste Partien', topGamesTable(byEnding(rs, ctx.endings.longest).sort((a, b) => b.moves - a.moves || b.endTime - a.endTime)), { head: endingPicker('longest', ctx.endings.longest), note: ENDING_NOTE })}
    <div class="meta-stack">
      ${card('Uhr', bigStats([
        [avgDuration == null ? '–' : fmtSeconds(avgDuration), 'Ø Dauer pro Partie'],
        [f0(avg(rs, (r) => r.moves)), 'Ø Züge pro Partie'],
        [pc(losses.length ? timeLosses.length / losses.length : null), 'der Niederlagen auf Zeit'],
        [avgClockLeft == null ? '–' : fmtSeconds(avgClockLeft), 'Ø Restzeit auf deiner Uhr'],
      ]), { note: 'Dauer: verbrauchte Zeit beider Uhren aus dem PGN. Restzeit: was am Ende der Partie noch auf deiner Uhr stand, auch bei Niederlagen. Beides ohne Daily-Partien.' })}
      ${card('Quote nach Partielänge', hbars(lengthRows, { fmt: pctFmt, max: 100 }))}
    </div>
    <div class="meta-stack w8 fit">
      <div class="meta-side-by-side">
        ${card('Zeit pro Zug', moveTimeChart(rs), { note: 'Ø Bedenkzeit für deinen 1. bis 50. Zug, je Spielart. Ein Punkt erscheint ab 3 Partien, die so lange gingen.' })}
        ${card('Längste Königsreisen', topGamesTable(rs.filter((r) => r.kingMoves > 0).sort((a, b) => b.kingMoves - a.kingMoves || b.endTime - a.endTime), (r) => `<b>${r.kingMoves}</b> Königszüge`), { note: 'Partien, in denen dein König am häufigsten gezogen hat (Rochade eingerechnet).' })}
      </div>
      ${card('Dauer der Partien', durationColumns(timed), { note: 'Verbrauchte Zeit beider Uhren aus dem PGN, ohne Daily-Partien. Längere Partien als 20 Minuten stehen gesammelt in „20+“.' })}
    </div>
    ${card('Wann du spielst', `<div class="meta-tbl"><div class="meta-heat">${heat}</div></div>`, { cls: 'w8', note: 'Farbe = Anzahl Partien (Ende der Partie, Ortszeit). Tooltip zeigt die Quote.' })}
    <div class="meta-stack">
      ${card('Quote nach Tageszeit', hbars(slots, { fmt: pctFmt, max: 100 }))}
      ${card('Serien und Tilt', bigStats([
        [longestStreak(chrono, 'W'), 'längste Siegesserie'],
        [longestStreak(chrono, 'L'), 'längste Niederlagenserie'],
        [pc(score(afterWin)), 'Quote direkt nach einem Sieg'],
        [pc(score(afterLoss)), 'Quote direkt nach einer Niederlage'],
      ]))}
    </div>
  </div>`;
}

// Rows of the "Partien" table shown at first - the button under it adds this many more (ctx.gamesShown).
export const GAMES_STEP = 200;

/** A game's rating change, green/red - '' without one. Chess.com only
 *  stores ratings, so it comes from the previous game (metaController). */
function eloDelta(v) {
  if (v == null) return '';
  // A diagonal arrow instead of the sign: ↗ won rating, ↘ lost it.
  return `<span class="meta-elo-delta ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '↗ ' : v < 0 ? '↘ ' : ''}${Math.abs(v)}</span>`;
}

// The "Partien" table's sortable columns: [key, head label, head class, label in the phones' sort select].
// The table head (gamesTab) and the phones' select (gamesSortSelect) both come from here.
const GAMES_SORTS = [['date', 'Datum', '', 'Datum'], ['elo', 'Gegner Elo', '', 'Gegner Elo'], ['moves', 'Züge', 'r', 'Züge'], ['acc', 'Gen.', 'r', 'Genauigkeit'], ['blunders', 'Patzer', 'r', 'Patzer']];

/** Phones only (css/styles.css): the table head's sorting as one select - metaController handles data-games-sort. */
function gamesSortSelect(sort) {
  const opts = GAMES_SORTS.flatMap(([key, , , label]) => [['desc', '↓'], ['asc', '↑']].map(([dir, arrow]) => {
    const on = sort.key === key && sort.dir === dir;
    return `<option value="${key}:${dir}"${on ? ' selected' : ''}>${label} ${arrow}</option>`;
  }));
  return `<label class="meta-games-sort">Sortieren <select data-games-sort aria-label="Partien sortieren">${opts.join('')}</select></label>`;
}

function gamesTab(all, ctx) {
  // Opponent search (metaController's gameSearch): narrows the table on every keystroke.
  const query = fold((ctx.gameSearch ?? '').trim());
  const rs = query ? all.filter((r) => fold(r.opponent).includes(query)) : all;
  const search = all.length
    ? `<input type="search" class="meta-country-search" data-game-search value="${esc(ctx.gameSearch ?? '')}" placeholder="Gegner suchen …" aria-label="Gegner suchen" autocomplete="off">`
    : '';
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
    .map((x) => x.r);
  // A marked streak (metaController, from the overview) is always shown in full, even past the limit.
  const lastMarked = ctx.marked ? list.findLastIndex((r) => ctx.marked.has(r.url)) : -1;
  list.length = Math.min(list.length, Math.max(ctx.gamesShown, lastMarked + 1));
  const left = rs.length - list.length;
  const sortTh = (key) => {
    const [, label, cls] = GAMES_SORTS.find(([k]) => k === key);
    return sortHead('games', sort, key, label, cls);
  };
  const body = rs.length
    ? `${gamesSortSelect(sort)}<div class="meta-tbl"><table class="meta-games"><thead><tr>${sortTh('date')}<th>Art</th><th></th><th>Gegner</th>${sortTh('elo')}<th>Eröffnung</th>${sortTh('moves')}${sortTh('acc')}${sortTh('blunders')}<th></th><th></th></tr></thead><tbody>
      ${list
        .map((r) => {
          const e = ctx.engineOf(r);
          const style = timeClassStyle(r.timeClass);
          // g-* classes: phones lay each row out as two lines (css/styles.css "Phones: game list").
          return `<tr class="click${ctx.marked?.has(r.url) ? ' meta-marked' : ''}" data-game="${esc(r.url)}"${openTip(r)}><td class="g-date" data-tip="${fmtDateTime(r.endTime)}">${fmtDate(r.endTime)}</td><td class="g-type" style="color:${style.color}">${style.icon}<span class="g-type-l"> ${TC_LABEL[r.timeClass] ?? r.timeClass}</span></td><td class="g-color"><span class="meta-colordot ${r.color}"></span></td><td class="g-opp">${withFlag(r.opponent)}</td><td class="g-elo">${r.oppRating ?? '–'}</td><td class="g-open"${r.opening ? ` data-opening="${esc(r.opening)}"` : ''}>${esc(r.family ?? '–')}</td><td class="r g-moves">${r.moves}</td>${hasMoves(r) ? `<td class="r g-acc">${f1(e?.accuracy)}</td><td class="r g-blund">${e ? e.counts.BLUNDER ?? 0 : '–'}</td>` : `<td class="r meta-faint g-acc">–</td><td class="r meta-faint g-blund">–</td>`}<td class="meta-res-elo g-res"${resultTip(r) ? ` data-tip="${resultTip(r)}"` : ''}><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span>${eloDelta(r.ratingDelta)}${r.ownRating != null && r.rated ? `<span class="meta-elo-new" style="color:${style.color}">(${r.ownRating})</span>` : ''}</td>${analyzeCell(r, ctx, 'r g-an')}</tr>`;
        })
        .join('')}
      </tbody></table></div>${left > 0 ? `<button type="button" class="meta-games-more" data-games-more="${list.length}">+ ${Math.min(GAMES_STEP, left)} weitere Partien laden (noch ${left})</button>` : ''}`
    : query && all.length ? `<p class="meta-muted">Kein Gegner passt zu „${esc(ctx.gameSearch.trim())}“.</p>` : EMPTY;
  const more = left > 0 ? ` Gezeigt werden die ersten ${list.length} von ${rs.length} in dieser Sortierung.` : '';
  return card(query ? `Partien (${rs.length} von ${all.length})` : `Partien (${rs.length})`, search + body, { cls: 'w12', note: `Zeile anklicken: Partie in der Spiel-Analyse öffnen. Spaltenkopf anklicken: sortieren. Lupe: Partie analysieren, mehrere reihen sich nacheinander ein.${more}` });
}

/** The "Partien" table's result tooltip: the Elo after the game and, for a mate, its pattern. */
function resultTip(r) {
  const elo = r.ownRating != null ? `${TC_LABEL[r.timeClass] ?? r.timeClass}-Elo nach der Partie: ${r.ownRating}${r.ratingDelta != null ? ` (${signed(r.ratingDelta)})` : ''}` : '';
  const mate = r.mate ? `Matt: ${MATE_LABEL[r.mate.type]} (${r.mate.byMe ? 'gesetzt' : 'kassiert'})` : '';
  return [elo, mate].filter(Boolean).join(' · ');
}

const RENDERERS = { overview, openings, opponents, quality, heatmap: heatmapTab, time: timeTab, mate: mateTab, games: gamesTab };

/**
 * @param {string} tab one of META_TABS' ids
 * @param {object[]} records filtered fast records
 * @param {{engineOf: (r) => object|null, countryOf: (name) => string|null, opponent: string|null,
 *   username: string, engineLabel: string, countriesPending: boolean, countriesDone: number, countriesTotal: number}} ctx
 */
export function renderMetaTab(tab, records, ctx) {
  clearFitCharts(); // the previous render's charts are about to be replaced
  clearGameLists(); // ... and so are its counts
  setOppFlag((name) => flag(ctx.countryOf(name)));
  return (RENDERERS[tab] ?? overview)(records, ctx);
}
