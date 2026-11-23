# Matt-Arten: Erkennung und Tab „Matt“

**Status:** Accepted (2026-11-23)

## Warum

Der Nutzer möchte wissen, mit welchen Mattbildern seine Partien enden. Das gilt für Matts, die er
selbst setzt (Siege), genauso wie für Matts, die er kassiert (Niederlagen). Gezeigt werden sollen
Anzahl, Verteilung und die naheliegenden Statistiken dazu. Siege und Niederlagen lassen sich
zusätzlich über den Ergebnis-Filter oben trennen.

## Ziele

1. **Erkennung.** Jede Partie, die mit Matt endet, bekommt anhand von Schlussstellung und letztem
   Zug genau eine Matt-Art aus 12 benannten Mustern. Passt keines, gilt „Sonstiges Matt“.
2. **Zusatzmerkmale.** Für jedes Matt, ob benannt oder nicht, werden außerdem festgehalten:
   die mattsetzende Figur, ob es ein **Doppelschach-Matt** war, ob ein **Abzugsmatt** (das Schach
   kommt nicht von der gezogenen Figur), und ob ein **Umwandlungsmatt** (der Mattzug ist eine Umwandlung).
3. **Neuer Tab „Matt“** direkt hinter „Zeit & Partieende“. Er rechnet über die gefilterten Partien
   und zeigt:
   - **Häufigkeit:** Balken pro Matt-Art mit Anzahl. Die Anzahl ist anklickbar und listet die
     Partien (`gamesCount`).
   - **Gesetzt gegen kassiert:** pro Matt-Art Anzahl gesetzt (Sieg) und kassiert (Niederlage)
     als zweifarbiger Balken in den Sieg- und Niederlage-Farben. Beide Zahlen sind anklickbar.
   - **„Sonstiges Matt“ nach Figur:** Aufschlüsselung nach mattsetzender Figur.
   - **Eckdaten:** Anteil der Partien mit Matt, häufigste Mattfigur, durchschnittlicher Zug
     des Matts, Anzahl der Doppelschach-, Abzugs- und Umwandlungsmatts.
4. **Tab „Partien“:** Bei Mattpartien zeigt die Ergebniszelle die Matt-Art als Tooltip.

## Die 12 Muster

Geprüft wird in dieser Reihenfolge, das erste passende Muster gewinnt.
„Der König“ ist immer der mattgesetzte König, „Verteidiger“ ist seine Seite, „Angreifer“ die andere.
„Mattfigur“ ist die Figur, die Schach gibt. Wird beim Mattzug umgewandelt, ist das die neue Figur.

1. **Schäfermatt:** Die Dame schlägt auf f7 (gegen Schwarz) bzw. f2 (gegen Weiß) und setzt matt,
   gedeckt von einem Läufer, spätestens im 10. eigenen Zug des Angreifers. Nur bei Partien aus der
   Grundstellung, also ohne FEN-Header.
2. **Ersticktes Matt:** Ein Springer setzt matt, und jedes Nachbarfeld des Königs ist von
   einer Figur des Verteidigers besetzt oder liegt außerhalb des Bretts.
3. **Grundmatt K+D gegen K:** Der Verteidiger hat nur noch den König, der Angreifer nur König und Dame, keine Bauern.
4. **Grundmatt K+T gegen K:** Ebenso, mit Turm.
5. **Arabisches Matt:** Der König steht in einer Ecke. Ein Turm setzt auf der angrenzenden Linie
   oder Reihe matt, und ein Springer deckt den Turm und das Diagonalfeld der Ecke.
6. **Anastasia-Matt:** Der König steht auf der a- oder h-Linie. Turm oder Dame setzen entlang
   dieser Randlinie matt, und ein Springer deckt Fluchtfelder auf der Nachbarlinie. Eine eigene Figur
   des Verteidigers sperrt dort ein Feld neben dem König.
7. **Epaulettenmatt:** Die beiden seitlichen Nachbarfelder des Königs sind von eigenen Figuren des
   Verteidigers besetzt, und die Dame setzt frontal matt (gleiche Linie, von vorn).
8. **Schwalbenschwanzmatt:** Die Dame steht diagonal direkt neben dem König, setzt matt und ist gedeckt.
   Die beiden Fluchtfelder schräg hinter dem König sind von eigenen Figuren des Verteidigers besetzt.
