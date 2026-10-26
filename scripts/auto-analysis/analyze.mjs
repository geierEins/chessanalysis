// The heavy half of the auto-analysis: for each player, analyzes every game
// that isn't in data/<username>.json yet - with the app's own code
// (gameAnalyzer.js, metaRecords.js, stockfishEngine.js), so the results equal
// a Meta-Analyse run in the browser with the same engine and depth.
//
// Two modes:
//  - INITIAL=1 (.github/workflows/auto-analysis-initial.yml, started by hand):
//    the one-time backlog of every configured player. A player counts as
//    "initialized" once all their games are done - only then does the scheduled
//    check look at them at all;
//  - otherwise (four times a day, .github/workflows/auto-analysis.yml): only the
//    initialized players, i.e. just their new games.
//
// Newest games first, across all players, on one engine process per CPU
// core. Stops starting new games after TIME_BUDGET_MINUTES; whatever is left
// stays "not complete" in data/state.json and the next run continues. The
// master file is written after every game.
//
// Local run: INITIAL=1 node scripts/auto-analysis/analyze.mjs   (Node 22+)
// Env: TIME_BUDGET_MINUTES (default 50), ENGINES (default: CPU cores),
//      GAME_TIMEOUT_MINUTES (default 20), GRACE_MINUTES (default 15),
//      MAX_GAMES (stop after n games, for testing).

import { register } from 'node:module';
import { availableParallelism } from 'node:os';
import { appendFile } from 'node:fs/promises';
import {
  config,
  ENGINE_KEY,
  STATE_FILE,
  loadState,
  recentArchiveUrls,
  chessFetch,
  installUserAgent,
  masterFile,
  readJson,
  writeJson,
} from './common.mjs';
import { NodeWorker } from './nodeWorker.mjs';

register('./https-loader.mjs', import.meta.url);
installUserAgent();
globalThis.Worker = NodeWorker;

const { StockfishEngine } = await import('../../js/engine/stockfishEngine.js');
const { analyzeGame } = await import('../../js/analysis/gameAnalyzer.js');
const { buildFastRecord, buildEngineRecord, isCoachGame } = await import('../../js/meta/metaRecords.js');
const { recordingEngine } = await import('../../js/analysis/evalLog.js');
const { fetchPlayerProfile } = await import('../../js/api/chesscom.js');

const initial = Boolean(process.env.INITIAL);
const deadline = Date.now() + Number(process.env.TIME_BUDGET_MINUTES ?? 50) * 60_000;
const maxGames = Number(process.env.MAX_GAMES ?? Infinity);

async function getJson(url) {
  const res = await chessFetch(url);
  if (!res.ok) throw new Error(`Chess.com antwortet ${res.status} für ${url}`);
  return { data: await res.json(), etag: res.headers.get('etag') };
}

