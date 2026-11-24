// Renders the Meta-Analyse tabs as HTML strings from already-filtered
// per-game records (metaRecords.js). Pure presentation: no state, no I/O -
// js/meta/metaController.js owns the data and calls renderMetaTab() again on
// every filter or tab change. Charts are small hand-drawn SVG/HTML (no
// Chart.js) so a re-render is just one innerHTML swap.

import { timeClassStyle } from '../timeClassStyle.js';
import { MATE_LABEL, hasMoves } from './metaRecords.js';
import { TC_ORDER, TC_LABEL, RES_LETTER, RES_WORD, DAY_MS, esc, score, wdl, avg, pc, f1, signed, groupBy, fold, fmtDate, fmtDateTime, hasRealRating } from './view/format.js';
import { flag, withFlag, setOppFlag, wdlBar, WDL_LEGEND, card, EMPTY, kpi, sortHead } from './view/cards.js';
import { NO_MOVES, openTip, LISTED_GAMES_STEP, clearGameLists, gameListById, gamesCount, gameListHtml, gameHintHtml, longestStreakGames, streakLink, analyzeCell } from './view/gameLists.js';

import { resultPie, columns, clearFitCharts, fitChart, layoutFitCharts, ZOOM_NOTE, timeTicks } from './view/charts.js';
import { mateTab } from './view/mate.js';
import { heatmapTab } from './view/heatmap.js';
import { openings } from './view/openings.js';
import { opponents } from './view/opponents.js';
import { quality } from './view/quality.js';
import { timeTab } from './view/time.js';

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

// ---------- small helpers ----------


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
