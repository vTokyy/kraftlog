# Kraftlog — Aufbau und Architektur

Stand: Juli 2026 (App-Version v23). Kraftlog ist ein Krafttraining- und Lauf-Tracker mit
Fokus auf progressivem Overload: Gewicht, Wiederholungen, Sätze, echte Satzpausen, RPE,
PRs, evidenzbasierte Steigerungsvorschläge, Wochenplan mit Volumen-Analyse, Strong-Import,
Strava-Anbindung und Push-Weckruf am Pausenende. Sprache der Oberfläche: Deutsch.

---

## 1. Designprinzipien

- **Komplett eigenständig, ohne Claude/Server-Abhängigkeit.** Die App ist reines
  Vanilla-HTML/CSS/JavaScript ohne Framework, ohne Build-Tooling im eigentlichen Sinn,
  ohne externe Bibliotheken, ohne Datenbank-Server. Alles läuft im Browser.
- **Offline-first.** Ein Service Worker cacht die komplette App beim ersten Besuch;
  danach funktioniert sie ohne Internet. Daten liegen ausschließlich lokal (localStorage).
- **Keine Emojis in der UI** — alle Icons sind Inline-SVG.
- **Nur Hochformat** (Manifest `orientation: portrait` + CSS-Sperre im Querformat).
- **Apple-Look:** Systemschrift (-apple-system/SF Pro), CSS-Design-Tokens, Dark/Light
  automatisch nach Systemeinstellung mit manuellem Override, Safe-Area-Unterstützung
  für Dynamic Island/Notch (`viewport-fit=cover` + `env(safe-area-inset-*)`).
- **Serverseitiges nur wo unvermeidbar:** Ein einziger selbst gehosteter Cloudflare
  Worker übernimmt die zwei Dinge, die der Browser nicht kann (Strava-OAuth ohne
  Client-Secret im Browser; Push-Weckrufe bei gesperrtem Gerät). Beides ist optional —
  die App funktioniert vollständig ohne.

## 2. Verteilung / Plattformen