9. **Damenkuss:** Die Dame steht direkt neben dem König (orthogonal oder diagonal), setzt matt und
   ist von einer weiteren Figur des Angreifers gedeckt. Das gilt auch am Rand und wenn die Deckung
   von einer zweiten Schwerfigur kommt. Damenkuss steht deshalb vor Treppenmatt.
10. **Treppenmatt:** Der König steht auf einer Randreihe oder Randlinie. Eine Schwerfigur (T/D) setzt
    auf dieser Randlinie matt, und eine **zweite** Schwerfigur des Angreifers kontrolliert die
    angrenzende Linie bzw. Reihe.
11. **Grundreihenmatt:** Der König steht auf seiner eigenen Grundreihe. Turm oder Dame setzen entlang
    dieser Reihe matt, und alle Felder der Reihe davor neben dem König sind von eigenen Figuren
    des Verteidigers besetzt (typisch: Bauern).
12. **Bauernmatt:** Ein Bauer setzt matt, ohne Umwandlung.

Sonst: **Sonstiges Matt**.

## Zusatzmerkmale und Zählung

- `doubleCheck`: Zwei Figuren geben Schach.
- `discovered`: Mindestens ein Schach kommt nicht von der gezogenen Figur. Bei Doppelschach ist das
  meist auch true. Die Merkmale schließen sich nicht aus und werden als Merkmale gezählt, nicht als
  Aufteilung, die sich zu „Mattpartien“ aufsummiert.
- `promotion`: Der Mattzug ist eine Umwandlung.
- `piece`: Bei einfachem Schach die Schach gebende Figur (bei einem Rochade-Matt also der Turm),
  bei Doppelschach die gezogene Figur.
- `byMe`: Aus dem Ergebnis (Sieg = true, Niederlage = false). Passt das Ergebnis nicht zum Mattzug
  (Datenfehler, Remis), entscheidet die Farbe des Mattzugs.
- **Zug des Matts:** Partiezug des Mattzugs (`moves`, also ceil(plies / 2)), gemittelt über alle gefilterten Mattpartien.
- **Varianten mit eigener Startstellung (FEN):** Sie zählen mit, nur Schäfermatt ist ausgeschlossen.
  Partien ohne Züge haben nie ein Matt.
- Die Figur-Aufschlüsselung gilt nur für „Sonstiges Matt“. „Häufigste Mattfigur“ in den Eckdaten zählt über alle Matts.

## Nicht-Ziele

- Narrenmatt, Boden-Matt, Opera-, Haken- und Légal-Matt. Sie kommen in echten Partien kaum vor
  oder sind schwer eindeutig zu fassen.
- Keine Erkennung von Mattdrohungen oder verpassten Matts. Dafür gibt es schon „Matt in 1 nicht verwertet“.
- Keine Speicherung im GitHub-Job und keine Änderung an den Master-Dateien.

## Anti-Ziele

- Keine Partie darf beim Laden wegen der Erkennung fehlen oder langsamer laden, als man merkt.
  Ein Fehler in der Erkennung führt zu „Sonstiges Matt“, nicht zum Abbruch.

## Ansätze

- **A: Beim Laden mitrechnen (gewählt).** Eine reine Funktion in `js/analysis/mateType.js` wird
  in `buildFastRecord` (js/meta/metaRecords.js) aufgerufen. Dort hat chess.js die Partie schon nachgespielt.
  Das funktioniert sofort für alle Partien, alte eingeschlossen, ohne Engine und ohne neue Speicherung.
- B: Im GitHub-Job berechnen und speichern. Gilt nur für die eingetragenen Spieler und braucht eine Formatänderung.
- C: Erst beim Öffnen des Tabs berechnen. Das PGN würde doppelt eingelesen, und der Tab „Partien“ käme schwer heran.

## Entscheidungen des Nutzers

- Es gibt genau die 12 Muster oben plus „Sonstiges Matt“, aufgeschlüsselt nach Figur.
- Die Statistik zeigt gesetzte und kassierte Matts gemeinsam. Getrennt wird über den Ergebnis-Filter.
- Der eigene Tab „Matt“ steht hinter „Zeit & Partieende“.
- Die Richtigkeit prüft der Nutzer stichprobenartig an echten Partien.

## Meine Entscheidungen

