// Analyses from the scheduled GitHub job (scripts/auto-analysis/): one master
// file per player in the repo, in the Meta-Analyse export format, read
// straight from GitHub (the Netlify site is deployed separately and never
// has them). Merged into the browser's IndexedDB like an import, so the
// Meta-Analyse and the single-game mode both only ever look there.

import { loadEngineRecords, saveEngineRecords } from './metaStore.js';

const BASE = 'https://raw.githubusercontent.com/geierEins/chessanalysis/main/data';
const FILE_FORMAT = 'chessanalysis-meta';

const engineByUser = new Map(); // lowercased username -> {engineId, depth, label} of their master file

/**
 * Stores every engine record of the player's master file that the browser
 * doesn't have yet - or only has without the per-move log (js/analysis/evalLog.js).
 * @returns {Promise<{engineId: string, depth: number, label: string, added: number,
 *   countries: Array<[string, string|null]>}|null>} null if the player has no master file
 */
export async function syncAutoAnalysis(user) {
  let data;
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(user.toLowerCase())}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }
  if (data?.format !== FILE_FORMAT || !Array.isArray(data.games) || !data.engine?.id) return null;
  const engine = { engineId: data.engine.id, depth: Number(data.engine.depth), label: data.engine.label };
  engineByUser.set(user.toLowerCase(), engine);
  const entries = data.games.filter((g) => g.engine && g.game?.url).map((g) => [g.game.url, g.engine]);
  const have = await loadEngineRecords(engine.engineId, engine.depth, entries.map(([url]) => url));
  const fresh = entries.filter(([url, rec]) => !have.has(url) || (rec.evals && !have.get(url).evals));
  await saveEngineRecords(engine.engineId, engine.depth, fresh);
  return { ...engine, added: fresh.length, countries: Object.entries(data.countries ?? {}) };
}

/** Engine + depth of the player's master file, once syncAutoAnalysis() found one - else null. */
export function autoAnalysisEngine(user) {
  return engineByUser.get(user.toLowerCase()) ?? null;
}
