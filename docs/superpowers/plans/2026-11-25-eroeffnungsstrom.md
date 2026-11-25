# Eröffnungsstrom Implementation Plan

**Status:** Accepted (2026-11-25)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Kachel „Eröffnungsstrom“ im Tab Eröffnungen: die Eröffnungswege einer Farbe als Sankey-artige Bänder von links nach rechts, gefärbt nach Quote, mit zoomabhängiger Tiefe, Beschriftung auf den Bändern und Brettvorschau als Tooltip.

**Architecture:** Neues View-Modul `js/meta/view/openingStream.js` mit drei reinen Funktionen (Baum bauen → Geometrie → SVG-String) plus Zoom/Pan-Bindung. Die Kachel nutzt `fitChart` (in Pixelgröße gezeichnet), das eine kleine `bind`-Option bekommt; Zoom wird pro Farbe in einer Modul-Map gemerkt und überlebt so jedes Neuzeichnen des Tabs. Der Controller hält nur die gewählte Farbe.

**Tech Stack:** Vanilla ES-Module, SVG als String, eigenes Test-Harness (`tests/test-runner.js`).

**Spec:** `docs/superpowers/specs/2026-11-25-eroeffnungsstrom-design.md` (Entwurf: `docs/superpowers/specs/2026-11-25-eroeffnungsstrom-entwurf.html`, Variante 4)

## Global Constraints

- Tests laufen im Browser unter `http://localhost:5500/tests/` (Server: `.\serve.ps1` in einer eigenen PowerShell, startet der Nutzer) und in CI per `node tests/run-node.mjs`. Lokal gibt es kein Node. Jede neue Testdatei muss auch in `tests/index.html` importiert werden.
- Höchstens 16 Halbzüge (`MAX_PLY = 16`).
- Ein Band wird nur gezeichnet, wenn es auf dem Bildschirm ≥ 4 px dick ist (`MIN_BAND_PX = 4`); Zoom 1× bis 14× (`MAX_ZOOM = 14`).
- Banddicke exakt proportional zur Partienzahl; alle Bänder zusammen etwa 82 % der Zeichenhöhe.
- Startansicht zeigt mindestens 6 Spalten (Halbzüge).
- Farbe = Quote: `hsl(round(score*125), 68%, 52%)` (rot → gelb → grün).
- Beschriftung: Schrift = min(13, Banddicke_px × 0,5) px; nur sichtbar bei ≥ 8,5 px und wenn die geschätzte Breite (Zeichen × 0,56 × Schrift) ≤ 94 % der Sehnenlänge der Bandmitte ist. Text: `named ? "<move> <label>" : "<move>"`.
- Zoomen nur mit Strg + Mausrad; normales Mausrad scrollt die Seite. Ziehen verschiebt. Doppelklick und Knopf „Zoom zurücksetzen“ (Kopfzeile, nur sichtbar wenn gezoomt) setzen zurück.
- Touch: Zwei-Finger-Zoom; ein Finger verschiebt nur im gezoomten Zustand, sonst scrollt er die Seite.
- Handy: Zeichenfläche mindestens 280 px hoch; sonst Seitenverhältnis 1200 / 460.
- Umschalter Weiß/Schwarz in der Kopfzeile, Start Weiß; beim Verlassen des Tabs zurück auf Weiß und Zoom zurückgesetzt. Zoom wird pro Farbe gemerkt.
- Tooltip: jedes Band trägt `data-opening` (Name) und `data-line` (Züge) wie die Baumzeilen; der bestehende Tooltip zeigt das Brett. Kein Text-Tooltip mit Quote.
- Leere Farbe: „Keine Partien mit dieser Farbe.“
- Texte auf Deutsch, Code-Kommentare auf Englisch wie im Projekt. Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Neuzeichnen des Tabs (Baumknoten aufklappen, Sortieren, laufende Analyse) während gezoomt: Ansicht bleibt exakt stehen. → manueller Check Task 5.
2. Normales Mausrad über der Kachel scrollt die Seite und zoomt nicht. → manueller Check Task 4.
3. Farbe ohne Partien bzw. gar keine Partien mit Eröffnungsweg: Hinweistext, kein Fehler, keine Division durch 0. → Test in Task 1 und Task 5.
4. Nur eine Partie / alle Partien auf demselben Weg: Startansicht trotzdem ≥ 6 Spalten, ein einziges volles Band. → Test in Task 2.
5. Filterwechsel während gezoomt (weniger Partien, flacherer Baum): Ansicht wird in die neuen Grenzen geklemmt, keine leere Fläche. → Clamp im Draw (Task 4), manueller Check Task 5.

