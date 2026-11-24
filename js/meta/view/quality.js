// The "Spielqualität" tab: accuracy gauge, move quality mix, accuracy over time and by phase, conversion and blunders.

import { CATEGORIES, CATEGORY_ORDER } from '../../analysis/categories.js';
import { iconLabel } from '../metaIcons.js';
import { PIECE_LABEL, OPENING_LAST_MOVE, mateInOne, hasMoves } from '../metaRecords.js';
import { pieceUrl } from '../openingBoard.js';
import { esc, avg, pc, f1, signed, fmtDate, RES_WORD } from './format.js';
import { card, EMPTY, kpi, GOOD, BAD, hbars } from './cards.js';
import { gamesCount, recordGames, topGamesTile } from './gameLists.js';
import { columns, fitChart, ZOOM_NOTE } from './charts.js';

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

export function quality(rs, ctx) {
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
