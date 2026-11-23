# Einzelanalyse schlank – Implementation Plan

**Status:** Accepted (2026-11-23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Einzelanalyse wird zur reinen Detailansicht ohne Lade- und Filterleiste. Die Meta-Analyse öffnet nur noch analysierte Partien und zeigt sonst einen Hinweis mit Analysieren-Button.

**Architecture:** Der Einzelanalyse-Modus (`appMode === 'game'`, nur per Deep-Link) blendet in `applyAppMode` (js/main.js) Steuerelemente aus. Für die Zeit vor dem ersten Zeichnen gibt es `html[data-boot-mode="game"]`-CSS. In der Meta-Analyse entscheidet eine reine Funktion `gameOpenState` (metaRecords.js), ob `openGame` öffnet oder ein Hinweis-Popover im vorhandenen `#meta-games-pop` erscheint.

**Tech Stack:** Vanilla-JS-Module, eigener Browser-Testrunner (`tests/index.html`), Server `serve.ps1` (Port 5500).

**Spec:** `docs/superpowers/specs/2026-11-23-einzelanalyse-schlank-design.md`

## Global Constraints

- UI-Texte auf Deutsch, wörtlich: „Noch nicht analysiert.“, „Analysieren“, „Kann nicht analysiert werden (keine Züge).“
- Elemente nur ausblenden, nicht aus `index.html` löschen: Die Meta-Analyse nutzt sie weiter.
- Kleine Schritte, jeder einzeln im Browser geprüft (http://localhost:5500/, Strg+F5 wegen `sw.js`), bevor committet wird.
- Die Meta-Analyse-Leiste ändert sich nicht.

## Review Focus

1. **Klick auf eine Tabellenzeile:** Der Klick, der das Hinweis-Popover öffnet, darf es nicht gleich wieder schließen. Der Dokument-Listener für Klicks außerhalb (metaController.js) sieht dasselbe Event. Test: Task 3, Schritt 6a.
2. **Analyse fertig, Popover noch offen:** Ein erneuter Klick muss die Partie öffnen, nicht den alten Hinweis zeigen. Test: Task 3, Schritt 6c.
3. **Hinweis aus der Partienliste hinter einer Anzahl:** Das Popover ersetzt die Liste an derselben Stelle. Ein weiterer Klick auf dieselbe Anzahl darf es nicht irrtümlich als „gleiche Liste“ schließen (`dataset.for`). Test: Task 3, Schritt 6b.
4. **Deep-Link auf eine nicht analysierte Partie:** Der Fortschritt bleibt sichtbar, und die Analyse lässt sich abbrechen, obwohl die Lupe weg ist. Test: Task 1, Schritt 3c.
5. **Aufblitzen der Filter beim Laden des Einzelanalyse-Tabs:** Vor `applyAppMode` dürfen keine Filter sichtbar sein. Test: Task 1, Schritt 3a.

---

### Task 1: Leiste im Einzelanalyse-Modus ausblenden

**Files:**
- Modify: `js/main.js` (`applyAppMode` ab ~Z. 2095; `setAnalyzing` ~Z. 1190)
- Modify: `index.html:53` (Boot-Skript)
- Modify: `css/styles.css` (~Z. 2596, Boot-Mode-Block)

**Interfaces:**
- Produces: `html[data-boot-mode="game"]` (gesetzt in index.html, gelöscht in `applyAppMode` wie bisher)

- [ ] **Step 1: Im Einzelanalyse-Modus in `applyAppMode` diese Elemente ausblenden (`hidden`):** `#platform-toggle-btn`, `#username-picker`, `#time-range-picker` (inkl. der Zeile für benutzerdefinierte Daten, `customDateRow`), `#game-type-picker`, `#outcome-filter-picker`, `#color-filter-picker`, `#fetch-games-btn`, `#opponent-picker`.
- [ ] **Step 2: `#analyze-toggle-btn` im Einzelanalyse-Modus nur zeigen, solange analysiert wird.** In `setAnalyzing(on)` und `applyAppMode`: `hidden = appMode === 'game' && !isAnalyzing`. So bleiben Fortschritt und Abbrechen beim Rückfall auf einen alten Link erhalten.
- [ ] **Step 3: Boot-Modus für das Einzelanalyse-Tab.** Das Skript in index.html setzt sonst `bootMode = 'game'`. CSS blendet unter `html[data-boot-mode="game"]` dieselben Elemente wie in Schritt 1 und `#analyze-toggle-btn` aus.
- [ ] **Step 3a–c: Im Browser prüfen.**
  a) Eine Partie aus der Meta-Analyse öffnen, mit Strg+F5 neu laden: Es blitzen keine Filter auf, sichtbar sind nur Partie-Anzeige, Darstellung und Zahnrad.
  b) Die Meta-Analyse-Leiste ist unverändert.
  c) Ein Deep-Link auf eine nicht analysierte Partie zeigt den Analyse-Button mit Fortschritt. Abbrechen funktioniert, danach ist der Button weg.
