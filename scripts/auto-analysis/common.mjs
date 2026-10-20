// Shared bits of the scheduled auto-analysis (.github/workflows/auto-analysis.yml):
// config, file locations and Chess.com requests.
//
// Files it maintains (served by Netlify like the rest of the repo):
//  - data/<username>.json: one master file per player, in exactly the format
//    of the Meta-Analyse export (js/meta/metaController.js), so the app can
//    import or auto-load it unchanged;
//  - data/state.json: per player, whether every game is analyzed and the
//    ETags of the two newest monthly archives - what lets check.mjs decide
//    "nothing new" with two tiny 304 requests per player.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA_DIR = path.join(ROOT, 'data');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');

export const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
// Changing engine or depth in config.json invalidates every stored analysis.
export const ENGINE_KEY = `${config.engine}|${config.depth}`;

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

export const masterFile = (user) => path.join(DATA_DIR, `${user.toLowerCase()}.json`);

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

export async function loadState() {
  return (await readJson(STATE_FILE)) ?? {};
}
