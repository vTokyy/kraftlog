---
name: Kraftlog
description: Krafttraining- und Lauf-Tracker als Vanilla-PWA im Apple-nativen Look, deutsch, offline-first, Hochformat.
colors:
  bg: "#f2f2f7"
  bg-elev: "rgba(249,249,251,0.80)"
  card: "#ffffff"
  card-2: "#e8e8ee"
  text: "#1d1d1f"
  text-2: "#636368"
  sep: "rgba(60,60,67,0.24)"
  grid: "rgba(60,60,67,0.13)"
  blue: "#0071e3"
  blue-ink: "#005cbf"
  blue-solid: "#0071e3"
  blue-soft: "rgba(0,113,227,0.10)"
  green: "#34c759"
  green-ink: "#1e7a33"
  green-solid: "#1e7a33"
  green-soft: "rgba(52,199,89,0.14)"
  red: "#ff3b30"
  red-ink: "#bd1b12"
  red-soft: "rgba(255,59,48,0.12)"
  orange: "#ff9500"
  orange-ink: "#8f5100"
  orange-soft: "rgba(255,149,0,0.14)"
  gold: "#ffcc00"
  gold-ink: "#4a3800"
  bg-dark: "#1c1c1e"
  bg-elev-dark: "rgba(28,28,30,0.78)"
  card-dark: "#2c2c2e"
  card-2-dark: "#3a3a3c"
  text-dark: "#f5f5f7"
  text-2-dark: "#a8a8ad"
  sep-dark: "rgba(84,84,88,0.65)"
  grid-dark: "rgba(120,120,128,0.32)"
  blue-dark: "#0a84ff"
  blue-ink-dark: "#57abff"
  green-dark: "#30d158"
  green-ink-dark: "#30d158"
  red-dark: "#ff453a"
  red-ink-dark: "#ff7b73"
  orange-dark: "#ff9f0a"
  orange-ink-dark: "#ff9f0a"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.4px"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.35px"
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.2px"
  row:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.15px"
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.1px"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0px"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.1px"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.5px"
  timer:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.4px"
  dense:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.05px"
rounded:
  hair: "2px"
  handle: "3px"
  track: "5px"
  micro: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  sheet: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  xxl: "32px"
  gutter: "16px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  button-soft:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "14px 16px"
  list-item:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "13px 14px"
    height: "56px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
    height: "48px"
  num-input:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 1px"
    height: "40px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "7px 13px"
    height: "34px"
  chip-active:
    backgroundColor: "{colors.blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "7px 13px"
    height: "34px"
  tag:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-pr:
    backgroundColor: "{colors.gold}"
    textColor: "#4a3800"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  tabbar:
    backgroundColor: "{colors.bg-elev}"
    textColor: "{colors.text-2}"
    height: "54px"
  sheet-panel:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sheet}"
    padding: "18px 16px"
---

# Design System: Kraftlog

> Beschreibt den Stand **nach** der Design-Überarbeitung. Alle Werte sind aus
> `style.css` und `charts.js` abgelesen, nicht gewünscht.
>
> DESIGN.md ist Dokumentation, kein App-Asset: sie gehört **nicht** in die
> Precache-Liste von `sw.js` und **nicht** in die Kopierliste von `build.py`
> (genau wie `ARCHITEKTUR.md` und `LIESMICH.txt`).

## Overview

**Creative North Star: „Das Klemmbrett aus der Werkstatt-Vitrine"**

Kraftlog ist ein Arbeitsgerät, das während der Belastung bedient wird: verschwitzte
Finger, eine Hand an der Hantel, 90 Sekunden Zeit. Die gesamte Gestaltung folgt daraus.
Sie leiht sich die Sprache von iOS — SF Pro, Systemfarben, Blur-Bars, Safe-Area — nicht
aus Stilverliebtheit, sondern weil das die Sprache ist, die die Hand schon kann. Nichts
muss gelernt werden. Der Daumen weiß, wo der Haken sitzt.

