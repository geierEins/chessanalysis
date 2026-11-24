// Clickable game counts and lists of the Meta-Analyse tabs: the games behind a
// count (gameLists, reset by renderMetaTab), the popup list, top-games tables,
// streak links and the "Partien" tab's analyze cell.

import { timeClassStyle } from '../../timeClassStyle.js';
import { iconLabel } from '../metaIcons.js';
import { hasMoves } from '../metaRecords.js';
import { esc, RES_LETTER, RES_BADGE, fmtDate, fmtDateTime } from './format.js';
import { withFlag } from './cards.js';

// A game without a single move (see hasMoves): a gray X where the magnifier
// would be (analyzeCell), the reason in the shared tooltip.
export const NO_MOVES_TIP = 'Diese Partie enthält keine Züge (vor dem ersten Zug beendet). Sie kann weder analysiert noch in der Spiel-Analyse geöffnet werden.';
// A game row's tooltip - not on a game without moves, which can't be opened.
export const openTip = (r) => (hasMoves(r) ? ' title="In der Spiel-Analyse öffnen"' : '');
export const NO_MOVES = `<span class="meta-nomoves" data-tip="${NO_MOVES_TIP}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-label="Keine Züge"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></span>`;
/** How many games the list behind a count shows at first, and adds per "more" click. */
export const LISTED_GAMES_STEP = 10;

// The games behind each count of the current render, by the id in its data-games.
const gameLists = new Map();

/** renderMetaTab: the previous render's counts are about to be replaced. */
export function clearGameLists() {
  gameLists.clear();
}

/** @returns {object[]} the games behind a count's data-games id (empty once re-rendered) */
export function gameListById(id) {
  return gameLists.get(id) ?? [];
}

/** A count that opens the list of its games on click (metaController's
 *  #meta-games-pop), newest first, LISTED_GAMES_STEP at a time. `text`
 *  replaces the count as the shown value (e.g. "+9" for a record game). */
export function gamesCount(list, text = list.length) {
  if (!list.length) return text === list.length ? '0' : '–';
  const id = String(gameLists.size + 1);
  gameLists.set(id, list);
  return `<button type="button" class="meta-count" data-games="${id}" title="Partien anzeigen">${text}</button>`;
}

/** The games with the most extreme value of `key` (all of them on a tie), e.g. the biggest lead that was still lost. */
export function recordGames(list, key, pickMax) {
  if (!list.length) return { games: [], value: null };
  const value = pickMax ? Math.max(...list.map((r) => r[key])) : Math.min(...list.map((r) => r[key]));
  return { games: list.filter((r) => r[key] === value), value };
}

/** The floating game list behind gamesCount() - styled like the game picker:
 *  the first `shown` games of `list` in a scroll box, plus a "more" button
 *  while some are left. */
export function gameListHtml(list, shown) {
  const items = list.slice(0, shown).map((r) => {
    const style = timeClassStyle(r.timeClass);
    const elo = r.oppRating ? ` (${r.oppRating})` : '';
    return `<button type="button" class="custom-select-option" role="menuitem" data-game="${esc(r.url)}" style="color:${style.color}">${style.icon} vs ${withFlag(r.opponent)}${elo} — ${esc(r.summary.dateLabel)} — ${r.moves} Zg. <span class="outcome-badge ${RES_BADGE[r.result]}">${RES_LETTER[r.result]}</span></button>`;
  });
  const n = Math.min(shown, list.length);
  const left = list.length - n;
  const head = list.length > LISTED_GAMES_STEP ? `<p class="meta-pop-head">${n} von ${list.length}</p>` : '';
  const more = left > 0 ? `<button type="button" class="meta-pop-more" data-more>+ ${Math.min(LISTED_GAMES_STEP, left)} weitere (noch ${left})</button>` : '';
  return `${head}<div class="meta-pop-list">${items.join('')}</div>${more}`;
}

const HINT_TEXT = {
  analyze: 'Noch nicht analysiert.',
  running: 'Wird gerade analysiert …',
  queued: 'Wartet auf die Analyse.',
  nomoves: 'Kann nicht analysiert werden (keine Züge).',
};

/** Shown in #meta-games-pop instead of opening a game without engine values
 *  (metaRecords' gameOpenState): the game, why it doesn't open, and for
 *  'analyze' a button that queues it (metaController's data-hint-analyze). */
