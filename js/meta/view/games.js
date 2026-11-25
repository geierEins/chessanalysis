// The "Partien" tab: every filtered game in a sortable table, with search, analyze cell and result tooltip.

import { timeClassStyle } from '../../timeClassStyle.js';
import { MATE_LABEL, hasMoves } from '../metaRecords.js';
import { TC_LABEL, RES_LETTER, esc, f1, signed, fold, fmtDate, fmtDateTime, finalTip } from './format.js';
import { card, EMPTY, withFlag, sortHead } from './cards.js';
import { openTip, analyzeCell } from './gameLists.js';

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

export function gamesTab(all, ctx) {
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
          return `<tr class="click${ctx.marked?.has(r.url) ? ' meta-marked' : ''}" data-game="${esc(r.url)}"${openTip(r)}><td class="g-date" data-tip="${fmtDateTime(r.endTime)}">${fmtDate(r.endTime)}</td><td class="g-type" style="color:${style.color}">${style.icon}<span class="g-type-l"> ${TC_LABEL[r.timeClass] ?? r.timeClass}</span></td><td class="g-color"><span class="meta-colordot ${r.color}"></span></td><td class="g-opp">${withFlag(r.opponent)}</td><td class="g-elo">${r.oppRating ?? '–'}</td><td class="g-open"${r.opening ? ` data-opening="${esc(r.opening)}"` : ''}>${esc(r.family ?? '–')}</td><td class="r g-moves">${r.moves}</td>${hasMoves(r) ? `<td class="r g-acc">${f1(e?.accuracy)}</td><td class="r g-blund">${e ? e.counts.BLUNDER ?? 0 : '–'}</td>` : `<td class="r meta-faint g-acc">–</td><td class="r meta-faint g-blund">–</td>`}<td class="meta-res-elo g-res"${resultTip(r) ? ` data-tip="${resultTip(r)}"` : ''}><span class="meta-res ${r.result}"${finalTip(r)}>${RES_LETTER[r.result]}</span>${eloDelta(r.ratingDelta)}${r.ownRating != null && r.rated ? `<span class="meta-elo-new" style="color:${style.color}">(${r.ownRating})</span>` : ''}</td>${analyzeCell(r, ctx, 'r g-an')}</tr>`;
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
