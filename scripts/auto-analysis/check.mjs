// The scheduled gate of the auto-analysis: decides whether analyze.mjs has
// anything to do, without the engine, the app code or the master files. Per
// Chess.com player it sends two conditional requests for the newest monthly
// archives; Chess.com answers 304 (no body) while nothing changed. Per Lichess
// player it compares the game count with the one of the last complete run.
// Players whose one-time initial analysis (auto-analysis-initial.yml) isn't
// finished are left alone. Prints the result as the step output `todo=true|false`.

import { appendFile } from 'node:fs/promises';
import { players, ENGINE_KEY, loadState, recentArchiveUrls, chessFetch, lichessGameCount } from './common.mjs';

const state = await loadState();
const reasons = [];

for (const player of players) {
  const user = player.name;
  const s = state[player.key];
  if (!s?.initialized || s.engine !== ENGINE_KEY) {
    console.log(`${user}: wartet auf die Erstanalyse (Workflow „Auto-Analyse: Erstanalyse“).`);
    continue;
  }
  if (!s.complete) {
    reasons.push(`${user}: Rückstand aus dem letzten Lauf`);
    continue;
  }
  if (player.site === 'lichess') {
    const count = await lichessGameCount(user);
    if (count !== s.gameCount) reasons.push(`${user} (Lichess): Partienzahl ${s.gameCount ?? '?'} → ${count}`);
    continue;
  }
  for (const url of recentArchiveUrls(user)) {
    const res = await chessFetch(url, { etag: s.etags?.[url] });
    await res.body?.cancel();
    if (res.status === 304) continue;
    if (!res.ok) throw new Error(`Chess.com antwortet ${res.status} für ${url}`);
    reasons.push(`${user}: ${url.split('/games/')[1]} hat sich geändert`);
  }
}

const todo = reasons.length > 0;
console.log(todo ? `Analyse nötig:\n- ${reasons.join('\n- ')}` : 'Nichts zu tun.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `todo=${todo}\n`);
