import { fetchRecentGames, fetchPlayerProfile, fetchGame, summarizeGame } from './api/chesscom.js';
import { timeClassStyle } from './timeClassStyle.js';
import { StockfishEngine } from './engine/stockfishEngine.js';
import { analyzeGame } from './analysis/gameAnalyzer.js';
import { recordingEngine, replayEngine } from './analysis/evalLog.js';
import { syncAutoAnalysis, autoAnalysisEngine } from './meta/autoAnalysis.js';
import { loadEngineRecords, saveEngineRecord } from './meta/metaStore.js';
import { buildEngineRecord } from './meta/metaRecords.js';
import { BoardView } from './ui/board.js';
import { EvalBar } from './ui/evalBar.js';
import { EvalGraph } from './ui/evalGraph.js';
import { MoveList } from './ui/moveList.js';
import { Dashboard } from './ui/dashboard.js';
import { TimeManagementChart } from './ui/timeManagementChart.js';
import { setAvatar } from './ui/avatar.js';
import { formatPlayerLabelHtml, escapeHtml } from './ui/playerLabel.js';
import { CustomSelect } from './ui/customSelect.js';
import { materialSummaryFromFen, isSacrifice } from './analysis/material.js';
import { playMoveSound, playIllegalMoveSound, setSoundEnabled } from './ui/sounds.js';
import { Chess } from './chessLib.js';
import {
  createRootNode,
  buildMainLineFromMoves,
  addOrReuseChild,
  mainLineAncestor,
  deleteVariation,
  deleteAllVariations,
  pathFromRoot,
} from './analysis/moveTree.js';
import { toWhitePerspective, bestMoveSanFor, squaresFromUci, MATE_CP_EQUIVALENT } from './analysis/gameAnalyzer.js';
import { evalToWinPercent, evalToWinPercentForRating } from './analysis/winProbability.js';
import { computeDeltaW, moveAccuracyFromWinPercents } from './analysis/accuracy.js';
import { classifyMove } from './analysis/classification.js';
import { showPromotionPicker } from './ui/promotionPicker.js';
import { formatClock, parseInitialClockSeconds, parseIncrementSeconds } from './analysis/pgnClock.js';
import { openingNameForLine } from './analysis/openingBook.js';
import { showToast, flashFieldError } from './ui/toast.js';
import {
  loadLastUsername,
  saveLastUsername,
  loadSavedUsernames,
  saveSavedUsernames,
  loadTimeRange,
  saveTimeRange,
  loadOutcomeFilter,
  saveOutcomeFilter,
  loadGameTypeFilter,
  saveGameTypeFilter,
  loadColorFilter,
  saveColorFilter,
  loadSoundEnabled,
  saveSoundEnabled,
  loadBestMoveTiming,
  saveBestMoveTiming,
  loadAppMode,
  saveAppMode,
} from './persistence.js';
import { initMetaMode } from './meta/metaController.js';
import { computeTerminationMarkers } from './analysis/termination.js';
import { computeMoveTimesSpent } from './analysis/moveTimes.js';
import { initBoardThemePicker } from './ui/boardThemePicker.js';
import { initPieceThemePicker } from './ui/pieceThemePicker.js';
import { initSettingsPanel } from './ui/settingsPanel.js';

// Registers the (no-op/no-cache) service worker so the browser considers the
// app installable as a home-screen "app" (Add to Home Screen / PWA install).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

const el = (id) => document.getElementById(id);

// 'game' = the single-game analysis, 'meta' = Meta-Analyse (js/meta/) - picked
// in the gear menu. `meta` is the Meta-Analyse controller, created at the very
// end once every top-bar control it reads from exists; every call site uses
// `meta?.` since some filter callbacks can fire before that.
// A game the Meta-Analyse opened in its own tab (metaController's openGame):
// ?user=…&game=<Chess.com URL>&end=<end_time> - opens straight into the
// single-game mode, without changing the saved area for other tabs.
const deepLink = (() => {
  const params = new URLSearchParams(location.search);
  const game = params.get('game');
  const user = params.get('user');
  return game && user ? { game, user, end: Number(params.get('end')) } : null;
})();
let appMode = deepLink ? 'game' : loadAppMode();
let meta = null;

const usernameInput = el('username-input');
const usernameAvatarEl = el('username-avatar');
usernameInput.value = deepLink?.user ?? loadLastUsername() ?? '';

// Caches avatarUrl (possibly null - no picture set) per lowercased username,
// so re-selecting a preset (or reloading the last-used name) never re-fetches
// one already looked up this session.
const usernameAvatarCache = new Map();

/** Keeps #username-avatar (left of the field, shown collapsed too) in sync
 *  with whatever username is now current - checks the cache first, and only
 *  hits the network for one never looked up yet. Guards against a stale
 *  response landing after the field's value has already changed again. */
async function updateUsernameAvatar(username) {
  const key = username?.trim().toLowerCase();
  if (!key) {
    usernameAvatarEl.classList.add('hidden');
    return;
  }
  if (usernameAvatarCache.has(key)) {
    setAvatar(usernameAvatarEl, usernameAvatarCache.get(key));
    return;
  }
  const { avatar } = await fetchPlayerProfile(key);
  usernameAvatarCache.set(key, avatar);
  if (usernameInput.value.trim().toLowerCase() === key) setAvatar(usernameAvatarEl, avatar);
}
updateUsernameAvatar(usernameInput.value);
// Hides the avatar the moment the field is edited away from whatever
// username it was last confirmed for (even a single backspaced character) -
// it only reappears via an explicit updateUsernameAvatar() call again (a
// preset click, or "Spiele laden"), never a live per-keystroke re-fetch.
usernameInput.addEventListener('input', () => {
  usernameAvatarEl.classList.add('hidden');
});

// The dropdown triangle overlaid on the username field's own right edge
// (css/styles.css - invisible until hovered/focused, like a native dropdown
// indicator). Always lists every preset regardless of the field's current
// content, and overwrites it on click. #username-presets (index.html) is
// NOT wired up as an actual native datalist (that showed its own competing
// triangle on top of this one, and only ever filtered to what's already
// typed) - it's kept purely as this button's own preset data, so a preset
// still only needs to be added in one place. They are only the starting
// list: users get added locally (rememberUsername) and each entry, presets
// included, has an ✕ to drop it.
const usernamePresetsBtn = el('username-presets-btn');
const usernamePresetsMenu = el('username-presets-menu');
const usernamePicker = el('username-picker');
let savedUsernames = loadSavedUsernames([...document.querySelectorAll('#username-presets option')].map((o) => o.value));
const sameUser = (a, b) => a.toLowerCase() === b.toLowerCase();

function closeUsernamePresets() {
  usernamePresetsMenu.classList.add('hidden');
  usernamePresetsBtn.classList.remove('menu-open');
}

function renderUsernamePresets() {
  usernamePresetsMenu.replaceChildren();
  if (!savedUsernames.length) {
    const hint = document.createElement('p');
    hint.className = 'username-preset-empty';
    hint.textContent = 'Noch keine Benutzer - jeder gültige, für den du „Spiele laden“ drückst, landet hier.';
    usernamePresetsMenu.appendChild(hint);
  }
  for (const name of savedUsernames) {
    // A div, not a button: the ✕ inside is a button of its own.
    const item = document.createElement('div');
    item.className = 'custom-select-option username-preset';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    const avatarImg = document.createElement('img');
    avatarImg.alt = '';
    avatarImg.className = 'w-6 h-6 rounded-full hidden shrink-0';
    const label = document.createElement('span');
    label.className = 'username-preset-name';
    label.textContent = name;
    item.append(avatarImg, label);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'username-preset-remove';
    remove.title = 'Aus der Vorauswahl entfernen';
    remove.setAttribute('aria-label', `${name} aus der Vorauswahl entfernen`);
    remove.textContent = '✕';
    remove.addEventListener('click', (e) => {
      e.stopPropagation(); // not a pick of this user
      savedUsernames = savedUsernames.filter((u) => !sameUser(u, name));
      saveSavedUsernames(savedUsernames);
      renderUsernamePresets();
    });
    item.appendChild(remove);
    const pick = () => {
      usernameInput.value = name;
      updateUsernameAvatar(name);
      closeUsernamePresets();
      usernameInput.focus();
    };
    item.addEventListener('click', pick);
    item.addEventListener('keydown', (e) => {
      if (e.target === item && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        pick();
      }
    });
    usernamePresetsMenu.appendChild(item);
    // Every preset's avatar up front (not just on click), so the menu shows
    // each one's picture right away - fetched once, then from the cache.
    const key = name.toLowerCase();
    if (usernameAvatarCache.has(key)) setAvatar(avatarImg, usernameAvatarCache.get(key));
    else {
      fetchPlayerProfile(name).then(({ avatar }) => {
        usernameAvatarCache.set(key, avatar);
        setAvatar(avatarImg, avatar);
      });
    }
  }
}
renderUsernamePresets();

/** Adds a user "Spiele laden" was pressed for to the dropdown, if chess.com knows them. */
async function rememberUsername(username) {
  if (savedUsernames.some((u) => sameUser(u, username))) return;
  const { exists, avatar } = await fetchPlayerProfile(username);
  if (!exists || savedUsernames.some((u) => sameUser(u, username))) return;
  usernameAvatarCache.set(username.toLowerCase(), avatar);
  savedUsernames = [...savedUsernames, username];
  saveSavedUsernames(savedUsernames);
  renderUsernamePresets();
}
usernamePresetsBtn.addEventListener('click', () => {
  if (usernamePresetsMenu.classList.contains('hidden')) {
    const rect = usernamePresetsBtn.getBoundingClientRect();
    usernamePresetsMenu.style.position = 'fixed';
    usernamePresetsMenu.style.top = `${rect.bottom + 4}px`;
    usernamePresetsMenu.style.left = `${rect.left}px`;
    usernamePresetsMenu.classList.remove('hidden');
    usernamePresetsBtn.classList.add('menu-open'); // stays visible even once the mouse leaves, while its own menu is open
  } else {
    closeUsernamePresets();
  }
});
document.addEventListener('click', (e) => {
  // isConnected: an ✕ click re-renders the menu, so its target is gone from the DOM by now.
  if (e.target.isConnected && !usernamePicker.contains(e.target)) closeUsernamePresets();
});
// Custom dropdowns (not native <select>s) - see js/ui/customSelect.js for why.
// icon is a growing "pie slice" (see .pie-icon in css/styles.css) - a
// sliver for the shortest range, a full circle for "von Beginn an" - shown
// alone on the collapsed button (so it stays a single small icon wide
// instead of growing to fit "Letzte 12 Monate" etc.) and next to the full
// label once the menu is open.
const pieIcon = (percent) => `<span class="pie-icon" style="--pie:${percent}%"></span>`;
const timeRangeMenu = el('time-range-menu');
const timeRangeSelect = new CustomSelect({
  buttonId: 'time-range-btn',
  labelId: 'time-range-btn-label',
  menuId: 'time-range-menu',
  onChange: (value) => {
    saveTimeRange(value);
    updateCustomDateInputsVisibility(value);
    meta?.refresh();
    // CustomSelect.select() always hides the menu after any option - but for
    // "custom" there's still a choice left to make (the two dates below),
    // so it's reopened right back up instead of requiring a second click on
    // the button. No-op for every other option.
    if (value === 'custom') timeRangeMenu.classList.remove('hidden');
  },
});
timeRangeSelect.setOptions(
  [
    { value: 'today', label: 'Heute', icon: pieIcon(8) },
    { value: '1', label: 'Letzte 30 Tage', icon: pieIcon(25) },
    { value: '6', label: 'Letzte 6 Monate', icon: pieIcon(50) },
    { value: '12', label: 'Letzte 12 Monate', icon: pieIcon(75) },
    { value: 'all', label: 'Von Beginn an', icon: pieIcon(100) },
    { value: 'custom', label: 'Benutzerdefiniert', icon: '🗓️' },
  ],
  loadTimeRange() ?? 'all'
);
// The two native date inputs for the "custom" option above - appended into
// the SAME floating dropdown menu (not a docked element permanently sitting
// in the filter bar), so they only ever appear/disappear right along with
// the rest of this popover. setOptions() above already replaced the menu's
// innerHTML for the last time (it's never called again for this select), so
// appending here persists across every later open/close. No dedicated
// picker widget - plain <input type="date"> gets a native calendar popup
// for free.
const customDateRow = document.createElement('div');
customDateRow.id = 'custom-date-range-row';
customDateRow.className = 'hidden items-center gap-1 px-2 py-1.5 border-t border-neutral-700';
customDateRow.innerHTML = `
  <input id="custom-date-from" type="date" title="Von" class="bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-xs w-full">
  <span class="text-neutral-500 text-xs">–</span>
  <input id="custom-date-to" type="date" title="Bis" class="bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-xs w-full">
`;
timeRangeMenu.appendChild(customDateRow);
const customDateFromEl = el('custom-date-from');
const customDateToEl = el('custom-date-to');
customDateFromEl.addEventListener('change', () => meta?.refresh());
customDateToEl.addEventListener('change', () => meta?.refresh());
function updateCustomDateInputsVisibility(value) {
  customDateRow.classList.toggle('hidden', value !== 'custom');
  customDateRow.classList.toggle('flex', value === 'custom');
}
updateCustomDateInputsVisibility(timeRangeSelect.value);
// Game-type filter (Spielart) DOM refs - wired further down, mirroring the
// outcome/color filters' checkbox-multi-select pattern.
const gameTypeBtn = el('game-type-btn');
const gameTypeMenu = el('game-type-menu');
const gameTypePicker = el('game-type-picker');
const gameTypeFilterCheckboxes = [...gameTypeMenu.querySelectorAll('input[type="checkbox"]')];

