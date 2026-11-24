// The "Zeit & Partieende" tab: how games end, shortest and longest games, clock, time per move, when you play.

import { timeClassStyle } from '../../timeClassStyle.js';
import { TERMINATION_LABEL } from '../metaRecords.js';
import { TC_LABEL, WEEKDAYS, pts, score, avg, pc, f0, groupBy, byCountDesc } from './format.js';
import { card, EMPTY, bigStats, hbars } from './cards.js';
import { topGamesTable, longestStreak } from './gameLists.js';
import { shade, pie, columns, fitChart } from './charts.js';

const HEAT_RAMP = ['#1d2a3d', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];

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

export function timeTab(rs, ctx) {
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
