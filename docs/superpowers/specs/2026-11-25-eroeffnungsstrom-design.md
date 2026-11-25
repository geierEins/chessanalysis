# Eröffnungen: der Eröffnungsstrom

**Status:** Accepted (2026-11-25)

## Absicht
Der Tab „Eröffnungen“ zeigt die eigenen Eröffnungswege heute als aufklappbare Bäume („Mit Weiß“, „Mit Schwarz“).
Dazu kommt eine grafische Fassung derselben Daten: ein „Charakteristikbaum“, der auf einen Blick zeigt,
welche Wege der Nutzer durch die Eröffnung meistens geht. Er soll in erster Linie gut aussehen, zum Erkunden
dient das Hineinzoomen und die Brettvorschau.

## Ziele
- Eine neue Kachel „Eröffnungsstrom“ unter den beiden Bäumen, über die volle Breite (`w12`), breiter als hoch.
- Ein Strom von links nach rechts: links der Start, jede Spalte ist ein Halbzug.
- Jeder Weg ist ein Band. Seine Dicke ist genau proportional zur Zahl der Partien; die Bänder der Kinder
  teilen das Band des Elternknotens lückenlos auf und schwingen zu ihrer eigenen Position (Sankey-artig, geschwungene Ränder).
- Farbe eines Bands = Quote der Partien auf diesem Weg, von Rot (schwach) über Gelb (ausgeglichen) zu Grün (stark).
- Auf jedem Band steht Zug und Name („1.e4 King's Pawn Game“, ohne neuen Namen nur der Zug, z. B. „2.Nf3“),
  entlang der Bandmitte — aber nur, wenn der Text auf das Band passt und groß genug lesbar ist.
  Dicke Bänder sind sofort beschriftet, dünne erst beim Hineinzoomen.
- Zoomen und Verschieben in beide Richtungen; Zurücksetzen per Doppelklick und Knopf.
- Tooltip über jedem Band: die Brettvorschau mit der Stellung am Ende dieses Wegs, genau wie in den Bäumen.
- Umschalter Weiß / Schwarz in der Kopfzeile der Kachel; es ist immer genau eine Farbe zu sehen.

## Tiefe abhängig vom Zoom (vom Nutzer entschieden)
- Ein Band wird nur gezeichnet und in seine Kinder aufgeteilt, solange es auf dem Bildschirm deutlich erkennbar ist
  (Dicke ≥ etwa 4 px, Feinwert dem Umsetzer überlassen). Ein zu dünnes Kind wird nicht gezeichnet; sein Anteil am Elternband
  endet dort als kurzer, nach rechts ausblassender Stummel. So wirkt die Startansicht nicht matschig, und beim Hineinzoomen
  (die Bänder werden dicker) lösen sich weitere Ebenen auf.
- Feste Grenze: höchstens 16 Halbzüge (8 Züge). Was tiefer geht, endet an der Grenze als ausblassender Stummel.
- Partien, die das Eröffnungsbuch vorher verlassen (im Baum „ohne weiteren Namen“), enden ebenso als ausblassender Stummel
  an der Stelle, wo sie aufhören. Die Banddicke bleibt damit exakt proportional zur Partienzahl; die Stummel liegen
  innerhalb des Elternbands unterhalb der Kinder. *(Meine Entscheidung zur Lage.)*
- Spalten haben eine feste Breite (geometrisch, kein Umskalieren beim Zoomen). Die Startansicht zeigt so viele Halbzüge,
  wie bei 1× deutlich erkennbar sind (mindestens 6); tiefere Spalten liegen rechts und werden durch Zoomen und Verschieben erreicht.
  *(Meine Entscheidung.)*
- Zoomen zeichnet die Kachel deshalb neu (nicht nur viewBox verschieben). Wie, bleibt dem Umsetzer überlassen; wichtig:
  flüssig genug für Mausrad und Ziehen.

## Handy
- *(Meine Entscheidung:)* Auf schmalen Bildschirmen bekommt die Zeichenfläche eine Mindesthöhe (etwa 280 px) statt des
  festen Seitenverhältnisses; der Rest geht über Zoomen und Verschieben.

## Nicht-Ziele
- Keine kreisförmige oder Fächer-Darstellung (verworfen nach den Entwürfen).
- Kein Text-Tooltip mit Quote oder Zahlen; die Quote steckt in der Farbe.
- Kein Aufklappen/Zuklappen im Strom und keine Verknüpfung mit dem Aufklapp-Zustand oder der Suche der Bäume.
- Keine neuen Daten in `metaRecords.js`, keine Neuanalyse.

## Anti-Ziele
- Der Strom darf nicht beim Neuzeichnen des Tabs (Aufklappen im Baum, Sortieren, laufende Analyse alle paar Sekunden)
  auf die Ausgangsansicht zurückspringen.
- Die Seite darf über der Kachel nicht hängen bleiben: Ungezoomt scrollt das Mausrad nach unten die Seite weiter.
- Unlesbarer Textbrei: lieber kein Name als ein überlappender oder über den Bandrand hinausragender.

## Daten
- Quelle sind die gefilterten Partien des Tabs (`rs`), getrennt nach `r.color`, und je Partie `r.openingPath`
  (`metaRecords.js`, `openingTreePath`): ein Schritt pro Halbzug bis zum letzten benannten Halbzug, mit
  `key`, `name`, `label`, `move`, `line`, `named`. Es ist dieselbe Baumstruktur wie in den Bäumen (Knoten = Schlüssel-Pfad),
  deshalb zeigen Baum und Strom dieselben Wege und Zahlen.
- Ein Weg endet, wo die Partie das Eröffnungsbuch verlassen hat, spätestens beim 16. Halbzug; Äste sind deshalb unterschiedlich lang.
- Die Entfernung der Kacheln „Erster Zug als Weiß“, „Als Schwarz gegen …“ und „Stärkste und schwächste“ (bereits erledigt,
  noch nicht committet) kommt als eigener Commit vor dieser Arbeit.
- Beschriftung eines Bands: `move` und, falls `named`, dazu `label`.
- Quote: wie überall im Tab `score()` aus `format.js` über die Partien des Knotens.
- Tooltip: das Band trägt `data-opening="<name>"` und `data-line="<line>"` wie die Baumzeilen;
  der gemeinsame Tooltip (`metaController.js`, `TIP_SEL` / `openingBoardHtml`) erzeugt daraus Brett und Züge, ohne Änderung.
- Partien ohne `openingPath` (oder mit leerem) tragen nur zur Startbreite bei, nicht zu einem Band — oder sie werden ganz ausgelassen; siehe „Dem Umsetzer überlassen“.

## Ansätze
- **Gewählt: SVG-String in der View, Zustand im Controller.** Die View (`js/meta/view/openings.js` bzw. eine eigene Datei
  unter `js/meta/view/`) erzeugt den Strom als SVG-String wie alle anderen Kacheln. Zoom/Verschiebung und die gewählte Farbe
  merkt sich der Controller (wie `openingOpen`/`openingSearch`) und gibt sie über `ctx` zurück, so dass jedes Neuzeichnen
  dieselbe Ansicht erzeugt. Passt zum Muster „ein HTML-String pro Tab“, wird vom Render-Snapshot in CI erfasst.
  Nachteil: Textbreiten werden geschätzt statt gemessen.
- Verworfen: eigene, beim Neuzeichnen stehen bleibende Komponente. Misst Text exakt und behält den Zoom von selbst,
  bricht aber das Muster und fällt aus dem Render-Snapshot.
- Verworfen: Canvas. Brettvorschau per `data-opening` und Text auf geschwungenen Bändern wären nur mit eigener Treffererkennung und Textlayout möglich.

## Bedienung (vom Nutzer entschieden bzw. meine Entscheidung, markiert)
- Umschalter Weiß / Schwarz in der Kopfzeile (`card(..., { head })`). Start: Weiß. *(Meine Entscheidung: Start Weiß; beim Verlassen des Tabs wie die Suchfelder zurück auf Weiß.)*
- *(Vom Nutzer entschieden, 2026-11-25, nach dem ersten Test:)* Zoomen mit dem **normalen Mausrad** (ohne Strg)
  um den Mauszeiger; ungezoomt scrollt das Mausrad nach unten die Seite. Verschieben durch Ziehen mit der Maus.
  Doppelklick und ein Knopf „Zoom zurücksetzen“ in der Kopfzeile (nur sichtbar, wenn gezoomt) setzen zurück.
  Zoom zwischen 1× und etwa 14×; nicht über den Rand des Stroms hinaus verschiebbar.
- *(Meine Entscheidung:)* Zoom gilt pro Farbe; der Umschalter wechselt auf die gemerkte Ansicht der anderen Farbe.
  Beim Verlassen des Tabs wird der Zoom zurückgesetzt (wie `resetZooms()`).
- *(Meine Entscheidung:)* Touch: Zwei-Finger-Zoom und, nur im gezoomten Zustand, Verschieben mit einem Finger;
  ungezoomt scrollt ein Finger die Seite.
- Beim Ändern der Filter (andere Partienmenge) bleibt der Zoom, solange die Ansicht noch sinnvoll ist; im Zweifel Zurücksetzen. *(Dem Umsetzer überlassen, siehe unten.)*

## Darstellung
- Hintergrund und Farben aus den Meta-Variablen (`--meta-panel`, `--meta-line`, …). Leichte Spaltenlinien je Halbzug,
  darunter eine dezente Achsenbeschriftung („1. Zug Weiß“, „1. Zug Schwarz“, …).
- Zwischen Bändern ein feiner Rand in Hintergrundfarbe, damit benachbarte Bänder gleicher Farbe unterscheidbar bleiben.
- Bandtext dunkel auf dem farbigen Band, Schriftgröße proportional zur Banddicke (gedeckelt). Sichtbar nur, wenn
  (geschätzte Textbreite ≤ Länge der Bandmitte) und (Schriftgröße auf dem Bildschirm ≥ etwa 8,5 px).
  Die Breite wird aus der Zeichenzahl geschätzt (deterministisch, damit der Render-Snapshot stabil bleibt).
- Bandhöhe gesamt etwa 82 % der Zeichenfläche; der Rest ist Luft, in die die Kinder auseinanderschwingen.
- Leere Farbe: „Keine Partien mit dieser Farbe.“ wie in den Bäumen.
- Kachel-Notiz kurz: Dicke = Partien, Farbe = Quote, Mausrad zum Zoomen.

## Referenz
Der gewählte Entwurf ist Variante 4 in `2026-11-25-eroeffnungsstrom-entwurf.html` (neben diesem Dokument):
Geometrie der Bänder, Farbskala, Beschriftung. Abweichend davon gilt: ungezoomt scrollt das Mausrad nach unten die Seite,
Brettvorschau als Tooltip, Umschalter Weiß / Schwarz. Die Zahlen im Entwurf sind ausgedacht.

## Dem Umsetzer überlassen
- Ob der Strom in `openings.js` oder in einer eigenen Datei unter `js/meta/view/` lebt.
- Wie der Zoom ins Rendering kommt: viewBox-Ausschnitt im SVG (einfach) oder Zeichnen in Pixelgröße über `fitChart`-artige Platzhalter.
  Wichtig ist nur: Neuzeichnen erhält die Ansicht, und die Sichtbarkeit der Namen hängt von der Zoomstufe ab.
- Ob die Sichtbarkeit der Namen beim Zoomen per Neuzeichnen oder per Umschalten vorberechneter Attribute (z. B. `data-minzoom`) entsteht.
- Umgang mit Filterwechsel und Partien ohne Eröffnungsweg.
- Feinwerte (Schriftgrößen, Farbskala, Ränder), solange sie dem Entwurf entsprechen.
