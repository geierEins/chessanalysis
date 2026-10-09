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
import { buildFastRecord, buildEngineRecord } from './metaRecords.js';
import { loadEngineRecords, saveEngineRecord, saveEngineRecords, loadCountries, saveCountries } from './metaStore.js';
import { META_TABS, renderMetaTab } from './metaView.js';
import { openingBoardHtml } from './openingBoard.js';
import { loadMetaTab, saveMetaTab } from '../persistence.js';

const FILE_FORMAT = 'chessanalysis-meta';
const FILE_VERSION = 1;
const COUNTRY_FETCH_CONCURRENCY = 3;
const RERENDER_EVERY_MS = 2500;

const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const OUTCOME_BY_RESULT = { W: 'win', D: 'draw', L: 'loss' };
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {{
 *   getFilters: () => {from: Date|null, to: Date|null, timeClasses: Set<string>, outcomes: Set<string>, colors: Set<string>},
 *   getEngineSettings: () => {engineId: string, depth: number, label: string, slug: string},
 *   setEngineSettings: (engineId: string, depth: number) => void,
 *   setUsername: (username: string) => void,
 *   setBusy: (busy: boolean) => void,
 *   setRunProgress: (fraction: number) => void,
 *   onOpenGame: (summaries: object[], index: number) => void,
 * }} host
 */
export function initMetaMode(host) {
  const panelEl = el('meta-panel');
  const emptyEl = el('meta-empty');
  const contentEl = el('meta-content');
  const statusEl = el('meta-status-text');
  const exportBtn = el('meta-export-btn');
  const importBtns = [el('meta-import-btn'), el('meta-empty-import-btn')];
  const importInput = el('meta-import-input');
  const tabsEl = el('meta-tabs');
  const tabPanelEl = el('meta-tabpanel');
  const tipEl = el('meta-tip');
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
  if (!META_TABS.some((t) => t.id === tab)) tab = 'overview';
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
    tabPanelEl.innerHTML = renderMetaTab(tab, rs, ctx());
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
    exportBtn.classList.toggle('hidden', have === 0 || Boolean(run));
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    saveMetaTab(tab);
    renderTabs();
    render();
  });

  tabPanelEl.addEventListener('click', (e) => {
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
            return option(key, `<span class="meta-opp-name">${flag} ${esc(x.name)}</span><span class="meta-opp-count">${x.n} ${x.n === 1 ? 'Partie' : 'Partien'}</span>`, 'meta-opp-option');
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
      if (rec) built.push(rec);
      if (i % 40 === 39) await yieldToUi(); // PGN parsing - keep the page responsive for big loads
    }
    built.sort((a, b) => b.endTime - a.endTime);
    records = built;
    await reloadEngineCache();
    render();
    loadCountriesInBackground();
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
        const analysis = await analyzeGame(r.raw.pgn, engine, {
          depth,
          avgRating,
          onProgress: (done, total) => {
            run.plyDone = done;
            run.plyTotal = total;
            updateProgress();
          },
        });
        const rec = buildEngineRecord(analysis, r.color, r.initialClock);
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

  function openGame(url) {
    if (run) {
      showToast('Während die Meta-Analyse läuft, kann keine einzelne Partie geöffnet werden.', 'info');
      return;
    }
    const list = filtered();
    const index = list.findIndex((r) => r.url === url);
    if (index < 0) return;
    host.onOpenGame(list.map((r) => r.summary), index);
  }

  // ---------- export / import ----------

  function ym(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function exportFileName(rs) {
    const { slug, depth } = host.getEngineSettings();
    const clean = (s) => s.replace(/[^\w.-]+/g, '-');
    const times = rs.map((r) => r.endTime);
    const span = `${ym(Math.min(...times))}_bis_${ym(Math.max(...times))}`;
    const vs = opponent ? `_vs-${clean(rs[0].opponent)}` : '';
    return `meta-analyse_${clean(username)}_${span}${vs}_${slug}_tiefe${depth}.json`;
  }

  async function exportAnalysis() {
    const rs = filtered();
    const { engineId, depth, label } = host.getEngineSettings();
    const payload = {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      exportedAt: new Date().toISOString(),
      username,
      engine: { id: engineId, depth, label },
      games: rs.map((r) => ({ game: r.raw, engine: engineCache.get(r.url) ?? null })),
      countries: Object.fromEntries([...new Set(rs.map((r) => r.opponent.toLowerCase()))].map((n) => [n, countries.get(n) ?? null])),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const name = exportFileName(rs);
    // Chromium: a real "Speichern unter" dialog with the suggested name
    // editable. Elsewhere: a plain download under that name.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Meta-Analyse', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast(`Gespeichert: ${handle.name}`, 'success');
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast(`Gespeichert: ${name}`, 'success');
  }

  async function importAnalysis(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showToast('Die Datei ist kein gültiges JSON.', 'error');
      return;
    }
    if (data?.format !== FILE_FORMAT || !Array.isArray(data.games) || !data.username || !data.engine?.id) {
      showToast('Das ist keine Meta-Analyse-Datei dieser App.', 'error');
      return;
    }
    if (data.version > FILE_VERSION) {
      showToast('Die Datei stammt aus einer neueren Version der App.', 'error');
      return;
    }
    const engineId = data.engine.id;
    const depth = Number(data.engine.depth);
    const withEngine = data.games.filter((g) => g.engine && g.game?.url);
    await saveEngineRecords(engineId, depth, withEngine.map((g) => [g.game.url, g.engine]));
    const countryEntries = Object.entries(data.countries ?? {});
    for (const [k, v] of countryEntries) countries.set(k.toLowerCase(), v);
    await saveCountries(countryEntries);
    const rawGames = data.games.map((g) => g.game).filter(Boolean);
    const times = rawGames.map((g) => g.end_time * 1000).filter(Number.isFinite);
    if (!times.length) {
      showToast('Die Datei enthält keine Partien.', 'error');
      return;
    }
    host.setUsername(data.username);
    host.setEngineSettings(engineId, depth);
    host.showAllGames(Math.min(...times), Math.max(...times));
    await setRecordsFrom(rawGames, data.username, null);
    if (!records.length) {
      showToast(`Keine Partien von ${data.username} in der Datei gefunden.`, 'error');
      return;
    }
    showToast(`${records.length} Partien importiert (${withEngine.length} mit Engine-Werten).`, 'success');
  }

  exportBtn.addEventListener('click', () => {
    exportAnalysis().catch((err) => showToast(`Export fehlgeschlagen: ${err.message ?? err}`, 'error'));
  });
  for (const b of importBtns) b.addEventListener('click', () => !run && importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (file) {
      importAnalysis(file).catch((err) => {
        console.error('Meta import failed', err);
        showToast(`Import fehlgeschlagen: ${err.message ?? err}`, 'error');
      });
    }
  });

  renderTabs();

  // ---------- API for js/main.js ----------
  return {
    get isRunning() {
      return Boolean(run);
    },
    get hasData() {
      return records.length > 0;
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