// Outcome filter (Gewonnen/Remis/Verloren) DOM refs - wired further down,
// once ownOutcomeCategory/OUTCOME_LETTER exist (js/main.js's own helper
// order), right after ownOutcomeBadge.
const outcomeFilterBtn = el('outcome-filter-btn');
const outcomeFilterMenu = el('outcome-filter-menu');
const outcomeFilterPicker = el('outcome-filter-picker');
const outcomeFilterCheckboxes = [...outcomeFilterMenu.querySelectorAll('input[type="checkbox"]')];

// Color filter (Weiß/Schwarz) DOM refs - same reasoning/order as the
// outcome filter above: wired further down, once ownColorFor exists.
const colorFilterBtn = el('color-filter-btn');
const colorFilterMenu = el('color-filter-menu');
const colorFilterPicker = el('color-filter-picker');
const colorFilterCheckboxes = [...colorFilterMenu.querySelectorAll('input[type="checkbox"]')];
const fetchGamesBtn = el('fetch-games-btn');
const fetchGamesBtnSpinner = el('fetch-games-btn-spinner');
const fetchGamesBtnLabel = el('fetch-games-btn-label');
const fetchGamesBtnFill = el('fetch-games-btn-fill');
const gameSelect = new CustomSelect({
  buttonId: 'game-btn',
  labelId: 'game-btn-label',
  menuId: 'game-menu',
  onChange: () => analyzeSelectedGame(),
});
gameSelect.setOptions([{ value: '', label: 'Erst Benutzername laden…' }]);
gameSelect.disabled = true;
const analyzeToggleBtn = el('analyze-toggle-btn');
const analyzeToggleBtnIcon = el('analyze-toggle-btn-icon');
const analyzeToggleBtnCancelIcon = el('analyze-toggle-btn-cancel-icon');
const analyzeToggleBtnSpinner = el('analyze-toggle-btn-spinner');
const analyzeToggleBtnFill = el('analyze-toggle-btn-fill');
const analyzeToggleBtnPct = el('analyze-toggle-btn-pct');
// The one engine setting the app analyzes with - the same as the GitHub job
// (scripts/auto-analysis/config.json), so every stored analysis matches it.
// Shown as the fixed #engine-label in the top bar.
const ENGINE = { engineId: 'sf19full', depth: 16, label: 'Stockfish 19 Full · Tiefe 16' };

/** The engine + depth (also the Meta-Analyse's host.getEngineSettings). */
function engineSettings() {
  return { ...ENGINE };
}
const loaderPanel = el('loader-panel');
const loaderToggleBtn = el('loader-toggle-btn');
const reviewPanel = el('review-panel');
const evalBarWrapEl = el('eval-bar-wrap');
const boardWrapEl = el('board-wrap');
const moveListPanelEl = el('move-list-panel');
const navWrapEl = el('nav-wrap');
const evalGraphWrapEl = el('eval-graph-wrap');
const dashboardWrapEl = el('dashboard-wrap');
const boardPlayerTopEl = el('board-player-top');
const boardAvatarTopEl = el('board-avatar-top');
const boardUsernameTopEl = el('board-username-top');
const boardPlayerBottomEl = el('board-player-bottom');
const boardAvatarBottomEl = el('board-avatar-bottom');
const boardUsernameBottomEl = el('board-username-bottom');
const boardMaterialTopEl = el('board-material-top');
const boardMaterialBottomEl = el('board-material-bottom');
const boardClockTopEl = el('board-clock-top');
const boardClockBottomEl = el('board-clock-bottom');
const branchControlsEl = el('branch-controls');
const openingNameBarEl = el('opening-name-bar');
const dashboardViewToggleEl = el('dashboard-view-toggle');
const dashboardViewTableBtn = el('dashboard-view-table-btn');
const dashboardViewTimeBtn = el('dashboard-view-time-btn');
const dashboardViewStatsBtn = el('dashboard-view-stats-btn');
const classificationTableEl = el('classification-table');
const timeManagementChartWrapEl = el('time-management-chart-wrap');
const statsTableEl = el('stats-table');
const statsTableBodyEl = statsTableEl.querySelector('tbody');
const statsAvatarEl = { w: el('stats-avatar-white'), b: el('stats-avatar-black') };
const statsUsernameEl = { w: el('stats-username-white'), b: el('stats-username-black') };
const backToMainlineBtn = el('back-to-mainline-btn');
const removeVariationBtn = el('remove-variation-btn');

let games = [];
let analyzedUrls = new Set(); // games in the picker with a stored analysis (findStoredAnalyses) - marked with ✓
let engine = null;
let loadedEngineId = null;
let enginePromise = null; // resolves to `engine` once it's ready - see ensureEngine()
let analysis = null; // gameAnalyzer.js's flat result - still the source of truth for the eval graph/dashboard accuracy table (main-line only, per the agreed scope)
let rootNode = null; // the move tree's root (js/analysis/moveTree.js) - start position, ply 0
let currentNode = null; // whichever MoveNode (main line or a variation) is currently shown
// Settings popover (js/ui/settingsPanel.js): 'after' = the best-move arrow
// shows what should have been played instead of the move just shown;
// 'before' = it shows the best move for the position currently on the board;
// 'off' = no best-move arrow at all.
let bestMoveTiming = loadBestMoveTiming();
setSoundEnabled(loadSoundEnabled());
let autoPlayTimer = null;
let players = null; // {white: {username, rating, avatar}, black: {...}}
let pendingBadge = null; // {square, category} to show once the current move's piece animation ends
let gameTermination = null; // {type, loserColor} - how the REAL game ended, from summarizeGame() - only applies at the real final main-line node; see computeLiveTermination() for branch endpoints
let initialClockSeconds = null; // each side's starting time from the PGN's TimeControl header - null if untimed/unknown
let gameHasClockData = false; // true if any move in this game carried a [%clk] comment - gates showing initialClockSeconds at the root (see clocksAtNode)
// Daily/correspondence games carry [%clk] too, but it's a time BANK spent
// across days between moves, not a live countdown - a value like "0:00:09"
// is completely normal there and would falsely trigger the low-time red
// highlight every time, so the whole clock display is suppressed for them
// regardless of what clockSeconds data exists (see updatePlayerClocks).
let clockDisplayEnabled = true;
let ownPlayerColor = null; // 'w'|'b'|null - which side the searched user played, for move-self/move-opponent sounds
let avgRating = null; // average of both players' ratings - reused by branch-move classification (see evaluateBranchNode)
let isAnalyzing = false; // drives #analyze-toggle-btn's label/color (setAnalyzing)

const board = new BoardView('board', 'board-arrow-paths', 'board-user-arrow-paths', {
  onMoveEnd: () => {
    if (pendingBadge) board.showBadge(pendingBadge.square, pendingBadge.category);
  },
  canDragStart: (source, piece) => {
    if (!analysis || !currentNode) return false;
    const sideToMove = currentNode.fenAfter.split(' ')[1]; // FEN's own turn field ('w'/'b')
    return piece[0] === sideToMove;
  },
  onUserDrop: (source, target, info) => handleUserDrop(source, target, info),
  getLegalMoves: (source) => getLegalMovesFrom(source),
  onIllegalClick: () => playIllegalMoveSound(),
  onSnapEnd: () => {
    // Corrective re-sync to chess.js's authoritative FEN after a drag's own
    // snap animation - chessboard.js's raw drag only visually moves the one
    // dragged piece, so castling's rook and an en-passant capture's removed
    // pawn need this to look right. A no-op (same FEN) for an ordinary move.
    if (currentNode) {
      board.clearBadge();
      board.setPosition(currentNode.fenAfter);
    }
  },
});
const evalBar = new EvalBar('eval-bar-white', 'eval-bar-black', 'eval-bar-label');
const evalGraph = new EvalGraph('eval-graph', (ply) => goToPly(ply));
const moveList = new MoveList('move-list', (node) => goToNode(node), 'move-strip', (node) => deleteVariationAndNavigate(node));
const dashboard = new Dashboard('accuracy-white', 'accuracy-black', 'classification-table');
const timeManagementChart = new TimeManagementChart('time-management-chart', (ply) => goToPly(ply));

const EVAL_BAR_WIDTH = 24; // matches CSS #eval-bar-wrap width
const MOVE_LIST_WIDTH = 230; // matches CSS #move-list-panel width (desktop)
const ROW_GAP = 12; // matches CSS `gap: 0.75rem` on #review-panel's grid
const MAX_BOARD_SIZE = 899; // 946 * 0.95 - board scaled down 5%
const MIN_BOARD_SIZE = 200;
const PLAYER_LABEL_HEIGHT = 26; // matches CSS .player-row height
const BOARD_COLUMN_GAP = 6; // matches CSS #board-column's `gap-1.5` (two gaps: label-board, board-label)
const MOVE_STRIP_HEIGHT = 34; // matches CSS #move-strip height (mobile-only row above the board)
const EVAL_GRAPH_HEIGHT = 40; // matches CSS #eval-graph-wrap height (desktop)
// Half of ROW_GAP: lands the viewport's visible cutoff right in the middle
// of the actual gap between the nav/username-bottom row and the dashboard/
// stats table below it (that gap IS ROW_GAP, css/styles.css's grid gap) -
// large enough to clear nav/username-bottom cleanly, small enough that the
// table's own first row never peeks into view above it.
const BOTTOM_MARGIN = ROW_GAP / 2;
// Below this viewport width, the move list no longer fits beside the board -
// #review-panel's grid (css/styles.css) switches to a stacked mobile layout
// instead, with the move list replaced by a horizontal strip above the board
// (see js/ui/moveList.js) rather than a full-width block below it.
const MOBILE_BREAKPOINT = 700;

/**
 * Eval-bar, board and move list must render at exactly the same height (on
 * desktop) or width (on mobile, where the move list becomes a thin strip
 * above the board instead of a column beside it). CSS alone (vw/vh, or
 * deriving row height from a child's auto content size) proved unreliable
 * across browser zoom levels and long move lists, so the size is computed
 * here from real measured pixels and applied identically to every column -
 * this also means it scales correctly under Ctrl+scroll browser zoom, since
 * that changes `window.innerHeight`/`clientWidth` (in CSS px) the same way a
 * real resize would, and the `resize` listener below fires on both.
 */
