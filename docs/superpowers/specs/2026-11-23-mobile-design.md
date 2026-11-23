# Mobile-Ansicht

**Status:** Accepted (2026-11-23)

## Warum

Auf dem Handy soll die App genauso nutzbar sein wie am Desktop. Im Vordergrund stehen Statistiken
anschauen und einzelne Partien durchgehen. Heute ist die Meta-Analyse auf einem Handy (390 px)
breiter als der Bildschirm: Der Inhaltsbereich wird 726 px breit, und die Filterleiste ragt
rechts hinaus. Die Seite rutscht seitlich, Kacheln und Tabs sind abgeschnitten, und die
Partien-Tabelle quetscht 11 Spalten zusammen. Die Einzelanalyse hat bereits ein eigenes
Handy-Layout und ist weitgehend brauchbar.

Gearbeitet wird auf dem Branch `mobile`. Der Nutzer lässt bei der Methodik freie Hand:
platzsparende Bedienelemente, Icons statt Text und Verkürzungen sind ausdrücklich erwünscht.

## Ziele

1. **Kein seitliches Scrollen der Seite** bei 360–430 px Breite. Das gilt in allen Tabs der
   Meta-Analyse und in der Einzelanalyse. Breite Inhalte scrollen höchstens innerhalb ihrer
   Kachel (Tabellen), nie die ganze Seite.
2. **Filterleiste kompakt.** Auf dem Handy bleiben in der Leiste sichtbar: Plattform, Benutzer
   (Avatar, Name gekürzt), ein **Filter-Button** mit der Anzahl aktiver Filter, Darstellung und
   der Analyse-Button. Zeitraum, Spielart, Ergebnis, Farbe, Gegner und „Spiele laden“ liegen
   in einem **ausklappbaren Filter-Panel** unter der Leiste. Der Filter-Button öffnet und
   schließt es.
3. **Statuszeile kurz.** Auf dem Handy erscheint eine Kurzform, z. B.
   „411/411 Partien · [404/411] Engine“ mit dem farbigen Abdeckungs-Kästchen. Die Zahlen je
   Spielart stehen darunter oder entfallen. Die Langform bleibt am Desktop.
4. **Tabs als wischbare Leiste.** Eine Zeile, horizontal wischbar, der aktive Tab wird
   sichtbar gescrollt. Die Figuren-Linie unter den Tabs entfällt auf dem Handy, wie heute schon
   unter 900 px.
5. **Kacheln einspaltig, Kennzahlen zweispaltig.** Alle Kacheln nehmen die volle Breite ein,
   Diagramme skalieren auf die Breite. Die Kennzahl-Kacheln (KPIs) stehen kompakt zu zweit
   nebeneinander. Kacheln, die am Desktop nebeneinander stehen (z. B. im Tab „Matt“), stehen
   untereinander.
6. **Tabellen.** Sie scrollen innerhalb ihrer Kachel waagerecht, falls sie nicht passen.
   Unwichtige Spalten können auf dem Handy entfallen, die Entscheidung trifft der Builder je
   Tabelle. Die **Partien-Tabelle** bekommt auf dem Handy eine **zweizeilige Darstellung pro
   Partie**:
   - Zeile 1: Datum, Spielart-Icon, Gegner mit Flagge, Elo, Ergebnis.
   - Zeile 2: Eröffnung, Züge, Genauigkeit, Patzer, Lupe.
   Sortieren erfolgt über ein kompaktes Auswahlfeld über der Liste, weil der Tabellenkopf entfällt.
7. **Tooltips per Antippen.** Alles, was am Desktop beim Hovern erscheint (`data-tip`,
   Eröffnungs- und Mattbild-Bretter), erscheint auf Touch-Geräten beim **Antippen**.
   Ein Tippen daneben oder Scrollen schließt es. Tippen auf eine Tabellenzeile öffnet weiterhin
   die Partie. Hat die angetippte Stelle einen Tooltip, zeigt das erste Tippen den Tooltip.
8. **Einzelanalyse.** Das vorhandene Handy-Layout bleibt die Grundlage. Geprüft und bei Bedarf
   angepasst werden die obere Leiste (Partie-Etikett darf umbrechen, die Symbole passen), die
   Zugauswertung und die Bedienknöpfe. Es gibt kein seitliches Scrollen.

## Nicht-Ziele

- Keine Änderung der Desktop-Darstellung über 900 px.
- Keine neuen Statistiken und keine neuen Funktionen.
- Keine eigene Handy-Version einzelner Tabs mit doppeltem Darstellungscode.
- Kein Querformat-Sonderlayout. Querformat nutzt die Tablet- bzw. Desktop-Regeln.

