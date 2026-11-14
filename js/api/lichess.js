// Minimal client for the public (unauthenticated) Lichess API. Every game is
// converted into the shape of a Chess.com game object (toChessComShape), so
// summarizeGame() in ./chesscom.js, the Meta-Analyse (js/meta/metaRecords.js)
// and the analysis run on it unchanged.

const BASE = 'https://lichess.org';
// Standard chess only - no Chess960, Crazyhouse, From Position etc.
const PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';
// Chess.com's time classes; it has no "classical", the closest is "rapid".
const TIME_CLASS = {
  ultraBullet: 'bullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'rapid',
  correspondence: 'daily',
};
// Lichess's sub-national flags -> Chess.com's pseudo-codes (js/ui/playerLabel.js).
const FLAG_CODES = { 'GB-ENG': 'XE', 'GB-SCT': 'XS', 'GB-WLS': 'XW', 'ES-CT': 'XC', 'ES-GA': 'XG', 'ES-EU': 'XB' };
// Games that never really started - no result, nothing to analyze.
const UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart']);

async function fetchOk(url, { signal, accept = 'application/json', ...init } = {}) {
  const res = await fetch(url, { ...init, headers: { Accept: accept, ...init.headers }, signal });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Nicht gefunden (404): ' + url);
    if (res.status === 429) throw new Error('Lichess: zu viele Anfragen - bitte eine Minute warten.');
    throw new Error(`Lichess API Fehler (${res.status}) bei ${url}`);
  }
  return res;
}

function playerName(p) {
  if (p?.user?.name) return p.user.name;
  if (p?.aiLevel) return `Stockfish-Stufe-${p.aiLevel}`;
  return 'Anonym';
}

/** Chess.com's per-side `result` strings for a Lichess status + winner. */
function sideResults(status, winner) {
  if (!winner) {
    const draw =
      status === 'stalemate' ? 'stalemate'
      : status === 'outoftime' ? 'timevsinsufficient'
      : status === 'insufficientMaterialClaim' ? 'insufficient'
      : 'agreed'; // Lichess's "draw" covers agreement, repetition and the 50-move rule alike
    return { white: draw, black: draw };
  }
  const loss =
    status === 'mate' ? 'checkmated'
    : status === 'resign' ? 'resigned'
    : status === 'outoftime' ? 'timeout'
    : status === 'timeout' ? 'abandoned' // Lichess: the opponent left the game
    : 'lose';
  return winner === 'white' ? { white: 'win', black: loss } : { white: loss, black: 'win' };
}

function toChessComShape(g) {
  const results = sideResults(g.status, g.winner);
  const side = (color) => ({
    username: playerName(g.players?.[color]),
    rating: g.players?.[color]?.rating ?? null,
    result: results[color],
  });
  return {
    url: `${BASE}/${g.id}`,
    pgn: g.pgn,
    time_class: TIME_CLASS[g.speed] ?? g.speed,
    // Chess.com writes "180+2"; daily games have no clock.
    time_control: g.clock ? `${g.clock.initial}+${g.clock.increment}` : g.daysPerTurn ? `1/${g.daysPerTurn * 86400}` : '-',
    end_time: Math.round((g.lastMoveAt ?? g.createdAt) / 1000),
    rated: Boolean(g.rated),
    white: side('white'),
    black: side('black'),
  };
}

const isUsable = (g) => g.variant === 'standard' && !UNFINISHED.has(g.status) && g.pgn;

/** Reads an NDJSON response line by line - games arrive one after another. */
async function* readNdjson(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

/** Start of the calendar month `monthsBack - 1` months ago - the same range
 *  as Chess.com's newest `monthsBack` monthly archives. */
function sinceFor(monthsBack) {
  if (!Number.isFinite(monthsBack)) return null;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1);
}

/**
 * Same contract as chesscom.js's fetchRecentGames: Chess.com-shaped game
 * objects, newest first. Lichess streams all games at once instead of
 * monthly archives - onProgress is relative to the player's game count.
 */