function syncBoardRowLayout() {
  if (reviewPanel.classList.contains('hidden')) return;

  // Scroll to top before measuring layout so board gets optimal size regardless of current scroll position
  window.scrollTo(0, 0);

  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;

  const maxByWidth = isMobile
    ? reviewPanel.clientWidth - EVAL_BAR_WIDTH - ROW_GAP
    : reviewPanel.clientWidth - EVAL_BAR_WIDTH - MOVE_LIST_WIDTH - ROW_GAP * 2;
  // Scales the board so its bottom username row (desktop) or the nav row
  // below it (mobile) - both always end at the exact same y-position, see
  // the totalColumnHeight/moveListPanelEl.style.height math below - stays
  // fully visible above the viewport's bottom edge, with BOTTOM_MARGIN to
  // spare, instead of a rough percentage-of-viewport guess. Measured from the
  // grid's real on-screen top (reviewPanel's own top, which already accounts
  // for the sticky loader bar above it) rather than assumed, so it stays
  // correct regardless of loader-panel height or page zoom.
  const navHeight = navWrapEl.getBoundingClientRect().height;
  const gridTop = reviewPanel.getBoundingClientRect().top;
  // On mobile the move strip sits in its own row above "eb/board", so that
  // row's top starts one row further down than reviewPanel's own top.
  const boardRowTop = isMobile ? gridTop + MOVE_STRIP_HEIGHT + ROW_GAP : gridTop;
  const availableHeight = window.innerHeight - boardRowTop - BOTTOM_MARGIN;
  const nonSquareOverhead = isMobile
    ? 2 * PLAYER_LABEL_HEIGHT + 2 * BOARD_COLUMN_GAP + ROW_GAP + navHeight
    : 2 * PLAYER_LABEL_HEIGHT + 2 * BOARD_COLUMN_GAP;
  const maxByHeight = availableHeight - nonSquareOverhead;
  // Rounded DOWN to a multiple of 8 (not just rounded): chessboard.js always
  // renders its own internal board at a multiple-of-8 width and centers it
  // within the container, so if the container itself isn't already a
  // multiple of 8, the square grid (and thus every badge/arrow/termination
  // marker computed from container-width/8) ends up a few px off from where
  // the actual squares are.
  const boardSize = Math.max(
    MIN_BOARD_SIZE,
    Math.floor(Math.min(maxByHeight, maxByWidth, MAX_BOARD_SIZE) / 8) * 8
  );

  boardWrapEl.style.width = `${boardSize}px`;
  boardWrapEl.style.height = `${boardSize}px`;
  boardPlayerTopEl.style.width = `${boardSize}px`;
  boardPlayerBottomEl.style.width = `${boardSize}px`;

  // Eval-bar must match the FULL board column (player rows + gaps + square),
  // not just the square, so its bottom lines up with it too.
  const totalColumnHeight = boardSize + 2 * PLAYER_LABEL_HEIGHT + 2 * BOARD_COLUMN_GAP;
  evalBarWrapEl.style.height = `${totalColumnHeight}px`;

  if (isMobile) {
    evalGraphWrapEl.style.width = '100%';
    dashboardWrapEl.style.width = '100%';
  } else {
    moveListPanelEl.style.width = `${MOVE_LIST_WIDTH}px`;
    // The eval graph now sits between the move list and nav, in that same
    // column - same width as both, not the full row (css/styles.css's
    // #review-panel grid-template-areas).
    evalGraphWrapEl.style.width = `${MOVE_LIST_WIDTH}px`;
    // #nav-wrap and #eval-graph-wrap are separate grid items from
    // #move-list-panel (so mobile can freely reposition/resize them), so all
    // three no longer automatically share totalColumnHeight via flexbox - the
    // move list panel's own height has to be explicitly reduced by both
    // their actual heights (+ the two gaps now between the three stacked
    // pieces) instead, so eval-bar/board still end up exactly as tall as
    // moves+gap+graph+gap+nav together. (navHeight itself was already
    // measured above, for the maxByHeight calculation.)
    moveListPanelEl.style.height = `${totalColumnHeight - navHeight - EVAL_GRAPH_HEIGHT - ROW_GAP * 2}px`;
    const totalRowWidth = EVAL_BAR_WIDTH + ROW_GAP + boardSize + ROW_GAP + MOVE_LIST_WIDTH;
    dashboardWrapEl.style.width = `${totalRowWidth}px`;
  }

  board.resize();
  evalGraph.resize();
}

window.addEventListener('resize', syncBoardRowLayout);

// Every category except Excellent/Gut/Ungenau/Theoriezug - those are too
// common (and too unremarkable) to be worth a permanent marker on the graph.
const KEY_POINT_CATEGORIES = new Set(['BRILLIANT', 'GREAT', 'BEST', 'MISTAKE', 'MISS', 'BLUNDER']);

/** @returns {'w'|'b'|null} which color the given username played in this game. */
function ownColorFor(game, ownUsername) {
  const normalized = ownUsername.trim().toLowerCase();
  if (game.white.toLowerCase() === normalized) return 'w';
  if (game.black.toLowerCase() === normalized) return 'b';
  return null;
}

/** "Opponent (Elo)" - the searched user's OWN name/elo is dropped, since
 *  it's already shown in the username field right next to this dropdown.
 *  Used for the game picker's entries (buildGameOptions), collapsed and open. */
function opponentLabel(game, ownUsername) {
  const isOpponentWhite = ownColorFor(game, ownUsername) === 'b';
  const name = isOpponentWhite ? game.white : game.black;
  const rating = isOpponentWhite ? game.whiteRating : game.blackRating;
  return rating ? `${name} (${rating})` : name;
}

/** Eval-graph markers for the searched user's own Brilliant/Great/Miss/Blunder
 *  moves only - not the opponent's. */
function computeOwnKeyPoints(moves, ownUsername, game) {
  const ownColor = ownColorFor(game, ownUsername);
  if (!ownColor) return [];
  return moves
    .filter((m) => m.color === ownColor && KEY_POINT_CATEGORIES.has(m.category.id))
    .map((m) => ({
      index: m.ply,
      color: m.category.color,
      // Only BEST ("Perfekt") markers are ever thinned/decluttered
      // (js/ui/evalGraph.js) - every other category always renders in full.
      thinnable: m.category.id === 'BEST',
    }));
}

/** The last book/opening-theory move - game-wide (not "own"-color-specific
 *  like computeOwnKeyPoints above, since leaving theory is a fact about the
 *  position, not either player individually), always shown, never thinned;
 *  marks where the game actually left known theory. null if the game never
 *  had a single book move. */
function computeLastBookKeyPoint(moves) {
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].category.id === 'BOOK') {
      return { index: moves[i].ply, color: moves[i].category.color, thinnable: false };
    }
  }
  return null;
}

/** @returns {'win'|'draw'|'loss'|null} how this game ended for the searched
 *  user - shared by the outcome circle (below) and the outcome-filter
 *  checkboxes (#outcome-filter-menu). */
function ownOutcomeCategory(game, ownUsername) {
  const ownColor = ownColorFor(game, ownUsername);
  if (!ownColor) return null;
  if (game.winner === 'draw') return 'draw';
  const ownWon = (ownColor === 'w' && game.winner === 'white') || (ownColor === 'b' && game.winner === 'black');
  return ownWon ? 'win' : 'loss';
}

// S/R/N badges for win/draw/loss, like the Meta-Analyse's result marks
// (.outcome-badge) - in the game picker and the outcome filter.
const OUTCOME_LETTER = { win: 'S', draw: 'R', loss: 'N' };

/** The S/R/N badge (HTML) showing whether the searched user won, lost, or drew. */
function ownOutcomeBadge(game, ownUsername) {
  const category = ownOutcomeCategory(game, ownUsername);
  return category ? `<span class="outcome-badge ${category}">${OUTCOME_LETTER[category]}</span>` : '';
}

const OUTCOME_ORDER = ['win', 'draw', 'loss'];

/** Rebuilds #outcome-filter-btn's badges from the current selection -
 *  win/draw/loss order, only the ones actually selected. */
function updateOutcomeFilterButtonIcon() {
  outcomeFilterBtn.innerHTML = OUTCOME_ORDER.filter((o) => selectedOutcomes.has(o))
    .map((o) => `<span class="outcome-badge ${o}">${OUTCOME_LETTER[o]}</span>`)
    .join('');
}

// Outcome filter (Gewonnen/Remis/Verloren): a checkbox multi-select, so it's
// not a CustomSelect (single-select only) - a small hand-rolled dropdown
// instead, same open/close mechanics as js/ui/boardThemePicker.js.
let selectedOutcomes = new Set(loadOutcomeFilter() ?? OUTCOME_ORDER);
for (const checkbox of outcomeFilterCheckboxes) {
  checkbox.checked = selectedOutcomes.has(checkbox.dataset.outcome);
  checkbox.addEventListener('change', () => {
    // At least one outcome must always stay selected - unchecking the last
    // one is rejected outright (checkbox snaps back checked) rather than
    // silently letting the filter hide every game.
    if (!checkbox.checked && selectedOutcomes.size === 1 && selectedOutcomes.has(checkbox.dataset.outcome)) {
      checkbox.checked = true;
      return;
    }
    if (checkbox.checked) selectedOutcomes.add(checkbox.dataset.outcome);
    else selectedOutcomes.delete(checkbox.dataset.outcome);
    saveOutcomeFilter([...selectedOutcomes]);
    updateOutcomeFilterButtonIcon();
    meta?.refresh();
  });
}
updateOutcomeFilterButtonIcon();
outcomeFilterBtn.addEventListener('click', () => {
  if (outcomeFilterMenu.classList.contains('hidden')) {
    const rect = outcomeFilterBtn.getBoundingClientRect();
    outcomeFilterMenu.style.position = 'fixed';
    outcomeFilterMenu.style.top = `${rect.bottom + 4}px`;
    outcomeFilterMenu.style.left = `${rect.left}px`;
    outcomeFilterMenu.classList.remove('hidden');
  } else {
    outcomeFilterMenu.classList.add('hidden');
  }
});
document.addEventListener('click', (e) => {
  if (!outcomeFilterPicker.contains(e.target)) outcomeFilterMenu.classList.add('hidden');
});

const COLOR_ORDER = ['w', 'b'];
const COLOR_ICON = {
  w: 'https://chessboardjs.com/img/chesspieces/wikipedia/wP.png',
  b: 'https://chessboardjs.com/img/chesspieces/wikipedia/bP.png',
};

/** Rebuilds #color-filter-btn's pawn icons (side by side) from the current
 *  selection - same idea as updateOutcomeFilterButtonIcon above, just pawn
 *  images instead of S/R/N badges. */
function updateColorFilterButtonIcon() {
  colorFilterBtn.innerHTML = COLOR_ORDER.filter((c) => selectedColors.has(c))
    .map((c) => `<img src="${COLOR_ICON[c]}" alt="" class="color-filter-stack-icon">`)
    .join('');
}

// Color filter (Weiß/Schwarz): same checkbox multi-select pattern as the
// outcome filter above, persisted the same way.
/** A saved multi-select restored against the known values - all of them if
 *  nothing (valid) was saved, so the filter can never come back empty. */
function restoredSelection(saved, order) {
  const valid = (saved ?? []).filter((v) => order.includes(v));
  return new Set(valid.length ? valid : order);
}
let selectedColors = restoredSelection(loadColorFilter(), COLOR_ORDER);
for (const checkbox of colorFilterCheckboxes) {
  checkbox.checked = selectedColors.has(checkbox.dataset.color);
  checkbox.addEventListener('change', () => {
    // At least one color must always stay selected - see the outcome
    // filter's own identical guard above for why.
    if (!checkbox.checked && selectedColors.size === 1 && selectedColors.has(checkbox.dataset.color)) {
      checkbox.checked = true;
      return;
    }
    if (checkbox.checked) selectedColors.add(checkbox.dataset.color);
    else selectedColors.delete(checkbox.dataset.color);
    saveColorFilter([...selectedColors]);
    updateColorFilterButtonIcon();
    meta?.refresh();
  });
}
updateColorFilterButtonIcon();
colorFilterBtn.addEventListener('click', () => {
  if (colorFilterMenu.classList.contains('hidden')) {
    const rect = colorFilterBtn.getBoundingClientRect();
    colorFilterMenu.style.position = 'fixed';
    colorFilterMenu.style.top = `${rect.bottom + 4}px`;
    colorFilterMenu.style.left = `${rect.left}px`;
    colorFilterMenu.classList.remove('hidden');
  } else {
    colorFilterMenu.classList.add('hidden');
  }
});
document.addEventListener('click', (e) => {
  if (!colorFilterPicker.contains(e.target)) colorFilterMenu.classList.add('hidden');
});

const GAME_TYPE_ORDER = ['bullet', 'blitz', 'rapid', 'daily'];
// The Spielart menu's icons come from timeClassStyle too (index.html only marks where).
for (const span of gameTypeMenu.querySelectorAll('[data-tc-icon]')) {
  span.insertAdjacentHTML('afterbegin', `${timeClassStyle(span.dataset.tcIcon).icon} `);
}

/** Rebuilds #game-type-btn's icons (side by side) from the current
 *  selection - same idea as the outcome/color filters above, reusing
 *  timeClassStyle for the icon+color so they never drift out of sync with
 *  the game picklist's own per-game icons. */
