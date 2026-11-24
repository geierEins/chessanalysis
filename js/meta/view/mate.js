// The "Matt" tab: checkmate patterns, mating pieces, when the mate falls and where the king stood.

import { MATE_TYPES } from '../../analysis/mateType.js';
import { MATE_LABEL, PIECE_LABEL } from '../metaRecords.js';
import { pieceUrl } from '../openingBoard.js';
import { esc, pc, f1, avg, groupBy, byCountDesc } from './format.js';
import { card, EMPTY, kpi, wdlBar, segPicker } from './cards.js';
import { gamesCount } from './gameLists.js';
import { FILES, heatColor } from './charts.js';

/** The "Matt" tab: checkmate patterns of the filtered games (r.mate, js/analysis/mateType.js) - set and taken. */
export function mateTab(rs, ctx) {
  if (!rs.length) return card('Matt', EMPTY, { cls: 'w12' });
  const mated = rs.filter((r) => r.mate);
  if (!mated.length) {
    return `<div class="meta-grid">${card('Keine Mattpartien', '<p class="meta-muted">Keine der gefilterten Partien endet mit Matt.</p>', { cls: 'w12' })}</div>`;
  }
  const set = mated.filter((r) => r.mate.byMe);
  const taken = mated.filter((r) => !r.mate.byMe);
  const byType = MATE_TYPES.map((t) => [t, mated.filter((r) => r.mate.type === t)]).filter(([, l]) => l.length).sort(byCountDesc);
  const byPiece = [...groupBy(mated, (r) => r.mate.piece)].sort(byCountDesc);
  const flagged = (key) => mated.filter((r) => r.mate[key]);
  const doubles = flagged('doubleCheck');
  const discovered = flagged('discovered');
  const promoted = flagged('promotion');
  const n = (l) => `${l.length} ${l.length === 1 ? 'Partie' : 'Partien'}`;

  const kpis = `<div class="meta-kpis">
    ${kpi('♚ Partien mit Matt', gamesCount(mated), `${pc(mated.length / rs.length)} aller Partien · ${gamesCount(set, `${set.length} gesetzt`)}, ${gamesCount(taken, `${taken.length} kassiert`)}`, '', 'var(--meta-s1)')}
    ${kpi('♛ Häufigste Mattfigur', PIECE_LABEL[byPiece[0][0]], `${n(byPiece[0][1])} · ${pc(byPiece[0][1].length / mated.length)}`, '', '#9b7fe0')}
    ${kpi('⏱️ Ø Zug des Matts', f1(avg(mated, (r) => r.moves)), `gesetzt ${f1(avg(set, (r) => r.moves))} · kassiert ${f1(avg(taken, (r) => r.moves))}`, '', '#e2b84a')}
    ${kpi('⚡ Doppelschach-Matt', gamesCount(doubles), 'zwei Figuren geben Schach', '', '#f08a3c')}
    ${kpi('🎭 Abzugsmatt', gamesCount(discovered), 'Schach nicht von der gezogenen Figur', '', '#4bc2a3')}
    ${kpi('♕ Umwandlungsmatt', gamesCount(promoted), 'Matt mit dem Umwandlungszug', '', '#8fb4ff')}
  </div>`;

  // Rows of [label, games], most games first: gesetzt | distribution | kassiert | gesamt.
  const zero = '<span class="meta-faint">0</span>';
  const versusTable = (head, rows, cls = '') => `<div class="meta-tbl${cls ? ` ${cls}` : ''}"><table><thead><tr><th>${head}</th><th class="r">gesetzt</th><th class="wide c">Verteilung</th><th>kassiert</th><th class="r ph-hide">gesamt</th></tr></thead><tbody>
    ${rows
      .map(([label, l, mateType]) => {
        const mine = l.filter((r) => r.mate.byMe);
        const theirs = l.filter((r) => !r.mate.byMe);
        return `<tr><td${mateType && mateType !== 'other' ? ` data-mate="${mateType}"` : ''}>${label}</td><td class="r">${mine.length ? gamesCount(mine) : zero}</td><td>${wdlBar(l)}</td><td>${theirs.length ? gamesCount(theirs) : zero}</td><td class="r ph-hide"><b>${gamesCount(l)}</b></td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;
  // "Sonstiges Matt" fits no pattern - always the last row, whatever its count.
  const typeRows = [...byType.filter(([t]) => t !== 'other'), ...byType.filter(([t]) => t === 'other')];
  const versus = versusTable('Mattbild', typeRows.map(([t, l]) => [MATE_LABEL[t], l, t]));
  // Each piece with its icon in front, like "Patzer mit welcher Figur?" in the quality tab.
  const pieceTable = versusTable('Figur', byPiece.map(([p, l]) => [`<img class="meta-piece-icon" src="${pieceUrl(`w${p.toUpperCase()}`)}" alt="">${PIECE_LABEL[p] ?? p}`, l]));
  // When the mate falls - the game's move number, in fixed ranges.
  const whenTable = versusTable('Zug', [[0, 20, 'bis 20'], [21, 30, '21–30'], [31, 40, '31–40'], [41, Infinity, 'ab 41']]
    .map(([a, b, label]) => [label, mated.filter((r) => r.moves >= a && r.moves <= b)])
    .filter(([, l]) => l.length), 'compact');

  return kpis + `<div class="meta-grid">
    ${card('Gesetzt und kassiert', versus, { note: `Jedes Mattbild, das vorkam - gesetzt: du hast mattgesetzt (Sieg), kassiert: du wurdest mattgesetzt (Niederlage). Was zu keinem der ${MATE_TYPES.length - 1} Mattbilder passt, steht unter „Sonstiges Matt“. Zahl anklicken: die Partien.` })}
    <div class="meta-stack w6 mate-fit">
      ${card('Matt nach Figur', pieceTable, { note: 'Die Figur, die mattsetzt - über alle Matts. Bei einer Umwandlung die neue Figur.' })}
      <div class="meta-side-by-side">
        ${card('Wann das Matt fällt', whenTable, { note: 'Partiezug, in dem das Matt fällt.' })}
        ${mateKingCard(mated, ctx.mateHeat === 'taken' ? 'taken' : 'set')}
      </div>
    </div>
  </div>`;
}

