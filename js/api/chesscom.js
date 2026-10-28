// Minimal client for the public (unauthenticated) Chess.com API.

import { Chess } from '../chessLib.js';

const BASE = 'https://api.chess.com/pub';

async function fetchJson(url, signal) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
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
 * an indeterminate "loading" state. Stops fetching further (older) archives
 * entirely once maxGames is reached, rather than fetching everything and
 * truncating afterward - a prolific player's "since the beginning" range can
 * span hundreds of monthly archives, which would otherwise make this hang
 * for a very long time even though only the newest few months are ever kept.
 * @param {string} username
 * @param {{monthsBack?: number, maxGames?: number, onProgress?: (fraction: number) => void}} [options]
 *   monthsBack: how many months back to include; defaults to 1 (current/most
 *   recent month only). Pass Infinity for all time. maxGames, if given, stops
 *   fetching once at least this many games have been collected (the actual
 *   count returned may exceed it slightly - whole archives aren't split).
 *   onProgress, if given, is called after each archive finishes, with the
 *   fraction (0-1) done so far - relative to monthsBack, not maxGames, so it
 *   still jumps straight to 100% on an early stop rather than stalling
 *   partway.
 * @returns {Promise<object[]>} raw Chess.com game objects, newest first.
 */
export async function fetchRecentGames(username, { monthsBack = 1, maxGames, onProgress, signal } = {}) {
  const archives = await fetchArchives(username);
  const selected = archives.slice(-monthsBack).reverse(); // newest month first
  const games = [];
  for (let i = 0; i < selected.length; i++) {
    const data = await fetchJson(selected[i], signal);
    games.push(...(data.games ?? []).slice().reverse());
    if (maxGames != null && games.length >= maxGames) {
      onProgress?.(1);
      break;
    }
    onProgress?.((i + 1) / selected.length);
  }
  if (games.length === 0) {
    throw new Error('Keine Spiele im gewählten Zeitraum gefunden.');
  }
  return games;
}

/**
 * One game by its URL, looked up in the monthly archive its end time falls
 * in (UTC, like Chess.com's archives).
 * @param {string} username
 * @param {string} url the game's Chess.com URL
 * @param {number} endTimeSeconds the game's end_time
 * @returns {Promise<object|null>} the raw game object, null if it isn't there
 */
export async function fetchGame(username, url, endTimeSeconds) {
  const d = new Date(endTimeSeconds * 1000);
  const month = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const data = await fetchJson(`${BASE}/player/${encodeURIComponent(username)}/games/${month}`);
  return (data.games ?? []).find((g) => g.url === url) ?? null;
}

/**
 * Fetches a player's avatar, country, title, account status and league.
 * Never throws - falls back to none of them if the lookup fails, since that
 * shouldn't break the rest of the game review.
 * Note: the API's own `username` field is always lowercase, so callers should
 * keep the originally-cased username from the game record instead (PGN/game
 * data preserves the casing the player actually signed up with).
 * @param {string} username
 * @returns {Promise<{exists: boolean, avatar: string|null, country: string|null, title: string|null,
 *   status: string|null, league: string|null}>}
 *   country is Chess.com's code, e.g. "DE" (or a pseudo-code like "XE" for
 *   England). title e.g. "GM", status e.g. "premium"/"staff"/"mod"/"basic"/
 *   "closed:fair_play_violations", league e.g. "Silver"/"Legend".
 */
export async function fetchPlayerProfile(username) {
  try {
    const data = await fetchJson(`${BASE}/player/${encodeURIComponent(username)}`);
    // `country` is a URL like ".../pub/country/DE" - only the code is needed.
    const country = data.country?.split('/').pop()?.toUpperCase() || null;
    return {
      exists: true,
      avatar: data.avatar ?? null,
      country,
      title: data.title ?? null,
      status: data.status ?? null,
      league: data.league ?? null,
    };
  } catch {
    return { exists: false, avatar: null, country: null, title: null, status: null, league: null };
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
