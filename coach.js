/* ===== Kraftlog — Coach =====
 * Evidenzbasiertes Regelwerk für Pausen, Steigerungsschritte und Wiederholungsbereiche.
 *
 * ---------------------------------------------------------------------------
 * WARUM DIESES MODUL 2026-08 NEU GESCHRIEBEN WURDE
 * ---------------------------------------------------------------------------
 * Die Vorgängerfassung hatte zwei Konstruktionsfehler, die in der Praxis
 * offensichtlichen Unsinn empfohlen haben:
 *
 * 1) Sie prüfte, ob ALLE Sätze das Wiederholungsziel erreichen ("alleOben"),
 *    und erhöhte dann sofort die Last. Bei einem Plan mit 2 × 5 hieß das:
 *    zweimal 5 Wdh. geschafft → mehr Gewicht. Es gab weder ein Bestätigungs-
 *    kriterium noch eine Berücksichtigung, WIE schwer die 5 Wdh. waren.
 *
 * 2) Sie wertete jeden Satz unter dem Mindestziel als Leistungseinbruch.
 *    10/8/5 Wdh. bei gleicher Last führte deshalb zu "3 × 6 zurückerobern" —
 *    also zu einer REDUKTION, obwohl der Top-Satz 10 Wdh. lieferte. Der
 *    Wiederholungsabfall über die Sätze ist aber ein Ermüdungssignal, kein
 *    Lastsignal, und wird hier folgerichtig auf einer eigenen Achse behandelt.
 *
 * ---------------------------------------------------------------------------
 * WISSENSCHAFTLICHE GRUNDLAGE (als Regeln kodiert, App bleibt offline)
 * ---------------------------------------------------------------------------
 * - Nähe zum Muskelversagen wirkt auf Kraft und Hypertrophie UNTERSCHIEDLICH:
 *   Hypertrophie steigt, je näher am Versagen trainiert wird; die Kraftzunahme
 *   ist über einen weiten RIR-Bereich praktisch unverändert.
 *   → Robinson et al. 2024, Sports Med 54:2209–2231 (Meta-Regression).
 *   Konsequenz für dieses Modul: Es gibt KEINEN Grund, im niedrigen
 *   Wiederholungsbereich bis ans Versagen zu gehen, um stärker zu werden.
 *   Deshalb ist "Ziel exakt getroffen" allein nie ein Grund, die Last zu erhöhen.
 *
 * - Autoregulierte Laststeuerung (RIR/RPE) ist der starren Prozentvorgabe
 *   ebenbürtig, nicht überlegen — sie fängt aber Tagesform ab.
 *   → Greig et al. 2022, Sports Med Open 8:9 (Systematic Review/Meta-Analyse).
 *
 * - Graduierte, leistungsabhängige Laststeuerung (APRE) schlug klassische
 *   lineare Periodisierung über 6 Wochen. Kernmechanik: die Last wird in
 *   ABGESTUFTEN Schritten an den Überschuss gegenüber dem Ziel angepasst,
 *   nicht binär. Wichtig: In allen APRE-Varianten liegt "Ziel exakt getroffen"
 *   im HALTEN-Band; erhöht wird erst ab 2 Wdh. über dem Ziel.
 *   → Mann et al. 2010, J Strength Cond Res 24(7):1718–23.
 *
 * - Progressive Überlastung erhöht das Ausmaß der Hypertrophie, aber der WEG
 *   ist zweitrangig: Steigerung über Last und Steigerung über Wiederholungen
 *   führen zu vergleichbaren Kraft- und Massezuwächsen.
 *   → Plotkin et al. 2022, PeerJ 10:e14142.
 *   Konsequenz: Wenn der kleinste verfügbare Gewichtssprung relativ zur Last
 *   zu groß ist (z. B. 2,5 kg auf 10 kg = 25 %), steigert dieses Modul über
 *   Wiederholungen statt über Gewicht — statt einen unpassenden Sprung zu
 *   empfehlen.
 *
 * - Maximalkraft braucht schwere Lasten (Spezifität), Hypertrophie ist über ein
 *   breites Lastspektrum (≥ ~30 % 1RM) erreichbar.
 *   → Schoenfeld et al. 2017, J Strength Cond Res 31(12):3508–23;
 *     Schoenfeld et al. 2021, Sports 9(2):32 (Repetition Continuum).
 *
 * - Ermüdung innerhalb der Einheit lässt sich über den Leistungsabfall
 *   quantifizieren; in der Geschwindigkeitssteuerung gilt ein Verlust von
 *   ~20–25 % als Grenze für kraftorientiertes Training. Der Wiederholungsabfall
 *   über die Sätze ist das preiswerte Äquivalent dazu.
 *   → Rodiles-Guerrero et al. 2022 / Held et al. 2022 (Velocity-Loss-Reviews).
 *
 * - Satzpausen: Längere Pausen (≥ 2–3 min) verbessern Kraft- und
 *   Hypertrophie-Ergebnisse. Die Werte hängen an der MUSKELGRUPPE, nicht an der
 *   Übungskategorie: entscheidend ist die bewegte Masse und die Systemermüdung.
 *   → Schoenfeld et al. 2016, Grgic et al. 2017.
 *
 * - RIR-Schätzungen sind nahe am Versagen brauchbar (≈ 0–4 RIR) und weiter weg
 *   unzuverlässig; Trainierte unterschätzen typischerweise um 1–2 Wdh.
 *   → Halperin et al. 2022; Refalo et al. 2025.
 *   Konsequenz: RPE ist in diesem Modul ein MODIFIKATOR, nie eine Voraussetzung.
 *   Fehlt es, greift stattdessen die Bestätigung über zwei Einheiten.
 */
