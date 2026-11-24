# metaView.js aufteilen Implementation Plan

**Status:** Accepted (2026-11-24)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `js/meta/metaView.js` (rund 1800 Zeilen) wird in kleine Dateien zerlegt: gemeinsame Bausteine und ein Modul pro Tab. Die App verhält sich danach exakt wie vorher.

**Architecture:** Reines Verschieben von Code, keine Änderung am Verhalten. Zuerst ein Sicherheitsnetz: CI rendert jeden Tab mit dem Stand von main und mit dem des Branches und verlangt identisches HTML. Danach kommen die gemeinsamen Bausteine in `js/meta/view/`, dann jeder Tab in eine eigene Datei. `metaView.js` bleibt als schlanker Einstieg (`META_TABS`, `renderMetaTab`, Re-Exporte für `metaController.js`).

**Tech Stack:** Vanilla-ES-Module ohne Build, Tests unter Node 22 in GitHub Actions (`tests/run-node.mjs`), App über `serve.ps1` auf localhost:5500.

**Spec:** Kein eigenes Design-Dokument. Grundlage sind der Auftrag des Nutzers (2026-11-24: Branch `refactoring`, Tabs in eigene Dateien, Schritt für Schritt) und die Lehre aus dem gescheiterten Versuch vom 2026-10-30: zu große Schritte, Zerschneiden per Zeilennummern, nichts getestet, alles zurückgerollt.

## Global Constraints

- Arbeit nur auf dem Branch `refactoring`. Nach main geht er erst, wenn alle Schritte grün und im Browser geprüft sind.
- Pro Task genau ein Umzug. Das HTML jedes Tabs bleibt Byte für Byte gleich (die CI-Prüfung aus Task 1 belegt das).
- Code wird mit dem Edit-Tool verschoben, nie per Zeilennummern (`sed -n`, `head`/`tail`).
- Am Code ändert sich nichts außer `export`/`import`: keine Umbenennungen, keine Aufräumarbeiten, keine Kommentare umschreiben. Was beim Umzug auffällt, kommt in die Liste „Später“ im Ledger.
- Zustand auf Modulebene (`gameLists`, `fitDraws`, `fitZooms`, `zoomMemory`, `fitSeq`, `oppFlag`) gibt es nach dem Umzug weiterhin genau einmal. Zurückgesetzt wird er über exportierte Funktionen, nie über eine Kopie.
- Keine Zyklen: Tab-Module importieren aus `js/meta/view/`, nie aus `metaView.js`.
- Nach jedem Task: Push auf `refactoring`, CI grün (Tests und Render-Vergleich), dann prüft der Nutzer die App im Browser (Tab öffnen, Konsole ohne Fehler). Erst danach folgt der nächste Task.

## Review Focus

- Tooltips und Klick-Ziele (`data-games`, `data-tip`, `data-opening`) hängen an Modulzustand. Wird `gameLists` doppelt angelegt, sind die Zahlen in einem Tab nicht mehr anklickbar. Der Render-Vergleich findet das nicht, weil das HTML gleich bleibt. Deshalb pro Tab im Browser eine Zahl anklicken.
- Diagramme mit Zoom (`fitChart`/`layoutFitCharts`) werden erst nach dem Einfügen ins DOM gezeichnet. Das sieht der Node-Vergleich ebenfalls nicht. Deshalb im Browser die Zeit-Diagramme und die Übersicht ansehen und zoomen.
- `oppFlag` wird in `renderMetaTab` neu gesetzt und in vielen Tabs gelesen. Nach dem Umzug muss jeder Leser den aktuellen Wert sehen (Setter-Funktion, kein importierter `let`-Wert, der festgefroren wäre).
- Eine Konstante, die vor ihrer Definition benutzt wird (TDZ), etwa `VALUE_KEY` vor `HEAT_MEASURES`, wirft erst zur Laufzeit. Das fängt der Render-Vergleich, weil er jeden Tab ausführt.
- `metaController.js` importiert `META_TABS, renderMetaTab, gameListHtml, gameHintHtml, gameListById, LISTED_GAMES_STEP, GAMES_STEP, layoutFitCharts` aus `metaView.js`. Diese Namen müssen dort erreichbar bleiben (Re-Export), damit der Controller unverändert bleibt.

---

### Task 1: Sicherheitsnetz – Render-Vergleich in CI

**Files:**
- Create: `tests/render-snapshot.mjs`
- Modify: `.github/workflows/tests.yml`

