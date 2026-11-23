# Einzelanalyse als schlanke Detailansicht

**Status:** Accepted (2026-11-23)

## Warum

Die Meta-Analyse ist die Startseite: Sie lädt alle Partien, zeigt Statistiken und öffnet
Einzelpartien per Deep-Link in einem eigenen Tab (`metaController.openGame`). Die
Einzelanalyse ist nur noch deren Detailansicht. Ihre Lade- und Filterleiste stammt aus der
Zeit, als sie eigenständig war, und ergibt dort keinen Sinn mehr.

## Ziele

1. **Obere Leiste im Einzelanalyse-Tab (`appMode === 'game'`) entschlacken.** Ausgeblendet werden:
   Plattform-Umschalter, Benutzername (inkl. Avatar und Vorschlagsmenü), Zeitraum, Spielart,
   Ergebnis, Farbe, „Spiele laden“ und die Analyse-Lupe.
2. **Partie-Anzeige bleibt, wird aber ein festes Etikett statt Dropdown.** Sie enthält jetzt auch
   den eigenen Namen, etwa „du (Elo) vs Gegner (Elo) · Tag“. Darstellung, Einstellungen (Zahnrad)
   und die Modus-Färbung der Leiste bleiben.
3. **In der Meta-Analyse führt ein Klick auf eine nicht analysierte Partie zu einem Hinweis statt zum Öffnen.**
   - Der Hinweis ist ein **Popover an der Klickstelle**, im Stil der bestehenden Partienliste (`gamesPop`).
   - Analysierbar und weder laufend noch wartend: „Noch nicht analysiert.“ plus Button **Analysieren**.
     Der Button reiht die Partie in die bestehende Warteschlange ein (`enqueueGame`) und schließt das Popover.
   - Läuft gerade bzw. steht in der Warteschlange: entsprechender Text, kein Button.
   - Ohne Züge (`!hasMoves`): „Kann nicht analysiert werden (keine Züge).“, kein Button.
   - Das gilt für **alle** Stellen, die `openGame` aufrufen: Tabellenzeilen, die Partienliste
     hinter den anklickbaren Anzahlen und Serien.
4. **Den veralteten Starttext entfernen.** Der `#game-empty`-Text („Benutzernamen eintragen, Spiele laden …“) passt nicht mehr.

## Nicht-Ziele

- Keine Änderungen an der Meta-Analyse-Leiste.
- Keine Navigation zwischen Partien im Einzelanalyse-Tab.

## Fallback (meine Entscheidung)

Wird ein Einzelanalyse-Tab mit einer nicht analysierten Partie geöffnet (alter Link, Lesezeichen),
analysiert er sie wie bisher selbst, nur ohne sichtbare Lupe. Der Fortschritt muss dann
anders sichtbar sein, z. B. über den vorhandenen Fortschritt/Spinner im Etikett. Das legt der Builder fest.

## Ansätze

- **Popover an der Klickstelle:** gewählt. Bleibt im Kontext und nutzt die vorhandene Popover-Technik.
- Toast mit Button: zu weit weg vom Klick, verschwindet von selbst.
- Modaler Dialog: blockiert die Seite für eine Kleinigkeit.

## Umsetzung (Leitplanken)

In kleinen Schritten, jeder einzeln im Browser geprüft (Leiste ausblenden → Etikett mit eigenem
Namen → Popover → Starttext). Ausblenden per `applyAppMode`, nicht per Löschen aus `index.html`,
weil die Meta-Analyse dieselben Elemente nutzt.