window.KraftlogCoach = (function () {
  'use strict';

  /* ======================================================================
     1. Übungs-Kategorien, Pausen, Volumen  (unverändert übernommen)
     ====================================================================== */

  /* Übungs-Kategorie: Verbund vs. Isolation × Muskelgröße/Körperregion */
  function kategorie(ex) {
    const unten = ex.mg === 'Beine' || ex.mg === 'Gesäß';
    if (ex.compound) return unten ? 'uk-verbund' : 'ok-verbund';
    const gross = unten || ex.mg === 'Rücken' || ex.mg === 'Brust';
    return gross ? 'iso-gross' : 'iso-klein';
  }

  /* Satzpause je Muskelgruppe. Untergrenze PAUSE_MIN — darunter geht nichts. */
  const PAUSE_MIN = 150;
  const PAUSEN = {
    'Beine':      { sec: 210, grund: 'Oberschenkel: größte Muskelmasse und die höchste systemische Ermüdung im ganzen Plan. 3:30, damit der nächste Satz am Muskel scheitert und nicht an der Kondition.' },
    'Gesäß':      { sec: 210, grund: 'Hüftdominante Arbeit (Hip Thrust, RDL, Ausfallschritte) ermüdet wie schweres Oberschenkeltraining — deshalb dieselbe Pause von 3:30.' },
    'Brust':      { sec: 180, grund: '3 min: genug Erholung für schweres Drücken, ohne das Training unnötig zu strecken. Längere Pausen (≥ 2–3 min) schlagen kurze bei Kraft und Hypertrophie deutlich (Schoenfeld et al. 2016).' },
    'Rücken':     { sec: 180, grund: '3 min: Ziehen und Rudern gehen über große Muskelmasse und oft über den Griff mit — beides braucht Erholung (Schoenfeld et al. 2016).' },
    'Bauch/Core': { sec: 180, grund: '3 min. Core-Arbeit steht meist am Ende der Einheit, wenn ohnehin schon Ermüdung im System ist.' },
    'Schultern':  { sec: 150, grund: '2:30. Die Schulter erholt sich zwar schneller als Brust oder Rücken, ist aber bei Druck- und Seitarbeit früh am Limit — kürzer bringt keinen sauberen Satz mehr.' },
    'Bizeps':     { sec: 150, grund: '2:30 als Untergrenze. Auch ein kleiner Muskel liefert nach 90 s noch nicht die volle Leistung — die Wiederholungen brechen dann einfach weg.' },
    'Trizeps':    { sec: 150, grund: '2:30 als Untergrenze. Auch ein kleiner Muskel liefert nach 90 s noch nicht die volle Leistung — die Wiederholungen brechen dann einfach weg.' },
    'Waden':      { sec: 150, grund: '2:30. Waden vertragen viel Volumen, brauchen aber zwischen den Sätzen trotzdem echte Erholung — nicht mit dem Oberschenkel verwechseln, der bekommt 3:30.' },
    'Unterarme':  { sec: 150, grund: '2:30. Griff- und Unterarmarbeit ermüdet schneller, als es sich anfühlt, und schlägt sonst auf die nächste Zugübung durch.' }
  };

  /* repMin/repMax sind NUR Rückfallwerte, wenn der Plan keine Satzziele vorgibt.
     incPct = Richtwert für den Laststeigerungsschritt (ACSM 2009: 2–10 %),
     raster = kleinster real einstellbarer Gewichtsschritt der Übungsklasse. */
  const KATEGORIEN = {
    'uk-verbund': {
      label: 'Unterkörper-Grundübung',
      repMin: 5, repMax: 8,
      incPct: 0.05, incMin: 2.5, incMax: 10, raster: 2.5,
      incGrund: 'Große Verbundübungen vertragen ca. 5-%-Sprünge — absolute Schritte wachsen mit dem Arbeitsgewicht.'
    },
    'ok-verbund': {
      label: 'Oberkörper-Grundübung',
      repMin: 5, repMax: 8,
      incPct: 0.025, incMin: 2.5, incMax: 5, raster: 2.5,
      incGrund: 'Oberkörper-Verbundübungen: ca. 2,5-%-Schritte — kleinere Muskelmasse als Beine, kleinere Sprünge.'
    },
    'iso-gross': {
      label: 'Isolationsübung (große Muskelgruppe)',
      repMin: 8, repMax: 12,
      incPct: 0.025, incMin: 2.5, incMax: 5, raster: 2.5,
      incGrund: 'Isolationsübungen: kleine Schritte, sonst bricht die Technik ein.'
    },
    'iso-klein': {
      label: 'Isolationsübung (kleine Muskelgruppe)',
      repMin: 8, repMax: 12,
      incPct: 0.02, incMin: 1.25, incMax: 2.5, raster: 1.25,
      incGrund: 'Kleine Muskeln (z. B. Bizeps, Seitschulter): kleinstmöglicher Schritt und primär über Wiederholungen steigern.'
    }
  };

  /* Produktives Wochenvolumen (direkte Arbeitssätze/Woche, Hypertrophie).
     min 0 = optionale Gruppe (keine Zu-wenig-Warnung), nur Obergrenze wird geprüft. */
  const VOLUMEN = {
    'Brust':      { min: 12, max: 18, hinweis: 'Hauptbeweger beim Drücken — braucht kein Extra-Polster.' },
    'Rücken':     { min: 14, max: 20, hinweis: 'Verträgt viel Volumen; verschiedene Zugrichtungen einbauen (vertikal + horizontal).' },
    'Schultern':  { min: 12, max: 20, hinweis: 'Gilt für Seit- und hintere Schulter (erholen schnell); die vordere wird über das Drücken bereits stark abgedeckt.' },
    'Bizeps':     { min: 10, max: 16, hinweis: 'Bekommt zusätzlich indirektes Volumen aus allem Ziehen und Rudern.' },
    'Trizeps':    { min: 8,  max: 12, hinweis: 'Bekommt viel indirekt aus allem Drücken — wenig Direktvolumen nötig.' },
    'Beine':      { min: 14, max: 26, hinweis: 'Kombinierter Bereich aus Quads (~10–18) und Beinbeugern (~8–14), da viele Übungen beides treffen. Stark ermüdend — auf knie- und hüftdominante Übungen aufteilen.' },
    'Gesäß':      { min: 8,  max: 14, hinweis: 'Stark ermüdend; über hüftdominante Übungen (Hip Thrust, RDL) abdecken.' },
    'Bauch/Core': { min: 10, max: 16, hinweis: 'Bekommt isometrisch etwas aus den Grundübungen mit.' },
    'Waden':      { min: 0,  max: 16, hinweis: 'Optional — kein Pflichtziel. Wenn Waden ein Ziel sind: ~8–16 Sätze.' },
    'Unterarme':  { min: 0,  max: 12, hinweis: 'Optional — bekommen viel indirekt aus Zug- und Halteübungen.' }
  };

  function info(ex) { return KATEGORIEN[kategorie(ex)]; }
  /* Unbekannte Muskelgruppe (eigene Übung mit fremdem mg): auf die Untergrenze fallen. */
  function pauseInfo(ex) {
    const p = PAUSEN[ex && ex.mg];
    if (!p) return { sec: PAUSE_MIN, grund: 'Standardpause 2:30 — für diese Muskelgruppe ist kein eigener Wert hinterlegt.' };
    return { sec: Math.max(PAUSE_MIN, p.sec), grund: p.grund };
  }
  function pauseFuer(ex) { return pauseInfo(ex).sec; }
  function repBereich(ex) { const k = info(ex); return [k.repMin, k.repMax]; }

  /* ======================================================================
     2. Rechenkern: e1RM, Schrittgröße, Top-Satz, Ermüdungsabfall
     ====================================================================== */

  function fmtKgLokal(x) {
    if (x == null || isNaN(x)) return '–';
    return String(Math.round(x * 100) / 100).replace('.', ',');
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* Geschätztes 1RM (Epley). Nur zur Verrechnung von Last gegen Wiederholungen —
     die Absolutzahl ist unwichtig, das Verhältnis stimmt im relevanten Bereich. */
  function e1rm(kg, reps) {
    if (!(kg > 0) || !(reps >= 1) || reps > 15) return null;
    return reps === 1 ? kg : kg * (1 + reps / 30);
  }

  /* RIR aus RPE. Nur 0–5 sind belastbar (Halperin et al. 2022): weiter vom
     Versagen entfernt sind Selbsteinschätzungen kaum noch aussagekräftig. */
  function rirAus(rpe) {
    if (rpe == null || isNaN(rpe)) return null;
    return clamp(10 - rpe, 0, 5);
  }

  /* Top-Satz = höchste Last; bei gleicher Last die meisten Wiederholungen.
     Er ist das Leistungsmaß der Einheit — spätere Sätze tragen Ermüdung mit
     sich und sagen über die Tragfähigkeit der Last wenig aus. */
  function topSatz(ws) {
    if (!ws || !ws.length) return null;
    return ws.reduce((a, b) => {
      const ka = a.kg || 0, kb = b.kg || 0;
      if (kb > ka) return b;
      if (kb === ka && (b.reps || 0) > (a.reps || 0)) return b;
      return a;
    });
  }

  /* Wiederholungsabfall über die Sätze, bezogen auf die Sätze mit der TOP-LAST.
     Nur gleich schwere Sätze sind vergleichbar — eine geplante Pyramide mit
     steigender Last ist kein Abfall. */
  function abfallAnalyse(ws) {
    const top = topSatz(ws);
    if (!top) return { anteil: 0, stufe: 'keine', reps: [] };
    const gleiche = ws.filter(s => (s.kg || 0) === (top.kg || 0) && s.reps > 0);
    if (gleiche.length < 2) return { anteil: 0, stufe: 'keine', reps: gleiche.map(s => s.reps) };
    const max = Math.max(...gleiche.map(s => s.reps));
    const min = Math.min(...gleiche.map(s => s.reps));
    const anteil = max > 0 ? (1 - min / max) : 0;
    /* Schwellen analog zu Velocity-Loss: bis ~25 % normal, darüber wird die
       Ermüdung zum eigentlichen limitierenden Faktor. */
    const stufe = anteil > 0.40 ? 'stark' : (anteil > 0.25 ? 'auffaellig' : 'normal');
    return { anteil, stufe, max, min, reps: gleiche.map(s => s.reps) };
  }

  /* Gewichtsschritt. Gibt null zurück, wenn selbst der kleinste verfügbare
     Sprung mehr als 10 % der Last wäre — dann ist Laststeigerung das falsche
     Werkzeug und es wird über Wiederholungen gesteigert (Plotkin et al. 2022). */
  function schritt(ex, kg) {
    const k = info(ex);
    if (!(kg > 0)) return null;
    const raster = k.raster || 2.5;
    const roh = kg * k.incPct;
    let s = Math.round(roh / raster) * raster;
    if (s < raster) s = raster;
    s = Math.min(s, k.incMax);
    if (s > kg * 0.10) return null;
    return s;
  }

  /* Rückwärtsgerechnet: wie viele Wiederholungen bei der aktuellen Last nötig
     sind, damit der Sprung auf (kg + s) bei zielReps noch trägt. Über e1RM —
     so ist die Zahl hergeleitet und nicht geraten. */
  function repsFuerSprung(kg, s, zielReps) {
    const zielE1rm = (kg + s) * (1 + zielReps / 30);
    const noetig = 30 * (zielE1rm / kg - 1);
    return Math.max(zielReps + 1, Math.ceil(noetig));
  }

  /* Öffentlich beibehalten: absoluter Schritt für die Anzeige an anderen Stellen. */
  function inkrement(ex, topKg) {
    const s = schritt(ex, topKg);
    if (s != null) return s;
    return (info(ex).raster || 2.5);
  }

  /* ======================================================================
     3. Empfehlung
     ====================================================================== */

  /* Bewertungsbänder, aus APRE (Mann et al. 2010) abgeleitet.
     d = Wiederholungen des Top-Satzes minus Zielwiederholungen.
     In allen drei APRE-Varianten (3er, 6er, 10er) gilt einheitlich:
       – Ziel exakt getroffen  → HALTEN, nicht erhöhen
       – 2 Wdh. über dem Ziel  → erhöhen
     Nach unten sind die Bänder bei kleinen Zielen enger, weil dort eine
     einzelne Wiederholung anteilig viel mehr Last bedeutet. */
  function baender(ziel) {
    return ziel <= 4
      ? { warn: -1, weg: -2 }
      : { warn: -2, weg: -4 };
  }

  /* ws / wsDavor: Arbeitssätze der letzten bzw. vorletzten Einheit ({kg, reps, rpe}).
   * Rückgabe: { typ, kg, reps, text, grund, hinweis }
   *   typ ∈ 'plus' | 'wdh' | 'halten' | 'deload' | 'neu'
   *   text    = Chip im Training — trägt immer Gewicht UND Wiederholungsziel.
   *   grund   = "Warum?" — die Begründung hinter der Regel.
   *   hinweis = "So setzt du das um" — Paare [Was, Wie]. */
  function empfehlung(ex, ws, wsDavor, repMin, repMax) {
    const k = info(ex);
    repMin = repMin || k.repMin;
    repMax = repMax || k.repMax;
    if (!ws || !ws.length) {
      return {
        typ: 'neu', kg: null, reps: repMax,
        text: 'Arbeitsgewicht für ' + repMax + ' Wdh. finden',
        grund: 'Für diese Übung liegen noch keine Arbeitssätze vor.'
      };
    }

    /* Der Top-Satz wird gegen das SCHWERSTE geplante Satzziel geprüft (repMax).
       Bei einem Plan 10/8/6 ist 10 das Ziel des ersten Satzes — genau der Satz,
       der auch der Top-Satz ist. Die hinteren Sätze werden nicht gegen dieses
       Ziel geprüft; ihr Abfall läuft über die Ermüdungsachse. */
    /* Zwei getrennte Schwellen, sonst wird ein echter Bereich falsch gelesen:
       - ziel  (= repMax): ab hier ist Steigerung überhaupt erst ein Thema
       - boden (= repMin): erst darunter ist das Ziel wirklich VERFEHLT
       Bei einem festen Satzziel (Plan 2 × 5) fallen beide zusammen; bei einem
       Bereich 6–8 sind 7 Wdh. schlicht Zwischenstand, kein Einbruch. */
    const ziel = repMax;
    const boden = Math.min(repMin, repMax);
    const top = topSatz(ws);
    const topKg = top.kg || 0;
    const topReps = top.reps || 0;
    const d = topReps - ziel;
    const dU = topReps - boden;
    const rir = rirAus(top.rpe);
    const b = baender(boden);
    const saetze = ws.length;
    const satzWort = saetze === 1 ? '1 Satz' : saetze + ' Sätze';
    const abfall = abfallAnalyse(ws);
    const gesamtWdh = ws.reduce((n, s) => n + (s.reps || 0), 0);
    const gesamtWdhDavor = (wsDavor && wsDavor.length)
      ? wsDavor.reduce((n, s) => n + (s.reps || 0), 0) : null;

    /* Bestätigung über zwei Einheiten — der Ersatz für fehlende RPE-Angaben.
       Nur gültig, wenn die vorherige Einheit mindestens dieselbe Last hatte. */
    const topDavor = wsDavor && wsDavor.length ? topSatz(wsDavor) : null;
    const bestaetigt = !!(topDavor && (topDavor.kg || 0) >= topKg && (topDavor.reps || 0) >= ziel);

    /* Als Text wiederverwendbarer Ermüdungshinweis. */
    const abfallHinweis = abfall.stufe === 'stark'
      ? ['Satzabfall', 'Deine Wiederholungen fielen von ' + abfall.max + ' auf ' + abfall.min +
         ' (−' + Math.round(abfall.anteil * 100) + ' %). Das ist Ermüdung, nicht zu viel Gewicht: ' +
         'geh im ersten Satz 1–2 Wdh. vor dem Versagen raus und pausiere länger. ' +
         'Dann verteilt sich die Leistung und die Gesamtwiederholungen steigen.']
      : (abfall.stufe === 'auffaellig'
        ? ['Satzabfall', 'Von ' + abfall.max + ' auf ' + abfall.min + ' Wdh. (−' +
           Math.round(abfall.anteil * 100) + ' %). Noch im Rahmen, aber am oberen Ende. ' +
           'Etwas mehr Pause oder etwas mehr Reserve im ersten Satz holt hinten Wiederholungen zurück.']
        : null);

    /* Lastreduktion, skaliert am Ausmaß des Verfehlens. Über den e1RM-Bereich
       entspricht eine Wiederholung grob 3 % der Last (Epley) — sechs fehlende
       Wiederholungen sind also keine 5-%-Angelegenheit. Gedeckelt bei 15 %,
       damit ein einzelner schlechter Tag nicht den halben Fortschritt kostet. */
    function reduziert(fehlende) {
      const raster = k.raster || 2.5;
      const pct = clamp(0.03 * Math.max(1, fehlende), 0.05, 0.15);
      const ziellast = Math.floor((topKg * (1 - pct)) / raster) * raster;
      return Math.max(raster, Math.min(ziellast, topKg - raster));
    }

    /* ---------- Fall A: Last trägt nicht mehr → deutliche Reduktion ---------- */
    if (dU <= b.weg && topKg > (k.raster || 2.5)) {
      const ziellast = reduziert(Math.abs(dU));
      const minusPct = Math.round((1 - ziellast / topKg) * 100);
      return {
        typ: 'deload', kg: ziellast, reps: boden,
        text: 'Zu schwer: ' + fmtKgLokal(ziellast) + ' kg × ' + boden + ' Wdh. (−' + minusPct + ' %)',
        grund: 'Dein Top-Satz lag mit ' + topReps + ' Wdh. deutlich unter der Untergrenze von ' + boden +
               ' (' + Math.abs(dU) + ' Wdh. zu wenig). Das ist kein Ermüdungsproblem einzelner Sätze mehr, ' +
               'sondern die Last selbst trägt nicht. Bei einer Abweichung dieser Größe sieht auch das ' +
               'APRE-Regelwerk (Mann et al. 2010) eine Lastreduktion vor, keine Wiederholungsvorgabe. ' +
               'Die Höhe der Reduktion ist am Ausmaß des Verfehlens bemessen: rund 3 % je fehlender Wiederholung.',
        hinweis: [
          ['Gewicht', fmtKgLokal(ziellast) + ' kg statt ' + fmtKgLokal(topKg) + ' kg (−' + minusPct + ' %).'],
          ['Wiederholungen', boden + ' im ersten Satz. Mit der leichteren Last muss das Ziel wieder stehen.'],
          ['Sätze', 'Unverändert ' + satzWort + '. Das Volumen bleibt, nur die Intensität sinkt.'],
          ['Anstrengung', '2–3 Wdh. in Reserve (RPE 7–8). Für Kraftzuwachs bringt das Ausreizen bis ans Versagen ohnehin nichts (Robinson et al. 2024).'],
          ['Danach', 'Steht das Ziel wieder, geht es von hier normal weiter nach oben.']
        ].concat(abfallHinweis ? [abfallHinweis] : [])
      };
    }

    /* ---------- Fall B: Ziel verfehlt ----------
       Zweimal in Folge unter dem Ziel bei gleicher oder höherer Last ist
       Stagnation, unabhängig davon wie knapp es war — auch ein dauerhaftes
       Verfehlen um eine einzige Wiederholung ist kein Fortschritt. */
    if (dU < 0) {
      const davorVerfehlt = !!(topDavor && (topDavor.kg || 0) >= topKg && (topDavor.reps || 0) < boden);
      if (davorVerfehlt && topKg > (k.raster || 2.5)) {
        const ziellast = reduziert(Math.abs(dU));
        const minusPct = Math.round((1 - ziellast / topKg) * 100);
        return {
          typ: 'deload', kg: ziellast, reps: boden,
          text: 'Deload: ' + fmtKgLokal(ziellast) + ' kg × ' + boden + ' Wdh. (−' + minusPct + ' %)',
          grund: 'Zweite Einheit in Folge unter der Untergrenze (' + boden + ' Wdh.), Top-Satz zuletzt ' + topReps +
                 ' und davor ' + (topDavor.reps || 0) + '. Einmal ist Tagesform, zweimal ist angesammelte Ermüdung. ' +
                 'Ein kleiner Rückschritt in der Last stellt die Satzqualität wieder her; danach geht es meist über ' +
                 'den alten Stand hinaus. Stehenbleiben und weiterbeißen verfestigt dagegen vor allem schlechte Ausführung.',
          hinweis: [
            ['Gewicht', fmtKgLokal(ziellast) + ' kg statt ' + fmtKgLokal(topKg) + ' kg (−' + minusPct + ' %).'],
            ['Wiederholungen', boden + ' im ersten Satz.'],
            ['Anstrengung', '2–3 Wdh. in Reserve (RPE 7–8). Ein Deload, den du bis ans Versagen prügelst, ist keiner.'],
            ['Danach', 'Nächste Einheit wieder ' + fmtKgLokal(topKg) + ' kg anpeilen.']
          ].concat(abfallHinweis ? [abfallHinweis] : [])
        };
      }
      return {
        typ: 'halten', kg: topKg, reps: boden,
        text: fmtKgLokal(topKg) + ' kg × ' + boden + ' Wdh. zurückerobern',
        grund: 'Dein Top-Satz lag mit ' + topReps + ' Wdh. unter der Untergrenze von ' + boden + '. Einmal ist noch kein Muster — ' +
               'Tagesform, Schlaf und Vorermüdung schwanken. Die Last bleibt deshalb stehen, bis das Ziel wieder steht.',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert, noch kein Deload.'],
          ['Wiederholungen', boden + ' im ersten Satz.'],
          ['Anstrengung', '1–2 Wdh. in Reserve (RPE 8–9).'],
          ['Danach', 'Klappt es, läuft die Progression weiter. Bleibst du wieder darunter, schlage ich einen Deload vor.']
        ].concat(abfallHinweis ? [abfallHinweis] : [])
      };
    }

    /* ---------- Fall C: Steigerung fällig? ----------
       Zwei unabhängige Wege, die Reserve nachzuweisen:
         (1) über RPE: d + RIR ≥ 2 — das Ziel wurde mit Luft nach oben getroffen
         (2) ohne RPE: Ziel in zwei aufeinanderfolgenden Einheiten getroffen
       Reines "Ziel exakt getroffen, einmal" reicht in keinem Fall. */
    const dEff = d + (rir != null ? rir : 0);
    const nachweisRpe = rir != null && dEff >= 2;
    const nachweisBestaetigung = rir == null && d >= 0 && bestaetigt;
    const nachweis = nachweisRpe || nachweisBestaetigung;

    /* Ein starker Satzabfall bremst die Steigerung — aber nur EINMAL.
       Beim ersten Auftreten ist die Ermüdungsverteilung das lohnendere Ziel:
       weniger Anlauf im ersten Satz und mehr Pause bringen mehr Gesamt-
       wiederholungen als mehr Gewicht. Ist der Abfall dagegen dauerhaft oder
       war er schon letztes Mal so, ist das schlicht dein Trainingsstil — dann
       darf die Last trotzdem steigen, sonst stünde sie für immer still. */
    const abfallDavor = (wsDavor && wsDavor.length) ? abfallAnalyse(wsDavor) : null;
    /* Schwelle statt strengem Vergleich: ein, zwei Wiederholungen weniger sind
       Tagesform. Erst ein Einbruch von über 10 % ist ein Signal. */
    const volumenBricht = gesamtWdhDavor > 0 && gesamtWdh < gesamtWdhDavor * 0.90;
    const abfallNeuUndStark = abfall.stufe === 'stark' &&
      (!abfallDavor || abfallDavor.stufe !== 'stark');
    const gebremst = nachweis && (abfallNeuUndStark || volumenBricht);

    if (gebremst) {
      return {
        typ: 'halten', kg: topKg, reps: topReps,
        text: fmtKgLokal(topKg) + ' kg halten — erst die Sätze zusammenhalten',
        grund: 'Dein Top-Satz hätte mehr Gewicht verdient (' + topReps + ' Wdh.' +
               (rir != null ? ' bei RPE ' + fmtKgLokal(top.rpe) : '') + '), aber ' +
               (abfallNeuUndStark
                 ? 'deine Wiederholungen fielen über die Sätze von ' + abfall.max + ' auf ' + abfall.min +
                   ' ab (−' + Math.round(abfall.anteil * 100) + ' %). '
                 : 'deine Gesamtwiederholungen sind gegenüber der letzten Einheit von ' + gesamtWdhDavor +
                   ' auf ' + gesamtWdh + ' gefallen. ') +
               'Mehr Gewicht würde diesen Einbruch nur vergrößern. In der Geschwindigkeitssteuerung gilt ein ' +
               'Leistungsverlust über ~25 % als Grenze für kraftorientiertes Training — der Wiederholungsabfall ' +
               'ist dasselbe Signal. Hol dir zuerst die hinteren Sätze zurück; das bringt in dieser Einheit mehr ' +
               'Gesamtwiederholungen als der Gewichtssprung.',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert, nur für diese eine Einheit.'],
          ['Erster Satz', 'Nicht ausreizen: bei ' + Math.max(1, topReps - 2) + '–' + Math.max(1, topReps - 1) +
            ' Wdh. abbrechen, 1–2 Wdh. in Reserve lassen.'],
          ['Pause', 'Länger als bisher — die Pause ist hier der Hebel, nicht die Last.'],
          ['Ziel', 'Alle Sätze innerhalb von ~25 % zueinander, also z. B. ' +
            Math.max(1, topReps - 2) + '/' + Math.max(1, topReps - 2) + '/' + Math.max(1, topReps - 3) + '.'],
          ['Danach', 'Halten die Sätze zusammen, kommt der Gewichtssprung in der nächsten Einheit.']
        ]
      };
    }

    if (nachweis) {
      const s = schritt(ex, topKg);
      if (s == null) {
        /* Kein tragfähiger Gewichtssprung verfügbar → über Wiederholungen steigern. */
        const raster = k.raster || 2.5;
        const noetig = repsFuerSprung(topKg, raster, repMin);
        const naechstes = Math.min(topReps + 1, noetig);
        return {
          typ: 'wdh', kg: topKg, reps: naechstes,
          text: fmtKgLokal(topKg) + ' kg × ' + naechstes + ' Wdh. anpeilen',
          grund: 'Du hast Reserve, aber der kleinste verfügbare Gewichtssprung wäre ' + fmtKgLokal(raster) + ' kg auf ' +
                 fmtKgLokal(topKg) + ' kg — also rund ' + Math.round(raster / topKg * 100) + ' %. Das ist kein Steigerungsschritt, ' +
                 'das ist ein Sprung in eine andere Übung. Steigerung über Wiederholungen führt zu vergleichbaren Kraft- und ' +
                 'Massezuwächsen wie Steigerung über Last (Plotkin et al. 2022) — also wird hier über Wiederholungen gesteigert.',
          hinweis: [
            ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
            ['Wiederholungen', naechstes + ' im Top-Satz (zuletzt ' + topReps + ').'],
            ['Anstrengung', '1–2 Wdh. in Reserve (RPE 8–9).'],
            ['Sprung kommt bei', 'ca. ' + noetig + ' Wdh. — dann trägt ' + fmtKgLokal(topKg + raster) + ' kg × ' + repMin + ' Wdh. dieselbe Leistung.']
          ].concat(abfallHinweis ? [abfallHinweis] : [])
        };
      }
      /* Abgestufte Schrittgröße nach APRE: viel Überschuss → doppelter Schritt. */
      const gross = dEff >= 5;
      const inc = gross ? Math.min(s * 2, k.incMax * 2) : s;
      const neuKg = topKg + inc;
      const pctReal = Math.round(inc / topKg * 1000) / 10;
      /* Realistisches Wiederholungsziel an der neuen Last — über e1RM, nicht geraten. */
      const e = e1rm(topKg, topReps);
      const erwartet = e ? Math.floor(30 * (e / neuKg - 1)) : repMin;
      const neuReps = clamp(erwartet, repMin, ziel);
      return {
        typ: 'plus', kg: neuKg, reps: neuReps,
        text: '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(neuKg) + ' kg × ' + neuReps + ' Wdh.',
        grund: (nachweisRpe
                 ? 'Top-Satz ' + topReps + ' Wdh. bei RPE ' + fmtKgLokal(top.rpe) + ' — das sind rechnerisch ' + rir +
                   ' Wdh. in Reserve. Zusammen mit dem Überschuss von ' + (d >= 0 ? '+' : '') + d +
                   ' gegenüber dem Ziel liegt genug Luft nach oben für den nächsten Schritt.'
                 : 'Du hast das Ziel von ' + ziel + ' Wdh. in zwei Einheiten in Folge getroffen. Erst diese Bestätigung ' +
                   'macht den Sprung tragfähig — ein einzelner guter Tag ist kein Kraftzuwachs.') +
               ' Schritt: +' + fmtKgLokal(inc) + ' kg (~' + fmtKgLokal(pctReal) + ' %), Richtwert der Kategorie „' + k.label +
               '": ~' + fmtKgLokal(k.incPct * 100) + ' % (ACSM 2009: 2–10 %).' +
               (gross ? ' Doppelter Schritt, weil die Reserve deutlich über dem Ziel lag (abgestufte Anpassung nach Mann et al. 2010).' : ''),
        hinweis: [
          ['Gewicht', '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(neuKg) + ' kg.'],
          ['Wiederholungen', neuReps + ' im Top-Satz. Weniger als zuletzt — das ist Absicht: schwerere Last, kürzerer Satz.'],
          ['Anstrengung', '1–3 Wdh. in Reserve (RPE 7–9). Der erste Satz am neuen Gewicht muss nicht wehtun: Kraftzuwachs hängt kaum davon ab, wie nah du ans Versagen gehst (Robinson et al. 2024).'],
          ['Danach', 'Wieder auf ' + ziel + ' Wdh. hocharbeiten, dann der nächste Sprung.']
        ].concat(abfallHinweis ? [abfallHinweis] : [])
      };
    }

    /* ---------- Fall D: Ziel erreicht, aber Reserve noch nicht nachgewiesen ----------
       Zwei verschiedene Situationen, die auch verschieden klingen müssen:
       (a) ohne RPE, Ziel zum ersten Mal getroffen → dieselbe Leistung bestätigen
       (b) RPE zeigt zu wenig Reserve → Wiederholungen ausbauen */
    /* (c) Innerhalb des Bereichs, aber noch nicht am oberen Ende: klassische
       doppelte Progression — Wiederholungen ausbauen, Last steht. */
    if (d < 0) {
      const naechsteWdh = Math.min(topReps + 1, ziel);
      return {
        typ: 'wdh', kg: topKg, reps: naechsteWdh,
        text: fmtKgLokal(topKg) + ' kg × ' + naechsteWdh + ' Wdh. anpeilen',
        grund: 'Dein Top-Satz liegt mit ' + topReps + ' Wdh. im Zielbereich ' + boden + '–' + ziel +
               ', aber noch nicht am oberen Ende. Doppelte Progression: bei gleicher Last erst die Wiederholungen ' +
               'ausbauen, und erst wenn ' + ziel + ' Wdh. stehen, wird die Last zum Thema. ' +
               'Ob du dabei über Last oder über Wiederholungen steigerst, macht für Kraft und Muskelmasse ' +
               'keinen belegten Unterschied (Plotkin et al. 2022) — der Fortschritt selbst zählt.',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
          ['Wiederholungen', naechsteWdh + ' im Top-Satz (zuletzt ' + topReps + ').'],
          ['Anstrengung', '1–2 Wdh. in Reserve (RPE 8–9) — nicht bis ans Versagen.'],
          ['Sprung kommt bei', ziel + ' Wdh. im Top-Satz, bestätigt oder mit RPE ≤ 8.']
        ].concat(abfallHinweis ? [abfallHinweis] : [])
      };
    }

    if (rir == null && !bestaetigt) {
      const soll = Math.max(ziel, topReps);
      return {
        typ: 'wdh', kg: topKg, reps: soll,
        text: fmtKgLokal(topKg) + ' kg × ' + soll + ' Wdh. bestätigen',
        grund: 'Du hast das Ziel von ' + ziel + ' Wdh. getroffen — einmal. Bevor die Last steigt, will ich dieselbe ' +
               'Leistung ein zweites Mal sehen. Ein einzelner guter Tag ist Tagesform, kein Kraftzuwachs, und ein zu ' +
               'früher Sprung kostet vor allem die Ausführung: für den Kraftzuwachs ist es nahezu egal, wie nah du ' +
               'ans Versagen gehst (Robinson et al. 2024) — für die Technik ist es das nicht. ' +
               'Trag die Anstrengung (RPE) mit ein, dann erkenne ich vorhandene Reserve sofort und muss nicht auf ' +
               'die zweite Einheit warten.',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
          ['Wiederholungen', soll + ' im Top-Satz, also genau wie letztes Mal. Mehr ist nicht nötig.'],
          ['Anstrengung', '1–2 Wdh. in Reserve (RPE 8–9) — nicht bis ans Versagen.'],
          ['Sprung kommt bei', 'dieser Einheit, wenn ' + soll + ' Wdh. wieder stehen. Oder sofort, wenn du ' +
            soll + ' Wdh. bei RPE ≤ 8 einträgst.']
        ].concat(abfallHinweis ? [abfallHinweis] : [])
      };
    }
    const naechstes = Math.min(topReps + 1, ziel + 2);
    return {
      typ: 'wdh', kg: topKg, reps: naechstes,
      text: fmtKgLokal(topKg) + ' kg × ' + naechstes + ' Wdh. anpeilen',
      grund: 'Du hast das Ziel von ' + ziel + ' Wdh. getroffen, aber bei RPE ' + fmtKgLokal(top.rpe) + ' — also nur ' +
             rir + ' Wdh. Reserve. Das Ziel exakt zu treffen ist für sich kein Grund für mehr Gewicht: in allen drei ' +
             'APRE-Varianten (Mann et al. 2010) liegt „Ziel getroffen" im Halten-Band, erhöht wird erst ab 2 Wdh. ' +
             'darüber. Mehr Last würde jetzt zuerst die Ausführung kosten — und für den Kraftzuwachs bringt das ' +
             'Arbeiten am Anschlag ohnehin nichts (Robinson et al. 2024).',
      hinweis: [
        ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
        ['Wiederholungen', naechstes + ' im Top-Satz (zuletzt ' + topReps + ').'],
        ['Anstrengung', '1–2 Wdh. in Reserve (RPE 8–9) — nicht bis ans Versagen.'],
        ['Sprung kommt bei', (ziel + 2) + ' Wdh. im Top-Satz, oder bei ' + ziel + ' Wdh. mit RPE ≤ 8.']
      ].concat(abfallHinweis ? [abfallHinweis] : [])
    };
  }


  /* ======================================================================
     4. Reha-Modus — Rückkehr in die progressive Überlastung nach Verletzung
     ======================================================================

     WOZU
     ----
     Der normale Coach optimiert auf Kraft und Muskelmasse. Er kennt genau ein
     Bremssignal: nachlassende Leistung. Nach einer Verletzung kommt das
     entscheidende Signal aber VOR dem Leistungseinbruch und aus einer anderen
     Richtung — aus dem Gewebe. Wer nur auf Wiederholungen schaut, steigert so
     lange weiter, bis es wieder wehtut. Genau dieser Fehler wiederholt sich in
     der Praxis am häufigsten: Die Muskulatur ist nach ein paar Wochen wieder
     belastbar, die Sehne aber noch lange nicht — Sehnengewebe passt sich über
     Monate an, nicht über Wochen.

     Der Reha-Modus legt deshalb eine ZWEITE Achse über die normale Bewertung:
     eine Ampel aus Schmerz während/nach der Übung und dem Zustand am Morgen
     danach. Die Ampel kann eine Steigerung immer nur verhindern, nie erzwingen.
     Beide Achsen müssen grün sein.

     WISSENSCHAFTLICHE GRUNDLAGE
     ---------------------------
     - Pain-Monitoring-Modell: Training darf mit Schmerz stattfinden, solange er
       während der Belastung ≤ 5/10 bleibt, danach nicht deutlich ansteigt und
       am nächsten Morgen wieder auf dem Ausgangsniveau ist. Vollständige
       Schonung ist der Belastung unter Schmerzkontrolle UNTERLEGEN.
       → Silbernagel et al. 2007, Am J Sports Med 35(6):897–906 (RCT).
       Kodiert als: SCHMERZ_MAX = 5, MORGEN_MAX = +1.

     - Progressionskriterium zwischen den Stufen: Schmerz ≤ 3/10 im
       einbeinigen Squat plus mindestens eine Woche in der Stufe.
       → Breda et al. 2021, Br J Sports Med 55(9):501–509 (RCT, PTLE-Programm).
       Kodiert als: SCHMERZ_OK = 3, STUFE_MIN_TAGE = 7.

     - Belastungsform ist zweitrangig, Progression ist entscheidend: Die
       aktuellste Netzwerk-Metaanalyse findet KEINE klare Überlegenheit
       irgendeiner Übungsform gegenüber Heavy Slow Resistance — die früher
       propagierte Sonderstellung des exzentrischen Trainings hält nicht.
       → Liu, Li & Yang 2026, BMC Sports Sci Med Rehabil (Netzwerk-Metaanalyse).
       Konsequenz: Dieser Modus schreibt KEINE exotische Übungsform vor. Er
       macht die vorhandene Übung langsam und schwer und steuert die Steigerung.

     - Heavy Slow Resistance: 3–4 Sätze, Tempo 3 s konzentrisch + 3 s exzentrisch,
       Progression über 12 Wochen von 15RM über 12/10/8RM auf 6RM.
       → Kongsgaard et al. 2009, Scand J Med Sci Sports 19(6):790–802.
       Kodiert als: TEMPO_SEK = 6 und die Wiederholungsbereiche der Stufen.

     - Sehnenanpassung braucht hohe Spannung über Zeit, nicht viele Sätze:
       ~180 s hochgespannte Belastungszeit pro Woche reichten für +33 %
       Sehnensteifigkeit; 300 s brachten nicht mehr, und die Verteilung über
       2,5 oder 5 Einheiten pro Woche war egal.
       → Tsai et al. 2024, Sci Rep 14:6875 (RCT, 16 Wochen).
       Kodiert als: TUT_MIN = 180, TUT_MAX = 300 Sekunden pro Woche.

     - Dehnungsfenster der Sehne: 4,5–6,5 % Dehnung über ~3 s je Wiederholung
       ist der wirksamste Reiz; praktisch heißt das ~70–90 % 1RM bei langsamem
       Tempo, nicht leichtes Ausdauerpumpen.
       → Arampatzis et al. 2020, Front Physiol 11:723.

     - Isometrie senkt Sehnenschmerz kurzfristig deutlich (ca. −6,8 vs. −2,6
       Punkte gegenüber isotonisch) und wirkt etwa 45 Minuten, ohne Kraftverlust.
       Deshalb ist sie das Werkzeug der Beruhigungsstufe und der Türöffner an
       schlechten Tagen — kein Ersatz für schwere Belastung auf Dauer.
       → Rio et al. 2015, Br J Sports Med 49(19):1277–83.

     - Die „10-%-Regel" für Belastungssteigerung ist nicht belegt; sie hat in
       der einzigen kontrollierten Prüfung keine Verletzungen verhindert.
       Belegt ist nur das grobe Muster: sehr große Sprünge (> ~30 % pro Woche)
       erhöhen das Risiko, und bei NIEDRIGER chronischer Belastung — also
       genau nach einer Pause — sind kleinere Schritte angebracht.
       → Buist et al. 2008, Am J Sports Med 36(1):33–39;
         Gabbett 2016 / Impellizzeri et al. 2020 (Kritik am ACWR).
       Konsequenz: Dieses Modul rechnet KEINE Quotienten aus (der ACWR ist
       mathematisch gekoppelt und nicht als Vorhersage brauchbar). Es begrenzt
       schlicht den Einzelschritt auf 5 % und lässt ihn nur bei grüner Ampel zu —
       bei zwei Einheiten pro Woche sind das höchstens ~10 % Wochenzuwachs.

     - Nur eine Stellschraube pro Schritt (Last ODER Wiederholungen ODER Sätze):
       Steigerung über Last und über Wiederholungen führt ohnehin zu
       vergleichbaren Zuwächsen (Plotkin et al. 2022) — es gibt also keinen
       Grund, beides gleichzeitig zu erhöhen und damit die Ursache eines
       Rückschlags nicht mehr zuordnen zu können.
  */

  /* Ampel-Schwellen. Alle vier Zahlen sind oben belegt und stehen bewusst hier
     zusammen — sie sind die eigentliche Steuerung des Reha-Modus. */
  const REHA_SCHMERZ_OK  = 3;   // Breda 2021: bis hier darf gesteigert werden
  const REHA_SCHMERZ_MAX = 5;   // Silbernagel 2007: darüber war die Belastung zu hoch
  const REHA_MORGEN_MAX  = 1;   // +2 Punkte am Morgen danach = Überlastung
  const REHA_STUFE_MIN_TAGE = 7;
  const REHA_SCHRITT_PCT = 0.05;
  const REHA_TEMPO_SEK   = 6;   // 3 s hoch, 3 s runter
  const REHA_TUT_MIN     = 180;
  const REHA_TUT_MAX     = 300;

  /* Vier Stufen, aus dem PTLE-Programm (Breda et al. 2021) auf das übertragen,
     was eine Trainings-App tatsächlich steuern kann: Last, Wiederholungen,
     Sätze, Tempo. Stufe 3 des Originals (Plyometrie) ist keine Hantelarbeit und
     steht deshalb als Hinweis in Stufe 4, nicht als eigene Vorgabe. */
  const REHA_STUFEN = {
    1: {
      nr: 1, name: 'Beruhigen',
      kurz: 'Isometrie im Vordergrund, Last zweitrangig',
      repMin: 12, repMax: 15, saetzeMax: 4,
      ziel: 'Den Schmerz unter Kontrolle bringen, ohne das Gewebe stillzulegen.',
      isometrie: '5 × 45 s halten bei ~70 % der Maximalkraft, im schmerzarmen Winkel. Täglich möglich.',
      erklaerung: 'Isometrisches Halten senkt Sehnenschmerz für etwa 45 Minuten deutlich, ohne Kraft zu kosten (Rio et al. 2015). Diese Stufe ist die Ausnahme, kein Dauerzustand — Stillhalten allein baut keine Sehne auf.'
    },
    2: {
      nr: 2, name: 'Aufbau',
      kurz: 'Schwer & langsam, oberer Wiederholungsbereich',
      repMin: 10, repMax: 15, saetzeMax: 4,
      ziel: 'Die Belastung wieder aufbauen, bei einer Last, die das Gewebe sicher trägt.',
      isometrie: 'An schlechten Tagen 5 × 45 s halten, bevor du an die Hantel gehst.',
      erklaerung: 'Einstieg der Heavy-Slow-Resistance-Progression bei ~15RM (Kongsgaard et al. 2009): schwer genug für einen Sehnenreiz, leicht genug, dass die Ausführung sauber bleibt.'
    },
    3: {
      nr: 3, name: 'Kraft',
      kurz: 'Schwer & langsam, schwerer Wiederholungsbereich',
      repMin: 6, repMax: 10, saetzeMax: 4,
      ziel: 'In den Lastbereich zurück, in dem die Sehne wirklich fester wird.',
      isometrie: 'Optional als Aufwärmen: 2 × 45 s halten.',
      erklaerung: 'Endpunkt der HSR-Progression (~6RM). Erst hier liegt die Last im Dehnungsfenster von 4,5–6,5 %, das die Sehne tatsächlich umbaut (Arampatzis et al. 2020).'
    },
    4: {
      nr: 4, name: 'Rückkehr',
      kurz: 'Normale Ziele, Ampel läuft weiter mit',
      repMin: null, repMax: null, saetzeMax: null,
      ziel: 'Zurück im normalen Training — die Überwachung bleibt an.',
      isometrie: 'Nicht mehr nötig. Bei einem schlechten Tag trotzdem das beste Mittel.',
      erklaerung: 'Wiederholungsziele kommen wieder aus Plan und Coach. Der Reha-Modus begrenzt nur noch die Schrittgröße und schlägt Alarm, wenn die Ampel kippt. Explosive Belastung (Sprünge, Sprints) gehört in diese Stufe und wird außerhalb der App aufgebaut.'
    }
  };
  function rehaStufe(n) { return REHA_STUFEN[clamp(Math.round(n || 2), 1, 4)]; }

  /* Ampel. morgenDelta = Schmerz am Morgen danach minus persönlicher Ausgangswert.
     Fehlt ein Wert, wird er nicht als „gut" gewertet, sondern als unbekannt —
     eine fehlende Angabe darf nie zu einer Steigerung führen. */
  function rehaAmpel(schmerz, morgenDelta) {
    const hatS = schmerz != null && !isNaN(schmerz);
    const hatM = morgenDelta != null && !isNaN(morgenDelta);
    if (!hatS && !hatM) {
      return { farbe: 'unbekannt', text: 'Keine Rückmeldung eingetragen',
               grund: 'Ohne Schmerzwert steigert der Reha-Modus nicht. Trag nach der Übung einen Wert von 0–10 ein und am Morgen danach den Zustand — das ist die einzige Information, die eine Überlastung erkennt, bevor sie im Training sichtbar wird.' };
    }
    if ((hatS && schmerz > REHA_SCHMERZ_MAX) || (hatM && morgenDelta >= 2)) {
      return { farbe: 'rot',
               text: hatS && schmerz > REHA_SCHMERZ_MAX
                 ? 'Schmerz ' + schmerz + '/10 während der Belastung — über der Grenze von ' + REHA_SCHMERZ_MAX
                 : 'Am Morgen danach ' + (morgenDelta > 0 ? '+' + morgenDelta : morgenDelta) + ' Punkte über deinem Ausgangswert',
               grund: 'Das Pain-Monitoring-Modell zieht die Grenze bei 5/10 während der Belastung und verlangt, dass du am nächsten Morgen wieder auf dem Ausgangsniveau bist (Silbernagel et al. 2007). Beides ist hier gerissen — die letzte Belastung war zu hoch für das Gewebe.' };
    }
    if ((hatS && schmerz > REHA_SCHMERZ_OK) || (hatM && morgenDelta >= 1)) {
      return { farbe: 'gelb',
               text: hatS && schmerz > REHA_SCHMERZ_OK
                 ? 'Schmerz ' + schmerz + '/10 — im tolerierten Bereich, aber über der Steigerungsschwelle von ' + REHA_SCHMERZ_OK
                 : 'Am Morgen danach 1 Punkt über deinem Ausgangswert',
               grund: 'Unter 5/10 ist erlaubt und schadet nicht — gesteigert wird aber erst ab ≤ 3/10 (Breda et al. 2021). Diese Belastung darfst du wiederholen, sie ist nur noch nicht die Basis für den nächsten Schritt.' };
    }
    return { farbe: 'gruen', text: 'Belastung gut vertragen',
             grund: 'Schmerz während der Belastung ≤ ' + REHA_SCHMERZ_OK + '/10 und am Morgen danach kein Anstieg — das ist das Progressionskriterium aus dem PTLE-Programm (Breda et al. 2021).' };
  }

  /* Hochgespannte Belastungszeit einer Einheit: Arbeitssätze × Wdh. × 6 s.
     Nur Sätze im HSR-Lastbereich zählen — leichte Sätze erzeugen die nötige
     Sehnendehnung nicht (Arampatzis et al. 2020). Als Näherung: mindestens
     70 % der schwersten Last der Einheit. */
  function rehaTut(ws) {
    if (!ws || !ws.length) return 0;
    const top = topSatz(ws);
    const schwelle = (top && top.kg > 0) ? top.kg * 0.7 : 0;
    return ws.reduce((sum, s) => {
      if (!(s.reps > 0)) return sum;
      if (schwelle > 0 && (s.kg || 0) < schwelle) return sum;
      return sum + s.reps * REHA_TEMPO_SEK;
    }, 0);
  }

  /* Wochenbilanz der Sehnenbelastung. Kein Quotient, keine Vorhersage — nur der
     Abgleich mit dem Fenster aus Tsai et al. 2024 (180–300 s/Woche). */
  function rehaTutWoche(sekunden) {
    if (sekunden < REHA_TUT_MIN) {
      return { stand: 'wenig', text: Math.round(sekunden) + ' s von ' + REHA_TUT_MIN + ' s',
               grund: 'Unter der Schwelle, ab der sich Sehnengewebe messbar anpasst. In der Studie reichten 180 s pro Woche für +33 % Sehnensteifigkeit (Tsai et al. 2024) — verteilt auf zwei bis fünf Einheiten, die Aufteilung war egal.' };
    }
    if (sekunden > REHA_TUT_MAX) {
      return { stand: 'viel', text: Math.round(sekunden) + ' s über ' + REHA_TUT_MAX + ' s',
               grund: 'Mehr als 300 s pro Woche brachten in der Studie keinen zusätzlichen Effekt (Tsai et al. 2024). Zusätzliches Volumen ist hier kein Fortschritt, sondern nur zusätzliche Belastung für ein Gewebe, das sich gerade erholt.' };
    }
    return { stand: 'gut', text: Math.round(sekunden) + ' s im Fenster ' + REHA_TUT_MIN + '–' + REHA_TUT_MAX + ' s',
             grund: 'Genau das Fenster, in dem sich die Sehnensteifigkeit in der Studie am besten entwickelt hat (Tsai et al. 2024).' };
  }

  /* Darf die nächste Stufe kommen? Zwei Bedingungen aus Breda et al. 2021:
     mindestens eine Woche in der Stufe und Schmerz stabil ≤ 3/10. */
  function rehaStufenCheck(stufe, tageInStufe, gruenSerie) {
    const s = rehaStufe(stufe);
    if (s.nr >= 4) return { kann: false, grund: 'Du bist in der letzten Stufe — von hier geht es nicht weiter, sondern raus aus dem Reha-Modus.' };
    const offenTage = Math.max(0, REHA_STUFE_MIN_TAGE - (tageInStufe || 0));
    const offenSerie = Math.max(0, 3 - (gruenSerie || 0));
    if (offenTage > 0 || offenSerie > 0) {
      const fehlt = [];
      if (offenTage > 0) fehlt.push('noch ' + offenTage + ' ' + (offenTage === 1 ? 'Tag' : 'Tage') + ' in dieser Stufe');
      if (offenSerie > 0) fehlt.push('noch ' + offenSerie + ' ' + (offenSerie === 1 ? 'Einheit' : 'Einheiten') + ' mit grüner Ampel');
      return { kann: false, grund: 'Für Stufe ' + (s.nr + 1) + ' fehlt: ' + fehlt.join(' und ') + '. Das Kriterium stammt aus dem PTLE-Programm: mindestens eine Woche pro Stufe und Schmerz stabil ≤ 3/10 (Breda et al. 2021).' };
    }
    const n = rehaStufe(s.nr + 1);
    return { kann: true, naechste: n.nr,
             grund: 'Du bist seit ' + tageInStufe + ' Tagen in Stufe ' + s.nr + ' und hattest ' + gruenSerie +
                    ' Einheiten in Folge mit grüner Ampel. Damit sind beide Kriterien für Stufe ' + n.nr + ' („' + n.name + '") erfüllt (Breda et al. 2021).' };
  }

  /* Hauptfunktion. Baut auf empfehlung() auf und dämpft deren Ergebnis:
       - Wiederholungsziele kommen aus der Stufe (außer Stufe 4)
       - der Gewichtsschritt wird auf 5 % gedeckelt, Doppelschritte entfallen
       - eine Steigerung braucht ZUSÄTZLICH eine grüne Ampel
     reha = { stufe, schmerz, morgenDelta, tageInStufe, gruenSerie, tutWoche } */
  function rehaEmpfehlung(ex, ws, wsDavor, repMin, repMax, reha) {
    reha = reha || {};
    const st = rehaStufe(reha.stufe);
    const ampel = rehaAmpel(reha.schmerz, reha.morgenDelta);
    const k = info(ex);
    /* Stufenziele haben Vorrang vor Plan und Kategorie — außer in Stufe 4. */
    const zMin = st.repMin != null ? st.repMin : (repMin || k.repMin);
    const zMax = st.repMax != null ? st.repMax : (repMax || k.repMax);

    const tempoHinweis = ['Tempo', '3 s hoch, 3 s runter — das ist der eigentliche Wirkstoff. Die Sehne reagiert auf hohe Spannung über Zeit, nicht auf Schwung (Kongsgaard et al. 2009).'];
    const stufeHinweis = ['Stufe ' + st.nr, st.name + ' — ' + st.kurz + '. ' + st.ziel];

    function schmuecken(r, extra) {
      r.reha = { stufe: st.nr, stufeName: st.name, ampel: ampel.farbe, ampelText: ampel.text };
      r.grund = 'Reha-Modus, Stufe ' + st.nr + ' („' + st.name + '"). ' + (r.grund || '');
      r.hinweis = [stufeHinweis].concat(extra || []).concat(r.hinweis || []).concat([tempoHinweis]);
      return r;
    }

    const top = ws && ws.length ? topSatz(ws) : null;
    const topKg = top ? (top.kg || 0) : 0;

    /* ---- Stufe 1: die Hantel ist hier nicht das Hauptwerkzeug ---- */
    if (st.nr === 1) {
      return schmuecken({
        typ: 'halten', kg: topKg || null, reps: zMax,
        text: topKg ? fmtKgLokal(topKg) + ' kg × ' + zMin + '–' + zMax + ' Wdh. halten' : 'Leichte Last für ' + zMin + '–' + zMax + ' Wdh.',
        grund: 'In der Beruhigungsstufe wird die Last nicht gesteigert. ' + st.erklaerung
      }, [
        ['Isometrie zuerst', st.isometrie],
        ['Gewicht', 'Bleibt, wo es ist. Erst wenn der Schmerz stabil ≤ ' + REHA_SCHMERZ_OK + '/10 liegt, geht es in Stufe 2.'],
        ['Wenn es besser wird', 'Nach einer Woche mit ruhigem Knie schlägt dir der Modus Stufe 2 vor.']
      ]);
    }

    /* ---- Rote Ampel: zurück, aber nicht ins Nichts ---- */
    if (ampel.farbe === 'rot') {
      const raster = k.raster || 2.5;
      const ziellast = topKg > raster
        ? Math.max(raster, Math.floor((topKg * 0.8) / raster) * raster)
        : topKg;
      return schmuecken({
        typ: 'deload', kg: ziellast || null, reps: zMax,
        text: ziellast && ziellast < topKg
          ? 'Zurück auf ' + fmtKgLokal(ziellast) + ' kg × ' + zMax + ' Wdh. (−20 %)'
          : 'Last zurücknehmen, ' + zMax + ' Wdh.',
        grund: ampel.text + '. ' + ampel.grund +
               ' Deshalb geht die Last um 20 % zurück und die Wiederholungen an das obere Ende — nicht in die Pause. ' +
               'Vollständige Schonung war in der Vergleichsstudie der Belastung unter Schmerzkontrolle unterlegen (Silbernagel et al. 2007): das Gewebe verliert dabei Tragfähigkeit, die es hinterher erst wieder aufbauen muss.'
      }, [
        ['Sofort hilft', st.isometrie + ' Das senkt den Schmerz für etwa 45 Minuten spürbar (Rio et al. 2015).'],
        ['Gewicht', ziellast && ziellast < topKg ? fmtKgLokal(ziellast) + ' kg statt ' + fmtKgLokal(topKg) + ' kg.' : 'Reduzieren, bis die Ausführung schmerzarm ist.'],
        ['Zeitrahmen', 'Ein Reizzustand beruhigt sich bei passender Last meist in 5–10 Tagen. Bleibt es länger, ist es kein Trainingsproblem mehr — dann gehört das abgeklärt.'],
        ['Zurück nach oben', 'Erst wenn zwei Einheiten in Folge grün sind, wird wieder gesteigert. Nicht früher, auch wenn es sich gut anfühlt.']
      ]);
    }

    /* ---- Keine Rückmeldung: der Modus arbeitet nicht blind ---- */
    if (ampel.farbe === 'unbekannt') {
      return schmuecken({
        typ: 'halten', kg: topKg || null, reps: zMax,
        text: topKg ? fmtKgLokal(topKg) + ' kg halten — Rückmeldung fehlt' : zMin + '–' + zMax + ' Wdh., Rückmeldung eintragen',
        grund: ampel.grund
      }, [
        ['Was fehlt', 'Der Schmerzwert nach der Übung (0–10) und der Morgen-Check am Tag danach.'],
        ['Warum das zählt', 'Sehnengewebe reagiert verzögert: Die Belastung von heute zeigt sich oft erst am nächsten Morgen. Deshalb ist der Morgen-Check das schärfere der beiden Signale.']
      ]);
    }

    /* ---- Normale Bewertung durchlaufen lassen, danach dämpfen ---- */
    const basis = empfehlung(ex, ws, wsDavor, zMin, zMax);

    /* Gelbe Ampel: alles darf bleiben, nichts darf hoch. */
    if (ampel.farbe === 'gelb') {
      if (basis.typ === 'deload') return schmuecken(basis, [['Ampel', ampel.text + '. ' + ampel.grund]]);
      /* Wiederholt wird die zuletzt GESCHAFFTE Leistung, nicht das rechnerische
         Ziel des Basis-Vorschlags: Ein Halten, das weniger verlangt als die
         letzte Einheit, wäre ein verkappter Deload. */
      const halteReps = top && top.reps > 0 ? Math.min(zMax, top.reps) : (basis.reps || zMax);
      return schmuecken({
        typ: 'halten', kg: topKg || basis.kg, reps: halteReps,
        text: (topKg ? fmtKgLokal(topKg) + ' kg' : 'Last') + ' × ' + halteReps + ' Wdh. wiederholen',
        grund: ampel.text + '. ' + ampel.grund +
               (basis.typ === 'plus' ? ' Deine Leistung hätte für mehr Gewicht gereicht — das Gewebe hat aber das letzte Wort. ' : ' ') +
               'Dieselbe Belastung noch einmal ist hier der Fortschritt: Sie ist die Wiederholung, die aus einer Belastung eine Gewohnheit macht.'
      }, [
        ['Ampel', ampel.text],
        ['Gewicht', 'Unverändert — und auch die Wiederholungen bleiben bei ' + halteReps + '.'],
        ['Nächster Schritt', 'Ab Schmerz ≤ ' + REHA_SCHMERZ_OK + '/10 ohne Anstieg am Morgen danach geht es wieder nach oben.']
      ]);
    }

    /* Grüne Ampel: Steigerung erlaubt — aber mit gedeckeltem Schritt. */
    if (basis.typ === 'plus') {
      const raster = k.raster || 2.5;
      /* Abrunden, nicht kaufmännisch runden: 5 % sind hier eine Obergrenze,
         keine Zielgröße. Aufrunden würde den Deckel regelmäßig reißen
         (80 kg × 5 % = 4 kg → aufgerundet 5 kg = 6,3 %). */
      const roh = Math.max(raster, Math.floor((topKg * REHA_SCHRITT_PCT) / raster) * raster);
      const inc = Math.min(roh, Math.max(raster, basis.kg - topKg));
      const neuKg = topKg + inc;
      const pct = topKg > 0 ? Math.round(inc / topKg * 1000) / 10 : 0;
      return schmuecken({
        typ: 'plus', kg: neuKg, reps: basis.reps,
        text: '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(neuKg) + ' kg × ' + basis.reps + ' Wdh.',
        grund: 'Beide Achsen sind grün: ' + ampel.grund + ' Und leistungsseitig: ' +
               (basis.grund || '') +
               ' Der Schritt ist im Reha-Modus auf ' + Math.round(REHA_SCHRITT_PCT * 100) + ' % gedeckelt (hier +' + fmtKgLokal(pct) + ' %). ' +
               'Eine feste „10-%-Regel" gibt es entgegen ihrem Ruf nicht — sie hat in der einzigen kontrollierten Prüfung keine Verletzungen verhindert (Buist et al. 2008). ' +
               'Belegt ist nur, dass große Sprünge riskant sind und kleine Schritte angebracht sind, wenn die Grundbelastung niedrig ist — also genau nach einer Pause.'
      }, [
        ['Nur eine Stellschraube', 'Diese Einheit steigt das Gewicht — Sätze und Wiederholungen bleiben, wie sie waren. Zwei Änderungen auf einmal machen einen Rückschlag unauswertbar.'],
        ['Ampel', ampel.text]
      ]);
    }

    /* Alles andere (halten, wdh, deload, neu) bleibt inhaltlich, wie der Coach
       es sieht — mit Stufenrahmen und Tempo obendrauf. */
    return schmuecken(basis, [['Ampel', ampel.text]]);
  }

  const REHA_QUELLEN = 'Reha-Modus nach: Silbernagel et al. 2007 (Pain-Monitoring-Modell — Training mit Schmerz ≤ 5/10 schlägt Schonung), ' +
    'Breda et al. 2021 (Progressive Tendon-Loading Exercises — Stufenkriterium Schmerz ≤ 3/10 plus eine Woche je Stufe), ' +
    'Kongsgaard et al. 2009 (Heavy Slow Resistance — Tempo 3 s/3 s, 15RM → 6RM über 12 Wochen), ' +
    'Tsai et al. 2024 (180–300 s hochgespannte Belastungszeit pro Woche; Verteilung nachrangig), ' +
    'Arampatzis et al. 2020 (Dehnungsfenster 4,5–6,5 % über ~3 s), ' +
    'Rio et al. 2015 (Isometrie senkt Sehnenschmerz ~45 min ohne Kraftverlust), ' +
    'Liu, Li & Yang 2026 (Netzwerk-Metaanalyse — keine Übungsform der Heavy Slow Resistance überlegen), ' +
    'Buist et al. 2008 und Impellizzeri et al. 2020 (die 10-%-Regel und der ACWR halten der Prüfung nicht stand).';

  const QUELLEN = 'Regelwerk nach: Robinson et al. 2024 (Nähe zum Versagen — Kraft weitgehend unabhängig vom RIR, Hypertrophie nicht), ' +
    'Mann et al. 2010 (APRE — abgestufte Lastanpassung, „Ziel getroffen" = halten), ' +
    'Plotkin et al. 2022 (Steigerung über Last und über Wiederholungen gleichwertig), ' +
    'Greig et al. 2022 (Autoregulation vs. feste Prozentvorgabe), ' +
    'Schoenfeld et al. 2017/2021 (Lastbereiche für Kraft und Hypertrophie), ' +
    'Schoenfeld et al. 2016 & Grgic et al. 2017 (Satzpausen), ACSM 2009 (Steigerungsschritt 2–10 %), ' +
    'Halperin et al. 2022 (Verlässlichkeit von RIR-Schätzungen).';

  return {
    kategorie, info, pauseFuer, pauseInfo, PAUSEN, PAUSE_MIN, repBereich,
    inkrement, empfehlung, QUELLEN, VOLUMEN,
    /* Reha-Modus */
    REHA_STUFEN, REHA_QUELLEN, REHA_SCHMERZ_OK, REHA_SCHMERZ_MAX, REHA_MORGEN_MAX,
    REHA_TUT_MIN, REHA_TUT_MAX, REHA_TEMPO_SEK, REHA_STUFE_MIN_TAGE,
    rehaStufe, rehaAmpel, rehaEmpfehlung, rehaStufenCheck, rehaTut, rehaTutWoche,
    /* für Tests und ggf. spätere Auswertungen */
    e1rm, rirAus, topSatz, abfallAnalyse, schritt, repsFuerSprung
  };
})();
