// The "Heatmap" tab: on which squares pieces were captured, with piece filters and a summary.

import { PIECE_LABEL } from '../metaRecords.js';
import { pieceUrl } from '../openingBoard.js';
import { esc, pc, f1 } from './format.js';
import { card, EMPTY, bigStats, hbars, segPicker } from './cards.js';
import { FILES, heatColor } from './charts.js';

// Icons with a tooltip (metaController's shared data-tip one) instead of a label.
const HEAT_MODES = [
  ['taken', '⚔️', 'Zeigt an, wie oft ich auf diesem Feld eine gegnerische Figur geschlagen habe'],
  ['lost', '💀', 'Zeigt an, wie oft eine meiner Figuren auf diesem Feld geschlagen wurde'],
];
const HEAT_PIECES = ['p', 'n', 'b', 'r', 'q']; // + the king where it can capture (piecePicker)
const VALUE_KEY = 'Bauer 1, Springer und Läufer 3, Turm 5, Dame 9';
// The summary card's switch (metaController's heatmap.measure): how many pieces, or what they were worth.
const HEAT_MEASURES = [
  ['count', 'Anzahl', 'Zählt die geschlagenen Figuren, jede Figur einmal.', 'text'],
  ['value', 'Wert', `Zählt den Materialwert der geschlagenen Figuren statt ihrer Anzahl (${VALUE_KEY}).`, 'text'],
];
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 }; // the king is never captured


/** Toggle chips, one per piece type; none on = all pieces.
 *  side: 'own' | 'opp' - which piece of a capture (metaController's heatmap.pieces / oppPieces).
 *  The king only where it can take part: capturing, never captured. */