| Kanal | Was | Details |
|---|---|---|
| **iPhone (primär)** | PWA auf GitHub Pages | https://vtokyy.github.io/kraftlog/ (Repo github.com/vTokyy/kraftlog). Installation über Safari → „Zum Home-Bildschirm". `display: standalone`, eigene Icons. |
| **Mac** | `~/Desktop/Kraftlog.app` | AppleScript-Bundle (per `osacompile` erzeugt): der 6-Zeilen-Launcher `main.applescript` öffnet `Contents/Resources/app/index.html` im Standardbrowser (file://-Kontext). Daten hängen am Bundle-Pfad — App nicht verschieben. |
| **Single-File** | `dist/kraftlog-artifact.html` | Vom Build-Skript erzeugte Ein-Datei-Variante (CSS + alle 6 Skripte inline), lauffähig per file:// ohne jegliche Netzwerkzugriffe. |

Mac und iPhone synchronisieren **nicht** automatisch; Brücke ist der JSON-Export/-Import.
Update-Workflow: im Quellcode-Ordner editieren → `python3 build.py all --bump` → `git push`
(GitHub Pages deployt automatisch; der Versions-Bump invalidiert den Service-Worker-Cache).

## 3. Dateien und Module

Quellcode: `~/Desktop/Kraftlog-Quellcode/` (eigenes Git-Repo).

| Datei | Zeilen | Rolle |
|---|---|---|
| `index.html` | 67 | Gerüst: einziger Render-Container `<main id="view">`, feste Timer-Bar, Tab-Bar (5 Tabs), Bottom-Sheet, Toast/Konfetti, Rücksprung-Button, Querformat-Sperre. Lädt die Skripte mit Cache-Buster `?v=23` in fester Reihenfolge. |
| `style.css` | 1780 | Design-Tokens als CSS-Variablen, dreifache Dark/Light-Mechanik, Safe-Area, Blur-Tab-Bar, max-width 560 px. |
| `exercises.js` | 106 | Statische Übungsdatenbank: **77 Übungen**, 10 Muskelgruppen, 7 Equipment-Typen. |
| `icons.js` | 63 | SVG-Übungskacheln: Hintergrundfarbe = Muskelgruppe (10 Farben), Piktogramm = Equipment. |
| `coach.js` | 1353 | Evidenzbasiertes Offline-Regelwerk: Pausen, Rep-Bereiche, Laststeigerung, **Satzzahl**, Deload, Wochenvolumen-Ziele, Reha-Modus, **4-Wochen-Periodisierung**. Jede Empfehlung trägt einen vollständigen Satzplan (kg und Wdh. je Arbeitssatz) plus Umsetzungsschritte. |
| `charts.js` | 127 | Handgerollte SVG-Charts (`lineChart`, `barChart`), Farben nur über CSS-Variablen → Dark Mode automatisch. |
| `timer.js` | 174 | Signal-Primitiven: Gong als Pausenende-Signal (Undertaker-Bell, MP3-Data-URI), WebAudio-Glocke als Rückfall, eingebettete WAV-Töne, Audio Session API, Vibration. |
| `app.js` | 5526 | Die gesamte App-Engine (State, Rendering, Workout-Maschine, Import/Export, Strava, Push). |
| `sw.js` | 68 | Service Worker: Precache (13 Dateien), cache-first, Push-Handler. |
| `manifest.webmanifest` | 17 | PWA-Manifest (standalone, portrait, Icons inkl. maskable). |
| `build.py` | 129 | Build: `.app` befüllen, Single-File-Artifact bauen, `--bump` synchronisiert `?v=N` und SW-Version, CSP-Sanity-Checks. |
| `main.applescript` | 6 | Mac-Launcher. |
| `worker/` | ~200 | Cloudflare Worker `kraftlog-proxy` (Strava + Push, via wrangler deploybar). |
| `strava-proxy.js` | 77 | Ältere reine Strava-Variante des Workers (Copy-Paste ins Cloudflare-Dashboard). |

Ladereihenfolge (app.js zuletzt, konsumiert die Globals der anderen):
`exercises.js → icons.js → coach.js → charts.js → timer.js → app.js`.
Modul-Muster: `icons.js`, `coach.js`, `charts.js` und `timer.js` sind IIFEs, die je genau
ein `window.*`-Objekt exportieren (`KraftlogIcons`, `KraftlogCoach`, `KraftlogCharts`,
`KraftlogTimer`); `exercises.js` ist eine reine Datendatei mit drei Globals
(`KRAFTLOG_EXERCISES`, `KRAFTLOG_MUSKELGRUPPEN`, `KRAFTLOG_EQUIPMENT`).

## 4. Frontend-Architektur (app.js)

**Kein Framework, kein Router, keine Komponenten.** Eine IIFE mit `'use strict'`:

- **Rendering:** Views sind Funktionen, die HTML-Strings bauen (mit `esc()` als
  XSS-Escaper) und in `#view` injizieren. Navigationszustand lebt in Modul-Variablen
  (`tab`, `trainSub`, `uebSub`, `verlaufSub`, Draft-Objekte der Editoren …).
- **Event-Delegation:** Vier delegierte UI-Listener auf `document` (click, input,
  change, focusin; dazu kommen `visibilitychange` für Save-Flush/Wake-Lock und
  `beforeunload` am window).
  Klicks laufen über `e.target.closest('[data-action]')` in eine zentrale `ACTIONS`-Map
  mit ~120 benannten Aktionen — Buttons deklarieren ihr Verhalten rein über
  `data-action`-Attribute. `focusin` markiert bei Zahlenfeldern den gesamten Wert
  (Übertippen statt Anhängen, iOS-Workaround).
- **Persistenz:** Globaler State `S` als JSON unter `localStorage['kraftlog-state-v1']`.
  `save()` direkt, `saveSoon()` mit 250-ms-Debounce für Eingaben; Flush bei
  `visibilitychange` und `beforeunload`. Ein Ticker (`setInterval`, 500 ms) aktualisiert
  Timer-Bar und Laufzeit-Anzeigen — der Timer selbst ist rein timestampbasiert
  (übersteht Reload, Sperren, App-Wechsel).
- **Selbstheilung:** `sanitizeState()` erzwingt nach jedem Laden/Import Typen und filtert
  kaputte Datensätze; `migrate()` ist als Fall-through-Switch für künftige
  Schemaversionen vorbereitet (aktuell `schemaVersion: 1`). Stammt der gespeicherte
  State aus einer **neueren** App-Version, geht die App in einen readOnly-Modus
  (Warnbanner, speichert nichts — Schutz vor Datenverlust durch Downgrade).
- **PRs werden nie gespeichert**, sondern immer aus der Historie berechnet
  (selbstheilend bei Edits/Löschungen). e1RM nach **Epley**: `kg · (1 + reps/30)`
  (bei 1 Wiederholung direkt `kg`), nur für 1–15 Wiederholungen gewertet.
  PR-Priorität: Gewicht > e1RM > Wiederholungen.

### Vorgabewerte beim Trainingsstart (`satzVorgabe`)

`buildWoExercise()` füllt jeden Arbeitssatz aus zwei Quellen: dem Plan-Ziel und dem
entsprechenden Satz der **letzten** Einheit. Bis v35 gewann dabei immer der Plan
(`z.reps != null ? z.reps : ref.reps`) — mit einer stillen Falle: Plan 8/8/5, letzte
Einheit tatsächlich 8/8/6, im Feld stand wieder **5**. Wer dann 6 schafft, hält das
für Fortschritt, obwohl es exakt der Vorwoche entspricht.

Seit v36 gilt: **das Plan-Ziel ist eine Untergrenze, kein Deckel.** Die Vorgabe liegt
nie unter dem, was zuletzt schon stand. Wiederholungen werden dabei nur übernommen,
wenn sie bei **mindestens demselben Gewicht** zustande kamen — mehr Wdh. bei weniger
Last sind kein Fortschritt und als Vorgabe für ein schwereres Gewicht falsch.

Die Regel ist als reine Funktion `satzVorgabe(z, ref)` herausgezogen und mit
`test-vorgabe.js` abgedeckt (12 Fälle inkl. Körpergewicht und leerer Historie).

Unberührt bleibt `repMin`/`repMax` für den Coach: die kommen weiter aus dem **Plan**,
nicht aus der Vorbelegung. Sonst würde eine einzelne gute Einheit den Boden dauerhaft
anheben und eine spätere Normalleistung als „verfehlt" gelten.

### Aufwärmsätze: 2, 3 oder 4 (ab v42)

`WARMUP_RAMPEN` kennt drei Längen; `warmupSatzzahl(ex, targetKg)` **empfiehlt** eine,
erzwingt sie aber nicht — die Auswahl steht als Segmented Control im Aufwärm-Sheet
(Vorlagen-Editor wie Training), die Empfehlung ist dort markiert und begründet.

| Rampe | Stufen | Empfohlen bei |
|---|---|---|
| 4 | 40 % ×10 · 60 % ×5 · 75 % ×3 · 88 % ×2 | große Muskelgruppe **und** ≥ 100 kg |
| 3 | 50 % ×8 · 70 % ×4 · 85 % ×2 | große Muskelgruppe (Beine, Gesäß, Brust, Rücken) |
| 2 | 50 % ×8 · 75 % ×4 | alles andere |

Die Wiederholungen sinken, je näher es ans Arbeitsgewicht geht: Aufwärmen soll das
Muster einschleifen und das Gewebe hochfahren, nicht Kraft kosten. Die 4er-Rampe hat
deshalb eine zusätzliche Stufe **unten**, nicht vier lange Sätze. Die übrigen Regeln
bleiben: nie unter der leeren Stange, nie auf oder über dem Arbeitsgewicht, streng
aufsteigend, 2,5-kg-Raster. Abgedeckt durch `test-warmup.js`.

### Pausenziel mitten im Training (ab v42)

Vorher ließ sich eine laufende Pause nur **verlängern** (+30 s); ein eigener Wert je
Übung war nur über den Umweg Übungen-Tab erreichbar. Jetzt zwei Wege:

- **Übungsmenü im Training** → „Pausenziel: 3:30 min…" → Rad, dann *Immer für diese
  Übung* (`S.exerciseSettings[exId].restSec`), *Nur dieses Training* (`wex.restSec`)
  oder *auf automatisch zurücksetzen*.
- **Tippen auf den laufenden Countdown** (`#timer-text` ist jetzt die Schaltfläche) →
  Ziel der laufenden Pause ändern, optional gleich für die Übung merken. Ein noch
  nicht erreichtes neues Ziel setzt `signaled` zurück, der Gong kommt also noch.

Rangfolge in `restTarget()`: Satz-`restZiel` → Plan-/Tagesvorgabe (`wex.restSec`) →
Übungs-Einstellung → **Periodisierungswoche** → Coach-/Pauschalwert.

### Coach-Vorschlag übernehmen (`vorschlagAufSaetze`)

Der Chip `prog-apply` schrieb das Wiederholungsziel bis v36 in **alle** offenen
Arbeitssätze. Seit dem Coach-Umbau ist das falsch: „62,5 kg × 6 Wdh." meint den
**Top-Satz**, nicht jeden Satz — der Abfall über die Sätze ist eine eigene Achse.
Aus einer Vorbelegung 8/8/6 konnte so bei einem Halte-Vorschlag ein 5/5/5 werden,
also genau der Rückschritt, den `satzVorgabe()` gerade verhindert.

Seit v37: **Gewicht** auf alle offenen Arbeitssätze, **Wiederholungsziel** nur auf den
ersten. Die hinteren behalten ihre Vorbelegung, **gedeckelt** auf das Ziel — kein
späterer Satz darf über dem ersten stehen (bei gleicher Last unplausibel), niedriger
darf er sein. Leere Felder bekommen das Ziel als Startwert.

| Vorbelegung | Vorschlag | Ergebnis |
|---|---|---|
| 8/8/6 @ 60 | 62,5 kg × 6 | 6/6/6 @ 62,5 |
| 8/8/6 @ 60 | 60 kg × 8 | 8/8/**6** @ 60 |
| 8/8/6 @ 60 | 60 kg × 10 | 10/8/6 @ 60 |

**Ab v42 ist das der Rückfallweg.** Der Regelfall ist der vierte Parameter `plan`:
Der Coach liefert für **jeden** Arbeitssatz ein eigenes `{ kg, reps }`, und die
Zuordnung läuft positionsgenau über alle Arbeitssätze — abgehakte zählen mit, werden
aber nie überschrieben. Hat der Plan mehr Sätze als die Übung (weil `satzZahl()` einen
dazugelegt hat), werden sie **ergänzt**; überzählige bleiben stehen: Sätze wegzunehmen
ist keine Entscheidung, die ein Tipp auf einen Vorschlag treffen sollte.

Abgedeckt durch `test-apply.js` (13 Fälle inkl. Aufwärm- und erledigter Sätze,
Satzplan kürzer/länger als die Übung).

### Abgehakte Sätze bleiben bearbeitbar (ab v38)

Bis v37 setzte das Rendering `disabled` auf die gesamte Zeile, sobald ein Satz
abgehakt war (`const dis = (done || auswahl) ? ' disabled' : ''`) — inklusive des
Hakens selbst. Ein Vertipper war damit nur durch Löschen und Neuanlegen des Satzes
zu korrigieren. `checkSet()` konnte Sätze die ganze Zeit wieder aufmachen
(`if (s.done === true) { s.done = false; … }`), der Pfad war über die UI nur
unerreichbar.

Jetzt sperrt `dis` nur noch im **Auswahl-Modus**, wo die Zeile als Checkbox dient.

**Folge davon — PR-Neuberechnung.** Wer 100 × 8 abhakt (PR!) und den Vertipper auf
100 × 5 korrigiert, hätte sonst ein falsches PR-Abzeichen am Satz und beim Speichern
eine Historie, die einen Rekord behauptet, den es nie gab. `prNeuBerechnen(xi)`
bewertet deshalb **alle** abgehakten Sätze der Übung in Abhak-Reihenfolge neu — es
reicht nicht, nur den geänderten Satz zu prüfen, weil PRs aufeinander aufbauen:
korrigiert man den ersten Satz nach unten, kann der dritte nachträglich zum PR werden.

Aufgerufen an drei Stellen:

| Auslöser | Warum |
|---|---|
| `input` auf kg/Wdh. eines abgehakten Satzes | Wert geändert. **Ohne `render()`** — das würde beim Tippen den Fokus aus dem Feld reißen |
| `change` (Feld verlassen) | zieht die Abzeichen nach, hier ist `render()` unschädlich |
| `set-warmup` auf einem abgehakten Satz | Aufwärmsätze zählen nicht für PRs |

Der `change`-Zweig steht **vor** dem Einstellungs-Zweig: Workout-Felder tragen
ebenfalls ein `data-set` (den Satz-Index), das dort sonst als Einstellungs-Schlüssel
gelesen würde.

CSS: `.set-row.done .step-btn` lief auf `opacity: 0.3`, weil die Buttons tatsächlich
deaktiviert waren — jetzt `0.6`, sonst sehen bedienbare Buttons tot aus. Dass die
Zeile erledigt ist, trägt der grüne Hintergrund.

Abgedeckt durch `test-pr-edit.js` (10 Fälle inkl. PR-Ketten und Aufwärmsätzen).

### Pausenziel je Satz (ab v39)

Pausen hingen bisher an der Übung. Jetzt kann jeder Satz — auch jeder
Aufwärmsatz — eine eigene Zeit tragen; die Standardwerte bleiben unverändert und
greifen überall, wo nichts eingetragen ist.

**Zwei Felder, die man nicht verwechseln darf.** Am Trainingssatz ist `restSec`
die **gemessene** Pause (`checkSet()` schreibt die verstrichene Zeit hinein,
`setInfoLine` zeigt sie an). Die Vorgabe liegt deshalb auf einem eigenen Feld
`restZiel` — auf demselben Feld wäre die Einstellung nach dem ersten Satz vom
Messwert überschrieben. In der **Vorlage** heißt die Vorgabe `sets[].restSec`,
weil es dort keine Messung gibt.

`restZielFuerSatz(wex, si)` liefert das Ziel, oder `null` für „kein Timer":

1. `restZiel` des Satzes (aus dem Plan bzw. heute im Sheet gesetzt)
2. Arbeitssatz → `restTarget()` wie bisher (Plan-Override → Übung → Coach)
3. Aufwärmsatz → **nur der letzte eines Blocks** bekommt den Übungs-/Coach-Wert

Zu 3: Zwischen Rampensätzen pausiert man nach Gefühl, ein voller Timer würde dort
nur den Gong mehrfach pro Übung auslösen. Vor dem ersten Arbeitssatz ist die volle
Pause dagegen richtig, damit man frisch hineingeht. „Letzter des Blocks" = der
nächste Satz existiert und ist kein Aufwärmsatz; am Ende der Übung folgt nichts,
worauf man sich erholen müsste. Mehrere Blöcke je Übung werden korrekt behandelt.

| Sätze | Timer |
|---|---|
| W W W A A A | – – 180 · 180 180 180 |
| W W A W A | – 180 · 180 · 180 180 |
| W W W (ohne Arbeitssatz) | – – – |

**Bearbeitet wird an zwei Stellen:** dauerhaft im Vorlagen-Editor (Spalte „P s"
je Satzzeile, leer = `auto`), für heute im Satz-Optionen-Sheet (Tippen auf die
Satznummer). Das Sheet zeigt im Platzhalter, was „auto" konkret bedeutet.

**Zwei Stellen, die die Werte sonst verloren hätten** und deshalb mit angepasst
wurden: `tplStrukturUpdate()` (Plan-Abgleich nach dem Training — baut die
Vorlagen-Sätze aus dem Workout neu und hätte die Pausen weggeworfen; Quelle ist
`restZiel`, nicht die gemessene `restSec`) und der Übungstausch im Training
(Pausenziele wandern mit, der „auto"-Wert dahinter richtet sich danach nach der
Muskelgruppe der neuen Übung).

Abgedeckt durch `test-pause.js` (9 Fälle Aufwärmblock-Regel) und
`test-pause-rundlauf.js` (Vorlage → Training → Plan-Abgleich → Vorlage, plus
Altbestand ohne die neuen Felder).

## 5. Datenmodell (localStorage `kraftlog-state-v1`)

```js
{
  schemaVersion: 1,
  settings: {
    theme: 'auto'|'hell'|'dunkel', sound: true, vibration: true,
    benachrichtigung: true,            // lokale Notification am Pausenende
    hintergrundSignal: false,          // Opt-in: stille Tonspur (unterbricht Musik)
    coach: true,                       // Coach-Empfehlungen an/aus
    restCompound: 180, restIsolation: 90,   // Klassik-Modus-Pausen (Coach aus)
    incUpper: 2.5, incLower: 5,             // Klassik-Modus-Inkremente
    lastExport: null, groesseCm: null,      // Export-Erinnerung (7 Tage), BMI
    strava: { workerUrl, clientId, refreshToken, accessToken, accessBis, athlet, autoPost },
    push:   { aktiv: false, sub: null },    // sub = PushSubscription.toJSON()
    rehaPush: { aktiv: true, zeit: '08:00' }  // Erinnerung an den Morgen-Check
  },
  customExercises: [ { id: 'cu-…', name, mg, eq, compound } ],
  exerciseSettings: { [exId]: { restSec?, notiz?,
                       periode?: { aktiv, basis, saetze, reps, seit } } },   // Overrides pro Übung
                                          // periode = 4-Wochen-Block, `seit` immer ein Montag
  templates: [ { id: 't-…', name, createdAt,
                 exercises: [ { exId, restSec|null,
                                sets: [ { reps, kg?, warmup? } ] } ] } ],
  wochenplan: { mo|di|mi|do|fr|sa|so: templateId },        // fehlender Tag = Ruhetag
  workouts: [ { id: 'w-…', templateId|null, name, startedAt, finishedAt, notiz, stravaId?,
                exercises: [ { exId, repMin, repMax, notiz,
                               sets: [ { kg, reps, rpe|null, warmup, doneAt, restSec|null } ] } ] } ],
  runs: [ { id: 'r-…', startedAt, distanzKm, dauerSec, notiz, stravaId? } ],
  activeWorkout: null | { …wie workout, Sätze mit done-Flag,
                          rest: null|{ startedAt, targetSec, exIdx, setIdx, signaled } },
  bodyweight: [ { date: 'YYYY-MM-DD', kg } ],
  reha: { [muskelgruppe]: { aktiv, seit, stufe: 1..4, stufeSeit, basis: 0..10 } },
  rehaLog: [ { ts, mg, typ: 'uebung'|'morgen', wert: 0..10, exId|null, workoutId|null } ],
  rehaInit: false,       // Erstbelegung (Beine an) ist gelaufen
  periodInit: false      // Erstbelegung der Periodisierung (Bankdrücken) ist gelaufen
}
```

Wichtige Konventionen: Pläne speichern **exakte Soll-Wiederholungen pro Satz** (keine
Bereiche) und optional feste Gewichte pro Satz (leer = Auto-Vorbelegung vom letzten Mal);
`warmup`-Sätze zählen nirgends als Arbeitsvolumen. `restSec` in einem gespeicherten Satz
ist die **tatsächlich gemessene** Pause nach diesem Satz.

## 6. Die fünf Tabs

Reihenfolge in der Tab-Bar: **Profil · Verlauf · Start (Mitte, hervorgehoben) · Übungen · Daten**.

1. **Start** — Trainings-Hub: Karte „Heute laut Wochenplan" (mit „Erledigt ✓" nach
   absolviertem Training bzw. Ruhetag-Karte), Grid der eigenen Pläne (jede Kachel mit
   ⋯-Menü zum Bearbeiten — Bearbeiten startet nie versehentlich ein Workout), „Freies
   Training", „Lauf eintragen", Wochenplan-Button mit Warnungs-Badge. Untersichten:
   Planliste (Mehrfachauswahl → Löschen/Exportieren), Plan-Editor, Wochenplan,
   aktives Workout.
2. **Verlauf** — chronologische Liste aus Krafttrainings **und** Läufen, monatsweise
   gruppiert, mit Dauer/Volumen/PR-Badges; Detailansicht mit Satzliste, Notizen,
   Strava-Post-Button; voller Editor (Name, Datum, Uhrzeit, einzelne Sätze).
3. **Übungen** — Suche + Filter-Chips (Muskelgruppe/Equipment), eigene Übungen anlegen.
   Übungs-Detail: PR-Kacheln, drei SVG-Charts (e1RM-Verlauf, Top-Satz-Gewicht, Volumen
   pro Einheit; bei Körpergewichtsübungen Wiederholungen), Pausen-Override, Notiz,
   Historie.
4. **Profil** — Dashboard: Kacheln (Trainings gesamt/diese Woche, Volumen und PRs der
   letzten 30 Tage, Lauf-Kilometer), Wochenvolumen-Balkenchart je Muskelgruppe (12
   ISO-Wochen, umschaltbar Sätze/Tonnage), Trainings pro Woche, letzte PRs.
5. **Daten** — Körpergewicht (Chart mit 7-Tage-Trend, BMI), Design & Signale (Theme,
   Ton, Benachrichtigung, Hintergrund-Signal, Vibration), Coach-Schalter (+
   Klassik-Parameter wenn aus), Strava, Pausen-Push, Datenverwaltung (JSON-Export/
   -Import, Strong-Import, Backup wiederherstellen, alles löschen).

## 7. Workout-Maschine und Pausen-Timer

- **Start:** Aus Plan oder frei. Jeder Arbeitssatz wird vorbelegt: expliziter Planwert
  schlägt den entsprechenden Satz der letzten Einheit.
- **Satz abhaken (`checkSet`)** ist der zentrale Moment: validiert Eingaben, entsperrt
  iOS-Audio (Nutzer-Geste), finalisiert die **laufende Pause als gemessene `restSec`
  des Vorsatzes**, prüft PRs gegen die gesamte Historie (Toast + Konfetti), startet die
  neue Pause (`rest`-Objekt mit Timestamps) und plant den Push-Weckruf.
- **Pausenziel-Hierarchie:** Plan-Override → Übungs-Override → Coach-Wert der
  **Muskelgruppe** (bzw. Klassik-Pauschale). Timer-Bar: Fortschrittsbalken, „+30 s",
  „Skip", „Los!" (exakte Pausenmessung). Am Ziel: Gong + Vibration + lokale
  Notification (siehe Abschnitt 8).
- **Aufwärmsätze starten keine Pause.** Zwischen den Rampensätzen pausiert man kurz
  nach Gefühl; ein Timer mit vollem Pausenziel hätte hier den Gong ein halbes Dutzend
  Mal pro Übung ausgelöst. `checkSet` überspringt bei `s.warmup` das Anlegen von
  `aw.rest` und beendet eine laufende Pause samt Push-Weckruf. Wer doch eine will:
  „Pause starten" in der Timer-Leiste.
- **Editieren während des Trainings:** Sätze überall einfügen/löschen (der
  Pausen-Zeiger wird per Index-Korrektur bzw. Objekt-Identität gerettet), Übungen
  hinzufügen, Aufwärmsatz-Flag pro Satz, Notizen **pro Übung**, Aufwärm-Rechner.
- **Reihenfolge ändern** (`woExVerschieben` / `reihenfolgeSheetHtml`): Welche Übung wann
  drankommt, entscheidet oft erst das Gerät, das frei wird. Das Sheet „Reihenfolge
  ändern…" (aus dem Trainings-⋯ und aus dem Übungs-⋯) sortiert die Übungen per ▲/▼;
  abgehakte Sätze wandern mit ihrer Übung mit. Alles, was auf einen Übungs-Index zeigt
  (laufende Pause, Satz-Auswahl), wird beim Tausch mitgezogen. Gespeichert wird die
  neue Reihenfolge über den Plan-Abgleich am Trainingsende: `planUpdateDiff` vergleicht
  die Reihenfolge mit, ein reines Umsortieren gilt deshalb als Struktur-Abweichung und
  „Struktur und Werte übernehmen" schreibt sie in den Plan zurück.
- **Aufwärm-Rechner** (`computeWarmup`): prozentuale Rampe aufs Arbeitsgewicht,
  2,5-kg-Raster, feste Länge je Muskelgruppe (`WARMUP_GROSS` / `WARMUP_RAMPEN`):
  große Gruppen (Beine, Gesäß, Brust, Rücken) 3 Sätze — 50 %×8, 70 %×4, 85 %×2;
  alle übrigen (Schultern, Arme, Waden, Core) 2 Sätze — 50 %×8, 75 %×4.
  Kein Satz unter der leeren Stange (20 kg / SZ 10 kg), keiner auf/über dem
  Arbeitsgewicht — bei leichten Gewichten fallen Sätze deshalb von selbst weg.
  Verfügbar im Plan-Editor und im laufenden Training.
- **Beenden:** Nur abgehakte Sätze werden gespeichert; liegt der letzte Satz > 30 min
  zurück, wird die Dauer auf dessen Zeitpunkt gedeckelt (liegengelassene Trainings).
  Danach ggf. Auto-Post zu Strava und **Plan-Abgleich**: weicht das Training vom Plan
  ab, fragt die App „Plan aktualisieren?" — Optionen: Original behalten / nur Werte
  übernehmen / (bei Struktur-Abweichung zusätzlich) Struktur und Werte übernehmen.
- **Minimieren:** Das laufende Training lässt sich verlassen (ganze App nutzbar);
  ein schwebender „‹ Zurück zum Training"-Button mit Live-Dauer bleibt sichtbar.
  Nach App-Neustart: Fortsetzen-Dialog.

## 8. Signalwege am Pausenende (das Musik-Problem)

Drei sich ergänzende Wege, bewusst so gebaut, dass **laufende Musik nicht stoppt**:

1. **In der App (Vordergrund):** der **Gong** (Undertaker-Bell, 3,6 s, mono, als
   MP3-Data-URI in `timer.js` eingebettet — die App bleibt damit offline-tauglich und
   die Single-File-Variante lädt nichts nach) + Vibration + lokale Notification. Er
   läuft über ein Audio-Element und tönt deshalb auch im Hintergrund, solange die
   Audio-Session gehalten wird. Darf er nicht spielen (Autoplay-Sperre), springt die
   **synthetische WebAudio-Glocke** ein (zwei Anschläge, 660 Hz + Obertöne 1320/1980 Hz,
   exponentieller Ausklang) — das Pausenende geht nie lautlos vorbei. Über die
   **Audio Session API** (Safari 17+) läuft die App im Modus `ambient` (mischt sich mit
   Musik) und wechselt nur fürs Signal kurz auf `transient`.
   Beide Signal-Elemente werden in derselben Nutzer-Geste entsperrt (erster Satz-Haken
   bzw. Start einer freien Pause) — iOS merkt sich die Freigabe pro Element.
2. **Opt-in „Hintergrund-Signal":** stille WAV-Schleife im Modus `playback` hält die
   App bei gesperrtem Gerät wach — unterbricht dafür die Musik (iOS-Einschränkung),
   deshalb standardmäßig aus und ehrlich beschriftet.
3. **Pausen-Push (empfohlener Weg für gesperrtes Gerät):** Beim Abhaken schickt die App
   `{subscription, delaySec}` an den Cloudflare Worker; der stellt einen
   Durable-Object-Alarm und sendet bei Ablauf eine **payloadlose, VAPID-signierte
   Web-Push-Nachricht** an Apples/Googles Push-Dienst. Das iPhone klingelt auch
   gesperrt, Musik läuft weiter. „Los!"/Trainingsende storniert den Weckruf.
   Standard-Wachhalten im Vordergrund ist zusätzlich ein Screen Wake Lock.

## 9. Der Coach (coach.js) — evidenzbasiertes Regelwerk

Vollständig offline und deterministisch. **Zwei getrennte Achsen** — das ist der
wichtigste Punkt an diesem Modul:

**1. Satzpause hängt an der Muskelgruppe** (`PAUSEN`), nicht an der Übungskategorie.
Entscheidend ist, wie viel Masse und Systemermüdung im Spiel ist, nicht ob die Übung
ein- oder mehrgelenkig ist: ein Beinstrecker braucht mehr Luft als ein Curl, obwohl
beides Isolation ist. Verbund und Isolation derselben Gruppe bekommen deshalb
denselben Wert.

| Pause | Muskelgruppen |
|---|---|
| **3:30** (210 s) | Beine, Gesäß |
| **3:00** (180 s) | Brust, Rücken, Bauch/Core |
| **2:30** (150 s) | Schultern, Bizeps, Trizeps, Waden, Unterarme |

`PAUSE_MIN = 150` ist eine harte Untergrenze — auch eine unbekannte Muskelgruppe
(eigene Übung mit fremdem `mg`) fällt auf 2:30, nie darunter. Die frühere Staffelung
lief über die Kategorie und endete bei 90 s für kleine Muskeln; das ließ in der Praxis
zu wenig Leistung für den nächsten Satz übrig.

**2. Wiederholungen und Steigerung hängen an der Kategorie** (`KATEGORIEN`,
Verbund/Isolation × Unterkörper/Oberkörper bzw. große/kleine Muskelgruppe).
Die Rep-Werte sind **nur Rückfallwerte**, wenn der Plan keine Satzziele vorgibt:

| Kategorie | Reps | Steigerung | Deckel | Raster |
|---|---|---|---|---|
| Unterkörper-Grundübung | 5–8 | 5 % | 2,5–10 kg | 2,5 kg |
| Oberkörper-Grundübung | 5–8 | 2,5 % | 2,5–5 kg | 2,5 kg |
| Isolation, große Muskelgruppe | 8–12 | 2,5 % | 2,5–5 kg | 2,5 kg |
| Isolation, kleine Muskelgruppe | 8–12 | 2 % | 1,25–2,5 kg | 1,25 kg |

### Bewertungslogik (2026-08 neu geschrieben)

Die Vorgängerfassung hatte zwei Konstruktionsfehler, die offensichtlichen Unsinn
empfohlen haben, und beide sind hier der Grund für die jetzige Struktur:

1. Sie prüfte `ws.every(reps >= repMax)` und erhöhte dann sofort. Bei einem Plan
   2 × 5 hieß das: zweimal 5 Wdh. → mehr Gewicht. Kein Bestätigungskriterium,
   keine Berücksichtigung, **wie schwer** die 5 Wdh. waren.
2. Sie wertete jeden Satz unter `repMin` als Einbruch. 10/8/5 bei gleicher Last
   ergab „3 × 6 zurückerobern" — eine **Reduktion**, obwohl der Top-Satz 10 Wdh.
   lieferte.

Deshalb laufen jetzt **zwei unabhängige Achsen**:

- **Leistungsachse — nur der Top-Satz** (`topSatz()`: höchste Last, bei Gleichstand
  meiste Wdh.). Er entscheidet über die Last. Spätere Sätze tragen Ermüdung mit sich
  und sagen über die Tragfähigkeit der Last nichts aus.
- **Ermüdungsachse — Wiederholungsabfall** (`abfallAnalyse()`, nur über Sätze mit
  **gleicher** Last, damit eine geplante Pyramide nicht als Abfall zählt).
  Schwellen analog zum Velocity Loss: ≤ 25 % normal, > 25 % auffällig, > 40 % stark.
  Ein Abfall ist ein **Ermüdungs**signal (Pause, Anlauf im ersten Satz) und führt
  **nie** zu einer Lastreduktion.

Zwei getrennte Schwellen statt einer, sonst wird ein echter Bereich falsch gelesen:
`ziel = repMax` (ab hier ist Steigerung ein Thema), `boden = repMin` (erst darunter
ist das Ziel **verfehlt**). Bei festem Satzziel fallen beide zusammen; im Bereich
6–8 sind 7 Wdh. Zwischenstand, kein Einbruch.

**Steigerung setzt einen Reserve-Nachweis voraus** — „Ziel getroffen" allein reicht
nie (in allen drei APRE-Varianten liegt „Ziel getroffen" im Halten-Band, erhöht wird
ab 2 Wdh. darüber). Zwei gleichwertige Wege:

- **über RPE:** `(topReps − ziel) + RIR ≥ 2`, mit `RIR = clamp(10 − RPE, 0, 5)`
- **ohne RPE:** Ziel in **zwei aufeinanderfolgenden** Einheiten bei ≥ gleicher Last

RPE ist damit **Modifikator, nie Voraussetzung** — RIR-Schätzungen sind nur nahe am
Versagen belastbar, deshalb der Deckel bei 5.

`empfehlung()` entscheidet in dieser Reihenfolge:

1. **Last trägt nicht** (`dU ≤ weg`) → Reduktion, **am Ausmaß bemessen**: ~3 % je
   fehlender Wdh., gedeckelt auf 5–15 %. (Vorher pauschal −10 %, was bei 2 von 8
   Wdh. viel zu wenig war.)
2. **Ziel verfehlt** (`dU < 0`) → zweimal in Folge bei ≥ gleicher Last: Deload;
   sonst halten. Auch dauerhaftes Verfehlen um **eine** Wdh. löst aus — sonst gäbe
   es für Stagnation keine Ausfahrt.
3. **Steigerung gebremst** → Nachweis liegt vor, aber der Satzabfall ist **neu**
   stark (> 40 %, letztes Mal nicht) oder das Gesamtvolumen ist > 10 % eingebrochen.
   Dann eine Einheit halten und die Ermüdung verteilen. Ein **dauerhaft** starker
   Abfall bremst nicht — das ist dann der Trainingsstil, und die Last stünde sonst
   für immer still.
4. **Steigerung** → Schritt abgestuft (`dEff ≥ 5` → doppelter Schritt). Das
   Wiederholungsziel an der neuen Last wird über **e1RM zurückgerechnet**, nicht
   auf `repMin` gesetzt.
5. **Im Bereich** (`d < 0`) → doppelte Progression, +1 Wdh.
6. **Ziel erreicht, Reserve unbestätigt** → „bestätigen" (gleiche Wdh., nicht +1)
   bzw. bei zu wenig RPE-Reserve „+1 anpeilen".

**Schrittgröße** (`schritt()`) gibt **`null`** zurück, wenn selbst der kleinste
verfügbare Sprung mehr als 10 % der Last wäre — 2,5 kg auf 10 kg sind 25 % und kein
Steigerungsschritt. Dann wird über **Wiederholungen** gesteigert, und
`repsFuerSprung()` rechnet über e1RM aus, ab welcher Wiederholungszahl der Sprung
trägt. Das war die Ursache der unbrauchbaren Vorschläge bei leichten Übungen.

Zeit-/Strecken-Übungen (Plank, Farmer's Walk) sind per `hint` ausgenommen
(„Manuell steigern").

### Satzzahl und Satzvorgabe (ab v42)

Bis v41 hat der Coach die Satzzahl **nicht bewertet**: `ws.length` floss nur in den
Text („Unverändert 3 Sätze"). Zwei Folgen davon:

1. Der Volumenvergleich lief über die **Rohsumme** der Wiederholungen. Vier Sätze
   statt drei sahen wie Fortschritt aus, drei statt vier wie ein Einbruch — und
   `volumenBricht` bremste dann die Steigerung. Jetzt wird **pro Satz** verglichen
   (`wdhProSatz`).
2. Es gab keinen Weg, Volumen als Überlastung zu nutzen.

Die Satzzahl ist jetzt eine eigene Achse (`satzZahl()`). Sie steigt um **einen**
Satz, wenn **alle** Bedingungen gleichzeitig gelten:

- die Lastachse gibt nichts her (`typ` ist `wdh` oder `halten`),
- die Last steht seit **zwei** Einheiten,
- die Satzzahl war in beiden Einheiten **gleich** (ergibt von selbst Enes' Rhythmus
  „alle zwei Wochen ein Satz mehr" statt einer Rampe),
- der Wiederholungsabfall liegt im 25-%-Band,
- `wochenSaetze + 1 ≤ VOLUMEN[mg].max` und Satzzahl < `SATZ_MAX_UEBUNG` (= 5).

Beim `plus` und beim `deload` bleibt sie stehen — eine Stellschraube je Einheit,
sonst ist ein Rückschlag nicht auswertbar.

**Jede Empfehlung trägt jetzt einen vollständigen Satzplan** (`satzplan()`), nicht
mehr nur ein Top-Satz-Ziel. Die Wiederholungen der hinteren Sätze kommen aus dem
**eigenen** Abfall der letzten Einheit (`satzRate()`, geometrisch je Satz), gedeckelt
auf höchstens 15 % je Satz und nie unter 75 % des ersten Satzes. Ohne Historie greift
8 % je Satz — der oft zitierte Wert „zweiter Satz = 70 % des ersten" stammt aus Sätzen
**bis ans Versagen** mit kurzen Pausen und ist hier der falsche Bezug.

`flach: true` erzwingt gleiche Wiederholungen in allen Sätzen. Das gilt für Deloads,
für die Einheit, in der die Sätze zusammengeholt werden, für alle Reha-Vorgaben und
für die Periodisierung. Flache Pläne umgehen zusätzlich die „kein Rückschritt"-Regel:
Dort ist die niedrigere Vorgabe der Zweck.

`kontext` (6. Parameter von `empfehlung()`) liefert `sessionSaetze`, `wochenSaetze`
und `einheiten`; er kommt aus `coachKontext()` in app.js.

### Eine Regel für den Gewichtssprung (ab v42)

Vorher bremste ein Satzabfall nur, wenn er **neu** und über **40 %** war. Ein Abfall
von 30 % ging durch, ein gleich großer an anderer Stelle nicht — daher der Eindruck,
der Trainer sei unstimmig. Jetzt gilt überall dasselbe: Der Sprung braucht
**(1) nachgewiesene Reserve** und **(2) Sätze im 25-%-Band**. Einzige Ausnahme, und
sie ist selbst eine Regel: Liegt der Abfall **zwei Einheiten in Folge** außerhalb des
Bandes, ist er die Arbeitsweise und bremst nicht mehr.

Zweiter Teil derselben Unstimmigkeit: **RPE wird am LETZTEN Satz mit der Top-Last
abgelesen** (`letzterMitLast()`), nicht am ersten. RPE 8 im frischen ersten Satz
reichte vorher für den Nachweis, obwohl der letzte Satz am Limit lag — das war das
„sobald ich 6 Wiederholungen geschafft habe, geht es hoch". Fehlt dort ein Wert, gilt
ersatzweise der des Top-Satzes.

**Form einer Empfehlung:** `{ typ, kg, reps, saetze, plan, planText, text, grund, hinweis }`.
`plan` ist die Liste `[{ kg, reps }]` über **alle** Arbeitssätze; `planText` ist die
zweite Zeile des Chips („4 × 105 kg · 4/4/4/4 Wdh.").

- `text` ist der Chip im Training und nennt **immer Gewicht und Wiederholungsziel**
  („Deload: 72,5 kg × 10 Wdh. (−9 %)"). Eine nackte kg-Zahl ließ offen, woran man
  merkt, ob der Vorschlag aufgegangen ist — beim Deload war das der eigentliche
  Stolperstein: −10 % bis ans Versagen geprügelt ist kein Deload.
- `reps` füllt beim Tippen auf den Chip (`prog-apply`) die offenen Arbeitssätze mit,
  nicht mehr nur `kg`.
- `hinweis` sind Paare `[Was, Wie]` — Gewicht / Wiederholungen / Sätze / Anstrengung
  (RIR-Vorgabe) / Danach. Das „Warum?"-Sheet zeigt sie als **„So setzt du das um"**
  über der Begründung: im Training will man zuerst wissen, was zu tun ist.
- `grund` ist die Herleitung, weiterhin mit realem Prozentsatz.
- Der Deload hat einen eigenen `typ` (`'deload'`) und damit eine eigene Chip-Farbe
  (rot statt orange) — er ist der einzige Vorschlag, der Gewicht **wegnimmt**, und darf
  nicht wie ein normales „halten" aussehen.

Der **Klassik-Modus** (Coach aus, in `progressionFor`) behält seine eigenen
Steigerungsschritte aus den Einstellungen (`incLower`/`incUpper`) — „Klassik" heißt:
du legst die Schrittgröße selbst fest, nicht: die Beurteilung darf falsch sein.
Er nutzt deshalb dieselbe Bewertungslogik: Top-Satz statt schwächstem Satz und
Reserve-Nachweis (RPE oder zweite Einheit) vor dem Sprung.

### Periodisierung (`periodEmpfehlung`, ab v42)

Der reaktive Coach kennt keinen **geplanten** Ermüdungsauf- und -abbau — genau den
braucht man vor einem Rekordversuch. Deshalb je Übung optional ein 4-Wochen-Block:

| Woche | Last | Schema | RPE (letzter Satz) | Pause |
|---|---|---|---|---|
| 1 Einstieg | Basis | n × r | 7,5–8 | Coach-Pause + 30 s |
| 2 Steigerung | Basis + 1 Schritt | n × r | 8,5 | Coach-Pause + 30 s |
| 3 Peak | Basis + 2 Schritte | n × r | 9–9,5 | Coach-Pause + 90 s |
| 4 Deload | ~85 % der Peak-Last | (n−1) × (r−1) | 6–7 | Coach-Pause − 30 s |

Der „Schritt" ist **kein** fester Prozentwert, sondern derselbe `schritt()`, den der
Coach auch sonst rechnet. Für Bankdrücken (Oberkörper-Grundübung, 2,5 %) bei 105 kg
ergibt das 105 / 107,5 / 110 / 92,5 kg.

Von Block zu Block wandert die Basis um genau einen Schritt nach oben. **Woche und
Block werden allein aus `seit` gerechnet** und nirgends gespeichert: Ein Zustand, der
nur beim Trainieren fortgeschrieben wird, steht nach zwei Wochen Pause falsch da.

Die einzige Rückkopplung: In Woche 2 und 3 wird nur gesteigert, wenn die **Vorwoche
vollständig** stand (`periodErfuellt()` — alle vorgegebenen Wiederholungen bei
mindestens der vorgegebenen Last, beste Einheit der Woche zählt). Sonst bleibt die
Last der Vorwoche stehen und der Vorschlag sagt warum.

**Rangfolge der drei Regelwerke:** Reha > Periodisierung > reaktiver Coach. Reha
schützt Gewebe und darf von nichts überstimmt werden; ein Block ist die
ausdrücklichere Ansage als die Einheit-für-Einheit-Bewertung.

Zustand: `S.exerciseSettings[exId].periode = { aktiv, basis, saetze, reps, seit }`.
`seit` ist immer ein Montag (`wochenStart()`). Eingeschaltet wird je Übung im
Übungen-Tab; ab Werk läuft genau ein Block: Bankdrücken (Langhantel), 105 kg, 4 × 4.
Die Wochenpause wirkt über `restTarget()` — eine von Hand gesetzte Übungspause hat
weiterhin Vorrang.

**Wochenvolumen-Ziele** (direkte Arbeitssätze/Woche): Brust 12–18, Rücken 14–20,
Schultern 12–20, Bizeps 10–16, Trizeps 8–12, Beine 14–26, Gesäß 8–14, Bauch/Core 10–16,
Waden 0–16, Unterarme 0–12 (min 0 = optional, nur Obergrenze geprüft).

**Quellen (im Code zitiert):**

| Quelle | Wofür sie im Code steht |
|---|---|
| Robinson et al. 2024, *Sports Med* 54:2209–2231 | Nähe zum Versagen: Hypertrophie steigt mit geringerem RIR, **Kraft ist über einen weiten RIR-Bereich unverändert** → kein Grund, im niedrigen Rep-Bereich ans Versagen zu gehen |
| Mann et al. 2010, *JSCR* 24(7):1718–23 (APRE) | Abgestufte, leistungsabhängige Lastanpassung; „Ziel getroffen" = **halten**, erhöht wird ab +2 Wdh. |
| Plotkin et al. 2022, *PeerJ* 10:e14142 | Steigerung über Last und über Wiederholungen gleichwertig → Rep-Progression, wenn der Gewichtssprung zu grob wäre |
| Greig et al. 2022, *Sports Med Open* 8:9 | Autoregulation ebenbürtig zur festen Prozentvorgabe |
| Schoenfeld et al. 2017 / 2021 | Maximalkraft braucht schwere Lasten; Hypertrophie über breites Lastspektrum |
| Schoenfeld et al. 2016, Grgic et al. 2017 | Satzpausen ≥ 2–3 min |
| Velocity-Loss-Reviews (Held et al. 2022 u. a.) | ~20–25 % Leistungsverlust als Ermüdungsgrenze → Schwellen der Abfall-Achse |
| Halperin et al. 2022 | RIR-Schätzungen nur nahe am Versagen belastbar → RIR-Deckel bei 5, RPE nie Voraussetzung |
| ACSM Position Stand 2009 | Steigerungsschritt 2–10 % |
| Pelland et al. 2026, *Sports Med* 56:481–505 | Dosis-Wirkung Wochenvolumen: mehr Sätze = mehr Zuwachs, mit abnehmendem Grenznutzen → Satzzahl ist eine Progressionsachse, aber keine unbegrenzte |
| Enes et al. 2024, *MSSE* 56(3):553–63 · Enes et al. 2025, *J Sports Sci* 43(4):381–92 | Planmäßiges Satz-Hinzufügen schlägt konstantes Volumen → `satzZahl()` erhöht um einen Satz, im Zwei-Einheiten-Rhythmus |
| Remmert et al. 2025 (SportRxiv) | Sättigung des Satzvolumens je Einheit (~11 fractional sets je Muskelgruppe) → `SATZ_MAX_UEBUNG = 5` |
| Chaves et al. 2024, *Int J Sports Med* 45(7):504–10 | Last- und Wiederholungssteigerung gleichwertig (bestätigt Plotkin 2022) |
| Rhea & Alderman 2004 · Williams et al. 2017 | Periodisierte Programme schlagen nicht-periodisierte in der Maximalkraft → 4-Wochen-Block |
| Bosquet et al. 2007, *MSSE* 39:1358–65 | Tapering: Umfang senken, Intensität halten → Entlastungswoche bei ~85 % und reduziertem Umfang |

## 9b. Reha-Modus (ab v40)

Der normale Coach kennt genau ein Bremssignal: **nachlassende Leistung**. Nach einer
Verletzung kommt das entscheidende Signal aber vorher und aus einer anderen Richtung —
aus dem Gewebe. Muskulatur ist nach Wochen wieder belastbar, Sehnengewebe braucht Monate.
Wer nur auf Wiederholungen schaut, steigert deshalb so lange weiter, bis es wieder wehtut.

Der Reha-Modus legt eine **zweite Achse** über die Bewertung. Er wird pro Muskelgruppe
eingeschaltet (`S.reha[mg].aktiv`); alle anderen Gruppen laufen völlig unberührt weiter —
eine Reha an den Beinen ändert an der Waden-Empfehlung nichts.

**Er kann nur bremsen, nie beschleunigen.** `rehaEmpfehlung()` ruft intern `empfehlung()`
auf und dämpft deren Ergebnis. Für eine Laststeigerung müssen **beide** Achsen grün sein.

### Die Ampel (`rehaAmpel`)

Aus zwei Eingaben: Schmerz 0–10 während/nach der Übung und dem Zustand am **Morgen
danach**, verrechnet gegen den persönlichen Ausgangswert (`basis`).

| Ampel | Bedingung | Folge |
|---|---|---|
| grün | Schmerz ≤ 3 **und** Morgen-Delta ≤ 0 | Steigerung erlaubt, Schritt auf 5 % gedeckelt |
| gelb | Schmerz 4–5 **oder** Morgen-Delta +1 | Belastung wiederholen, keine Steigerung |
| rot | Schmerz > 5 **oder** Morgen-Delta ≥ +2 | Last −20 %, Isometrie-Empfehlung |
| unbekannt | keine Rückmeldung eingetragen | halten — eine fehlende Angabe gilt nie als „gut" |

Der Morgen-Check ist das schärfere Signal: Sehnengewebe reagiert **verzögert**, die
Überlastung von heute zeigt sich morgen früh. Deshalb zählt eine Einheit ohne Morgen-Check
auch nicht in die grüne Serie, die den Stufenwechsel freischaltet.

### Die vier Stufen (`REHA_STUFEN`)

Aus dem PTLE-Programm (Breda et al. 2021) auf das übertragen, was eine Trainings-App
steuern kann — Last, Wiederholungen, Sätze, Tempo. Stufe 3 des Originals (Plyometrie) ist
keine Hantelarbeit und steht als Hinweis in Stufe 4, nicht als eigene Vorgabe.

| Stufe | Name | Wdh.-Ziel | Kern |
|---|---|---|---|
| 1 | Beruhigen | 12–15 | Isometrie 5 × 45 s @ ~70 % MVC, Last steht still |
| 2 | Aufbau | 10–15 | HSR-Einstieg (~15RM), Tempo 3 s/3 s |
| 3 | Kraft | 6–10 | HSR-Endpunkt (~6RM) — erst hier liegt die Last im Dehnungsfenster |
| 4 | Rückkehr | Plan/Coach | Normale Ziele, Ampel läuft nur noch mit |

Wechsel erst nach **≥ 7 Tagen in der Stufe und 3 Einheiten in Folge grün**
(`rehaStufenCheck`). Der Modus schlägt ihn vor, ausgelöst wird er von Hand.

### Was der Modus konkret ändert

- **Schrittgröße** auf 5 % gedeckelt, **abgerundet** (5 % sind eine Obergrenze, keine
  Zielgröße) — und nie der Doppelschritt aus der APRE-Logik.
- **Wiederholungsziele** kommen aus der Stufe statt aus Plan/Kategorie (außer Stufe 4).
- **Nur eine Stellschraube pro Schritt**: steigt das Gewicht, bleiben Sätze und
  Wiederholungen stehen. Sonst ist ein Rückschlag nicht zuordenbar.
- **Tempo 3 s hoch / 3 s runter** steht in jedem Hinweis — das ist der Wirkstoff.
- **Sehnen-Belastungszeit** (`rehaTut`): Arbeitssätze ≥ 70 % der Top-Last × Wdh. × 6 s,
  pro Woche summiert und gegen 180–300 s gestellt. Leichte Sätze zählen nicht mit.

Bewusst **nicht** implementiert: der Acute:Chronic Workload Ratio. Er ist mathematisch
gekoppelt, ohne kohärente kausale Deutung und als Vorhersage nicht brauchbar
(Impellizzeri et al. 2020). Statt eines Quotienten steht hier ein schlichter Deckel.

### Wo er in der Oberfläche auftaucht

| Ort | Was |
|---|---|
| Übungskarte | Tag „Reha · Stufe N", Rückmeldungszeile mit Ampel, sobald ein Arbeitssatz steht |
| nach dem letzten Arbeitssatz | Schmerz-Sheet (Skala 0–10, farbcodiert nach den Schwellen) — genau einmal pro Übung und Tag |
| Startseite | Morgen-Check-Karte, wenn gestern trainiert und heute noch nichts eingetragen |
| Profil | Eigener Abschnitt zwischen Kopfkacheln und Wochenvolumen: Ampelkarte, vier Kennzahl-Kacheln (letzte Belastung, grüne Serie, Sehnenzeit/Woche, Tage in Stufe), Schmerzverlauf als Liniendiagramm, offener Check als Knopf |
| „Warum?"-Sheet | Ampelkarte mit Begründung, Wochenbilanz der Belastungszeit, Reha-Quellen |
| Daten → Reha-Modus | Aktive Gruppen mit Ampel, Detail-Sheet (Stufe, Ausgangswert, Verlauf), Ein-Tap-Aktivierung für jede Muskelgruppe |

### Morgen-Erinnerung (Push)

Der Morgen-Check ist nur am Morgen danach etwas wert. Er kommt deshalb als Push —
**nur wenn wirklich etwas ansteht**: am Morgen nach einer Reha-Einheit. Eine Meldung,
die jeden Tag kommt, wird nach einer Woche ungelesen weggewischt, und damit auch die,
auf die es ankommt.

`rehaMorgenPushPlanen()` prüft, ob am Vortag des nächsten Erinnerungszeitpunkts eine
Reha-Einheit lag und für den Zieltag noch kein Morgen-Wert existiert. Trifft beides zu,
wird geplant, sonst **storniert** — die Funktion ist idempotent und wird an vier Stellen
aufgerufen: App-Start, Trainingsende, nach dem Eintragen eines Schmerzwerts und nach dem
Eintragen des Morgen-Werts.

Ohne eingerichteten Pausen-Push gibt es keinen Weckruf aufs gesperrte Telefon; die Karte
auf Startseite und Profil bleibt dann der Weg. Der Einstellungsbereich sagt das explizit.

Ohne Opt-in `pushInhalt` nennt die Meldung **keine Muskelgruppe** — der Text verlässt das
Gerät sonst (verschlüsselt) Richtung Push-Dienst.

### Quellen des Reha-Regelwerks

| Quelle | Wofür sie im Code steht |
|---|---|
| Silbernagel et al. 2007, *Am J Sports Med* 35(6):897–906 | Pain-Monitoring-Modell: Schmerz ≤ 5/10 erlaubt, Rückkehr zum Ausgangsniveau am Morgen danach → Schwellen der Ampel. Schonung war der Belastung **unterlegen** |
| Breda et al. 2021, *Br J Sports Med* 55(9):501–509 | Stufenmodell und Progressionskriterium Schmerz ≤ 3/10 + ≥ 1 Woche je Stufe |
| Kongsgaard et al. 2009, *Scand J Med Sci Sports* 19(6):790–802 | Heavy Slow Resistance: Tempo 3 s/3 s, 15RM → 6RM über 12 Wochen → Wdh.-Ziele der Stufen |
| Tsai et al. 2024, *Sci Rep* 14:6875 | 180–300 s hochgespannte Belastungszeit pro Woche; Verteilung auf 2,5–5 Einheiten nachrangig → `rehaTut` |
| Arampatzis et al. 2020, *Front Physiol* 11:723 | Dehnungsfenster 4,5–6,5 % über ~3 s → Begründung für „schwer und langsam" statt leicht |
| Rio et al. 2015, *Br J Sports Med* 49(19):1277–83 | Isometrie senkt Sehnenschmerz ~45 min ohne Kraftverlust → Werkzeug der Stufe 1 und der roten Ampel |
| Liu, Li & Yang 2026, *BMC Sports Sci Med Rehabil* | Netzwerk-Metaanalyse: **keine** Übungsform der HSR überlegen → der Modus schreibt keine exotische Übungsform vor |
| Buist et al. 2008; Impellizzeri et al. 2020 | Die 10-%-Regel und der ACWR halten der Prüfung nicht stand → schlichter 5-%-Deckel statt Quotient |

## 10. Wochenplan

`S.wochenplan` ordnet Wochentagen (Mo–So) Plan-IDs zu (Tap-Auswahl, leer = Ruhetag).
Die Analyse summiert die direkten Arbeitssätze aller zugewiesenen Pläne je Muskelgruppe
und vergleicht gegen `Coach.VOLUMEN`: Balken mit grüner Zielzone, Status
ok/zu wenig/zu viel, konkrete Handlungsvorschläge („z. B. in ‚Push' (Montag) ergänzen").
Pro Muskelgruppe zeigt ein „Zusammensetzungs"-Sheet, welche Übungen an welchem Tag wie
viele Sätze beitragen. Die Startseite zeigt den heutigen Plan; Warnungen erscheinen als
Badge.

## 11. Import / Export

- **JSON-Vollexport** (`kraftlog-export-YYYY-MM-DD.json`) mit Download-, Zwischenablage-
  und Textarea-Fallback; Erinnerung nach 7 Tagen ohne Export. Import validiert Schema,
  lehnt neuere Versionen ab und legt **vorher automatisch ein Backup** an
  (`kraftlog-backup`); „Backup wiederherstellen" tauscht Stand und Backup (= Undo).
- **Pläne-Sharing:** eigenes Dateiformat `typ: 'kraftlog-plaene'` (ausgewählte Pläne +
  referenzierte eigene Übungen); beim Import werden Übungen per Namensgleichheit
  remappt, Duplikate übersprungen.
- **Strong-Import** (CSV der Strong-App, deutsche **und** englische Header, `;`/`,`,
  quote-fähiger Parser): zwei Modi — **Verlauf** (Workouts + Läufe, deterministische
  IDs machen Re-Importe idempotent) und **Pläne** (aus der jeweils neuesten Einheit
  je Workout-Name; Pausenziel = Median der echten Pausen, auf 15 s gerundet).
  Original-Übungsnamen bleiben standardmäßig erhalten (unbekannte werden als eigene
  Übungen angelegt); eine ~168-Einträge-Alias-Map und ein Regex-Rater ordnen
  Muskelgruppe/Equipment zu. „Ruhezeit"-Zeilen werden als Satzpausen übernommen,
  lbs→kg umgerechnet, Läufe erkannt, Radfahren übersprungen.

## 12. Strava-Anbindung

OAuth-Flow: App leitet zu `strava.com/oauth/authorize` (Scope `activity:write,read`),
der Rückkehr-Code wird über den Worker (`POST /token`) getauscht — das **Client-Secret
existiert nur als Worker-Secret**, nie im Browser oder Repo. Access-Token wird gecacht
und < 60 s Restlaufzeit per Refresh-Token erneuert. Nach Trainings-/Laufende (Auto-Post
abschaltbar) oder manuell postet die App über `POST /activities`:
Krafttraining als `sport_type: 'WeightTraining'` mit generierter Beschreibung
(Übungen, Top-Sätze, Volumen, PR-Zahl), Läufe als `'Run'` mit Distanz in Metern.
Gespeicherte `stravaId` verhindert Doppel-Posts.

## 13. Cloudflare Worker (`worker/`, Name `kraftlog-proxy`)

**Zwei Push-Kanäle (ab v41).** Ein Durable Object kann nur genau **einen** Alarm halten.
Läge die Morgen-Erinnerung im selben Objekt wie der Pausen-Weckruf, würde der nächste
abgehakte Satz sie stillschweigend überschreiben. Deshalb bekommt jeder Kanal ein eigenes
DO (Name = Endpoint, für `morgen` zusätzlich `#morgen`):

| Kanal | Vorlauf max. | TTL | Urgency | Wofür |
|---|---|---|---|---|
| `pause` (Standard) | 1 h | 120 s | high | Satzpause — nach zwei Minuten wertlos, soll dann verfallen |
| `morgen` | 48 h | 3 h | normal | Reha-Morgen-Check — gilt den ganzen Vormittag |

Der Pausen-Kanal behält bewusst den **nackten Endpoint** als DO-Namen: Sonst verlören
bereits geplante Weckrufe beim Deploy ihr Objekt und liefen ins Leere. Der
`tag` der Benachrichtigung hängt ebenfalls am Kanal, damit die beiden Meldungen einander
auf dem Sperrbildschirm nicht ersetzen (`sw.js` übernimmt ihn aus dem Payload).


Ein Worker, zwei Aufgaben, deploybar per `npx wrangler deploy`:

- **Strava-Proxy:** `/token` (OAuth-Tausch + Refresh, hängt die Secrets an),
  `/activities` (Pass-Through mit Bearer-Header). CORS fest auf die App-Origin.
- **Pausen-Push:** Durable Object `PausenTimer` (SQLite-Klasse, Free-Plan-tauglich)
  in Doppelrolle: ein Singleton `vapid-config` erzeugt beim ersten Aufruf automatisch
  das VAPID-Schlüsselpaar (ECDSA P-256 via WebCrypto) und verwahrt es; pro
  Push-Endpoint (= pro Gerät) ein Timer-DO mit `setAlarm()` (Delay geklemmt auf
  5–3600 s). Beim Feuern signiert der Worker ein ES256-JWT (aud = Origin des
  Push-Dienstes, 12 h Gültigkeit) und POSTet **ohne Payload** an den Push-Endpoint
  (`Authorization: vapid t=…, k=…` nach RFC 8292) — payloadlos heißt: keine
  aes128gcm-Verschlüsselung nötig; der Service Worker der App zeigt eine feste
  „Pause vorbei"-Meldung (iOS-Pflicht: jeder Push muss eine sichtbare Notification
  erzeugen). `/push/vapid` gibt nur den Public Key heraus; `/push/planen` und
  `/push/stornieren` verwalten den Alarm. Erneutes Planen überschreibt den Alarm.

`strava-proxy.js` in der Repo-Wurzel ist die ältere Nur-Strava-Variante zum
Dashboard-Copy-Paste (ohne wrangler/Durable Objects); `worker/` ist die Obermenge.

## 14. Service Worker, Caching, Build

- **sw.js:** `VERSION` (aktuell '23') wird von `build.py --bump` synchron zu den
  `?v=N`-Einbindungen gehalten. Precache von 13 Dateien, Strategie strikt cache-first,
  Navigations-Fallback auf `index.html`; neue Version → neuer Cache-Name → alte Caches
  werden beim Aktivieren gelöscht. Dazu `push`- und `notificationclick`-Handler
  (App fokussieren oder öffnen).
- **build.py:** `app` kopiert die 13 App-Dateien ins Mac-Bundle; `artifact` baut die
  Single-File-Variante mit Sanity-Checks (genau 1 CSS + 6 JS inline, kein literales
  `</script>`, keine externen Ressourcen-URLs außer einer Whitelist reiner
  Anleitungs-Links); `--bump` zählt alle `?v=N` hoch und schreibt die SW-Version.

## 15. Verwendete Web-APIs und externe Dienste (Recherche-Stichworte)

**Browser-APIs:** localStorage · Service Worker API + Cache Storage (offline-first PWA)
· Web App Manifest (Add to Home Screen, standalone) · Push API / PushManager (Web Push
auf iOS ≥ 16.4, nur in installierter PWA) · Notifications API ·
Screen Wake Lock API · **Audio Session API** (Safari 17+, `navigator.audioSession.type`:
ambient/transient/playback — der Schlüssel zum „Musik läuft weiter"-Verhalten) ·
Web Audio API · Media Session API · Vibration API · Page Visibility API · Clipboard API
· FileReader/Blob · History API · `env(safe-area-inset-*)` + `viewport-fit=cover` ·
`prefers-color-scheme` · backdrop-filter.

**Server-/Protokollseite:** Cloudflare Workers · Durable Objects + Alarms
(SQLite-backed, seit 2025 im Free Plan) · WebCrypto (ECDSA P-256, ES256-JWT) ·
Web Push Protocol / VAPID (RFC 8292), payloadlose Pushes · APNs Web Push / FCM ·
Strava API v3 (OAuth 2.0, `sport_type` WeightTraining/Run) · GitHub Pages.

**Trainingswissenschaft:** progressive overload · double progression · RPE/RIR
(Helms, Zourdos) · Satzpausen-Forschung (Schoenfeld 2016, Grgic 2017, de Salles &
Simão 2009) · ACSM Position Stand 2009 · Trainingsvolumen (Sätze pro Muskelgruppe
pro Woche) · Deload · Epley-Formel (estimated 1RM).

## 16. Sicherheit und Privatsphäre

- Alle Trainingsdaten bleiben lokal auf dem Gerät; kein Konto, kein Tracking, keine
  Analytics. Netzwerkzugriffe passieren ausschließlich bei explizit aktivierten
  Features (Strava-Post, Push-Planung) und nur zum eigenen Worker bzw. Strava.
- Strava-Client-Secret nur als Cloudflare-Secret; der VAPID-Privatschlüssel verlässt
  nie die Worker-Umgebung (nach außen gibt `/push/vapid` nur den Public Key heraus);
  Pushes sind payloadlos (keine Trainingsdaten beim Push-Dienst).
- HTML-Ausgaben laufen durch einen Escaper; Import validiert und legt Backups an;
  readOnly-Schutz gegen Version-Downgrades.
