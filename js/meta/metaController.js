// The Meta-Analyse mode: loads many games at once, analyzes them one after
// another with Stockfish, and shows aggregated statistics (js/meta/metaView.js).
// Shares the top bar with the single-game mode - js/main.js owns those
// controls and hands their current state in through the callbacks passed to
// initMetaMode(); only the opponent picker (in the game picker's slot) and
// #meta-panel below the bar belong to this module.

import { PLATFORMS, platformOfUrl } from '../api/platform.js';
import { StockfishEngine } from '../engine/stockfishEngine.js';
import { analyzeGame } from '../analysis/gameAnalyzer.js';
import { showToast } from '../ui/toast.js';
import { flagHtml } from '../ui/playerLabel.js';
import { timeClassStyle } from '../timeClassStyle.js';

// The status line's game-type counts, in the Spielart dropdown's order.
// Phones - the same breakpoint as css/styles.css "PHONES".
const PHONE_QUERY = '(max-width: 640px)';
const TYPE_ORDER = [['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid'], ['daily', 'Daily']];
import { buildFastRecord, buildEngineRecord, isCoachGame, hasMoves, gameOpenState } from './metaRecords.js';
import { loadEngineRecords, saveEngineRecord, loadCountries, saveCountries } from './metaStore.js';
import { META_TABS, renderMetaTab, gameListHtml, gameHintHtml, gameListById, LISTED_GAMES_STEP, GAMES_STEP, layoutFitCharts, resetZooms } from './metaView.js';
import { openingBoardHtml } from './openingBoard.js';
import { mateBoardHtml } from './mateBoard.js';
import { tabPieceSvg } from './tabPieces.js';
import { syncAutoAnalysis } from './autoAnalysis.js';
import { recordingEngine } from '../analysis/evalLog.js';
import { loadMetaTab, saveMetaTab, loadCountryLimit, saveCountryLimit, loadHeatmap, saveHeatmap } from '../persistence.js';

const COUNTRY_FETCH_CONCURRENCY = 3;
const RERENDER_EVERY_MS = 2500;

const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const OUTCOME_BY_RESULT = { W: 'win', D: 'draw', L: 'loss' };
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {{
 *   getFilters: () => {from: Date|null, to: Date|null, timeClasses: Set<string>, outcomes: Set<string>, colors: Set<string>},
 *   getEngineSettings: () => {engineId: string, depth: number, label: string},
 *   setBusy: (busy: boolean) => void,
 *   setRunProgress: (fraction: number) => void,
 *   onCoverageChange: () => void,
 * }} host
 */