---

### Task 1: Strombaum aus den Partien bauen

**Files:**
- Create: `js/meta/view/openingStream.js`
- Create: `tests/openingStream.test.js`
- Modify: `tests/index.html` (Import ergänzen)

**Interfaces:**
- Consumes: Datensätze aus `metaRecords.js` mit `r.result` (`'W'|'D'|'L'`) und `r.openingPath` (Schritte `{key, name, label, move, line, named, byMe}`); `score` aus `./format.js`.
- Produces:
  - `export const MAX_PLY = 16`
  - `export function buildStream(records, maxPly = MAX_PLY) -> StreamNode`
  - `StreamNode = { key: string, ply: number, move: string, label: string, named: boolean, name: string|null, line: string, n: number, score: number|null, children: StreamNode[] }`. Wurzel: `ply 0`, `key ''`, `move ''`. `children` nach `n` absteigend, bei Gleichstand in Reihenfolge des ersten Auftretens. Knoten-Identität wie im Baum: Pfad der `step.key`s.

- [ ] **Step 1: Failing tests schreiben** (`tests/openingStream.test.js`, Suite `openingStream: buildStream`). Hilfsfunktion `rec(result, moves)` baut `{ result, color: 'w', openingPath }` mit einem Schritt pro Zug: `{ key: m, name: 'N ' + m, label: m, move: m, line: moves.slice(0, i + 1).join(' '), named: i === 0, byMe: i % 2 === 0 }`.
  - `counts games along shared paths`: `[rec('W',['e4','e5']), rec('W',['e4','e5']), rec('L',['e4','c5']), rec('D',['d4'])]` → `root.n === 4`; `root.children.map(c=>c.key)` = `['e4','d4']`; `e4.n === 3`; `e4.children.map(c=>c.key)` = `['e5','c5']`; `e5.ply === 2`.
  - `score is the share of points`: `[rec('W',['e4']), rec('D',['e4'])]` → `e4.score === 0.75`.
  - `stops at maxPly`: ein Weg mit 18 Zügen → tiefster Knoten hat `ply === 16`; mit `buildStream(rs, 3)` → `ply === 3`.
  - `games without an opening path are left out`: `[rec('W',['e4']), {result:'W', openingPath: []}, {result:'L'}]` → `root.n === 1`.
  - `empty input`: `buildStream([])` → `root.n === 0`, `children.length === 0`, kein Fehler.
  - `keeps name, label, line of the step`: e5-Knoten hat `name 'N e5'`, `label 'e5'`, `line 'e4 e5'`, `named false`; e4-Knoten `named true`.
- [ ] **Step 2: Tests im Browser laufen lassen** (`http://localhost:5500/tests/`), erwartet: Fehler beim Import (`buildStream` fehlt).
- [ ] **Step 3: `buildStream` implementieren** in `js/meta/view/openingStream.js` (Dateikopf-Kommentar wie die anderen View-Module).
- [ ] **Step 4: Tests laufen lassen**, erwartet: alle `openingStream: buildStream` grün, übrige Suites unverändert grün.
- [ ] **Step 5: Commit** — `Eröffnungsstrom: Baum aus den Eröffnungswegen`.

### Task 2: Geometrie und zoomabhängige Sichtbarkeit

**Files:**
- Modify: `js/meta/view/openingStream.js`
- Modify: `tests/openingStream.test.js`

**Interfaces:**
- Consumes: `buildStream`, `StreamNode` (Task 1).
- Produces:
  - `export const MIN_BAND_PX = 4`, `export const MAX_ZOOM = 14`
  - `export function layoutStream(root, { W, H }) -> Layout`
    `Layout = { k: number /* px pro Partie bei 1× */, colW: number, cols0: number, x: (ply) => number, top: Map<StreamNode, number>, srcTop: Map<StreamNode, number> }` in Inhaltskoordinaten (px bei Zoom 1). Bandhöhe eines Knotens = `node.n * k`.
  - `export function visibleBands(root, layout, zoom) -> { bands: StreamNode[], stubs: Array<{ node: StreamNode, top: number, h: number, n: number }>, maxPly: number }`