const monthOf = (url) => url.split('/games/')[1]; // "2026/10" - sorts like a date
const monthOfGame = (endTimeSeconds) => {
  const d = new Date(endTimeSeconds * 1000);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Loads one player's master file and state and lists the games still to analyze. */
async function preparePlayer(user, state) {
  const key = user.toLowerCase();
  let master = await readJson(masterFile(user));
  if (master?.engine?.id !== config.engine || Number(master?.engine?.depth) !== config.depth) {
    master = {
      format: 'chessanalysis-meta',
      version: 1,
      exportedAt: new Date().toISOString(),
      username: user,
      engine: { id: config.engine, depth: config.depth, label: `${config.engineLabel} · Tiefe ${config.depth}` },
      games: [],
      countries: {},
    };
  }
  let s = state[key];
  if (s?.engine !== ENGINE_KEY) s = state[key] = { engine: ENGINE_KEY, initialized: false, complete: false, etags: {}, skipped: [] };

  // Once everything was analyzed, only the months since the newest analyzed
  // game can hold new ones; until then (backlog) every archive.
  const { data } = await getJson(`https://api.chess.com/pub/player/${key}/games/archives`);
  const archives = data.archives ?? [];
  const newest = master.games.reduce((m, g) => Math.max(m, g.game.end_time ?? 0), 0);
  const since = newest ? monthOfGame(newest) : '';
  const recent = recentArchiveUrls(user);
  const urls = [...new Set([...(s.complete ? archives.filter((u) => monthOf(u) >= since) : archives), ...recent])];

  // Records without the engine log (older runs) count as not done and get replaced.
  const done = new Set(master.games.filter((g) => g.engine?.evals).map((g) => g.game.url));
  const skipped = new Set(s.skipped);
  const etags = {};
  const targets = [];
  for (const url of urls) {
    const { data: month, etag } = await getJson(url);
    if (recent.includes(url)) etags[url] = etag;
    for (const raw of month.games ?? []) {
      if (done.has(raw.url) || skipped.has(raw.url)) continue;
      const rec = buildFastRecord(raw, user);
      if (rec && !isCoachGame(rec)) targets.push({ user, rec });
    }
  }
  return { user, master, s, etags, open: targets.length, targets, analyzed: 0, failed: 0, saving: Promise.resolve() };
}

/** Serialized per player - several engines may finish games of the same player at once. */
function saveMaster(p) {
  p.saving = p.saving.then(() => {
    p.master.exportedAt = new Date().toISOString();
    p.master.games.sort((a, b) => b.game.end_time - a.game.end_time);
    return writeJson(masterFile(p.user), p.master);
  });
  return p.saving;
}

// Safety nets - a run must always end in time to commit what it has (the
// workflow's job timeout cancels everything after it, commit included):
//  - a game taking longer than GAME_TIMEOUT_MS kills its engine (the pending
//    evaluate() rejects, the game counts as skipped, the worker starts a fresh engine);
//  - GRACE_MS after the time budget, whatever still runs is abandoned and the
//    run finishes regularly with what is done.
const GAME_TIMEOUT_MS = Number(process.env.GAME_TIMEOUT_MINUTES ?? 20) * 60_000;
const GRACE_MS = Number(process.env.GRACE_MINUTES ?? 15) * 60_000;
const engines = new Set(); // every live engine, for the GRACE_MS cut-off
let cuttingOff = false;

async function analyzeOne(engine, p, rec) {
  const started = Date.now();
  const timer = setTimeout(() => {
    console.warn(`  Zeitüberschreitung nach ${GAME_TIMEOUT_MS / 60_000} Min.: ${rec.url} - Engine wird neu gestartet`);
    engine.terminate();
  }, GAME_TIMEOUT_MS);
  try {
    const avgRating = rec.ownRating && rec.oppRating ? (rec.ownRating + rec.oppRating) / 2 : null;
    const recorder = recordingEngine(engine);
    const analysis = await analyzeGame(rec.raw.pgn, recorder, { depth: config.depth, avgRating });
    const record = { ...buildEngineRecord(analysis, rec.color, rec.initialClock), evals: String(recorder) };
    p.master.games = p.master.games.filter((g) => g.game.url !== rec.url);
    p.master.games.push({ game: rec.raw, engine: record });
    const opp = rec.opponent.toLowerCase();
    if (!(opp in p.master.countries)) p.master.countries[opp] = (await fetchPlayerProfile(rec.opponent)).country ?? null;
    p.analyzed++;
    await saveMaster(p);
  } catch (err) {
    if (cuttingOff) return; // abandoned at the cut-off, not the game's fault - the next run tries again
    // E.g. an aborted game without a single move - skipped for good
    // instead of failing every run.
    p.failed++;
    p.s.skipped.push(rec.url);
    console.warn(`  übersprungen: ${rec.url} (${err.message ?? err})`);
  } finally {
    clearTimeout(timer);
  }
  p.open--;
  console.log(`[${p.user}] vs ${rec.opponent}, ${new Date(rec.endTime).toISOString().slice(0, 10)}, ${rec.moves} Züge: ${Math.round((Date.now() - started) / 1000)} s · noch ${p.open} offen`);
}

const state = await loadState();
const users = initial ? config.users : config.users.filter((u) => state[u.toLowerCase()]?.initialized && state[u.toLowerCase()].engine === ENGINE_KEY);
const players = [];
for (const user of users) players.push(await preparePlayer(user, state));
const byUser = new Map(players.map((p) => [p.user, p]));
const queue = players.flatMap((p) => p.targets).sort((a, b) => b.rec.endTime - a.rec.endTime);
const engineCount = Math.max(1, Math.min(Number(process.env.ENGINES ?? availableParallelism()), queue.length, maxGames));
console.log(`${initial ? 'Erstanalyse' : 'Planmäßig'}: ${queue.length} Partien (${players.map((p) => `${p.user}: ${p.targets.length}`).join(', ') || 'keine Spieler'}), ${engineCount} Engines.`);

let next = 0;
async function engineWorker() {
  let engine = null;
  try {
    while (next < queue.length && next < maxGames && Date.now() < deadline) {
      const { user, rec } = queue[next++];
      if (!engine?.isReady) {
        engine = new StockfishEngine();
        engines.add(engine);
        await engine.init(undefined, config.engine);
      }
      await analyzeOne(engine, byUser.get(user), rec);
    }
  } finally {
    engine?.terminate();
  }
}

let finished = false;
/** Writes state, summary and step output - once, from the regular end or the GRACE_MS cut-off. */
async function finish() {
  if (finished) return;
  finished = true;
  for (const p of players) {
    p.s.complete = p.open === 0;
    if (p.s.complete) p.s.initialized = true;
    // Only a finished player gets the ETags - check.mjs then sees 304 until a new game appears.
    p.s.etags = p.s.complete ? p.etags : {};
  }
  await writeJson(STATE_FILE, state, { pretty: true });
  await Promise.all(players.map((p) => p.saving));

  const allDone = players.every((p) => p.s.complete);
  const table = [
    '| Spieler | neu analysiert | übersprungen | noch offen | gesamt |',
    '|---|---|---|---|---|',
    ...players.map((p) => `| ${p.user} | ${p.analyzed} | ${p.failed} | ${p.open} | ${p.master.games.length} |`),
  ].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## ${initial ? 'Erstanalyse' : 'Auto-Analyse'} (${config.engineLabel}, Tiefe ${config.depth})\n\n${table}\n`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `done=${allDone}\n`);
}

const cutOff = setTimeout(async () => {
  console.warn(`Zeitbudget um ${GRACE_MS / 60_000} Min. überschritten - laufende Partien werden abgebrochen, der Rest folgt im nächsten Lauf.`);
  cuttingOff = true;
  for (const engine of engines) engine.terminate();
  await finish();
  process.exit(0);
}, Math.max(0, deadline - Date.now()) + GRACE_MS);
cutOff.unref();

await Promise.all(Array.from({ length: engineCount }, engineWorker));
await finish();
