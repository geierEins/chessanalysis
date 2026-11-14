// Shared bits of the scheduled auto-analysis (.github/workflows/auto-analysis.yml):
// config, file locations and Chess.com/Lichess requests.
//
// Files it maintains (committed to the repo; the app reads the master files
// from raw.githubusercontent.com - see syncServerAnalysis in metaController.js):
//  - data/<username>.json (Lichess players: data/lichess/<username>.json): one
//    master file per player, in the 'chessanalysis-meta' format
//    js/meta/autoAnalysis.js loads;
//  - data/state/[lichess/]<username>.json: per player, whether every game is
//    analyzed and the ETags of the two newest monthly archives (Lichess: the
//    game count) - what lets check.mjs decide "nothing new" with two tiny 304
//    requests per Chess.com player (one per Lichess player). One file per
//    player, so the initial and the scheduled workflow, which may run at the
//    same time for different players, never write the same file.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA_DIR = path.join(ROOT, 'data');
const STATE_DIR = path.join(DATA_DIR, 'state');
// The former single state file of all players - still read until analyze.mjs
// has written every player's own file, then removed (saveState).
const LEGACY_STATE_FILE = path.join(DATA_DIR, 'state.json');
const stateFile = (player) => path.join(STATE_DIR, `${player.key}.json`);

export const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));

/**
 * config.json's "users": a plain name is a Chess.com player,
 * {"name": "...", "site": "lichess"} a Lichess one. key: the player's file
 * name below data/ and data/state/ (and their key in `state`) - Chess.com
 * players keep the bare lowercased name, Lichess ones live in a lichess/
 * subfolder, so the same name on both sites never collides.
 * @type {{name: string, site: 'chesscom'|'lichess', key: string}[]}
 */
export const players = config.users.map((u) => {
  const name = typeof u === 'string' ? u : u.name;
  const site = typeof u === 'string' ? 'chesscom' : u.site ?? 'chesscom';
  return { name, site, key: site === 'chesscom' ? name.toLowerCase() : `${site}/${name.toLowerCase()}` };
});
// Changing engine or depth in config.json invalidates every stored analysis.
// The suffix is the data version: changing it sends every player back to
// "waiting for the initial analysis" (e.g. "evals": records gained the
// engine log, js/analysis/evalLog.js, so all older ones get redone;
// "phases": ENGINE_RECORD_VERSION 2 in js/meta/metaRecords.js).
export const ENGINE_KEY = `${config.engine}|${config.depth}|phases`;

// Chess.com sits behind Cloudflare, which answers requests without a
// User-Agent with a 403 challenge page.
const USER_AGENT = 'chessanalysis-auto-analysis (github.com/geierEins/chessanalysis)';

/** fetch() with the User-Agent Chess.com needs; etag makes it a conditional (304) request. */
export function chessFetch(url, { etag } = {}) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  return fetch(url, { headers });
}

/** Makes every fetch() (also the app's own js/api/chesscom.js) send the User-Agent. */
export function installUserAgent() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => nativeFetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
}

/** The current and the previous month's archive (UTC, like Chess.com) - a game
 *  finished just before midnight on the 1st still lands in the old month. */
export function recentArchiveUrls(user) {
  const now = new Date();
  return [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return archiveUrl(user, d.getUTCFullYear(), d.getUTCMonth() + 1);
  });
}

export function archiveUrl(user, year, month) {
  return `https://api.chess.com/pub/player/${user.toLowerCase()}/games/${year}/${String(month).padStart(2, '0')}`;
}

/** A Lichess player's total game count - Lichess has no monthly archives
 *  with ETags, so a changed count is check.mjs's "something new" signal. */
export async function lichessGameCount(name) {
  const res = await chessFetch(`https://lichess.org/api/user/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Lichess antwortet ${res.status} für ${name}`);
  return (await res.json()).count?.all ?? 0;
}

export const masterFile = (player) => path.join(DATA_DIR, `${player.key}.json`);

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeJson(file, value, { pretty = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, pretty ? 2 : 0) + '\n');
}

/** Every configured player's state, keyed by player key (missing = never analyzed). */
export async function loadState() {
  const legacy = (await readJson(LEGACY_STATE_FILE)) ?? {};
  const state = {};
  for (const player of players) {
    const s = (await readJson(stateFile(player))) ?? (player.site === 'chesscom' ? legacy[player.key] : null);
    if (s) state[player.key] = s;
  }
  return state;
}

/** Writes the given players' state files (only theirs - another workflow may own the rest). */
export async function saveState(state, savedPlayers) {
  for (const player of savedPlayers) {
    const s = state[player.key];
    if (s) await writeJson(stateFile(player), s, { pretty: true });
  }
  // Drop the old shared file once every player has their own.
  const migrated = await Promise.all(players.map(async (p) => (await readJson(stateFile(p))) != null));
  if (migrated.every(Boolean)) await rm(LEGACY_STATE_FILE, { force: true });
}
