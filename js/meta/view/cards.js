// Cards, stat tiles, bars, toggles and sortable table heads shared by the Meta-Analyse tabs.

import { flagHtml } from '../../ui/playerLabel.js';
import { metaIcon, iconLabel } from '../metaIcons.js';
import { pieceUrl } from '../openingBoard.js';
import { esc, wdl, pc } from './format.js';

export const flag = (code) => (code ? flagHtml(code).trim() : '');
// The opponent's flag behind their name in game lists - renderMetaTab points it at the render's ctx.countryOf.
let oppFlag = () => '';
export const withFlag = (name) => `${esc(name)} ${oppFlag(name)}`;
/** renderMetaTab: the flag lookup withFlag() uses for this render. */
export function setOppFlag(fn) {
  oppFlag = fn;
}

export function wdlBar(rs) {
  const c = wdl(rs);
  const n = rs.length || 1;
  const seg = (k, cls, label) =>
    c[k] ? `<span class="${cls}" style="width:${(c[k] / n) * 100}%" data-tip="${label}: ${c[k]} (${pc(c[k] / n)})"></span>` : '';
  return `<div class="meta-wdl">${seg('W', 'w', 'Siege')}${seg('D', 'd', 'Remis')}${seg('L', 'l', 'Niederlagen')}</div>`;
}

export const WDL_LEGEND = `<div class="meta-legend"><span><i style="background:var(--meta-win)"></i>Sieg</span><span><i style="background:var(--meta-draw)"></i>Remis</span><span><i style="background:var(--meta-loss)"></i>Niederlage</span></div>`;

/** Horizontal bars. rows: {label, labelHtml?, v, valHtml?, tip?, color?} */
export function hbars(rows, { color = 'var(--meta-s1)', fmt = (v) => v, max } = {}) {
  if (!rows.length) return '<p class="meta-muted">Keine Daten.</p>';
  const m = max ?? Math.max(1, ...rows.map((r) => r.v));
  return `<div class="meta-rows">${rows
    .map(
      (r) => `<div class="meta-hrow"><span class="meta-lab" title="${esc(r.label)}">${r.labelHtml ?? esc(r.label)}</span>`
        + `<div class="meta-hbar"><i style="width:${(r.v / m) * 100}%;background:${r.color ?? color}" data-tip="${esc(r.tip ?? `${r.label}: ${fmt(r.v)}`)}"></i></div>`
        + `<span class="meta-val">${r.valHtml ?? fmt(r.v)}</span></div>`
    )
    .join('')}</div>`;
}

// Icon in front of each card title: a piece from the user's piece theme
// (string starting with "piece:") or an emoji. Titles with a dynamic part
// (opponent name, game count) match by prefix.
export const CARD_ICONS = {
  'Noch keine Engine-Werte': '⚙️',
  'Übersicht': '🧾',
  'Sieg, Remis, Niederlage': '📊',
  'Nach Farbe und Spielart': '🎨',
  'Die letzten 7 Partien': '🕑',
  'Elo-Verlauf': '📈',
  'Partien pro Tag': '📅',
  'Beste Tage': '🏆',
  'Schlechteste Tage': '💔',
  'Eröffnungen': '📖',
  'Mit Weiß': 'piece:wP',
  'Mit Schwarz': 'piece:bP',
  'Erster Zug als Weiß': 'piece:wN',
  'Als Schwarz gegen …': 'piece:bN',
  'Stärkste und schwächste': '🏅',
  'Gegner': '👥',
  'Direktvergleich': '⚔️',
  'Woher kommen deine Gegner?': '🌍',
  'Quote nach Land': '🗺️',
  'Häufigste Gegner': '🔁',
  'Gegen Stärkere und Schwächere': '💪',
  'Spielqualität': '🎯',
  'Schlag-Heatmap': '🔥',
  'Zusammenfassung': '🧮',
  'Die heißesten Felder': '📍',
  'Welche Figuren du verlierst': '💀',
  'Womit du schlägst': '⚔️',
  'Verteilung der Genauigkeit': '📶',
  'Genauigkeit nach Phase': '🧭',
  'Verlauf der Genauigkeit': '📈',
  'Verwertung': '🏁',
  'Wann passieren deine Patzer?': '💥',
  'Zeit': '⏱️',
  'Wie du gewinnst': '🏆',
  'Wie du verlierst': '💔',
  'Wie Remis entstehen': '🤝',
  'Gesetzt und kassiert': '⚖️',
  'Matt nach Figur': '♟️',
  'Wann das Matt fällt': '⏱️',
  'Wo der gegnerische König mattgesetzt wird': '🎯',
  'Wo dein König mattgesetzt wird': '🎯',
  'Keine Mattpartien': '♚',
  'Uhr': '⏰',
  'Zeit pro Zug': '⏱️',
  'Längste Partien': '📏',
  'Kürzeste Partien': '⚡',
  'Längste Königsreisen': '👑',
  'Dauer der Partien': '⌛',
  'Quote nach Partielänge': '📏',
  'Wann du spielst': '📅',
  'Quote nach Tageszeit': '🕒',
  'Serien und Tilt': '🔥',
  'Partien': '📋',
};

