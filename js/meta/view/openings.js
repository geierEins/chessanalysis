// The "Eröffnungen" tab: the opening tree per color.

import { esc, wdl, score, avg, pc, f1, fold } from './format.js';
import { card, EMPTY, wdlBar, sortHead, sortRows } from './cards.js';
import { gamesCount } from './gameLists.js';

export function openings(rs, ctx) {
  if (!rs.length) return card('Eröffnungen', EMPTY, { cls: 'w12' });
  const sort = ctx.sorts.openings;
  // "Ergebnis" sorts by share of wins, then of draws.
  const sortValue = {
    games: (l) => l.length,
    result: (l) => {
      const c = wdl(l);
      return (c.W + c.D / 1000) / l.length;
    },
    score: (l) => score(l),
    acc: (l) => avg(l, (r) => ctx.engineOf(r)?.accuracy),
  }[sort.key] ?? ((l) => l.length);
  const sortTh = (key, label, cls) => sortHead('openings', sort, key, label, cls);
  // One color's card: the openings as a tree (metaRecords' openingPath) - the
  // first move's name ("King's Pawn Game"), below it what the game became
  // ("Italian Game"), below that its variations. A game counts in every node on
  // its path. Nodes open and close by their toggle (metaController's
  // openingOpen). The search (metaController's openingSearch.w / .b) keeps the
  // matching nodes and opens their ancestors; case and accents don't matter.
  const colorCard = (list, color) => {
    const root = { children: new Map() };
    for (const r of list) {
      let node = root;
      for (const step of r.openingPath ?? []) {
        let child = node.children.get(step.key);
        if (!child) {
          child = { key: `${node.key ?? color}›${step.key}`, name: step.name, label: step.label, move: step.move, line: step.line, named: step.named, games: [], end: [], mine: 0, children: new Map() };
          node.children.set(step.key, child);
        }
        child.games.push(r);
        if (step.byMe) child.mine++;
        node = child;
      }
      node.end?.push(r); // the game left the book here, before another name
    }
    if (!root.children.size) return '<p class="meta-muted">Keine Partien mit dieser Farbe.</p>';
    const raw = ctx.openingSearch?.[color] ?? '';
    const query = fold(raw.trim());
    let hits = 0;
    // Marks node.hit (its name matches) and node.below (a descendant matches).
    const mark = (node) => {
      let below = false;
      for (const c of node.children.values()) {
        c.hit = fold(c.named ? c.name : c.label).includes(query);
        if (c.hit) hits++;
        mark(c);
        below ||= c.hit || c.below;
      }
      node.below = below;
    };
    if (query) mark(root);
    const search = `<input type="search" class="meta-country-search" data-opening-search="${color}" value="${esc(raw)}" placeholder="Eröffnung suchen …" aria-label="Eröffnung suchen (${color === 'w' ? 'Weiß' : 'Schwarz'})" autocomplete="off">`;
    if (query && !hits) return `${search}<p class="meta-muted">Keine Eröffnung passt zu „${esc(raw.trim())}“.</p>`;
    const hint = query ? `<p class="meta-muted">${hits} ${hits === 1 ? 'Eröffnung passt' : 'Eröffnungen passen'} zur Suche.</p>` : '';
    const stats = (l) => `<td class="r">${gamesCount(l)}</td><td>${wdlBar(l)}</td><td class="r">${pc(score(l))}</td><td class="r">${f1(avg(l, (r) => ctx.engineOf(r)?.accuracy))}</td><td class="r ph-hide">${f1(avg(l, (r) => r.bookPlies / 2))}</td>`;
    const rows = (node, depth) =>
      sortRows([...node.children.values()].filter((c) => !query || c.hit || c.below).map((c) => ({ c, l: c.games, v: sortValue(c.games) })), sort.dir)
        .map(({ c }) => {
          const kids = c.children.size > 0;
          const open = kids && (ctx.openingOpen.has(c.key) || (query && c.below));
          const toggle = kids
            ? `<button type="button" class="meta-otree-toggle" data-otree="${esc(c.key)}" aria-expanded="${open}" aria-label="${open ? 'Zuklappen' : 'Aufklappen'}">${open ? '▾' : '▸'}</button>`
            : '<span class="meta-otree-leaf"></span>';
          // Below the first level: who played this ply (by majority, to be safe).
          const me = c.mine * 2 >= c.games.length;
          const who = depth
            ? `<span class="meta-otree-who${me ? ' me' : ''}" data-tip="${me ? 'Dein Zug' : 'Zug des Gegners'}">${me ? 'ich' : 'Gegner'}</span>`
            : '';
          const row = `<tr class="meta-otree d${depth}"><td><span class="meta-otree-cell" style="--depth:${depth}">${toggle}<span data-opening="${esc(c.name)}" data-line="${esc(c.line)}"${c.named ? "" : " class=\"meta-otree-plain\""}>${esc(c.label)}</span>${c.named ? `<span class="meta-otree-move">${esc(c.move)}</span>` : ""}${who}</span></td>${stats(c.games)}</tr>`;
          // Opened, the children add up to the node: games that left the book
          // before another name get their own last row (not while searching).
          const rest =
            open && !query && c.end.length
              ? `<tr class="meta-otree d${depth + 1}"><td><span class="meta-otree-cell" style="--depth:${depth + 1}"><span class="meta-otree-leaf"></span><span class="meta-otree-rest" data-tip="Diese Partien haben das Eröffnungsbuch verlassen, bevor ein weiterer Name entstand.">ohne weiteren Namen</span></span></td>${stats(c.end)}</tr>`
              : '';
          return row + (open ? rows(c, depth + 1) + rest : '');
        })
        .join('');
    return `${search}${hint}<div class="meta-tbl"><table><thead><tr><th>Eröffnung</th>${sortTh('games', 'Partien', 'r')}${sortTh('result', 'Ergebnis', 'wide')}${sortTh('score', 'Quote', 'r')}${sortTh('acc', 'Ø Gen.', 'r')}<th class="r ph-hide">Ø Theoriezüge</th></tr></thead><tbody>${rows(root, 0)}</tbody></table></div>`;
  };
  const white = rs.filter((r) => r.color === 'w');
  const black = rs.filter((r) => r.color === 'b');
  return `<div class="meta-grid">
    ${card('Mit Weiß', colorCard(white, 'w'), { cls: 'w12' })}
    ${card('Mit Schwarz', colorCard(black, 'b'), { cls: 'w12', note: 'Namen aus dem Eröffnungsbuch der App (Lichess-ECO-Daten), als Baum: jede Ebene ist ein Halbzug. Entsteht dabei ein neuer Name, steht er mit dem Zug da, sonst nur der Zug. Eine Partie zählt in jeder Ebene ihres Weges; „ohne weiteren Namen“: Partien, die das Buch vorher verlassen haben. „ich“ / „Gegner“: wer den Halbzug gespielt hat. Tooltip: Grundstellung und Züge der Eröffnung. „Ø Theoriezüge“: wie lange die Partie im Buch blieb.' })}
  </div>`;
}