Die Dichte ist bewusst zweistufig. Übersichten (Start, Verlauf, Profil) sind ruhig und
gruppiert — man scrollt sie zwischen den Sätzen. Das aktive Workout ist das genaue
Gegenteil: eine tabellarische Satzzeile mit fünf Spalten auf 375 pt Breite, Zahlen in
tabularen Ziffern, nichts Dekoratives. Dort wird nicht gelesen, dort wird getippt.

Farbe ist streng rationiert. Blau ist die einzige Interaktionsfarbe, Grün heißt
„erledigt", Orange „Achtung", Rot „zerstörend", Gold „Rekord". Es gibt keine
Markenfarbe außerhalb dieser fünf Rollen und keine dekorative Farbfläche. Die einzige
Ausnahme ist die Muskelgruppen-Palette der Übungskacheln — zehn Farben, die als
Sortiermerkmal funktionieren, nicht als Ausdruck.

**Key Characteristics:**
- Apple-nativ als Bedienbarkeitsentscheidung, nicht als Zitat
- Flächen sind flach; Schatten trägt nur, was wirklich schwebt
- Dark/Light vollautomatisch, dreifach steuerbar (System · erzwungen hell · erzwungen dunkel)
- Keine Emojis in der UI — ausschließlich Inline-SVG
- Nur Hochformat, max. 560 px Inhaltsbreite, immer einspaltig
- Deutsch, Komma als Dezimaltrennzeichen, tabulare Ziffern wo Werte sich ändern oder in Spalten stehen
- Offline-first: keine Webfonts, keine externen Bilder, keine Libraries

**Bestätigte Anti-Referenzen:** Fitness-App-Ästhetik mit Farbverlaufs-Hero und
Neon-Ringen. Gamification-Sprache (Streaks, Level, Abzeichen) jenseits der echten PRs.
Hover-abhängige Bedienelemente jeder Art.

## Colors

Apples System-Palette in ihren iOS-Werten, doppelt hinterlegt für Hell und Dunkel.
Kein Wert wird je direkt im Markup gesetzt — alles läuft über CSS-Variablen auf
`:root`, damit der Moduswechsel ohne einen einzigen JS-Eingriff funktioniert.

Jede Rolle hat **drei Zustandsformen**, weil eine Farbe nicht beides kann:

| Form | Wofür | Beispiel Grün |
|---|---|---|
| **Fläche** (`--green`) | Balken, Marken, Chart-Linien, Schalterspur, Tints | `#34c759` |
| **Tinte** (`--green-ink`) | jeder Text und jedes Icon in dieser Rolle | `#1e7a33` |
| **Grund** (`--green-solid`) | Flächen, auf denen weißer Text steht | `#1e7a33` |

Der Grund für die Trennung ist messbar: Apples Systemfarben sind als Füllfarben
kalibriert. `#34c759` als Text auf Weiß erreicht **2,22:1** — die Tinte `#1e7a33`
erreicht **5,40:1**. Optisch ist der Unterschied kaum sichtbar, für die Lesbarkeit
ist er der ganze Unterschied.

### Primary
- **Kraftlog-Blau** (Fläche hell `#0071e3` / dunkel `#0a84ff`, Tinte hell `#005cbf` /
  dunkel `#57abff`): die einzige Interaktionsfarbe. Aktiver Tab, Start-Kreis,
  primärer Button, Links, Fokusring, Timer-Fortschritt, Chart-Linien, aktiver
  Filter-Chip, Marker des nächsten offenen Satzes.

### Secondary
- **Erledigt-Grün** (`#34c759` / `#30d158`, Tinte `#1e7a33` / `#30d158`): Zustand
  „abgeschlossen". Abgehakte Satzzeile, Haken-Button, „Fertig", Pause-vorbei,
  Lauf-Tag, Volumen im Zielbereich, eingeschalteter Schalter.
- **Warn-Orange** (`#ff9500` / `#ff9f0a`, Tinte `#8f5100` / `#ff9f0a`): „stimmt so
  nicht ganz, ist aber nicht kaputt". Aufwärmsatz, Progression „halten",
  Übungs-Hinweis, Warnbanner, 7-Tage-Trendlinie, zu wenig Volumen.

