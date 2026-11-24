// The "Eröffnungen" tab: the opening tree per color, first moves, strongest and weakest openings.

import { esc, wdl, score, avg, pc, f1, groupBy, byCountDesc, fold } from './format.js';
import { card, EMPTY, wdlBar, hbars, sortHead, sortRows } from './cards.js';
import { gamesCount } from './gameLists.js';

export function openings(rs, ctx) {
  if (!rs.length) return card('Eröffnungen', EMPTY, { cls: 'w12' });
  const name = (r) => r.family ?? 'Ohne Eröffnungsnamen';
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
  const moveRows = (list, prefix) =>
    [...groupBy(list.filter((r) => r.firstMove), (r) => r.firstMove)]
      .sort(byCountDesc)
      .slice(0, 8)
      .map(([mv, l]) => ({ label: `${prefix}1. ${mv}`, v: l.length, tip: `${prefix}1. ${mv}: ${l.length} Partien, Quote ${pc(score(l))}` }));
  const ranked = [...groupBy(rs.filter((r) => r.family), name)]
    .filter(([, l]) => l.length >= 5)
    .map(([fam, l]) => ({ fam, s: score(l), n: l.length }))
    .sort((a, b) => b.s - a.s);
  const list = (arr) =>
    arr.length
      ? `<div class="meta-rows">${arr.map((r) => `<div class="meta-card-head small"><span data-opening="${esc(r.fam)}">${esc(r.fam)}</span><span class="meta-muted">${pc(r.s)} · ${r.n} P.</span></div>`).join('')}</div>`
      : '<p class="meta-muted">Noch keine Eröffnung mit 5 oder mehr Partien.</p>';
  return `<div class="meta-grid">
    ${card('Mit Weiß', colorCard(white, 'w'), { cls: 'w12' })}
    ${card('Mit Schwarz', colorCard(black, 'b'), { cls: 'w12', note: 'Namen aus dem Eröffnungsbuch der App (Lichess-ECO-Daten), als Baum: jede Ebene ist ein Halbzug. Entsteht dabei ein neuer Name, steht er mit dem Zug da, sonst nur der Zug. Eine Partie zählt in jeder Ebene ihres Weges; „ohne weiteren Namen“: Partien, die das Buch vorher verlassen haben. „ich“ / „Gegner“: wer den Halbzug gespielt hat. Tooltip: Grundstellung und Züge der Eröffnung. „Ø Theoriezüge“: wie lange die Partie im Buch blieb.' })}
    ${card('Erster Zug als Weiß', hbars(moveRows(white, '')), { cls: 'w4' })}
    ${card('Als Schwarz gegen …', hbars(moveRows(black, 'gegen '), { color: 'var(--meta-s2)' }), { cls: 'w4' })}
    ${card('Stärkste und schwächste', `<h3>Beste Quote</h3>${list(ranked.slice(0, 3))}<h3>Schwächste Quote</h3>${list(ranked.length > 3 ? ranked.slice(-3).reverse() : [])}`, { cls: 'w4', note: 'Nur Eröffnungen mit mindestens 5 Partien.' })}
  </div>`;
}
