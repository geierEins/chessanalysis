// "Beste Partien": the overview's card with the top 5 games - first which games
// qualify at all, then a score for those; each row's tooltip gives the reasons.

import { timeClassStyle } from '../../timeClassStyle.js';
import { withFlag } from './cards.js';
import { TC_LABEL, esc, f1, avg, fmtDate } from './format.js';

// Stage 1: which games qualify.
const MIN_MOVES = 25; // own moves - a resignation after 4 moves is no "best game"
const MIN_OWN_MOVES = 15; // own moves out of the opening book: learned theory is no own play
const MAX_ELO_BELOW = 200; // the opponent at most this far below the user's rating
const MIN_TC_GAMES = 5; // games with engine values a game type needs for its own accuracy average

// The formula behind the card's note's word "Formel" (the same numbers as rate()).
const FORMULA_TIP = [
  '**Welche Partien zählen**',
  '• gewonnen und gewertet, mit Engine-Werten',
  `• mindestens ${MIN_MOVES} eigene Züge, davon ${MIN_OWN_MOVES} nach der Eröffnungstheorie`,
  `• Gegner höchstens ${MAX_ELO_BELOW} Elo unter dir`,
  '',
  '**Wertung = Summe aus**',
  '• Genauigkeit, gemessen an deinem Schnitt in der Spielart',
  '• + Elo-Differenz ÷ 50 (−4 bis +6)',
  '• + (Genauigkeit des Gegners − 70) ÷ 5 (−4 bis +5)',
  '• + 3 · log₂(Züge ÷ 25)',
  '• − 4 je Patzer, − 2 je Fehler',
  '• + 3 je brillantem, + 1 je großartigem Zug (höchstens +6)',
  '• + 2, wenn alle drei Phasen über 80 % liegen',
].join('\n');

export const BEST_GAMES_NOTE = `Die 5 Partien mit der höchsten Wertung, berechnet aus eigener <span class="meta-tip-word" data-tip="${esc(FORMULA_TIP)}">Formel</span>. Klick öffnet die Partie.`;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Stage 2: the score of one qualifying game, with its parts as reasons. */
function rate(r, e, tcAvg, allAvg) {
  const c = e.counts ?? {};
  const own = r.moves;
  const ref = tcAvg ?? allAvg;
  const parts = [];
  // Accuracy, measured against the user's own average in this game type - 95 % in a
  // Daily game is easier than 85 % in Bullet - and put back on the overall level.
  const acc = e.accuracy - ref + allAvg;
  const vsAvg = e.accuracy - ref;
  parts.push([acc, `**${f1(e.accuracy)} % Genauigkeit** (${vsAvg >= 0 ? '+' : '−'}${f1(Math.abs(vsAvg))} zu deinem ${tcAvg != null ? `${TC_LABEL[r.timeClass] ?? r.timeClass}-` : ''}Schnitt)`]);
  const diff = r.oppRating != null && r.ownRating != null ? r.oppRating - r.ownRating : null;
  if (diff != null) {
    parts.push([clamp(diff / 50, -4, 6), `Gegner ${r.oppRating} Elo (${diff >= 0 ? '+' : '−'}${Math.abs(diff)})`]);
  }
  if (e.oppAccuracy != null) parts.push([clamp((e.oppAccuracy - 70) / 5, -4, 5), `Gegner spielte ${f1(e.oppAccuracy)} %`]);
  parts.push([3 * Math.log2(own / MIN_MOVES), `${own} Züge`]);
  const blunders = c.BLUNDER ?? 0;
  const mistakes = (c.MISTAKE ?? 0) + (c.MISS ?? 0);
  parts.push([
    -4 * blunders - 2 * mistakes,
    blunders || mistakes
      ? [blunders && plural(blunders, 'Patzer', 'Patzer'), mistakes && plural(mistakes, 'Fehler', 'Fehler')].filter(Boolean).join(', ')
      : 'kein Patzer, kein Fehler',
  ]);
  const brilliant = c.BRILLIANT ?? 0;
  const great = c.GREAT ?? 0;
  if (brilliant || great) {
    parts.push([
      Math.min(6, 3 * brilliant + great),
      [brilliant && plural(brilliant, 'brillanter Zug', 'brillante Züge'), great && plural(great, 'großartiger Zug', 'großartige Züge')].filter(Boolean).join(', '),
    ]);
  }
  const phases = e.phaseAccuracy ?? {};
  if (['opening', 'middlegame', 'endgame'].every((k) => phases[k] != null && phases[k] >= 80)) {
    parts.push([2, 'alle drei Phasen über 80 %']);
  }
  return { score: parts.reduce((a, [v]) => a + v, 0), reasons: parts.map(([, text]) => text) };
}

/** The top 5 games of rs, best first: [{r, e, score, reasons}]. */
export function bestGames(rs, engineOf) {
  const withEngine = rs.filter((r) => engineOf(r)?.accuracy != null);
  if (!withEngine.length) return [];
  const allAvg = avg(withEngine, (r) => engineOf(r).accuracy);
  const tcAvg = {};
  for (const tc of new Set(withEngine.map((r) => r.timeClass))) {
    const list = withEngine.filter((r) => r.timeClass === tc);
    tcAvg[tc] = list.length >= MIN_TC_GAMES ? avg(list, (r) => engineOf(r).accuracy) : null;
  }
  return withEngine
    .filter((r) => {
      const e = engineOf(r);
      if (r.result !== 'W' || !r.rated || r.moves < MIN_MOVES) return false;
      if (r.moves - (e.counts?.BOOK ?? 0) < MIN_OWN_MOVES) return false;
      return r.oppRating == null || r.ownRating == null || r.oppRating >= r.ownRating - MAX_ELO_BELOW;
    })
    .map((r) => ({ r, e: engineOf(r), ...rate(r, engineOf(r), tcAvg[r.timeClass], allAvg) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

const MEDALS = ['🥇', '🥈', '🥉', '4.', '5.'];

/** The overview's "Beste Partien" card body: one clickable row per game, the reasons in its tooltip. */
export function bestGamesList(rs, engineOf) {
  const rows = bestGames(rs, engineOf).map(({ r, e, score, reasons }, i) => {
    const style = timeClassStyle(r.timeClass);
    const tip = `**Platz ${i + 1}** · Wertung ${f1(score)}\n${TC_LABEL[r.timeClass] ?? r.timeClass} gegen ${r.opponent} · ${fmtDate(r.endTime)}\n\n${reasons.map((t) => `• ${t}`).join('\n')}`;
    return `<tr class="click" data-game="${esc(r.url)}" data-tip="${esc(tip)}"><td class="meta-rank">${MEDALS[i]}</td>`
      + `<td class="meta-top-opp" style="color:${style.color}">${style.icon} vs ${withFlag(r.opponent)}</td>`
      + `<td class="r meta-muted">${r.moves} Zg.</td><td class="r"><b>${f1(e.accuracy)}</b> %</td><td class="r meta-muted">${fmtDate(r.endTime)}</td></tr>`;
  });
  return rows.length
    ? `<div class="meta-tbl"><table class="meta-top meta-best">${rows.join('')}</table></div>`
    : '<p class="meta-muted">Noch keine Partie erfüllt die Bedingungen.</p>';
}