function updateGameTypeFilterButtonIcon() {
  const shown = GAME_TYPE_ORDER.filter((t) => selectedGameTypes.has(t));
  gameTypeBtn.innerHTML = shown
    .map((t) => {
      const style = timeClassStyle(t);
      return `<span class="game-type-filter-stack-icon" style="color:${style.color}">${style.icon}</span>`;
    })
    .join('');
}

// Game-type filter (Spielart): same checkbox multi-select pattern as the
// outcome/color filters above, persisted the same way.
let selectedGameTypes = restoredSelection(loadGameTypeFilter(), GAME_TYPE_ORDER);
for (const checkbox of gameTypeFilterCheckboxes) {
  checkbox.checked = selectedGameTypes.has(checkbox.dataset.gameType);
  checkbox.addEventListener('change', () => {
    if (!checkbox.checked && selectedGameTypes.size === 1 && selectedGameTypes.has(checkbox.dataset.gameType)) {
      checkbox.checked = true;
      return;
    }
    if (checkbox.checked) selectedGameTypes.add(checkbox.dataset.gameType);
    else selectedGameTypes.delete(checkbox.dataset.gameType);
    saveGameTypeFilter([...selectedGameTypes]);
    updateGameTypeFilterButtonIcon();
    meta?.refresh();
  });
}
updateGameTypeFilterButtonIcon();
gameTypeBtn.addEventListener('click', () => {
  if (gameTypeMenu.classList.contains('hidden')) {
    const rect = gameTypeBtn.getBoundingClientRect();
    gameTypeMenu.style.position = 'fixed';
    gameTypeMenu.style.top = `${rect.bottom + 4}px`;
    gameTypeMenu.style.left = `${rect.left}px`;
    gameTypeMenu.classList.remove('hidden');
  } else {
    gameTypeMenu.classList.add('hidden');
  }
});
document.addEventListener('click', (e) => {
  if (!gameTypePicker.contains(e.target)) gameTypeMenu.classList.add('hidden');
});

function setBoardPlayerLabel(rowEl, avatarEl, usernameEl, info, color) {
  usernameEl.innerHTML = formatPlayerLabelHtml(info);
  setAvatar(avatarEl, info.avatar, color === 'white' ? 'w' : 'b');
  rowEl.classList.toggle('player-row-white', color === 'white');
  rowEl.classList.toggle('player-row-black', color === 'black');
}

/** Shows white's/black's name+avatar above/below the board, matching whichever
 *  color is currently rendered on that side (depends on flip state). */
function updateBoardPlayerLabels() {
  if (!players) return;
  const bottomColor = board.getOrientation(); // 'white' or 'black'
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  setBoardPlayerLabel(boardPlayerTopEl, boardAvatarTopEl, boardUsernameTopEl, players[topColor], topColor);
  setBoardPlayerLabel(boardPlayerBottomEl, boardAvatarBottomEl, boardUsernameBottomEl, players[bottomColor], bottomColor);
}

/** Renders one side's captured-pieces tray: small icons of the opponent's
 *  pieces this side has taken (most valuable first), plus a "+N" if this
 *  side is materially ahead. */
function renderMaterialDisplay(container, { captured, advantage }, capturedPieceColor) {
  container.innerHTML = '';
  let previousType = null;
  for (const type of captured) {
    const icon = document.createElement('img');
    icon.className = 'material-display-icon';
    icon.src = `https://chessboardjs.com/img/chesspieces/wikipedia/${capturedPieceColor}${type.toUpperCase()}.png`;
    icon.alt = type;
    // Same-type pieces (captured, already grouped/sorted by material.js)
    // overlap into a compact stack instead of spreading out - the count is
    // still readable from how far the stack extends. A different type
    // starts a fresh, clearly separated group instead.
    if (previousType !== null) {
      icon.style.marginLeft = type === previousType ? '-9px' : '4px';
    }
    container.appendChild(icon);
    previousType = type;
  }
  if (advantage > 0) {
    const badge = document.createElement('span');
    badge.className = 'material-display-advantage';
    badge.textContent = `+${advantage}`;
    container.appendChild(badge);
  }
}

/** Updates both captured-pieces trays for the currently-shown position,
 *  matching whichever color is currently on top/bottom (depends on flip). */
function updateMaterialDisplay() {
  if (!currentNode) return;
  const summary = materialSummaryFromFen(currentNode.fenAfter);
  const bottomColor = board.getOrientation(); // 'white' or 'black'
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  // Icons shown are the OPPONENT's pieces (what this side captured), so the
  // icon color is the opposite of the row's own color.
  renderMaterialDisplay(boardMaterialTopEl, summary[topColor], topColor === 'white' ? 'b' : 'w');
  renderMaterialDisplay(boardMaterialBottomEl, summary[bottomColor], bottomColor === 'white' ? 'b' : 'w');
}

/** Walks from `node` up toward the root to find each side's most recent
 *  known remaining time (a node only carries its OWN mover's clock, so
 *  white's time comes from the nearest white-move ancestor, black's from the
 *  nearest black-move ancestor - either can be null if the PGN had no [%clk]
 *  data at all, or the game hasn't reached that side's first move yet). */
function clocksAtNode(node) {
  let white = null;
  let black = null;
  for (let n = node; n && (white == null || black == null); n = n.parent) {
    if (n.clockSeconds == null) continue;
    if (n.color === 'w' && white == null) white = n.clockSeconds;
    else if (n.color === 'b' && black == null) black = n.clockSeconds;
  }
  // Neither side has moved yet (or one hasn't) - show the game's starting
  // time instead of leaving the clock blank, but only for games that
  // actually have clock data at all (see the .hidden fallback otherwise).
  if (gameHasClockData) {
    if (white == null) white = initialClockSeconds;
    if (black == null) black = initialClockSeconds;
  }
  return { white, black };
}

/** Renders one player bar's clock, or hides it if this game has no clock
 *  data for that side at this point. */
function renderPlayerClock(container, seconds) {
  const formatted = formatClock(seconds);
  if (formatted == null) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.querySelector('.player-clock-time').textContent = formatted;
  container.classList.toggle('low-time', seconds < 30);
}

/** Updates both player bars' clocks for the currently-shown position,
 *  matching whichever color is currently on top/bottom (depends on flip). */
function updatePlayerClocks() {
  if (!currentNode) return;
  if (!clockDisplayEnabled) {
    renderPlayerClock(boardClockTopEl, null);
    renderPlayerClock(boardClockBottomEl, null);
    return;
  }
  const { white, black } = clocksAtNode(currentNode);
  const bottomColor = board.getOrientation(); // 'white' or 'black'
  const topColor = bottomColor === 'white' ? 'black' : 'white';
  const clocks = { white, black };
  renderPlayerClock(boardClockTopEl, clocks[topColor]);
  renderPlayerClock(boardClockBottomEl, clocks[bottomColor]);
}

/** For the "Heute" time filter - compares local calendar date, not exact
 *  timestamps (Chess.com's end_time is UTC, so this naturally follows the
 *  browser's own local timezone for what counts as "today"). */
function isSameCalendarDay(a, b) {
  return (
    Boolean(a) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Protects against a prolific player's "Von Beginn an"/large custom range
// hanging for a very long time (hundreds of monthly archives) or crashing

/** Whole months between two dates (>= 0), rounded up so the "from" date's own
 *  month is always included. Used to size monthsBack for the "custom" time
 *  filter's own date range, from just the "from" date. */
function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}

/** Shows/hides the cancel icon inside #fetch-games-btn - loading state now lives
 *  entirely on the button itself so the top bar never grows a second row. */
let fetchGamesAbortController = null;

function setFetchGamesLoading(isLoading) {
  fetchGamesBtnLabel.textContent = isLoading ? '✕' : 'Spiele laden';
  if (!isLoading) fetchGamesBtnFill.style.width = '0%';
}

fetchGamesBtn.addEventListener('click', async () => {
  // If already loading, cancel it
  if (fetchGamesAbortController) {
    fetchGamesAbortController.abort();
    setFetchGamesLoading(false);
    fetchGamesAbortController = null;
    return;
  }
  const username = usernameInput.value.trim();
  if (!username) {
    showToast('Bitte einen Chess.com-Benutzernamen eingeben.', 'error');
    flashFieldError(usernameInput);
    return;
  }

  saveLastUsername(username);
  updateUsernameAvatar(username);
  rememberUsername(username);
  setFetchGamesLoading(true);
  // Meta mode leaves the single-game picker alone, so switching back still
  // finds whatever game list was loaded there before.
  if (appMode === 'game') gameSelect.disabled = true;
  analyzeToggleBtn.disabled = true;

  try {
    fetchGamesAbortController = new AbortController();
    const monthsBackValue = timeRangeSelect.value;
    const isTodayFilter = monthsBackValue === 'today';
    const isCustomRange = monthsBackValue === 'custom';
    // Empty native <input type="date"> value is '' - both bounds are
    // optional, an empty "from" just falls back to Infinity below.
    const customFrom = isCustomRange && customDateFromEl.value ? new Date(customDateFromEl.value) : null;
    const customTo = isCustomRange && customDateToEl.value ? new Date(customDateToEl.value) : null;
    if (customTo) customTo.setHours(23, 59, 59, 999); // include the whole "to" day, not just its midnight

    // "Heute" only needs the current month's archive (today is always in it).
    const monthsBack =
      monthsBackValue === 'all'
        ? Infinity
        : isTodayFilter
        ? 1
        : isCustomRange
        ? (customFrom ? monthsBetween(customFrom, new Date()) : Infinity)
        : Number(monthsBackValue);

    const rawGames = await fetchRecentGames(username, {
      monthsBack,
      onProgress: (fraction) => {
        fetchGamesBtnFill.style.width = `${Math.round(fraction * 100)}%`;
      },
      signal: fetchGamesAbortController.signal,
    });

    // Meta-Analyse keeps every downloaded game and applies Spielart/Ergebnis/
    // Farbe/Zeitraum live (js/meta/metaController.js), so changing a filter
    // afterwards never needs another download.
    if (appMode === 'meta') {
      await meta.loadGames(rawGames, username, currentDateBounds().from);
      showToast(`${rawGames.length} Partien geladen.`, 'success');
      return;
    }

    const today = new Date();
    games = rawGames
      .map(summarizeGame)
      .filter((game) => selectedGameTypes.has(game.timeClass))
      .filter((game) => !isTodayFilter || isSameCalendarDay(game.endDate, today))
      .filter((game) => !isCustomRange || !customFrom || game.endDate >= customFrom)
      .filter((game) => !isCustomRange || !customTo || game.endDate <= customTo)
      .filter((game) => {
        const category = ownOutcomeCategory(game, username);
        return !category || selectedOutcomes.has(category);
      })
      .filter((game) => {
        const color = ownColorFor(game, username);
        return !color || selectedColors.has(color);
      });

    if (games.length === 0) {
      throw new Error('Keine Partien für diesen Filter gefunden.');
    }

    analyzedUrls = new Set();
    const gameOptions = buildGameOptions(games, username);
    gameSelect.setOptions(gameOptions, gameOptions[0]?.value);
    gameSelect.disabled = false;
    analyzeToggleBtn.disabled = false;
    showToast(`${games.length} Partien erfolgreich geladen.`, 'success');
    // ✓ for what the browser already has, then again once the GitHub job's
    // analyses of this player are merged in.
    refreshAnalyzedMarkers();
    syncAutoAnalysis(username).then(refreshAnalyzedMarkers);
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast(err.message ?? 'Fehler beim Laden der Partien.', 'error');
    }
  } finally {
    setFetchGamesLoading(false);
    fetchGamesAbortController = null;
    if (appMode === 'meta') updateAnalyzeButtonForMode();
  }
});

/**
 * Stored analyses with an engine log (js/analysis/evalLog.js) for these games
 * - under ENGINE first, else under the one the GitHub
 * job used for this player (js/meta/autoAnalysis.js), since that one is
 * there for every game anyway.
 * @returns {Promise<Map<string, {record: object, label: string}>>} by game URL
 */
async function findStoredAnalyses(urls) {
  const sources = [engineSettings()];
  const auto = autoAnalysisEngine(usernameInput.value);
  if (auto && (auto.engineId !== sources[0].engineId || auto.depth !== sources[0].depth)) sources.push(auto);
  const found = new Map();
  for (const { engineId, depth, label } of sources) {
    const records = await loadEngineRecords(engineId, depth, urls.filter((u) => !found.has(u)));
    for (const [url, record] of records) if (record.evals) found.set(url, { record, label });
  }
  return found;
}