export async function fetchRecentGames(username, { monthsBack = 1, maxGames, onProgress, signal } = {}) {
  const games = await fetchGamesSince(username, sinceFor(monthsBack), { maxGames, onProgress, signal });
  if (games.length === 0) {
    throw new Error('Keine Spiele im gewählten Zeitraum gefunden.');
  }
  return games;
}

/** The player's total game count (all variants) - null if the user doesn't exist. */
export async function fetchGameCount(username, { signal } = {}) {
  try {
    const user = await (await fetchOk(`${BASE}/api/user/${encodeURIComponent(username)}`, { signal })).json();
    return user.count?.all ?? 0;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return null;
  }
}

/**
 * Every standard game started at or after `since` (ms; null = all), as
 * Chess.com-shaped objects, newest first - empty if there are none. Also
 * what the GitHub auto-analysis (scripts/auto-analysis/) loads.
 */
export async function fetchGamesSince(username, since, { maxGames, onProgress, signal } = {}) {
  const params = new URLSearchParams({ pgnInJson: 'true', clocks: 'true', opening: 'false', perfType: PERF_TYPES });
  if (since != null) params.set('since', String(since));
  if (maxGames != null) params.set('max', String(maxGames));

  const total = await fetchGameCount(username, { signal });
  if (total == null) throw new Error('Lichess-Benutzer nicht gefunden.');

  const res = await fetchOk(`${BASE}/api/games/user/${encodeURIComponent(username)}?${params}`, {
    signal,
    accept: 'application/x-ndjson',
  });
  const games = [];
  let seen = 0;
  for await (const g of readNdjson(res)) {
    seen++;
    if (isUsable(g)) games.push(toChessComShape(g));
    if (total && seen % 20 === 0) onProgress?.(Math.min(1, seen / total));
  }
  onProgress?.(1);
  return games;
}

/** One game by its Lichess URL (username and end time aren't needed here). */
export async function fetchGame(_username, url) {
  const id = url.split('/').pop().slice(0, 8);
  const params = new URLSearchParams({ pgnInJson: 'true', clocks: 'true', opening: 'false' });
  try {
    const g = await (await fetchOk(`${BASE}/game/export/${id}?${params}`)).json();
    return isUsable(g) ? toChessComShape(g) : null;
  } catch {
    return null;
  }
}

function toProfile(u) {
  const flag = u.flag ?? u.profile?.flag ?? u.profile?.country ?? null;
  const country = flag && !flag.startsWith('_') ? FLAG_CODES[flag] ?? flag.toUpperCase() : null;
  const closed = u.disabled || u.tosViolation;
  return {
    exists: !u.disabled,
    avatar: null, // Lichess has no profile pictures
    country,
    title: u.title ?? null,
    status: u.tosViolation ? 'closed:fair_play_violations' : closed ? 'closed' : null,
    league: null,
  };
}

const NO_PROFILE = { exists: false, avatar: null, country: null, title: null, status: null, league: null };

// Profile lookups are collected for a moment and fetched together via
// POST /api/users (up to 300 at once) - the Meta-Analyse asks for every
// opponent's country, which one by one would run into Lichess's rate limit.
const BATCH_DELAY_MS = 50;
const BATCH_MAX = 300;
let pending = new Map(); // lowercased name -> [resolve, ...]
let batchTimer = null;

async function flushBatch() {
  batchTimer = null;
  const batch = pending;
  pending = new Map();
  const names = [...batch.keys()];
  for (let i = 0; i < names.length; i += BATCH_MAX) {
    const chunk = names.slice(i, i + BATCH_MAX);
    let found = new Map();
    try {
      const res = await fetchOk(`${BASE}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: chunk.join(','),
      });
      found = new Map((await res.json()).map((u) => [u.id, u]));
    } catch {
      // falls through - every name of this chunk gets "no profile"
    }
    for (const name of chunk) {
      const u = found.get(name);
      for (const resolve of batch.get(name)) resolve(u ? toProfile(u) : NO_PROFILE);
    }
  }
}

/** Same contract as chesscom.js's fetchPlayerProfile - never throws. */
export function fetchPlayerProfile(username) {
  const key = username.trim().toLowerCase();
  return new Promise((resolve) => {
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(resolve);
    batchTimer ??= setTimeout(flushBatch, BATCH_DELAY_MS);
  });
}