- Geometrie (aus dem Entwurf, `bands()` in Variante 4): Zeichenhöhe `Hp = H - 8 - 22` (oben Luft, unten Achse), `k = 0.82 * Hp / root.n`. Jeder Knoten bekommt einen y-Bereich proportional zu `n` (Wurzel = ganzes `Hp`, Kinder teilen den Bereich des Elternknotens in Reihenfolge); Band zentriert in seinem Bereich: `top = 8 + mitte - n*k/2`. `srcTop` der Kinder: lückenlos gestapelt ab `top` des Elternknotens. Spalten: `x(ply) = 24 + ply * colW`, `colW = (W - 24 - 24) / cols0`. `cols0` = tiefster `ply` mit einem Knoten der Dicke `n*k ≥ MIN_BAND_PX` (dessen Vorfahren ebenfalls), geklemmt auf `[6, MAX_PLY]`.
- Sichtbarkeit: Knoten gezeichnet ⇔ Elternknoten gezeichnet (Wurzel gilt als gezeichnet, aber nicht als Band) und `n*k*zoom ≥ MIN_BAND_PX`. Für jeden gezeichneten Knoten (inkl. Wurzel) mit `rest = n − Σ gezeichnete Kinder.n > 0` gibt es einen Stummel: `top = top(node) + Σ gezeichnete Kinder.n * k`, `h = rest * k`. `maxPly` = größter `ply` unter `bands` (0 wenn keins).

- [ ] **Step 1: Failing tests** (Suite `openingStream: layout`), alle mit `{ W: 1200, H: 460 }`:
  - `bands are exactly proportional`: Daten aus Task 1 Test 1 → `(e4.n*k)/(root.n*k)` ≈ `3/4`, und Summe der Kinderhöhen = Wurzelhöhe (`expectClose`, 0.001).
  - `children stack inside the parent from its top`: `srcTop(e4) === top(root)`, `srcTop(d4) ≈ srcTop(e4) + e4.n*k`.
  - `thin bands become a stub`: 199 × `['e4']`, 1 × `['d4']` (k ≈ 1,76 px) → bei `zoom 1` ist d4 nicht in `bands`, die Wurzel hat einen Stummel mit `n 1`; bei `zoom 3` ist d4 in `bands` und die Wurzel hat keinen Stummel.
  - `games leaving the book end in a stub`: `rec('W',['e4','e5'])`, `rec('W',['e4'])` → e4 hat Stummel mit `n 1`, `top ≈ top(e4) + 1*k`.
  - `start view shows at least 6 columns`: eine einzige Partie `['e4']` → `cols0 === 6`, kein Fehler; 50 gleiche Partien mit 12 Zügen → `cols0 === 12`; mit 20 Zügen → `cols0 === 16`.
- [ ] **Step 2: Tests laufen lassen**, erwartet: FAIL (`layoutStream` fehlt).
- [ ] **Step 3: `layoutStream` und `visibleBands` implementieren.**
- [ ] **Step 4: Tests laufen lassen**, erwartet: grün.
- [ ] **Step 5: Commit** — `Eröffnungsstrom: Geometrie und zoomabhängige Tiefe`.

### Task 3: SVG zeichnen

**Files:**
- Modify: `js/meta/view/openingStream.js`
- Modify: `tests/openingStream.test.js`

**Interfaces:**
- Consumes: `layoutStream`, `visibleBands` (Task 2); `esc` aus `./format.js`.
- Produces: `export function streamSvg(root, layout, view, { W, H }) -> string`, `view = { zoom: number, x: number, y: number }` (x/y = Inhaltskoordinate der linken oberen Bildecke). Gezeichnet in Bildschirm-px: Punkt `(cx, cy)` → `((cx - x) * zoom, (cy - y) * zoom)`, damit Schriftgrößen und Schwellen px sind.
- Inhalt (Reihenfolge): `<defs>` mit einer Maske `id="ostream-fade"` (objectBoundingBox, Verlauf deckend → transparent von links nach rechts); Spaltenlinien und Achsentexte `${Math.ceil(p/2)}. Zug ${p % 2 ? 'Weiß' : 'Schwarz'}` für sichtbare Spalten; je Band ein `<path class="ostream-band" d="…" fill="<Quote-Farbe>" stroke="var(--meta-panel)" stroke-width="0.6" data-opening="${esc(name ?? '')}" data-line="${esc(line)}"/>` (Form: `bandPath` aus dem Entwurf, geschwungen von `srcTop` bei `x(ply-1)` zu `top` bei `x(ply)`); je Stummel ein `<rect … mask="url(#ostream-fade)">` von `x(ply)` mit Breite `0.35 * colW`, Farbe = Quote des Knotens; Beschriftungen als `<text>` mit `<textPath href="#ostream-p<i>">` auf der Bandmitte (Pfad in `<defs>`), Farbe `#141414`, nur wenn die Regel aus den Global Constraints es erlaubt. Bänder/Stummel komplett außerhalb des Bildausschnitts werden ausgelassen. Wurzel: `<svg class="meta-svg ostream" viewBox="0 0 W H" width="W" height="H">`.

