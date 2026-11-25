// Renders the Meta-Analyse tabs as HTML strings from already-filtered
// per-game records (metaRecords.js). Pure presentation: no state, no I/O -
// js/meta/metaController.js owns the data and calls renderMetaTab() again on
// every filter or tab change. Charts are small hand-drawn SVG/HTML (no
// Chart.js) so a re-render is just one innerHTML swap.
//
// This file is only the entry point: the tab list, which function renders
// which tab, and the reset before each render. The tabs live in js/meta/view/
// (one file each), with their shared building blocks in format.js, cards.js,
// gameLists.js and charts.js there.

import { flag, setOppFlag } from './view/cards.js';
import { LISTED_GAMES_STEP, clearGameLists, gameListById, gameListHtml, gameHintHtml } from './view/gameLists.js';
import { clearFitCharts, layoutFitCharts, resetZooms } from './view/charts.js';
import { resetStreamViews, streamGestureActive } from './view/openingStream.js';
import { overview } from './view/overview.js';
import { openings } from './view/openings.js';
import { opponents } from './view/opponents.js';
import { quality } from './view/quality.js';
import { heatmapTab } from './view/heatmap.js';
import { mateTab } from './view/mate.js';
import { timeTab } from './view/time.js';
import { gamesTab, GAMES_STEP } from './view/games.js';

// Used by metaController.js, which imports them from here.
export { LISTED_GAMES_STEP, gameListById, gameListHtml, gameHintHtml, layoutFitCharts, resetZooms, resetStreamViews, streamGestureActive, GAMES_STEP };

export const META_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'openings', label: 'Eröffnungen' },
  { id: 'opponents', label: 'Gegner & Länder' },
  // The only tab built on engine values - its tooltip says so (no per-card badges).
  {
    id: 'quality',
    label: 'Spielqualität',
    tip: 'Statistiken zur Genauigkeit deiner Züge: Die Engine bewertet jeden Zug. Nur Partien mit Engine-Analyse zählen, also mit der Lupe oder automatisch analysierte.',
  },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'mate', label: 'Matt', tip: 'Mit welchen Mattbildern deine Partien enden - gesetzt und kassiert. Erkannt aus der Schlussstellung, ohne Engine.' },
  { id: 'time', label: 'Zeit & Partieende' },
  { id: 'games', label: 'Partien' },
];

const RENDERERS = { overview, openings, opponents, quality, heatmap: heatmapTab, time: timeTab, mate: mateTab, games: gamesTab };

/**
 * @param {string} tab one of META_TABS' ids
 * @param {object[]} records filtered fast records
 * @param {{engineOf: (r) => object|null, countryOf: (name) => string|null, opponent: string|null,
 *   username: string, engineLabel: string, countriesPending: boolean, countriesDone: number, countriesTotal: number}} ctx
 */
export function renderMetaTab(tab, records, ctx) {
  clearFitCharts(); // the previous render's charts are about to be replaced
  clearGameLists(); // ... and so are its counts
  setOppFlag((name) => flag(ctx.countryOf(name)));
  return (RENDERERS[tab] ?? overview)(records, ctx);
}
