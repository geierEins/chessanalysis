# Eröffnungen nach Wahl Implementation Plan

**Status:** Accepted (2026-11-24)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Partie weiß, wer die Eröffnung gewählt hat. Der Tab „Eröffnungen“ zeigt pro Farbe „Meine Wahl“ und „Wahl des Gegners“ als getrennte Tabellen.

**Architecture:** `openingBook.js` liefert alle benannten Knoten entlang der Zugfolge mit Halbzug. `metaRecords.js` leitet daraus Gruppe und Wähler ab (neue Felder im Fast-Record, der bei jedem Laden neu gebaut wird, also keine Migration). `metaView.js` teilt die Tabellen auf.

**Tech Stack:** Vanilla-JS-Module, eigener Test-Runner im Browser (`tests/index.html`, über `serve.ps1` auf http://localhost:5500/tests/).

**Spec:** `docs/superpowers/specs/2026-11-24-eroeffnung-wahl-design.md`

## Global Constraints

- Sammelnamen sind genau `King's Pawn Game` und `Queen's Pawn Game`.
- Ungerader Halbzug (1, 3, 5 …) bedeutet Weiß, gerader bedeutet Schwarz.
- Unterüberschriften: „Meine Wahl“ und „Wahl des Gegners“.
- Die Kacheln „Stärkste und schwächste“, „Erster Zug als Weiß“ und „Als Schwarz gegen …“ bleiben unverändert (sie nutzen weiter `r.family`).
- Das Suchfeld pro Farbe (`data-opening-search`, schon im Arbeitsverzeichnis, noch nicht committet) filtert beide Tabellen der Kachel. Beim Tabwechsel wird es geleert.

## Review Focus

- Zugumstellung (1.e4 e5 2.Sc3 Sf6 3.Sf3 Sc6 → Four Knights Game): Es wählt Schwarz (Halbzug 6), nicht Vienna (Weiß). Test in Task 1.
- Untervariante eines Sammelnamens („King's Pawn Game: Wayward Queen Attack, Kiddie Countergambit“): Gruppiert wird unter der Variante „King's Pawn Game: Wayward Queen Attack“. Der Wähler ist, wer die Variante erreicht hat, nicht die Untervariante. Test in Task 1.
- Nur der Sammelname (1.e4 e5 2.Ke2 ohne eigenen Namen o. Ä.): Gruppe „King's Pawn Game“, gewählt hat der Spieler von 1.e4. Test in Task 1.
- Partie ohne Züge: `openingGroup` und `openingByMe` sind `null`, die Partie erscheint in keiner der beiden Tabellen. Test in Task 1.
- Suche trifft nur eine Tabelle: Die andere zeigt ihren Leer-Hinweis, der Hinweis „X von Y“ zählt über beide. Manuelle Prüfung in Task 2.

---

### Task 1: Gruppe und Wähler pro Partie

**Files:**
- Modify: `js/analysis/openingBook.js` (neben `openingNameForLine`, Zeile ~63)
- Modify: `js/meta/metaRecords.js` (bei `openingFamily` Zeile ~111, Record-Felder Zeile ~258)
- Test: `tests/metaRecords.test.js`

**Interfaces:**
- Produces: `namedNodesForLine(sanMoves: string[]): Array<{ ply: number, name: string }>` in `openingBook.js`. Liefert alle benannten Knoten entlang des Pfads in Reihenfolge, `ply` ist 1-basiert. `openingNameForLine` wird zu „Name des letzten Eintrags oder null“ (Verhalten unverändert).
- Produces: `export function openingChoice(named, color): { group: string|null, byMe: boolean|null }` in `metaRecords.js`, wobei `color` gleich `'w'|'b'` ist.
- Produces: Record-Felder `openingGroup` (string|null) und `openingByMe` (boolean|null).

- [ ] **Step 1: Tests schreiben** (in `tests/metaRecords.test.js`, neuer `describe('metaRecords: openingChoice', …)`; `named` direkt aus `namedNodesForLine` mit SAN-Arrays):
  - `1.e4 c5`, Farbe `'w'` → `{ group: 'Sicilian Defense', byMe: false }`
  - `1.e4 e5 2.Nf3 Nc6 3.Bc4`, Farbe `'w'` → `{ group: 'Italian Game', byMe: true }`
  - `1.e4 e5 2.Nc3 Nf6 3.Nf3 Nc6`, Farbe `'w'` → `group: 'Four Knights Game'`, `byMe: false`
  - `1.e4 e5 2.Qh5 Nc6 3.Bc4 g6 4.Qf3 f5`, Farbe `'b'` → `group: "King's Pawn Game: Wayward Queen Attack"`, `byMe: false` (prüfen, dass die Zugfolge im Buch die Kiddie-Untervariante erreicht. Falls nicht, eine echte Untervariante aus `openingBookData.js` nehmen.)
  - Nur 1.e4 (`['e4']`), Farbe `'b'` → `{ group: "King's Pawn Game", byMe: false }`
  - `openingChoice([], 'w')` → `{ group: null, byMe: null }`
  - Am bestehenden Scholar's-Mate-Record (`buildFastRecord(rawGame(), 'alice')`): `r.openingGroup` ist ein String, `r.openingByMe` ist ein Boolean.

- [ ] **Step 2: Tests im Browser laufen lassen** (http://localhost:5500/tests/). Erwartet: die neuen Tests schlagen fehl („not a function“ / undefined).

- [ ] **Step 3: Implementieren**
  - `namedNodesForLine` nutzt denselben Trie-Durchlauf wie `openingNameForLine`.
  - `openingChoice`: Familie des letzten Namens bestimmen (`openingFamily`).
    - Normaler Fall: Gruppe ist die Familie. Maßgeblicher Halbzug ist der erste Eintrag, dessen Familie gleich ist.
    - Sammelname: Ist der letzte Name nur der Sammelname, ist die Gruppe der Sammelname und es zählt der erste Halbzug mit dieser Familie. Sonst ist die Gruppe gleich `Familie + ': ' + Variante`, wobei Variante der Teil nach dem Doppelpunkt bis zum ersten Komma ist (getrimmt). Maßgeblicher Halbzug ist dann der erste Eintrag, dessen Name gleich der Gruppe ist oder mit `Gruppe + ','` beginnt.
    - `byMe = (ply % 2 === 1) === (color === 'w')`.
  - Im Record: `const named = namedNodesForLine(sans)`, `opening` aus dem letzten Eintrag, dazu die neuen Felder aus `openingChoice(named, color)`.

- [ ] **Step 4: Tests im Browser.** Erwartet: alle grün, auch die bestehenden.

- [ ] **Step 5: Commit**
```bash
git add js/analysis/openingBook.js js/meta/metaRecords.js tests/metaRecords.test.js
git commit -m "Eröffnungen: Gruppe und Wähler pro Partie bestimmen"
```

### Task 2: Zwei Tabellen pro Farbe mit gemeinsamer Suche

**Files:**
- Modify: `js/meta/metaView.js` (`openings()`, Zeile ~880–945)
- Modify: `js/meta/metaController.js` (Suche, schon im Arbeitsverzeichnis, unverändert übernehmen)

**Interfaces:**
- Consumes: `r.openingGroup` und `r.openingByMe` aus Task 1, `ctx.openingSearch.w / .b`.

- [ ] **Step 1: `openings()` umbauen**
  - `table(list, color)` wird zu einer Kachel-Funktion. Sie filtert per Suche (auf `openingGroup` und `r.opening`, wie die jetzige Suche) und rendert:
    - das Suchfeld,
    - optional den Hinweis „X von Y Eröffnungen passen zur Suche.“ (über beide Tabellen gezählt),
    - `<h3>Meine Wahl</h3>` + Tabelle (Partien mit `openingByMe === true`),
    - `<h3>Wahl des Gegners</h3>` + Tabelle (`openingByMe === false`).
  - Gruppiert wird nach `r.openingGroup`. Partien mit `openingByMe == null` fallen weg.
  - Ist eine Tabelle leer, steht dort `<p class="meta-muted">Keine Eröffnung.</p>` (bzw. bei aktiver Suche „Keine passende Eröffnung.“).
  - Für den Tooltip: `data-opening` ist die Gruppe (bei Sammelnamen der volle Name „King's Pawn Game: …“, funktioniert mit `openingLine`). Die Bedingung `l[0].family` wird zu `l[0].openingGroup`. Die Varianten-Liste schneidet weiter das Präfix bis zum ersten Doppelpunkt ab.
  - Kachel-Notiz unter „Mit Schwarz“ um einen Satz ergänzen: „Meine Wahl / Wahl des Gegners: wer den Zug gespielt hat, mit dem der Eröffnungsname entstand (bei King's/Queen's Pawn Game: die Variante).“

- [ ] **Step 2: Im Browser prüfen** (http://localhost:5500/, Tab Eröffnungen, Spieler schnaxlspringer):
  - Mit Weiß, Meine Wahl: Vienna Game oben (~452).
  - Mit Weiß, Wahl des Gegners: Scandinavian Defense oben (~121).
  - Mit Schwarz, Wahl des Gegners: „King's Pawn Game: Wayward Queen Attack“ (~92).
  - Suche „vienna“ in der Weiß-Kachel: Die Gegner-Tabelle zeigt den Leer-Hinweis. Dann den Tab wechseln und zurück: Das Feld ist leer, alles ist wieder sichtbar.
  - Sortierung per Spaltenkopf wirkt auf beide Tabellen. Keine Fehler in der Konsole.

- [ ] **Step 3: Commit**
```bash
git add js/meta/metaView.js js/meta/metaController.js
git commit -m "Eröffnungen: pro Farbe Meine Wahl / Wahl des Gegners, mit Suche"
```