### Tertiary
- **Zerstörend-Rot** (`#ff3b30` / `#ff453a`, Tinte `#bd1b12` / `#ff7b73`): nur
  Löschen und Übertrainings-Warnung. Nie als Akzent.
- **Rekord-Gold** (`#ffcc00` in beiden Modi, Tinte `#4a3800`): persönliche
  Bestleistungen — PR-Badge, PR-Toast, PR-Punkt im Chart.

### Neutral
- **Seitenfond** (`#f2f2f7` / `#1c1c1e`) · **Kartenfläche** (`#ffffff` / `#2c2c2e`) ·
  **Steuerfläche** (`#e8e8ee` / `#3a3a3c`) für vertiefte Elemente.
- **Bar-Material** (`rgba(249,249,251,0.80)` / `rgba(28,28,30,0.78)`): nur hinter
  `backdrop-filter: blur(24px) saturate(1.6)`.
- **Primärtext** (`#1d1d1f` / `#f5f5f7`) · **Sekundärtext** (`#636368` / `#a8a8ad`).
- **Trennlinie** (`rgba(60,60,67,0.24)` / `rgba(84,84,88,0.65)`) für Haarlinien;
  **Gitterlinie** (`rgba(60,60,67,0.13)` / `rgba(120,120,128,0.32)`), eine Stufe
  zurückgenommener, nur für Chart-Gitter.

### Muskelgruppen-Palette (dokumentierte Ausnahme)
Zehn feste Hex-Werte in `icons.js`, **nicht** über CSS-Variablen: Brust `#ff5a5f`,
Rücken `#3a86ff`, Schultern `#ff9f0a`, Bizeps `#a06bff`, Trizeps `#12b5b0`,
Beine `#34c759`, Gesäß `#ff5fa2`, Bauch/Core `#d4a017`, Waden `#b5773a`,
Unterarme `#6366f1`. Sie erscheinen ausschließlich als Übungskachel: die Farbe voll
als Kontur des Piktogramms, dieselbe Farbe auf 16 % Deckung als Kachelhintergrund.
Der 16-%-Trick ist der Grund, warum sie in beiden Modi tragen.

### Named Rules
**Die Ein-Stimmen-Regel.** Blau ist die einzige Farbe, die „tipp mich" sagt. Grün,
Orange, Rot und Gold sind Zustandsmeldungen und nie anklickbar — mit der einzigen
bewussten Ausnahme des grünen „Fertig"-Buttons.

**Die Tinten-Regel.** Text nimmt nie die Füllvariante einer Rolle. `--green` gehört
auf eine Fläche, `--green-ink` in einen Satz. Wer das vertauscht, baut 2:1-Kontrast.

**Die Nie-im-Markup-Regel.** Keine Farbe steht als Hex in `charts.js` oder in einem
`style`-Attribut. Läuft alles über `var(--…)`, kostet Dark Mode null Zeilen Code.

**Die Gold-ist-selten-Regel.** Gold erscheint nur, wenn tatsächlich ein Rekord fiel —
und im Chart nur, solange Rekorde höchstens ein Drittel der Punkte ausmachen. Ein
Gold auf jedem Punkt ist kein Rekord mehr, sondern Rauschen.

## Typography

**System-Font durchgängig:** `-apple-system, BlinkMacSystemFont, "SF Pro Text",
"Helvetica Neue", sans-serif`. Kein Webfont, keine Display-Schrift, keine zweite
Familie. Auf dem iPhone ist das SF Pro — die App liest sich als Teil des Geräts.

**Character:** Neutral bis zur Unsichtbarkeit. Die Persönlichkeit kommt aus Gewicht,
Laufweite und Durchschuss, nicht aus der Formensprache.

### Hierarchy
Zehn Rollen, vier Gewichte (400 · 600 · 700 · 800), neun Größen. Nichts dazwischen.