- [ ] **Step 4: Commit** `Einzelanalyse: Lade- und Filterleiste ausgeblendet`

### Task 2: Partie-Etikett mit eigenem Namen, ohne Dropdown

**Files:**
- Modify: `js/main.js` (`opponentLabel` ~Z. 602; `openDeepLinkedGame` ~Z. 2170)
- Modify: `css/styles.css` (bei `#game-btn` ~Z. 2650)

**Interfaces:**
- Produces: `playerLabel(game, ownUsername, own: boolean) -> string` mit „Name (Elo)“ bzw. ohne Elo nur „Name“. `opponentLabel(game, u)` bleibt als `playerLabel(game, u, false)` erhalten.

- [ ] **Step 1: `playerLabel` einführen** (s. Interfaces) und `opponentLabel` darauf zurückführen.
- [ ] **Step 2: Etikett im Einzelanalyse-Tab.** In `openDeepLinkedGame` die Option für `gameSelect` so bauen, dass `shortHtml`/`html` lauten: `<Spielart-Icon> <Eigener (Elo)> vs <Gegner (Elo)> — <Datum> <S/R/N-Badge> <✓ falls gespeichert>`. Die Bausteine kommen aus `buildGameOptions`, mit `playerLabel(game, user, true)` davor. Danach `gameSelect.disabled = true`.
- [ ] **Step 3: Etikett-Optik.** Klasse `static` an `#game-picker`, nur im Einzelanalyse-Modus. Dazu CSS: `#game-picker.static #game-btn` mit `cursor: default`, voller Deckkraft (kein ausgegrautes Disabled) und ohne Aufklapp-Pfeil.
- [ ] **Step 4: Im Browser prüfen:** Etikett „du (Elo) vs Gegner (Elo) — Datum“ mit Badge. Ein Klick öffnet kein Menü. Das Etikett sieht nicht ausgegraut aus und funktioniert auch bei schmalem Fenster und bei Partien ohne Elo.
- [ ] **Step 5: Commit** `Einzelanalyse: Partie-Etikett mit eigenem Namen statt Dropdown`

### Task 3: Hinweis-Popover für nicht analysierte Partien

**Files:**
- Modify: `js/meta/metaRecords.js` (bei `hasMoves`, Z. 41)
- Test: `tests/metaRecords.test.js`
- Modify: `js/meta/metaView.js` (neben `gameListHtml` ~Z. 214)
- Modify: `js/meta/metaController.js` (`openGame` Z. 822; Klick-Handler Z. 295–320 und ~Z. 398)
- Modify: `css/styles.css` (bei `#meta-games-pop` ~Z. 2425)

**Interfaces:**
- Produces: `gameOpenState(r, engine, queue) -> 'open' | 'analyze' | 'running' | 'queued' | 'nomoves'` (metaRecords.js, exportiert). `engine` ist der Engine-Datensatz oder `null`, `queue` ist `'running' | 'queued' | null`. Reihenfolge der Prüfung: `engine` → `'open'`; `!hasMoves(r)` → `'nomoves'`; `queue` → `queue`; sonst `'analyze'`.
- Produces: `gameHintHtml(r, state) -> string` (metaView.js, exportiert)
- Consumes: `enqueueGame(url)`, `ctx().queueState`, `engineCache`, `gamesPopEl`, `closeGamesPop()`

