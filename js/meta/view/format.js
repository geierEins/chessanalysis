// Small formatting and grouping helpers shared by every Meta-Analyse tab (metaView.js and js/meta/view/).

import { isCoachGame } from '../metaRecords.js';

export const TC_ORDER = ['bullet', 'blitz', 'rapid', 'daily'];
export const TC_LABEL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily' };
export const RES_LETTER = { W: 'S', D: 'R', L: 'N' };
// The game list popup marks results with the same S/R/N badges as the game picker (css .outcome-badge).
export const RES_BADGE = { W: 'win', D: 'draw', L: 'loss' };
export const RES_WORD ={ W: 'Sieg', D: 'Remis', L: 'Niederlage' };
export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const DAY_MS = 864e5;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pts = (r) => (r.result === 'W' ? 1 : r.result === 'D' ? 0.5 : 0);
export const score = (rs) => (rs.length ? rs.reduce((a, r) => a + pts(r), 0) / rs.length : null);
export const wdl = (rs) => {
  const c = { W: 0, D: 0, L: 0 };
  for (const r of rs) c[r.result]++;
  return c;
};
export const avg = (rs, f) => {
  const v = rs.map(f).filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const pc = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
export const f1 = (x) => (x == null ? '–' : x.toFixed(1).replace('.', ','));
export const f0 = (x) => (x == null ? '–' : String(Math.round(x)));
export const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
export const groupBy = (rs, f) => {
  const m = new Map();
  for (const r of rs) {
    const k = f(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
export const byCountDesc = (a, b) => b[1].length - a[1].length;
// Search text and names compared without case and accents ("osterreich" finds "Österreich").
export const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
// When the game ended, e.g. "Mi., 12.11.2026, 14:37 Uhr" - the "Partien" table's date tooltip.
export const fmtDateTime = (ms) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
};

/** Rating of a game that actually counted for it - unrated games (e.g. against
 *  Chess.com's coach bots) carry placeholder ratings that would distort every
 *  rating-based stat. Coach games never get here (metaController drops them),
 *  the check stays as a safety net. */
export const hasRealRating = (r) => r.rated && !isCoachGame(r) && r.ownRating != null;
