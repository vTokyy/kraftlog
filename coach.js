/* ===== Kraftlog — Coach =====
 * Evidenzbasiertes Regelwerk für Pausen, Steigerungsschritte und Wiederholungsbereiche,
 * differenziert nach Übungstyp und Muskelgruppe (statt Pauschalwerten).
 *
 * Wissenschaftliche Grundlage (als Regeln kodiert, App bleibt offline):
 * - Satzpausen: Längere Pausen (≥ 2–3 min) verbessern Kraft- und Hypertrophie-Ergebnisse
 *   bei Mehrgelenksübungen; kleine Muskelgruppen erholen sich schneller (60–90 s ausreichend).
 *   → Schoenfeld et al. 2016 (J Strength Cond Res), Grgic et al. 2017 (Review),
 *     de Salles & Simão 2009 (Sports Med).
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

  const KATEGORIEN = {
    'uk-verbund': {
      label: 'Unterkörper-Grundübung',
      pause: 210, repMin: 6, repMax: 10,
      incPct: 0.05, incMin: 2.5, incMax: 10,
      pauseGrund: 'Große Muskelmasse und hohe Herz-Kreislauf-Belastung: 3–5 min Pause, damit Kraftleistung und Satzqualität erhalten bleiben.',
      incGrund: 'Große Verbundübungen vertragen ca. 5-%-Sprünge — absolute Schritte wachsen mit dem Arbeitsgewicht.'
    },
    'ok-verbund': {
      label: 'Oberkörper-Grundübung',
      pause: 180, repMin: 6, repMax: 10,
      incPct: 0.025, incMin: 2.5, incMax: 5,
      pauseGrund: 'Mehrgelenksübung: ≥ 2–3 min Pause führt zu mehr Volumen und besseren Zuwächsen als kurze Pausen.',
      incGrund: 'Oberkörper-Verbundübungen: ca. 2,5-%-Schritte (meist 2,5 kg) — kleinere Muskelmasse als Beine, kleinere Sprünge.'
    },
    'iso-gross': {
      label: 'Isolationsübung (große Muskelgruppe)',
      pause: 120, repMin: 8, repMax: 12,
      incPct: 0.025, incMin: 2.5, incMax: 5,
      pauseGrund: 'Eingelenkig, aber große Muskelgruppe: ca. 2 min Pause als guter Kompromiss aus Erholung und Trainingsdichte.',
      incGrund: 'Isolationsübungen: kleine Schritte (2,5–5 kg), sonst bricht die Technik ein.'
    },
    'iso-klein': {
      label: 'Isolationsübung (kleine Muskelgruppe)',
      pause: 90, repMin: 10, repMax: 15,
      incPct: 0.02, incMin: 2.5, incMax: 2.5,
      pauseGrund: 'Kleine Muskelgruppe erholt sich schnell: 60–90 s Pause reichen, mehr bringt hier keinen Zusatznutzen.',
      incGrund: 'Kleine Muskeln (z. B. Bizeps, Seitschulter): immer kleinstmöglicher Schritt (2,5 kg) und primär über Wiederholungen steigern.'
    }
  };

  function info(ex) { return KATEGORIEN[kategorie(ex)]; }
  function pauseFuer(ex) { return info(ex).pause; }
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
   * Rückgabe: { typ, kg, reps, text, grund } — text = Chip, grund = "Warum?"-Erklärung. */
  function empfehlung(ex, ws, wsDavor, repMin, repMax) {
    const k = info(ex);
    repMin = repMin || k.repMin;
    repMax = repMax || k.repMax;
    const topKg = Math.max(...ws.map(s => s.kg || 0));
    const rpes = ws.map(s => s.rpe).filter(x => x != null);
    const maxRpe = rpes.length ? Math.max(...rpes) : null;
    const alleOben = ws.every(s => s.reps >= repMax);
    const unterMin = ws.some(s => s.reps < repMin);

    if (alleOben && maxRpe != null && maxRpe > 9) {
      return {
        typ: 'halten', kg: topKg,
        text: fmtKgLokal(topKg) + ' kg halten (RPE ' + fmtKgLokal(maxRpe) + ')',
        grund: 'Du hast zwar das Wiederholungsziel erreicht, warst aber sehr nah am Muskelversagen (RPE > 9). Autoregulation: erst bei gleicher Last Reserve aufbauen (RPE ≤ 9), dann steigern — das hält die Technik stabil und die Ermüdung steuerbar (Helms et al. 2016).'
      };
    }
    if (alleOben) {
      const inc = inkrement(ex, topKg);
      const pctReal = topKg > 0 ? Math.round(inc / topKg * 1000) / 10 : null;
      return {
        typ: 'plus', kg: topKg + inc, reps: repMin,
        text: '+' + fmtKgLokal(inc) + ' kg → ' + fmtKgLokal(topKg + inc) + ' kg × ' + repMin + ' Wdh.',
        grund: 'Alle Arbeitssätze haben das obere Wiederholungsziel (' + repMax + ') erreicht' + (maxRpe != null ? ' bei RPE ≤ 9' : '') + ' — Zeit für mehr Gewicht. Schritt: +' + fmtKgLokal(inc) + ' kg' + (pctReal != null ? ' (~' + fmtKgLokal(pctReal) + ' %)' : '') + '. Richtwert (Kategorie „' + k.label + '"): ~' + fmtKgLokal(k.incPct * 100) + ' % je Steigerung (ACSM: 2–10 %), in der Praxis begrenzt durch den kleinsten Hantel-Schritt von 2,5 kg. Die Wiederholungen starten wieder am unteren Ende (' + repMin + ') — doppelte Progression.'
      };
    }
    if (unterMin) {
      const davorUnterMin = wsDavor && wsDavor.length && wsDavor.some(s => s.reps < repMin);
      if (davorUnterMin) {
        /* mindestens einen echten 2,5-kg-Schritt runter — sonst wäre der Deload wirkungslos */
        const ziel = Math.max(0, Math.min(topKg - 2.5, Math.round(topKg * 0.9 / 2.5) * 2.5));
        if (topKg > 2.5) {
          return {
            typ: 'halten', kg: ziel,
            text: 'Deload: ' + fmtKgLokal(ziel) + ' kg (−' + fmtKgLokal(Math.round((1 - ziel / topKg) * 100)) + ' %)',
            grund: 'Zweite Einheit in Folge unter dem Mindestziel (' + repMin + ' Wdh.) — das deutet auf angesammelte Ermüdung hin. Ein kurzer Rücksetzer auf ' + fmtKgLokal(ziel) + ' kg schafft Erholung und neuen Anlauf; danach geht es meist über den alten Stand hinaus.'
          };
        }
        return {
          typ: 'halten', kg: topKg,
          text: 'Erholung einplanen — Ziel zweimal verfehlt',
          grund: 'Zweite Einheit in Folge unter dem Mindestziel (' + repMin + ' Wdh.). Ein Gewichts-Deload ist hier kaum möglich (Last bereits minimal) — plane einen leichteren Tag oder mehr Erholung ein und senke ggf. vorübergehend das Wiederholungsziel.'
        };
      }
      return {
        typ: 'halten', kg: topKg,
        text: 'Gewicht halten: ' + fmtKgLokal(topKg) + ' kg',
        grund: 'Mindestens ein Satz lag unter dem Mindestziel (' + repMin + ' Wdh.). Erst die Wiederholungen zurückerobern, dann weiter steigern. Bleibt es nächstes Mal wieder darunter, schlage ich einen Deload vor.'
      };
    }
    /* im Bereich → Wiederholungen steigern */
    const minReps = Math.min(...ws.map(s => s.reps));
    return {
      typ: 'wdh', kg: topKg,
      text: fmtKgLokal(topKg) + ' kg halten, ' + Math.min(minReps + 1, repMax) + '+ Wdh. anpeilen',
      grund: 'Du bist im Zielbereich (' + repMin + '–' + repMax + ' Wdh.). Doppelte Progression: bei gleichem Gewicht Wiederholungen steigern; sobald alle Sätze ' + repMax + ' erreichen, kommt der nächste Gewichtssprung.'
    };
  }

  /* lokale kg-Formatierung (Komma), um keine app.js-Abhängigkeit zu haben */
  function fmtKgLokal(x) {
    if (x == null || isNaN(x)) return '–';
    return String(Math.round(x * 100) / 100).replace('.', ',');
  }

  const QUELLEN = 'Regelwerk nach: Schoenfeld et al. 2016 & Grgic et al. 2017 (Satzpausen), ACSM Position Stand 2009 (Laststeigerung 2–10 %), Helms/Zourdos et al. 2016 (RPE/RIR-Autoregulation), Prinzip der doppelten Progression.';

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

  return { kategorie, info, pauseFuer, repBereich, inkrement, empfehlung, QUELLEN, VOLUMEN };
})();