export function cardIcon(title) {
  const icon = CARD_ICONS[title] ?? Object.entries(CARD_ICONS).find(([k]) => title.startsWith(`${k} `))?.[1];
  if (!icon) return '';
  return icon.startsWith('piece:')
    ? `<img class="meta-card-icon" src="${pieceUrl(icon.slice(6))}" alt="">`
    : `<span class="meta-card-icon" aria-hidden="true">${metaIcon(icon) || icon}</span>`;
}

/** head: extra controls at the right end of the title row (e.g. limitPicker). */
/** accent: optional color for the same colored top edge and glow as a stat tile (kpi()). */
/** mid: content centered in the title row, between title and head (e.g. a chart's legend). */
/** tip: tooltip on the title (the shared data-tip tooltip), e.g. instead of a note. */
export function card(title, body, { cls = 'w6', note = '', head = '', accent = '', mid = '', tip = '' } = {}) {
  const right = head ? `<span class="meta-card-tools">${head}</span>` : '';
  const attrs = accent ? `class="meta-card ${cls} accent" style="--kpi-accent:${accent}"` : `class="meta-card ${cls}"`;
  const headCls = mid ? 'meta-card-head has-mid' : 'meta-card-head';
  return `<section ${attrs}><div class="${headCls}"><h2${tip ? ` class="meta-has-tip" data-tip="${esc(tip)}"` : ''}>${cardIcon(title)}${title}</h2>${mid ? `<div class="meta-card-mid">${mid}</div>` : ''}${right}</div>${body}${
    note ? `<p class="meta-note">${note}</p>` : ''
  }</section>`;
}

export const EMPTY = '<p class="meta-muted">Keine Partien für diese Filter.</p>';

/** A stat tile. accent: its color (top edge and a soft glow), any CSS color. */
export function kpi(label, value, detail = '', cls = '', accent = '') {
  const style = accent ? ` style="--kpi-accent:${accent}"` : '';
  return `<div class="meta-kpi"${style}><span class="l">${iconLabel(label)}</span><span class="v ${cls}">${value}</span><span class="d">${detail}</span></div>`;
}

// Tile accents for stats in your favor / against you.
export const GOOD = 'var(--meta-win)';
export const BAD = 'var(--meta-loss)';

/** items: [value, label, color?, tip?]; cls: extra class, e.g. 'two' for a fixed 2-column grid. */
export function bigStats(items, cls = '') {
  return `<div class="meta-big${cls ? ` ${cls}` : ''}">${items
    .map(([v, l, color, tip]) => `<div${tip ? ` data-tip="${esc(tip)}"` : ''}><b${color ? ` style="color:${color}"` : ''}>${v}</b><span>${l}</span></div>`)
    .join('')}</div>`;
}

/** A sortable column head of `table` - metaController flips ctx.sorts[table] on click. */
export function sortHead(table, sort, key, label, cls) {
  const on = key === sort.key;
  const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th class="sort${cls ? ` ${cls}` : ''}${on ? ' on' : ''}" data-sort-table="${table}" data-sort="${key}" aria-sort="${aria}" title="Sortieren">${label}${on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
}

/** Rows {v, l} by v - rows without a value (e.g. no engine accuracy yet) always last, ties by game count. */
export function sortRows(rows, dir) {
  return rows.sort((a, b) => (a.v == null) - (b.v == null) || (dir === 'asc' ? a.v - b.v : b.v - a.v) || b.l.length - a.l.length);
}

/** Segmented control; attr: the data attribute metaController listens for.
 *  options: [key, text, tip?] - with a tip, the text is only an icon and the tip names it. */
/** options: [key, text, tip?, kind?] - with a tip, text is an icon (the tip is its label) unless kind is 'text'. */
export function segPicker(options, current, attr, label) {
  const btns = options.map(([key, text, tip, kind]) => {
    const on = key === current;
    const icon = tip && kind !== 'text';
    const cls = [on && 'on', icon && 'icon'].filter(Boolean).join(' ');
    const tipAttrs = ` class="${cls}"${tip ? ` data-tip="${esc(tip)}"` : ''}${icon ? ` aria-label="${esc(tip)}"` : ''}`;
    return `<button type="button"${tipAttrs} data-${attr}="${key}" aria-pressed="${on}">${text}</button>`;
  });
  return `<span class="meta-seg" role="group" aria-label="${label}">${btns.join('')}</span>`;
}