**Interfaces:**
- Produces: `node tests/render-snapshot.mjs <root>` gibt JSON `{ <tab>: <html> }` für alle `META_TABS` aus. Die Module werden aus `<root>/js/...` geladen, so kann dasselbe Skript den Stand von main und den des Branches rendern.

- [ ] **Step 1: `tests/render-snapshot.mjs` schreiben.** Es registriert `scripts/auto-analysis/https-loader.mjs` und liest `<root>/data/joeyfinanzen.json` aus dem Branch-Stand (gleiche Daten für beide Seiten). Fast-Records entstehen mit `buildFastRecord(entry.game, username)` aus `<root>`. Für `ctx` gilt:
  - `engineOf` liefert `entry.engine`, wenn die Version stimmt, sonst null.
  - `countryOf` liefert immer null.
  - `opponent` ist null, `username` kommt aus der Datei, `engineLabel` ist `'test'`.
  - `sorts` hat die Startwerte aus `metaController.js`.
  - `openingOpen` enthält alle Knoten. Damit der Baum voll aufgeklappt ist, wird die Menge so gebaut, dass `has()` immer true liefert.
  - Die übrigen Felder (`gamesShown`, `countryLimit`, `countrySearch`, `gameSearch`, `openingSearch`, `endings`, `heatmap`, `mateHeat`) bekommen die Startwerte aus `metaController.js`.
  - Gerendert wird jeder Tab aus `META_TABS`, das Ergebnis geht als JSON auf stdout.
- [ ] **Step 2: Job `render-diff` in `tests.yml`.** Er läuft nur bei Pushes auf Branches außer main und bei Pull Requests. Ablauf: main zusätzlich nach `base/` auschecken (`actions/checkout` mit `ref: main`, `path: base`), `node tests/render-snapshot.mjs . > head.json` und `node tests/render-snapshot.mjs base > base.json` ausführen, dann `diff base.json head.json`. Ein Unterschied lässt den Job fehlschlagen und zeigt die ersten Zeilen des Diffs.
- [ ] **Step 3: Push auf `refactoring`. Erwartet:** Tests grün, `render-diff` grün (am Code ist noch nichts geändert, also identisch).
- [ ] **Step 4: Gegenprobe.** In einem Wegwerf-Commit einen Text in einem Tab ändern und pushen. `render-diff` muss rot werden. Den Commit danach per `git revert` rückgängig machen und erneut pushen; der Job muss wieder grün sein.
- [ ] **Step 5: Commit**
```bash
git add tests/render-snapshot.mjs .github/workflows/tests.yml
git commit -m "CI: Render-Vergleich main gegen Branch für das Aufteilen von metaView.js"
```

### Task 2: Basis-Helfer → `js/meta/view/format.js`

**Files:** Create `js/meta/view/format.js`, Modify `js/meta/metaView.js`

**Interfaces:**
- Produces: `esc, pts, score, wdl, avg, pc, f1, f0, groupBy, byCountDesc, fold, fmtDate, fmtDateTime, signed, TC_ORDER, TC_LABEL, RES_LETTER, RES_BADGE, WEEKDAYS, DAY_MS` (genau die Definitionen aus `metaView.js`, unverändert).

- [ ] Die Definitionen verschieben, mit `export`. In `metaView.js` stattdessen `import { … } from './view/format.js'`.
- [ ] Push. Erwartet: Tests und `render-diff` grün. Der Nutzer öffnet jeden Tab, die Konsole bleibt ohne Fehler.
- [ ] Commit `Refactoring: Basis-Helfer nach view/format.js`.

### Task 3: Karten und Kacheln → `js/meta/view/cards.js`

**Interfaces:** Produces `card, cardIcon, CARD_ICONS, kpi, GOOD, BAD, EMPTY, bigStats, hbars, wdlBar, WDL_LEGEND, segPicker, sortHead, sortRows, flag, withFlag, setOppFlag(fn)`.
- `oppFlag` lebt in `cards.js`. `setOppFlag` ersetzt die Zuweisung in `renderMetaTab`, `withFlag` liest den aktuellen Wert.

- [ ] Verschieben, `renderMetaTab` ruft `setOppFlag((name) => flag(ctx.countryOf(name)))` auf. Push, CI grün, Browser: Tab „Gegner und Länder“ und „Partien“ zeigen weiter Flaggen. Commit.

### Task 4: Partielisten → `js/meta/view/gameLists.js`