/** Re-marks the game picker's entries (✓) - after loading or a finished analysis. */
async function refreshAnalyzedMarkers() {
  const list = games;
  if (!list.length) return;
  const found = await findStoredAnalyses(list.map((g) => g.url));
  if (list !== games) return; // other games loaded meanwhile
  analyzedUrls = new Set(found.keys());
  gameSelect.setOptions(buildGameOptions(games, usernameInput.value), gameSelect.value);
}

/** Stores a finished single-game analysis the way a Meta-Analyse run does -
 *  so it counts in the Meta-Analyse for this engine + depth and opens without
 *  re-analyzing next time. Skipped for games the searched user didn't play. */
async function saveManualAnalysis(game, result, evals, { engineId, depth }) {
  const color = ownColorFor(game, usernameInput.value);
  if (!color) return;
  const initialClock = game.timeClass === 'daily' ? null : parseInitialClockSeconds(result.headers.TimeControl);
  await saveEngineRecord(engineId, depth, game.url, { ...buildEngineRecord(result, color, initialClock), evals });
  meta?.engineSettingsChanged();
  refreshAnalyzedMarkers();
}

/** The engine (ENGINE) - started on first use and again only after it was
 *  terminated (cancelAnalysis). Shared by the analysis and branch-move evaluation. */
function ensureEngine() {
  const { engineId } = ENGINE;
  if (!enginePromise || loadedEngineId !== engineId) {
    engine?.terminate();
    const fresh = new StockfishEngine();
    engine = fresh;
    loadedEngineId = engineId;
    enginePromise = fresh.init(() => {}, engineId).then(
      () => fresh,
      (err) => {
        if (engine === fresh) loadedEngineId = null;
        throw err;
      }
    );
  }
  return enginePromise;
}

/** The game picker's entries for a list of summarizeGame() results. */
function buildGameOptions(gameList, username) {
  return gameList.map((game, index) => {
    const style = timeClassStyle(game.timeClass);
    const outcome = ownOutcomeBadge(game, username);
    const vs = `vs ${opponentLabel(game, username)} — ${game.dateLabel}`;
    const moves = game.moveCount != null ? ` — ${game.moveCount} Zg.` : '';
    const stored = analyzedUrls.has(game.url) ? '✓' : ''; // opens without re-analyzing
    const join = (...parts) => parts.filter(Boolean).join(' ');
    // The same as HTML: game-type icon and S/R/N badge are markup, the text escaped.
    const html = (text) => join(style.icon, escapeHtml(text), outcome, stored);
    return {
      value: String(index),
      // Own name/elo dropped everywhere (see opponentLabel) - just "vs
      // Opponent (Elo) — Date"; the open menu adds the move count.
      label: join(vs + moves, stored),
      shortLabel: join(vs, stored),
      html: html(vs + moves),
      shortHtml: html(vs),
      color: style.color,
    };
  });
}

/** The time filter as concrete bounds - the same months the archive download
 *  covers ("Letzte 6 Monate" = the current month and the 5 before it). Used
 *  by the Meta-Analyse to filter already-loaded games live. */
function currentDateBounds() {
  const value = timeRangeSelect.value;
  const now = new Date();
  if (value === 'all') return { from: null, to: null };
  if (value === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: null };
  if (value === 'custom') {
    const from = customDateFromEl.value ? new Date(customDateFromEl.value) : null;
    const to = customDateToEl.value ? new Date(customDateToEl.value) : null;
    to?.setHours(23, 59, 59, 999);
    return { from, to };
  }
  return { from: new Date(now.getFullYear(), now.getMonth() - (Number(value) - 1), 1), to: null };
}

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchGamesBtn.click();
});

/** Toggles #analyze-toggle-btn between its two states in place (same
 *  element, same position in the row - not two separately shown/hidden
 *  buttons) - green-gradient magnifying-glass icon when idle (css/styles.css's
 *  .analyze-btn-ready), red X icon + progress fill + percentage while running -
 *  the same loading visualization #fetch-games-btn uses, so the row's own
 *  width never shifts the way the old "Analysiere Zug X von Y" text did. */
function setAnalyzing(analyzing) {
  isAnalyzing = analyzing;
  analyzeToggleBtnIcon.classList.toggle('hidden', analyzing);
  analyzeToggleBtnCancelIcon.classList.toggle('hidden', !analyzing);
  analyzeToggleBtnSpinner.classList.toggle('hidden', !analyzing);
  analyzeToggleBtnPct.classList.toggle('hidden', !analyzing);
  setAnalyzeProgress(null); // also puts the tab title back once it's done
  analyzeToggleBtn.title = analyzing ? 'Analyse abbrechen' : 'Ausgewähltes Spiel analysieren';
  analyzeToggleBtn.classList.toggle('analyze-btn-ready', !analyzing);
  analyzeToggleBtn.classList.toggle('bg-red-600', analyzing);
  analyzeToggleBtn.classList.toggle('hover:bg-red-500', analyzing);
}

/** The running analysis' progress on #analyze-toggle-btn: fill + "37%", or
 *  "…" (null) while nothing is measurable yet, e.g. the engine still loading. */
function setAnalyzeProgress(fraction) {
  const pct = fraction == null ? '…' : `${Math.round(fraction * 100)}%`;
  analyzeToggleBtnFill.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
  analyzeToggleBtnPct.textContent = pct;
  // The same in the browser tab's title, so a game opened in a new tab shows
  // how far its analysis is from any other tab ("37% · Chess Analysis").
  document.title = isAnalyzing ? `${pct} · ${BASE_TITLE}` : BASE_TITLE;
}
const BASE_TITLE = document.title;

analyzeToggleBtn.addEventListener('click', () => {
  if (appMode === 'meta') {
    meta.toggleRun();
    return;
  }
  if (isAnalyzing) {
    cancelAnalysis();
  } else {
    analysisRun = startAnalysis();
  }
});

let analysisRun = null; // startAnalysis()'s promise - settles once a cancelled run has fully unwound
let selectionToken = 0;

/** Picking a game in the game picker analyzes it right away (instantly from a
 *  stored analysis) - a run still going for the previous pick is cancelled first. */
async function analyzeSelectedGame() {
  const token = ++selectionToken;
  if (isAnalyzing) {
    cancelAnalysis();
    await analysisRun;
  }
  if (token !== selectionToken || isAnalyzing) return; // a newer pick took over
  analysisRun = startAnalysis();
}

async function startAnalysis() {
  const index = Number(gameSelect.value);
  const game = games[index];
  if (!game) return;

  stopAutoPlay();
  setAnalyzing(true);
  fetchGamesBtn.disabled = true;

  try {
    const playersPromise = Promise.all([
      fetchPlayerProfile(game.white),
      fetchPlayerProfile(game.black),
    ]);

    gameTermination = game.termination;
    // Adjusts the win% model that drives move classification only (see the
    // comment on evalToWinPercentForRating in winProbability.js) - falls
    // back to no adjustment if either side's rating is unknown. Also reused
    // by branch-move classification (evaluateBranchNode), so it's a module-
    // level variable, not local to this handler.
    avgRating = game.whiteRating && game.blackRating ? (game.whiteRating + game.blackRating) / 2 : null;

    // Analyzed before (here, in the Meta-Analyse or by the GitHub job):
    // replaying the stored engine log gives the exact same result, instantly.
    const stored = (await findStoredAnalyses([game.url])).get(game.url);
    let result = null;
    if (stored) {
      try {
        result = await analyzeGame(game.pgn, replayEngine(stored.record.evals), { avgRating });
        showToast(`Gespeicherte Analyse geladen (${stored.label}).`, 'info');
      } catch (err) {
        console.warn('Gespeicherte Analyse unbrauchbar, analysiere neu:', err);
      }
    }
    if (!result) {
      const settings = engineSettings();
      const recorder = recordingEngine(await ensureEngine());
      result = await analyzeGame(game.pgn, recorder, {
        depth: settings.depth,
        avgRating,
        onProgress: (done, total) => setAnalyzeProgress(done / total),
      });
      saveManualAnalysis(game, result, String(recorder), settings);
    }
    analysis = result;

    el('game-empty').classList.add('hidden');
    reviewPanel.classList.remove('hidden');
    // On mobile, the filter bar eats 5 rows above the fold - collapse it out
    // of the way now that there's a board to show, and reveal the floating
    // button that can bring it back (e.g. to load a different game).
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      loaderPanel.classList.add('collapsed');
      loaderToggleBtn.classList.remove('hidden');
      loaderToggleBtn.textContent = '☰';
    }
    // Default to the searched user's own pieces at the bottom, opponent's at
    // the top - swapped only via the flip button from here on.
    const ownColor = ownColorFor(game, usernameInput.value);
    ownPlayerColor = ownColor;
    board.setOrientation(ownColor === 'b' ? 'black' : 'white');
    // The panel was display:none (width 0) until now, so board/eval-bar/move
    // list/eval-graph all need their explicit pixel sizes computed for the
    // first time.
    syncBoardRowLayout();
    // The move history is a tree (js/analysis/moveTree.js) so the user can
    // branch off at any point (handleUserDrop) without touching the real
    // game's own move list - the analyzed game itself is just the tree's
    // initial main-line spine.
    rootNode = createRootNode(analysis.positions[0]);
    rootNode.nextBestMoveSquares = analysis.startBestMoveSquares;
    buildMainLineFromMoves(rootNode, analysis.moves);
    initialClockSeconds = parseInitialClockSeconds(analysis.headers.TimeControl);
    gameHasClockData = analysis.moves.some((m) => m.clockSeconds != null);
    clockDisplayEnabled = game.timeClass !== 'daily';
    const incrementSeconds = parseIncrementSeconds(analysis.headers.TimeControl);
    // The Zeitmanagement view only makes sense when there's actual clock
    // data to chart in the first place - same gating as the player-bar
    // clocks - but Zugauswertung/Statistik are always available.
    const showTimeManagementToggle = clockDisplayEnabled && gameHasClockData;
    dashboardViewToggleEl.classList.remove('hidden');
    dashboardViewTimeBtn.classList.toggle('hidden', !showTimeManagementToggle);
    setDashboardView('table'); // reset to the default view for every newly loaded game
    if (showTimeManagementToggle) {
      timeManagementChart.setData(computeMoveTimesSpent(analysis.moves, initialClockSeconds, incrementSeconds));
    }
    renderStatsTable(computeAdvancedStats(analysis, initialClockSeconds, incrementSeconds));
    moveList.render(rootNode);
    const [whiteAvatar, blackAvatar] = await playersPromise;
    players = {
      white: { ...whiteAvatar, username: game.white, rating: game.whiteRating },
      black: { ...blackAvatar, username: game.black, rating: game.blackRating },
    };
    dashboard.setPlayers(players);
    for (const [color, info] of [['w', players.white], ['b', players.black]]) {
      statsUsernameEl[color].innerHTML = formatPlayerLabelHtml(info);
      setAvatar(statsAvatarEl[color], info.avatar, color);
    }
    moveList.setPlayers(players);
    updateBoardPlayerLabels();
    dashboard.render(analysis);
    evalGraph.setData(analysis.moves, analysis.moves[0]?.evalBeforeWhite);
    const lastBookKeyPoint = computeLastBookKeyPoint(analysis.moves);
    evalGraph.setKeyPoints([
      ...computeOwnKeyPoints(analysis.moves, usernameInput.value, game),
      ...(lastBookKeyPoint ? [lastBookKeyPoint] : []),
    ]);
    goToNode(rootNode);
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('Analyse abgebrochen.', 'info');
    } else {
      showToast(err.message ?? 'Fehler bei der Analyse.', 'error');
    }
  } finally {
    setAnalyzing(false);
    fetchGamesBtn.disabled = false;
  }
}

function cancelAnalysis() {
  // Rejects whatever evaluate() call is currently in flight (see
  // js/engine/stockfishEngine.js), which unwinds startAnalysis()'s awaited
  // call immediately - its catch/finally above handles the resulting
  // AbortError, including flipping the button back via setAnalyzing(false).
  // loadedEngineId is cleared so the next "Analysieren" click re-initializes
  // a fresh engine instead of reusing this now-dead one.
  engine?.terminate();
  loadedEngineId = null;
}

/** The main-line MoveNode at the given ply (0 = root/start position). Used
 *  only by the eval graph's click-to-jump, which stays main-line-only. */
function mainLineNodeAtPly(ply) {
  let node = rootNode;
  for (let i = 0; i < ply && node; i++) node = node.children[0];
  return node;
}

