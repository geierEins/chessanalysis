// Tiny localStorage wrapper for the preferences worth remembering across
// reloads: the last-used Chess.com username, the chosen board theme, and the
// last-picked engine/depth/time-range filter values. Everything else (loaded
// games, current branch, analysis) is intentionally NOT persisted - it's
// tied to one review session, not a standing preference.

const USERNAME_KEY = 'chessreview.lastUsername';
const THEME_KEY = 'chessreview.boardTheme';
const ENGINE_KEY = 'chessreview.engine';
const DEPTH_KEY = 'chessreview.depth';
const TIME_RANGE_KEY = 'chessreview.timeRange';
const OUTCOME_FILTER_KEY = 'chessreview.outcomeFilter';
const PIECE_THEME_KEY = 'chessreview.pieceTheme';
const SOUND_ENABLED_KEY = 'chessreview.soundEnabled';
const BEST_MOVE_TIMING_KEY = 'chessreview.bestMoveTiming';
const APP_MODE_KEY = 'chessreview.appMode';
const META_TAB_KEY = 'chessreview.metaTab';

/** Wrapped so a private-browsing/blocked-storage exception never breaks the
 *  app - these are conveniences, not required state. */
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore - e.g. private browsing with storage disabled
  }
}

/** @returns {string|null} */
export function loadLastUsername() {
  return safeGet(USERNAME_KEY);
}

/** @param {string} username */
export function saveLastUsername(username) {
  if (username) safeSet(USERNAME_KEY, username);
}

/** @returns {{light: string, dark: string, isWood?: boolean}|null} */
export function loadBoardTheme() {
  const raw = safeGet(THEME_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.light && parsed?.dark ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {string} light @param {string} dark @param {boolean} [isWood] */
export function saveBoardTheme(light, dark, isWood = false) {
  safeSet(THEME_KEY, JSON.stringify({ light, dark, isWood }));
}

/** @returns {string|null} */
export function loadEngine() {
  return safeGet(ENGINE_KEY);
}

/** @param {string} value */
export function saveEngine(value) {
  if (value) safeSet(ENGINE_KEY, value);
}

/** @returns {string|null} */
export function loadDepth() {
  return safeGet(DEPTH_KEY);
}

/** @param {string} value */
export function saveDepth(value) {
  if (value) safeSet(DEPTH_KEY, value);
}

/** @returns {string|null} */
export function loadTimeRange() {
  return safeGet(TIME_RANGE_KEY);
}

/** @param {string} value */
export function saveTimeRange(value) {
  if (value) safeSet(TIME_RANGE_KEY, value);
}

/** @returns {string[]|null} */
export function loadOutcomeFilter() {
  const raw = safeGet(OUTCOME_FILTER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {string[]} values */
export function saveOutcomeFilter(values) {
  safeSet(OUTCOME_FILTER_KEY, JSON.stringify(values));
}

/** @returns {string|null} the piece theme's key (e.g. "cburnett") */
export function loadPieceTheme() {
  return safeGet(PIECE_THEME_KEY);
}

/** @param {string} key */
export function savePieceTheme(key) {
  if (key) safeSet(PIECE_THEME_KEY, key);
}

/** @returns {boolean} board sounds on (the default, if never set) */
export function loadSoundEnabled() {
  return safeGet(SOUND_ENABLED_KEY) !== 'false';
}

/** @param {boolean} enabled */
export function saveSoundEnabled(enabled) {
  safeSet(SOUND_ENABLED_KEY, String(enabled));
}

/** @returns {'before'|'after'} when the best-move arrow is shown relative to
 *  the move it belongs to - 'after' (the original behavior) by default. */
export function loadBestMoveTiming() {
  return safeGet(BEST_MOVE_TIMING_KEY) === 'before' ? 'before' : 'after';
}

/** @param {'before'|'after'} timing */
export function saveBestMoveTiming(timing) {
  safeSet(BEST_MOVE_TIMING_KEY, timing);
}

/** @returns {'game'|'meta'} which area is shown: single-game analysis (the default) or Meta-Analyse */
export function loadAppMode() {
  return safeGet(APP_MODE_KEY) === 'meta' ? 'meta' : 'game';
}

/** @param {'game'|'meta'} mode */
export function saveAppMode(mode) {
  safeSet(APP_MODE_KEY, mode);
}

/** @returns {string|null} the Meta-Analyse tab last shown */
export function loadMetaTab() {
  return safeGet(META_TAB_KEY);
}

/** @param {string} tab */
export function saveMetaTab(tab) {
  if (tab) safeSet(META_TAB_KEY, tab);
}