export function gameHintHtml(r, state) {
  const style = timeClassStyle(r.timeClass);
  const elo = r.oppRating ? ` (${r.oppRating})` : '';
  const btn = state === 'analyze' ? `<button type="button" class="meta-pop-hint-btn" data-hint-analyze="${esc(r.url)}">${MAGNIFIER} Analysieren</button>` : '';
  return `<p class="meta-pop-head" style="color:${style.color}">${style.icon} vs ${withFlag(r.opponent)}${elo} — ${esc(r.summary.dateLabel)}</p>`
    + `<div class="meta-pop-hint"><p>${HINT_TEXT[state]}</p>${btn}</div>`;
}

export function longestStreak(rs, result) {
  let cur = 0;
  let best = 0;
  for (const r of rs) {
    cur = r.result === result ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/** The games of the most recent longest streak of `result` in a chronological list. */
export function longestStreakGames(chrono, result) {
  let best = [];
  let cur = [];
  for (const r of chrono) {
    cur = r.result === result ? [...cur, r] : [];
    if (cur.length && cur.length >= best.length) best = cur;
  }
  return best;
}

/** A streak's length as a link - metaController opens the "Partien" tab, marks the streak and scrolls to its first game. */
export function streakLink(games) {
  if (!games.length) return '0';
  const id = String(gameLists.size + 1);
  gameLists.set(id, games);
  return `<button type="button" class="meta-count" data-streak="${id}" title="In der Partienliste zeigen">${games.length}</button>`;
}

/** A tile with the first 5 games of an already-sorted list - a row opens the game.
 *  value: the ranked number's cell content (default: the game length). */
/** The five top games as a clickable table (rank, value, result, opponent, date). */
export function topGamesTable(sorted, value = (r) => `<b>${r.moves}</b> Zg.`) {
  const rows = sorted.slice(0, 5).map((r, i) => {
    const style = timeClassStyle(r.timeClass);
    return `<tr class="click" data-game="${esc(r.url)}"${openTip(r)}><td class="meta-rank">${i + 1}</td><td class="r">${value(r)}</td><td><span class="meta-res ${r.result}">${RES_LETTER[r.result]}</span></td><td class="meta-top-opp" style="color:${style.color}">${style.icon} ${withFlag(r.opponent)}</td><td class="r meta-muted" data-tip="${fmtDateTime(r.endTime)}">${fmtDate(r.endTime)}</td></tr>`;
  });
  return rows.length ? `<div class="meta-tbl"><table class="meta-top">${rows.join('')}</table></div>` : '<p class="meta-muted">Keine Partien.</p>';
}

export function topGamesTile(label, sorted, accent, detail = '', value) {
  return `<div class="meta-kpi list" style="--kpi-accent:${accent}"><span class="l">${iconLabel(label)}${detail ? ` <span class="meta-faint">· ${detail}</span>` : ''}</span>${topGamesTable(sorted, value)}</div>`;
}

const MAGNIFIER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15.5" y2="15.5"/></svg>';

// Two glass bulbs meeting in the middle, sand at the bottom.
const HOURGLASS = '<svg class="wait" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 21h12"/><path d="M8 3v3l4 6 4-6V3M8 21v-3l4-6 4 6v3"/><path d="M9.5 19.5h5L12 16z" fill="currentColor" stroke-width="1"/></svg>';
const CROSS = '<svg class="undo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

/** The "Partien" tab's last cell: a magnifier on a game without engine values
 *  (metaController queues it), a spinner while it's analyzed, an hourglass while
 *  it waits - which turns into an X on hover and takes it back out of the queue. */
export function analyzeCell(r, ctx, cls = 'r') {
  if (ctx.engineOf(r)) return `<td class="${cls}"></td>`;
  if (!hasMoves(r)) return `<td class="${cls}">${NO_MOVES}</td>`; // nothing to analyze - a gray X says why
  const state = ctx.queueState(r);
  if (state === 'running') return `<td class="${cls}"><span class="meta-analyze" title="Wird gerade analysiert"><span class="btn-spinner"></span></span></td>`;
  if (state === 'queued') return `<td class="${cls}"><button type="button" class="meta-analyze queued" data-unqueue="${esc(r.url)}" title="Wartet auf die Analyse - klicken, um sie zurückzunehmen">${HOURGLASS}${CROSS}</button></td>`;
  return `<td class="${cls}"><button type="button" class="meta-analyze" data-analyze="${esc(r.url)}" title="Diese Partie analysieren">${MAGNIFIER}</button></td>`;
}