/** Thin wrapper kept for the eval graph (js/ui/evalGraph.js's onJump), which
 *  only ever indexes into the main line by ply. */
function goToPly(ply) {
  goToNode(mainLineNodeAtPly(ply));
}

/** @returns {boolean} true only for the REAL game's actual last main-line
 *  move - not a branch endpoint, and not the main line's last move if the
 *  user has since attached a variation to it (still the real ending). */
function isRealFinalNode(node) {
  return Boolean(analysis) && node.isMainLine && node.ply === analysis.moves.length;
}

/** Shows the opening's name in the strip between the move list and the nav
 *  controls once the current position matches one (openingBook.js's
 *  openingNameForLine) - hidden at the start position and hidden again once
 *  stepping back before any named line was reached, since #move-list-panel's
 *  own flex layout hands the move list back that space automatically. */
function updateOpeningNameBar(node) {
  const sanMoves = pathFromRoot(node)
    .slice(1) // drop the root - it has no san of its own
    .map((n) => n.san);
  const name = openingNameForLine(sanMoves);
  openingNameBarEl.textContent = name ?? '';
  openingNameBarEl.classList.toggle('hidden', !name);
}

/** A White-perspective eval expressed instead from `color`'s own point of
 *  view (positive = good for them) - the common piece every "how much did
 *  this move cost/gain for the mover" computation below needs. */
function cpForMover(whiteEval, color) {
  const whiteCp =
    whiteEval.mate !== undefined ? (whiteEval.mate > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT) : (whiteEval.cp ?? 0);
  return color === 'w' ? whiteCp : -whiteCp;
}

// Quality rank for "Bester Zug" - lower is better. BOOK/FORCED are excluded
// entirely (not a quality judgment - see classification.js), so every other
// move in the game is a candidate: there's always *some* best move, even in
// a game that's nothing but Inaccuracy/Mistake/Blunder.
const MOVE_QUALITY_RANK = {
  BRILLIANT: 0, GREAT: 1, BEST: 2, EXCELLENT: 3, GOOD: 4,
  INACCURACY: 5, MISTAKE: 6, MISS: 7, BLUNDER: 8,
};

/**
 * Aggregated per-game/per-player facts for the "Statistik" dashboard tab -
 * everything here is derived from data gameAnalyzer.js/material.js/
 * openingBook.js already compute per move, just summarized across the whole
 * game instead of shown move-by-move.
 * @param {object} analysis - gameAnalyzer.js's result
 * @param {number|null} initialSeconds
 * @param {number} incrementSeconds
 */
function computeAdvancedStats(analysis, initialSeconds, incrementSeconds) {
  const perColor = {
    w: { cpLossSum: 0, cpLossCount: 0, sacrifices: 0, checks: 0, forced: 0, missedMates: [], bestMoves: [], worstBlunder: null, maxAdvantage: null, fastest: null, slowest: null },
    b: { cpLossSum: 0, cpLossCount: 0, sacrifices: 0, checks: 0, forced: 0, missedMates: [], bestMoves: [], worstBlunder: null, maxAdvantage: null, fastest: null, slowest: null },
  };
  const lastClock = { w: initialSeconds, b: initialSeconds };

  for (const move of analysis.moves) {
    const stats = perColor[move.color];

    const cpBefore = cpForMover(move.evalBeforeWhite, move.color);
    const cpAfter = cpForMover(move.evalAfterWhite, move.color);
    stats.cpLossSum += Math.max(0, cpBefore - cpAfter);
    stats.cpLossCount += 1;

    if (move.isSacrifice) stats.sacrifices += 1;
    // chess.js's SAN convention: '+' for check, '#' for checkmate (which is
    // also, definitionally, a check).
    if (move.san.endsWith('+') || move.san.endsWith('#')) stats.checks += 1;
    if (move.category.id === 'FORCED') stats.forced += 1;
    // The engine saw a mate in 1 for the mover (white-perspective mate: +1
    // for White, -1 for Black) and the move played didn't mate.
    if (move.evalBeforeWhite?.mate === (move.color === 'w' ? 1 : -1) && !move.san.endsWith('#')) {
      stats.missedMates.push({ ply: move.ply, moveNumber: move.moveNumber });
    }

    const rank = MOVE_QUALITY_RANK[move.category.id];
    if (rank !== undefined) {
      const candidate = { ply: move.ply, moveNumber: move.moveNumber, rank, deltaW: move.deltaW, categoryLabel: move.category.label };
      const current = stats.bestMoves[0];
      if (!current || rank < current.rank || (rank === current.rank && move.deltaW < current.deltaW)) {
        // Strictly better than every candidate so far - it's now the only one.
        stats.bestMoves = [candidate];
      } else if (rank === current.rank && move.deltaW === current.deltaW) {
        // Exactly tied with the current best(s) - an equally good candidate,
        // shown alongside it rather than picked over it arbitrarily.
        stats.bestMoves.push(candidate);
      }
    }

    if (!stats.worstBlunder || move.deltaW > stats.worstBlunder.deltaW) {
      stats.worstBlunder = { ply: move.ply, moveNumber: move.moveNumber, deltaW: move.deltaW };
    }

    const advantage = materialSummaryFromFen(move.fenAfter)[move.color === 'w' ? 'white' : 'black'].advantage;
    if (!stats.maxAdvantage || advantage > stats.maxAdvantage.advantage) {
      stats.maxAdvantage = { ply: move.ply, moveNumber: move.moveNumber, advantage };
    }

    const previousClock = lastClock[move.color];
    if (move.clockSeconds != null) {
      if (previousClock != null) {
        const entry = {
          ply: move.ply,
          moveNumber: move.moveNumber,
          seconds: Math.max(0, previousClock - move.clockSeconds + incrementSeconds),
        };
        if (!stats.fastest || entry.seconds < stats.fastest.seconds) stats.fastest = entry;
        if (!stats.slowest || entry.seconds > stats.slowest.seconds) stats.slowest = entry;
      }
      lastClock[move.color] = move.clockSeconds;
    }
  }

  const finalize = (color) => {
    const s = perColor[color];
    return {
      acpl: s.cpLossCount > 0 ? Math.round(s.cpLossSum / s.cpLossCount) : null,
      sacrifices: s.sacrifices,
      checks: s.checks,
      forced: s.forced,
      missedMates: s.missedMates,
      bestMoves: s.bestMoves,
      worstBlunder: s.worstBlunder,
      // 0 means "never actually ahead" - not a meaningful "peak", so null too.
      maxAdvantage: s.maxAdvantage && s.maxAdvantage.advantage > 0 ? s.maxAdvantage : null,
      fastest: s.fastest,
      slowest: s.slowest,
    };
  };

  return { white: finalize('w'), black: finalize('b') };
}

/** One stat-table cell: "value (Zug N)" with the move-number part a
 *  clickable jump link, or a plain dash if there's nothing to show. */
function formatMoveStat(entry, formatValue) {
  if (!entry) return '<span class="text-neutral-600">–</span>';
  return `${formatValue(entry)} <span class="stat-jump-link" data-ply="${entry.ply}">(Zug ${entry.moveNumber})</span>`;
}

/** Same as formatMoveStat, but for a list of equally-good candidates (e.g.
 *  "Bester Zug" ties) - each gets its own line, stacked, rather than one
 *  arbitrarily picked winner. */
function formatMoveStatList(entries, formatValue) {
  if (!entries || entries.length === 0) return '<span class="text-neutral-600">–</span>';
  return entries.map((entry) => formatMoveStat(entry, formatValue)).join('<br>');
}

/** A count with every move it counts as its own jump link: "2 (Zug 12, 15)" -
 *  each to the position BEFORE that move, where the chance was (ply - 1). */
function formatMoveCountList(entries) {
  if (!entries.length) return '0';
  const links = entries.map((e) => `<span class="stat-jump-link" data-ply="${e.ply - 1}">${e.moveNumber}</span>`).join(', ');
  return `${entries.length} <span class="stat-jump-group">(Zug ${links})</span>`;
}

/** Renders the "Statistik" tab's rows and wires each jump link to goToPly(). */
// Shown as native hover tooltips on a few row labels - none of these need a
// jump-to-move link (they explain a game-wide stat, not one tied to a single
// move), so a plain `title` attribute is enough, unlike the board-badge
// tactic tooltips which needed a dedicated hoverable dot. `\n` is honored by
// native title tooltips as a real line break, which is what wraps these onto
// a second line rather than one long one.
const ACPL_EXPLANATION =
  'Durchschnittlicher Wertverlust pro Zug in Hundertstel eines Bauern (100 = ein Bauer).\nJe niedriger, desto präziser gespielt.';
const MISSED_MATE_EXPLANATION =
  'Züge, bei denen ein Matt in 1 möglich war, aber anders gezogen wurde.\nKlick auf eine Zugnummer springt zur Stellung davor, in der das Matt möglich war.';
const DELTA_W_EXPLANATION =
  'Prozentpunkte Gewinnwahrscheinlichkeit, die dieser Zug im Vergleich zum bestmöglichen Zug gekostet hat.\n0% wäre der objektiv beste Zug gewesen.';

/** A row label wrapped in a hoverable span - no question-mark/help cursor,
 *  just the browser's own default text cursor. */
function labelWithTooltip(label, explanation) {
  return `<span title="${explanation}">${label}</span>`;
}

function renderStatsTable(stats) {
  const rows = [
    [labelWithTooltip('Ø Centipawn-Verlust', ACPL_EXPLANATION), stats.white.acpl ?? '–', stats.black.acpl ?? '–'],
    ['Anzahl Opfer', stats.white.sacrifices, stats.black.sacrifices],
    ['Anzahl Schachsetzungen', stats.white.checks, stats.black.checks],
    ['Anzahl erzwungener Züge', stats.white.forced, stats.black.forced],
    [
      labelWithTooltip('Verpasste Matt-in-1-Züge', MISSED_MATE_EXPLANATION),
      formatMoveCountList(stats.white.missedMates),
      formatMoveCountList(stats.black.missedMates),
    ],
    [
      'Größter Materialvorsprung',
      formatMoveStat(stats.white.maxAdvantage, (m) => `+${m.advantage}`),
      formatMoveStat(stats.black.maxAdvantage, (m) => `+${m.advantage}`),
    ],
    [
      labelWithTooltip('Bester Zug', DELTA_W_EXPLANATION),
      // Only shown when there's one single, unambiguous best move for that
      // side - a tie between several equally-good candidates isn't "the"
      // best move, so the cell falls back to a dash instead of stacking them.
      formatMoveStatList(
        stats.white.bestMoves.length === 1 ? stats.white.bestMoves : [],
        (m) => `${m.categoryLabel} (-${m.deltaW.toFixed(1)}%)`
      ),
      formatMoveStatList(
        stats.black.bestMoves.length === 1 ? stats.black.bestMoves : [],
        (m) => `${m.categoryLabel} (-${m.deltaW.toFixed(1)}%)`
      ),
    ],
    [
      labelWithTooltip('Größter Patzer', DELTA_W_EXPLANATION),
      formatMoveStat(stats.white.worstBlunder, (m) => `-${m.deltaW.toFixed(1)}%`),
      formatMoveStat(stats.black.worstBlunder, (m) => `-${m.deltaW.toFixed(1)}%`),
    ],
    [
      'Schnellster Zug',
      formatMoveStat(stats.white.fastest, (m) => `${m.seconds.toFixed(1)}s`),
      formatMoveStat(stats.black.fastest, (m) => `${m.seconds.toFixed(1)}s`),
    ],
    [
      'Langsamster Zug',
      formatMoveStat(stats.white.slowest, (m) => `${m.seconds.toFixed(1)}s`),
      formatMoveStat(stats.black.slowest, (m) => `${m.seconds.toFixed(1)}s`),
    ],
  ];

  statsTableBodyEl.innerHTML = rows
    .map(
      ([label, whiteHtml, blackHtml]) => `
        <tr class="border-t border-neutral-800">
          <td class="py-2 font-medium">${label}</td>
          <td class="text-center">${whiteHtml}</td>
          <td class="text-center">${blackHtml}</td>
        </tr>`
    )
    .join('');

  for (const el of statsTableBodyEl.querySelectorAll('.stat-jump-link')) {
    el.addEventListener('click', () => goToPly(Number(el.dataset.ply)));
  }
}