- **Datenform:** Jede Mattpartie bekommt am Fast-Record das Feld
  `mate: { type, piece, doubleCheck, discovered, promotion, byMe }`.
  - `type` ist eine der IDs `scholars`, `smothered`, `kq`, `kr`, `arabian`, `anastasia`, `ladder`,
    `backrank`, `epaulette`, `dovetail`, `kiss`, `pawn` oder `other`.
  - `piece` ist die mattsetzende Figur (`p n b r q`, beim Doppelschach die gezogene Figur).
  - `byMe` ist true, wenn der Nutzer mattgesetzt hat.
  - Partien ohne Matt haben `mate: null`. Das bisherige `endsInMate` bleibt bestehen.
- **Deutsche Bezeichnungen** liegen in einer Tabelle `MATE_LABEL` (metaRecords.js), so wie
  `TERMINATION_LABEL`.
- **Tests:** Je Muster ein Treffer als FEN plus letzter Zug in `tests/mateType.test.js`. Zusätzlich
  ein Test „Damenkuss am Rand bleibt Damenkuss, nicht Treppenmatt“ für die Rangfolge.
- **Tab-Symbol:** Die Tab-Leiste zeichnet pro Tab eine Figur (js/meta/tabPieces.js). „Matt“ bekommt
  den **umgefallenen König**, also den vorhandenen König, um 90° gedreht und auf der Linie liegend.
  Dafür braucht es keine neue Grafik.
- **Kein Matt:** Bei 0 Mattpartien unter den Filtern zeigt der Tab einen kurzen Hinweis statt leerer Kacheln.

## Dem Builder überlassen

- Anordnung und Breite der Kacheln im Tab, im Stil der bestehenden Tabs.
- Die genaue Geometrie jedes Musters, im Rahmen der Beschreibungen oben.

## Erweiterung (2026-11-23, auf Wunsch des Nutzers)

**24 Muster.** Neue Prüfreihenfolge (das erste passende gewinnt):
scholars → fools → smothered → kq → kr → kbn → kbb → arabian → hook → corner → anastasia → morphy →
greco → boden → opera → epaulette → dovetail → gueridon → damiano → lolli → kiss → ladder → backrank → pawn → other.

Neu hinzugekommen:
- **Narrenmatt** (`fools`): Schwarz setzt spätestens im 2. eigenen Zug mit der Dame matt, aus der Grundstellung.
- **Grundmatt K+L+S gegen K** (`kbn`) / **K+L+L gegen K** (`kbb`): nur nach Material, wie K+D und K+T.
- **Hakenmatt** (`hook`): Ein Turm gibt orthogonal daneben Schach. Ihn deckt ein Springer, und den deckt ein Bauer des Angreifers.
- **Eckmatt** (`corner`): Der König steht in der Ecke, ein Springer gibt Schach, und eine Schwerfigur des Angreifers
  steht auf der Nachbarlinie bzw. Nachbarreihe zum Rand.
- **Morphy-Matt** (`morphy`): wie Eckmatt, nur gibt ein Läufer das Schach.
- **Greco-Matt** (`greco`): Der König steht in der Ecke. Eine Schwerfigur setzt auf derselben Randlinie matt, ein Läufer
  des Angreifers deckt das Nachbarfeld auf der Randreihe, und eine eigene Figur des Verteidigers steht schräg neben dem König.
- **Boden-Matt** (`boden`): Ein Läufer gibt Schach, und ein zweiter Läufer des Angreifers greift ein Nachbarfeld des Königs an.
- **Opera-Matt** (`opera`): Ein Turm setzt auf der Grundreihe des Königs matt, gedeckt von einem Läufer.
- **Guéridon-Matt** (`gueridon`): Die Dame steht direkt vor dem König (orthogonal), ist gedeckt, und die beiden Felder schräg
  hinter dem König sind von eigenen Figuren des Verteidigers besetzt.
- **Damiano-Matt** (`damiano`): Die Dame steht schräg neben dem König und wird von einem Bauern gedeckt.
- **Lolli-Matt** (`lolli`): Die Dame steht orthogonal neben dem König und wird von einem Bauern gedeckt.

Namen: Das Bild mit der schräg danebenstehenden Dame bleibt **Schwalbenschwanzmatt** (`dovetail`), das mit der
Dame direkt davor heißt **Guéridon-Matt**.

**Kacheln:** „Mattbilder“ entfällt. **„Gesetzt und kassiert“** steht an erster Stelle, mit einer zusätzlichen
anklickbaren Spalte **Gesamt**, absteigend sortiert. Rechts daneben steht **„Matt nach Figur“** über alle Matts,
ebenfalls mit gesetzt, kassiert und gesamt.