- **Display** (800, 30 px, `-0.5px`, 1.12): Seitentitel der fünf Tabs, mit Unterzeile.
- **Headline** (800, 24 px, `-0.4px`, 1.2): Detailansichten — Übung, Training, Editor.
- **Title** (800, 20 px, `-0.35px`, 1.25): Sheet-Titel, Name des laufenden Trainings.
- **Metric** (800, 24 px, `-0.5px`, proportional): KPI-Zahlen in Stat-Kacheln.
- **Body** (400, 17 px, `-0.2px`, 1.45): Fließtext, Buttons, Eingabefelder.
- **Row** (600, 16 px, `-0.15px`): Titelzeile in Listeneinträgen, Plan-Kacheln.
- **Control** (600, 15 px, `-0.1px`): kleine Buttons, Chips, Links, Sub-Zeilen.
- **Caption** (400, 13 px, `0`): Metadaten, Hilfstexte, Unterzeilen.
- **Micro** (600, 12 px, `+0.1px`): Tags, Chart-Achsen, Timer-Unterzeile.
- **Label** (700, 11 px, `+0.5px`, Versalien): Abschnitts- und Spaltenüberschriften.

### Named Rules
**Die Laufweiten-Regel.** Tracking ist größenabhängig, nie fix: −0,5 px bei 30 px,
−0,2 px bei 17 px, **+0,5 px bei 11 px**. Große Schrift wirkt sonst auseinander-
gefallen, kleine zusammengeklebt.

**Die Tabellenziffern-Regel.** `tabular-nums` überall, wo Ziffern sich **live ändern**
(Timer, Trainingsdauer) oder **in Spalten** stehen (Satzzeilen, Chart-Achsen,
Historie, Meta-Zeilen). Stehende Einzelzahlen — KPI-Kacheln, Chart-Endwert —
nehmen **proportionale** Ziffern: bei 24 px wirkt tabular locker.

**Die 17-px-Regel.** Kein Eingabefeld unter 16 px, Standard ist 17. Safari zoomt
sonst beim Fokus in das Feld hinein — mitten im Satz. Einzige Ausnahme ist das
Zahlenfeld der Satzzeile mit 16 px, weil dort fünf Spalten um Platz kämpfen.

## Layout

Eine einzige Spalte, immer. `#app` ist auf **560 px** gedeckelt und zentriert. Es gibt
weder Grid-System noch Container-Hierarchie: `#view` ist der einzige Renderziel-
Container, die Views schreiben HTML-Strings hinein.

**Spacing-Leiter:** 4 · 8 · 12 · 16 · 22 · 32 px als Tokens (`--sp-1` … `--sp-6`),
plus `--tap: 44px` als Mindestgröße jedes Bedienelements. Für Abstände im erzeugten
HTML gibt es fünf Hilfsklassen (`.mt-s` … `.mb-m`); Ausnahmen bekommen eine benannte
Komponentenklasse statt eines Inline-Styles.

**Ränder.** `#view` hat 16 px seitlich, `calc(18px + env(safe-area-inset-top))` oben
und `calc(150px + env(safe-area-inset-bottom))` unten. Die 150 px sind der reservierte
Platz für Tab-Bar plus Pausen-Leiste — so verdeckt die Leiste nie den letzten Satz.

**Breakpoints.** Nur zwei, beide funktional: ab `480px` bekommt die Satzzeile breitere
Spalten; ab `561px` wächst der obere Seitenrand auf 28 px.

**Feste Ebenen.** Tab-Bar `40` · Pausen-Leiste `39` · Workout-Kopf `30` ·
Rücksprung `45` · Sheet `60` · Chart-Tooltip `70` · Konfetti `75` · Toast `80` ·
Querformat-Sperre `200`.

**Querformat.** Ab `(orientation: landscape) and (max-height: 520px)` legt sich eine
vollflächige Hinweisebene über die App.

## Elevation & Depth

**Der Inhalt ist flach.** Karten, Listen, Kacheln und Einstellungszeilen tragen
keinen Schatten — sie trennen sich durch Tonwert (Karte gegen Fond) und Haarlinie.
Das ist keine Stilentscheidung, sondern eine Konsistenzentscheidung: im Dunkelmodus
war der Schatten gegen `#1c1c1e` ohnehin unsichtbar, dort trug immer schon der
Helligkeitssprung. Jetzt gilt in beiden Modi dasselbe Prinzip.