## Ansätze

- **C: CSS zuerst, gezielt eigenes Markup (gewählt).** Der Großteil läuft über Media Queries
  am bestehenden Markup. Nur Filter-Panel, Statuszeilen-Kurzform und Sortierauswahl brauchen
  zusätzliches Markup bzw. JS. Die zweizeilige Partienliste entsteht per CSS-Grid aus den
  bestehenden Tabellenzellen. Der Desktop bleibt unberührt, und neue Kacheln funktionieren automatisch mit.
- A: Nur CSS. Filterleiste und große Tabellen wären Notlösungen.
- B: Eigene Handy-Ansichten. Das hieße doppelten Darstellungscode für jede Statistik.

## Meine Entscheidungen

- **Breakpoint:** Handy heißt `max-width: 640px`. Die vorhandenen Regeln unter 900 px (Tablet,
  Kacheln gestapelt) bleiben und gelten für das Handy mit.
- **Ursache des Überlaufs zuerst:** Grid- und Flex-Kinder im Inhaltsbereich bekommen
  `min-width: 0`. Zeilen mit `white-space: nowrap` wie Status, Tabs und Kopfzeilen der Kacheln
  dürfen auf dem Handy umbrechen bzw. scrollen.
- **Filter-Panel:** Die vorhandenen Bedienelemente werden nicht dupliziert. Sie stehen in der
  Leiste und werden auf dem Handy per CSS als Panel dargestellt (eine Klasse am `#loader-panel`
  schaltet es auf und zu). Der Filter-Button erscheint nur auf dem Handy.
- **Tooltip per Tippen:** Der vorhandene gemeinsame Tooltip (`#meta-tip`) wird zusätzlich durch
  `click` auf Touch-Geräten (`(hover: none)`) ausgelöst. Es gibt keine zweite Tooltip-Implementierung.
- **Prüfung:** Jeder Schritt wird automatisch per Headless-Chrome mit Handy-Emulation
  (390 × 844) geprüft: Screenshots aller Tabs und eine Überlaufprüfung (`scrollWidth ===
  clientWidth`). Danach prüft der Nutzer auf dem echten Handy.
- **Reihenfolge:** Erst die Überlauf-Ursache und die einspaltigen Kacheln, also der größte
  Gewinn. Dann Filterleiste, Statuszeile, Tabs, Partienliste, Tooltips und zuletzt die Einzelanalyse.
  Jeder Schritt wird einzeln committet.

- **Filter-Panel nur in der Meta-Analyse.** In der Einzelanalyse sind die Filter ohnehin
  ausgeblendet. Die Leiste dort (Partie-Etikett, Symbole, Darstellung) bekommt keinen Filter-Button.
- **Filter-Menüs bleiben Popups.** Zeitraum, Spielart, Ergebnis, Farbe und Gegner öffnen ihre
  vorhandenen Menüs. Das Panel setzt kein `overflow`, das die Menüs abschneiden würde.
  Menüs, die rechts aus dem Bild ragen, werden in den Bildschirm geschoben.
- **Zähler am Filter-Button:** Er zählt die Filter, die vom Standard abweichen: Zeitraum,
  Spielart (nicht alle gewählt), Ergebnis (nicht alle), Farbe (nicht beide) und einen gewählten
  Gegner. Er aktualisiert sich bei jeder Filteränderung. Bei 0 steht nur das Filter-Symbol.
- **Panel-Verhalten:** Beim Start ist es geschlossen. Es schließt über den Filter-Button, nach
  „Spiele laden“ und beim Tab-Wechsel. Es ist Teil der klebenden Filterleiste, schiebt also den
  Inhalt nach unten, solange es offen ist.
- **Tippen mit Tooltip:** Nur ein Element, das selbst einen Tooltip trägt (z. B. die
  Ergebniszelle, eine Eröffnung, ein Mattbild), zeigt beim ersten Tippen den Tooltip. Ein
  zweites Tippen auf dasselbe Element löst die normale Aktion aus. Tippen auf andere Stellen
  einer Zeile öffnet die Partie sofort.
- **Tab-Leiste:** Das vorhandene Verhalten bleibt. Sie klebt unter der Filterleiste und
  verschwindet beim Herunterscrollen, beim Hochscrollen kommt sie zurück.

## Dem Builder überlassen

- Genaue Abstände, Schriftgrößen und Icon-Wahl im Stil der bestehenden App.
- Welche Spalten in welchen Tabellen auf dem Handy entfallen.
- Ob die Spielart-Zahlen der Statuszeile auf dem Handy umbrechen oder entfallen.
