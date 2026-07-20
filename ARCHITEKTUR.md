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
| `style.css` | 507 | Design-Tokens als CSS-Variablen, dreifache Dark/Light-Mechanik, Safe-Area, Blur-Tab-Bar, max-width 560 px. |
| `exercises.js` | 106 | Statische Übungsdatenbank: **77 Übungen**, 10 Muskelgruppen, 7 Equipment-Typen. |
| `icons.js` | 63 | SVG-Übungskacheln: Hintergrundfarbe = Muskelgruppe (10 Farben), Piktogramm = Equipment. |
| `coach.js` | 159 | Evidenzbasiertes Offline-Regelwerk: Pausen, Rep-Bereiche, Laststeigerung, Deload, Wochenvolumen-Ziele. |
| `charts.js` | 127 | Handgerollte SVG-Charts (`lineChart`, `barChart`), Farben nur über CSS-Variablen → Dark Mode automatisch. |
| `timer.js` | 144 | Signal-Primitiven: WebAudio-Glocke, eingebettete WAV-Töne, Audio Session API, Vibration. |
| `app.js` | 3336 | Die gesamte App-Engine (State, Rendering, Workout-Maschine, Import/Export, Strava, Push). |
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
    push:   { aktiv: false, sub: null }     // sub = PushSubscription.toJSON()
  },
  customExercises: [ { id: 'cu-…', name, mg, eq, compound } ],
  exerciseSettings: { [exId]: { restSec?, notiz? } },      // Overrides pro Übung
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
  bodyweight: [ { date: 'YYYY-MM-DD', kg } ]
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
- **Pausenziel-Hierarchie:** Plan-Override → Übungs-Override → Coach-Kategorie
  (bzw. Klassik-Pauschale). Timer-Bar: Fortschrittsbalken, „+30 s", „Skip",
  „Los!" (exakte Pausenmessung). Am Ziel: Glocke + Vibration + lokale Notification.
- **Editieren während des Trainings:** Sätze überall einfügen/löschen (der
  Pausen-Zeiger wird per Index-Korrektur bzw. Objekt-Identität gerettet), Übungen
  hinzufügen, Aufwärmsatz-Flag pro Satz, Notizen **pro Übung**, Aufwärm-Rechner.
- **Aufwärm-Rechner** (`computeWarmup`): prozentuale Rampe aufs Arbeitsgewicht,
  2,5-kg-Raster, bei Stangen-Übungen Start mit leerer Stange (20 kg / SZ 10 kg) × 12;
  < 40 kg: 50 %×8, 75 %×5; sonst 50 %×8, 70 %×5, 85 %×3; ab 60 kg zusätzlich 92 %×1.
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

1. **In der App (Vordergrund):** WebAudio-Glocke (zwei Anschläge, 660 Hz + Obertöne
   1320/1980 Hz, exponentieller Ausklang) + Vibration + lokale Notification. Über die
   **Audio Session API** (Safari 17+) läuft die App im Modus `ambient` (mischt sich mit
   Musik) und wechselt nur fürs Signal kurz auf `transient`.
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

Vollständig offline und deterministisch. Übungen werden in **4 Kategorien** eingeteilt
(Verbund/Isolation × Unterkörper/Oberkörper bzw. große/kleine Muskelgruppe):

| Kategorie | Pause | Reps | Steigerung | Deckel |
|---|---|---|---|---|
| Unterkörper-Grundübung | 210 s | 6–10 | 5 % | 2,5–10 kg |
| Oberkörper-Grundübung | 180 s | 6–10 | 2,5 % | 2,5–5 kg |
| Isolation, große Muskelgruppe | 120 s | 8–12 | 2,5 % | 2,5–5 kg |
| Isolation, kleine Muskelgruppe | 90 s | 10–15 | 2 % | fix 2,5 kg |

`empfehlung()` entscheidet in dieser Reihenfolge: **RPE-Gating** (alle Sätze am
Maximum, aber RPE > 9 → halten, erst Reserve aufbauen) → **Laststeigerung** (alle Sätze
am oberen Rep-Limit → +Inkrement, Reps-Reset ans untere Ende = doppelte Progression) →
**Deload** (zweimal in Folge unter dem Rep-Minimum → ~−10 %, aufs 2,5-kg-Raster
gerundet, mindestens ein echter 2,5-kg-Schritt, geclampt ≥ 0; bei Minigewichten
stattdessen „Erholung einplanen") → **erstes Verfehlen** (halten) → **im Zielbereich**
(+1 Wiederholung anpeilen). Zeit-/Strecken-Übungen (Plank, Farmer's Walk) sind per
`hint` ausgenommen („Manuell steigern"). Jede Empfehlung trägt eine „Warum?"-Begründung
mit realem Prozentsatz.

**Wochenvolumen-Ziele** (direkte Arbeitssätze/Woche): Brust 12–18, Rücken 14–20,
Schultern 12–20, Bizeps 10–16, Trizeps 8–12, Beine 14–26, Gesäß 8–14, Bauch/Core 10–16,
Waden 0–16, Unterarme 0–12 (min 0 = optional, nur Obergrenze geprüft).

**Quellen (im Code zitiert):** Schoenfeld et al. 2016 & Grgic et al. 2017 sowie
de Salles & Simão 2009 (Satzpausen), ACSM Position Stand 2009 (Laststeigerung 2–10 %),
Helms et al. 2016 / Zourdos et al. 2016 (RPE/RIR-Autoregulation), Prinzip der
doppelten Progression.

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