### Shadow Vocabulary
- **Lifted** (`--shadow-lg`, hell `0 2px 8px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.14)`;
  dunkel `0 2px 8px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.55)`): **nur** für
  Ebenen, die wirklich über dem Inhalt schweben — Bottom-Sheet, Toast,
  Chart-Tooltip, Start-Kreis der Tab-Bar, Rücksprung-Button.
- **Material** (`backdrop-filter: blur(24px) saturate(1.6)` über halbdeckender
  Fondfarbe): Tab-Bar, Pausen-Leiste, Workout-Kopf. Die einzige Stelle, an der Tiefe
  echt entsteht statt gemalt zu werden.

### Named Rules
**Die Schwebe-Regel.** Ein Schatten bedeutet: das hier liegt über dem Inhalt und
verdeckt ihn. Alles andere ist flach. Es gibt genau fünf schwebende Elemente.

**Die Kein-Rahmen-Regel.** Kontur ist Haarlinie oder gar nichts. Sekundäre Buttons
und Eingabefelder tragen einen 1-px-Innenring (`inset 0 0 0 1px var(--sep)`), damit
sie auf Karte *und* auf Fond als Bedienelement lesbar bleiben.

## Shapes

Weiche, durchgehend runde Ecken. Radien-Leiter nach Elementgröße: 2 px (Fortschritts-
balken), 4 px (Balkenkappe im Chart), 6 px (Tag, PR-Badge), 8 px (Zahlenfeld,
Stepper), 10 px (quadratische Knöpfe, kleine Buttons), 12 px (Buttons,
Eingabefelder), **14 px als Systemradius** für jede Karte und Listengruppe, 18 px für
die Oberkanten des Sheets, `999px` für Chips, Toast, Progressions-Chip und Schalter.

Der einzige Kreis ist der blaue Start-Knopf: 42 px, 16 px aus der Leiste gehoben,
3 px Rand in der Fondfarbe als optischer Freisteller.

## Components

### Buttons
- **Shape:** 12 px Radius, `min-height: 48px`. Kleine Variante: `min-height: 44px`
  (schmaler, nie flacher).
