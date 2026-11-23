# Matt-Arten – Implementation Plan

**Status:** Accepted (2026-11-23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Mattpartie bekommt beim Laden eine Matt-Art (12 Muster oder „Sonstiges“) und Zusatzmerkmale. Ein neuer Tab „Matt“ wertet sie aus, und der Tab „Partien“ zeigt sie als Tooltip.

**Architecture:** Die reine Funktion `detectMate` (neues Modul `js/analysis/mateType.js`) bekommt Schlussstellung (FEN) und Mattzug (chess.js-verbose-Move). `buildFastRecord` ruft sie auf und ergänzt `byMe`. Die Ansicht (`js/meta/metaView.js`) bekommt den Renderer `mateTab`.

**Tech Stack:** Vanilla-JS-Module, chess.js 0.13.4 über `js/chessLib.js`, Browser-Testrunner `tests/index.html` (headless: `bash <scratchpad>/runtests.sh`, siehe Ausführung), Server `serve.ps1`.

**Spec:** `docs/superpowers/specs/2026-11-23-matt-arten-design.md`

## Global Constraints

- Genau 12 Muster, geprüft in der Spec-Reihenfolge: scholars → smothered → kq → kr → arabian → anastasia → epaulette → dovetail → kiss → ladder → backrank → pawn, sonst `other`.
- Deutsche Bezeichnungen (`MATE_LABEL`): scholars „Schäfermatt“, smothered „Ersticktes Matt“, kq „Grundmatt K+D gegen K“, kr „Grundmatt K+T gegen K“, arabian „Arabisches Matt“, anastasia „Anastasia-Matt“, epaulette „Epaulettenmatt“, dovetail „Schwalbenschwanzmatt“, kiss „Damenkuss“, ladder „Treppenmatt“, backrank „Grundreihenmatt“, pawn „Bauernmatt“, other „Sonstiges Matt“.
- Ein Fehler in der Erkennung darf das Laden nicht stören: `detectMate` wirft nie, im Zweifel gibt es `type: 'other'`.
- Keine Änderung am GitHub-Job und an den Master-Dateien.
- Jede Test-Stellung prüft zuerst mit chess.js `in_checkmate() === true`, dass sie wirklich Matt ist.

## Review Focus

1. **Datenfehler:** Partie endet mit „#“, aber das Ergebnis ist Remis oder passt nicht zur Zugfarbe. Dann entscheidet `byMe` nach der Zugfarbe, und die Partie zählt trotzdem. Test: Task 3, Schritt 1.
2. **Matt durch Rochade oder en passant:** Die Schach gebende Figur ist nicht die gezogene. `piece` muss der Turm bzw. die abziehende Figur sein, ohne Absturz. Test: Task 1, Schritt 1.
3. **Partie mit FEN-Startstellung (Chess960 oder Vorgabe):** Schäfermatt darf nicht anschlagen, alles andere funktioniert. Test: Task 2, Schritt 1.
4. **0 Mattpartien unter den Filtern:** Der Tab zeigt einen Hinweis statt leerer oder kaputter Kacheln. Test: Task 4, Schritt 3.
5. **Umwandlung zur Dame mit Matt:** Sie zählt als Figur `q` mit `promotion: true`, nie als Bauernmatt. Test: Task 1, Schritt 1.

---

### Task 1: Grundgerüst `detectMate` mit Zusatzmerkmalen

**Files:**
- Create: `js/analysis/mateType.js`
- Create: `tests/mateType.test.js`, eingebunden in `tests/index.html`

**Interfaces:**
- Produces: `detectMate(fen: string, move: {from, to, piece, color, flags, promotion?}, opts?: {standardStart?: boolean, moveNumber?: number}) -> {type: string, piece: 'p'|'n'|'b'|'r'|'q', doubleCheck: boolean, discovered: boolean, promotion: boolean} | null`. `null`, wenn die Stellung kein Matt ist. `moveNumber` ist der eigene Zug des Angreifers (1-basiert), nur für Schäfermatt.
- Produces (intern, exportiert für Tests): `checkers(board, kingSquare, byColor) -> string[]`. Das sind die Felder der Figuren von `byColor`, die das Feld angreifen. Die Funktion arbeitet auf `new Chess(fen).board()` mit eigener Angriffsprüfung (Springer, König, Bauern-Schlagrichtung, Gleitfiguren mit Blockadeprüfung), weil chess.js 0.13 kein `attackers()` hat.

- [ ] **Schritt 1: Fehlschlagende Tests** `describe('mateType: Merkmale')`:
  - Keine Mattstellung (Grundstellung, beliebiger Zug) → `null`.
  - Turmmatt Ra1-a8 in `R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1` → `piece 'r'`, `doubleCheck false`, `discovered false`, `promotion false`.
  - Ein selbst gebautes Abzugsmatt (gezogene Figur gibt kein Schach) → `discovered true`, `piece` = die Schach gebende Figur.
  - Ein Doppelschach-Matt → `doubleCheck true`, `piece` = die gezogene Figur.
  - Umwandlungsmatt in eine Dame (`flags` enthält 'p', `promotion: 'q'`) → `piece 'q'`, `promotion true`.
  - Rochade-Matt (z. B. O-O-O mit Turm-Schach auf der d-Linie) → `piece 'r'`, kein Absturz.
  - Für jede Stellung zuerst `new Chess(fen).in_checkmate() === true` prüfen.
- [ ] **Schritt 2:** Tests laufen lassen. Erwartet: Import schlägt fehl bzw. die Tests sind rot.
- [ ] **Schritt 3:** `detectMate` mit `type: 'other'` für jedes Matt implementieren, dazu `checkers`. Die ganze Funktion steckt in einem `try`, im Fehlerfall gibt sie `{type:'other', …}` mit dem besten Wissen zurück.
- [ ] **Schritt 4:** Tests laufen lassen. Erwartet: neue Tests grün, Gesamtstand unverändert, abgesehen vom bekannten Fehlschlag `accuracy: computeGameAccuracy`.
- [ ] **Schritt 5: Commit** `Matt-Erkennung: Grundgerüst mit Mattfigur, Doppelschach, Abzug, Umwandlung`

### Task 2: Die 12 Muster

**Files:**
- Modify: `js/analysis/mateType.js`
- Modify: `tests/mateType.test.js`

**Interfaces:**
- Consumes: `detectMate`, `checkers` aus Task 1
- Produces: `MATE_TYPES` (Array der 12 IDs + 'other', in Prüfreihenfolge), exportiert aus mateType.js

- [ ] **Schritt 1: Fehlschlagende Tests** `describe('mateType: Muster')`, je Muster eine echte Mattstellung, die `type` auf die ID setzt. Feste Stellungen:
  - scholars: `r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4`, Zug h5→f7 (Dame, Schlag), `{standardStart: true, moveNumber: 4}` → `'scholars'`. Dieselbe Stellung mit `standardStart: false` → nicht `'scholars'`.
  - smothered: `6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1`, Zug g5→f7 (Springer) → `'smothered'`.
  - kq: `7k/6Q1/6K1/8/8/8/8/8 b - - 0 1`, Zug g1→g7 → `'kq'`, also nicht `'kiss'`.
  - kr: `R6k/8/6K1/8/8/8/8/8 b - - 0 1`, Zug a1→a8 → `'kr'`.
  - backrank: `R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1`, Zug a1→a8 → `'backrank'`.
  - Weitere Muster (arabian, anastasia, epaulette, dovetail, kiss, ladder, pawn) baut der Umsetzer nach der Spec-Definition. Pro Muster gibt es eine Stellung.
  - Rangfolge: eine gedeckte Dame direkt am König auf der Randreihe, gedeckt von einem Turm → `'kiss'`, nicht `'ladder'`.
- [ ] **Schritt 2:** Tests laufen lassen. Erwartet: die neuen Tests rot.
- [ ] **Schritt 3:** Pro Muster eine Prüffunktion implementieren, genau nach den Definitionen der Spec. Sie werden in der Reihenfolge von `MATE_TYPES` aufgerufen, das erste `true` gewinnt.
- [ ] **Schritt 4:** Tests laufen lassen. Erwartet: alle neuen Tests grün.
- [ ] **Schritt 5: Commit** `Matt-Erkennung: 12 Mattbilder`

### Task 3: Ins Laden einbauen (`buildFastRecord`)

**Files:**
- Modify: `js/meta/metaRecords.js` (`buildFastRecord` ~Z. 149–232, neue Konstante `MATE_LABEL` bei `TERMINATION_LABEL`)
- Modify: `tests/metaRecords.test.js`

**Interfaces:**
- Consumes: `detectMate`
- Produces: Fast-Record-Feld `mate: {type, piece, doubleCheck, discovered, promotion, byMe} | null`; `MATE_LABEL: Record<id, string>` (Texte s. Global Constraints).

- [ ] **Schritt 1: Fehlschlagende Tests** in `tests/metaRecords.test.js`, `describe('metaRecords: mate')`. Mit dem vorhandenen `rawGame()`-Helfer:
  - Schäfermatt-PGN (`1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#`), weißer Spieler gewinnt → `mate.type 'scholars'`, `mate.byMe true`.
  - Dieselbe Partie aus Sicht von Schwarz → `byMe false`.
  - Dieselbe Partie mit Ergebnis Remis (Datenfehler) → `byMe` nach Zugfarbe, also bei weißem Spieler true.
  - Eine Partie ohne Matt → `mate null`.
- [ ] **Schritt 2:** Tests laufen lassen. Erwartet: rot.
- [ ] **Schritt 3:** In `buildFastRecord` nur bei `endsInMate` aufrufen: `detectMate(parser.fen(), verbose.at(-1), { standardStart: !parser.header().FEN, moveNumber: Math.ceil(sans.length / 2) })`. Dann `byMe` aus `result` (W → true, L → false), sonst `verbose.at(-1).color === color`.
- [ ] **Schritt 4:** Tests laufen lassen. Erwartet: grün. Zusätzlich lädt die App headless ohne Konsolenfehler.
- [ ] **Schritt 5: Commit** `Matt-Erkennung: Matt-Art an jeder Partie`

### Task 4: Tab „Matt“

**Files:**
- Modify: `js/meta/metaView.js` (`META_TABS` Z. 14, `RENDERERS` ~Z. 1595, neuer Renderer `mateTab`, `CARD_ICONS`)
- Modify: `js/meta/tabPieces.js` (`BY_TAB`, `tabPieceSvg`)
- Modify: `css/styles.css`, nur falls nötig

**Interfaces:**
- Consumes: `r.mate`, `MATE_LABEL`, `MATE_TYPES`; vorhandene Helfer `card`, `kpi`, `hbars`, `gamesCount`, `wdlBar`
- Produces: Tab-ID `mate`, Label „Matt“, steht in `META_TABS` direkt hinter `time`.

- [ ] **Schritt 1: Kacheln** laut Spec Ziel 3:
  - **Häufigkeit:** `hbars` über alle Matt-Arten mit Anzahl > 0, absteigend. Die Werte sind `gamesCount`.
  - **Gesetzt / kassiert:** pro Matt-Art zwei anklickbare Zahlen, gesetzt (`byMe`) und kassiert, dazu ein zweifarbiger Balken in `--meta-win`/`--meta-loss`.
  - **Sonstiges nach Figur:** `hbars` nach `piece`, mit den deutschen Figurennamen aus dem vorhandenen `PIECE_LABEL`.
  - **Eckdaten** als `kpi`: Anteil der Partien mit Matt, häufigste Mattfigur (über alle), Ø Zug des Matts (`r.moves`), Doppelschach-, Abzugs- und Umwandlungsmatts. Die drei letzten sind anklickbar (`gamesCount`).
- [ ] **Schritt 2: Tab-Symbol.** In `tabPieces.js` bekommt `BY_TAB.mate` den König, gezeichnet um 90° gedreht und liegend auf der Linie (`H` = 56) an der Stelle des Königs. Er darf nach links über seinen Platz hinausragen, die Linie wird dort nicht gezeichnet.
- [ ] **Schritt 3: Leerer Zustand.** Ohne Mattpartie unter den Filtern zeigt der Tab eine `card` „Keine Mattpartien“ mit kurzem Hinweis.
- [ ] **Schritt 4: Prüfen.** Headless (CDP-Skript) mit `geieruno` werden alle Tabs inkl. „Matt“ ohne Fehler gerendert, und die Kachelzahl ist > 0. Danach prüft der Nutzer im Browser die Optik und macht Stichproben.
- [ ] **Schritt 5: Commit** `Meta-Analyse: Tab Matt`

### Task 5: Matt-Art im Tab „Partien“

**Files:**
- Modify: `js/meta/metaView.js` (`gamesTab`, Zelle `meta-res-elo` ~Z. 1578)

- [ ] **Schritt 1:** Bei `r.mate` den `data-tip` der Ergebniszelle um eine Zeile ergänzen: „Matt: <MATE_LABEL> (gesetzt|kassiert)“. Gibt es noch keinen `data-tip`, enthält er nur diese Zeile.
- [ ] **Schritt 2:** Headless prüfen, dass mindestens eine Zeile „Matt:“ im `data-tip` hat. Danach prüft der Nutzer den Tooltip im Browser.
- [ ] **Schritt 3: Commit** `Partien: Matt-Art im Ergebnis-Tooltip`