const MATE_HEAT_MODES = [['set', 'gesetzt'], ['taken', 'kassiert']];

/** Where the king stood when mated (r.mate.king): the opponent's king for mates
 *  you set, your own for mates you took - switched by data-mate-heat (metaController). */
function mateKingCard(mated, mode) {
  const games = mated.filter((r) => r.mate.king && r.mate.byMe === (mode === 'set'));
  // From your side: as Black the ranks flip, so your back rank is always rank 1 (files stay - kingside stays right).
  const bySquare = groupBy(games, (r) => (r.color === 'b' ? r.mate.king[0] + (9 - Number(r.mate.king[1])) : r.mate.king));
  const max = Math.max(1, ...[...bySquare.values()].map((l) => l.length));
  const color = mode === 'taken' ? 'lost' : 'taken'; // heatColor: red for your king, blue for theirs
  let squares = '';
  for (let rank = 8; rank >= 1; rank--) {
    for (const f of FILES) {
      const sq = `${f}${rank}`;
      const l = bySquare.get(sq) ?? [];
      const light = (FILES.indexOf(f) + rank) % 2 === 0;
      squares += `<div class="meta-heat-sq ${light ? 'l' : 'd'}" data-tip="${esc(`Reihe ${rank} aus deiner Sicht, ${f}-Linie: ${l.length} ${l.length === 1 ? 'Matt' : 'Matts'}`)}">${
        l.length ? `<i style="background:${heatColor(l.length / max, color)}"></i><b>${gamesCount(l)}</b>` : ''
      }${f === 'a' ? `<span class="rk">${rank}</span>` : ''}${rank === 1 ? `<span class="fl">${f}</span>` : ''}</div>`;
    }
  }
  const body = games.length
    ? `<div class="meta-mate-board-wrap"><div class="meta-heat-board meta-mate-board">${squares}</div></div>`
    : `<p class="meta-muted">Keine ${mode === 'set' ? 'gesetzten' : 'kassierten'} Matts.</p>`;
  // The switch under the board; the explanation on the title, so the title fits in one line.
  return card(mode === 'set' ? 'Wo der gegnerische König mattgesetzt wird' : 'Wo dein König mattgesetzt wird', `${body}<div class="meta-mate-toggle">${segPicker(MATE_HEAT_MODES, mode, 'mate-heat', 'Gesetzt oder kassiert')}</div>`, {
    tip: `${mode === 'set' ? 'Feld des gegnerischen Königs bei deinen Matts' : 'Feld deines Königs, wenn du mattgesetzt wurdest'} - aus deiner Sicht: deine Grundreihe ist unten (Reihe 1), auch in Partien mit Schwarz. Zahl anklicken: die Partien.`,
  });
}