- [ ] **Step 1: Failing tests** (Suite `openingStream: svg`), Daten 97 × `['e4']` (Schritt `named: true`, `name "King's Pawn Game"`, `label "King's Pawn Game"`, `move '1.e4'`) und 3 × `['d4']` (`move '1.d4'`), `{ W: 1200, H: 460 }`:
  - `bands carry the board-preview attributes`: SVG bei Zoom 1 enthält `data-line="e4"` und `data-opening="King&#39;s Pawn Game"` (bzw. das, was `esc` für `'` erzeugt — mit `esc("King's Pawn Game")` vergleichen).
  - `thick bands are labelled at once`: SVG bei Zoom 1 enthält `1.e4` und `Pawn Game` (Text im textPath).
  - `labels appear only when readable`: d4 bei `zoom 2.2` (Band sichtbar, Schrift ≈ 11 px) → enthält `1.d4`; bei `zoom 1.2` (Band ≈ 12,8 px, Schrift 6,4 px < 8,5) → enthält kein `1.d4`.
  - `stubs fade out`: Zoom 1 → genau zwei Elemente mit `mask="url(#ostream-fade)"` (beide Wege enden nach einem Halbzug; die Wurzel hat keinen Rest, d4 ist bei k ≈ 3,5 px × 3 Partien sichtbar).
  - `colors follow the score`: alle e4-Partien `'W'` → Band-Fill `hsl(125, 68%, 52%)`.
- [ ] **Step 2: Tests laufen lassen**, erwartet: FAIL.
- [ ] **Step 3: `streamSvg` implementieren** (Bandform und Textpfad wie `bandPath`/`centerPath` im Entwurf).
- [ ] **Step 4: Tests laufen lassen**, erwartet: grün.
- [ ] **Step 5: Commit** — `Eröffnungsstrom: SVG mit Beschriftung und Stummeln`.

### Task 4: Kachelinhalt mit Zoom und Verschieben

**Files:**
- Modify: `js/meta/view/charts.js` (`fitChart`, `layoutFitCharts`)
- Modify: `js/meta/view/openingStream.js`
- Modify: `css/styles.css` (neben `.meta-zoom`)
- Modify: `tests/openingStream.test.js`

**Interfaces:**
- Consumes: `buildStream`, `layoutStream`, `visibleBands`, `streamSvg`, `MAX_ZOOM`.
- Produces:
  - `fitChart(draw, { height, zoom, bind })`: neue Option `bind: (box: HTMLElement, redraw: () => void) => void`, von `layoutFitCharts` genau einmal pro Box aufgerufen (Markierung wie `zoomBound`), bevor gezeichnet wird; `redraw` verwirft `box.dataset.size` und zeichnet diese Box neu. Bestehende Aufrufer unverändert.
  - `export function streamCard(records, color) -> string` — leer (`buildStream(records).n === 0`): `<p class="meta-muted">Keine Partien mit dieser Farbe.</p>`; sonst `<div class="meta-ostream">${fitChart(draw, { bind })}<button type="button" class="meta-zoom-reset hidden">Zoom zurücksetzen</button></div>`.
  - `export function resetStreamViews()` — leert die Ansichten aller Farben.
- Zustand: `const streamViews = new Map()` (Farbe → `{ zoom, x, y }`), Default `{ zoom: 1, x: 0, y: 0 }`. `draw(W, H)` baut Layout (pro Baum und Größe zwischenspeichern), klemmt die gemerkte Ansicht (`zoom ∈ [1, MAX_ZOOM]`, `x ∈ [0, max(0, x(maxPly) + 0.35*colW + 24 − W/zoom)]` mit `maxPly` aus `visibleBands` beim aktuellen Zoom, `y ∈ [0, H − H/zoom]`), schreibt sie zurück und ruft `streamSvg`.
- `bind`: Reset-Knopf in die Kopfzeile der Karte verschieben (wie `bindZoom`); Strg + Mausrad zoomt um den Mauszeiger (Faktor `exp(-deltaY * 0.0015)`), ohne Strg nichts tun; Maus ziehen (Taste 0) verschiebt; Doppelklick und Knopf setzen auf `{1,0,0}`; Touch: zwei Pointer = Pinch-Zoom um den Mittelpunkt, ein Pointer verschiebt nur bei `zoom > 1`. Neuzeichnen per `requestAnimationFrame` gebündelt. Knopf-Sichtbarkeit und Klasse `zoomed` an `.meta-ostream` nach jedem Zeichnen setzen.
- CSS: `.meta-ostream { position: relative; }`, `.meta-ostream > .meta-fit { aspect-ratio: 1200 / 460; min-height: 280px; cursor: grab; user-select: none; touch-action: pan-y; }`, `.meta-ostream.zoomed > .meta-fit { touch-action: none; }`.