- **Sekundär (Standard):** Kartenfläche mit 1-px-Innenring in `--sep`.
- **Primary:** `--blue-solid`, weißer Text. **Green:** `--green-solid`, weißer Text,
  genau eine Verwendung („Fertig"). **Soft:** `blue-soft` + `blue-ink`.
  **Danger:** `red-soft` + `red-ink` — nie gefüllt rot.
- **Zustand:** `:active` → `scale(0.98)` + Deckkraft 0,8 über 120 ms. Kein Hover.
  `:focus-visible` → 2 px `--blue-ink` mit 2 px Offset.

### Gruppierte Listen (Signature)
Aufeinanderfolgende `.li-item`, `.setting-row` oder `.vol-row` bilden automatisch
eine Gruppe: außen 14 px gerundet, innen durch Haarlinien getrennt, die auf die
Textkante eingerückt sind (14 px, bzw. 64 px wenn die Zeile eine Übungskachel trägt).
Das läuft rein über CSS (`:not(.x) + .x` und `.x:has(+ :not(.x))`) — das erzeugte
HTML weiß nichts davon.

### Chips
Pillenform, 15 px / 600, 44 px hoch, Kartenfläche, Sekundärtext; aktiv blau gefüllt.
Die Reihe scrollt horizontal mit einer **Maskenabblendung** am rechten Rand
(`mask-image`, kein Farbwert) — abgeschnittene Wörter sind kein Hinweis auf mehr Inhalt.

### Satzzeile (Signature)
Fünfspaltiges Grid `30px 1fr 1fr 40px 44px`, 3 px Rinne: Satznummer (`W` für
Aufwärmsatz) · kg mit Stepper · Wdh. mit Stepper · RPE · Haken. Alle Flächen sind
44 pt hoch; die schmalen Stepper holen ihre Trefferfläche über **Hit-Slop**
(`::after { inset: 0 -6px }`) — sichtbar schmal, fühlbar breit.
Der nächste offene Satz trägt links einen 3-px-Balken in `--blue`.
Abgehakt färbt die Zeile `green-soft`, setzt die Zahlen auf `green-ink`, macht die
Steuerflächen transparent und den Haken auf `--green-solid`.

### Pausen-Leiste (Signature)
Schwebt über der Tab-Bar, Blur-Material, zwei Zustände am selben Ort:
**laufend** — 4-px-Fortschritt (per `scaleX`, nicht `width`), Restzeit 22 px / 800
tabular mit 12-px-Unterzeile, „+30 s", „Skip", „Los!";
**ruhend** — „Pause" plus Schnellwahl 1/2/3 min und „⋯" für eine freie Dauer.
So wohnt die Pausensteuerung immer an derselben Stelle in Daumenhöhe.

### Volumen-Balken (Signature)
Ist-Sätze gegen einen Zielbereich statt gegen einen Zielwert: 10-px-Spur, darin die
grün hinterlegte Zielzone als absolut positioniertes Fenster, darüber der Füllbalken
in Grün / Orange / Rot. Skala `max × 1,35`, damit Überschreitung sichtbar bleibt.

### Charts
Siehe `charts.js`. Linie 2 px, Fläche als Verlauf von 22 % auf 0 % (nie satt, weil
die Y-Achse gekappt sein darf), Gitter hairline in `--grid`, Balken ≤ 24 px mit
4 px Kappe und eckiger Grundlinie, 2 px Luft zwischen Nachbarn.
Marken nur, wo sie etwas sagen: letzter Wert, Bestwert (nur wo „hoch" auch „besser"
heißt), Rekorde. Trefferflächen ≥ 26 px über die volle Charthöhe.
Der letzte Wert steht immer als Zahl an der Linie — ein Tooltip ist nie der einzige
Weg zu einem Wert.

### Bottom-Sheet
Volle Breite bis 560 px, 18 px Radius oben, Griff-Indikator, Seitenfond,
`--shadow-lg`, max. 86 vh. Fährt in 320 ms `--ease-drawer` von unten ein und auf
demselben Weg in 260 ms wieder hinaus.

## Do's and Don'ts

### Do:
- **Do** für Text die `-ink`-Variante einer Farbrolle nehmen, für Flächen die Basis.
- **Do** jede Farbe über `var(--…)` beziehen — auch in `charts.js`.
- **Do** `tabular-nums` setzen, wo Ziffern sich live ändern oder in Spalten stehen —
  und **weglassen** bei stehenden Einzelzahlen ab 20 px.
- **Do** jedes Bedienelement auf `--tap` (44 px) bringen; wo die Breite nicht reicht,
  Hit-Slop per `::after` ergänzen statt die Regel zu ignorieren.
- **Do** `env(safe-area-inset-*)` überall einrechnen, wo etwas am Rand klebt.
- **Do** Icons als Inline-SVG mit `fill:none; stroke:currentColor; stroke-width:1.8;
  stroke-linecap:round` zeichnen.
- **Do** jede Bewegung mit einem `prefers-reduced-motion`-Pfad ausliefern, der den
  Zustandswechsel erhält und nur den Weg dorthin streicht.
- **Do** Leerzustände benennen: was fehlt, warum, und der nächste Schritt.

### Don't:
- **Don't** Schatten auf Inhaltsflächen legen. Genau fünf Elemente schweben.
- **Don't** Emojis in die Oberfläche schreiben — auch nicht im Leerzustand.
- **Don't** eine Webfont, eine zweite Schriftfamilie oder eine Icon-Library einführen.
- **Don't** Affordanzen an `:hover` hängen. Auf dem iPhone existiert kein Hover.
- **Don't** `width`, `height`, `padding` oder `margin` animieren — `transform` und
  `opacity` genügen für alles, was diese App bewegt.
- **Don't** eine Marke auf jeden Datenpunkt setzen. Punkte sind Aussagen, keine Deko.
- **Don't** eine Meta-Zeile in `nowrap` mit `ellipsis` bauen: die interessanteste
  Zahl steht immer hinten und fällt als erste weg. Umbrechen lassen.
- **Don't** Querformat-Layouts entwerfen. Die App sperrt es bewusst.
