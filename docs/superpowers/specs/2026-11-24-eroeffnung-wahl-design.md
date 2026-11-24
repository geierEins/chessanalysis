# Eröffnungen: wer hat sie gewählt?

**Status:** Accepted (2026-11-24)

## Absicht
Der Tab „Eröffnungen“ soll zeigen, welche Eröffnungen der Nutzer selbst wählt und gegen welche er spielt.
Heute stehen z. B. Caro-Kann oder Sizilianisch in der Tabelle „Mit Weiß“, als wären es die Eröffnungen des Nutzers.

## Ziele
- Für jede Partie wird bestimmt, wer die Eröffnung gewählt hat: der Nutzer oder der Gegner.
- Die Kacheln „Mit Weiß“ und „Mit Schwarz“ zeigen je zwei Tabellen untereinander: „Meine Wahl“ und „Wahl des Gegners“.

## Nicht-Ziele
- „Stärkste und schwächste“, „Erster Zug als Weiß“ und „Als Schwarz gegen …“ bleiben unverändert.
- Keine Neuanalyse und keine Datenmigration.

## Regel
- Maßgeblich ist der Halbzug, an dem der Familienname (der Teil vor dem Doppelpunkt) in der Partie zum ersten Mal auftaucht.
  Ein ungerader Halbzug ist ein Zug von Weiß, ein gerader einer von Schwarz. Wer diesen Zug gespielt hat, hat gewählt.
  Beispiele: Sizilianisch 1…c5 → Schwarz; Italian Game 3.Lc4 → Weiß; Vierspringer (Zugumstellung) → wer den letzten Springerzug macht.
- Bei den Sammelnamen „King's Pawn Game“ und „Queen's Pawn Game“ zählt stattdessen der Halbzug, an dem die Variante zum ersten Mal auftaucht,
  und die Partie wird in der Tabelle unter der Variante gruppiert (z. B. „Wayward Queen Attack“).
  Hat die Partie nur den Sammelnamen ohne Variante, bleibt die Gruppe der Sammelname und es wählt, wer 1.e4/1.d4 gezogen hat.
- Andere Namen („Van't Kruijs Opening“, „Zukertort Opening“ …) sind eigene Familien, keine Sammelnamen.

Geprüft an den Daten von schnaxlspringer und pawnhubde (awk-Nachzählung): plausibel. Nur etwa 50 Partien von schnaxlspringer haben nur den Sammelnamen ohne Variante.

## Ansätze
- **Gewählt: beim Aufbau der Datensätze berechnen.** `metaRecords.js` baut die Datensätze bei jedem Laden aus den PGNs. Dort kommen zwei Felder dazu:
  die Gruppe (Familie oder bei Sammelnamen die Variante) und wer gewählt hat. `openingBook.js` liefert zum Namen den Halbzug, an dem er zum ersten Mal auftaucht.
- Verworfen: im View berechnen. Die Datensätze speichern die Züge nicht.
- Verworfen: am Namen erkennen („Defense“ → Schwarz). Das passt oft nicht, z. B. „Englund Gambit“ (Schwarz) oder „Two Knights Defense“ (eine Variante des Italian Game).

## Darstellung
- Eine Kachel pro Farbe mit Unterüberschriften „Meine Wahl“ und „Wahl des Gegners“. Jede hat eine eigene Tabelle mit denselben Spalten und derselben Sortierung wie heute.
- Ein Suchfeld pro Kachel filtert beide Tabellen (die bestehende Eröffnungssuche). Beim Tabwechsel wird es geleert.
- Eine leere Tabelle zeigt einen kurzen Hinweis statt einer leeren Tabelle.

## Dem Umsetzer überlassen
- Feldnamen und die genaue Signatur der neuen Funktion in `openingBook.js`.
- Wortlaut von Hinweisen und Kachel-Notiz (die Regel kurz erklären).
