// The "Eröffnungen" tab's opening stream: one color's opening paths as bands
// flowing left to right, as thick as their game count and colored by score.
// buildStream() makes the tree (the same nodes as the tab's opening trees).

import { score } from './format.js';

export const MAX_PLY = 16; // the stream never goes deeper than this

/**
 * The games' opening paths (metaRecords' openingPath) as a tree, cut at maxPly.
 * A node is identified by its path of step keys, as in the opening trees.
 * Games without a path are left out. Children are sorted by game count
 * (descending, ties in order of first appearance).
 * @returns {{key: string, ply: number, move: string, label: string, named: boolean, name: string|null, line: string, n: number, score: number|null, children: object[]}}
 */
export function buildStream(records, maxPly = MAX_PLY) {
  const node = (step, ply) => ({ key: step?.key ?? '', ply, move: step?.move ?? '', label: step?.label ?? '', named: step?.named ?? false, name: step?.name ?? null, line: step?.line ?? '', games: [], kids: new Map() });
  const root = node(null, 0);
  for (const r of records) {
    const path = r.openingPath ?? [];
    if (!path.length) continue;
    root.games.push(r);
    let cur = root;
    for (const step of path.slice(0, maxPly)) {
      let next = cur.kids.get(step.key);
      if (!next) cur.kids.set(step.key, (next = node(step, cur.ply + 1)));
      next.games.push(r);
      cur = next;
    }
  }
  const finish = (n) => {
    const children = [...n.kids.values()].map(finish).sort((a, b) => b.n - a.n); // stable: ties keep insertion order
    const { kids, games, ...rest } = n;
    return { ...rest, n: games.length, score: score(games), children };
  };
  return finish(root);
}
