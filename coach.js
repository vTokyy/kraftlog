/* ===== Kraftlog — Coach =====
 * Evidenzbasiertes Regelwerk für Pausen, Steigerungsschritte und Wiederholungsbereiche,
 * differenziert nach Übungstyp und Muskelgruppe (statt Pauschalwerten).
 *
 * Wissenschaftliche Grundlage (als Regeln kodiert, App bleibt offline):
 * - Satzpausen: Längere Pausen (≥ 2–3 min) verbessern Kraft- und Hypertrophie-Ergebnisse.
 *   → Schoenfeld et al. 2016 (J Strength Cond Res), Grgic et al. 2017 (Review).
 *   Die konkreten Werte hängen an der MUSKELGRUPPE, nicht an der Übungskategorie:
 *   entscheidend ist, wie viel Masse und Systemermüdung im Spiel ist, nicht ob die
 *   Übung ein- oder mehrgelenkig ist. Ein Beinstrecker braucht mehr Luft als ein
 *   Curl, obwohl beides Isolation ist. Untergrenze: 2:30 — die frühere
 *   90-s-Empfehlung für kleine Muskeln (de Salles & Simão 2009) ließ in der Praxis
 *   zu wenig Leistung für den nächsten Satz übrig.
 * - Laststeigerung: 2–10 % Steigerung, sobald das Wiederholungsziel übertroffen wird;
 *   prozentual bedeutet das: große Unterkörper-Verbundübungen vertragen größere Sprünge
 *   als kleine Isolationsübungen. → ACSM Position Stand 2009.
 * - Doppelte Progression: erst Wiederholungen im Zielbereich steigern, dann Gewicht
 *   erhöhen und Wiederholungen zurücksetzen. Etablierte Praxis-Heuristik.
 * - Autoregulation über RPE/RIR: nahe Muskelversagen (RPE > 9) keine zusätzliche Last;
 *   Ermüdungsmanagement über Deload (~10 %) nach wiederholter Unterschreitung des Ziels.
 *   → Helms et al. 2016 (RIR-basierte RPE-Skala), Zourdos et al. 2016.
 */
