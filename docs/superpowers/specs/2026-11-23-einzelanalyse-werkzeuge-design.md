# Einzelanalyse: Einstellungen als Symbole in der Leiste

**Status:** Accepted (2026-11-23)

## Warum

Das Zahnrad-Menü der Einzelanalyse enthält nur drei Einstellungen. Jede davon braucht zwei Klicks
und ist im geschlossenen Menü unsichtbar. Seit die Lade- und Filterleiste weg ist, hat die obere
Leiste genug Platz, um die drei Einstellungen direkt zu zeigen.

## Ziele

1. **Kein Zahnrad mehr.** `#settings-picker` samt Menü entfällt. Im Einzelanalyse-Modus stehen
   die drei Einstellungen stattdessen als Symbole in der oberen Leiste, rechts neben dem
   Partie-Etikett und vor „Darstellung“:
   - **Brettgeräusche:** Lautsprecher-Symbol als Umschalter. Die vorhandenen Icons an/aus werden
     übernommen, der Tooltip nennt den Zustand.
   - **Bester Zug:** Pfeil-Symbol plus aktueller Wert („Vorher“ / „Nachher“ / „Aus“) und ▾.
     Ein Klick öffnet ein kleines Dropdown mit den drei Optionen und den bisherigen Erklärungen
     als Tooltips. Bei „Aus“ wirkt das Symbol gedimmt.
   - **Kommende Züge:** Auge-Symbol als Umschalter. Offenes Auge heißt zeigen, durchgestrichenes
     Auge heißt verbergen.
2. **Verbergen versteckt auch das Ergebnis.** Sind die kommenden Züge verborgen, fehlt im
   Partie-Etikett das S/R/N-Abzeichen, denn es verrät das Ende. Beim Wieder-Zeigen kommt es zurück.
3. **Verhalten und Speicherung bleiben gleich.** Es bleiben `saveSoundEnabled`,
   `saveBestMoveTiming` und `saveHideFutureMoves` sowie dieselben Callbacks in js/main.js.

## Nicht-Ziele

- Keine neuen Einstellungen.
- Keine Änderung an der Meta-Analyse. Dort gibt es diese Symbole nicht, wie bisher beim Zahnrad.

## Ansätze

- **Obere Leiste (gewählt):** Alles steht an einer Stelle, auch mobil, und die Leiste ist ohnehin fast leer.
- Symbolleiste an der Zugliste: näher am Gesteuerten, aber eine neue Stelle im Layout.

## Meine Entscheidungen

- `js/ui/settingsPanel.js` bleibt als Modul für diese Steuerelemente erhalten, mit derselben
  Schnittstelle `initSettingsPanel({...})`. Nur Markup und Innenleben ändern sich. Das hält die
  Änderung in js/main.js klein.
- Das Bester-Zug-Dropdown verhält sich wie die anderen Leisten-Menüs: Es schließt bei einem Klick
  daneben und bei Escape.
- Der Pre-Paint-Schutz (`html[data-boot-mode="meta"]`) blendet die neue Gruppe in der Meta-Analyse aus,
  so wie bisher das Zahnrad.

## Umsetzung

In zwei Schritten, jeweils mit Browser-Prüfung durch den Nutzer:
1. Symbole statt Zahnrad.
2. S/R/N-Abzeichen beim Verbergen ausblenden.
