// Parses the [%clk H:MM:SS] comments most sites (Chess.com included) embed
// in their PGN exports right after each move - the remaining time for
// whichever side just moved. Not part of chess.js 0.13.4's own API (no PGN
// comment support in that version), so this reads the raw PGN text directly.

// Real Chess.com PGNs often add tenths of a second (e.g. "0:09:59.7"), only
// omitting them when the fraction happens to be exactly .0 - the trailing
// `(?:\.\d+)?` makes that suffix optional (and discarded; formatClock()
// rounds to whole seconds for display anyway). Without it, every move that
// happened to carry a fraction silently failed to match at all, which threw
// off the ply-index alignment parseClockSeconds() depends on (every match
// after the first missed one lands on the wrong move).
const CLOCK_PATTERN = /\[%clk\s+(\d+):(\d{2}):(\d{2})(?:\.\d+)?\]/g;

/**
 * @param {string} pgn
 * @returns {number[]} remaining time in seconds, one entry per ply, in move
 *   order - shorter than the actual move count (or empty) if the PGN has no
 *   clock data at all, or only some moves carry it.
 */
export function parseClockSeconds(pgn) {
  const times = [];
  for (const match of pgn.matchAll(CLOCK_PATTERN)) {
    const [, h, m, s] = match;
    times.push(Number(h) * 3600 + Number(m) * 60 + Number(s));
  }
  return times;
}

/**
 * @param {string|undefined} timeControlHeader e.g. "600+5" (600s base, 5s
 *   increment), "600" (no increment), "1/259200" (correspondence, days per
 *   move - not a per-side countdown, ignored), "-" (untimed).
 * @returns {number|null} each side's starting time in seconds, or null if
 *   this game has no ticking clock (untimed/correspondence/missing header).
 */
export function parseInitialClockSeconds(timeControlHeader) {
  if (!timeControlHeader || timeControlHeader === '-') return null;
  const base = Number(timeControlHeader.split('+')[0]);
  return Number.isFinite(base) && base > 0 ? base : null;
}

/**
 * @param {string|undefined} timeControlHeader - see parseInitialClockSeconds
 * @returns {number} seconds added back per move (js/ui/timeManagementChart.js's
 *   time-spent-per-move calculation needs this to not understate a fast
 *   increment move as having taken negative time) - 0 if there's none.
 */
export function parseIncrementSeconds(timeControlHeader) {
  if (!timeControlHeader) return 0;
  const increment = Number(timeControlHeader.split('+')[1]);
  return Number.isFinite(increment) && increment > 0 ? increment : 0;
}

/**
 * @param {number|null|undefined} totalSeconds
 * @returns {string|null} "H:MM:SS" once there's an hour to show, otherwise
 *   "MM:SS" - null passes through so callers can hide the clock element.
 */
export function formatClock(totalSeconds) {
  if (totalSeconds == null) return null;
  const clamped = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