**Interfaces:** Produces `gamesCount, recordGames, gameListById, gameListHtml, gameHintHtml, clearGameLists(), LISTED_GAMES_STEP, NO_MOVES, NO_MOVES_TIP, openTip, HINT_TEXT, topGamesTable, topGamesTile, streakLink, longestStreak, longestStreakGames, resultTip, analyzeCell` samt den Icons, die `analyzeCell` braucht (`MAGNIFIER, HOURGLASS, CROSS`).
- `gameLists` lebt hier. `renderMetaTab` ruft `clearGameLists()` statt `gameLists.clear()` auf. `metaView.js` exportiert `gameListById, gameListHtml, gameHintHtml, LISTED_GAMES_STEP` weiter (Re-Export).

- [ ] Verschieben, Push, CI grün. Browser: in Übersicht, Eröffnungen und Partien je eine Zahl anklicken, die Liste öffnet sich. Commit.

### Task 5: Diagramme → `js/meta/view/charts.js`

**Interfaces:** Produces `pie, resultPie, shade, columns, fitChart, bindZoom, layoutFitCharts, clearFitCharts(), timeTicks, ZOOM_NOTE`.
- `fitDraws, fitZooms, zoomMemory, fitSeq` leben hier. `renderMetaTab` ruft `clearFitCharts()` statt `fitDraws.clear()` auf. `metaView.js` exportiert `layoutFitCharts` weiter.

- [ ] Verschieben, Push, CI grün. Browser: Übersicht (Partien pro Tag, Rating) und Zeit zoomen, Zoom bleibt beim Tabwechsel erhalten. Commit.

### Tasks 6–13: Ein Tab pro Task → `js/meta/view/<tab>.js`

Je Task wandert die Tab-Funktion samt ihren nur von ihr genutzten Konstanten und Helfern. Die Reihenfolge geht von wenig zu viel Abhängigkeit:

| Task | Datei | Inhalt |
|---|---|---|
| 6 | `view/mate.js` | `mateTab, mateKingCard, MATE_HEAT_MODES` |
| 7 | `view/heatmap.js` | `heatmapTab` und die Heatmap-Konstanten und -Helfer (`HEAT_*`, `VALUE_KEY`, `PIECE_VALUE`, `FILES`, `PIECE_NOUN`, `joinOr`, `piecePhrase`, `heatSentences`, `heatVerb`, `piecePicker`, `heatColor`) |
| 8 | `view/openings.js` | `openings` |
| 9 | `view/opponents.js` | `opponents, COUNTRY_LIMITS, limitPicker` |
| 10 | `view/quality.js` | `quality` und `MIX_*`, `categoryMix`, `GAUGE_STOPS`, `gaugeColor`, `accuracyGauge`, `RES_COLOR`, `accuracyTrendChart` |
| 11 | `view/time.js` | `timeTab` und `MOVE_TIME_*`, `fmtSeconds`, `DURATION_MINUTES`, `durationColumns`, `moveTimeChart` |
| 12 | `view/games.js` | `gamesTab, GAMES_STEP, GAMES_SORTS, gamesSortSelect, eloDelta, ENDING_*, byEnding, endingPicker` |
| 13 | `view/overview.js` | `overview` und `ratingChart, hasRealRating, gamesPerDayChart, DAY_MIN_GAMES, DAYS_NOTE, bestWorstDays, coverageNote, noEngineCard, recentGames, gamesPerDayKpi` |

Bevor ein Helfer verschoben wird, prüft `grep` im Rest von `metaView.js`, ob ein anderer Tab ihn mitbenutzt. Wird er geteilt, kommt er nach `view/cards.js` bzw. `view/charts.js` statt in die Tab-Datei. Das ist ein eigener kleiner Commit vor dem Tab-Umzug.

Jeder Task besteht aus drei Schritten:
- [ ] Verschieben; `RENDERERS` in `metaView.js` importiert die Funktion.
- [ ] Push. Erwartet: Tests und `render-diff` grün. Der Nutzer öffnet genau diesen Tab, klickt eine Zahl und einen Schalter, die Konsole bleibt ohne Fehler.
- [ ] Commit `Refactoring: Tab <Name> nach view/<datei>.js`.

### Task 14: Abschluss

- [ ] `metaView.js` enthält nur noch Kopfkommentar, Imports, `META_TABS`, `RENDERERS`, `renderMetaTab` und die Re-Exporte. Der Kopfkommentar beschreibt die neue Aufteilung.
- [ ] Den Job `render-diff` so lassen: Er schützt auch künftige Refactorings. Seine Bedingung „nicht auf main“ bleibt.
- [ ] Ein frischer Reviewer prüft den ganzen Branch. Danach Freigabe durch den Nutzer und Merge nach main.