/** Swaps between #classification-table, #time-management-chart-wrap and
 *  #stats-table - only one is ever visible. Chart.js can't measure a canvas
 *  that was display:none while its data was set, so the chart needs an
 *  explicit resize() right after becoming visible again. */
function setDashboardView(view) {
  const showTable = view === 'table';
  const showTime = view === 'time';
  const showStats = view === 'stats';
  classificationTableEl.classList.toggle('hidden', !showTable);
  timeManagementChartWrapEl.classList.toggle('hidden', !showTime);
  statsTableEl.classList.toggle('hidden', !showStats);
  dashboardViewTableBtn.classList.toggle('active', showTable);
  dashboardViewTimeBtn.classList.toggle('active', showTime);
  dashboardViewStatsBtn.classList.toggle('active', showStats);
  if (showTime) timeManagementChart.resize();
}

dashboardViewTableBtn.addEventListener('click', () => setDashboardView('table'));
dashboardViewTimeBtn.addEventListener('click', () => setDashboardView('time'));
dashboardViewStatsBtn.addEventListener('click', () => setDashboardView('stats'));

/** White-perspective eval for a node, for the eval bar display only - falls
 *  back to the nearest ancestor's known eval while a branch move's own
 *  background engine evaluation (evaluateBranchNode) is still pending. */
function evalWhiteForNode(node) {
  if (!node.parent) return analysis?.moves[0]?.evalBeforeWhite ?? { cp: 0 };
  if (node.evalAfterWhite) return node.evalAfterWhite;
  return evalWhiteForNode(node.parent);
}

/** Eval bar wants the mover-agnostic White-perspective value directly (it
 *  derives who's ahead from the sign itself), matching the old evalForPly(). */
function evalForNode(node) {
  return evalWhiteForNode(node);
}

/** Draws the engine's best-move arrow for currentNode, per bestMoveTiming:
 *  'after' only when the move just played wasn't already the best one,
 *  'before' always (the best move in currentNode's resulting position), 'off' never. Main
 *  line: known immediately; a branch move: once its own background
 *  evaluation resolves (evaluateBranchNode calls this again). */
function updateBestMoveArrow() {
  if (!currentNode) return;
  const squares =
    bestMoveTiming === 'off' ? null : bestMoveTiming === 'before' ? currentNode.nextBestMoveSquares : currentNode.bestMoveSquares;
  if (squares) board.showArrow(squares.from, squares.to);
  else board.clearArrow();
}

/**
 * The shared rendering function for "the board now shows this node" -
 * used by every navigation path (nav buttons, keyboard, move list clicks,
 * eval graph clicks, autoplay, and a completed drag/promotion).
 * @param {object} node - a MoveNode (js/analysis/moveTree.js)
 * @param {{fromDrop?: boolean}} [options] - fromDrop skips the board.setPosition()
 *   call (chessboard.js is already animating that piece into place from its
 *   own drag; js/ui/board.js's onSnapEnd callback does the corrective sync
 *   once that animation settles instead, avoiding a conflicting second one).
 */
function goToNode(node, { fromDrop = false } = {}) {
  if (!node) return;
  const previousNode = currentNode;
  currentNode = node;

  // Plays for the move landed on, whichever direction/path got us there -
  // stepping forward, backward, or jumping into/out of a variation, a move
  // just played on the board. Not for the root (no move happened).
  if (previousNode !== currentNode && currentNode.parent) {
    playMoveSound(currentNode, {
      isFinalPly: isRealFinalNode(currentNode),
      isOwnMove: currentNode.color === ownPlayerColor,
    });
  }

  if (!fromDrop) {
    // Hide immediately; the new badge only appears once the piece animation
    // triggered by setPosition() below has fully finished (see onMoveEnd above).
    board.clearBadge();
    board.setPosition(currentNode.fenAfter);
  }
  evalBar.update(evalForNode(currentNode));
  evalGraph.setActivePly(currentNode.isMainLine ? currentNode.ply : null);
  moveList.setActive(currentNode);
  updateMaterialDisplay();
  updatePlayerClocks();
  updateOpeningNameBar(currentNode);

  // No category badge on the king for the REAL game's very last move - most
  // commonly a king castling or stepping to safety right as the game ends,
  // where a move-quality icon on the king reads as clutter rather than
  // useful information. (Branch endpoints keep their badge regardless.)
  const suppressBadge = isRealFinalNode(currentNode) && currentNode.piece === 'k';
  pendingBadge =
    currentNode.parent && !suppressBadge ? { square: currentNode.to, category: currentNode.category } : null;

  // Outlines the from/to squares of whichever move is currently shown, so
  // it's clear at a glance which piece just moved and where from.
  if (currentNode.parent) {
    board.showLastMoveHighlight(currentNode.from, currentNode.to);
  } else {
    board.clearLastMoveHighlight();
  }

  updateBestMoveArrow();

  // The termination marker (checkmate/timeout/resignation/draw) only makes
  // sense at an actual end-of-game position: the real game's final move
  // (precomputed gameTermination - timeout/resignation aren't derivable from
  // a hypothetical line), or a branch that itself reaches checkmate/
  // stalemate/a draw (computeLiveTermination, set when the branch node was
  // created).
  if (isRealFinalNode(currentNode)) {
    board.showTerminationBadges(computeTerminationMarkers(gameTermination, currentNode.fenAfter));
  } else if (currentNode.liveTermination) {
    board.showTerminationBadges(computeTerminationMarkers(currentNode.liveTermination, currentNode.fenAfter));
  } else {
    board.clearTerminationBadges();
  }

  branchControlsEl.classList.toggle('hidden', currentNode.isMainLine);
}

/** Checkmate/stalemate/other-draw reached by a hypothetical branch move -
 *  the parts of gameTermination's shape that ARE derivable from a live
 *  chess.js position (unlike timeout/resignation, which aren't). */
function computeLiveTermination(chess) {
  if (!chess.game_over()) return null;
  if (chess.in_checkmate()) {
    // The side TO MOVE is the one with no legal moves, i.e. the loser.
    return { type: 'checkmate', loserColor: chess.turn() === 'w' ? 'white' : 'black' };
  }
  return { type: 'draw', loserColor: null };
}

/**
 * Legal destinations for a piece on `source` at the current position - drives
 * the move-highlight dots/rings (js/ui/board.js's getLegalMoves, shown on
 * drag-start or a click-to-select). chess.js's own move generation already
 * accounts for pins/check (a pinned piece's illegal destinations are simply
 * absent here), matching the ticket's "nur legal erreichbare Felder" requirement.
 * @param {string} source - e.g. "e4"
 * @returns {Array<{to: string, isCapture: boolean}>}
 */
function getLegalMovesFrom(source) {
  if (!currentNode) return [];
  const chess = new Chess(currentNode.fenAfter);
  return chess
    .moves({ square: source, verbose: true })
    .map((m) => ({ to: m.to, isCapture: m.flags.includes('c') || m.flags.includes('e') }));
}

/**
 * chessboard.js's onDrop, forwarded from js/ui/board.js. Validates the move
 * with chess.js, and either continues along an existing child (the actual
 * next main-line move, or a previously-explored variation) or starts a new
 * branch. Returns synchronously (as chessboard.js's own onDrop requires);
 * a promotion is handled by rejecting the raw drop and completing the move
 * separately once js/ui/promotionPicker.js resolves.
 * @param {{viaDrag: boolean}} [info] - viaDrag:false means this came from
 *   click-to-move (js/ui/board.js), where no chessboard.js drag animation
 *   ever ran to visually place the piece - completeUserMove() needs to know
 *   this so it doesn't skip its own board.setPosition() call in that case.
 * @returns {boolean} whether to accept the drop
 */
function handleUserDrop(source, target, { viaDrag = true } = {}) {
  if (!currentNode) return false;
  // Dropped back on its own square - a cancelled drag, not an illegal-move
  // attempt, so no buzz for this one.
  if (source === target) return false;

  const chess = new Chess(currentNode.fenAfter);
  const candidateMoves = chess.moves({ square: source, verbose: true });
  const isPromotion = candidateMoves.some((m) => m.to === target && m.promotion);

  if (isPromotion) {
    const squareEl = board.getSquareElement(target);
    const color = chess.turn();
    showPromotionPicker(squareEl, color).then((piece) => {
      if (piece) completeUserMove(source, target, piece, { fromDrop: false });
    });
    return false; // reject the raw drag - the picker completes the move itself
  }

  const accepted = completeUserMove(source, target, undefined, { fromDrop: viaDrag }) !== null;
  // chess.js's own move validation already covers every illegal case (bad
  // movement pattern for the piece, moving a pinned piece, leaving/staying in
  // check, ...) - completeUserMove() returning null means it rejected the
  // move, i.e. this was one of those.
  if (!accepted) playIllegalMoveSound();
  return accepted;
}

/** Applies a validated move, creates/reuses its tree node, navigates to it,
 *  and kicks off its background engine evaluation. */
function completeUserMove(source, target, promotion, { fromDrop }) {
  if (!currentNode) return null;
  const chess = new Chess(currentNode.fenAfter);
  const moveResult = chess.move({ from: source, to: target, promotion });
  if (!moveResult) return null;

  const ply = currentNode.ply + 1;
  const newNode = addOrReuseChild(currentNode, {
    ply,
    moveNumber: Math.floor((ply - 1) / 2) + 1,
    color: moveResult.color,
    san: moveResult.san,
    piece: moveResult.piece,
    flags: moveResult.flags,
    from: moveResult.from,
    to: moveResult.to,
    fenBefore: currentNode.fenAfter,
    fenAfter: chess.fen(),
    liveTermination: computeLiveTermination(chess),
    category: null, // filled in once evaluateBranchNode resolves
  });
  goToNode(newNode, { fromDrop });
  moveList.render(rootNode);
  moveList.setActive(newNode);
  // addOrReuseChild() above returns the SAME already-analyzed node untouched
  // when this move matches an existing child - the real main-line move (its
  // category came from analyzeGame(), e.g. BOOK) or a variation explored
  // earlier. Re-running the branch engine evaluation on it would overwrite
  // that with a fresh classification that always assumes isBookMove:false
  // (see applyBranchEvaluation), which is exactly how a real "Theoriezug"
  // dragged by hand used to turn into "Perfekt". Only genuinely new nodes -
  // created with category:null above - still need evaluating.
  if (newNode.category == null) {
    void evaluateBranchNode(newNode); // fire-and-forget - runs in the background, re-renders when it resolves
  }
  return newNode;
}

/**
 * Background engine evaluation for a branch move - mirrors gameAnalyzer.js's
 * own per-move computation (same helpers, same classifyMove() call) so a
 * branch move gets the exact same quality classification as a main-line one.
 * Two evaluate() calls (before/after the move), same as the main analysis
 * effectively does per move, just without its loop's carry-over optimization
 * - branch exploration is an occasional, not performance-critical, path.
 */
async function evaluateBranchNode(node) {
  const { depth } = ENGINE;
  try {
    // Also starts the engine if the game came from a stored analysis without one.
    const branchEngine = await ensureEngine();
    const beforeResult = await branchEngine.evaluate(node.fenBefore, { depth, multiPv: 2 });
    const afterResult = node.liveTermination ? null : await branchEngine.evaluate(node.fenAfter, { depth, multiPv: 2 });
    applyBranchEvaluation(node, beforeResult, afterResult);
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Branch-Auswertung fehlgeschlagen:', err);
    return; // engine terminated/cancelled - node just stays uncategorized
  }

  if (currentNode === node) {
    evalBar.update(evalForNode(node));
    updateBestMoveArrow();
    if (pendingBadge && pendingBadge.square === node.to) pendingBadge.category = node.category;
    if (node.category) board.showBadge(node.to, node.category);
  }
  moveList.render(rootNode);
  moveList.setActive(currentNode);
}