export function initMetaMode(host) {
  const panelEl = el('meta-panel');
  const emptyEl = el('meta-empty');
  const contentEl = el('meta-content');
  const statusEl = el('meta-status-text');
  const typesEl = el('meta-status-types');
  const tabsEl = el('meta-tabs');
  const tabPieceEl = el('meta-tabs-piece');
  const tabPanelEl = el('meta-tabpanel');
  const tipEl = el('meta-tip');
  const gamesPopEl = el('meta-games-pop');
  const progress = {
    root: el('meta-progress'),
    title: el('meta-progress-title'),
    line: el('meta-progress-line'),
    pct: el('meta-progress-pct'),
    eta: el('meta-progress-eta'),
    bar: el('meta-progress-bar'),
    steps: el('meta-progress-steps'),
    gameBar: el('meta-progress-game-bar'),
    pauseBtn: el('meta-pause-btn'),
    cancelBtn: el('meta-cancel-btn'),
    confirm: el('meta-cancel-confirm'),
    confirmText: el('meta-cancel-confirm-text'),
    keepBtn: el('meta-cancel-keep-btn'),
    stopBtn: el('meta-cancel-stop-btn'),
  };
  const oppPicker = el('opponent-picker');
  const oppBtn = el('opponent-btn');
  const oppBtnLabel = el('opponent-btn-label');
  const oppMenu = el('opponent-menu');

  let active = false;
  let username = '';
  let site = 'chesscom'; // the site the loaded games come from - never mixed (js/api/platform.js)
  // IndexedDB's country cache: Chess.com names as they are, Lichess ones prefixed.
  const countryKey = (name) => (site === 'chesscom' ? name : `${site}:${name}`);
  let records = []; // fast records of every loaded game, newest first
  let loadedFrom = null; // the time filter's lower bound when these games were loaded (null = all time)
  let engineCache = new Map(); // url -> engine record, for the CURRENT engine + depth
  let engineCacheKey = '';
  const countries = new Map(); // lowercased opponent -> country code|null
  let countryJob = { generation: 0, done: 0, total: 0, running: false };
  let opponent = null; // lowercased opponent name, or null = all
  let tab = loadMetaTab() ?? 'overview';
  let marked = null; // urls of a streak opened from the overview, highlighted in the "Partien" tab (showStreak)
  // Sorted column per sortable table (metaView's sortHead) - Eröffnungen, Quote nach Land, Partien.
  const sorts = { openings: { key: 'games', dir: 'desc' }, countries: { key: 'score', dir: 'desc' }, games: { key: 'date', dir: 'desc' } };
  let gamesShown = GAMES_STEP; // rows of the "Partien" table - grows by GAMES_STEP per "weitere laden", back to it on a new sort or tab
  if (!META_TABS.some((t) => t.id === tab)) tab = 'overview';
  let countryLimit = loadCountryLimit() ?? 25; // rows in the two country cards (metaView's limitPicker), 0 = all
  let countrySearch = ''; // search text of "Woher kommen deine Gegner?" (metaView's data-country-search)
  let gameSearch = ''; // opponent search of the "Partien" tab (metaView's data-game-search)
  let openingSearch = { w: '', b: '' }; // "Eröffnungen": search per color card (metaView's data-opening-search)
  const openingOpen = new Set(); // "Eröffnungen": keys of the opened tree nodes (metaView's data-otree)
  // Endings chosen above "Längste Partien" / "Kürzeste Partien" (metaView's endingPicker), empty = all.
  const endings = { longest: new Set(), shortest: new Set(['checkmate']) };
  // Heatmap tab: whose captured pieces ('lost' = own, 'taken' = the opponent's)
  // and which piece types - own and the opponent's (none = all).
  const heatmap = loadHeatmap();
  let mateHeat = 'set'; // "Matt" tab's king board: 'set' (their king) or 'taken' (yours) - metaView's data-mate-heat
  let run = null; // the running analysis, see startRun()
  let engine = null;
  let engineLoadedId = null;
  let renderTimer = null;
  let lastRender = 0;

  // ---------- filtering ----------

  /** Still without engine values although it could have them (see hasMoves). */
  const needsEngine = (r) => hasMoves(r) && !engineCache.has(r.url);

  function matchesFilters(r, f, { ignoreOpponent = false } = {}) {
    if (f.from && r.endTime < +f.from) return false;
    if (f.to && r.endTime > +f.to) return false;
    if (!f.timeClasses.has(r.timeClass)) return false;
    if (!f.outcomes.has(OUTCOME_BY_RESULT[r.result])) return false;
    if (!f.colors.has(r.color)) return false;
    if (!ignoreOpponent && opponent && r.opponent.toLowerCase() !== opponent) return false;
    return true;
  }

  function filtered(opts) {
    const f = host.getFilters();
    return records.filter((r) => matchesFilters(r, f, opts));
  }

  // ---------- rendering ----------

  function ctx() {
    const { label } = host.getEngineSettings();
    return {
      engineOf: (r) => engineCache.get(r.url) ?? null,
      marked,
      // 'running' / 'queued' while the run still has the game ahead of it, else null.
      queueState: (r) => {
        const i = run ? run.targets.indexOf(r) : -1;
        return i < 0 || i < run.index ? null : i === run.index ? 'running' : 'queued';
      },
      // "XX" is Chess.com's "International" - no real country to count.
      countryOf: (name) => {
        const code = countries.get(name.toLowerCase());
        return code && code !== 'XX' ? code : null;
      },
      opponent,
      filterTo: host.getFilters().to, // the time filter's upper bound (null = up to now)
      sorts,
      gamesShown,
      countryLimit,
      countrySearch,
      gameSearch,
      openingSearch,
      openingOpen,
      endings,
      heatmap,
      mateHeat,
      username,
      engineLabel: label,
      countriesPending: countryJob.running,
      countriesDone: countryJob.done,
      countriesTotal: countryJob.total,
    };
  }

  /** Status line + tabs stick under the top filter bar (css/styles.css .meta-sticky):
   *  hidden while scrolling down, back on the first scroll up - long tabs keep
   *  the other tabs one flick away. Only once actually stuck: in their normal
   *  place they never slide away. */
  function initStickyTabs() {
    const wrap = el('meta-sticky');
    const bar = document.getElementById('loader-panel');
    const before = el('meta-sticky-mark'); // zero-height, right above - the head's normal place
    // Exact height - offsetHeight rounds (43.5 → 44) and left a hairline gap under the bar.
    const setBarH = () => wrap.style.setProperty('--bar-h', `${bar.getBoundingClientRect().height}px`);
    setBarH();
    new ResizeObserver(setBarH).observe(bar);
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const stuck = before.getBoundingClientRect().bottom < bar.offsetHeight;
      if (!stuck || y < lastY - 2) wrap.classList.remove('tabs-away');
      else if (y > lastY + 2) wrap.classList.add('tabs-away');
      if (Math.abs(y - lastY) > 2) lastY = y;
    }, { passive: true });
  }
  initStickyTabs();

  // Phones: the filters sit in a panel under the top bar, opened by #filter-toggle-btn
  // (css/styles.css "Mobile filter panel"). It closes again after "Spiele laden"
  // and on a tab change.
  const loaderPanelEl = document.getElementById('loader-panel');
  const filterBtn = el('filter-toggle-btn');
  const filterCountEl = el('filter-toggle-count');
  function setFiltersOpen(open) {
    loaderPanelEl.classList.toggle('filters-open', open);
    filterBtn.setAttribute('aria-expanded', String(open));
  }
  filterBtn.addEventListener('click', () => setFiltersOpen(!loaderPanelEl.classList.contains('filters-open')));
  el('fetch-games-btn').addEventListener('click', () => setFiltersOpen(false));

  /** How many filters differ from "everything": time range, game types, results, colors, opponent. */
  function updateFilterCount(f) {
    const n = [
      f.from != null || f.to != null,
      f.timeClasses.size < TYPE_ORDER.length,
      f.outcomes.size < 3,
      f.colors.size < 2,
      Boolean(opponent),
    ].filter(Boolean).length;
    filterCountEl.textContent = String(n);
    filterCountEl.classList.toggle('hidden', !n);
    filterBtn.title = n ? `Filter (${n} aktiv)` : 'Filter';
  }

  /** fromTab: the tab just left - the tab piece can animate the change (tabPieceSvg). */
  function renderTabs(fromTab = null) {
    tabsEl.innerHTML = META_TABS.map(
      (t) => `<button type="button" role="tab" class="meta-tab" data-tab="${t.id}" aria-selected="${t.id === tab}"${t.tip ? ` title="${t.tip}"` : ''}>${t.label}</button>`
    ).join('');
    // The line under the tabs draws the tab's piece (css/styles.css .meta-tabs-wrap).
    const piece = tabPieceSvg(tab, fromTab);
    tabPieceEl.setAttribute('viewBox', `0 0 ${piece.width} ${piece.height}`);
    tabPieceEl.setAttribute('width', piece.width);
    tabPieceEl.setAttribute('height', piece.height);
    tabPieceEl.innerHTML = piece.body;
    tabPieceEl.parentElement.style.setProperty('--piece-w', `${piece.width}px`);
    tabPieceEl.parentElement.classList.toggle('all-pieces', piece.all); // needs more room - hidden earlier on narrow screens
    // Phones swipe the tab strip - keep the current tab in view.
    if (window.matchMedia(PHONE_QUERY).matches) tabsEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function render() {
    clearTimeout(renderTimer);
    renderTimer = null;
    lastRender = Date.now();
    renderOpponentButton();
    if (!active) return;
    const hasData = records.length > 0;
    emptyEl.classList.toggle('hidden', hasData);
    contentEl.classList.toggle('hidden', !hasData);
    if (!hasData) return;
    const rs = filtered();
    renderStatus(rs);
    closeGamesPop(); // its count button is about to be replaced
    hideTip(); // ... and so is the element a tooltip belongs to
    // The search fields re-render on every keystroke (and countries keep
    // arriving while typing) - keep focus and cursor across the new HTML.
    const focused = document.activeElement;
    const searchSel = ['[data-country-search]', '[data-game-search]', '[data-opening-search="w"]', '[data-opening-search="b"]'].find((s) => focused?.matches?.(s));
    const caret = searchSel ? focused.selectionStart : null;
    tabPanelEl.innerHTML = renderMetaTab(tab, rs, ctx());
    if (caret != null) {
      const input = tabPanelEl.querySelector(searchSel);
      input?.focus();
      input?.setSelectionRange(caret, caret);
    }
    layoutFitCharts(tabPanelEl);
    host.onCoverageChange(); // the analyze button greys out once nothing is left to analyze
  }

  /** Coalesces the many small updates during a run (countries arriving,
   *  games finishing) into at most one re-render every few seconds. */
  function scheduleRender() {
    if (renderTimer) return;
    const wait = Math.max(0, RERENDER_EVERY_MS - (Date.now() - lastRender));
    renderTimer = setTimeout(render, wait);
  }

  function renderStatus(rs) {
    const { label } = host.getEngineSettings();
    const have = rs.filter((r) => engineCache.has(r.url)).length;
    const missing = rs.filter(needsEngine).length;
    const f = host.getFilters();
    updateFilterCount(f);
    const wider = records.length && (f.from == null ? loadedFrom != null : loadedFrom != null && +f.from < +loadedFrom);
    // One set of facts, said twice: in full (desktop) and as just the counts
    // (phones, css/styles.css .meta-status-short: "411/411 Partien · [404/411] Engine").
    const total = have + missing;
    // Games without a single move (hasMoves) can't be analyzed - they count among
    // the loaded/filtered games but not in the engine total, so the two numbers differ.
    const noMoves = rs.length - total;
    const noMovesTip = noMoves
      ? ` title="${noMoves === 1 ? '1 dieser Partien enthält' : `${noMoves} dieser Partien enthalten`} keine Züge (vor dem ersten Zug beendet) und ${noMoves === 1 ? 'kann' : 'können'} nicht analysiert werden. Deshalb ${noMoves === 1 ? 'zählt sie' : 'zählen sie'} bei den Engine-Werten nicht mit: ${total} statt ${rs.length} Partien."`
      : '';
    // Colored at a glance: all analyzed (full), some (part), none (none) - css/styles.css .meta-cov.
    const state = !missing ? 'full' : have ? 'part' : 'none';
    const coverage = `${esc(label)}: ${have} von ${total} Partien mit Engine-Werten`;
    const hint = !missing ? 'Alles analysiert.' : have ? `Die Lupe analysiert die ${missing} fehlenden.` : 'Tabs ohne Engine sind trotzdem fertig.';
    const olderMissing = 'Der Zeitraum reicht weiter zurück als die geladenen Partien – „Spiele laden“ holt die älteren.';
    const long = [
      rs.length ? `<span${noMovesTip}><b>${rs.length}</b> von ${records.length} geladenen Partien passen zu den Filtern.</span>` : `Keine der ${records.length} geladenen Partien passt zu den Filtern.`,
      rs.length ? `<b>${esc(label)}</b>: <span class="meta-cov ${state}"${noMovesTip}>${have} von ${total} Partien</span> mit Engine-Werten. ${hint}` : '',
      wider ? `<span class="meta-warn">${olderMissing}</span>` : '',
    ];
    const short = [
      `<span${noMovesTip}><b>${rs.length}</b>/${records.length} Partien</span>`,
      rs.length ? `<span class="meta-cov ${state}" title="${coverage}${noMovesTip ? ` – ${noMoves} ohne Züge zählen nicht mit` : ''}">${have}/${total}</span> Engine` : '',
      wider ? `<span class="meta-warn" title="${olderMissing}">ältere fehlen</span>` : '',
    ];
    statusEl.innerHTML = `<span class="meta-status-long">${long.filter(Boolean).join(' ')}</span><span class="meta-status-short">${short.filter(Boolean).join(' · ')}</span>`;
    // Right-aligned: all loaded games per game type (not just the filtered ones).
    typesEl.innerHTML = TYPE_ORDER.map(([tc, label]) => {
      const n = records.filter((r) => r.timeClass === tc).length;
      return n ? `<b style="color:${timeClassStyle(tc).color}" title="${n} ${label}-Partien geladen">${n}</b>` : '';
    }).filter(Boolean).join('<span class="meta-status-dot">·</span>');
  }

  /** Leaving a tab empties its search fields and resets its charts' zoom: every tab starts with the full list again. */
  function clearSearches() {
    countrySearch = '';
    gameSearch = '';
    openingSearch = { w: '', b: '' };
    resetZooms();
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    marked = null;
    gamesShown = GAMES_STEP;
    clearSearches();
    setFiltersOpen(false);
    const fromTab = tab;
    tab = b.dataset.tab;
    saveMetaTab(tab);
    renderTabs(fromTab);
    render();
    // A new tab always starts at its top - not wherever the last one was scrolled to.
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  /** The overview's longest-streak counts: the "Partien" tab, newest first, with the
   *  streak marked and scrolled to its first game - the bottom row of the block, so the rest shows above it. */
  function showStreak(games) {
    if (!games.length) return;
    marked = new Set(games.map((r) => r.url));
    clearSearches(); // a leftover opponent search could hide the streak's games
    tab = 'games';
    saveMetaTab(tab);
    sorts.games = { key: 'date', dir: 'desc' };
    renderTabs();
    render();
    tabPanelEl.querySelector(`tr[data-game="${CSS.escape(games[0].url)}"]`)?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  // ---------- game list behind a clickable count (metaView's gamesCount) ----------

  function closeGamesPop() {
    gamesPopEl.classList.add('hidden');
  }

  function openGamesPop(btn) {
    gamesPopEl.innerHTML = gameListHtml(gameListById(btn.dataset.games), LISTED_GAMES_STEP);
    gamesPopEl.dataset.for = btn.dataset.games; // a second click on the same count closes it
    gamesPopEl.dataset.shown = String(LISTED_GAMES_STEP);
    placePop(btn.getBoundingClientRect());
  }

  /** Shows #meta-games-pop under `rect` (a viewport rect), shifted left /
   *  flipped above where it wouldn't fit. */
  function placePop(rect) {
    gamesPopEl.classList.remove('hidden');
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - gamesPopEl.offsetWidth - 8));
    const below = rect.bottom + 4;
    const top = below + gamesPopEl.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - gamesPopEl.offsetHeight - 4) : below;
    gamesPopEl.style.left = `${left}px`;
    gamesPopEl.style.top = `${top}px`;
  }

  gamesPopEl.addEventListener('click', (e) => {
    // "+ 10 weitere": the next games below, the box keeps its height and scrolls.
    if (e.target.closest('[data-more]')) {
      e.stopPropagation(); // the button is replaced below - the document's outside-click check would close the list
      const list = gameListById(gamesPopEl.dataset.for);
      if (!list.length) return closeGamesPop();
      const scroll = gamesPopEl.querySelector('.meta-pop-list')?.scrollTop ?? 0;
      const shown = Number(gamesPopEl.dataset.shown) + LISTED_GAMES_STEP;
      gamesPopEl.dataset.shown = String(shown);
      gamesPopEl.innerHTML = gameListHtml(list, shown);
      const box = gamesPopEl.querySelector('.meta-pop-list');
      box.scrollTop = scroll;
      box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
      return;
    }
    // The hint's "Analysieren" (gameHintHtml): queue the game, like the magnifier in the "Partien" tab.
    const hintBtn = e.target.closest('[data-hint-analyze]');
    if (hintBtn) {
      enqueueGame(hintBtn.dataset.hintAnalyze);
      closeGamesPop();
      return;
    }
    const item = e.target.closest('[data-game]');
    if (!item) return;
    const rect = item.getBoundingClientRect(); // a hint takes the list's place
    closeGamesPop();
    openGame(item.dataset.game, rect);
  });
  document.addEventListener('click', (e) => {
    // A click on a game may just have opened the hint (openGame) - it stays.
    if (!gamesPopEl.contains(e.target) && !e.target.closest('.meta-count, [data-game]')) closeGamesPop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGamesPop();
  });
  window.addEventListener('scroll', closeGamesPop, { passive: true });
  window.addEventListener('resize', closeGamesPop);
  // Charts drawn at their box's pixel size (metaView's fitChart) follow it.
  let fitFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => active && layoutFitCharts(tabPanelEl));
  });

  tabPanelEl.addEventListener('click', (e) => {
    if (e.metaTipOnly) return; // a first tap that just showed a tooltip (touch, see below)
    const streakBtn = e.target.closest('[data-streak]');
    if (streakBtn) {
      showStreak(gameListById(streakBtn.dataset.streak));
      return;
    }
    const countBtn = e.target.closest('.meta-count');
    if (countBtn) {
      const isOpenHere = !gamesPopEl.classList.contains('hidden') && gamesPopEl.dataset.for === countBtn.dataset.games;
      if (isOpenHere) closeGamesPop();
      else openGamesPop(countBtn);
      return;
    }
    // "Eröffnungen": a tree node's toggle opens or closes it.
    const otreeBtn = e.target.closest('[data-otree]');
    if (otreeBtn) {
      const key = otreeBtn.dataset.otree;
      if (!openingOpen.delete(key)) openingOpen.add(key);
      render();
      return;
    }
    // Sortable column head: first click sorts descending, a second one flips.
    const sortTh = e.target.closest('th[data-sort]');
    if (sortTh) {
      const { sortTable, sort: key } = sortTh.dataset;
      const current = sorts[sortTable];
      sorts[sortTable] = { key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' };
      if (sortTable === 'games') gamesShown = GAMES_STEP;
      render();
      return;
    }
    // Under the "Partien" table: the next GAMES_STEP games in the same sorting; the scroll position stays.
    const gamesMoreBtn = e.target.closest('[data-games-more]');
    if (gamesMoreBtn) {
      gamesShown = Number(gamesMoreBtn.dataset.gamesMore) + GAMES_STEP;
      render();
      return;
    }
    const limitBtn = e.target.closest('[data-country-limit]');
    if (limitBtn) {
      countryLimit = Number(limitBtn.dataset.countryLimit);
      saveCountryLimit(countryLimit);
      render();
      return;
    }
    const mateHeatBtn = e.target.closest('[data-mate-heat]');
    if (mateHeatBtn) {
      mateHeat = mateHeatBtn.dataset.mateHeat;
      render();
      return;
    }
    const heatBtn = e.target.closest('[data-heat-mode], [data-heat-piece], [data-heat-measure]');
    if (heatBtn) {
      if (heatBtn.dataset.heatMode) heatmap.mode = heatBtn.dataset.heatMode;
      else if (heatBtn.dataset.heatMeasure) heatmap.measure = heatBtn.dataset.heatMeasure;
      else {
        const p = heatBtn.dataset.heatPiece;
        const key = heatBtn.dataset.heatSide === 'opp' ? 'oppPieces' : 'pieces';
        heatmap[key] = heatmap[key].includes(p) ? heatmap[key].filter((x) => x !== p) : [...heatmap[key], p];
      }
      saveHeatmap(heatmap);
      render();
      return;
    }
    const endingBtn = e.target.closest('[data-ending]');
    if (endingBtn) {
      const chosen = endings[endingBtn.dataset.endingTable];
      const key = endingBtn.dataset.ending;
      if (chosen.has(key)) chosen.delete(key);
      else chosen.add(key);
      render();
      return;
    }
    const analyzeBtn = e.target.closest('[data-analyze]');
    if (analyzeBtn) {
      enqueueGame(analyzeBtn.dataset.analyze);
      return;
    }
    const unqueueBtn = e.target.closest('[data-unqueue]');
    if (unqueueBtn) {
      dequeueGame(unqueueBtn.dataset.unqueue);
      return;
    }
    const gameRow = e.target.closest('tr[data-game]');
    if (gameRow) {
      // A hint (openGame) appears under the clicked cell, not at the far left of a wide row.
      openGame(gameRow.dataset.game, (e.target.closest('td') ?? gameRow).getBoundingClientRect());
      return;
    }
    const oppRow = e.target.closest('tr[data-opp]');
    if (oppRow) setOpponent(oppRow.dataset.opp.toLowerCase());
  });

  // "Woher kommen deine Gegner?": search text narrows the countries on every keystroke.
  // Phones: the "Partien" sorting as one select (metaView's gamesSortSelect) instead of the table head.
  tabPanelEl.addEventListener('change', (e) => {
    if (!e.target.matches('[data-games-sort]')) return;
    const [key, dir] = e.target.value.split(':');
    sorts.games = { key, dir };
    gamesShown = GAMES_STEP;
    render();
  });

  // "Partien": the opponent search, the table starts again at its first rows.
  tabPanelEl.addEventListener('input', (e) => {
    if (e.target.matches('[data-country-search]')) countrySearch = e.target.value;
    else if (e.target.matches('[data-opening-search]')) openingSearch = { ...openingSearch, [e.target.dataset.openingSearch]: e.target.value };
    else if (e.target.matches('[data-game-search]')) {
      gameSearch = e.target.value;
      gamesShown = GAMES_STEP;
    } else return;
    render();
  });

  // Shared tooltip for every chart mark carrying data-tip, and for opening
  // names (data-opening) and checkmate patterns (data-mate), which get a small board.
  let tipSource = null;
  const TIP_SEL = '[data-opening], [data-mate], [data-tip]';
  function hideTip() {
    tipEl.classList.add('hidden');
    tipSource = null;
  }
  /** Shows the tooltip of `t` near the point (x, y) - beside the mouse, or under a tapped element. */
  function showTip(t, x0, y0) {
    if (t !== tipSource) {
      tipSource = t;
      const board = t.dataset.opening ? openingBoardHtml(t.dataset.opening, t.dataset.variants, t.dataset.line) : t.dataset.mate ? mateBoardHtml(t.dataset.mate) : null;
      tipEl.classList.toggle('board', Boolean(board));
      if (board) tipEl.innerHTML = board;
      // Plain text, except **...** in a data-tip, which is shown bold.
      else tipEl.innerHTML = esc(t.getAttribute('data-tip') ?? t.dataset.opening).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    }
    tipEl.classList.remove('hidden');
    const x = Math.max(8, Math.min(x0 + 12, window.innerWidth - tipEl.offsetWidth - 8));
    const below = y0 + 14;
    const y = below + tipEl.offsetHeight > window.innerHeight - 8 ? Math.max(8, y0 - tipEl.offsetHeight - 10) : below;
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  }
  // Touch screens have no hover (and send a fake mousemove before each tap) - they get the tap below instead.
  const touchOnly = window.matchMedia('(hover: none)');
  tabPanelEl.addEventListener('mousemove', (e) => {
    if (touchOnly.matches) return;
    const t = e.target.closest(TIP_SEL);
    if (t) showTip(t, e.clientX, e.clientY);
    else hideTip();
  });
  tabPanelEl.addEventListener('mouseleave', () => {
    if (!touchOnly.matches) hideTip();
  });
  // Touch: the first tap on an element with a tooltip shows it (the row it sits in
  // doesn't open); a second tap on it does what a click does. Taps on counts, the
  // magnifier and other controls act at once; taps elsewhere close the tooltip.
  tabPanelEl.addEventListener('click', (e) => {
    if (!touchOnly.matches) return;
    const t = e.target.closest(TIP_SEL);
    if (!t || e.target.closest('button, input, select, a, .meta-count, th[data-sort]')) {
      hideTip();
      return;
    }
    if (t === tipSource && !tipEl.classList.contains('hidden')) {
      hideTip();
      return; // second tap - the normal click handlers take it from here
    }
    e.preventDefault();
    e.metaTipOnly = true; // the panel's click handler skips its action; document-level "click outside" closers still run
    const r = t.getBoundingClientRect();
    showTip(t, r.left, r.bottom - 8);
  }, true);
  window.addEventListener('scroll', () => {
    if (touchOnly.matches) hideTip();
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (touchOnly.matches && !tabPanelEl.contains(e.target)) hideTip();
  });

  // ---------- opponent picker (in the top bar, where single-game mode has its game picker) ----------

  function renderOpponentButton() {
    oppBtn.disabled = records.length === 0 || Boolean(run);
    if (!records.length) {
      oppBtnLabel.textContent = 'Erst Spiele laden…';
      return;
    }
    const base = filtered({ ignoreOpponent: true });
    if (!opponent) {
      // Icon and text apart - phones show just the icon while no opponent is picked (css/styles.css "PHONES").
      oppBtnLabel.innerHTML = `<span class="opp-ico">👥</span><span class="opp-all"> Alle Gegner · ${base.length} Partien</span>`;
      return;
    }
    const mine = base.filter((r) => r.opponent.toLowerCase() === opponent);
    const name = mine[0]?.opponent ?? records.find((r) => r.opponent.toLowerCase() === opponent)?.opponent ?? opponent;
    oppBtnLabel.innerHTML = `<span class="opp-ico">⚔️</span> <span class="opp-name">${esc(name)}</span><span class="opp-count"> · ${mine.length} Partien</span>`;
  }

  function closeOpponentMenu() {
    oppMenu.classList.add('hidden');
  }

  function openOpponentMenu() {
    const counts = new Map();
    for (const r of filtered({ ignoreOpponent: true })) {
      const k = r.opponent.toLowerCase();
      const entry = counts.get(k) ?? { name: r.opponent, n: 0 };
      entry.n++;
      counts.set(k, entry);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
    const option = (key, html, extraClass = '') =>
      `<button type="button" class="custom-select-option ${extraClass}${key === (opponent ?? '') ? ' custom-select-option-selected' : ''}" data-opp-key="${esc(key)}">${html}</button>`;
    oppMenu.innerHTML = `<input type="search" class="meta-opp-search" placeholder="Gegner suchen …" aria-label="Gegner suchen">
      <div class="meta-opp-list">
        ${option('', '👥 Alle Gegner')}
        ${rows
          .map(([key, x]) => {
            const flag = flagHtml(countries.get(key) ?? null).trim();
            return option(key, `<span class="meta-opp-name">${flag}${esc(x.name)}</span><span class="meta-opp-count">${x.n} ${x.n === 1 ? 'Partie' : 'Partien'}</span>`, 'meta-opp-option');
          })
          .join('')}
      </div>`;
    const rect = oppBtn.getBoundingClientRect();
    oppMenu.style.position = 'fixed';
    oppMenu.style.top = `${rect.bottom + 4}px`;
    oppMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 328))}px`;
    oppMenu.classList.remove('hidden');
    const search = oppMenu.querySelector('input');
    search.focus();
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const b of oppMenu.querySelectorAll('[data-opp-key]')) {
        b.classList.toggle('hidden', Boolean(q) && !b.dataset.oppKey.includes(q));
      }
    });
  }

  oppBtn.addEventListener('click', () => {
    if (oppMenu.classList.contains('hidden')) openOpponentMenu();
    else closeOpponentMenu();
  });
  oppMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opp-key]');
    if (!b) return;
    closeOpponentMenu();
    setOpponent(b.dataset.oppKey || null);
  });
  document.addEventListener('click', (e) => {
    if (!oppPicker.contains(e.target)) closeOpponentMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOpponentMenu();
  });

  function setOpponent(key) {
    opponent = key;
    render();
  }

  // ---------- loading ----------

  async function setRecordsFrom(rawGames, user, from) {
    username = user;
    loadedFrom = from;
    const newSite = platformOfUrl(rawGames[0]?.url);
    if (newSite !== site) countries.clear(); // the same name is someone else on the other site
    site = newSite;
    opponent = null;
    const built = [];
    for (let i = 0; i < rawGames.length; i++) {
      const rec = buildFastRecord(rawGames[i], user);
      if (rec && !isCoachGame(rec)) built.push(rec);
      if (i % 40 === 39) await yieldToUi(); // PGN parsing - keep the page responsive for big loads
    }
    built.sort((a, b) => b.endTime - a.endTime);
    // Rating change per game: Chess.com only stores the rating after a game, so it's
    // the difference to the previous rated game of the same type (null for the first loaded one).
    const lastRating = new Map();
    for (let i = built.length - 1; i >= 0; i--) {
      const r = built[i];
      if (!r.rated || r.ownRating == null) continue;
      const prev = lastRating.get(r.timeClass);
      r.ratingDelta = prev == null ? null : r.ownRating - prev;
      lastRating.set(r.timeClass, r.ownRating);
    }
    records = built;
    await reloadEngineCache();
    render();
    loadCountriesInBackground();
    syncServerAnalysis(user);
  }

  /** Merges the player's analyses from the GitHub job (js/meta/autoAnalysis.js)
   *  into IndexedDB and shows them. Silent when there are none. */
  async function syncServerAnalysis(user) {
    const result = await syncAutoAnalysis(user);
    if (!result) return;
    const newCountries = result.countries.filter(([k]) => !countries.has(k.toLowerCase()));
    for (const [k, v] of newCountries) countries.set(k.toLowerCase(), v);
    await saveCountries(newCountries.map(([k, v]) => [countryKey(k), v]));
    if (!result.added) return;
    if (username !== user || run) return; // another player loaded meanwhile, or a run owns the cache
    await reloadEngineCache();
    render();
    const current = host.getEngineSettings();
    const hint = current.engineId === result.engineId && current.depth === result.depth ? '' : ` Zu sehen mit ${result.label}.`;
    showToast(`${result.added} Partien aus der automatischen Analyse übernommen.${hint}`, 'success');
  }

  async function reloadEngineCache() {
    const { engineId, depth } = host.getEngineSettings();
    engineCacheKey = `${engineId}|${depth}`;
    engineCache = await loadEngineRecords(engineId, depth, records.map((r) => r.url));
  }

  /** Opponents' countries: cached ones instantly, the rest fetched a few at a
   *  time (Chess.com rate-limits bursts) and saved for next time. */
  async function loadCountriesInBackground() {
    const generation = ++countryJob.generation;
    const jobSite = site;
    const prefix = countryKey('');
    const names = [...new Set(records.map((r) => r.opponent.toLowerCase()))];
    const cached = await loadCountries(names.map(countryKey));
    for (const [k, v] of cached) countries.set(k.slice(prefix.length), v);
    const todo = names.filter((n) => !countries.has(n));
    countryJob = { generation, done: 0, total: todo.length, running: todo.length > 0 };
    render();
    if (!todo.length) return;
    let next = 0;
    const pendingSave = [];
    async function worker() {
      while (next < todo.length && countryJob.generation === generation) {
        const name = todo[next++];
        const { country } = await PLATFORMS[jobSite].api.fetchPlayerProfile(name);
        if (countryJob.generation !== generation) return;
        countries.set(name, country ?? null);
        pendingSave.push([prefix + name, country ?? null]);
        countryJob.done++;
        if (pendingSave.length >= 20) saveCountries(pendingSave.splice(0));
        scheduleRender();
      }
    }
    // js/api/lichess.js bundles lookups into one request - many at once are fine there.
    const concurrency = jobSite === 'chesscom' ? COUNTRY_FETCH_CONCURRENCY : 100;
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (countryJob.generation !== generation) return;
    saveCountries(pendingSave.splice(0));
    countryJob.running = false;
    render();
  }

  // ---------- the analysis run ----------

  function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 90) return 'noch unter 2 Min.';
    if (seconds < 3600) return `noch ca. ${Math.round(seconds / 60)} Min.`;
    const h = Math.floor(seconds / 3600);
    return `noch ca. ${h} Std. ${Math.round((seconds - h * 3600) / 60)} Min.`;
  }

  function updateProgress() {
    if (!run) return;
    const { targets, index, plyDone, plyTotal } = run;
    const cur = targets[index];
    const donePlies = run.finishedPlies + plyDone;
    const fraction = run.totalPlies ? donePlies / run.totalPlies : 0;
    const pct = Math.min(99, Math.floor(fraction * 100));
    progress.pct.textContent = `${pct} %`;
    progress.bar.style.width = `${pct}%`;
    host.setRunProgress(fraction);
    if (cur) {
      const move = Math.max(1, Math.ceil(plyDone / 2));
      progress.line.textContent = `Spiel ${index + 1} von ${targets.length} · Zug ${move} von ${Math.ceil(plyTotal / 2)} · gegen ${cur.opponent}${cur.family ? ` (${cur.family})` : ''}`;
      progress.gameBar.style.width = `${plyTotal ? (plyDone / plyTotal) * 100 : 0}%`;
    }
    const elapsed = (Date.now() - run.startedAt - run.pausedMs) / 1000;
    progress.eta.textContent = donePlies > 20 && !run.paused ? formatEta((elapsed / donePlies) * (run.totalPlies - donePlies)) : '';
    progress.steps.textContent = `${run.cached} aus dem Speicher · ${index} von ${targets.length} neu analysiert`;
    if (!progress.confirm.classList.contains('hidden')) renderConfirmText();
  }

  function renderConfirmText() {
    const cur = run.targets[run.index];
    const curText = cur ? ` Nur die laufende Partie (Zug ${Math.max(1, Math.ceil(run.plyDone / 2))} von ${Math.ceil(run.plyTotal / 2)}) wird verworfen.` : '';
    progress.confirmText.innerHTML = `<b>Analyse wirklich abbrechen?</b> ${run.index} von ${run.targets.length} Partien sind fertig und bleiben gespeichert.${curText} Ein neuer Start macht mit den fehlenden Partien weiter.`;
  }

  function setPaused(paused) {
    if (!run) return;
    run.paused = paused;
    if (paused) run.pauseStarted = Date.now();
    else if (run.pauseStarted) {
      run.pausedMs += Date.now() - run.pauseStarted;
      run.pauseStarted = null;
      run.resume?.();
      run.resume = null;
    }
    progress.pauseBtn.textContent = paused ? 'Fortsetzen' : 'Pausieren';
    const engineLabel = host.getEngineSettings().label;
    progress.title.textContent = paused ? `Engine-Analyse pausiert (nach der laufenden Partie) · ${engineLabel}` : `Engine-Analyse läuft · ${engineLabel}`;
    updateProgress();
  }

  /** only: just these games (the "Partien" tab's magnifiers) instead of every filtered one. */
  async function startRun(only = null) {
    if (run) return;
    const rs = only ?? filtered();
    const targets = rs.filter(needsEngine);
    const { engineId, depth, label } = host.getEngineSettings();
    if (only && !targets.length) return;
    if (!rs.length) {
      showToast('Keine Partien für diese Filter.', 'error');
      return;
    }
    if (!targets.length) {
      showToast(`Alle ${rs.length} Partien sind für ${label} schon analysiert.`, 'info');
      return;
    }
    run = {
      targets,
      cached: only ? 0 : rs.length - targets.length,
      index: 0,
      plyDone: 0,
      plyTotal: targets[0].plies,
      finishedPlies: 0,
      totalPlies: targets.reduce((a, r) => a + r.plies, 0),
      startedAt: Date.now(),
      pausedMs: 0,
      paused: false,
      cancelled: false,
      engineId,
      depth,
      done: 0,
    };
    progress.root.classList.remove('hidden');
    progress.confirm.classList.add('hidden');
    setPaused(false);
    host.setBusy(true);
    render();
    window.addEventListener('beforeunload', warnBeforeUnload);

    let error = null;
    try {
      if (!engine || engineLoadedId !== engineId) {
        engine?.terminate();
        engine = new StockfishEngine();
        engineLoadedId = null;
        progress.line.textContent = 'Engine wird geladen …';
        await engine.init(() => {}, engineId);
        engineLoadedId = engineId;
      }
      for (; run.index < targets.length; run.index++) {
        if (run.paused) await new Promise((resolve) => (run.resume = resolve));
        if (run.cancelled) break;
        const r = targets[run.index];
        run.plyDone = 0;
        run.plyTotal = r.plies;
        updateProgress();
        const avgRating = r.ownRating && r.oppRating ? (r.ownRating + r.oppRating) / 2 : null;
        const recorder = recordingEngine(engine);
        const analysis = await analyzeGame(r.raw.pgn, recorder, {
          depth,
          avgRating,
          onProgress: (done, total) => {
            run.plyDone = done;
            run.plyTotal = total;
            updateProgress();
          },
        });
        // With the engine log, the single-game mode can show it later without re-analyzing.
        const rec = { ...buildEngineRecord(analysis, r.color, r.initialClock), evals: String(recorder) };
        // Saved right away, one game at a time - a cancel, a closed tab or a
        // crash never loses more than the game that was in progress.
        await saveEngineRecord(engineId, depth, r.url, rec);
        if (engineCacheKey === `${engineId}|${depth}`) engineCache.set(r.url, rec);
        run.finishedPlies += r.plies;
        run.done++;
        scheduleRender();
      }
    } catch (err) {
      if (err?.name !== 'AbortError') error = err;
    }

    const { done, cancelled } = run;
    run = null;
    window.removeEventListener('beforeunload', warnBeforeUnload);
    progress.root.classList.add('hidden');
    host.setBusy(false);
    render();
    if (error) showToast(`Analyse abgebrochen: ${error.message ?? error}`, 'error', 6000);
    else if (cancelled) showToast(`Analyse abgebrochen. ${done} Partien sind gespeichert.`, 'info');
    else showToast(`Analyse fertig: ${done} Partien neu analysiert.`, 'success');
  }

  /** A game's magnifier in the "Partien" tab: analyzes just that game - queued
   *  behind the running run's games if one is going (its loop re-reads targets.length). */
  function enqueueGame(url) {
    const r = records.find((x) => x.url === url);
    if (!r || !needsEngine(r)) return;
    if (!run) {
      startRun([r]);
      return;
    }
    if (run.targets.includes(r)) return;
    run.targets.push(r);
    run.totalPlies += r.plies;
    updateProgress();
    render();
  }

  /** Takes a waiting game back out of the run - never the one being analyzed. */
  function dequeueGame(url) {
    if (!run) return;
    const i = run.targets.findIndex((r) => r.url === url);
    if (i <= run.index) return;
    run.totalPlies -= run.targets[i].plies;
    run.targets.splice(i, 1);
    updateProgress();
    render();
  }

  function warnBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  function askCancel() {
    if (!run) return;
    renderConfirmText();
    progress.confirm.classList.remove('hidden');
    progress.keepBtn.focus();
  }

  function confirmCancel() {
    if (!run) return;
    run.cancelled = true;
    progress.confirm.classList.add('hidden');
    // Rejects the in-flight engine call (AbortError), which ends the loop
    // above - the engine is gone afterwards, so the next run starts a fresh one.
    engine?.terminate();
    engine = null;
    engineLoadedId = null;
    if (run.paused) {
      run.resume?.();
      run.resume = null;
    }
  }

  progress.cancelBtn.addEventListener('click', askCancel);
  progress.keepBtn.addEventListener('click', () => progress.confirm.classList.add('hidden'));
  progress.stopBtn.addEventListener('click', confirmCancel);
  progress.pauseBtn.addEventListener('click', () => setPaused(!run?.paused));

  // ---------- jumping into a single game ----------

  /** Opens the game in a new tab, in the single-game mode (js/main.js's deep link) - this tab keeps the Meta-Analyse. */
  /** Opens a game in the game mode (its own tab) - only once it has engine
   *  values; otherwise a hint under `anchorRect` says why, with a button to
   *  analyze it where that's possible (gameHintHtml). */
  function openGame(url, anchorRect) {
    const r = records.find((x) => x.url === url);
    if (!r) return;
    const state = gameOpenState(r, engineCache.get(r.url) ?? null, ctx().queueState(r));
    if (state !== 'open') {
      gamesPopEl.innerHTML = gameHintHtml(r, state);
      gamesPopEl.dataset.for = 'hint'; // never a count's id - its next click opens the list again
      placePop(anchorRect);
      return;
    }
    closeGamesPop();
    const params = new URLSearchParams({ user: username, game: url, end: String(Math.round(r.endTime / 1000)) });
    if (site !== 'chesscom') params.set('site', site);
    window.open(`${location.pathname}?${params}`, '_blank', 'noopener');
  }

  renderTabs();

  // ---------- API for js/main.js ----------
  return {
    get isRunning() {
      return Boolean(run);
    },
    get hasData() {
      return records.length > 0;
    },
    /** Every game under the current filters already has engine values - nothing for a run to do. */
    get allAnalyzed() {
      return !filtered().some(needsEngine);
    },
    setActive(isActive) {
      active = isActive;
      panelEl.classList.toggle('hidden', !isActive);
      oppPicker.classList.toggle('hidden', !isActive);
      if (!isActive) {
        closeOpponentMenu();
        tipEl.classList.add('hidden');
      }
      render();
    },
    /** The site toggle switched - drops the loaded games, so the other site's never mix in. */
    clear() {
      if (run) return;
      records = [];
      opponent = null;
      countryJob.generation++;
      countryJob.running = false;
      render();
    },
    /** Called by js/main.js's "Spiele laden" in meta mode with the raw Chess.com games. */
    loadGames(rawGames, user, from) {
      return setRecordsFrom(rawGames, user, from);
    },
    /** Any top-bar filter changed. */
    refresh() {
      if (active) render();
      else renderOpponentButton();
    },
    async engineSettingsChanged() {
      if (run) return;
      await reloadEngineCache();
      render();
    },
    /** The analyze button: start a run, or (while running) ask to cancel it. */
    toggleRun() {
      if (run) askCancel();
      else startRun();
    },
  };
}