- [ ] **Step 1: Failing test** in `tests/metaRecords.test.js`, `describe('metaRecords: gameOpenState')`:
  - `gameOpenState({ plies: 40 }, {}, null) === 'open'`
  - `gameOpenState({ plies: 0 }, {}, null) === 'open'` (Engine-Werte gehen vor)
  - `gameOpenState({ plies: 0 }, null, null) === 'nomoves'`
  - `gameOpenState({ plies: 40 }, null, 'running') === 'running'`
  - `gameOpenState({ plies: 40 }, null, 'queued') === 'queued'`
  - `gameOpenState({ plies: 40 }, null, null) === 'analyze'`
- [ ] **Step 2:** Den Server starten und http://localhost:5500/tests/ öffnen. Erwartet: Die neuen Tests schlagen fehl, weil `gameOpenState` nicht exportiert ist.
- [ ] **Step 3: `gameOpenState` implementieren** (s. Interfaces), danach die Tests erneut laufen lassen. Erwartet: alle grün.
- [ ] **Step 4: `gameHintHtml(r, state)`.** Kopfzeile wie in der Partienliste („vs Gegner — Datum“, `.meta-pop-head`). Darunter der Text je nach Zustand: `analyze` → „Noch nicht analysiert.“ und `<button data-hint-analyze="${url}">🔍 Analysieren</button>`; `running` → „Wird gerade analysiert …“; `queued` → „Wartet auf die Analyse.“; `nomoves` → „Kann nicht analysiert werden (keine Züge).“. CSS dazu: `.meta-pop-hint` mit Innenabstand, Button im Stil von `.meta-pop-more`.
- [ ] **Step 5: `openGame(url, anchorRect)` im Controller.** `gameOpenState(r, engineCache.get(r.url) ?? null, ctx().queueState(r))` aufrufen. Bei `'open'` wie bisher den Tab öffnen. Sonst `gamesPopEl.innerHTML = gameHintHtml(…)` setzen, `dataset.for = 'hint'` und das Popover wie in `openGamesPop` unter oder über `anchorRect` positionieren. Die Positionierung kommt in eine gemeinsame Hilfsfunktion `placePop(rect)`, die auch `openGamesPop` nutzt.
  - Aufrufer: die Tabellenzeile mit `gameRow.getBoundingClientRect()`. Der Listeneintrag in `#meta-games-pop` liefert `item.getBoundingClientRect()` **vor** `closeGamesPop()`.
  - `gamesPopEl`-Klick: `[data-hint-analyze]` → `e.stopPropagation()`, `enqueueGame(url)`, `closeGamesPop()`.
  - Dokument-Listener: Klicks auf `[data-game]` schließen das Popover nicht.
- [ ] **Step 6a–d: Im Browser prüfen.**
  a) Ein Klick auf eine nicht analysierte Zeile im Tab „Partien“ zeigt das Popover an der Zeile, und es bleibt offen.
  b) Über eine anklickbare Anzahl → Eintrag einer nicht analysierten Partie: Das Popover erscheint an derselben Stelle. Ein erneuter Klick auf die Anzahl öffnet wieder die Liste.
  c) „Analysieren“: Die Partie steht in der Warteschlange bzw. wird analysiert (Sanduhr bzw. Spinner in der Tabelle). Ein Klick während der Analyse zeigt „Wird gerade analysiert …“, nach Abschluss öffnet ein Klick den Tab.
  d) Eine Partie ohne Züge zeigt den Text ohne Button. Escape, Scrollen und ein Klick daneben schließen das Popover.
- [ ] **Step 7: Commit** `Meta-Analyse: nicht analysierte Partien zeigen Hinweis mit Analysieren-Button`

### Task 4: Veralteten Starttext ersetzen

**Files:**
- Modify: `index.html:380-389` (`#game-empty`)

- [ ] **Step 1: Inhalt von `#game-empty` ersetzen** durch `<h2>Spiel-Analyse</h2><p>Partie wird geladen …</p>`. Dieser Text steht nur, bis die Partie geladen bzw. analysiert ist.
- [ ] **Step 2: Im Browser prüfen:** Beim Öffnen einer Partie erscheint kurz „Partie wird geladen …“, danach Brett und Analyse. Bei einem kaputten Link kommt der Fehler-Toast, der Text bleibt stehen.
- [ ] **Step 3: Commit** `Einzelanalyse: Starttext an Deep-Link-Ablauf angepasst`