function applyBranchEvaluation(node, beforeResult, afterResult) {
  const pv1 = beforeResult.lines.find((l) => l.multipv === 1) ?? beforeResult.lines[0];
  const pv2 = beforeResult.lines.find((l) => l.multipv === 2);
  const bestMoveUci = beforeResult.bestMoveUci;

  // pv1/pv2 are already expressed from the mover's own perspective (a UCI
  // engine's score is always relative to whoever is to move) - no White-
  // perspective conversion needed for the "before" side, matching
  // gameAnalyzer.js's own scoreWinPercent().
  const winPercentBeforeForMover = evalToWinPercent(pv1 ?? { cp: 0 });
  const winPercentBeforeForMoverRated = evalToWinPercentForRating(pv1 ?? { cp: 0 }, avgRating);

  const playedUci = node.from + node.to + (node.promotion ?? '');
  const isBestMove = playedUci === bestMoveUci;
  const isOnlyGoodMove = Boolean(
    pv2 && isBestMove && winPercentBeforeForMoverRated - evalToWinPercentForRating(pv2, avgRating) > 15
  );

  let evalAfterWhite;
  if (node.liveTermination?.type === 'checkmate') {
    evalAfterWhite = { mate: node.color === 'w' ? 1 : -1 };
  } else if (node.liveTermination) {
    evalAfterWhite = { cp: 0 };
  } else {
    const afterPv1 = afterResult.lines.find((l) => l.multipv === 1) ?? afterResult.lines[0];
    evalAfterWhite = toWhitePerspective(afterPv1, node.color === 'w' ? 'b' : 'w');
  }
  const winPercentAfterForMover =
    node.color === 'w' ? evalToWinPercent(evalAfterWhite) : 100 - evalToWinPercent(evalAfterWhite);
  const winPercentAfterForMoverRated =
    node.color === 'w'
      ? evalToWinPercentForRating(evalAfterWhite, avgRating)
      : 100 - evalToWinPercentForRating(evalAfterWhite, avgRating);

  const deltaW = computeDeltaW(winPercentBeforeForMover, winPercentAfterForMover);
  const deltaWRated = computeDeltaW(winPercentBeforeForMoverRated, winPercentAfterForMoverRated);
  const accuracy = moveAccuracyFromWinPercents(winPercentBeforeForMover, winPercentAfterForMover);

  const chessBefore = new Chess(node.fenBefore);
  const chessAfter = new Chess(node.fenAfter);
  const sacrifice = isSacrifice(chessBefore, chessAfter, node.color);
  const isForcedMove = chessBefore.in_check() && chessBefore.moves().length === 1;
  const evalBeforeCpForMover =
    pv1?.mate !== undefined ? (pv1.mate > 0 ? MATE_CP_EQUIVALENT : -MATE_CP_EQUIVALENT) : (pv1?.cp ?? 0);

  const { category } = classifyMove({
    isBookMove: false, // the opening-book tracker is inherently sequential from the game start along the main line - out of scope for an arbitrary branch
    isForcedMove,
    isBestMove,
    isOnlyGoodMove,
    isSacrifice: sacrifice,
    deltaW: deltaWRated,
    winPercentBeforeForMover: winPercentBeforeForMoverRated,
    winPercentAfterForMover: winPercentAfterForMoverRated,
    evalBeforeCpForMover,
    hadWinningTacticBefore: winPercentBeforeForMoverRated >= 90,
  });

  Object.assign(node, {
    evalBeforeWhite: toWhitePerspective(pv1, node.color),
    evalAfterWhite,
    winPercentBeforeForMover,
    winPercentAfterForMover,
    deltaW,
    accuracy,
    category,
    bestMoveSan: isBestMove ? null : bestMoveSanFor(node.fenBefore, bestMoveUci),
    bestMoveSquares: isBestMove ? null : squaresFromUci(bestMoveUci),
    nextBestMoveSquares: afterResult ? squaresFromUci(afterResult.bestMoveUci) : null,
  });
}

function stopAutoPlay() {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
    el('btn-play').textContent = '▶';
  }
}

loaderToggleBtn.addEventListener('click', () => {
  const collapsed = loaderPanel.classList.toggle('collapsed');
  loaderToggleBtn.textContent = collapsed ? '☰' : '✕';
});

// Nav buttons operate on whichever LINE is currently being viewed (the main
// line, or a variation) rather than always the main line: "first" always
// goes to the true start (root), but "last"/"next"/"prev" follow the current
// node's own parent/children[0] chain - so browsing/stepping through a
// variation works exactly like browsing the main line does.
function lastNodeOfCurrentLine() {
  let node = currentNode;
  while (node?.children[0]) node = node.children[0];
  return node;
}

el('btn-first').addEventListener('click', () => { stopAutoPlay(); goToNode(rootNode); });
el('btn-prev').addEventListener('click', () => { stopAutoPlay(); goToNode(currentNode?.parent ?? currentNode); });
el('btn-next').addEventListener('click', () => { stopAutoPlay(); goToNode(currentNode?.children[0] ?? currentNode); });
el('btn-last').addEventListener('click', () => { stopAutoPlay(); goToNode(lastNodeOfCurrentLine()); });
el('btn-flip').addEventListener('click', () => {
  board.flip();
  updateBoardPlayerLabels();
  updateMaterialDisplay();
  updatePlayerClocks();
});
el('btn-play').addEventListener('click', () => {
  if (autoPlayTimer) {
    stopAutoPlay();
    return;
  }
  el('btn-play').textContent = '⏸';
  autoPlayTimer = setInterval(() => {
    if (!currentNode?.children[0]) {
      stopAutoPlay();
      return;
    }
    goToNode(currentNode.children[0]);
  }, 900);
});

document.addEventListener('keydown', (e) => {
  if (!analysis || reviewPanel.classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') { stopAutoPlay(); goToNode(currentNode?.parent ?? currentNode); }
  if (e.key === 'ArrowRight') { stopAutoPlay(); goToNode(currentNode?.children[0] ?? currentNode); }
});

backToMainlineBtn.addEventListener('click', () => {
  // Navigates back but keeps the variation itself intact - distinct from
  // "Abzweigung entfernen" below, which actually deletes it.
  if (currentNode) goToNode(mainLineAncestor(currentNode));
});

/**
 * Deletes a whole variation (the branch `node` starts, and anything branched
 * off it in turn) from the tree. If the board was showing a position inside
 * it, jumps back to right where that variation started (its parent) first -
 * called from each variation row's own inline ✕ icon (scoped to that
 * specific row, wherever it is). The bottom button removes every variation
 * in the tree at once instead - see removeVariationBtn below.
 */
function deleteVariationAndNavigate(node) {
  if (!node?.parent) return;
  const parent = node.parent;
  const wasShowingDeletedBranch = currentNode && pathFromRoot(currentNode).includes(node);
  deleteVariation(node);
  if (wasShowingDeletedBranch) goToNode(parent);
  moveList.render(rootNode);
  moveList.setActive(currentNode);
}

// "Alle Abzweigungen entfernen" - a single variation's own ✕ icon already
// covers the one-at-a-time case, so this bulk button just clears the whole
// tree back to the main line in one step instead of repeated clicking.
removeVariationBtn.addEventListener('click', () => {
  if (!rootNode) return;
  const wasOnMainLine = Boolean(currentNode?.isMainLine);
  deleteAllVariations(rootNode);
  if (!wasOnMainLine) goToNode(mainLineAncestor(currentNode));
  moveList.render(rootNode);
  moveList.setActive(currentNode);
});

// ---------- Meta-Analyse and switching between the two areas ----------

const gamePickerEl = el('game-picker');
let metaScrollY = 0; // restored when switching back to the Meta-Analyse

/** The analyze button is shared: in game mode it analyzes the picked game,
 *  in meta mode it starts the Meta-Analyse run (js/meta/metaController.js). */
function updateAnalyzeButtonForMode() {
  if (isAnalyzing) return;
  if (appMode === 'meta') {
    const allDone = Boolean(meta?.hasData && meta.allAnalyzed);
    analyzeToggleBtn.disabled = !meta?.hasData || allDone;
    analyzeToggleBtn.title = allDone
      ? 'Alle gefilterten Partien sind schon analysiert'
      : 'Meta-Analyse starten: alle gefilterten Partien ohne Engine-Werte analysieren';
  } else {
    analyzeToggleBtn.disabled = games.length === 0;
    analyzeToggleBtn.title = 'Ausgewähltes Spiel analysieren';
  }
}

/** The top bar's mode tint (css/styles.css "Mode tint"): set at once on the
 *  first call, swept in from the right on every later mode change. */
function markModeInBar() {
  const prev = loaderPanel.dataset.mode;
  loaderPanel.dataset.mode = appMode;
  if (!prev || prev === appMode) {
    loaderPanel.dataset.prevMode = appMode;
    return;
  }
  loaderPanel.dataset.prevMode = prev;
  loaderPanel.classList.remove('mode-sweep');
  void loaderPanel.offsetWidth; // restart the animation on a quick switch back
  loaderPanel.classList.add('mode-sweep');
}

loaderPanel.addEventListener('animationend', (e) => {
  if (e.pseudoElement !== '::after') return;
  loaderPanel.classList.remove('mode-sweep');
  loaderPanel.dataset.prevMode = loaderPanel.dataset.mode;
});

function applyAppMode() {
  const isMeta = appMode === 'meta';
  markModeInBar();
  gamePickerEl.classList.toggle('hidden', isMeta);
  // Board color and piece style only matter next to a board.
  el('board-theme-picker').classList.toggle('hidden', isMeta);
  el('piece-theme-picker').classList.toggle('hidden', isMeta);
  // Same for the gear menu's board sounds and best-move arrow.
  el('settings-sound-row').classList.toggle('hidden', isMeta);
  el('settings-best-move-row').classList.toggle('hidden', isMeta);
  meta.setActive(isMeta);
  el('game-empty').classList.toggle('hidden', isMeta || Boolean(analysis));
  if (isMeta) {
    reviewPanel.classList.add('hidden');
    // The mobile "filters collapsed" state only makes sense next to a board.
    loaderPanel.classList.remove('collapsed');
    loaderToggleBtn.classList.add('hidden');
  } else if (analysis) {
    reviewPanel.classList.remove('hidden');
    syncBoardRowLayout();
  }
  updateAnalyzeButtonForMode();
  // No empty landing page: the last user's games (and with them the stored
  // analyses) load right away, under the current filters.
  if (isMeta && !meta.hasData && usernameInput.value.trim() && !fetchGamesAbortController) fetchGamesBtn.click();
}

/** @returns {boolean} false if refused (something is still running). */
function switchAppMode(mode) {
  if (mode === appMode) return true;
  if (isAnalyzing || meta.isRunning || fetchGamesAbortController) {
    showToast('Bitte erst die laufende Analyse bzw. das Laden abwarten oder abbrechen.', 'info');
    return false;
  }
  if (appMode === 'meta') metaScrollY = window.scrollY;
  appMode = mode;
  saveAppMode(mode);
  applyAppMode();
  if (mode === 'meta') requestAnimationFrame(() => window.scrollTo(0, metaScrollY));
  return true;
}

meta = initMetaMode({
  getFilters: () => ({
    ...currentDateBounds(),
    timeClasses: selectedGameTypes,
    outcomes: selectedOutcomes,
    colors: selectedColors,
  }),
  getEngineSettings: engineSettings,
  setBusy: (busy) => {
    setAnalyzing(busy);
    fetchGamesBtn.disabled = busy;
    usernameInput.disabled = busy;
    if (busy) analyzeToggleBtn.title = 'Meta-Analyse abbrechen';
    else updateAnalyzeButtonForMode();
  },
  setRunProgress: (fraction) => setAnalyzeProgress(fraction),
  onCoverageChange: () => updateAnalyzeButtonForMode(),
});

initBoardThemePicker();
initPieceThemePicker(board);
const settingsPanel = initSettingsPanel({
  appMode,
  onAppModeChange: (mode) => switchAppMode(mode),
  soundEnabled: loadSoundEnabled(),
  bestMoveTiming,
  onSoundChange: (enabled) => {
    setSoundEnabled(enabled);
    saveSoundEnabled(enabled);
  },
  onBestMoveTimingChange: (timing) => {
    bestMoveTiming = timing;
    saveBestMoveTiming(timing);
    updateBestMoveArrow();
  },
});

// Restores whichever area was open last (gear menu "Modus").
applyAppMode();
if (deepLink) openDeepLinkedGame(deepLink);

/** Loads just the linked game into the picker and analyzes it - from the stored analysis if there is one. */
async function openDeepLinkedGame({ user, game, end }) {
  try {
    const [raw] = await Promise.all([fetchGame(user, game, end), syncAutoAnalysis(user)]);
    if (!raw) throw new Error('Die Partie wurde bei Chess.com nicht gefunden.');
    games = [summarizeGame(raw)];
    gameSelect.setOptions(buildGameOptions(games, user), '0');
    gameSelect.disabled = false;
    analyzeToggleBtn.disabled = false;
    refreshAnalyzedMarkers();
    analysisRun = startAnalysis();
  } catch (err) {
    showToast(err.message ?? 'Die Partie konnte nicht geladen werden.', 'error');
  }
}