window.KraftlogCoach = (function () {
  'use strict';

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

  const KATEGORIEN = {
    'uk-verbund': {
      label: 'Unterkörper-Grundübung',
      repMin: 6, repMax: 10,
      incPct: 0.05, incMin: 2.5, incMax: 10,
      incGrund: 'Große Verbundübungen vertragen ca. 5-%-Sprünge — absolute Schritte wachsen mit dem Arbeitsgewicht.'
    },
    'ok-verbund': {
      label: 'Oberkörper-Grundübung',
      repMin: 6, repMax: 10,
      incPct: 0.025, incMin: 2.5, incMax: 5,
      incGrund: 'Oberkörper-Verbundübungen: ca. 2,5-%-Schritte (meist 2,5 kg) — kleinere Muskelmasse als Beine, kleinere Sprünge.'
    },
    'iso-gross': {
      label: 'Isolationsübung (große Muskelgruppe)',
      repMin: 8, repMax: 12,
      incPct: 0.025, incMin: 2.5, incMax: 5,
      incGrund: 'Isolationsübungen: kleine Schritte (2,5–5 kg), sonst bricht die Technik ein.'
    },
    'iso-klein': {
      label: 'Isolationsübung (kleine Muskelgruppe)',
      repMin: 10, repMax: 15,
      incPct: 0.02, incMin: 2.5, incMax: 2.5,
      incGrund: 'Kleine Muskeln (z. B. Bizeps, Seitschulter): immer kleinstmöglicher Schritt (2,5 kg) und primär über Wiederholungen steigern.'
    }
  };

  function info(ex) { return KATEGORIEN[kategorie(ex)]; }
  /* Unbekannte Muskelgruppe (eigene Übung mit fremdem mg): auf die Untergrenze fallen,
     nie darunter. */
  function pauseInfo(ex) {
    const p = PAUSEN[ex && ex.mg];
    if (!p) return { sec: PAUSE_MIN, grund: 'Standardpause 2:30 — für diese Muskelgruppe ist kein eigener Wert hinterlegt.' };
    return { sec: Math.max(PAUSE_MIN, p.sec), grund: p.grund };
  }
  function pauseFuer(ex) { return pauseInfo(ex).sec; }
  function repBereich(ex) { const k = info(ex); return [k.repMin, k.repMax]; }

  /* Steigerungsschritt in kg: prozentual, auf 2,5-kg-Raster gerundet, mit Kategorie-Grenzen */
  function inkrement(ex, topKg) {
    const k = info(ex);
    const roh = (topKg || 0) * k.incPct;
    const gerastert = Math.round(roh / 2.5) * 2.5;
    return Math.max(k.incMin, Math.min(k.incMax, gerastert));
  }

  /* Kern-Empfehlung nach doppelter Progression + RPE-Autoregulation.
   * ws / wsDavor: Arbeitssätze der letzten bzw. vorletzten Einheit ({kg, reps, rpe}).
   * Rückgabe: { typ, kg, reps, text, grund, hinweis }
   *   text    = Chip im Training — trägt immer Gewicht UND Wiederholungsziel,
   *             sonst bleibt offen, was man mit der Zahl anfangen soll.
   *   grund   = "Warum?" — die Begründung hinter der Regel.
   *   hinweis = "So setzt du das um" — Paare [Was, Wie]. Gerade der Deload ist ohne
   *             Wiederholungs- und Anstrengungsvorgabe wertlos: −10 % bis ans Versagen
   *             geprügelt ist kein Deload, sondern nur ein leichterer harter Tag. */
  function empfehlung(ex, ws, wsDavor, repMin, repMax) {
    const k = info(ex);
    repMin = repMin || k.repMin;
    repMax = repMax || k.repMax;
    const saetze = ws.length;
    const topKg = Math.max(...ws.map(s => s.kg || 0));
    const rpes = ws.map(s => s.rpe).filter(x => x != null);
    const maxRpe = rpes.length ? Math.max(...rpes) : null;
    const alleOben = ws.every(s => s.reps >= repMax);
    const unterMin = ws.some(s => s.reps < repMin);
    const satzWort = saetze === 1 ? '1 Satz' : saetze + ' Sätze';

    if (alleOben && maxRpe != null && maxRpe > 9) {
      const inc = inkrement(ex, topKg);
      return {
        typ: 'halten', kg: topKg, reps: repMax,
        text: fmtKgLokal(topKg) + ' kg × ' + repMax + ' Wdh. halten (RPE ' + fmtKgLokal(maxRpe) + ')',
        grund: 'Du hast das Wiederholungsziel erreicht, warst dabei aber sehr nah am Muskelversagen (RPE ' + fmtKgLokal(maxRpe) + ', also über 9). Mehr Gewicht würde die Technik jetzt zuerst kosten, nicht die Kraft aufbauen. Autoregulation heißt hier: dieselbe Leistung noch einmal, aber mit Reserve — erst wenn die Wiederholungen bei RPE ≤ 9 stehen, ist der nächste Sprung tragfähig (Helms et al. 2016).',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
          ['Wiederholungen', repMax + ' pro Satz. Genau das hast du letztes Mal schon geschafft.'],
          ['Anstrengung', 'Diesmal mit 1–2 Wiederholungen in Reserve (RPE ≤ 9) statt am Anschlag.'],
          ['Danach', 'Stehen die ' + repMax + ' Wdh. mit Reserve, kommt der Sprung auf ' + fmtKgLokal(topKg + inc) + ' kg.']
        ]
      };
    }
    if (alleOben) {
      const inc = inkrement(ex, topKg);
      const pctReal = topKg > 0 ? Math.round(inc / topKg * 1000) / 10 : null;
      return {
        typ: 'plus', kg: topKg + inc, reps: repMin,
        text: '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(topKg + inc) + ' kg × ' + repMin + ' Wdh.',
        grund: 'Alle Arbeitssätze haben das obere Wiederholungsziel (' + repMax + ') erreicht' + (maxRpe != null ? ' bei RPE ≤ 9' : '') + ' — Zeit für mehr Gewicht. Schritt: +' + fmtKgLokal(inc) + ' kg' + (pctReal != null ? ' (~' + fmtKgLokal(pctReal) + ' %)' : '') + '. Richtwert (Kategorie „' + k.label + '"): ~' + fmtKgLokal(k.incPct * 100) + ' % je Steigerung (ACSM: 2–10 %), in der Praxis begrenzt durch den kleinsten Hantel-Schritt von 2,5 kg.',
        hinweis: [
          ['Gewicht', '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(topKg + inc) + ' kg.'],
          ['Wiederholungen', repMin + ' pro Satz — zurück ans untere Ende. Das ist Absicht, nicht Rückschritt: schwereres Gewicht, weniger Wiederholungen.'],
          ['Anstrengung', '1–3 Wiederholungen in Reserve (RPE 7–9). Der erste Satz am neuen Gewicht muss nicht wehtun.'],
          ['Danach', 'Von ' + repMin + ' Wdh. wieder hocharbeiten, bis alle Sätze ' + repMax + ' schaffen — dann der nächste Sprung. Das ist die doppelte Progression.']
        ]
      };
    }
    if (unterMin) {
      const davorUnterMin = wsDavor && wsDavor.length && wsDavor.some(s => s.reps < repMin);
      if (davorUnterMin) {
        /* mindestens einen echten 2,5-kg-Schritt runter — sonst wäre der Deload wirkungslos */
        const ziel = Math.max(0, Math.min(topKg - 2.5, Math.round(topKg * 0.9 / 2.5) * 2.5));
        if (topKg > 2.5) {
          const minusPct = Math.round((1 - ziel / topKg) * 100);
          return {
            typ: 'deload', kg: ziel, reps: repMax,
            text: 'Deload: ' + fmtKgLokal(ziel) + ' kg × ' + repMax + ' Wdh. (−' + fmtKgLokal(minusPct) + ' %)',
            grund: 'Zweite Einheit in Folge unter dem Mindestziel (' + repMin + ' Wdh.). Das ist typischerweise angesammelte Ermüdung, nicht fehlende Kraft — wer jetzt am selben Gewicht weiterbeißt, verfestigt vor allem schlechte Satzqualität. Ein Deload nimmt für eine Einheit die Last raus, damit du wieder sauber in den Zielbereich kommst; danach geht es meist über den alten Stand hinaus (Ermüdungsmanagement, Helms et al. 2016).',
            hinweis: [
              ['Gewicht', fmtKgLokal(ziel) + ' kg statt ' + fmtKgLokal(topKg) + ' kg (−' + fmtKgLokal(minusPct) + ' %).'],
              ['Wiederholungen', repMax + ' pro Satz — das obere Ende deines Bereichs. Mit dem leichteren Gewicht muss das gehen; schaffst du sie nicht, war die Ermüdung größer als gedacht.'],
              ['Sätze', 'Unverändert ' + satzWort + '. Das Volumen bleibt, nur die Intensität sinkt.'],
              ['Anstrengung', '2–3 Wiederholungen in Reserve (RPE 7–8). Ein Deload, den du bis ans Versagen prügelst, ist keiner.'],
              ['Danach', 'Nächste Einheit wieder ' + fmtKgLokal(topKg) + ' kg anpeilen — meist läuft sie dann durch.']
            ]
          };
        }
        return {
          typ: 'deload', kg: topKg, reps: repMin,
          text: 'Erholung einplanen — Ziel zweimal verfehlt',
          grund: 'Zweite Einheit in Folge unter dem Mindestziel (' + repMin + ' Wdh.). Ein Gewichts-Deload ist hier kaum möglich, weil die Last schon minimal ist — die Ermüdung muss also woanders raus.',
          hinweis: [
            ['Gewicht', 'Bleibt bei ' + fmtKgLokal(topKg) + ' kg; weniger ergibt hier keinen sinnvollen Schritt.'],
            ['Wiederholungen', 'Mindestens ' + repMin + ' pro Satz — erst sauber zurück in den Bereich.'],
            ['Anstrengung', '2–3 Wiederholungen in Reserve (RPE 7–8).'],
            ['Stattdessen', 'Nimm die Ermüdung anders raus: ' + (saetze > 1 ? 'einen Satz weniger, ' : '') + 'einen Trainingstag Pause, mehr Schlaf. Oder senke das Wiederholungsziel vorübergehend.']
          ]
        };
      }
      return {
        typ: 'halten', kg: topKg, reps: repMin,
        text: fmtKgLokal(topKg) + ' kg × ' + repMin + ' Wdh. zurückerobern',
        grund: 'Mindestens ein Satz lag unter dem Mindestziel (' + repMin + ' Wdh.). Einmal ist noch kein Muster — das kann ein schlechter Tag gewesen sein. Erst die Wiederholungen zurückerobern, dann weiter steigern.',
        hinweis: [
          ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert, noch kein Deload.'],
          ['Wiederholungen', 'Mindestens ' + repMin + ' pro Satz, also zurück in den Zielbereich ' + repMin + '–' + repMax + '.'],
          ['Anstrengung', '1–2 Wiederholungen in Reserve (RPE 8–9).'],
          ['Danach', 'Klappt es, läuft die normale Progression weiter. Bleibst du wieder darunter, schlage ich einen Deload vor.']
        ]
      };
    }
    /* im Bereich → Wiederholungen steigern */
    const minReps = Math.min(...ws.map(s => s.reps));
    const zielReps = Math.min(minReps + 1, repMax);
    const inc = inkrement(ex, topKg);
    return {
      typ: 'wdh', kg: topKg, reps: zielReps,
      text: fmtKgLokal(topKg) + ' kg × ' + zielReps + ' Wdh. anpeilen',
      grund: 'Du bist im Zielbereich (' + repMin + '–' + repMax + ' Wdh.). Doppelte Progression: bei gleichem Gewicht erst die Wiederholungen steigern; sobald alle Sätze ' + repMax + ' erreichen, kommt der nächste Gewichtssprung.',
      hinweis: [
        ['Gewicht', fmtKgLokal(topKg) + ' kg — unverändert.'],
        ['Wiederholungen', zielReps + ' pro Satz (schwächster Satz letztes Mal: ' + minReps + ').'],
        ['Anstrengung', '1–2 Wiederholungen in Reserve (RPE 8–9).'],
        ['Danach', 'Stehen überall ' + repMax + ' Wdh., geht es auf ' + fmtKgLokal(topKg + inc) + ' kg hoch.']
      ]
    };
  }

  /* lokale kg-Formatierung (Komma), um keine app.js-Abhängigkeit zu haben */
  function fmtKgLokal(x) {
    if (x == null || isNaN(x)) return '–';
    return String(Math.round(x * 100) / 100).replace('.', ',');
  }

  const QUELLEN = 'Regelwerk nach: Schoenfeld et al. 2016 & Grgic et al. 2017 (Satzpausen — längere schlagen kürzere), ACSM Position Stand 2009 (Laststeigerung 2–10 %), Helms/Zourdos et al. 2016 (RPE/RIR-Autoregulation), Prinzip der doppelten Progression.';

  /* Produktives Wochenvolumen (direkte Arbeitssätze/Woche, Hypertrophie).
   * min 0 = optionale Gruppe (keine Zu-wenig-Warnung), nur Obergrenze wird geprüft. */
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

  return { kategorie, info, pauseFuer, pauseInfo, PAUSEN, PAUSE_MIN, repBereich, inkrement, empfehlung, QUELLEN, VOLUMEN };
})();