- [ ] **Step 1: Failing test** (Suite `openingStream: card`): `streamCard([], 'w')` enthält `Keine Partien mit dieser Farbe.`; `streamCard([rec('W',['e4'])], 'w')` enthält `data-fit=` und `meta-zoom-reset`.
- [ ] **Step 2: Tests laufen lassen**, erwartet: FAIL.
- [ ] **Step 3: `bind`-Option in `charts.js`, `streamCard`, `resetStreamViews`, Interaktion und CSS implementieren.**
- [ ] **Step 4: Tests laufen lassen**, erwartet: alle Suites grün (auch die übrigen, wegen `charts.js`).
- [ ] **Step 5: Commit** — `Eröffnungsstrom: Kachelinhalt mit Zoom und Verschieben`.

### Task 5: In den Tab einbauen

**Files:**
- Modify: `js/meta/view/openings.js` (nach der Karte „Mit Schwarz“)
- Modify: `js/meta/view/cards.js` (`CARD_ICONS`: `'Eröffnungsstrom': '🌊'`)
- Modify: `js/meta/metaView.js` (`resetStreamViews` re-exportieren)
- Modify: `js/meta/metaController.js` (Zustand, `ctx`, Klick, `clearSearches`)
- Modify: `tests/render-snapshot.mjs` (`ctx.streamColor: 'w'`)

**Interfaces:**
- Consumes: `streamCard`, `resetStreamViews` (Task 4); `card`, `segPicker` aus `./cards.js`.
- Produces: `ctx.streamColor: 'w' | 'b'`; Klickattribut `data-stream-color`.
- Karte: `card('Eröffnungsstrom', streamCard(color === 'b' ? black : white, color), { cls: 'w12', head: segPicker([['w', 'Weiß'], ['b', 'Schwarz']], color, 'stream-color', 'Farbe'), note })` mit `note`: „Jedes Band ist ein Weg durch die Eröffnung, so dick wie seine Partienzahl; die Farbe zeigt die Quote (rot schwach, grün stark). Dünne Wege erscheinen beim Hineinzoomen, ausblassende Enden zeigen, wo Partien das Buch verlassen. Zoomen: Strg + Mausrad, verschieben: ziehen, Doppelklick setzt zurück. Tooltip: die Stellung am Ende des Wegs.“
- Controller: `let streamColor = 'w'`; `ctx().streamColor`; Klick auf `[data-stream-color]` → `streamColor = dataset.streamColor; render()`; in `clearSearches()` `streamColor = 'w'` und `resetStreamViews()`.

- [ ] **Step 1: Einbauen wie oben.**
- [ ] **Step 2: Tests laufen lassen** (`http://localhost:5500/tests/`), erwartet: alle grün.
- [ ] **Step 3: Browsercheck** (`http://localhost:5500/`, Meta-Analyse → Eröffnungen, echte Daten):
  - Kachel unter den Bäumen, volle Breite, Weiß aktiv; Bänder rot/gelb/grün, dicke Bänder beschriftet, Stummel blassen aus.
  - Überfahren eines Bands zeigt die Brettvorschau mit der Stellung am Wegende.
  - Strg + Mausrad zoomt um den Zeiger, tiefere Ebenen und weitere Namen erscheinen; normales Mausrad scrollt die Seite; Ziehen verschiebt; Doppelklick und „Zoom zurücksetzen“ setzen zurück.
  - Gezoomt einen Baumknoten auf-/zuklappen und neu sortieren: Ansicht bleibt stehen. Umschalten auf Schwarz und zurück: jede Farbe behält ihre Ansicht.
  - Gezoomt den Filter ändern: Ansicht bleibt innerhalb des Stroms, keine leere Fläche.
  - Anderen Tab öffnen und zurück: Weiß, ungezoomt.
  - Schmales Fenster (Handy-Breite): Kachel ≥ 280 px hoch, keine horizontale Seitenscrollleiste.
  - Konsole ohne Fehler.
- [ ] **Step 4: Commit** — `Eröffnungen: Kachel „Eröffnungsstrom“ mit Umschalter Weiß/Schwarz`.
