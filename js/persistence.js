// Tiny localStorage wrapper for the preferences worth remembering across
// reloads: the last-used Chess.com username, the chosen board theme, and the
// last-picked engine/depth/time-range filter values. Everything else (loaded
// games, current branch, analysis) is intentionally NOT persisted - it's
// tied to one review session, not a standing preference.

const USERNAME_KEY = 'chessreview.lastUsername';
const THEME_KEY = 'chessreview.boardTheme';
const TIME_RANGE_KEY = 'chessreview.timeRange';
const OUTCOME_FILTER_KEY = 'chessreview.outcomeFilter';
const GAME_TYPE_FILTER_KEY = 'chessreview.gameTypeFilter';
const COLOR_FILTER_KEY = 'chessreview.colorFilter';
const PIECE_THEME_KEY = 'chessreview.pieceTheme';
const SOUND_ENABLED_KEY = 'chessreview.soundEnabled';
const BEST_MOVE_TIMING_KEY = 'chessreview.bestMoveTiming';
const APP_MODE_KEY = 'chessreview.appMode';
const META_TAB_KEY = 'chessreview.metaTab';
const COUNTRY_LIMIT_KEY = 'chessreview.countryLimit';
const HEATMAP_KEY = 'chessreview.heatmap';
const SAVED_USERNAMES_KEY = 'chessreview.savedUsernames'; // older: only the added users, read once for USERNAME_LIST_KEY
const USERNAME_LIST_KEY = 'chessreview.usernameList';
// Also read by the inline script in index.html's <head> (before first paint).
const SITE_THEME_KEY = 'chessreview.siteTheme';

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

/** @returns {'before'|'after'|'off'} when the best-move arrow is shown relative to
 *  the move it belongs to ('off' = never) - 'after' (the original behavior) by default. */
export function loadBestMoveTiming() {
  const v = safeGet(BEST_MOVE_TIMING_KEY);
  return v === 'before' || v === 'off' ? v : 'after';
}

/** @param {'before'|'after'|'off'} timing */
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

/** @returns {string|null} the site theme's id (js/ui/siteTheme.js), null = never chosen */
export function loadSiteTheme() {
  return safeGet(SITE_THEME_KEY);
}

/** @param {string} id */
export function saveSiteTheme(id) {
  safeSet(SITE_THEME_KEY, id);
}

/** @returns {string|null} the Meta-Analyse tab last shown */
export function loadMetaTab() {
  return safeGet(META_TAB_KEY);
}

/** @param {string} tab */
export function saveMetaTab(tab) {
  if (tab) safeSet(META_TAB_KEY, tab);
}

function loadList(key) {
  const raw = safeGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const nameList = (xs) => xs.filter((u) => typeof u === 'string' && u.trim());

/** @param {string[]} defaults - the dropdown's entries until it is first changed (index.html's presets)
 *  @returns {string[]} the username dropdown's entries */
export function loadSavedUsernames(defaults) {
  const list = loadList(USERNAME_LIST_KEY);
  if (list) return nameList(list);
  // Before the list held the presets too, it kept only the users added to them.
  const added = nameList(loadList(SAVED_USERNAMES_KEY) ?? []);
  return [...defaults, ...added.filter((u) => !defaults.some((d) => d.toLowerCase() === u.toLowerCase()))];
}

/** @param {string[]} usernames */
export function saveSavedUsernames(usernames) {
  safeSet(USERNAME_LIST_KEY, JSON.stringify(usernames));
}

/** @returns {string[]|null} selected game types ("bullet", "blitz", ...) */
export function loadGameTypeFilter() {
  return loadList(GAME_TYPE_FILTER_KEY);
}

/** @param {string[]} values */
export function saveGameTypeFilter(values) {
  safeSet(GAME_TYPE_FILTER_KEY, JSON.stringify(values));
}

/** @returns {string[]|null} selected colors ("w", "b") */
export function loadColorFilter() {
  return loadList(COLOR_FILTER_KEY);
}

/** @param {string[]} values */
export function saveColorFilter(values) {
  safeSet(COLOR_FILTER_KEY, JSON.stringify(values));
}

/** @returns {number|null} how many countries the Meta-Analyse's country cards list (0 = all) */
export function loadCountryLimit() {
  const raw = safeGet(COUNTRY_LIMIT_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** @param {number} limit */
export function saveCountryLimit(limit) {
  safeSet(COUNTRY_LIMIT_KEY, String(limit));
}

// Piece letters of a saved Heatmap piece filter (anything else dropped).
const pieceList = (xs) => (Array.isArray(xs) ? xs.filter((p) => typeof p === 'string' && p.length === 1 && 'pnbrqk'.includes(p)) : []);

/** @returns {{mode: 'lost'|'taken', pieces: string[], oppPieces: string[]}} the Heatmap tab's last selection */
export function loadHeatmap() {
  let saved = {};
  try {
    saved = JSON.parse(safeGet(HEATMAP_KEY) ?? '{}') ?? {};
  } catch {
    // unreadable - defaults below
  }
  return {
    mode: saved.mode === 'lost' ? 'lost' : 'taken',
    pieces: pieceList(saved.pieces),
    oppPieces: pieceList(saved.oppPieces),
  };
}

/** @param {{mode: string, pieces: string[], oppPieces: string[]}} selection */
export function saveHeatmap({ mode, pieces, oppPieces }) {
  safeSet(HEATMAP_KEY, JSON.stringify({ mode, pieces, oppPieces }));
}
