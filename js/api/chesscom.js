// Minimal client for the public (unauthenticated) Chess.com API.

import { Chess } from '../chessLib.js';

const BASE = 'https://api.chess.com/pub';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Nicht gefunden (404): ' + url);
    throw new Error(`Chess.com API Fehler (${res.status}) bei ${url}`);
  }
  return res.json();
}

/**
 * @param {string} username
 * @returns {Promise<string[]>} archive URLs, oldest to newest.
 */
export async function fetchArchives(username) {
  const data = await fetchJson(`${BASE}/player/${encodeURIComponent(username)}/games/archives`);
  if (!data.archives || data.archives.length === 0) {
    throw new Error('Keine Spielarchive für diesen Benutzer gefunden.');
  }
  return data.archives;
}

/**
 * Fetches games from the N most recent monthly archives, one at a time (not
 * in parallel) - slower for a large monthsBack, but it's what lets onProgress
 * report real, meaningful progress (archives done / total) instead of just
 * an indeterminate "loading" state.
 * @param {string} username
 * @param {{monthsBack?: number, onProgress?: (fraction: number) => void}} [options]
 *   monthsBack: how many months back to include; defaults to 1 (current/most
 *   recent month only). Pass Infinity for all time. onProgress, if given, is
 *   called after each archive finishes, with the fraction (0-1) done so far.
 * @returns {Promise<object[]>} raw Chess.com game objects, newest first.
 */
export async function fetchRecentGames(username, { monthsBack = 1, onProgress } = {}) {
  const archives = await fetchArchives(username);
  const selected = archives.slice(-monthsBack).reverse(); // newest month first
  const games = [];
  for (let i = 0; i < selected.length; i++) {
    const data = await fetchJson(selected[i]);
    games.push(...(data.games ?? []).slice().reverse());
    onProgress?.((i + 1) / selected.length);
  }
  if (games.length === 0) {
    throw new Error('Keine Spiele im gewählten Zeitraum gefunden.');
  }
  return games;
}

/**
 * Fetches a player's avatar. Never throws - falls back to no avatar if the
 * lookup fails, since that shouldn't break the rest of the game review.
 * Note: the API's own `username` field is always lowercase, so callers should
 * keep the originally-cased username from the game record instead (PGN/game
 * data preserves the casing the player actually signed up with).
 * @param {string} username
 * @returns {Promise<{avatar: string|null}>}
 */
export async function fetchPlayerProfile(username) {
  try {
    const data = await fetchJson(`${BASE}/player/${encodeURIComponent(username)}`);
    return { avatar: data.avatar ?? null };
  } catch {
    return { avatar: null };
  }
}

// Chess.com's per-side `result` field is either "win" or one of several
// loss/draw reasons. These are shared by both sides on a draw (e.g. both
// "agreed" or both "stalemate"), and are the specific reason string only on
// the losing side otherwise (the winner's side just says "win").
const DRAW_REASONS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

/**
 * Figures out how a finished game actually ended, for marking the king(s) on
 * the board's final position.
 * @param {string} whiteResult
 * @param {string} blackResult
 * @returns {{type: 'checkmate'|'timeout'|'resignation'|'abandonment'|'draw'|'other', loserColor: 'white'|'black'|null}}
 */
function describeTermination(whiteResult, blackResult) {
  if (DRAW_REASONS.has(whiteResult) || DRAW_REASONS.has(blackResult)) {
    return { type: 'draw', loserColor: null };
  }
  const loserColor = whiteResult === 'win' ? 'black' : 'white';
  const loserReason = loserColor === 'white' ? whiteResult : blackResult;
  let type;
  if (loserReason === 'checkmated') type = 'checkmate';
  else if (loserReason === 'timeout') type = 'timeout';
  else if (loserReason === 'resigned') type = 'resignation';
  else if (loserReason === 'abandoned') type = 'abandonment';
  else type = 'other';
  return { type, loserColor };
}

/** @returns {number|null} full move count (not plies), or null if the PGN can't be parsed. */
function countMoves(pgn) {
  if (!pgn) return null;
  const parser = new Chess();
  if (!parser.load_pgn(pgn, { sloppy: true })) return null;
  return Math.ceil(parser.history().length / 2);
}

/**
 * Reduces a raw Chess.com game object to what the UI needs for a picklist.
 * @param {object} game
 */
export function summarizeGame(game) {
  const white = game.white?.username ?? '?';
  const black = game.black?.username ?? '?';
  const whiteRating = game.white?.rating ?? null;
  const blackRating = game.black?.rating ?? null;
  const whiteResult = game.white?.result ?? '?';
  const blackResult = game.black?.result ?? '?';
  const endDate = game.end_time ? new Date(game.end_time * 1000) : null;
  const dateLabel = endDate
    ? endDate.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '?';

  let winner;
  if (whiteResult === 'win') winner = 'white';
  else if (blackResult === 'win') winner = 'black';
  else winner = 'draw';

  const whiteLabel = whiteRating ? `${white} (${whiteRating})` : white;
  const blackLabel = blackRating ? `${black} (${blackRating})` : black;
  const moveCount = countMoves(game.pgn);
  const moveCountLabel = moveCount != null ? ` — ${moveCount} Zg.` : '';

  return {
    url: game.url,
    pgn: game.pgn,
    white,
    black,
    whiteRating,
    blackRating,
    winner,
    termination: describeTermination(whiteResult, blackResult),
    timeClass: game.time_class ?? '?',
    dateLabel,
    endDate, // Date|null - js/main.js's "Heute" time filter compares against this
    moveCount, // number|null - full move count, not plies
    label: `${whiteLabel} vs ${blackLabel} — ${dateLabel}${moveCountLabel}`,
  };
}
