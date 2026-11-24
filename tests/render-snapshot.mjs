// Renders every Meta-Analyse tab with fixed data and prints {tab: html} as JSON,
// loading the app's modules from the given root - so CI can render main and a
// branch with the same script and diff the two (.github/workflows/tests.yml,
// job render-diff): a pure refactoring must leave every byte of HTML unchanged.
//   node tests/render-snapshot.mjs <root>
// The data always comes from this checkout's data/joeyfinanzen.json.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

register('../scripts/auto-analysis/https-loader.mjs', import.meta.url);

const root = resolve(process.argv[2] ?? '.');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { META_TABS, renderMetaTab } = await load('js/meta/metaView.js');
const { buildFastRecord } = await load('js/meta/metaRecords.js');

const master = JSON.parse(readFileSync(new URL('../data/joeyfinanzen.json', import.meta.url), 'utf8'));
const username = master.username;
const engines = new Map();
const records = [];
for (const entry of master.games) {
  const r = buildFastRecord(entry.game, username);
  if (!r) continue;
  records.push(r);
  if (entry.engine) engines.set(r.url, entry.engine);
}

// The controller's start values (metaController.js), the opening tree fully open.
const ctx = {
  engineOf: (r) => engines.get(r.url) ?? null,
  marked: null,
  queueState: () => null,
  countryOf: () => null,
  opponent: null,
  filterTo: null,
  sorts: { openings: { key: 'games', dir: 'desc' }, countries: { key: 'score', dir: 'desc' }, games: { key: 'date', dir: 'desc' } },
  gamesShown: 200,
  countryLimit: 25,
  countrySearch: '',
  gameSearch: '',
  openingSearch: { w: '', b: '' },
  openingOpen: { has: () => true },
  endings: { longest: new Set(), shortest: new Set(['checkmate']) },
  heatmap: { mode: 'taken', measure: 'count', pieces: [], oppPieces: [] },
  mateHeat: 'set',
  username,
  engineLabel: 'test',
  countriesPending: false,
  countriesDone: 0,
  countriesTotal: 0,
};

const out = {};
let failed = false;
for (const { id } of META_TABS) {
  try {
    out[id] = renderMetaTab(id, records, ctx);
  } catch (err) {
    out[id] = `RENDER ERROR: ${err.stack ?? err}`;
    failed = true;
  }
}
console.log(JSON.stringify(out, null, 1));
if (failed) process.exit(1);
