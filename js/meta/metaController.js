// The Meta-Analyse mode: loads many games at once, analyzes them one after
// another with Stockfish, and shows aggregated statistics (js/meta/metaView.js).
// Shares the top bar with the single-game mode - js/main.js owns those
// controls and hands their current state in through the callbacks passed to
// initMetaMode(); only the opponent picker (in the game picker's slot) and
// #meta-panel below the bar belong to this module.

import { fetchPlayerProfile } from '../api/chesscom.js';
import { StockfishEngine } from '../engine/stockfishEngine.js';
import { analyzeGame } from '../analysis/gameAnalyzer.js';
import { showToast } from '../ui/toast.js';
import { flagHtml } from '../ui/playerLabel.js';
import { buildFastRecord, buildEngineRecord, isCoachGame } from './metaRecords.js';
import { loadEngineRecords, saveEngineRecord, loadCountries, saveCountries } from './metaStore.js';
import { META_TABS, renderMetaTab, gameListHtml, layoutFitCharts } from './metaView.js';
import { openingBoardHtml } from './openingBoard.js';
import { syncAutoAnalysis } from './autoAnalysis.js';
import { recordingEngine } from '../analysis/evalLog.js';
import { loadMetaTab, saveMetaTab, loadCountryLimit, saveCountryLimit } from '../persistence.js';

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
  const tabsEl = el('meta-tabs');
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
  let records = []; // fast records of every loaded game, newest first
  let loadedFrom = null; // the time filter's lower bound when these games were loaded (null = all time)
  let engineCache = new Map(); // url -> engine record, for the CURRENT engine + depth
  let engineCacheKey = '';
  const countries = new Map(); // lowercased opponent -> country code|null
  let countryJob = { generation: 0, done: 0, total: 0, running: false };
  let opponent = null; // lowercased opponent name, or null = all
  let tab = loadMetaTab() ?? 'overview';
  // Sorted column per sortable table (metaView's sortHead) - Eröffnungen, Quote nach Land, Partien.
  const sorts = { openings: { key: 'games', dir: 'desc' }, countries: { key: 'score', dir: 'desc' }, games: { key: 'date', dir: 'desc' } };
  if (!META_TABS.some((t) => t.id === tab)) tab = 'overview';
  let countryLimit = loadCountryLimit() ?? 25; // rows in the two country cards (metaView's limitPicker), 0 = all
  // Endings chosen above "Längste Partien" / "Kürzeste Partien" (metaView's endingPicker), empty = all.
  const endings = { longest: new Set(), shortest: new Set(['checkmate']) };
  let run = null; // the running analysis, see startRun()
  let engine = null;
  let engineLoadedId = null;
  let renderTimer = null;
  let lastRender = 0;

  // ---------- filtering ----------

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
      // "XX" is Chess.com's "International" - no real country to count.
      countryOf: (name) => {
        const code = countries.get(name.toLowerCase());
        return code && code !== 'XX' ? code : null;
      },
      opponent,
      sorts,
      countryLimit,
      endings,
      username,
      engineLabel: label,
      countriesPending: countryJob.running,
      countriesDone: countryJob.done,
      countriesTotal: countryJob.total,
    };
  }

  function renderTabs() {
    tabsEl.innerHTML = META_TABS.map(
      (t) => `<button type="button" role="tab" class="meta-tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}</button>`
    ).join('');
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
    tabPanelEl.innerHTML = renderMetaTab(tab, rs, ctx());
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
    const missing = rs.length - have;
    const f = host.getFilters();
    const wider = records.length && (f.from == null ? loadedFrom != null : loadedFrom != null && +f.from < +loadedFrom);
    let text = `<b>${rs.length}</b> von ${records.length} geladenen Partien passen zu den Filtern. `;
    if (!rs.length) text = `Keine der ${records.length} geladenen Partien passt zu den Filtern. `;
    else if (have === 0) text += `Für <b>${esc(label)}</b> ist noch nichts analysiert, Tabs ohne Engine sind trotzdem fertig.`;
    else text += `<b>${esc(label)}</b>: ${have} von ${rs.length} mit Engine-Werten.${missing ? ` Die Lupe analysiert die ${missing} fehlenden.` : ' Alles analysiert.'}`;
    if (wider) text += ' <span class="meta-warn">Der Zeitraum reicht weiter zurück als die geladenen Partien – „Spiele laden“ holt die älteren.</span>';
    statusEl.innerHTML = text;
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    saveMetaTab(tab);
    renderTabs();
    render();
  });

  // ---------- game list behind a clickable count (metaView's gamesCount) ----------

  function closeGamesPop() {
    gamesPopEl.classList.add('hidden');
  }

  function openGamesPop(btn) {
    const byUrl = new Map(records.map((r) => [r.url, r]));
    const rs = btn.dataset.games.split(' ').map((u) => byUrl.get(u)).filter(Boolean);
    gamesPopEl.innerHTML = gameListHtml(rs, Number(btn.dataset.total));
    gamesPopEl.dataset.for = btn.dataset.games; // a second click on the same count closes it
    gamesPopEl.classList.remove('hidden');
    // Under the number, shifted left / flipped above where it wouldn't fit.
    const rect = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - gamesPopEl.offsetWidth - 8));
    const below = rect.bottom + 4;
    const top = below + gamesPopEl.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - gamesPopEl.offsetHeight - 4) : below;
    gamesPopEl.style.left = `${left}px`;
    gamesPopEl.style.top = `${top}px`;
  }

  gamesPopEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-game]');
    if (!item) return;
    closeGamesPop();
    openGame(item.dataset.game);
  });
  document.addEventListener('click', (e) => {
    if (!gamesPopEl.contains(e.target) && !e.target.closest('.meta-count')) closeGamesPop();
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
    const countBtn = e.target.closest('.meta-count');
    if (countBtn) {
      const isOpenHere = !gamesPopEl.classList.contains('hidden') && gamesPopEl.dataset.for === countBtn.dataset.games;
      if (isOpenHere) closeGamesPop();
      else openGamesPop(countBtn);
      return;
    }
    // Sortable column head: first click sorts descending, a second one flips.
    const sortTh = e.target.closest('th[data-sort]');
    if (sortTh) {
      const { sortTable, sort: key } = sortTh.dataset;
      const current = sorts[sortTable];
      sorts[sortTable] = { key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' };
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
    const endingBtn = e.target.closest('[data-ending]');
    if (endingBtn) {
      const chosen = endings[endingBtn.dataset.endingTable];
      const key = endingBtn.dataset.ending;
      if (chosen.has(key)) chosen.delete(key);
      else chosen.add(key);
      render();
      return;
    }
    const gameRow = e.target.closest('tr[data-game]');
    if (gameRow) {
      openGame(gameRow.dataset.game);
      return;
    }
    const oppRow = e.target.closest('tr[data-opp]');
    if (oppRow) setOpponent(oppRow.dataset.opp.toLowerCase());
  });

  // Shared tooltip for every chart mark carrying data-tip, and for opening
  // names (data-opening), which get a small board of the defining position.
  let tipSource = null;
  tabPanelEl.addEventListener('mousemove', (e) => {
    const t = e.target.closest('[data-opening], [data-tip]');
    if (!t) {
      tipEl.classList.add('hidden');
      tipSource = null;
      return;
    }
    if (t !== tipSource) {
      tipSource = t;
      const board = t.dataset.opening ? openingBoardHtml(t.dataset.opening, t.dataset.variants) : null;
      tipEl.classList.toggle('board', Boolean(board));
      if (board) tipEl.innerHTML = board;
      else tipEl.textContent = t.getAttribute('data-tip') ?? t.dataset.opening;
    }
    tipEl.classList.remove('hidden');
    const x = Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8);
    const below = e.clientY + 14;
    const y = below + tipEl.offsetHeight > window.innerHeight - 8 ? Math.max(8, e.clientY - tipEl.offsetHeight - 10) : below;
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  });
  tabPanelEl.addEventListener('mouseleave', () => {
    tipEl.classList.add('hidden');
    tipSource = null;
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
      oppBtnLabel.textContent = `👥 Alle Gegner · ${base.length} Partien`;
      return;
    }
    const mine = base.filter((r) => r.opponent.toLowerCase() === opponent);
    const name = mine[0]?.opponent ?? records.find((r) => r.opponent.toLowerCase() === opponent)?.opponent ?? opponent;
    oppBtnLabel.textContent = `⚔️ ${name} · ${mine.length} Partien`;
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
    opponent = null;
    const built = [];
    for (let i = 0; i < rawGames.length; i++) {
      const rec = buildFastRecord(rawGames[i], user);
      if (rec && !isCoachGame(rec)) built.push(rec);
      if (i % 40 === 39) await yieldToUi(); // PGN parsing - keep the page responsive for big loads
    }
    built.sort((a, b) => b.endTime - a.endTime);
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
    await saveCountries(newCountries);
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
    const names = [...new Set(records.map((r) => r.opponent.toLowerCase()))];
    const cached = await loadCountries(names);
    for (const [k, v] of cached) countries.set(k, v);
    const todo = names.filter((n) => !countries.has(n));
    countryJob = { generation, done: 0, total: todo.length, running: todo.length > 0 };
    render();
    if (!todo.length) return;
    let next = 0;
    const pendingSave = [];
    async function worker() {
      while (next < todo.length && countryJob.generation === generation) {
        const name = todo[next++];
        const { country } = await fetchPlayerProfile(name);
        if (countryJob.generation !== generation) return;
        countries.set(name, country ?? null);
        pendingSave.push([name, country ?? null]);
        countryJob.done++;
        if (pendingSave.length >= 20) saveCountries(pendingSave.splice(0));
        scheduleRender();
      }
    }
    await Promise.all(Array.from({ length: COUNTRY_FETCH_CONCURRENCY }, worker));
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
    progress.title.textContent = paused ? 'Engine-Analyse pausiert (nach der laufenden Partie)' : 'Engine-Analyse läuft';
    updateProgress();
  }

  async function startRun() {
    if (run) return;
    const rs = filtered();
    const targets = rs.filter((r) => !engineCache.has(r.url));
    const { engineId, depth, label } = host.getEngineSettings();
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
      cached: rs.length - targets.length,
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
  function openGame(url) {
    const r = records.find((x) => x.url === url);
    if (!r) return;
    const params = new URLSearchParams({ user: username, game: url, end: String(Math.round(r.endTime / 1000)) });
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
      return filtered().every((r) => engineCache.has(r.url));
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