// German nouns for the summary's sentences: 'Bauer' changes in the accusative/dative, the Dame is the only feminine one.
const PIECE_NOUN = { p: ['Bauer', 'Bauern'], n: ['Springer', 'Springer'], b: ['Läufer', 'Läufer'], r: ['Turm', 'Turm'], q: ['Dame', 'Dame'], k: ['König', 'König'] };
const joinOr = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} oder ${xs.at(-1)}`);

/** The chosen pieces as one phrase, e.g. "einen gegnerischen Bauern oder Läufer".
 *  kase: 'nom' | 'acc' | 'dat'; masc/fem: the article + adjective for each gender. */
function piecePhrase(ps, kase, masc, fem) {
  const inflected = (p) => PIECE_NOUN[p][kase === 'nom' ? 0 : 1];
  const m = ps.filter((p) => p !== 'q').map(inflected);
  return joinOr([...(m.length ? [`${masc} ${joinOr(m)}`] : []), ...(ps.includes('q') ? [`${fem} Dame`] : [])]);
}

/** The summary's tooltips: what its two counts mean under the current piece filters. */
function heatSentences(own, opp, count) {
  const times = (n) => (n === 1 ? 'einmal' : `${n}-mal`);
  const takenBy = own.length ? piecePhrase(own, 'nom', 'dein', 'deine') : 'eine deiner Figuren';
  const taken = opp.length ? piecePhrase(opp, 'acc', 'einen gegnerischen', 'eine gegnerische') : 'eine gegnerische Figur';
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const lostWho = own.length ? `${cap(piecePhrase(own, 'nom', 'dein', 'deine'))} wurde` : 'Deine Figuren wurden';
  const lostBy = opp.length ? piecePhrase(opp, 'dat', 'einem gegnerischen', 'einer gegnerischen') : 'gegnerischen Figuren';
  return {
    taken: `${count.taken === 1 ? 'In einem Fall' : `In ${count.taken} Fällen`} hat ${takenBy} ${taken} geschlagen.`,
    lost: `${lostWho} ${times(count.lost)} von ${lostBy} geschlagen.`,
  };
}

// Between the two piece pickers, so the row reads as a sentence: "Meine Figuren schlägt / geschlagen von Gegnerische Figuren".
function heatVerb(mode) {
  return mode === 'lost'
    ? '<span class="meta-heat-verb lost">geschlagen von</span>'
    : '<span class="meta-heat-verb taken">schlägt</span>';
}

/** One tile per own piece, above the heatmap: what the pieces it took were worth on
 *  average (value ÷ count). Always the user's captures, whatever the heatmap shows,
 *  and without its piece filters - each tile is one piece already. */
function captureRatioTiles(games, own) {
  const stats = Object.fromEntries(Object.keys(PIECE_LABEL).map((p) => [p, { n: 0, v: 0 }]));
  for (const r of games) {
    for (const c of r.captures?.taken ?? []) {
      const s = stats[c[2]];
      if (!s) continue;
      s.n++;
      s.v += PIECE_VALUE[c[3]] ?? 0;
    }
  }
  const tiles = Object.entries(PIECE_LABEL).map(([p, label]) => {
    const { n, v } = stats[p];
    const ratio = n ? v / n : null;
    const art = p === 'q' ? 'Die' : 'Der';
    const tip = n
      ? `${art} ${label} hat ${n === 1 ? 'eine gegnerische Figur' : `${n} gegnerische Figuren`} geschlagen, zusammen ${v} Bauerneinheiten wert (${VALUE_KEY}).\n`
        + `Verhältnis Wert ÷ Anzahl = ${v} ÷ ${n} = ${f1(ratio)}: So viel war eine geschlagene Figur im Schnitt wert.`
      : `${art} ${label} hat in diesen Partien keine Figur geschlagen.`;
    const detail = n ? `${v} Wert · ${n} ${n === 1 ? 'Schlag' : 'Schläge'}` : 'keine Schläge';
    return `<div class="meta-kpi meta-ratio" style="--kpi-accent:var(--meta-s1)" data-tip="${esc(tip)}">`
      + `<img class="meta-ratio-icon" src="${pieceUrl(`${own}${p.toUpperCase()}`)}" alt="">`
      + `<span class="l">${label}</span><span class="v">${f1(ratio)}</span><span class="d">${detail}</span></div>`;
  });
  // The icons as outlines only (css .meta-ratio-icon): the piece's shape minus the same
  // shape shrunk by 1.5px, filled in the text color - the same for every piece theme.
  const outline = '<svg class="meta-svg-defs" aria-hidden="true"><filter id="meta-piece-outline">'
    + '<feMorphology in="SourceAlpha" operator="erode" radius="1.5" result="in"/>'
    + '<feComposite in="SourceAlpha" in2="in" operator="out" result="ring"/>'
    + '<feFlood class="meta-outline-color"/><feComposite in2="ring" operator="in"/></filter></svg>';
  return `<div class="meta-kpis six">${outline}${tiles.join('')}</div>`;
}

function piecePicker(side, chosen, mode) {
  const kingFits = side === 'own' ? mode === 'taken' : mode === 'lost';
  const btns = [...HEAT_PIECES, ...(kingFits ? ['k'] : [])].map((p) => {
    const on = chosen.includes(p);
    return `<button type="button" class="${on ? 'on' : ''}" data-heat-piece="${p}" data-heat-side="${side}" aria-pressed="${on}">${PIECE_LABEL[p]}</button>`;
  });
  const label = side === 'own' ? 'Meine Figuren' : 'Gegnerische Figuren';
  return `<span class="meta-seg" role="group" aria-label="${label}"><span class="meta-seg-l">${label}</span>${btns.join('')}</span>`;
}

export function heatmapTab(rs, ctx) {
  if (!rs.length) return card('Heatmap', EMPTY, { cls: 'w12' });
  const { mode, pieces, oppPieces } = ctx.heatmap;
  const games = rs; // the top bar's color filter decides which games
  // Captures are "<square><own piece><opponent's piece>" (metaRecords' captureSquares),
  // so one filter row is always the user's piece, the other the opponent's.
  // A king chosen for the other direction (piecePicker hides it there) is left out.
  const ownSel = pieces.filter((p) => p !== 'k' || mode === 'taken');
  const oppSel = oppPieces.filter((p) => p !== 'k' || mode === 'lost');
  const counts = (c) => (!ownSel.length || ownSel.includes(c[2])) && (!oppSel.length || oppSel.includes(c[3]));
  const bySquare = new Map(); // "e4" -> {n, own: {q: 3, ...}, opp: {r: 2, ...}}
  const byPiece = {}; // own piece -> count
  const tally = (o, k) => (o[k] = (o[k] ?? 0) + 1);
  for (const r of games) {
    for (const c of (r.captures?.[mode] ?? []).filter(counts)) {
      const sq = c.slice(0, 2);
      const e = bySquare.get(sq) ?? { n: 0, own: {}, opp: {} };
      e.n++;
      tally(e.own, c[2]);
      tally(e.opp, c[3]);
      bySquare.set(sq, e);
      tally(byPiece, c[2]);
    }
  }
  const total = [...bySquare.values()].reduce((a, e) => a + e.n, 0);
  const modeColor = mode === 'lost' ? 'var(--meta-loss)' : 'var(--meta-s1)'; // as the mode switch (css .meta-seg [data-heat-mode])
  // Both directions for the summary, whichever the board shows.
  // value: the captured pieces' worth - the opponent's piece when you take, yours when you lose one.
  const count = { lost: 0, taken: 0 };
  const value = { lost: 0, taken: 0 };
  for (const r of games) {
    for (const k of ['lost', 'taken']) {
      for (const c of (r.captures?.[k] ?? []).filter(counts)) {
        count[k]++;
        value[k] += PIECE_VALUE[k === 'taken' ? c[3] : c[2]] ?? 0;
      }
    }
  }
  const perGame = (n) => f1(games.length ? n / games.length : null);
  const sentence = heatSentences(ownSel, oppSel, count); // the same filters as the counts
  const byValue = ctx.heatmap.measure === 'value';
  const summaryRow = (k, label, color) => {
    if (!byValue) {
      return [
        [count[k], label, color, sentence[k]],
        [perGame(count[k]), 'pro Partie', color, `Im Schnitt ${perGame(count[k])}-mal pro Partie (${games.length} Partien).`],
      ];
    }
    const n = count[k];
    const worth = `${k === 'taken' ? 'Geschlagenes' : 'Verlorenes'} Material im Wert von ${value[k]} Bauerneinheiten, aus ${n === 1 ? 'einem Schlag' : `${n} Schlägen`} (${VALUE_KEY}).`;
    return [
      [value[k], k === 'taken' ? 'Materialwert geschlagen' : 'Materialwert verloren', color, worth],
      [perGame(value[k]), 'pro Partie', color, `Im Schnitt ${perGame(value[k])} Bauerneinheiten pro Partie (${games.length} Partien).`],
    ];
  };
  const max = Math.max(1, ...[...bySquare.values()].map((e) => e.n));
  const pieceList = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${PIECE_LABEL[p]} ${n}`).join(', ');
  const [ownLabel, oppLabel] = mode === 'lost' ? ['Verloren', 'Geschlagen von'] : ['Geschlagen mit', 'Geschlagen wurde'];

  // Black at the bottom only when every game is as Black (top bar's color filter) -
  // with both colors there is no single own side.
  const flipped = games.every((r) => r.color === 'b');
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [...FILES].reverse() : [...FILES];
  let squares = '';
  for (const rank of ranks) {
    for (const f of files) {
      const sq = `${f}${rank}`;
      const e = bySquare.get(sq);
      const light = (FILES.indexOf(f) + rank) % 2 === 0;
      const detail = e ? `\n${ownLabel}: ${pieceList(e.own)}\n${oppLabel}: ${pieceList(e.opp)}` : '';
      const tip = `${sq}: ${e?.n ?? 0} ${e?.n === 1 ? 'Schlag' : 'Schläge'}${detail}`;
      squares += `<div class="meta-heat-sq ${light ? 'l' : 'd'}" data-tip="${esc(tip)}">${
        e ? `<i style="background:${heatColor(e.n / max, mode)}"></i><b>${e.n}</b>` : ''
      }${f === files[0] ? `<span class="rk">${rank}</span>` : ''}${rank === ranks[7] ? `<span class="fl">${f}</span>` : ''}</div>`;
    }
  }
  const legend = `<div class="meta-heat-legend"><span>wenig</span><i style="background:linear-gradient(90deg, ${heatColor(0, mode)}, ${heatColor(0.5, mode)}, ${heatColor(1, mode)})"></i><span>viel</span></div>`;
  const board = total
    ? `<div class="meta-heat-board">${squares}</div>${legend}`
    : `<p class="meta-muted">Keine Schlagzüge in diesen Partien.</p>`;

  const topSquares = [...bySquare.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([sq, e]) => ({ label: sq, v: e.n, tip: `${sq}: ${e.n} von ${total} (${pc(e.n / total)})`, color: modeColor }));
  // Own pieces, so icons in the own color (with both colors: white).
  const own = flipped ? 'b' : 'w';
  const pieceRows = Object.entries(PIECE_LABEL)
    .filter(([p]) => byPiece[p])
    .map(([p, label]) => ({
      label,
      labelHtml: `<img class="meta-piece-icon" src="${pieceUrl(`${own}${p.toUpperCase()}`)}" alt="">${label}`,
      v: byPiece[p],
      tip: `${label}: ${byPiece[p]} (${pc(byPiece[p] / total)})`,
    }))
    .sort((a, b) => b.v - a.v);

  const controls = `<div class="meta-heat-controls">${segPicker(HEAT_MODES, mode, 'heat-mode', 'Was zeigen')}${piecePicker('own', pieces, mode)}${heatVerb(mode)}${piecePicker('opp', oppPieces, mode)}</div>`;
  const what = mode === 'lost'
    ? 'Felder, auf denen der Gegner deine Figuren geschlagen hat. „Meine Figuren“ wählt deine geschlagene Figur, „Gegnerische Figuren“ die schlagende'
    : 'Felder, auf denen du gegnerische Figuren geschlagen hast. „Meine Figuren“ wählt deine schlagende Figur, „Gegnerische Figuren“ die geschlagene';
  // The filter bar sits in the grid right above the heatmap card, as wide as it (css .meta-heat-grid).
  return `${captureRatioTiles(games, own)}<div class="meta-grid meta-heat-grid">${controls}
    ${card('Schlag-Heatmap', board, { cls: 'w8', note: `${what}. Farbe = Anzahl Schläge auf dem Feld, der Tooltip zeigt, welche Figuren beteiligt waren.${flipped ? ' Brett aus Sicht von Schwarz.' : ''}` })}
    <div class="meta-stack">
      ${card('Zusammenfassung', bigStats([
        ...summaryRow('taken', 'gegnerische Figuren geschlagen', 'var(--meta-s1)'),
        ...summaryRow('lost', 'eigene Figuren verloren', 'var(--meta-loss)'),
      ], 'two'), { head: segPicker(HEAT_MEASURES, byValue ? 'value' : 'count', 'heat-measure', 'Anzahl oder Materialwert') })}
      ${card(mode === 'lost' ? 'Welche Figuren du verlierst' : 'Womit du schlägst', hbars(pieceRows, { color: modeColor }))}
      ${card('Die heißesten Felder', hbars(topSquares))}
    </div>
  </div>`;
}
