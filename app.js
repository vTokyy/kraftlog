/* ===== Kraftlog — App-Engine =====
 * State-Schema (localStorage 'kraftlog-state-v1'):
 *   settings:        { theme, sound, vibration, restCompound, restIsolation, incUpper, incLower, lastExport }
 *   customExercises: [ { id:'cu-…', name, mg, eq, compound } ]
 *   exerciseSettings:{ exId: { restSec, notiz } }
 *   templates:       [ { id, name, createdAt, exercises:[{exId, restSec, sets:[{reps, kg?, warmup?, restSec?}]}] } ]  // reps/kg/restSec = Ziel je Satz
 *   workouts:        [ { id, templateId, name, startedAt, finishedAt, notiz,
 *                        exercises:[{exId, repMin, repMax, sets:[{kg, reps, rpe, warmup, doneAt, restSec, restZiel}]}] } ]
 *                        restSec = GEMESSENE Pause, restZiel = eingestellte Vorgabe
 *   activeWorkout:   wie workout, Sätze zusätzlich mit done:true/false; rest = laufende Pause
 *   bodyweight:      [ { date:'YYYY-MM-DD', kg } ]
 *   reha:            { <Muskelgruppe>: { aktiv, seit, stufe, stufeSeit, basis } }
 *   rehaLog:         [ { ts, mg, typ:'uebung'|'morgen', wert:0–10, exId, workoutId } ]
 * PRs werden nie gespeichert, immer aus der Historie berechnet.
 */
(function () {
'use strict';

/* ---------- Kurzhelfer & Konstanten ---------- */
const $ = sel => document.querySelector(sel);
const LS_KEY = 'kraftlog-state-v1';
const BACKUP_KEY = 'kraftlog-backup';
const SCHEMA_VERSION = 1;
/* App-/Cache-Version aus dem eigenen Skript-Tag lesen (build.py bumpt ?v=N).
   Im Single-File-Artifact (kein ?v) → '—'. */
const APP_VERSION = (function () {
  try {
    const s = document.querySelector('script[src*="app.js"]');
    const m = s && s.src.match(/[?&]v=(\d+)/);
    return m ? m[1] : '—';
  } catch (e) { return '—'; }
})();
const EXES = window.KRAFTLOG_EXERCISES || [];
const MGS = window.KRAFTLOG_MUSKELGRUPPEN || [];
const EQS = window.KRAFTLOG_EQUIPMENT || [];
const Charts = window.KraftlogCharts;
const Signal = window.KraftlogTimer;
const Icons = window.KraftlogIcons;
const Coach = window.KraftlogCoach;
const RPE_WERTE = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
const TAG_MS = 86400000;
const WP_TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const WP_LABEL = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };
function heuteWpTag() { return WP_TAGE[(new Date().getDay() + 6) % 7]; }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- State ---------- */
let storageOk = true;
try { localStorage.setItem('kraftlog-test', '1'); localStorage.removeItem('kraftlog-test'); } catch (e) { storageOk = false; }
let readOnly = false; // Daten stammen aus einer neueren App-Version → nicht überschreiben

function defaults() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      theme: 'auto', sound: true, vibration: true,
      benachrichtigung: true,
      hintergrundSignal: false,
      coach: true,
      goku: true,
      restCompound: 180, restIsolation: 150,   // Klassik-Modus; 2:30 ist auch hier die Untergrenze
      incUpper: 2.5, incLower: 5, lastExport: null,
      groesseCm: null,
      letztePauseFrei: 150,  // zuletzt gewählte freie Pausendauer (Schnellwahl im Training)
      strava: { workerUrl: '', clientId: '', refreshToken: null, accessToken: null, accessBis: 0, athlet: '', autoPost: true },
      workerKey: '',        // Zugangsschlüssel des Cloudflare-Workers (X-Kraftlog-Key)
      push: { aktiv: false, sub: null },
      pushInhalt: false     // Opt-in: Übungsname in der Push-Meldung (verlässt dafür das Gerät)
    },
    customExercises: [],
    exerciseSettings: {},
    templates: [],
    wochenplan: {},
    workouts: [],
    runs: [],
    activeWorkout: null,
    bodyweight: [],
    reha: {},        // Reha-Modus je Muskelgruppe — aus, bis er eingeschaltet wird
    rehaLog: [],     // Schmerz- und Morgen-Rückmeldungen
    rehaInit: false  // Erstbelegung (Beine) schon gelaufen?
  };
}
/* Typen absichern: kaputte/fremde Importe dürfen die App nie unbenutzbar machen */
function sanitizeState(s) {
  const d = defaults();
  if (!Array.isArray(s.customExercises)) s.customExercises = d.customExercises;
  if (!Array.isArray(s.templates)) s.templates = d.templates;
  if (!Array.isArray(s.workouts)) s.workouts = d.workouts;
  if (!Array.isArray(s.bodyweight)) s.bodyweight = d.bodyweight;
  if (!Array.isArray(s.runs)) s.runs = d.runs;
  if (!s.exerciseSettings || typeof s.exerciseSettings !== 'object' || Array.isArray(s.exerciseSettings)) s.exerciseSettings = d.exerciseSettings;
  if (!s.wochenplan || typeof s.wochenplan !== 'object' || Array.isArray(s.wochenplan)) s.wochenplan = d.wochenplan;
  if (!s.settings || typeof s.settings !== 'object') s.settings = d.settings;
  /* Reha-Zustand absichern: fremde/alte Importe kennen ihn nicht, und ein
     kaputter Eintrag darf die Empfehlung nicht in undefinierte Stufen schicken. */
  if (!s.reha || typeof s.reha !== 'object' || Array.isArray(s.reha)) s.reha = {};
  Object.keys(s.reha).forEach(mg => {
    const r = s.reha[mg];
    if (!r || typeof r !== 'object') { delete s.reha[mg]; return; }
    r.aktiv = r.aktiv === true;
    r.stufe = Math.min(4, Math.max(1, Math.round(+r.stufe || 2)));
    r.basis = Math.min(10, Math.max(0, Math.round(+r.basis || 0)));
    if (typeof r.seit !== 'number') r.seit = Date.now();
    if (typeof r.stufeSeit !== 'number') r.stufeSeit = r.seit;
  });
  if (!Array.isArray(s.rehaLog)) s.rehaLog = [];
  s.rehaLog = s.rehaLog.filter(e => e && typeof e.ts === 'number' && e.mg &&
    (e.typ === 'uebung' || e.typ === 'morgen') && typeof e.wert === 'number');
  s.settings.strava = (s.settings.strava && typeof s.settings.strava === 'object')
    ? Object.assign({}, d.settings.strava, s.settings.strava)
    : d.settings.strava;
  s.settings.push = (s.settings.push && typeof s.settings.push === 'object')
    ? Object.assign({}, d.settings.push, s.settings.push)
    : d.settings.push;
  if (typeof s.settings.workerKey !== 'string') s.settings.workerKey = '';
  s.settings.pushInhalt = s.settings.pushInhalt === true;
  s.settings.goku = s.settings.goku !== false;
  s.workouts = s.workouts.filter(w => w && Array.isArray(w.exercises) && typeof w.startedAt === 'number');
  s.templates = s.templates.filter(t => t && Array.isArray(t.exercises));
  s.templates.forEach(t => {
    t.exercises = t.exercises.filter(it => it && it.exId).map(normalizeTplExercise);
  });
  s.customExercises = s.customExercises.filter(e => e && e.id && e.name);
  /* Reparatur bekannter Import-Fehlklassifikationen: Übungen, die der frühere
     Namens-Rater mangels Stichwort auf den Fallback 'Rücken' gesetzt hat.
     Greift nur, solange die Übung noch auf 'Rücken' steht (manuelle Änderungen bleiben unangetastet). */
  const REPARATUR = [
    [/schienbein|tibialis/i, 'Waden'],
    [/beinheben/i, 'Bauch/Core'],
    [/brücke|bridge/i, 'Gesäß'],
    [/dehnen|foam roll|mobilit|kreisen|pendeln|einbeinstand|eineinstand|hüftbeuger|wallsit|wall sit/i, 'Beine']
  ];
  s.customExercises.forEach(c => {
    if (c.mg !== 'Rücken') return;
    for (const r of REPARATUR) {
      if (r[0].test(c.name)) { c.mg = r[1]; break; }
    }
  });
  s.bodyweight = s.bodyweight.filter(b => b && b.date && b.kg > 0);
  s.runs = s.runs.filter(r => r && r.distanzKm > 0 && r.dauerSec > 0 && typeof r.startedAt === 'number');
  const aw = s.activeWorkout;
  if (!aw || typeof aw !== 'object' || !Array.isArray(aw.exercises)) s.activeWorkout = null;
  return s;
}
function mergeState(parsed) {
  parsed = parsed && typeof parsed === 'object' ? parsed : {};
  const s = Object.assign(defaults(), parsed);
  s.settings = Object.assign(defaults().settings, (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {});
  return sanitizeState(s);
}
function migrate(s) {
  switch (s.schemaVersion) {
    case 1: break;
    /* künftige Versionen: case 1 → 2 usw., Fall-through */
  }
  s.schemaVersion = SCHEMA_VERSION;
  /* Einmalige Erstbelegung des Reha-Modus: Der Oberschenkel startet nach der
     Knieverletzung in Stufe 2 („Aufbau"), alles andere bleibt aus. Läuft genau
     einmal — wer die Gruppe danach abschaltet, bekommt sie nicht zurück. */
  if (!s.rehaInit) {
    s.rehaInit = true;
    if (!s.reha) s.reha = {};
    if (!s.reha['Beine']) {
      const jetzt = Date.now();
      s.reha['Beine'] = { aktiv: true, seit: jetzt, stufe: 2, stufeSeit: jetzt, basis: 0 };
    }
  }
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
        readOnly = true;
        return mergeState(parsed);
      }
      return migrate(mergeState(parsed));
    }
  } catch (e) { }
  return defaults();
}
let S = load();
let saveTimer = null;
function save() {
  if (readOnly || !storageOk) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { }
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

/* ---------- Formatierung (deutsch, Komma) ---------- */
function fmtKg(x) {
  if (x == null || isNaN(x)) return '–';
  return String(Math.round(x * 100) / 100).replace('.', ',');
}
function fmtInput(x) { return x == null || isNaN(x) ? '' : String(Math.round(x * 100) / 100).replace('.', ','); }
function parseNum(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function fmtVol(v) {
  if (!v) return '0 kg';
  return v >= 1000 ? String(Math.round(v / 100) / 10).replace('.', ',') + ' t' : Math.round(v) + ' kg';
}
function fmtDauer(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + ' h ' + m + ' min';
  if (m > 0) return m + ' min';
  return '<1 min';
}
function fmtMinSek(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function fmtDatumLang(ms) { return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtDatumKurz(ms) { return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); }
function fmtUhrzeit(ms) { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
function fmtMonat(ms) { return new Date(ms).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }); }
function todayStr(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function relTage(ms) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / TAG_MS);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  return 'vor ' + days + ' Tagen';
}

/* ---------- Übungs-Helfer ---------- */
function allExercises() { return EXES.concat(S.customExercises); }
function exById(id) {
  return allExercises().find(e => e.id === id) || { id, name: 'Gelöschte Übung', mg: MGS[0], eq: EQS[0], compound: false };
}
function restDefault(exId) { return exById(exId).compound ? S.settings.restCompound : S.settings.restIsolation; }
/* Standardpause: Coach-Kategorie (differenziert nach Übungstyp/Muskelgruppe) oder Pauschalwerte */
function pauseStandard(exId) {
  return (S.settings.coach !== false) ? Coach.pauseFuer(exById(exId)) : restDefault(exId);
}
function restTarget(exId, tplRest) {
  if (tplRest) return tplRest;
  const o = S.exerciseSettings[exId];
  if (o && o.restSec) return o.restSec;
  return pauseStandard(exId);
}

/* Pausenziel eines EINZELNEN Satzes — gibt null zurück, wenn nach diesem Satz
   bewusst kein Timer laufen soll.

   Reihenfolge:
   1. `restZiel` des Satzes (aus dem Plan bzw. heute von Hand gesetzt)
   2. Arbeitssatz            → Übungs-/Coach-Wert wie bisher (restTarget)
   3. Aufwärmsatz            → nur der LETZTE eines Aufwärmblocks bekommt den
                               Übungs-/Coach-Wert, alle anderen keinen Timer

   Zu 3: Zwischen den Rampensätzen pausiert man nach Gefühl — ein voller Timer
   würde dort nur den Gong ein halbes Dutzend Mal pro Übung auslösen. Vor dem
   ersten Arbeitssatz ist die volle Pause aber genau richtig, damit man frisch
   hineingeht. „Letzter des Blocks" heißt: der nächste Satz existiert und ist
   kein Aufwärmsatz. Steht der Aufwärmsatz am Ende der Übung, folgt nichts mehr,
   worauf man sich erholen müsste. */
function restZielFuerSatz(wex, si) {
  const s = wex.sets[si];
  if (!s) return null;
  if (s.restZiel > 0) return Math.round(s.restZiel);
  if (!s.warmup) return restTarget(wex.exId, wex.restSec);
  const naechster = wex.sets[si + 1];
  if (naechster && !naechster.warmup) return restTarget(wex.exId, wex.restSec);
  return null;
}

/* ---------- Satz-/Workout-Helfer ---------- */
function isDone(s) { return s.done !== false; }          // fertige Workouts tragen kein done-Flag
function workingSets(wex) { return wex.sets.filter(s => isDone(s) && !s.warmup && s.reps != null); }
function e1rmOf(kg, reps) {
  if (kg == null || reps == null || kg <= 0 || reps < 1 || reps > 15) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}
function setVolume(s) { return (s.kg || 0) * (s.reps || 0); }
function workoutVolume(w) {
  let v = 0;
  w.exercises.forEach(we => workingSets(we).forEach(s => { v += setVolume(s); }));
  return v;
}
function workoutSetCount(w) {
  let n = 0;
  w.exercises.forEach(we => { n += workingSets(we).length; });
  return n;
}
function topSet(ws) {
  if (!ws.length) return null;
  return ws.reduce((a, b) => ((b.kg || 0) > (a.kg || 0) || ((b.kg || 0) === (a.kg || 0) && b.reps > a.reps)) ? b : a);
}
/* Alle abgeschlossenen Einheiten mit dieser Übung, chronologisch */
function sessionsFor(exId) {
  const out = [];
  for (const w of S.workouts) {
    const wex = w.exercises.find(e => e.exId === exId);
    if (wex && workingSets(wex).length) out.push({ w, wex });
  }
  out.sort((a, b) => a.w.startedAt - b.w.startedAt);
  return out;
}
function lastSessionFor(exId) {
  const s = sessionsFor(exId);
  return s.length ? s[s.length - 1] : null;
}

/* ---------- PR-Logik (nie gespeichert, immer berechnet) ---------- */
function neueBests() { return { maxKg: null, maxE1rm: null, repsAtKg: {}, any: false }; }
function feedBests(b, s) {
  if (!isDone(s) || s.warmup || s.reps == null || s.kg == null) return;
  b.any = true;
  if (b.maxKg == null || s.kg > b.maxKg) b.maxKg = s.kg;
  const e = e1rmOf(s.kg, s.reps);
  if (e != null && (b.maxE1rm == null || e > b.maxE1rm)) b.maxE1rm = e;
  const key = String(s.kg);
  if (b.repsAtKg[key] == null || s.reps > b.repsAtKg[key]) b.repsAtKg[key] = s.reps;
}
/* Prüft einen Satz gegen Bestwerte. Höchstwertiger PR gewinnt: Gewicht > e1RM > Wdh. */
/* PR-Markierungen einer Übung im laufenden Training neu bewerten.

   Nötig, seit abgehakte Sätze bearbeitbar sind: wer 100 × 8 abhakt (PR!) und
   den Vertipper auf 100 × 5 korrigiert, hätte sonst dauerhaft ein falsches
   PR-Abzeichen am Satz — und beim Speichern des Trainings eine Historie, die
   einen Rekord behauptet, den es nie gab.

   Es reicht nicht, nur den geänderten Satz zu prüfen: PRs bauen aufeinander
   auf. Korrigiert man den ersten Satz nach unten, kann dadurch der dritte
   Satz nachträglich zum PR werden. Deshalb werden alle abgehakten Sätze
   dieser Übung in Abhak-Reihenfolge neu durchgerechnet. */
function prNeuBerechnen(xi) {
  const aw = S.activeWorkout;
  const wex = aw && aw.exercises[xi];
  if (!wex) return;
  const abgehakt = [];
  aw.exercises.forEach((we2, x2) => {
    if (we2.exId !== wex.exId) return;
    we2.sets.forEach((s2, si2) => {
      if (s2.done === true) abgehakt.push({ s: s2, at: s2.doneAt || 0, x: x2, i: si2 });
    });
  });
  abgehakt.sort((a, b) => (a.at - b.at) || (a.x - b.x) || (a.i - b.i));
  const bests = prBests(wex.exId, null);   // Stand der Historie, ohne das laufende Training
  abgehakt.forEach(e => {
    delete e.s.pr;
    const pr = prGegen(bests, e.s);
    if (pr) e.s.pr = pr.typ;
    feedBests(bests, e.s);
  });
}
function prGegen(b, s) {
  if (!b.any || s.warmup || s.kg == null || s.reps == null) return null;
  if (s.kg > 0 && (b.maxKg == null || s.kg > b.maxKg)) {
    return { typ: 'gewicht', text: 'Neuer Gewichts-PR: ' + fmtKg(s.kg) + ' kg' };
  }
  const e = e1rmOf(s.kg, s.reps);
  if (e != null && b.maxE1rm != null && e > b.maxE1rm) {
    return { typ: 'e1rm', text: 'Neuer e1RM-PR: ' + fmtKg(Math.round(e * 10) / 10) + ' kg' };
  }
  const prev = b.repsAtKg[String(s.kg)];
  if (prev != null && s.reps > prev) {
    return { typ: 'wdh', text: 'Wiederholungs-PR: ' + s.reps + ' × ' + fmtKg(s.kg) + ' kg' };
  }
  return null;
}
function prBests(exId, extraSets) {
  const b = neueBests();
  for (const w of S.workouts) {
    const wex = w.exercises.find(e => e.exId === exId);
    if (wex) wex.sets.forEach(s => feedBests(b, s));
  }
  if (extraSets) extraSets.forEach(s => feedBests(b, s));
  return b;
}
/* PR-Ereignisse chronologisch aus der gesamten Historie (selbstheilend bei Edits) */
function allPrEvents() {
  const bests = {};
  const events = [];
  const ws = [...S.workouts].sort((a, b) => a.startedAt - b.startedAt);
  for (const w of ws) {
    for (const wex of w.exercises) {
      const b = bests[wex.exId] || (bests[wex.exId] = neueBests());
      for (const s of wex.sets) {
        const pr = prGegen(b, s);
        if (pr) events.push({ w, exId: wex.exId, set: s, pr });
        feedBests(b, s);
      }
    }
  }
  return events;
}

/* ---------- Aufwärmsätze berechnen ----------
 * Kurze Rampe in Prozent des Arbeitsgewichts, mit weniger Wdh. je schwerer:
 * Gewebe und Nervensystem hochfahren und das Bewegungsmuster einschleifen, ohne
 * dem ersten Arbeitssatz Kraft wegzunehmen. Zwei feste Längen:
 *   3 Sätze für die großen Muskelgruppen (Beine, Gesäß, Brust, Rücken) — dort
 *     ist die Last hoch und der Weg vom Startgewicht bis oben weit.
 *   2 Sätze für Schultern, Arme und den Rest — kleinere Lasten, kürzerer Weg.
 * Mehr Sätze bringen nichts dazu, sie kosten nur Kraft für die Arbeitssätze.
 * Für Langhantel/SZ/Multipresse liegt kein Satz unter der leeren Stange — bei
 * schweren Übungen wird der erste Satz dadurch von selbst zum Stangensatz.
 * Nie auf oder über dem Arbeitsgewicht, gerundet auf 2,5-kg-Schritte.
 * Rückgabe: [{ kg, reps }] (aufsteigend). */
const WARMUP_GROSS = ['Beine', 'Gesäß', 'Brust', 'Rücken'];
const WARMUP_RAMPEN = {
  3: [[0.50, 8], [0.70, 4], [0.85, 2]],
  2: [[0.50, 8], [0.75, 4]]
};
function warmupSatzzahl(ex) {
  return (ex && WARMUP_GROSS.indexOf(ex.mg) >= 0) ? 3 : 2;
}
function computeWarmup(targetKg, ex) {
  const out = [];
  targetKg = +targetKg;
  if (!(targetKg > 0)) return out;
  const isBar = ex && (ex.eq === 'Langhantel' || ex.eq === 'SZ-Stange' || ex.eq === 'Multipresse');
  const barKg = (ex && ex.eq === 'SZ-Stange') ? 10 : 20;
  const round = kg => Math.round(kg / 2.5) * 2.5;
  const push = (kg, reps) => {
    if (kg <= 0 || kg >= targetKg) return;                 // nicht auf/über Arbeitsgewicht
    if (out.length && kg <= out[out.length - 1].kg) return; // streng aufsteigend
    out.push({ kg, reps });
  };
  for (const [pct, reps] of WARMUP_RAMPEN[warmupSatzzahl(ex)]) {
    let w = round(targetKg * pct);
    if (isBar) w = Math.max(w, barKg);
    push(w, reps);
  }
  return out;
}
function warmupPreviewHtml(exId, targetKg) {
  const sets = computeWarmup(targetKg, exById(exId));
  if (!sets.length) return '<div class="chart-leer">Gib dein Arbeitsgewicht ein</div>';
  return '<div class="wu-list">' + sets.map((s, i) =>
    '<div class="hist-set"><span class="hs-n">A' + (i + 1) + '</span>' +
    '<span class="hs-main">' + fmtKg(s.kg) + ' kg × ' + s.reps + '</span></div>').join('') +
    '<div class="hist-set hist-set-sum"><span class="hs-n">→</span>' +
    '<span class="hs-main">' + fmtKg(targetKg) + ' kg (Arbeitsgewicht)</span></div></div>';
}

/* ---------- Progressionsvorschlag ---------- */
function repRangeText(repMin, repMax) {
  return (repMin === repMax) ? (repMin + ' Wdh.') : (repMin + '–' + repMax + ' Wdh.');
}
function progressionFor(exId, repMin, repMax) {
  const ex = exById(exId);
  /* Zeit-/Strecken-Übungen (Plank, Farmer's Walk …): Wdh.-Feld enthält Sekunden/Meter —
     die Wiederholungs-Logik würde Unsinn empfehlen. */
  if (ex.hint) {
    return {
      typ: 'neu', text: 'Manuell steigern — ' + ex.hint,
      grund: 'Diese Übung wird über Zeit bzw. Strecke gemessen (Eintrag im Wdh.-Feld). Die automatische Gewichts-/Wiederholungs-Logik greift hier bewusst nicht — steigere Dauer bzw. Strecke schrittweise um ~5–10 %.'
    };
  }
  const coachAn = S.settings.coach !== false;
  const k = Coach.info(ex);
  repMin = repMin || (coachAn ? k.repMin : 8);
  repMax = repMax || (coachAn ? k.repMax : 12);
  const sess = sessionsFor(exId);
  if (!sess.length) {
    const rh = coachAn ? rehaExAktiv(ex) : null;
    if (rh) {
      const st = Coach.rehaStufe(rehaWerte(ex.mg).stufe);
      const rMin = st.repMin != null ? st.repMin : repMin;
      const rMax = st.repMax != null ? st.repMax : repMax;
      return {
        typ: 'neu', reha: { stufe: st.nr, stufeName: st.name, ampel: 'unbekannt' },
        text: 'Erstes Mal — vorsichtiges Gewicht für ' + repRangeText(rMin, rMax) + ' finden',
        grund: 'Reha-Modus, Stufe ' + st.nr + ' („' + st.name + '"). ' + st.ziel + ' ' + st.erklaerung +
               ' Nimm für die erste Einheit ein Gewicht, bei dem ' + rMax + ' Wiederholungen im Tempo 3 s hoch / 3 s runter ' +
               'klar machbar sind — die erste Einheit ist eine Messung, kein Test. Gesteigert wird ab der nächsten, ' +
               'und nur wenn Schmerz und Morgen-Check es hergeben.',
        hinweis: [
          ['Tempo', '3 s hoch, 3 s runter. Die Sehne reagiert auf hohe Spannung über Zeit, nicht auf Schwung (Kongsgaard et al. 2009).'],
          ['Isometrie', st.isometrie],
          ['Danach', 'Schmerzwert 0–10 eintragen — und morgen früh den Morgen-Check.']
        ]
      };
    }
    return {
      typ: 'neu', text: 'Erstes Mal — Arbeitsgewicht für ' + repRangeText(repMin, repMax) + ' finden',
      grund: coachAn ? ('Kategorie: ' + k.label + '. Empfohlener Zielbereich: ' + k.repMin + '–' + k.repMax + ' Wdh., Satzpause ~' + fmtMinSek(Coach.pauseFuer(ex)) + ' min. Wähle ein Gewicht, mit dem du das untere Ziel technisch sauber schaffst — gesteigert wird ab der nächsten Einheit automatisch.') : null
    };
  }
  const ws = workingSets(sess[sess.length - 1].wex);
  const wsDavor = sess.length > 1 ? workingSets(sess[sess.length - 2].wex) : null;
  /* Reha-Modus hat Vorrang vor dem normalen Coach: Er baut auf dessen Bewertung
     auf, kann sie aber nur bremsen — die Steigerung braucht zusätzlich eine
     grüne Ampel aus Schmerz und Morgen-Check. Läuft für die Muskelgruppe kein
     Reha-Modus (z. B. Waden), passiert hier gar nichts. */
  if (coachAn && rehaExAktiv(ex)) {
    return Coach.rehaEmpfehlung(ex, ws, wsDavor, repMin, repMax, rehaWerte(ex.mg));
  }
  if (coachAn) return Coach.empfehlung(ex, ws, wsDavor, repMin, repMax);
  /* Klassik-Modus (Coach aus): eigene Steigerungsschritte aus den Einstellungen,
     aber dieselbe Bewertungslogik wie im Coach. „Klassik" heißt hier: du legst
     die Schrittgröße selbst fest — nicht: die Beurteilung darf falsch sein.
     Deshalb auch hier Top-Satz statt schwächstem Satz (der Wiederholungsabfall
     über die Sätze ist Ermüdung, kein Lastsignal) und Bestätigung vor dem
     Sprung statt "einmal getroffen reicht". */
  const inc = (ex.compound && (ex.mg === 'Beine' || ex.mg === 'Gesäß')) ? S.settings.incLower : S.settings.incUpper;
  const top = Coach.topSatz(ws);
  const topKg = top.kg || 0;
  const topReps = top.reps || 0;
  const topDavor = (wsDavor && wsDavor.length) ? Coach.topSatz(wsDavor) : null;
  const rir = Coach.rirAus(top.rpe);
  const bestaetigt = !!(topDavor && (topDavor.kg || 0) >= topKg && (topDavor.reps || 0) >= repMax);
  /* Auch ohne Coach trägt jeder Vorschlag sein Wiederholungsziel — eine nackte
     kg-Zahl lässt offen, woran man merkt, ob der Vorschlag aufgegangen ist. */
  if (topReps >= repMax) {
    /* Reserve nachgewiesen: entweder über RPE oder über eine zweite Einheit. */
    if ((rir != null && (topReps - repMax) + rir >= 2) || bestaetigt) {
      return { typ: 'plus', kg: topKg + inc, reps: repMin, text: '+' + fmtKg(inc) + ' kg → ' + fmtKg(topKg + inc) + ' kg × ' + repMin + ' Wdh.' };
    }
    return {
      typ: 'wdh', kg: topKg, reps: topReps,
      text: fmtKg(topKg) + ' kg × ' + topReps + ' Wdh. bestätigen',
      hinweis: [
        ['Gewicht', fmtKg(topKg) + ' kg — unverändert.'],
        ['Wiederholungen', topReps + ' im besten Satz, also wie letztes Mal.'],
        ['Warum nicht mehr', 'Ein einzelner guter Tag ist noch kein Kraftzuwachs. Steht die Leistung ein zweites Mal — oder trägst du sie mit RPE ≤ 8 ein — geht das Gewicht hoch.']
      ]
    };
  }
  if (topReps < repMin) {
    const prevBelow = topDavor && (topDavor.kg || 0) >= topKg && (topDavor.reps || 0) < repMin;
    if (prevBelow) {
      const deload = Math.max(0, Math.min(topKg - 2.5, Math.round(topKg * 0.95 / 2.5) * 2.5));
      if (deload > 0 && deload < topKg) {
        return {
          typ: 'deload', kg: deload, reps: repMin,
          text: 'Deload: ' + fmtKg(deload) + ' kg × ' + repMin + ' Wdh.',
          hinweis: [
            ['Gewicht', fmtKg(deload) + ' kg statt ' + fmtKg(topKg) + ' kg.'],
            ['Wiederholungen', repMin + ' im ersten Satz — mit dem leichteren Gewicht muss das Ziel wieder stehen.'],
            ['Sätze', 'Unverändert. Nur die Intensität sinkt, nicht das Volumen.'],
            ['Anstrengung', '2–3 Wiederholungen in Reserve. Ein Deload bis ans Versagen ist keiner.'],
            ['Danach', 'Nächste Einheit wieder ' + fmtKg(topKg) + ' kg anpeilen.']
          ]
        };
      }
    }
    return { typ: 'halten', kg: topKg, reps: repMin, text: fmtKg(topKg) + ' kg × ' + repMin + ' Wdh. zurückerobern' };
  }
  const zielReps = Math.min(topReps + 1, repMax);
  return { typ: 'wdh', kg: topKg, reps: zielReps, text: fmtKg(topKg) + ' kg × ' + zielReps + ' Wdh. anpeilen' };
}

/* ---------- Reha-Modus ----------
 * Zustand:
 *   S.reha    = { <Muskelgruppe>: { aktiv, seit, stufe, stufeSeit, basis } }
 *   S.rehaLog = [ { ts, mg, typ:'uebung'|'morgen', wert:0–10, exId, workoutId } ]
 *
 * Zwei Rückmeldungen tragen den Modus, und beide sind zwei Taps groß:
 *   1. Schmerz 0–10 direkt nach der Übung
 *   2. Zustand am nächsten Morgen (der wichtigere Wert — Sehnengewebe reagiert
 *      verzögert, die Überlastung von heute zeigt sich morgen früh)
 * `basis` ist der persönliche Ausgangswert am Morgen, gegen den der Morgen-Check
 * verrechnet wird. Wer morgens generell mit 2/10 aufwacht, hat bei 2/10 keinen
 * Anstieg — die Regel aus Silbernagel et al. 2007 fragt nach der VERÄNDERUNG.
 */
function rehaFuer(mg) {
  const r = S.reha && S.reha[mg];
  return (r && r.aktiv) ? r : null;
}
function rehaAktiveGruppen() {
  return MGS.filter(mg => rehaFuer(mg));
}
function rehaExAktiv(ex) { return ex ? rehaFuer(ex.mg) : null; }

/* Tagesweise Zusammenfassung: pro Trainingstag der SCHLECHTESTE Schmerzwert und
   der Morgen-Check des Folgetages. Der schlechteste Wert führt, weil eine
   einzige überlastende Übung reicht — der Durchschnitt würde sie wegmitteln. */
function rehaSessions(mg) {
  const cfg = (S.reha && S.reha[mg]) || {};
  const basis = cfg.basis || 0;
  const uebung = {}, morgen = {};
  (S.rehaLog || []).forEach(e => {
    if (e.mg !== mg || e.wert == null) return;
    const d = todayStr(new Date(e.ts));
    if (e.typ === 'morgen') morgen[d] = e.wert;
    else uebung[d] = Math.max(uebung[d] == null ? -1 : uebung[d], e.wert);
  });
  return Object.keys(uebung).sort().map(d => {
    const naechsterTag = todayStr(new Date(new Date(d + 'T12:00').getTime() + TAG_MS));
    const m = morgen[naechsterTag];
    return {
      datum: d, ts: new Date(d + 'T12:00').getTime(),
      schmerz: uebung[d],
      morgen: m == null ? null : m,
      morgenDelta: m == null ? null : m - basis
    };
  });
}

/* Alles, was der Coach für eine Empfehlung braucht — plus das, was die Oberfläche
   anzeigt. Die grüne Serie zählt nur Einheiten, deren Morgen-Check vorliegt:
   eine Einheit ohne Nachkontrolle ist kein Beleg für gute Verträglichkeit. */
function rehaWerte(mg) {
  const cfg = (S.reha && S.reha[mg]) || {};
  const sess = rehaSessions(mg);
  const letzte = sess.length ? sess[sess.length - 1] : null;
  let gruen = 0;
  for (let i = sess.length - 1; i >= 0; i--) {
    const s = sess[i];
    if (s.morgenDelta == null) break;
    if (Coach.rehaAmpel(s.schmerz, s.morgenDelta).farbe !== 'gruen') break;
    gruen++;
  }
  const stufeSeit = cfg.stufeSeit || cfg.seit || Date.now();
  return {
    stufe: cfg.stufe || 2,
    schmerz: letzte ? letzte.schmerz : null,
    morgenDelta: letzte ? letzte.morgenDelta : null,
    letzte, sessions: sess,
    gruenSerie: gruen,
    tageInStufe: Math.floor((Date.now() - stufeSeit) / TAG_MS)
  };
}

/* Sehnen-Belastungszeit der laufenden Woche über alle Übungen dieser Gruppe —
   inklusive der Sätze, die im aktiven Training schon abgehakt sind. */
function rehaTutWocheSek(mg) {
  const ab = weekStartMs(0);
  let sek = 0;
  const zaehle = (w) => {
    (w.exercises || []).forEach(wex => {
      const ex = exById(wex.exId);
      if (!ex || ex.mg !== mg) return;
      sek += Coach.rehaTut(workingSets(wex));
    });
  };
  S.workouts.filter(w => w.startedAt >= ab).forEach(zaehle);
  if (S.activeWorkout && S.activeWorkout.startedAt >= ab) zaehle(S.activeWorkout);
  return sek;
}

/* Steht heute ein Morgen-Check aus? Nur wenn gestern trainiert wurde und für
   heute noch nichts eingetragen ist. Trainiert man zwei Tage hintereinander,
   fragt der Check trotzdem nur einmal pro Tag. */
function rehaMorgenOffen() {
  const heute = todayStr();
  const gestern = todayStr(new Date(Date.now() - TAG_MS));
  return rehaAktiveGruppen().filter(mg => {
    const sess = rehaSessions(mg);
    if (!sess.some(s => s.datum === gestern)) return false;
    return !(S.rehaLog || []).some(e =>
      e.mg === mg && e.typ === 'morgen' && todayStr(new Date(e.ts)) === heute);
  });
}

function rehaEintragen(mg, typ, wert, exId) {
  if (!S.rehaLog) S.rehaLog = [];
  const heute = todayStr();
  /* Pro Tag genau ein Morgen-Wert und pro Tag/Übung ein Trainingswert —
     Korrigieren muss möglich sein, ohne dass sich Einträge stapeln. */
  S.rehaLog = S.rehaLog.filter(e => !(
    e.mg === mg && e.typ === typ && todayStr(new Date(e.ts)) === heute &&
    (typ === 'morgen' || e.exId === exId)));
  S.rehaLog.push({
    ts: Date.now(), mg, typ, wert,
    exId: exId || null,
    workoutId: S.activeWorkout ? S.activeWorkout.id : null
  });
  /* Der Log wächst pro Training um wenige Einträge; ein Jahr bleibt problemlos
     erhalten. Älteres fliegt raus, damit der Export nicht zumüllt. */
  const grenze = Date.now() - 400 * TAG_MS;
  S.rehaLog = S.rehaLog.filter(e => e.ts >= grenze);
  save();
}

/* Wurde für diese Übung heute schon ein Schmerzwert eingetragen? */
function rehaHeuteWert(mg, exId) {
  const heute = todayStr();
  const e = (S.rehaLog || []).find(x =>
    x.mg === mg && x.typ === 'uebung' && x.exId === exId && todayStr(new Date(x.ts)) === heute);
  return e ? e.wert : null;
}

/* ---- Sheets: Schmerz nach der Übung, Morgen-Check ---- */
function rehaSkalaHtml(action, mg, exId, aktiv, beschriftung) {
  let h = '<div class="reha-skala">';
  for (let i = 0; i <= 10; i++) {
    const cls = i <= Coach.REHA_SCHMERZ_OK ? 'gruen' : (i <= Coach.REHA_SCHMERZ_MAX ? 'gelb' : 'rot');
    h += '<button class="reha-punkt ' + cls + (aktiv === i ? ' on' : '') + '" data-action="' + action +
      '" data-mg="' + esc(mg) + '"' + (exId ? ' data-exid="' + esc(exId) + '"' : '') +
      ' data-wert="' + i + '" aria-label="' + i + ' von 10">' + i + '</button>';
  }
  h += '</div><div class="reha-skala-legende"><span>' + esc(beschriftung[0]) + '</span><span>' + esc(beschriftung[1]) + '</span></div>';
  return h;
}
function rehaSchmerzSheet(mg, exId) {
  const ex = exId ? exById(exId) : null;
  const aktiv = rehaHeuteWert(mg, exId);
  return openSheet(
    '<div class="sheet-title">Wie war das Knie?</div>' +
    '<div class="sheet-sub">' + (ex ? esc(ex.name) + ' — s' : 'S') + 'tärkster Schmerz während und direkt nach der Übung.</div>' +
    rehaSkalaHtml('reha-schmerz-set', mg, exId, aktiv, ['0 — nichts gespürt', '10 — maximal']) +
    '<div class="info-box">Bis <b>' + Coach.REHA_SCHMERZ_OK + '/10</b> wird weiter gesteigert. ' +
    'Bis <b>' + Coach.REHA_SCHMERZ_MAX + '/10</b> ist die Belastung erlaubt, aber ohne Steigerung — ' +
    'Training mit Schmerz in diesem Bereich schadet nicht und schlägt Schonung sogar deutlich (Silbernagel et al. 2007). ' +
    'Darüber war die Last zu hoch.</div>' +
    '<div class="sheet-actions"><button class="btn" data-action="sheet-close">Später</button></div>');
}
function rehaMorgenSheet(mg) {
  const cfg = (S.reha && S.reha[mg]) || {};
  const sess = rehaSessions(mg);
  const letzte = sess.length ? sess[sess.length - 1] : null;
  return openSheet(
    '<div class="sheet-title">Morgen-Check — ' + esc(mg) + '</div>' +
    '<div class="sheet-sub">Wie fühlt es sich <b>jetzt</b> an, nach dem Training von gestern' +
    (letzte ? ' (Schmerz damals ' + letzte.schmerz + '/10)' : '') + '?</div>' +
    rehaSkalaHtml('reha-morgen-set', mg, null, null, ['0 — wie immer', '10 — maximal']) +
    '<div class="info-box">Dein Ausgangswert steht auf <b>' + (cfg.basis || 0) + '/10</b> — verglichen wird die Veränderung dagegen. ' +
    'Bis +1 Punkt ist normal, ab <b>+2</b> war die gestrige Belastung zu hoch und der Coach nimmt die Last zurück. ' +
    'Dieser Wert am Morgen danach ist das schärfere der beiden Signale: Sehnengewebe reagiert verzögert.</div>' +
    '<div class="sheet-actions"><button class="btn" data-action="sheet-close">Später</button></div>');
}

/* ---- Übersichtskarte je Muskelgruppe (Einstellungen) ---- */
function rehaDetailHtml(mg) {
  const cfg = S.reha[mg];
  const w = rehaWerte(mg);
  const st = Coach.rehaStufe(w.stufe);
  const ampel = Coach.rehaAmpel(w.schmerz, w.morgenDelta);
  const check = Coach.rehaStufenCheck(w.stufe, w.tageInStufe, w.gruenSerie);
  const tut = Coach.rehaTutWoche(rehaTutWocheSek(mg));
  let h = '<div class="sheet-title">Reha — ' + esc(mg) + '</div>';
  h += '<div class="card reha-karte">' +
    '<div class="reha-kopf"><span class="reha-ampel ' + ampel.farbe + '"></span>' +
    '<div><div class="li-title li-title-sm">Stufe ' + st.nr + ' — ' + esc(st.name) + '</div>' +
    '<div class="li-sub li-sub-wrap">' + esc(st.kurz) + '</div></div></div>' +
    '<div class="mini-note">' + esc(ampel.text) + ' · seit ' + w.tageInStufe + ' ' + (w.tageInStufe === 1 ? 'Tag' : 'Tagen') +
    ' in dieser Stufe · ' + w.gruenSerie + ' ' + (w.gruenSerie === 1 ? 'Einheit' : 'Einheiten') + ' in Folge grün</div>' +
    '<div class="mini-note">Sehnen-Belastungszeit diese Woche: <b>' + esc(tut.text) + '</b></div>' +
    '</div>';
  h += '<div class="info-box">' + esc(st.ziel) + ' ' + esc(st.erklaerung) + '</div>';
  h += '<div class="info-box"><b>Isometrie:</b> ' + esc(st.isometrie) + '</div>';
  h += '<div class="info-box"><b>Sehnen-Belastungszeit:</b> ' + esc(tut.grund) + '</div>';
  /* Stufenwechsel */
  if (check.kann) {
    h += '<div class="card"><div class="li-sub li-sub-wrap">' + esc(check.grund) + '</div>' +
      '<button class="btn btn-block btn-primary mt-m" data-action="reha-stufe-vor" data-mg="' + esc(mg) + '">Weiter zu Stufe ' + check.naechste + '</button></div>';
  } else {
    h += '<div class="mini-note">' + esc(check.grund) + '</div>';
  }
  h += '<div class="section-title">Von Hand einstellen</div>';
  h += settingRow('Stufe', 'Normalerweise schlägt der Coach den Wechsel selbst vor',
    '<select data-rehasel="stufe" data-mg="' + esc(mg) + '">' +
    [1, 2, 3, 4].map(n => '<option value="' + n + '"' + (w.stufe === n ? ' selected' : '') + '>' +
      n + ' — ' + Coach.rehaStufe(n).name + '</option>').join('') + '</select>');
  h += settingRow('Ausgangswert morgens', 'Dein normaler Wert ohne Training (0–10). Der Morgen-Check misst die Abweichung davon.',
    '<select data-rehasel="basis" data-mg="' + esc(mg) + '">' +
    [0, 1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + ((cfg.basis || 0) === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>');
  h += '<div class="row-2 mt-m">' +
    '<button class="btn" data-action="reha-morgen" data-mg="' + esc(mg) + '">Morgen-Check eintragen</button>' +
    '<button class="btn" data-action="reha-schmerz" data-mg="' + esc(mg) + '">Schmerz eintragen</button></div>';
  /* Verlauf */
  const letzte = w.sessions.slice(-10).reverse();
  if (letzte.length) {
    h += '<div class="section-title">Letzte Einheiten</div><div class="card diff-liste">';
    letzte.forEach(s => {
      const a = Coach.rehaAmpel(s.schmerz, s.morgenDelta);
      h += '<div class="diff-zeile"><span class="reha-ampel ' + a.farbe + '"></span><span>' +
        fmtDatumKurz(s.ts) + ' — Belastung ' + s.schmerz + '/10, Morgen danach ' +
        (s.morgen == null ? 'kein Eintrag' : s.morgen + '/10 (' + (s.morgenDelta > 0 ? '+' : '') + s.morgenDelta + ')') +
        '</span></div>';
    });
    h += '</div>';
  }
  h += '<div class="mini-note">' + esc(Coach.REHA_QUELLEN) + '</div>';
  h += '<div class="sheet-actions"><button class="btn btn-danger" data-action="reha-aus" data-mg="' + esc(mg) + '">Reha-Modus für ' + esc(mg) + ' beenden</button>' +
    '<button class="btn" data-action="sheet-close">Schließen</button></div>';
  return openSheet(h);
}

/* ---- Abschnitt in den Einstellungen ----
   Der Modus steht für JEDE Muskelgruppe bereit, ist aber überall aus, bis er
   gebraucht wird. Eine aktive Gruppe zeigt Stufe und Ampel direkt in der Zeile —
   sonst müsste man erst hineintippen, um zu sehen, ob der Coach gerade bremst. */
function rehaEinstellungenHtml() {
  const aktive = rehaAktiveGruppen();
  let h = '<div class="section-title">Reha-Modus</div>';
  h += '<div class="info-box">Für eine Muskelgruppe, die sich von einer Verletzung erholt: Der Coach steigert dann nur noch, ' +
    'wenn <b>zwei</b> Dinge stimmen — deine Leistung <i>und</i> die Verträglichkeit (Schmerz während der Übung, Zustand am Morgen danach). ' +
    'Die Schrittgröße ist auf 5 % gedeckelt, das Tempo auf 3 s hoch / 3 s runter, und die Wiederholungsziele kommen aus der Reha-Stufe. ' +
    'Alle anderen Muskelgruppen laufen davon völlig unberührt weiter.</div>';
  if (aktive.length) {
    aktive.forEach(mg => {
      const w = rehaWerte(mg);
      const st = Coach.rehaStufe(w.stufe);
      const a = Coach.rehaAmpel(w.schmerz, w.morgenDelta);
      h += '<button class="li-item" data-action="reha-detail" data-mg="' + esc(mg) + '">' +
        '<span class="reha-ampel ' + a.farbe + '"></span>' +
        '<div class="li-main"><div class="li-title li-title-sm">' + esc(mg) + ' · Stufe ' + st.nr + ' — ' + esc(st.name) + '</div>' +
        '<div class="li-sub li-sub-wrap">' + esc(a.text) + '</div></div><span class="chev">›</span></button>';
    });
  }
  const offen = MGS.filter(mg => !rehaFuer(mg));
  h += '<div class="reha-mg-wahl">';
  offen.forEach(mg => {
    h += '<button class="reha-mg-btn" data-action="reha-an" data-mg="' + esc(mg) + '">+ ' + esc(mg) + '</button>';
  });
  h += '</div>';
  h += '<div class="mini-note">' + esc(Coach.REHA_QUELLEN) + '</div>';
  return h;
}

/* ---------- Wochenstatistik (ISO-Woche, Montag-basiert) ---------- */
function weekStartMs(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offset * 7);
  return d.getTime();
}
function kwNummer(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3); // Donnerstag der Woche
  const jan4 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - jan4) / TAG_MS - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}
function weeklyStats(n) {
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = weekStartMs(i), end = weekStartMs(i - 1); // echter Wochenanfang statt +7 Tage (Zeitumstellung!)
    const e = { start, end, label: 'KW ' + kwNummer(start), workouts: 0, saetze: {}, tonnage: {}, saetzeGesamt: 0, tonnageGesamt: 0 };
    for (const w of S.workouts) {
      if (w.startedAt < start || w.startedAt >= end) continue;
      e.workouts++;
      for (const wex of w.exercises) {
        const mg = exById(wex.exId).mg;
        for (const s of workingSets(wex)) {
          e.saetze[mg] = (e.saetze[mg] || 0) + 1;
          e.tonnage[mg] = (e.tonnage[mg] || 0) + setVolume(s);
          e.saetzeGesamt++;
          e.tonnageGesamt += setVolume(s);
        }
      }
    }
    weeks.push(e);
  }
  return weeks;
}

/* ---------- Toast, Konfetti, Sheet, Chart-Tooltip ---------- */
let toastTimer = null;
function showToast(text, cls) {
  const t = $('#toast');
  t.textContent = text;
  t.className = cls || '';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
/* Reduzierte Bewegung: der Nutzer bekommt die Meldung, aber keine fliegenden Teile. */
function magBewegung() {
  try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; }
}
let confettiTimer = null;
function burstConfetti() {
  if (!magBewegung()) return;
  const c = $('#confetti');
  const farben = ['#0a84ff', '#34c759', '#ff9500', '#ff3b30', '#ffcc00', '#5e5ce6'];
  let html = '';
  for (let i = 0; i < 36; i++) {
    html += '<div class="confetti-piece" style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + farben[i % 6] +
      ';animation-duration:' + (1.6 + Math.random() * 1.4).toFixed(2) + 's;animation-delay:' + (Math.random() * 0.4).toFixed(2) + 's"></div>';
  }
  c.innerHTML = html;
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => { c.innerHTML = ''; }, 3400);
}
let pickerCb = null;
let sheetCloseTimer = null;

/* --- Weiche Tastatur: das Sheet legt sich davor, nicht darunter ---
 * Ein fixiertes Element hängt am Layout-Viewport, und der schrumpft nicht, wenn
 * die Tastatur aufgeht — das Sheet und damit die halbe Trefferliste rutschen
 * darunter. visualViewport sagt, wie viel unten verdeckt ist; --kb hebt das
 * Sheet um genau diesen Betrag an, --vvh deckelt seine Höhe auf das, was noch
 * sichtbar ist. Ohne visualViewport (alte Browser) bleibt alles beim Alten.
 * offsetTop zählt mit: iOS schiebt bei fokussiertem Feld zusätzlich den ganzen
 * Layout-Viewport nach oben. */
function viewportSync() {
  const vv = window.visualViewport;
  if (!vv) return;
  const wurzel = document.documentElement;
  const roh = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  /* 80 px Schwelle: die ein- und ausfahrende Safari-Leiste ist keine Tastatur —
     unterhalb davon bleibt das Sheet, wo es ist, statt bei jedem Scrollen zu zucken. */
  const kb = roh > 80 ? roh : 0;
  wurzel.style.setProperty('--kb', kb + 'px');
  wurzel.style.setProperty('--vvh', Math.round(vv.height) + 'px');
  $('#sheet').classList.toggle('kb-auf', kb > 0);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', viewportSync);
  window.visualViewport.addEventListener('scroll', viewportSync);
  window.addEventListener('orientationchange', () => setTimeout(viewportSync, 250));
  viewportSync();
}

function openSheet(html) {
  clearTimeout(sheetCloseTimer);
  const s = $('#sheet');
  s.classList.remove('closing');
  $('#sheet-content').innerHTML = html;
  s.classList.remove('hidden');
  viewportSync();
}
/* Das Sheet fährt auf demselben Weg hinaus, auf dem es hereinkam. Erst danach
   wird der Inhalt geleert — sonst klappt die Fläche mitten in der Ausfahrt zusammen. */
function closeSheet() {
  const s = $('#sheet');
  pickerCb = null;
  if (s.classList.contains('hidden')) return;
  const fertig = () => {
    s.classList.add('hidden');
    s.classList.remove('closing');
    $('#sheet-content').innerHTML = '';
    if (neueVersionBereit) swNeuladenWennBereit();   // vorgemerktes Update jetzt evtl. einspielen
  };
  if (!magBewegung()) { fertig(); return; }
  s.classList.add('closing');
  clearTimeout(sheetCloseTimer);
  sheetCloseTimer = setTimeout(fertig, 280);
}
/* Die Trefferfläche eines Datenpunkts geht über die volle Charthöhe (Daumen statt
   Mauszeiger). Der Tooltip richtet sich deshalb am Fingerpunkt aus, nicht an der Fläche. */
function showChartTip(hit, ev) {
  const tip = $('#chart-tip');
  tip.textContent = hit.dataset.tip || '';
  tip.classList.remove('hidden');
  const r = hit.getBoundingClientRect();
  const x = (ev && ev.clientX) ? ev.clientX : r.left + r.width / 2;
  const y = (ev && ev.clientY) ? ev.clientY : r.top;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, y - tip.offsetHeight - 14) + 'px';
}
function hideChartTip() { $('#chart-tip').classList.add('hidden'); }

/* ---------- Navigation & Render ---------- */
let tab = 'start';
let trainSub = null;     // null | 'plaene' | 'tpl-editor'
let tplDraft = null;     // Arbeitskopie im Vorlagen-Editor
let planAuswahl = null;  // Set von Plan-IDs im Auswahlmodus (null = normal)
/* Auswahlmodus für Sätze im laufenden Training: { xi, sets: Set<Satzindex> }.
   Gilt immer nur für eine Übung — Sätze gehören zu genau einer Übungskarte,
   und der Modus soll die übrigen Karten nicht mitsperren. */
let satzAuswahl = null;
let zeigeWorkout = true; // false = laufendes Training ist minimiert (Start zeigt die normale Übersicht)
let uebSub = null;       // null | { exId }
let uebFilter = { q: '', mg: null, eq: null };
let verlaufSub = null;   // null | { id }
let editDraft = null;    // Arbeitskopie im Verlauf-Editor
let statMg = 'Alle';
let statMode = 'saetze';

/* Eintritts-Animation nur bei echtem Ansichtswechsel — nicht bei jedem Satz-Haken.
   Wer die Ansicht wechselt, setzt dieses Flag; render() verbraucht es einmal. */
let viewAnim = false;
function markViewAnim() { viewAnim = true; }
function render() {
  document.querySelectorAll('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  if (tab === 'start') v.innerHTML = renderStart();
  else if (tab === 'profil') v.innerHTML = renderProfil();
  else if (tab === 'verlauf') v.innerHTML = renderVerlauf();
  else if (tab === 'uebungen') v.innerHTML = renderUebungen();
  else v.innerHTML = renderDaten();
  v.classList.remove('enter', 'chart-anim');
  if (viewAnim) {
    viewAnim = false;
    void v.offsetWidth;                      // Reflow erzwingen, sonst startet die Animation nicht neu
    v.classList.add('enter', 'chart-anim');
  }
  renderTimerBar();
  /* Schwebender Rücksprung zum laufenden (minimierten) Training */
  const rs = $('#wo-ruecksprung');
  if (S.activeWorkout && !(tab === 'start' && zeigeWorkout)) {
    rs.classList.remove('hidden');
    rs.textContent = '‹ Zurück zum Training · ' + fmtDauer((Date.now() - S.activeWorkout.startedAt) / 1000);
  } else {
    rs.classList.add('hidden');
  }
}
function warnHtml(mitExportHinweis) {
  if (readOnly) return '<div class="warn-banner">Diese Daten stammen aus einer neueren Kraftlog-Version. Änderungen werden nicht gespeichert — bitte zuerst in der neuen Version exportieren.</div>';
  if (!storageOk) return '<div class="warn-banner">Browser-Speicher nicht verfügbar — Daten gehen beim Schließen verloren. Regelmäßig exportieren!</div>';
  if (mitExportHinweis && exportOverdue()) return '<div class="warn-banner">Kein Export seit über 7 Tagen — sichere deine Daten unten per Export.</div>';
  return '';
}
function exportOverdue() {
  if (!S.workouts.length) return false;
  const ref = S.settings.lastExport || S.workouts[0].startedAt;
  return Date.now() - ref > 7 * TAG_MS;
}
function chartCard(title, inner, sub) {
  return '<div class="card chart-card"><h3>' + esc(title) + '</h3>' +
    (sub ? '<div class="chart-sub">' + esc(sub) + '</div>' : '') + inner + '</div>';
}

/* ---------- Leerzustände ----------
   Keine Emojis: die Piktogramme sind dieselben Inline-SVGs wie im Rest der App.
   Jeder Leerzustand nennt, was fehlt, und wie man es füllt. */
const LEER_ICONS = {
  hantel: '<path d="M7 7.5v9M17 7.5v9M7 12h10M3.5 9.5v5M20.5 9.5v5"/>',
  uhr: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/>',
  chart: '<path d="M4 19.5h16"/><path d="M6.5 16.5v-4M11 16.5v-8M15.5 16.5v-5M20 16.5v-9"/>',
  suche: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/>',
  pokal: '<path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5v1a3 3 0 0 0 3 3M16 5.5h2.5v1a3 3 0 0 1-3 3"/><path d="M12 12.5v3.5M9 20h6M10 16.5h4l.5 3.5h-5z"/>',
  waage: '<path d="M4.5 19.5V8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11z"/><path d="M12 10v3M9.5 11.5l2.5 1.5 2.5-1.5"/>'
};
function leerHtml(icon, titel, text, aktion) {
  return '<div class="empty"><div class="e-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' +
    (LEER_ICONS[icon] || LEER_ICONS.hantel) + '</svg></div>' +
    '<h4>' + esc(titel) + '</h4><p>' + esc(text) + '</p>' + (aktion || '') + '</div>';
}

/* Welcher Haken zuletzt gesetzt wurde — die Quittungs-Animation läuft genau einmal. */
let popSet = null;

/* ---------- Goku-Maskottchen (Coach-Kommentare) ----------
   Erscheint NUR auf der Startseite ohne laufendes Training und in der
   Detailansicht eines soeben beendeten Trainings — nie waehrend des Trainings. */
let gokuFeierId = null;   // Workout-ID des zuletzt in dieser Sitzung beendeten Trainings

function gokuHtml() {
  return '<div class="goku-figur" aria-hidden="true"><div class="songoku"><div class="b-neck"></div><div class="neck-1"><div class="n1"></div></div>' +
    '<div class="cl"></div><div class="cr"></div><div class="ear-r"></div><div class="ear-l"></div>' +
    '<div class="face"><div class="mouth"></div><div class="noose"></div><div class="eye-r"></div><div class="eye-l"></div>' +
    '<div class="u-eyes"></div><div class="t-eye-r"></div><div class="t-eye-l"></div><div class="f"></div></div>' +
    '<div class="hair"><div class="e1"></div><div class="e2"></div><div class="e3"></div><div class="e4"></div>' +
    '<div class="e5"></div><div class="e6"></div><div class="e7"></div><div class="e8"></div></div></div></div>';
}
function gokuKarte(text) {
  return '<div class="goku-card">' + gokuHtml() +
    '<div class="goku-bubble"><div class="goku-name">Goku</div>' + esc(text) + '</div></div>';
}
/* Tagesstabile Auswahl: wechselt taeglich, bleibt am selben Tag gleich */
function gokuWahl(arr) {
  return arr[Math.floor(Date.now() / TAG_MS) % arr.length];
}
function gokuSpruchHome() {
  const heuteStart = startOfDay(Date.now());
  const heuteTrainiert = S.workouts.some(w => w.startedAt >= heuteStart);
  const wpHeuteTpl = S.templates.find(t => t.id === S.wochenplan[heuteWpTag()]);
  const wpAktiv = WP_TAGE.some(t => S.templates.some(x => x.id === S.wochenplan[t]));
  const letztes = S.workouts[S.workouts.length - 1];
  const tageSeit = letztes ? Math.floor((Date.now() - letztes.startedAt) / TAG_MS) : null;

  if (!S.workouts.length && !S.templates.length) {
    return 'Hi, ich bin Goku! Leg einen Plan an und lass uns zusammen trainieren — jeder fängt mal klein an, sogar ich.';
  }
  if (heuteTrainiert) {
    return gokuWahl([
      'Training erledigt — super gemacht! Jetzt hast du dir einen riesigen Berg Essen verdient.',
      'Stark! Für heute hast du alles gegeben. Ausruhen, essen, wachsen.',
      'Sauber abgeliefert! So wirst du jeden Tag ein Stück stärker.'
    ]);
  }
  if (wpHeuteTpl) {
    return gokuWahl([
      'Heute steht „' + wpHeuteTpl.name + '" an — los geht\'s, ich wärme mich schon mal auf!',
      '„' + wpHeuteTpl.name + '" wartet auf dich. Ein Training auslassen? Würde ich nie — höchstens ein Essen. Nein, auch das nicht.',
      'Zeit für „' + wpHeuteTpl.name + '"! Jeder Satz bringt dich näher an dein stärkstes Ich.'
    ]);
  }
  const wp = wochenplanStatus();
  const zuWenig = wp.zugewiesen ? wp.zeilen.find(z => z.status === 'wenig') : null;
  if (zuWenig) {
    return 'Dein Wochenplan ist fast perfekt — nur bei ' + zuWenig.mg + ' ist noch Luft: ' +
      zuWenig.diff + (zuWenig.diff === 1 ? ' Satz' : ' Sätze') + ' mehr pro Woche, dann passt es!';
  }
  if (tageSeit != null && tageSeit >= 4) {
    return gokuWahl([
      'Schon ' + tageSeit + ' Tage kein Training — dein Training vermisst dich! Und ich auch.',
      tageSeit + ' Tage Pause? Zeit, wieder anzugreifen — Stärke wartet nicht.',
      'Hey, ' + tageSeit + ' Tage ohne Training! Selbst an Ruhetagen träume ich vom nächsten Satz.'
    ]);
  }
  if (wpAktiv) {
    return gokuWahl([
      'Heute ist Ruhetag — Erholung macht stärker, glaub mir. Iss ordentlich!',
      'Ruhetag! Muskeln wachsen in der Pause. Morgen greifen wir wieder an.',
      'Heute wird regeneriert. Auch die stärksten Kämpfer brauchen Pausen.'
    ]);
  }
  return gokuWahl([
    'Bereit, wenn du es bist! Lass uns stärker werden.',
    'Ein guter Tag, um an die eigenen Grenzen zu gehen — und darüber hinaus!',
    'Training ist wie ein Turnier: Es zählt, dass du antrittst.'
  ]);
}
function gokuSpruchWorkout(w) {
  const prs = allPrEvents().filter(ev => ev.w.id === w.id).length;
  if (prs) {
    return gokuWahl([
      'WOW! ' + prs + ' neue Bestleistung' + (prs > 1 ? 'en' : '') + '! Du wirst ja fast so stark wie ich — fast!',
      prs + ' neue' + (prs > 1 ? '' : 'r') + ' Rekord' + (prs > 1 ? 'e' : '') + '! Genau so durchbricht man die eigenen Grenzen. Weiter so!'
    ]);
  }
  const vorher = w.templateId
    ? [...S.workouts].filter(x => x.templateId === w.templateId && x.id !== w.id && x.startedAt < w.startedAt).pop()
    : null;
  if (vorher && workoutVolume(w) > workoutVolume(vorher)) {
    return 'Stark! Mehr Volumen als beim letzten Mal (' + fmtVol(workoutVolume(w)) + ' statt ' +
      fmtVol(workoutVolume(vorher)) + ') — genau so wird man stärker!';
  }
  return gokuWahl([
    'Super gemacht! Training geschafft — jetzt hast du dir eine riesige Portion Essen verdient.',
    'Sauber durchgezogen! Ruh dich aus und iss ordentlich — Muskeln wachsen in der Pause.',
    'Klasse Training! Jeder abgehakte Satz zählt. Ich bin stolz auf dich!'
  ]);
}

/* ---------- View: Start (Workout beginnen) ---------- */
function renderStart() {
  if (S.activeWorkout && zeigeWorkout) return renderActiveWorkout();
  if (trainSub === 'plaene') return renderPlaene();
  if (trainSub === 'tpl-editor') return renderTplEditor();
  if (trainSub === 'wochenplan') return renderWochenplan();

  const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = '<h1 class="view-title">Workout starten<small>' + esc(heute) + '</small></h1>' + warnHtml();
  /* Der Morgen-Check steht ganz oben und vor allem anderen: Er ist nur heute
     früh etwas wert und geht sonst im Tagesablauf unter. */
  rehaMorgenOffen().forEach(mg => {
    h += '<button class="card reha-morgen-karte" data-action="reha-morgen" data-mg="' + esc(mg) + '">' +
      '<div class="li-main"><div class="li-sub">Morgen-Check · ' + esc(mg) + '</div>' +
      '<div class="li-title">Wie fühlt es sich heute an?</div>' +
      '<div class="li-sub li-sub-wrap">Gestern trainiert — der Zustand am Morgen danach entscheidet, ob heute gesteigert wird.</div></div>' +
      '<span class="reha-morgen-cta">Eintragen ›</span></button>';
  });
  /* Goku begrüßt nur, wenn KEIN Training läuft (auch kein minimiertes) */
  if (!S.activeWorkout && S.settings.goku !== false) h += gokuKarte(gokuSpruchHome());
  /* Heutiger Tag laut Wochenplan */
  const wpHeuteTpl = S.templates.find(t => t.id === S.wochenplan[heuteWpTag()]);
  const wpAktiv = WP_TAGE.some(t => S.templates.some(x => x.id === S.wochenplan[t]));
  if (wpHeuteTpl) {
    const heuteErledigt = S.workouts.some(w => w.templateId === wpHeuteTpl.id && w.startedAt >= startOfDay(Date.now()));
    h += '<div class="card wp-heute">' +
      '<div class="li-main"><div class="li-sub">Heute laut Wochenplan</div><div class="li-title">' + esc(wpHeuteTpl.name) + '</div></div>' +
      (heuteErledigt
        ? '<span class="tag tag-gruen tag-erledigt">Erledigt ✓</span>'
        : '<button class="btn btn-small btn-primary" data-action="wo-start" data-tpl="' + esc(wpHeuteTpl.id) + '">Start</button>') +
      '</div>';
  } else if (wpAktiv) {
    h += '<div class="card"><div class="li-sub li-sub-wrap">Heute laut Wochenplan: <b>Ruhetag</b> — gute Erholung!</div></div>';
  }
  h += '<div class="section-head"><span class="section-title">Meine Workouts</span>' +
    '<button class="linklike linklike-sm" data-action="tpl-new">+ Neu</button>' +
    '<button class="linklike linklike-sm" data-action="tpl-mehr">Mehr …</button></div>';
  h += '<div class="tpl-grid">';
  for (const tpl of S.templates) {
    const letzte = [...S.workouts].reverse().find(w => w.templateId === tpl.id);
    h += '<div class="tpl-wrap">' +
      '<button class="tpl-box" data-action="wo-start" data-tpl="' + esc(tpl.id) + '">' +
      '<div class="tpl-box-name">' + esc(tpl.name) + '</div>' +
      '<div class="tpl-box-sub">' + tpl.exercises.length + ' Übungen · ' + saetzeVon(tpl) + ' Sätze</div>' +
      (letzte ? '<div class="tpl-box-sub">zuletzt ' + relTage(letzte.startedAt) + '</div>' : '') +
      '<div class="tpl-box-cta">Starten ›</div></button>' +
      '<button class="tpl-menu" data-action="tpl-menu" data-id="' + esc(tpl.id) + '" aria-label="Optionen für ' + esc(tpl.name) + '">⋯</button></div>';
  }
  h += '<button class="tpl-box" data-action="wo-start">' +
    '<div class="tpl-box-name">Freies Training</div><div class="tpl-box-sub">ohne Vorlage</div>' +
    '<div class="tpl-box-cta">Starten ›</div></button>';
  h += '<button class="tpl-box tpl-box-lauf" data-action="run-add">' +
    '<div class="tpl-box-name">Lauf</div><div class="tpl-box-sub">Distanz &amp; Zeit</div>' +
    '<div class="tpl-box-cta">Eintragen ›</div></button>';
  h += '</div>';
  if (!S.templates.length) {
    h += leerHtml('hantel', 'Noch keine eigenen Workouts',
      'Lege Vorlagen an (z. B. Push / Pull / Beine) — dann startest du mit einem Tap und siehst pro Übung die Werte vom letzten Mal.',
      '<button class="btn btn-primary" data-action="tpl-new">Ersten Plan anlegen</button>');
  }
  const wpStatus = wochenplanStatus();
  h += '<button class="btn btn-block wp-btn" data-action="wochenplan">Wochenplan' +
    (wpStatus.zugewiesen && wpStatus.warnungen ? ' <span class="tag tag-orange">' + wpStatus.warnungen + ' ' + (wpStatus.warnungen === 1 ? 'Hinweis' : 'Hinweise') + '</span>' : '') + '</button>';
  return h;
}

/* ---------- Wochenplan + Volumen-Analyse ---------- */
function saetzeVon(tpl) {
  return tpl.exercises.reduce((a, it) => a + it.sets.filter(s => !s.warmup).length, 0);
}
function wochenplanVolumen() {
  const vol = {};
  for (const tag of WP_TAGE) {
    const tpl = S.templates.find(t => t.id === S.wochenplan[tag]);
    if (!tpl) continue;
    tpl.exercises.forEach(it => {
      const mg = exById(it.exId).mg;
      vol[mg] = (vol[mg] || 0) + it.sets.filter(s => !s.warmup).length;
    });
  }
  return vol;
}
function wochenplanStatus() {
  const vol = wochenplanVolumen();
  const zugewiesen = WP_TAGE.some(t => S.templates.some(x => x.id === S.wochenplan[t]));
  const zeilen = MGS.map(mg => {
    const z = Coach.VOLUMEN[mg] || { min: 0, max: 99, hinweis: '' };
    const ist = vol[mg] || 0;
    let status = 'ok', diff = 0;
    if (z.min > 0 && ist < z.min) { status = 'wenig'; diff = z.min - ist; }
    else if (ist > z.max) { status = 'viel'; diff = ist - z.max; }
    return { mg, ist, z, status, diff };
  });
  return { zugewiesen, zeilen, warnungen: zugewiesen ? zeilen.filter(x => x.status !== 'ok').length : 0 };
}
function wpHinweis(mg, status) {
  let best = null, bestN = -1, bestTag = null;
  for (const tag of WP_TAGE) {
    const tpl = S.templates.find(t => t.id === S.wochenplan[tag]);
    if (!tpl) continue;
    const n = tpl.exercises.reduce((a, it) => a + (exById(it.exId).mg === mg ? it.sets.filter(s => !s.warmup).length : 0), 0);
    if (n > bestN) { bestN = n; best = tpl; bestTag = tag; }
  }
  if (!best) return '';
  if (status === 'wenig') {
    return bestN > 0
      ? ' — z. B. in „' + esc(best.name) + '" (' + WP_LABEL[bestTag] + ') ergänzen'
      : ' — z. B. in „' + esc(best.name) + '" (' + WP_LABEL[bestTag] + ') eine Übung dafür aufnehmen';
  }
  return bestN > 0 ? ' — z. B. in „' + esc(best.name) + '" (' + WP_LABEL[bestTag] + ') reduzieren' : '';
}
function volZeile(z) {
  const skala = z.z.max * 1.35;
  const fuellung = Math.min(100, z.ist / skala * 100);
  const zoneL = z.z.min / skala * 100;
  const zoneB = (z.z.max - z.z.min) / skala * 100;
  const cls = z.status === 'ok' ? 's-ok' : (z.status === 'wenig' ? 's-wenig' : 's-viel');
  let statusHtml;
  if (z.status === 'wenig') {
    statusHtml = '<div class="vol-status st-wenig">Zu wenig: +' + z.diff + ' ' + (z.diff === 1 ? 'Satz' : 'Sätze') + ' bis zum Optimum' + wpHinweis(z.mg, 'wenig') + '</div>';
  } else if (z.status === 'viel') {
    statusHtml = '<div class="vol-status st-viel">Zu viel: ' + z.diff + ' ' + (z.diff === 1 ? 'Satz' : 'Sätze') + ' über dem sinnvollen Maximum (Übertrainings-Risiko)' + wpHinweis(z.mg, 'viel') + '</div>';
  } else if (z.ist === 0 && z.z.min === 0) {
    statusHtml = '<div class="vol-status vol-status-off">Optional — nicht im Plan</div>';
  } else {
    statusHtml = '<div class="vol-status st-ok">Im optimalen Bereich</div>';
  }
  return '<div class="vol-row"><div class="vol-kopf"><span class="vol-mg">' + esc(z.mg) + '</span>' +
    '<span class="vol-ist ' + (z.status === 'ok' ? '' : cls === 's-wenig' ? 'st-wenig' : 'st-viel') + '">' + z.ist + '</span>' +
    '<span class="vol-ziel">/ ' + (z.z.min > 0 ? z.z.min + '–' + z.z.max : 'bis ' + z.z.max) + ' Sätze</span></div>' +
    '<div class="vol-bar"><div class="vol-zone" style="left:' + zoneL.toFixed(1) + '%;width:' + zoneB.toFixed(1) + '%"></div>' +
    '<div class="vol-fill ' + cls + '" style="width:' + fuellung.toFixed(1) + '%"></div></div>' +
    statusHtml +
    '<button class="linklike linklike-sm linklike-block" data-action="wp-detail" data-mg="' + esc(z.mg) + '">Zusammensetzung anzeigen</button></div>';
}
function renderWochenplan() {
  let h = '<button class="back-btn" data-action="train-home">‹ Training</button><h1 class="view-title">Wochenplan</h1>' +
    '<div class="mini-note mini-note-lead">Tippe auf einen Tag, um ihm einen Plan zuzuweisen. Kein Plan = Ruhetag.</div>';
  const heute = heuteWpTag();
  for (const tag of WP_TAGE) {
    const tpl = S.templates.find(t => t.id === S.wochenplan[tag]);
    h += '<button class="li-item" style="min-height:52px" data-action="wp-tag" data-tag="' + tag + '">' +
      '<div class="li-main"><div class="li-title li-title-sm">' + WP_LABEL[tag] +
      (tag === heute ? ' <span class="tag tag-lauf" style="margin-left:4px">heute</span>' : '') + '</div>' +
      '<div class="li-sub">' + (tpl ? esc(tpl.name) : 'Ruhetag') + '</div></div>' +
      (tpl ? '<span class="tag">' + saetzeVon(tpl) + ' Sätze</span>' : '') + '<span class="chev">›</span></button>';
  }
  const st = wochenplanStatus();
  h += '<div class="section-title" style="display:flex;align-items:baseline;gap:10px">Volumen-Analyse (Sätze/Woche) ' +
    '<button class="linklike linklike-sm" data-action="wp-info">Wie wird gerechnet?</button></div>';
  if (!st.zugewiesen) {
    h += '<div class="card"><div class="li-sub li-sub-wrap">Weise mindestens einem Tag einen Plan zu — dann prüfe ich dein Wochenvolumen pro Muskelgruppe gegen die optimalen Bereiche und warne bei zu wenig oder zu viel.</div></div>';
  } else {
    st.zeilen.forEach(z => { h += volZeile(z); });
  }
  return h;
}

/* --- Aktives Workout --- */
function renderActiveWorkout() {
  const aw = S.activeWorkout;
  let h = '<div class="wo-header">' +
    '<button class="wo-icon-btn" data-action="wo-minimieren" aria-label="Training minimieren">‹</button>' +
    '<div class="wo-name"><h2>' + esc(aw.name) + '</h2>' +
    '<div class="wo-elapsed" id="wo-elapsed">' + fmtDauer((Date.now() - aw.startedAt) / 1000) + '</div></div>' +
    '<button class="wo-icon-btn" data-action="wo-menu" aria-label="Trainings-Optionen">⋯</button>' +
    '<button class="btn btn-green" data-action="wo-finish">Fertig</button></div>';
  if (aw.notiz) h += '<div class="info-box">Notiz: ' + esc(aw.notiz) + '</div>';
  if (!aw.exercises.length) {
    h += leerHtml('hantel', 'Noch keine Übung',
      'Freies Training: nimm unten die erste Übung auf. Werte vom letzten Mal werden automatisch vorbelegt.');
  }
  /* Der Auswahlmodus hängt an einem Index. Verschwindet die Übung unter ihm
     (ersetzt, entfernt, Training neu aufgebaut), fällt er zurück auf normal. */
  if (satzAuswahl && !aw.exercises[satzAuswahl.xi]) satzAuswahl = null;
  aw.exercises.forEach((wex, xi) => { h += renderExCard(wex, xi); });
  h += '<button class="btn btn-block btn-soft" data-action="wo-add-ex">+ Übung hinzufügen</button>';
  popSet = null;   // die Haken-Quittung gilt genau für diesen einen Aufbau
  return h;
}
/* Zeigt auf den nächsten offenen Arbeitssatz — damit der Blick nach dem
   Wegschauen sofort wieder die richtige Zeile findet. */
function naechsterOffenerSatz(wex) {
  for (let i = 0; i < wex.sets.length; i++) if (wex.sets[i].done !== true) return i;
  return -1;
}
function renderExCard(wex, xi) {
  const ex = exById(wex.exId);
  const naechst = naechsterOffenerSatz(wex);
  let h = '<div class="ex-card"><div class="ex-head">' + Icons.thumb(ex) +
    '<div class="ex-title">' + esc(ex.name) +
    '<div class="ex-title-row"><span class="tag" style="margin-right:0">' + esc(ex.mg) + '</span>' +
    (rehaExAktiv(ex) ? '<span class="tag tag-reha" style="margin-right:0">Reha · Stufe ' + Coach.rehaStufe(rehaWerte(ex.mg).stufe).nr + '</span>' : '') +
    (wex.ersetztFuer ? '<span class="tag tag-orange" style="margin-right:0">ersetzt ' + esc(exById(wex.ersetztFuer).name) + '</span>' : '') +
    '</div></div>' +
    '<button class="wo-icon-btn" data-action="wo-ex-menu" data-ex="' + xi + '" aria-label="Optionen für ' + esc(ex.name) + '">⋯</button>' +
    '</div>';
  if (ex.hint) h += '<div class="ex-hint">' + esc(ex.hint) + '</div>';
  if (wex.notiz) h += '<div class="mini-note">Notiz: ' + esc(wex.notiz) + '</div>';
  const dauerNotiz = (S.exerciseSettings[wex.exId] || {}).notiz;
  if (dauerNotiz) h += '<div class="mini-note">Übungs-Notiz: ' + esc(dauerNotiz) + '</div>';
  const last = lastSessionFor(wex.exId);
  if (last) {
    const ws = workingSets(last.wex);
    const pausen = ws.map(s => s.restSec).filter(x => x != null);
    const avg = pausen.length ? ' · ⌀ Pause ' + fmtMinSek(pausen.reduce((a, b) => a + b, 0) / pausen.length) : '';
    h += '<div class="lastmal">Letztes Mal (' + relTage(last.w.startedAt) + '): <b>' +
      ws.map(s => fmtKg(s.kg) + '×' + s.reps).join(' · ') + '</b>' + avg + '</div>';
  } else {
    h += '<div class="lastmal">Erste Einheit mit dieser Übung — such dir ein Gewicht, mit dem du die Wiederholungen sauber schaffst.</div>';
  }
  const prog = progressionFor(wex.exId, wex.repMin, wex.repMax);
  const warum = prog.grund ? '<button class="linklike linklike-sm" data-action="prog-warum" data-ex="' + xi + '">Warum?</button>' : '';
  if (prog.typ === 'neu') {
    h += '<div class="prog-row"><span class="prog-chip neutral">' + esc(prog.text) + '</span>' + warum + '</div>';
  } else {
    /* Der Deload bekommt eine eigene Farbe: er ist der einzige Vorschlag, der das
       Gewicht senkt — das darf nicht wie ein normales „halten" aussehen. */
    const cls = prog.typ === 'plus' ? ''
      : (prog.typ === 'deload' ? 'deload' : (prog.typ === 'halten' ? 'halten' : 'neutral'));
    h += '<div class="prog-row">' +
      '<button class="prog-chip ' + cls + '" data-action="prog-apply" data-ex="' + xi + '" data-kg="' + prog.kg + '"' + (prog.reps ? ' data-reps="' + prog.reps + '"' : '') + '>' + esc(prog.text) + '</button>' + warum + '</div>';
  }
  /* Rückmeldungs-Zeile: erscheint, sobald ein Arbeitssatz steht. Vorher gibt es
     nichts zu bewerten, hinterher ist sie der wichtigste Eintrag der Übung. */
  if (rehaExAktiv(ex) && wex.sets.some(s => s.done === true && !s.warmup)) {
    const wert = rehaHeuteWert(ex.mg, wex.exId);
    const a = wert == null ? null : Coach.rehaAmpel(wert, null);
    h += '<button class="reha-zeile' + (a ? ' ' + a.farbe : '') + '" data-action="reha-schmerz" data-mg="' + esc(ex.mg) + '" data-exid="' + esc(wex.exId) + '">' +
      (wert == null
        ? '<span class="reha-ampel leer"></span><span>Wie war das Knie? Schmerz 0–10 eintragen</span>'
        : '<span class="reha-ampel ' + a.farbe + '"></span><span>Schmerz ' + wert + '/10 — ' + esc(a.text) + '</span>') +
      '</button>';
  }
  h += '<div class="set-cols"><span>Satz</span><span>' + (ex.bw ? '+kg' : 'kg') + '</span><span>Wdh.</span><span>RPE</span><span aria-hidden="true">✓</span></div>';
  /* Im Auswahlmodus liegt über jeder Zeile eine unsichtbare Trefferfläche: der
     ganze Satz ist dann das Ziel, nicht nur ein 30-pt-Kreis. Die Felder darunter
     bleiben lesbar, sind aber stillgelegt — im Auswahlmodus wird nicht getippt. */
  const auswahl = (satzAuswahl && satzAuswahl.xi === xi) ? satzAuswahl.sets : null;
  let wNum = 0;
  wex.sets.forEach((s, si) => {
    const done = s.done === true;
    if (!s.warmup) wNum++;
    const label = s.warmup ? 'W' : String(wNum);
    const an = !!auswahl && auswahl.has(si);
    /* Abgehakte Sätze bleiben bearbeitbar — ein Vertipper muss korrigierbar
       sein, ohne den Satz zu löschen und neu anzulegen. Auch der Haken selbst
       bleibt aktiv: `checkSet()` kann Sätze längst wieder aufmachen, der Pfad
       war über die UI nur nicht erreichbar, weil der Button disabled war.
       Gesperrt wird nur im Auswahl-Modus, wo die Zeile eine Checkbox ist. */
    const dis = auswahl ? ' disabled' : '';
    const ds = ' data-ex="' + xi + '" data-set="' + si + '"';
    const pop = (popSet === xi + '-' + si) ? ' pop' : '';
    h += '<div class="set-row' + (done ? ' done' : '') + (si === naechst && !done && !auswahl ? ' next' : '') +
      (an ? ' set-sel-on' : '') + '">' +
      (auswahl
        ? '<span class="sel-dot sel-dot-num' + (an ? ' on' : '') + '" aria-hidden="true">' + label + '</span>'
        : '<button class="w-toggle' + (s.warmup ? ' on' : '') + '" data-action="set-optionen"' + ds + ' aria-label="Optionen für Satz ' + label + '">' + label + '</button>') +
      '<div class="num-group">' +
      '<button class="step-btn" data-action="step" data-field="kg" data-dir="-1"' + ds + dis + ' aria-label="Gewicht verringern">−</button>' +
      '<input class="num-input" inputmode="decimal" autocomplete="off" aria-label="Gewicht" placeholder="' + (ex.bw ? '+kg' : 'kg') + '" value="' + fmtInput(s.kg) + '" data-winput="kg"' + ds + dis + '>' +
      '<button class="step-btn" data-action="step" data-field="kg" data-dir="1"' + ds + dis + ' aria-label="Gewicht erhöhen">+</button></div>' +
      '<div class="num-group">' +
      '<button class="step-btn" data-action="step" data-field="reps" data-dir="-1"' + ds + dis + ' aria-label="Wiederholungen verringern">−</button>' +
      '<input class="num-input" inputmode="numeric" autocomplete="off" aria-label="Wiederholungen" placeholder="Wdh" value="' + (s.reps != null ? s.reps : '') + '" data-winput="reps"' + ds + dis + '>' +
      '<button class="step-btn" data-action="step" data-field="reps" data-dir="1"' + ds + dis + ' aria-label="Wiederholungen erhöhen">+</button></div>' +
      '<select class="rpe-sel' + (s.rpe ? ' set' : '') + '" data-wsel="rpe" aria-label="RPE"' + ds + dis + '>' +
      '<option value="">RPE</option>' +
      RPE_WERTE.map(r => '<option value="' + r + '"' + (String(s.rpe) === r ? ' selected' : '') + '>' + r.replace('.', ',') + '</option>').join('') +
      '</select>' +
      '<button class="check-btn' + (done ? ' done' : '') + pop + '" data-action="check"' + ds + dis + ' aria-label="Satz ' + label + ' abhaken">✓</button>' +
      setInfoLine(s) +
      (auswahl
        ? '<button class="set-sel-hit" data-action="satz-select"' + ds + ' role="checkbox" aria-checked="' + (an ? 'true' : 'false') +
          '" aria-label="Satz ' + label + ' auswählen"></button>'
        : '') +
      '</div>';
  });
  if (auswahl) {
    h += '<div class="set-tools set-tools-sel">' +
      '<span class="sel-count">' + auswahl.size + ' ausgewählt</span>' +
      '<button class="add-set-btn" data-action="satz-select-all" data-ex="' + xi + '">' +
      (auswahl.size === wex.sets.length ? 'Keine' : 'Alle') + '</button>' +
      '<button class="add-set-btn danger" data-action="satz-select-del" data-ex="' + xi + '">Entfernen</button>' +
      '<button class="add-set-btn muted" data-action="satz-select-mode" data-ex="' + xi + '">Fertig</button></div>';
  } else {
    h += '<div class="set-tools"><button class="add-set-btn" data-action="set-add" data-ex="' + xi + '">+ Satz</button>' +
      '<button class="add-set-btn muted" data-action="set-del" data-ex="' + xi + '">− Satz</button>' +
      (wex.sets.length > 1 ? '<button class="add-set-btn muted" data-action="satz-select-mode" data-ex="' + xi + '">Auswählen…</button>' : '') +
      '</div>';
  }
  return h + '</div>';
}
function setInfoLine(s) {
  const bits = [];
  if (s.pr) bits.push('<span class="badge-pr">' + ({ gewicht: 'Gewichts-PR', e1rm: 'e1RM-PR', wdh: 'Wdh.-PR' })[s.pr] + '</span>');
  if (s.restSec != null) bits.push('Pause ' + fmtMinSek(s.restSec));
  return bits.length ? '<div class="pause-info">' + bits.join(' · ') + '</div>' : '';
}

/* --- Reihenfolge der Übungen im laufenden Training ---
 * Welche Übung wann drankommt, steht beim Start selten fest: die Bank ist besetzt,
 * das Rack wird frei. Verschoben wird deshalb mitten im Training. Was dabei
 * herauskommt, ist Teil des Trainings — und landet über den Plan-Abgleich am Ende
 * im Plan (planUpdateDiff vergleicht die Reihenfolge mit).
 * Alles, was auf einen Übungs-Index zeigt (laufende Pause, Satz-Auswahl), zieht mit. */
function woExVerschieben(xi, dir) {
  const aw = S.activeWorkout;
  if (!aw) return false;
  const zi = xi + dir;
  if (!aw.exercises[xi] || !aw.exercises[zi]) return false;
  const tmp = aw.exercises[xi];
  aw.exercises[xi] = aw.exercises[zi];
  aw.exercises[zi] = tmp;
  const tausch = i => (i === xi ? zi : (i === zi ? xi : i));
  if (aw.rest && aw.rest.exIdx >= 0) aw.rest.exIdx = tausch(aw.rest.exIdx);
  if (satzAuswahl) satzAuswahl.xi = tausch(satzAuswahl.xi);
  save();
  return true;
}
function reihenfolgeSheetHtml() {
  const aw = S.activeWorkout;
  let h = '<div class="sheet-title">Reihenfolge</div>' +
    '<div class="sheet-sub">Sortiere die Übungen so, wie du heute wirklich trainierst. Abgehakte Sätze bleiben dabei erhalten; am Ende fragt Kraftlog, ob der Plan die neue Reihenfolge übernehmen soll.</div>';
  if (!aw || !aw.exercises.length) {
    return h + '<div class="card"><div class="li-sub li-sub-wrap">Noch keine Übung im Training.</div></div>';
  }
  const n = aw.exercises.length;
  h += '<div class="card ord-liste">';
  aw.exercises.forEach((wex, xi) => {
    const name = exById(wex.exId).name;
    const fertig = wex.sets.filter(s => s.done === true).length;
    h += '<div class="ord-row">' +
      '<span class="ord-nr" aria-hidden="true">' + (xi + 1) + '</span>' +
      '<div class="li-main"><div class="li-title li-title-sm">' + esc(name) + '</div>' +
      '<div class="li-sub">' + wex.sets.length + ' ' + (wex.sets.length === 1 ? 'Satz' : 'Sätze') +
      (fertig ? ' · ' + fertig + ' abgehakt' : '') + '</div></div>' +
      '<button class="step-btn" data-action="wo-ex-move" data-ex="' + xi + '" data-dir="-1"' +
      (xi === 0 ? ' disabled' : '') + ' aria-label="' + esc(name) + ' nach oben">▲</button>' +
      '<button class="step-btn" data-action="wo-ex-move" data-ex="' + xi + '" data-dir="1"' +
      (xi === n - 1 ? ' disabled' : '') + ' aria-label="' + esc(name) + ' nach unten">▼</button>' +
      '</div>';
  });
  return h + '</div><div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Fertig</button></div>';
}

/* Template-Übung in einheitliche Form bringen: sets = Liste von { reps } (exaktes Ziel je Satz).
   Migriert die alte Form { sets:N, repMin, repMax } idempotent. */
function normalizeTplExercise(it) {
  if (Array.isArray(it.sets)) {
    it.sets = it.sets.map(s => {
      const reps = (s && s.reps > 0) ? Math.round(s.reps) : null;
      const kg = (s && s.kg > 0) ? Math.round(s.kg * 100) / 100 : null;
      /* Pausenziel je Satz (optional). Nicht zu verwechseln mit dem restSec am
         Trainingssatz — das ist die GEMESSENE Pause. Hier ist es die Vorgabe. */
      const rest = (s && s.restSec > 0) ? Math.round(s.restSec) : null;
      const o = (s && s.warmup)
        ? { warmup: true, kg: (kg != null ? kg : 0), reps }
        : ((kg != null) ? { reps, kg } : { reps });
      if (rest != null) o.restSec = rest;
      return o;
    });
  } else {
    const n = Math.max(1, Math.min(20, parseInt(it.sets, 10) || 3));
    const ziel = it.repMax || it.repMin || null;
    it.sets = Array.from({ length: n }, () => ({ reps: ziel ? Math.round(ziel) : null }));
  }
  if (!it.sets.length) it.sets = [{ reps: null }];
  it.restSec = (it.restSec > 0) ? Math.round(it.restSec) : null;
  delete it.repMin; delete it.repMax;
  return it;
}

/* Vorgabewerte für einen Arbeitssatz: Plan-Ziel (z) gegen den entsprechenden
   Satz der letzten Einheit (ref).

   Kernregel: Die Vorgabe darf NIE unter dem liegen, was zuletzt schon stand.
   Sonst sieht ein Rückschritt wie ein Plansoll aus — Plan 8/8/5, letztes Mal
   8/8/6 gemacht, im Feld stünde wieder 5. Wer dann 6 schafft, hält das für
   Fortschritt, obwohl es exakt der Vorwoche entspricht. Das Plan-Ziel ist eine
   Untergrenze, kein Deckel.

   Wiederholungen werden nur übernommen, wenn sie bei mindestens demselben
   Gewicht zustande kamen: mehr Wdh. bei weniger Last sind kein Fortschritt und
   als Vorgabe für ein schwereres Gewicht schlicht falsch. */
function satzVorgabe(z, ref) {
  let kg = z.kg != null ? z.kg : (ref ? ref.kg : null);
  if (z.kg != null && ref && ref.kg != null && ref.kg > z.kg) kg = ref.kg;
  let reps = z.reps != null ? z.reps : (ref ? ref.reps : null);
  if (z.reps != null && ref && ref.reps != null && ref.reps > z.reps) {
    const gleicheLast = (ref.kg == null && kg == null) ||
      (ref.kg != null && kg != null && ref.kg >= kg);
    if (gleicheLast) reps = ref.reps;
  }
  return { kg, reps };
}

/* Coach-Vorschlag auf die offenen Arbeitssätze schreiben.

   Das Gewicht gilt allen Sätzen — das Wiederholungsziel aber nur dem
   TOP-SATZ. Seit dem Coach-Umbau ist der Wiederholungsabfall über die Sätze
   eine eigene Achse: „62,5 kg × 6 Wdh." heißt „6 im ersten Satz", nicht
   „6 in jedem Satz". Vorher wurde das Ziel in alle Sätze geschrieben, was aus
   einer Vorbelegung 8/8/6 bei einem Halte-Vorschlag ein 5/5/5 machen konnte —
   also genau der Rückschritt, den die Vorbelegung gerade verhindern soll.

   Die hinteren Sätze behalten deshalb ihre Vorbelegung, gedeckelt auf das
   Ziel: kein späterer Satz darf über dem ersten stehen (bei gleicher Last ist
   das physiologisch unplausibel), aber niedriger darf er sein. Leere Felder
   bekommen das Ziel als Startwert. */
function vorschlagAufSaetze(sets, kg, reps) {
  let erster = true;
  sets.forEach(s => {
    if (s.done === true || s.warmup) return;
    s.kg = kg;
    if (!reps) return;
    if (erster) { s.reps = reps; erster = false; }
    else if (s.reps == null || s.reps > reps) s.reps = reps;
  });
  return sets;
}

/* --- Workout-State-Machine --- */
/* tplSets: Liste von { reps } (aus Vorlage) ODER eine Zahl (freies Training / Übung nachträglich). */
function buildWoExercise(exId, tplSets, restSec) {
  const ziele = Array.isArray(tplSets)
    ? tplSets
    : Array.from({ length: tplSets || 3 }, () => ({ reps: null }));
  const last = lastSessionFor(exId);
  const lastWs = last ? workingSets(last.wex) : [];
  const repWerte = ziele.filter(z => !z.warmup).map(z => z.reps).filter(r => r != null);
  let wi = 0; // Zeiger auf die Arbeitssätze der letzten Einheit (Aufwärmsätze überspringen)
  /* restZiel = Pausen-VORGABE aus dem Plan. Bewusst ein eigenes Feld:
     `restSec` am Trainingssatz ist die GEMESSENE Pause und wird beim Abhaken
     überschrieben — läge beides auf demselben Feld, wäre die Einstellung nach
     dem ersten Satz weg. */
  const sets = ziele.map(z => {
    const ziel = (z.restSec > 0) ? Math.round(z.restSec) : null;
    if (z.warmup) {
      return { kg: z.kg != null ? z.kg : null, reps: z.reps != null ? z.reps : null, rpe: null, warmup: true, done: false, doneAt: null, restSec: null, restZiel: ziel };
    }
    const ref = lastWs[wi] || lastWs[lastWs.length - 1] || null;
    wi++;
    const v = satzVorgabe(z, ref);
    return {
      kg: v.kg, reps: v.reps,
      rpe: null, warmup: false, done: false, doneAt: null, restSec: null, restZiel: ziel
    };
  });
  return {
    exId,
    repMin: repWerte.length ? Math.min(...repWerte) : null,
    repMax: repWerte.length ? Math.max(...repWerte) : null,
    restSec: restSec || null, notiz: null, sets
  };
}
/* Entfernt Sätze aus einer Übung des laufenden Trainings und zieht den
   Pausen-Zeiger mit — sonst landet die gemessene Pause im falschen Satz.
   Nimmt eine Liste von Indizes und arbeitet sie von hinten nach vorn ab, damit
   sich mehrere Streichungen nicht gegenseitig verschieben. Bleibt kein Satz
   übrig, verschwindet die Übung — eine Übung ohne Sätze ist keine Übung.
   Gibt die Zahl der tatsächlich entfernten Sätze zurück. */
function satzEntfernen(xi, indizes) {
  const aw = S.activeWorkout;
  if (!aw) return 0;
  const wex = aw.exercises[xi];
  if (!wex) return 0;
  const idx = [...new Set(indizes)]
    .filter(i => Number.isInteger(i) && i >= 0 && i < wex.sets.length)
    .sort((a, b) => b - a);
  for (const i of idx) {
    wex.sets.splice(i, 1);
    if (aw.rest && aw.rest.exIdx === xi) {
      if (aw.rest.setIdx === i) { aw.rest = null; pauseWachEnde(); }
      else if (aw.rest.setIdx > i) aw.rest.setIdx--;
    }
  }
  if (idx.length && !wex.sets.length) {
    aw.exercises.splice(xi, 1);
    if (aw.rest) {
      if (aw.rest.exIdx === xi) { aw.rest = null; pauseWachEnde(); }
      else if (aw.rest.exIdx > xi) aw.rest.exIdx--;
    }
  }
  return idx.length;
}
function startWorkout(tplId) {
  if (S.activeWorkout) { showToast('Es läuft bereits ein Training'); return; }
  const tpl = tplId ? S.templates.find(t => t.id === tplId) : null;
  const now = Date.now();
  const aw = { id: 'w-' + now, templateId: tpl ? tpl.id : null, name: tpl ? tpl.name : 'Freies Training', startedAt: now, notiz: '', exercises: [], rest: null };
  if (tpl) tpl.exercises.forEach(it => aw.exercises.push(buildWoExercise(it.exId, it.sets, it.restSec)));
  S.activeWorkout = aw;
  trainSub = null;
  tab = 'start';
  zeigeWorkout = true;
  save();
  render();
  window.scrollTo(0, 0);
}
function checkSet(xi, si) {
  const aw = S.activeWorkout;
  if (!aw) return;
  const wex = aw.exercises[xi];
  const s = wex.sets[si];
  if (s.done === true) {          // wieder aufmachen
    s.done = false;
    s.doneAt = null;
    if (aw.rest && aw.rest.exIdx === xi && aw.rest.setIdx === si) { aw.rest = null; pauseWachEnde(); }
    delete s.pr;
    save();
    render();
    return;
  }
  const ex = exById(wex.exId);
  if (s.reps == null || s.reps <= 0) { showToast('Bitte Wiederholungen eintragen'); return; }
  if (s.kg == null) {
    if (ex.bw) s.kg = 0;
    else { showToast('Bitte Gewicht eintragen'); return; }
  }
  Signal.unlock();               // Audio in dieser Nutzer-Geste entsperren (iOS)
  notifyErlaubnisAnfragen();     // Benachrichtigungs-Erlaubnis ebenfalls in der Geste
  const now = Date.now();
  /* Laufende Pause finalisieren (Fallback: bis zum nächsten ✓, enthält dann die Satzausführung) */
  if (aw.rest) {
    const rEx = aw.exercises[aw.rest.exIdx];
    const rs = rEx && rEx.sets[aw.rest.setIdx];
    if (rs && rs.restSec == null) rs.restSec = Math.round((now - aw.rest.startedAt) / 1000);
  }
  /* PR-Check gegen Historie + frühere Sätze dieses Workouts (gleiche Übung) */
  const earlier = [];
  aw.exercises.forEach((we2, x2) => {
    if (we2.exId !== wex.exId) return;
    we2.sets.forEach((s2, si2) => { if (s2.done === true && !(x2 === xi && si2 === si)) earlier.push(s2); });
  });
  const bests = prBests(wex.exId, earlier);
  s.done = true;
  s.doneAt = now;
  popSet = xi + '-' + si;          // Haken quittiert den Treffer beim nächsten Aufbau
  const pr = prGegen(bests, s);
  if (pr) {
    s.pr = pr.typ;
    showToast(pr.text, 'pr');
    /* Erst die Meldung lesbar, dann die Feier — nicht beides auf einmal */
    setTimeout(burstConfetti, 120);
  }
  /* Pause starten — was dieser Satz vorgibt, entscheidet restZielFuerSatz():
     eigenes Pausenziel, sonst Übungs-/Coach-Wert, bei Aufwärmsätzen nur beim
     letzten des Blocks. Gibt es kein Ziel (Rampensatz mitten im Aufwärmen),
     läuft bewusst kein Timer — wer doch einen will: „Pause starten" in der
     Timer-Leiste. */
  const zielSec = restZielFuerSatz(wex, si);
  if (zielSec == null) {
    if (aw.rest) { aw.rest = null; pauseWachEnde(); }   // laufende Pause samt Weckruf beenden
  } else {
    aw.rest = { startedAt: now, targetSec: zielSec, exIdx: xi, setIdx: si, signaled: false, manuell: false };
    pauseWach();   // Wake Lock (Standard) bzw. stille Schleife (Opt-in "Signal bei gesperrtem Handy")
    pushPlanen(aw.rest.targetSec);   // Weckruf über den Worker (falls Pausen-Push aktiv)
  }
  save();
  render();
  /* War das der letzte offene Arbeitssatz einer Reha-Übung, fragt der Modus
     genau einmal nach dem Schmerzwert — direkt nach der Übung, weil die
     Erinnerung daran schon eine Übung später unbrauchbar ist. Nur, wenn für
     heute noch nichts eingetragen wurde; korrigieren geht über die Zeile in
     der Übungskarte. */
  if (rehaExAktiv(ex) && rehaHeuteWert(ex.mg, wex.exId) == null &&
      !wex.sets.some(s2 => s2.done !== true && !s2.warmup)) {
    setTimeout(() => rehaSchmerzSheet(ex.mg, wex.exId), 350);
  }
}

/* --- Pausenrad ---------------------------------------------------------
   Zwei gerastete Spalten (Minuten, Sekunden in 5er-Schritten). Der Wert ist die
   Zahl, die unter dem Band steht: Position = Index × Zeilenhöhe. Es hängt bewusst
   kein Scroll-Listener daran — gelesen wird erst beim Start, und das Band ist
   die Anzeige. Damit bleibt die Event-Delegation das einzige Muster. */
const RAD_ITEM = 44;          // Zeilenhöhe, muss zu .rad-item in style.css passen
const RAD_SEK_SCHRITT = 5;    // Sekundenraster — feiner braucht eine Satzpause nicht
const RAD_MIN_MAX = 15;

function radSpalteHtml(name, werte, label) {
  return '<div class="rad" data-rad="' + name + '" role="listbox" aria-label="' + label + '">' +
    '<div class="rad-pad"></div>' +
    werte.map((w, i) => '<button class="rad-item" role="option" data-action="rad-pick" data-i="' + i + '">' + w + '</button>').join('') +
    '<div class="rad-pad"></div></div>';
}
function radHtml() {
  const min = [];
  for (let i = 0; i <= RAD_MIN_MAX; i++) min.push(i);
  const sek = [];
  for (let i = 0; i < 60; i += RAD_SEK_SCHRITT) sek.push(String(i).padStart(2, '0'));
  return '<div class="rad-wrap"><div class="rad-band" aria-hidden="true"></div>' +
    radSpalteHtml('min', min, 'Minuten') + '<span class="rad-unit">min</span>' +
    radSpalteHtml('sek', sek, 'Sekunden') + '<span class="rad-unit">s</span></div>';
}
/* Schreibt die gerade eingestellte Dauer in den Startknopf — man sieht beim
   Rollen, was man bekommt, statt es aus zwei Spalten zusammenrechnen zu müssen. */
function radWertAnzeigen() {
  const w = $('#rad-wert');
  if (w) w.textContent = fmtMinSek(radDauerLesen());
}
function radPositionSetzen(minIdx, sekIdx) {
  /* Erst im nächsten Frame steht das Layout des frisch eingefügten Sheets */
  requestAnimationFrame(() => {
    const m = document.querySelector('.rad[data-rad="min"]');
    const s = document.querySelector('.rad[data-rad="sek"]');
    if (m) m.scrollTop = Math.max(0, Math.min(RAD_MIN_MAX, minIdx)) * RAD_ITEM;
    if (s) s.scrollTop = Math.max(0, Math.min(60 / RAD_SEK_SCHRITT - 1, sekIdx)) * RAD_ITEM;
    radWertAnzeigen();
  });
}
function radDauerLesen() {
  const m = document.querySelector('.rad[data-rad="min"]');
  const s = document.querySelector('.rad[data-rad="sek"]');
  if (!m || !s) return 0;
  const min = Math.round(m.scrollTop / RAD_ITEM);
  const sek = Math.round(s.scrollTop / RAD_ITEM) * RAD_SEK_SCHRITT;
  return min * 60 + sek;
}

/* --- Freie Pause: Timer starten, ohne einen Satz abzuhaken ---
   exIdx/setIdx bleiben -1: es gibt keinen Satz, dem diese Pause zugerechnet wird.
   Alle Verbraucher (endRest, checkSet) sind gegen fehlende Indizes abgesichert. */
function startRest(sec, manuell) {
  const aw = S.activeWorkout;
  if (!aw) return;
  sec = Math.max(10, Math.min(3600, Math.round(sec)));
  closeSheet();
  Signal.unlock();               // Audio in dieser Nutzer-Geste entsperren (iOS)
  notifyErlaubnisAnfragen();
  if (aw.rest) pushStorno();     // eine bereits geplante Meldung gilt nicht mehr
  aw.rest = { startedAt: Date.now(), targetSec: sec, exIdx: -1, setIdx: -1, signaled: false, manuell: !!manuell };
  pauseWach();
  pushPlanen(sec);
  save();
  render();
}
function finishWorkout() {
  const aw = S.activeWorkout;
  if (!aw) return;
  const cleaned = [];
  for (const wex of aw.exercises) {
    const sets = wex.sets.filter(s => s.done === true).map(s => ({
      kg: s.kg, reps: s.reps, rpe: s.rpe || null, warmup: !!s.warmup, doneAt: s.doneAt,
      restSec: s.restSec != null ? s.restSec : null
    }));
    if (sets.length) cleaned.push({
      exId: wex.exId, repMin: wex.repMin, repMax: wex.repMax, notiz: wex.notiz || '',
      ersetztFuer: wex.ersetztFuer || null,   // wofür diese Übung im Training eingesprungen ist
      sets
    });
  }
  /* Dauer deckeln: wird ein liegengebliebenes Training erst Stunden später beendet,
     zählt der letzte abgehakte Satz (+ Puffer) als Ende, nicht "jetzt". */
  let ende = Date.now();
  let letzterSatz = 0;
  cleaned.forEach(we => we.sets.forEach(s => { if (s.doneAt > letzterSatz) letzterSatz = s.doneAt; }));
  if (letzterSatz && ende - letzterSatz > 30 * 60 * 1000) ende = letzterSatz;
  const w = { id: aw.id, templateId: aw.templateId, name: aw.name, startedAt: aw.startedAt, finishedAt: ende, notiz: aw.notiz || '', exercises: cleaned };
  S.workouts.push(w);
  S.workouts.sort((a, b) => a.startedAt - b.startedAt);
  S.activeWorkout = null;
  satzAuswahl = null;
  pauseWachEnde();
  save();
  closeSheet();
  showToast('Training gespeichert');
  gokuFeierId = w.id;   // Goku feiert in der Detailansicht des frisch beendeten Trainings
  tab = 'verlauf';
  verlaufSub = { id: w.id };
  render();
  window.scrollTo(0, 0);
  if (stravaVerbunden() && S.settings.strava.autoPost !== false) stravaPosteWorkout(w.id, true);
  /* Weicht das Training vom Plan ab? → fragen, ob der Plan aktualisiert werden soll */
  const tpl = w.templateId ? S.templates.find(t => t.id === w.templateId) : null;
  if (tpl) {
    const diff = planUpdateDiff(tpl, w);
    if (diff.struktur || diff.werte) {
      planUpdate = { tplId: tpl.id, workoutId: w.id };
      const punkte = planAbweichungen(tpl, w, diff);
      openSheet('<div class="sheet-title">Plan „' + esc(tpl.name) + '" aktualisieren?</div>' +
        '<div class="sheet-sub">Dein Training weicht ab. Der Plan bleibt unverändert, wenn du nichts übernimmst.</div>' +
        '<div class="card diff-liste">' + punkte.map(p =>
          '<div class="diff-zeile"><span class="diff-punkt" aria-hidden="true"></span><span>' + p + '</span></div>').join('') + '</div>' +
        '<div class="sheet-actions">' +
        (diff.struktur ? '<button class="btn btn-primary" data-action="pu-struktur">Struktur &amp; Werte übernehmen</button>' : '') +
        '<button class="btn' + (diff.struktur ? '' : ' btn-primary') + '" data-action="pu-werte">Nur Wdh. und Gewichte übernehmen</button>' +
        '<button class="btn" data-action="pu-keep">Plan so lassen</button></div>');
    }
  }
  swNeuladenWennBereit();   // während des Trainings vorgemerktes Update jetzt einspielen
}
function discardWorkout() {
  S.activeWorkout = null;
  satzAuswahl = null;
  pauseWachEnde();
  save();
  closeSheet();
  render();
  showToast('Training verworfen');
  swNeuladenWennBereit();   // während des Trainings vorgemerktes Update jetzt einspielen
}

/* --- Plan nach dem Training aktualisieren --- */
let planUpdate = null;
function planUpdateDiff(tpl, w) {
  const tplStruct = tpl.exercises.map(it => it.exId + ':' + it.sets.filter(s => !s.warmup).length).join('|');
  const woStruct = w.exercises.map(e => e.exId + ':' + e.sets.filter(s => !s.warmup).length).join('|');
  const struktur = tplStruct !== woStruct;
  let werte = false;
  tpl.exercises.forEach(it => {
    const wex = w.exercises.find(e => e.exId === it.exId);
    if (!wex) return;
    const arbeit = wex.sets.filter(s => !s.warmup);
    let ai = 0;
    it.sets.forEach(st => {
      if (st.warmup) return;
      const s2 = arbeit[ai++];
      if (!s2) return;
      if (st.reps != null && s2.reps !== st.reps) werte = true;
      if (st.kg != null && s2.kg !== st.kg) werte = true;
    });
  });
  return { struktur, werte };
}
/* Was genau weicht ab? Der Dialog soll den Unterschied benennen, nicht andeuten —
   sonst entscheidet man blind, ob der Plan überschrieben wird. */
function planAbweichungen(tpl, w, diff) {
  const punkte = [];
  const ersetzt = w.exercises.filter(e => e.ersetztFuer && exById(e.ersetztFuer));
  ersetzt.forEach(e => punkte.push('<b>' + esc(exById(e.ersetztFuer).name) + '</b> ersetzt durch <b>' +
    esc(exById(e.exId).name) + '</b>'));
  const tplIds = tpl.exercises.map(it => it.exId);
  const woIds = w.exercises.map(e => e.exId);
  woIds.forEach(id => {
    if (tplIds.indexOf(id) < 0 && !ersetzt.some(e => e.exId === id)) {
      punkte.push('<b>' + esc(exById(id).name) + '</b> zusätzlich trainiert');
    }
  });
  tplIds.forEach(id => {
    if (woIds.indexOf(id) < 0 && !ersetzt.some(e => e.ersetztFuer === id)) {
      punkte.push('<b>' + esc(exById(id).name) + '</b> heute nicht trainiert');
    }
  });
  /* Reihenfolge: nur die Übungen vergleichen, die auf beiden Seiten vorkommen —
     sonst meldet jedes Weglassen und jede Zusatzübung zusätzlich „umsortiert". */
  const gemeinsamTpl = tplIds.filter(id => woIds.indexOf(id) >= 0);
  const gemeinsamWo = woIds.filter(id => tplIds.indexOf(id) >= 0);
  if (gemeinsamTpl.length > 1 && gemeinsamTpl.join('|') !== gemeinsamWo.join('|')) {
    punkte.push('Reihenfolge geändert — heute: ' +
      gemeinsamWo.map(id => '<b>' + esc(exById(id).name) + '</b>').join(' → '));
  }
  /* Satzanzahl je Übung, die im Plan und im Training vorkommt */
  tpl.exercises.forEach(it => {
    const wex = w.exercises.find(e => e.exId === it.exId);
    if (!wex) return;
    const soll = it.sets.filter(s => !s.warmup).length;
    const ist = wex.sets.filter(s => !s.warmup).length;
    if (soll !== ist) punkte.push('<b>' + esc(exById(it.exId).name) + '</b> — ' + ist + ' statt ' + soll + ' Arbeitssätze');
  });
  if (diff.werte) punkte.push('Wiederholungen bzw. Gewichte weichen vom Plan ab');
  if (!punkte.length) punkte.push('Kleinere Abweichungen gegenüber dem Plan');
  return punkte;
}
/* Wdh. (und kg nur dort, wo der Plan bereits explizite Gewichte hatte) übernehmen */
function tplWerteUpdate(tpl, w) {
  tpl.exercises.forEach(it => {
    const wex = w.exercises.find(e => e.exId === it.exId);
    if (!wex) return;
    const arbeit = wex.sets.filter(s => !s.warmup);
    let ai = 0;
    it.sets.forEach(st => {
      if (st.warmup) return;
      const s2 = arbeit[ai++];
      if (!s2) return;
      st.reps = s2.reps;
      if (st.kg != null) st.kg = s2.kg;
    });
  });
}
/* Übungen, Reihenfolge und Sätze wie im heutigen Training; Pausen-Overrides bleiben erhalten */
function tplStrukturUpdate(tpl, w) {
  tpl.exercises = w.exercises.map(wex => {
    const alt = tpl.exercises.find(e => e.exId === wex.exId);
    return {
      exId: wex.exId,
      restSec: alt ? alt.restSec : null,
      /* Das Pausenziel je Satz muss mitwandern — sonst löscht ein Plan-Abgleich
         nach dem Training genau die Werte, die man vorher eingestellt hat.
         Quelle ist restZiel (die Vorgabe), nicht restSec (die gemessene Pause). */
      sets: wex.sets.map(s => {
        const o = s.warmup
          ? { warmup: true, kg: s.kg != null ? s.kg : 0, reps: s.reps }
          : { reps: s.reps };
        if (s.restZiel > 0) o.restSec = Math.round(s.restZiel);
        return o;
      })
    };
  });
}

/* --- Wachhalten während der Pause ---
 * Standard (musikfreundlich): Screen-Wake-Lock — der Bildschirm bleibt an, die App
 * läuft sichtbar weiter, Musik anderer Apps wird nicht angetastet.
 * Opt-in "Signal bei gesperrtem Handy": stille Tonspur hält die App auch gesperrt
 * wach — unterbricht dafür die Musik-Wiedergabe (iOS-Einschränkung). */
let wakeLock = null;
async function wakeLockAn() {
  try {
    if ('wakeLock' in navigator && !wakeLock && !document.hidden) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { }
}
function wakeLockAus() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { }
}
function pauseWach() {
  wakeLockAn();
  if (S.settings.sound && S.settings.hintergrundSignal === true) Signal.restStart();
}
function pauseWachEnde() {
  Signal.restStop();
  wakeLockAus();
  pushStorno();
}

/* --- Pausen-Push: Weckruf über den Worker (klingelt auch gesperrt, Musik läuft weiter) --- */
function pushAktiv() {
  const p = S.settings.push;
  return !!(p && p.aktiv && p.sub && S.settings.strava.workerUrl);
}
function pushPlanen(delaySec) {
  if (!pushAktiv() || !navigator.onLine || !(delaySec > 0)) return;
  const koerper = { subscription: S.settings.push.sub, delaySec: Math.round(delaySec) };
  const info = pushMeldung();
  if (info) { koerper.titel = info.titel; koerper.text = info.text; }
  workerFetch('/push/planen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(koerper)
  }).catch(() => { });
}
/* Inhalt der Push-Meldung (Opt-in): nächster offener Satz nach der laufenden
 * Pause — der Übungsname verlässt dafür das Gerät (verschlüsselt zum Push-Dienst). */
function pushMeldung() {
  if (S.settings.pushInhalt !== true) return null;
  const aw = S.activeWorkout;
  if (!aw || !aw.rest) return null;
  let treffer = null;
  const suche = (abEx, abSet) => {
    for (let x = abEx; x < aw.exercises.length && !treffer; x++) {
      const sets = aw.exercises[x].sets;
      for (let i = (x === abEx ? abSet : 0); i < sets.length; i++) {
        if (sets[i].done !== true) { treffer = { x, i }; break; }
      }
    }
  };
  suche(aw.rest.exIdx, aw.rest.setIdx + 1);
  if (!treffer) suche(0, 0);
  if (!treffer) return null;
  const wex = aw.exercises[treffer.x];
  const name = exById(wex.exId).name;
  return {
    titel: 'Pause vorbei',
    /* Kürzen: Benachrichtigungstexte sind kurz, und der verschlüsselte
     * Push-Payload darf 4096 Bytes nie erreichen (extrem lange Übungsnamen) */
    text: (wex.sets[treffer.i].warmup ? name + ' — Aufwärmsatz' : name + ' — Satz ' + (treffer.i + 1)).slice(0, 120)
  };
}
function pushStorno() {
  if (!pushAktiv()) return;
  workerFetch('/push/stornieren', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: S.settings.push.sub })
  }).catch(() => { });
}
function b64urlZuBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/* --- Benachrichtigung am Pausenende --- */
function notifyErlaubnisAnfragen() {
  if (S.settings.benachrichtigung === false) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) { }
  }
}
function einfacheNotification(opts) {
  try { new Notification('Kraftlog', opts); } catch (e) { }
}
function notifyPause() {
  if (S.settings.benachrichtigung === false) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: 'Pause vorbei — weiter geht\'s!', tag: 'kraftlog-pause' };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.showNotification) reg.showNotification('Kraftlog', opts);
      else einfacheNotification(opts);
    }).catch(() => einfacheNotification(opts));
  } else {
    einfacheNotification(opts);
  }
}

/* --- Pausen-Timer (rein timestampbasiert) --- */
function renderTimerBar() {
  const bar = $('#timer-bar');
  const rs = $('#wo-ruecksprung');
  const aw = S.activeWorkout;
  /* Läuft eine Pause, zeigt die Leiste sie überall. Läuft keine, zeigt sie in der
     Trainingsansicht die Schnellwahl — so wohnt die Pausensteuerung immer am selben Ort. */
  const inTrainingsansicht = !!aw && tab === 'start' && zeigeWorkout;
  if (!aw || (!aw.rest && !inTrainingsansicht)) {
    bar.classList.add('hidden');
    bar.classList.remove('idle', 'over');
    if (rs) rs.style.bottom = 'calc(64px + env(safe-area-inset-bottom))';
    return;
  }
  if (!aw.rest) {
    bar.classList.remove('hidden', 'over');
    bar.classList.add('idle');
    const d = $('#timer-idle-dauer');
    if (d) d.textContent = fmtMinSek(S.settings.letztePauseFrei || 150);
    if (rs) rs.style.bottom = 'calc(64px + env(safe-area-inset-bottom))';
    return;
  }
  bar.classList.remove('hidden', 'idle');
  if (rs) rs.style.bottom = 'calc(132px + env(safe-area-inset-bottom))';
  const el = (Date.now() - aw.rest.startedAt) / 1000;
  const t = aw.rest.targetSec;
  const over = el >= t;
  /* Der Puls am Pausenende soll genau einmal laufen, nicht bei jedem Tick */
  const warOver = bar.classList.contains('over');
  bar.classList.toggle('over', over);
  if (over && !warOver && magBewegung()) {
    const row = bar.querySelector('.timer-row');
    if (row) { row.style.animation = 'none'; void row.offsetWidth; row.style.animation = ''; }
  }
  /* scaleX statt width: keine Layout-Neuberechnung, obwohl der Balken 2×/s tickt.
     Am Anfang einer Pause ohne Übergang setzen, sonst kurbelt der Balken zurück. */
  const p = $('#timer-progress');
  const anteil = Math.min(1, el / t);
  if (anteil < 0.04) { p.style.transition = 'none'; p.style.transform = 'scaleX(' + anteil.toFixed(4) + ')'; void p.offsetWidth; p.style.transition = ''; }
  else p.style.transform = 'scaleX(' + anteil.toFixed(4) + ')';
  /* Die Trainingsdauer steht schon im Workout-Kopf bzw. auf dem Rücksprung-Knopf —
     hier wäre sie doppelt und würde die Unterzeile in den Umbruch treiben. */
  const label = aw.rest.manuell ? 'Frei' : 'Ziel';
  $('#timer-text').innerHTML = over
    ? 'Pause vorbei <small>+' + fmtMinSek(el - t) + '</small>'
    : fmtMinSek(t - el) + ' <small>' + label + ' ' + fmtMinSek(t) + '</small>';
  if (over && !aw.rest.signaled) {
    aw.rest.signaled = true;
    save();
    if (S.settings.sound) {
      /* Gong als Pausenende-Signal; darf er nicht spielen, springt die synthetische
         Glocke ein (Vordergrund per WebAudio, Hintergrund per Audio-Element). */
      Signal.gong(() => { Signal.beep(); Signal.beepLaut(); });
    }
    if (S.settings.vibration) Signal.vibrate();
    notifyPause();
    pauseWachEnde();     // stille Schleife beenden — Signal ist raus
  }
}
function endRest(exakt) {
  const aw = S.activeWorkout;
  if (!aw || !aw.rest) return;
  if (exakt) {
    const rEx = aw.exercises[aw.rest.exIdx];
    const rs = rEx && rEx.sets[aw.rest.setIdx];
    if (rs && rs.restSec == null) rs.restSec = Math.round((Date.now() - aw.rest.startedAt) / 1000);
  }
  aw.rest = null;
  pauseWachEnde();
  save();
  render();
}

/* --- Pläne (Vorlagen) --- */
function renderPlaene() {
  const auswahl = planAuswahl;
  let h = '<button class="back-btn" data-action="train-home">‹ Training</button>';
  h += '<div style="display:flex;align-items:flex-start;gap:10px">' +
    '<h1 class="view-title" style="flex:1">Trainingspläne</h1>' +
    (S.templates.length ? '<button class="btn btn-small' + (auswahl ? ' btn-primary' : '') + ' mt-s" data-action="tpl-select-mode">' + (auswahl ? 'Fertig' : 'Auswählen') + '</button>' : '') +
    '</div>';
  if (!S.templates.length) h += '<div class="empty"><p>Noch keine Pläne.<br>Erstelle z. B. „Push A" mit deinen Übungen und Ziel-Wiederholungsbereichen.</p></div>';
  if (auswahl) {
    h += '<div class="mini-note mini-note-lead">' + auswahl.size + ' ausgewählt · ' +
      '<button class="linklike" data-action="tpl-select-all">' + (auswahl.size === S.templates.length ? 'Keine' : 'Alle') + ' auswählen</button></div>';
  }
  for (const tpl of S.templates) {
    const inhalt = '<div class="li-main"><div class="li-title">' + esc(tpl.name) + '</div>' +
      '<div class="li-sub">' + tpl.exercises.map(it => esc(exById(it.exId).name)).join(', ') + '</div></div>';
    if (auswahl) {
      const an = auswahl.has(tpl.id);
      h += '<button class="li-item' + (an ? ' li-selected' : '') + '" data-action="tpl-select" data-id="' + esc(tpl.id) + '">' +
        '<span class="sel-dot' + (an ? ' on' : '') + '">' + (an ? '✓' : '') + '</span>' + inhalt + '</button>';
    } else {
      h += '<button class="li-item" data-action="tpl-edit" data-id="' + esc(tpl.id) + '">' + inhalt + '<span class="chev">›</span></button>';
    }
  }
  if (auswahl) {
    h += '<div class="row-2 mt-l">' +
      '<button class="btn btn-danger" data-action="tpl-bulk-del">Löschen</button>' +
      '<button class="btn" data-action="tpl-bulk-export">Exportieren</button>' +
      '<button class="btn" data-action="tpl-bulk-dup">Duplizieren</button></div>';
  } else {
    h += '<button class="btn btn-block btn-primary mt-s" data-action="tpl-new">+ Neuer Plan</button>';
    if (S.workouts.length) h += '<button class="btn btn-block btn-soft mt-m" data-action="tpl-derive">Pläne aus dem Verlauf erstellen</button>';
    h += '<button class="btn btn-block mt-m" data-action="tpl-import-open">Pläne importieren…</button>';
  }
  return h;
}
function renderTplEditor() {
  const d = tplDraft;
  let h = '<button class="back-btn" data-action="train-home">‹ Zurück</button>' +
    '<h1 class="view-title view-title-sm">' + (d.id ? 'Plan bearbeiten' : 'Neuer Plan') + '</h1>' +
    '<div class="form-row"><label>Name</label><input class="input" value="' + esc(d.name) + '" placeholder="z. B. Push A" data-tinput="name"></div>' +
    '<div class="section-title">Übungen</div>';
  if (d.exercises.length) h += '<div class="mini-note mini-note-lead">Gewicht leer = beim Training vom letzten Mal übernommen. Tipp auf die Zahl links, um einen Satz als Aufwärmsatz (W) zu markieren — Aufwärmsätze zählen nicht in die Statistik.</div>';
  if (!d.exercises.length) h += '<div class="card"><div class="li-sub li-sub-wrap">Noch keine Übungen im Plan.</div></div>';
  d.exercises.forEach((it, i) => {
    const ex = exById(it.exId);
    h += '<div class="tpl-ex-card"><div class="tpl-ex-head">' +
      Icons.thumb(ex) +
      '<div class="tpl-ex-name">' + esc(ex.name) + '</div>' +
      '<div class="tpl-ex-tools">' +
      '<button class="icon-btn" data-action="tpl-ex-up" data-i="' + i + '">↑</button>' +
      '<button class="icon-btn" data-action="tpl-ex-down" data-i="' + i + '">↓</button>' +
      '<button class="icon-btn icon-btn-danger" data-action="tpl-ex-del" data-i="' + i + '">×</button>' +
      '</div></div>';
    let satzN = 0;
    it.sets.forEach((st, j) => {
      const dij = ' data-i="' + i + '" data-j="' + j + '"';
      const warm = !!st.warmup;
      if (!warm) satzN++;
      h += '<div class="tpl-set-row' + (warm ? ' tpl-set-warm' : '') + '">' +
        '<button class="w-toggle' + (warm ? ' on' : '') + '" data-action="tpl-set-warm"' + dij + ' title="Aufwärmsatz umschalten">' + (warm ? 'W' : satzN) + '</button>' +
        '<input class="num-input tpl-set-kg" inputmode="decimal" autocomplete="off" placeholder="' + (warm ? 'kg' : 'auto') + '" value="' + (st.kg != null ? fmtInput(st.kg) : '') + '" data-trole="kg"' + dij + '>' +
        '<span class="tpl-set-unit">kg ×</span>' +
        '<input class="num-input tpl-set-reps" inputmode="numeric" autocomplete="off" placeholder="Wdh" value="' + (st.reps != null ? st.reps : '') + '" data-trole="reps"' + dij + '>' +
        '<span class="tpl-set-unit tpl-set-pause">P</span>' +
        '<input class="num-input tpl-set-rest" inputmode="numeric" autocomplete="off" placeholder="' + (warm ? '–' : 'auto') + '" value="' + (st.restSec != null ? st.restSec : '') + '" data-trole="setrest"' + dij + ' aria-label="Pause nach diesem Satz in Sekunden">' +
        '<span class="tpl-set-unit">s</span>' +
        '<button class="del-btn" style="width:34px;height:34px;margin-left:auto" data-action="tpl-set-del"' + dij + '>×</button></div>';
    });
    h += '<div class="tpl-ex-foot">' +
      '<button class="add-set-btn" style="padding:8px 2px" data-action="tpl-set-add" data-i="' + i + '">+ Satz</button>' +
      '<button class="add-set-btn tpl-warmup-btn" style="padding:8px 2px" data-action="tpl-warmup" data-i="' + i + '">Aufwärmen berechnen</button>' +
      '<div class="tpl-rest"><span>Pause</span>' +
      '<input class="num-input tpl-rest-input" inputmode="numeric" placeholder="auto" value="' + (it.restSec || '') + '" data-trole="rest" data-i="' + i + '"><span>s</span></div>' +
      '</div></div>';
  });
  h += '<button class="btn btn-block btn-soft" data-action="tpl-add-ex">+ Übung hinzufügen</button>' +
    '<div class="row-2 mt-l"><button class="btn btn-primary" data-action="tpl-save">Speichern</button>' +
    (d.id ? '<button class="btn btn-danger" data-action="tpl-del">Löschen</button>' : '') + '</div>';
  return h;
}

/* --- Übungs-Picker (Sheet) --- */
/* Das Suchfeld klebt oben: es bleibt sichtbar, während die Trefferliste darunter
   scrollt — sonst tippt man in ein Feld, das man nicht mehr sieht. */
function openExercisePicker(cb) {
  pickerCb = cb;
  openSheet('<div class="sheet-title">Übung wählen</div>' +
    '<div class="picker-such"><input class="input" placeholder="Suchen…" data-pinput="q"></div>' +
    '<div id="picker-list">' + pickerListHtml('') + '</div>');
}
function pickerListHtml(q) {
  q = (q || '').trim().toLowerCase();
  const list = allExercises().filter(e => !q || e.name.toLowerCase().includes(q) || e.mg.toLowerCase().includes(q));
  let h = '';
  const gruppen = MGS.concat([...new Set(list.map(e => e.mg))].filter(m => MGS.indexOf(m) < 0));
  for (const mg of gruppen) {
    const items = list.filter(e => e.mg === mg);
    if (!items.length) continue;
    h += '<div class="section-title">' + esc(mg) + '</div>';
    for (const e of items) {
      h += '<button class="li-item" style="min-height:48px;padding:9px 14px" data-action="pick-ex" data-id="' + esc(e.id) + '">' +
        Icons.thumb(e) +
        '<div class="li-main"><div class="li-title li-title-sm">' + esc(e.name) + '</div></div>' +
        '<span class="tag">' + esc(e.eq) + '</span></button>';
    }
  }
  return h || '<div class="empty"><p>Nichts gefunden</p></div>';
}

/* ---------- View: Verlauf ---------- */
function renderVerlauf() {
  if (verlaufSub) return renderWorkoutDetail();
  let h = '<h1 class="view-title">Verlauf</h1>';
  if (!S.workouts.length && !S.runs.length) {
    return h + leerHtml('uhr', 'Noch keine Einträge',
      'Sobald du dein erstes Training beendest, sammelt sich hier deine Historie — nach Monaten sortiert, mit Dauer, Volumen und Rekorden.');
  }
  const prByWorkout = {};
  allPrEvents().forEach(ev => { prByWorkout[ev.w.id] = (prByWorkout[ev.w.id] || 0) + 1; });
  const eintraege = S.workouts.map(w => ({ t: w.startedAt, w }))
    .concat(S.runs.map(r => ({ t: r.startedAt, r })))
    .sort((a, b) => b.t - a.t);
  /* Kurzdatum reicht: die Monatsüberschrift trägt Monat und Jahr bereits. */
  const kurzTag = ms => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' });
  let lastMonat = null;
  for (const e of eintraege) {
    const monat = fmtMonat(e.t);
    if (monat !== lastMonat) { h += '<div class="month-hd">' + esc(monat) + '</div>'; lastMonat = monat; }
    if (e.w) {
      const w = e.w;
      const dauer = w.finishedAt ? fmtDauer((w.finishedAt - w.startedAt) / 1000) : '–';
      const prs = prByWorkout[w.id];
      /* Umbrechende Meta-Zeile statt einer abgeschnittenen: das Volumen ist die
         interessanteste Zahl der Zeile und darf nicht der Ellipse zum Opfer fallen. */
      h += '<button class="li-item" data-action="wo-open" data-id="' + esc(w.id) + '">' +
        '<div class="li-main"><div class="li-title">' + esc(w.name) + '</div>' +
        '<div class="meta-row"><span>' + kurzTag(w.startedAt) + '</span>' +
        '<span class="m-num">' + dauer + '</span>' +
        '<span class="m-num">' + workoutSetCount(w) + ' Sätze</span>' +
        '<span class="m-num">' + fmtVol(workoutVolume(w)) + '</span></div></div>' +
        (prs ? '<span class="badge-pr">' + prs + '× PR</span>' : '') + '<span class="chev">›</span></button>';
    } else {
      const r = e.r;
      h += '<button class="li-item" data-action="run-open" data-id="' + esc(r.id) + '">' +
        '<div class="li-main"><div class="li-title">Lauf' + (r.notiz ? ' · ' + esc(r.notiz) : '') + '</div>' +
        '<div class="meta-row"><span>' + kurzTag(r.startedAt) + '</span>' +
        '<span class="m-num">' + fmtKg(r.distanzKm) + ' km</span>' +
        '<span class="m-num">' + fmtDauer(r.dauerSec) + '</span>' +
        '<span class="m-num">' + fmtPace(r.dauerSec / r.distanzKm) + '</span></div></div>' +
        '<span class="tag tag-lauf">Lauf</span><span class="chev">›</span></button>';
    }
  }
  return h;
}

/* ---------- Läufe ---------- */
function parseDauer(str) { // "45" (Minuten) | "45:30" | "1:02:15" → Sekunden
  if (str == null) return null;
  const teile = String(str).trim().split(':');
  if (!teile.length || teile.some(t => t.trim() === '' || isNaN(t.replace(',', '.')))) return null;
  let sec = 0;
  if (teile.length === 1) sec = parseFloat(teile[0].replace(',', '.')) * 60;
  else if (teile.length === 2) sec = (+teile[0]) * 60 + (+teile[1]);
  else if (teile.length === 3) sec = (+teile[0]) * 3600 + (+teile[1]) * 60 + (+teile[2]);
  else return null;
  return sec > 0 ? Math.round(sec) : null;
}
function fmtDauerColon(sec) { // 3735 → "1:02:15", 2730 → "45:30"
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
function fmtPace(secProKm) {
  if (!isFinite(secProKm) || secProKm <= 0) return '–';
  return fmtMinSek(secProKm) + ' /km';
}
function openRunSheet(runId) {
  const r = runId ? S.runs.find(x => x.id === runId) : null;
  openSheet('<div class="sheet-title">' + (r ? 'Lauf bearbeiten' : 'Lauf eintragen') + '</div>' +
    '<div class="form-row"><label>Datum</label><input type="date" class="input" id="run-date" value="' + (r ? todayStr(new Date(r.startedAt)) : todayStr()) + '"></div>' +
    '<div class="row-2">' +
    '<div class="form-row"><label>Distanz (km)</label><input class="input" id="run-km" inputmode="decimal" placeholder="z. B. 5,2" value="' + (r ? fmtInput(r.distanzKm) : '') + '"></div>' +
    '<div class="form-row"><label>Dauer (mm:ss)</label><input class="input" id="run-dauer" placeholder="z. B. 28:30" value="' + (r ? fmtDauerColon(r.dauerSec) : '') + '"></div></div>' +
    '<div class="form-row"><label>Notiz (optional)</label><input class="input" id="run-notiz" placeholder="z. B. Intervalle, Strecke" value="' + esc(r && r.notiz ? r.notiz : '') + '"></div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="run-save"' + (r ? ' data-id="' + esc(r.id) + '"' : '') + '>Speichern</button>' +
    (r && stravaVerbunden() && !r.stravaId ? '<button class="btn" data-action="strava-post-run" data-id="' + esc(r.id) + '">Auf Strava posten</button>' : '') +
    (r ? '<button class="btn btn-danger" data-action="run-del" data-id="' + esc(r.id) + '">Löschen</button>' : '') + '</div>');
}
function renderWorkoutDetail() {
  const w = S.workouts.find(x => x.id === verlaufSub.id);
  if (!w) { verlaufSub = null; return renderVerlauf(); }
  if (editDraft) return renderWorkoutEdit();
  const prSets = new Set(allPrEvents().filter(ev => ev.w.id === w.id).map(ev => ev.set));
  let h = '<button class="back-btn" data-action="verlauf-home">‹ Verlauf</button>' +
    '<h1 class="view-title view-title-sm">' + esc(w.name) +
    '<small>' + fmtDatumLang(w.startedAt) + ', ' + fmtUhrzeit(w.startedAt) + ' Uhr</small></h1>';
  h += '<div class="stat-grid stat-grid-3">' +
    '<div class="stat-tile"><div class="stat-val">' + (w.finishedAt ? fmtDauer((w.finishedAt - w.startedAt) / 1000) : '–') + '</div><div class="stat-lab">Dauer</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + fmtVol(workoutVolume(w)) + '</div><div class="stat-lab">Volumen</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + workoutSetCount(w) + '</div><div class="stat-lab">Sätze</div></div></div>';
  /* Goku feiert nur das soeben beendete Training (nie im Training, nie bei alten) */
  if (w.id === gokuFeierId && S.settings.goku !== false) h += gokuKarte(gokuSpruchWorkout(w));
  h += '<div class="card">';
  w.exercises.forEach((wex, i) => {
    const ex = exById(wex.exId);
    if (i) h += '<div class="divider"></div>';
    h += '<div class="hist-ex-name">' + esc(ex.name) + '</div>';
    if (wex.notiz) h += '<div class="mini-note" style="margin:0 0 4px">Notiz: ' + esc(wex.notiz) + '</div>';
    let n = 0;
    wex.sets.forEach(s => {
      if (!s.warmup) n++;
      h += '<div class="hist-set"><span class="hs-n">' + (s.warmup ? 'W' : n) + '</span>' +
        '<span class="hs-main">' + fmtKg(s.kg) + ' kg × ' + s.reps + '</span>' +
        (s.rpe ? '<span class="hs-sub">RPE ' + fmtKg(s.rpe) + '</span>' : '') +
        (s.restSec != null ? '<span class="hs-sub">Pause ' + fmtMinSek(s.restSec) + '</span>' : '') +
        (prSets.has(s) ? '<span class="badge-pr">PR</span>' : '') + '</div>';
    });
  });
  h += '</div>';
  if (w.notiz) h += '<div class="info-box">Notiz: ' + esc(w.notiz) + '</div>';
  if (stravaVerbunden()) {
    h += w.stravaId
      ? '<div class="mini-note mb-s">Auf Strava gepostet ✓</div>'
      : '<button class="btn btn-block mb-m" data-action="strava-post-wo" data-id="' + esc(w.id) + '">Auf Strava posten</button>';
  }
  h += '<div class="row-2 mt-s"><button class="btn" data-action="wo-edit">Bearbeiten</button>' +
    '<button class="btn btn-danger" data-action="wo-delete">Löschen</button></div>';
  return h;
}
function renderWorkoutEdit() {
  const d = editDraft;
  let h = '<button class="back-btn" data-action="wo-edit-cancel">‹ Abbrechen</button>' +
    '<h1 class="view-title view-title-sm">Training bearbeiten</h1>' +
    '<div class="form-row"><label>Name</label><input class="input" value="' + esc(d.name) + '" data-einput="name"></div>' +
    '<div class="row-2"><div class="form-row"><label>Datum</label><input type="date" class="input" value="' + todayStr(new Date(d.startedAt)) + '" data-einput="datum"></div>' +
    '<div class="form-row"><label>Uhrzeit</label><input type="time" class="input" value="' + fmtUhrzeit(d.startedAt) + '" data-einput="zeit"></div></div>' +
    '<div class="mini-note mini-note-lead">Spalten: Aufwärmsatz · kg · Wdh. · RPE · Pause (s)</div>';
  d.exercises.forEach((wex, xi) => {
    const ex = exById(wex.exId);
    h += '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<div class="li-title li-title-sm li-title-flex">' + esc(ex.name) + '</div>' +
      '<button class="del-btn" data-action="edit-ex-del" data-x="' + xi + '">×</button></div>';
    wex.sets.forEach((s, si) => {
      const dx = ' data-x="' + xi + '" data-s="' + si + '"';
      h += '<div class="edit-set-row">' +
        '<button class="w-toggle' + (s.warmup ? ' on' : '') + '" style="width:26px;height:40px" data-action="edit-set-w"' + dx + '>W</button>' +
        '<input inputmode="decimal" value="' + fmtInput(s.kg) + '" placeholder="kg" data-einput="kg"' + dx + '>' +
        '<input inputmode="numeric" value="' + (s.reps != null ? s.reps : '') + '" placeholder="Wdh" data-einput="reps"' + dx + '>' +
        '<select data-esel="rpe"' + dx + '><option value="">RPE</option>' +
        RPE_WERTE.map(r => '<option value="' + r + '"' + (String(s.rpe) === r ? ' selected' : '') + '>' + r.replace('.', ',') + '</option>').join('') + '</select>' +
        '<input inputmode="numeric" value="' + (s.restSec != null ? s.restSec : '') + '" placeholder="P" data-einput="rest"' + dx + '>' +
        '<button class="del-btn" data-action="edit-set-del"' + dx + '>×</button></div>';
    });
    h += '<button class="add-set-btn" data-action="edit-set-add" data-x="' + xi + '">+ Satz</button></div>';
  });
  h += '<button class="btn btn-block btn-soft" data-action="edit-ex-add">+ Übung hinzufügen</button>' +
    '<button class="btn btn-block btn-primary mt-l" data-action="wo-edit-save">Speichern</button>';
  return h;
}
function saveWorkoutEdit() {
  const d = editDraft;
  d.name = (d.name || '').trim() || 'Training';
  /* Datum/Uhrzeit übernehmen, Dauer beibehalten */
  const dur = (d.finishedAt || d.startedAt) - d.startedAt;
  if (d._datum || d._zeit) {
    const datum = d._datum || todayStr(new Date(d.startedAt));
    const zeit = d._zeit || fmtUhrzeit(d.startedAt);
    const neu = new Date(datum + 'T' + zeit).getTime();
    if (!isNaN(neu)) { d.startedAt = neu; d.finishedAt = neu + dur; }
  }
  delete d._datum; delete d._zeit;
  /* Körpergewichtsübungen: leeres kg-Feld = 0 kg Zusatzgewicht (wie im Live-Workout) */
  d.exercises.forEach(wex => {
    if (exById(wex.exId).bw) wex.sets.forEach(s => { if (s.kg == null) s.kg = 0; });
  });
  /* Kein stilles Verwerfen: Sätze mit Wdh. aber fehlendem Gewicht blockieren die Speicherung */
  for (const wex of d.exercises) {
    if (wex.sets.some(s => s.reps != null && s.reps > 0 && s.kg == null)) {
      showToast('Gewicht fehlt bei ' + exById(wex.exId).name);
      return;
    }
  }
  /* nur wirklich leere Zeilen (ohne Wdh.) entfernen */
  d.exercises = d.exercises
    .map(wex => ({ ...wex, sets: wex.sets.filter(s => s.reps != null && s.reps > 0) }))
    .filter(wex => wex.sets.length);
  if (!d.exercises.length) { showToast('Keine gültigen Sätze — lösche stattdessen das Training'); return; }
  const i = S.workouts.findIndex(w => w.id === d.id);
  if (i >= 0) S.workouts[i] = d;
  S.workouts.sort((a, b) => a.startedAt - b.startedAt);
  editDraft = null;
  save();
  render();
  showToast('Änderungen gespeichert');
}

/* ---------- View: Übungen ---------- */
function renderUebungen() {
  if (uebSub) return renderUebungDetail();
  let h = '<h1 class="view-title">Übungen</h1>' +
    '<div class="such-feld"><svg class="such-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/></svg>' +
    '<input class="input" type="search" aria-label="Übung suchen" placeholder="Übung suchen…" value="' + esc(uebFilter.q) + '" data-finput="q"></div>' +
    '<div class="chip-row">' + ['Alle'].concat(MGS).map(m =>
      '<button class="chip' + ((uebFilter.mg || 'Alle') === m ? ' active' : '') + '" data-action="filter-mg" data-mg="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div class="chip-row">' + ['Alle Geräte'].concat(EQS).map(m =>
      '<button class="chip' + ((uebFilter.eq || 'Alle Geräte') === m ? ' active' : '') + '" data-action="filter-eq" data-eq="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div id="ueb-list">' + uebListHtml() + '</div>' +
    '<button class="btn btn-block btn-soft" data-action="cu-new">+ Eigene Übung</button>';
  return h;
}
function uebListHtml() {
  const q = uebFilter.q.trim().toLowerCase();
  const list = allExercises().filter(e =>
    (!q || e.name.toLowerCase().includes(q)) &&
    (!uebFilter.mg || e.mg === uebFilter.mg) &&
    (!uebFilter.eq || e.eq === uebFilter.eq));
  let h = '';
  const gruppen = MGS.concat([...new Set(list.map(e => e.mg))].filter(m => MGS.indexOf(m) < 0));
  for (const mg of gruppen) {
    const items = list.filter(e => e.mg === mg);
    if (!items.length) continue;
    h += '<div class="section-title">' + esc(mg) + '</div>';
    for (const e of items) {
      const last = lastSessionFor(e.id);
      let side = '';
      if (last) {
        const top = topSet(workingSets(last.wex));
        if (top) side = fmtKg(top.kg) + ' × ' + top.reps;
      }
      h += '<button class="li-item" data-action="ueb-open" data-id="' + esc(e.id) + '">' +
        Icons.thumb(e) +
        '<div class="li-main"><div class="li-title li-title-sm">' + esc(e.name) +
        (e.id.indexOf('cu-') === 0 ? ' <span class="tag">eigene</span>' : '') + '</div>' +
        '<div class="meta-row"><span>' + esc(e.eq) + '</span>' + (e.compound ? '<span>Grundübung</span>' : '') + '</div></div>' +
        (side ? '<div class="li-side">' + side + '</div>' : '') + '<span class="chev">›</span></button>';
    }
  }
  return h || leerHtml('suche', 'Keine Übung gefunden',
    'Kein Treffer für diese Kombination aus Suche und Filtern. Setz die Filter zurück oder leg die Übung selbst an.',
    '<button class="btn" data-action="filter-reset">Filter zurücksetzen</button>');
}
function renderUebungDetail() {
  const ex = exById(uebSub.exId);
  const sess = sessionsFor(ex.id);
  const bests = prBests(ex.id);
  const os = S.exerciseSettings[ex.id] || {};
  let h = '<button class="back-btn" data-action="ueb-back">‹ Übungen</button>' +
    '<div class="detail-head">' + Icons.thumb(ex, true) +
    '<h1 class="view-title view-title-sm view-title-flush">' + esc(ex.name) +
    '<small><span class="tag">' + esc(ex.mg) + '</span><span class="tag">' + esc(ex.eq) + '</span>' +
    (ex.compound ? '<span class="tag">Grundübung</span>' : '') + '</small></h1></div>';
  if (ex.hint) h += '<div class="ex-hint mb-m">' + esc(ex.hint) + '</div>';
  h += '<div class="stat-grid stat-grid-3">' +
    '<div class="stat-tile"><div class="stat-val">' + (bests.maxKg != null ? fmtKg(bests.maxKg) : '–') + '</div><div class="stat-lab">Max. kg' + (ex.bw ? ' (Zusatz)' : '') + '</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + (bests.maxE1rm != null ? fmtKg(Math.round(bests.maxE1rm * 10) / 10) : '–') + '</div><div class="stat-lab">e1RM (kg)</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + sess.length + '</div><div class="stat-lab">Einheiten</div></div></div>';
  /* Charts. Einheiten, in denen ein Rekord fiel, bekommen einen goldenen Punkt —
     damit die Kurve zeigt, wo etwas passiert ist, statt nur zu steigen. */
  const prWorkouts = new Set(allPrEvents().filter(evn => evn.exId === ex.id).map(evn => evn.w.id));
  /* Marken nur, solange sie selten sind. Wer linear steigert, hat in fast jeder
     Einheit einen Rekord — dann markiert Gold nichts mehr, sondern verdeckt die Linie. */
  const prMarken = sess.length > 3 && prWorkouts.size / sess.length <= 0.34;
  const prHinweis = prMarken ? ' · Gold = Rekord' : '';
  const mk = (fn, einheit) => sess.map(({ w, wex }) => {
    const v = fn(wex);
    const istPr = prWorkouts.has(w.id);
    return v == null ? null : {
      x: w.startedAt, xLabel: fmtDatumKurz(w.startedAt), y: v, pr: prMarken && istPr,
      tip: fmtDatumLang(w.startedAt) + ' · ' + fmtKg(Math.round(v * 10) / 10) + ' ' + einheit + (istPr ? ' · Rekord' : '')
    };
  }).filter(Boolean);
  const nurKoerpergewicht = ex.bw && !sess.some(({ wex }) => workingSets(wex).some(s => s.kg > 0));
  if (nurKoerpergewicht) {
    h += chartCard('Wiederholungen', Charts.lineChart({
      points: mk(wex => { const r = workingSets(wex).map(s => s.reps); return r.length ? Math.max(...r) : null; }, 'Wdh.'),
      einheit: 'Wdh.', leer: 'Noch keine Einheiten'
    }), 'bester Satz je Einheit' + prHinweis);
  } else {
    h += chartCard('Geschätztes 1RM', Charts.lineChart({
      points: mk(wex => {
        const es = workingSets(wex).map(s => e1rmOf(s.kg, s.reps)).filter(x => x != null);
        return es.length ? Math.max(...es) : null;
      }, 'kg'), einheit: 'kg', leer: 'Noch keine Einheiten'
    }), 'nach Epley' + prHinweis);
    h += chartCard('Top-Satz-Gewicht', Charts.lineChart({
      points: mk(wex => { const t = topSet(workingSets(wex)); return t ? t.kg : null; }, 'kg'),
      einheit: 'kg', leer: 'Noch keine Einheiten'
    }), 'schwerster Arbeitssatz je Einheit');
  }
  h += chartCard('Volumen', Charts.lineChart({
    points: mk(wex => workingSets(wex).reduce((a, s) => a + setVolume(s), 0) || null, 'kg'),
    einheit: 'kg', leer: 'Noch keine Einheiten'
  }), 'kg × Wiederholungen, je Einheit');
  /* Übungs-Einstellungen */
  h += '<div class="section-title">Einstellungen</div>' +
    '<div class="setting-row"><div class="li-main"><div class="li-title li-title-sm">Pausenziel</div>' +
    '<div class="li-sub">leer = Standard (' + fmtMinSek(pauseStandard(ex.id)) + ' min' +
    (S.settings.coach !== false ? ' · Coach-Wert für ' + esc(ex.mg) : '') + ')</div></div>' +
    '<input class="input-mini" inputmode="numeric" placeholder="auto" value="' + (os.restSec || '') + '" data-exset="restSec" data-id="' + esc(ex.id) + '"><span class="li-sub">s</span></div>' +
    '<div class="form-row"><label>Notiz (z. B. Sitzeinstellung, Griffbreite)</label>' +
    '<textarea class="input" data-exset="notiz" data-id="' + esc(ex.id) + '">' + esc(os.notiz || '') + '</textarea></div>';
  /* Historie */
  h += '<div class="section-title">Historie</div>';
  if (!sess.length) h += '<div class="empty"><p>Noch keine Einheiten mit dieser Übung.</p></div>';
  [...sess].reverse().slice(0, 20).forEach(({ w, wex }) => {
    h += '<div class="card" style="padding:10px 14px"><div class="li-sub" style="margin-bottom:2px">' + fmtDatumLang(w.startedAt) + '</div>' +
      '<div class="li-title li-title-sm">' +
      wex.sets.map(s => (s.warmup ? '(' : '') + fmtKg(s.kg) + '×' + s.reps + (s.warmup ? ')' : '')).join(' · ') + '</div></div>';
  });
  if (ex.id.indexOf('cu-') === 0) {
    h += '<button class="btn btn-block mt-m" data-action="cu-edit" data-id="' + esc(ex.id) + '">Übung bearbeiten (Name, Muskelgruppe, Gerät)</button>';
    h += '<button class="btn btn-block btn-danger mt-m" data-action="cu-del" data-id="' + esc(ex.id) + '">Eigene Übung löschen</button>';
  }
  return h;
}

/* ---------- View: Profil (Dashboard) ---------- */
/* Kachel-Delta: vorzeichenbehaftet, immer gegen einen benannten Zeitraum.
   Grün heißt „in die gewünschte Richtung", nicht „positiv". */
function deltaHtml(diff, text, hochIstGut) {
  if (diff == null || !isFinite(diff) || Math.abs(diff) < 0.0001) {
    return '<div class="stat-delta flat">unverändert ' + esc(text) + '</div>';
  }
  const gut = hochIstGut === false ? diff < 0 : diff > 0;
  return '<div class="stat-delta ' + (gut ? 'up' : 'down') + '">' + (diff > 0 ? '+' : '−') +
    esc(String(fmtKg(Math.abs(Math.round(diff * 10) / 10)))) + ' ' + esc(text) + '</div>';
}
/* Bezugsgröße für die laufende Woche: der Schnitt der letzten zwölf abgeschlossenen
   Wochen. Eine Woche, die erst am Montag begonnen hat, kann nichts „verloren" haben. */
function schnittProWocheHtml(vorwoche) {
  const start = weekStartMs(12), ende = weekStartMs(0);
  const n = S.workouts.filter(w => w.startedAt >= start && w.startedAt < ende).length +
    S.runs.filter(r => r.startedAt >= start && r.startedAt < ende).length;
  if (!n) return vorwoche ? '<div class="stat-delta flat">Vorwoche: ' + vorwoche + '</div>' : '';
  return '<div class="stat-delta flat">Ø ' + fmtKg(Math.round(n / 12 * 10) / 10) + ' pro Woche</div>';
}
function statTile(val, lab, delta, blau) {
  return '<div class="stat-tile' + (blau ? ' stat-blau' : '') + '"><div class="stat-val">' + val + '</div>' +
    '<div class="stat-lab">' + esc(lab) + '</div>' + (delta || '') + '</div>';
}
function renderProfil() {
  const jetzt = Date.now();
  const d30 = jetzt - 30 * TAG_MS, d60 = jetzt - 60 * TAG_MS;
  const wkStart = weekStartMs(0), wkVor = weekStartMs(1);
  let ton30 = 0, tonVor30 = 0;
  S.workouts.forEach(w => {
    if (w.startedAt >= d30) ton30 += workoutVolume(w);
    else if (w.startedAt >= d60) tonVor30 += workoutVolume(w);
  });
  const prs = allPrEvents();
  const pr30 = prs.filter(ev => ev.w.startedAt >= d30).length;
  const prVor30 = prs.filter(ev => ev.w.startedAt >= d60 && ev.w.startedAt < d30).length;
  const gesamt = S.workouts.length + S.runs.length;
  const woche = S.workouts.filter(w => w.startedAt >= wkStart).length + S.runs.filter(r => r.startedAt >= wkStart).length;
  const wocheVor = S.workouts.filter(w => w.startedAt >= wkVor && w.startedAt < wkStart).length +
    S.runs.filter(r => r.startedAt >= wkVor && r.startedAt < wkStart).length;
  const km30 = S.runs.filter(r => r.startedAt >= d30).reduce((a, r) => a + r.distanzKm, 0);
  const kmVor30 = S.runs.filter(r => r.startedAt >= d60 && r.startedAt < d30).reduce((a, r) => a + r.distanzKm, 0);

  let h = '<h1 class="view-title">Profil</h1>' + warnHtml();
  if (!S.workouts.length && !S.runs.length) {
    return h + leerHtml('chart', 'Noch nichts zu zeigen',
      'Sobald du trainierst, entstehen hier deine Kennzahlen: Wochenvolumen je Muskelgruppe, Trainings pro Woche und deine letzten Bestleistungen.');
  }
  h += '<div class="stat-grid">' +
    statTile(gesamt, 'Trainings gesamt', '', true) +
    /* Kein Delta gegen die Vorwoche: am Montag steht hier zwangsläufig ein Minus,
       das nichts über die Form aussagt. Der Zwölf-Wochen-Schnitt ist der ehrliche Bezug. */
    statTile(woche, 'diese Woche', schnittProWocheHtml(wocheVor), true) +
    statTile(fmtVol(ton30), 'Volumen · 30 Tage', tonVor30 > 0 ? deltaHtml((ton30 - tonVor30) / 1000, 't ggü. Vormonat', true) : '') +
    statTile(pr30, 'PRs · 30 Tage', deltaHtml(pr30 - prVor30, 'ggü. Vormonat', true)) +
    '</div>';
  if (S.runs.length) {
    h += '<div class="stat-grid">' +
      statTile(S.runs.length, 'Läufe gesamt', '') +
      statTile(fmtKg(Math.round(km30 * 10) / 10) + ' km', 'gelaufen · 30 Tage', kmVor30 > 0 ? deltaHtml(km30 - kmVor30, 'km ggü. Vormonat', true) : '') +
      '</div>';
  }
  /* Wochenvolumen pro Muskelgruppe */
  h += '<div class="section-title">Wochenvolumen · 12 Wochen</div>' +
    '<div class="chip-row">' + ['Alle'].concat(MGS).map(m =>
      '<button class="chip' + (statMg === m ? ' active' : '') + '" data-action="stat-mg" data-mg="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>';
  const weeks = weeklyStats(12);
  const wert = wk => statMode === 'saetze'
    ? (statMg === 'Alle' ? wk.saetzeGesamt : (wk.saetze[statMg] || 0))
    : (statMg === 'Alle' ? wk.tonnageGesamt : (wk.tonnage[statMg] || 0));
  /* Die letzte Woche läuft noch — sie wird gedämpft gezeichnet, sonst liest sich
     der halbfertige Balken wie ein Einbruch. */
  const bars = weeks.map((wk, i) => ({
    label: String(kwNummer(wk.start)), value: wert(wk), laufend: i === weeks.length - 1,
    tip: wk.label + (i === weeks.length - 1 ? ' (läuft)' : '') + ': ' +
      (statMode === 'saetze' ? wert(wk) + ' Sätze' : fmtVol(wert(wk)))
  }));
  const zone = (statMode === 'saetze' && statMg !== 'Alle' && Coach.VOLUMEN[statMg]) ? Coach.VOLUMEN[statMg] : null;
  h += '<div class="card chart-card"><div class="chart-head">' +
    '<div><h3>' + esc(statMg) + '</h3>' +
    '<div class="chart-sub">' + (zone ? 'Ziel ' + zone.min + '–' + zone.max + ' Sätze/Woche' : 'letzter Balken: laufende Woche') + '</div></div>' +
    '<div class="seg"><button class="' + (statMode === 'saetze' ? 'active' : '') + '" data-action="stat-mode" data-mode="saetze">Sätze</button>' +
    '<button class="' + (statMode === 'tonnage' ? 'active' : '') + '" data-action="stat-mode" data-mode="tonnage">Tonnage</button></div></div>' +
    Charts.barChart({ bars, zone, yFmt: statMode === 'tonnage' ? fmtVol : undefined, leer: 'Noch keine Trainingsdaten' }) + '</div>';
  /* Trainings pro Woche (Kraft + Läufe) */
  const runsProWoche = weeks.map(wk => S.runs.filter(r => r.startedAt >= wk.start && r.startedAt < wk.end).length);
  h += '<div class="section-title">Trainings pro Woche</div><div class="card chart-card">' +
    Charts.barChart({
      bars: weeks.map((wk, i) => ({
        label: String(kwNummer(wk.start)), value: wk.workouts + runsProWoche[i], laufend: i === weeks.length - 1,
        tip: wk.label + ': ' + wk.workouts + ' Kraft · ' + runsProWoche[i] + ' Läufe'
      })),
      leer: 'Noch keine Trainingsdaten'
    }) + '</div>';
  /* PR-Liste — die Zahl steht vorn, das Abzeichen wiederholt sie nicht */
  h += '<div class="section-title">Letzte Bestleistungen</div>';
  const recent = prs.slice(-12).reverse();
  if (!recent.length) {
    h += leerHtml('pokal', 'Noch keine Bestleistung',
      'Sobald du in einer Übung mehr Gewicht, ein höheres geschätztes 1RM oder mehr Wiederholungen als je zuvor schaffst, steht sie hier.');
  }
  recent.forEach(ev => {
    const ex = exById(ev.exId);
    h += '<div class="li-item">' + Icons.thumb(ex) +
      '<div class="li-main"><div class="li-title li-title-sm">' + esc(ex.name) + '</div>' +
      '<div class="meta-row"><span>' + fmtDatumKurz(ev.w.startedAt) + '</span><span>' + esc(ev.pr.text) + '</span></div></div>' +
      '</div>';
  });
  return h;
}

/* ---------- View: Daten (Persönliches + Einstellungen) ---------- */
function renderDaten() {
  const st = S.settings;
  let h = '<h1 class="view-title">Daten</h1>' + warnHtml(true);
  /* Persönliche Daten */
  h += '<div class="section-title">Persönliche Daten</div>';
  h += '<div class="card chart-card"><h3>Körpergewicht</h3>';
  if (S.bodyweight.length) {
    const letzte = S.bodyweight[S.bodyweight.length - 1];
    const vor7 = [...S.bodyweight].reverse().find(b => new Date(b.date + 'T12:00').getTime() <= new Date(letzte.date + 'T12:00').getTime() - 6 * TAG_MS);
    const delta = vor7 ? letzte.kg - vor7.kg : null;
    let bmiTxt = '';
    if (st.groesseCm > 0) {
      const bmi = letzte.kg / Math.pow(st.groesseCm / 100, 2);
      bmiTxt = 'BMI ' + fmtKg(Math.round(bmi * 10) / 10);
    }
    h += '<div class="bw-kopf"><div class="stat-val">' + fmtKg(letzte.kg) + ' kg</div>' +
      '<div class="bw-meta">' +
      (delta != null ? '<span>' + (delta > 0 ? '+' : '−') + fmtKg(Math.abs(Math.round(delta * 10) / 10)) + ' kg ggü. Vorwoche</span>' : '') +
      (bmiTxt ? '<span>' + bmiTxt + '</span>' : '') + '</div></div>';
    /* Der 7-Tage-Schnitt führt, die Tageswerte treten zurück: bei täglichem Wiegen
       ist die Schwankung Rauschen, die Richtung ist die Information. */
    h += Charts.lineChart({
      points: S.bodyweight.map(b => {
        const x = new Date(b.date + 'T12:00').getTime();
        return { x, xLabel: fmtDatumKurz(x), y: b.kg, tip: fmtDatumLang(x) + ' · ' + fmtKg(b.kg) + ' kg' };
      }), trend: true, einheit: 'kg', maxIstBest: false
    });
    h += '<div class="mini-note">Kräftige Linie: 7-Tage-Durchschnitt. Dünn dahinter: die einzelnen Messungen.</div>';
  } else {
    h += leerHtml('waage', 'Noch kein Gewicht erfasst',
      'Trag dein Gewicht ein paar Mal pro Woche ein — nach etwa zwei Wochen zeigt der 7-Tage-Schnitt die tatsächliche Richtung.');
  }
  h += '<button class="btn btn-block btn-soft bw-btn" data-action="bw-add">+ Gewicht eintragen</button></div>';
  h += settingRow('Größe', 'in cm — für den BMI', miniInput('groesseCm', st.groesseCm || ''));
  h += '<div class="section-title">Darstellung & Signale</div>' +
    settingRow('Design', 'Automatisch folgt dem System',
      '<select data-set="theme">' +
      [['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(o =>
        '<option value="' + o[0] + '"' + (st.theme === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') +
    settingRow('Ton', 'Glockenton am Pausenende — mischt sich mit laufender Musik, ohne sie zu stoppen',
      switchHtml('sound', st.sound)) +
    settingRow('Benachrichtigung', 'Systemmeldung am Pausenende; die Erlaubnis fragt dein Gerät beim ersten abgehakten Satz ab',
      switchHtml('benachrichtigung', st.benachrichtigung !== false)) +
    settingRow('Signal bei gesperrtem Handy', 'Hält die App per stiller Tonspur auch gesperrt wach — unterbricht dabei aber deine Musik. Aus (Standard): Der Bildschirm bleibt während der Pause einfach an.',
      switchHtml('hintergrundSignal', st.hintergrundSignal === true)) +
    settingRow('Vibration', 'wo unterstützt (Android)',
      switchHtml('vibration', st.vibration));
  h += '<div class="section-title">Training</div>' +
    settingRow('Intelligenter Coach', 'Pausen, Steigerungen und Wdh.-Ziele je nach Übungstyp & Muskelgruppe (evidenzbasiert), mit RPE-Autoregulation und Deload-Logik', switchHtml('coach', st.coach !== false)) +
    settingRow('Goku-Maskottchen', 'Son Goku begrüßt dich auf der Startseite und feiert dein Trainingsende — nie während des Trainings', switchHtml('goku', st.goku !== false));
  if (st.coach !== false) h += rehaEinstellungenHtml();
  if (st.coach !== false) {
    h += '<div class="info-box">Der Coach setzt die Standards automatisch — z. B. ~3:30 min Pause und ~5-%-Schritte bei Beine-Grundübungen, 1:30 min und kleinste Schritte bei Bizeps &amp; Co. Pro Plan oder pro Übung kannst du die Pause weiterhin manuell überschreiben. Im Training zeigt dir „Warum?" die Begründung jeder Empfehlung.</div>';
  } else {
    h += settingRow('Pause Grundübung', 'Standard in Sekunden', miniInput('restCompound', st.restCompound)) +
      settingRow('Pause Isolationsübung', 'Standard in Sekunden', miniInput('restIsolation', st.restIsolation)) +
      settingRow('Steigerungsschritt', 'Oberkörper (kg)', miniInput('incUpper', fmtInput(st.incUpper))) +
      settingRow('Steigerungsschritt', 'Beine/Gesäß-Grundübungen (kg)', miniInput('incLower', fmtInput(st.incLower)));
  }
  /* Strava */
  h += '<div class="section-title">Strava</div>';
  const stv = st.strava;
  if (stravaVerbunden()) {
    h += settingRow('Verbunden' + (stv.athlet ? ' als ' + stv.athlet : ''), 'Beendete Workouts und Läufe werden gepostet',
      '<span class="tag tag-gruen tag-aktiv">Aktiv</span>') +
      settingRow('Automatisch posten', 'nach jedem beendeten Training', switchHtml('stravaAuto', stv.autoPost !== false)) +
      '<button class="btn btn-block" data-action="strava-trennen">Strava trennen</button>';
  } else {
    h += '<div class="info-box">Poste beendete Workouts automatisch als „Krafttraining"-Aktivität auf Strava (Läufe als Lauf). Einmalige Einrichtung über deinen eigenen kostenlosen Cloudflare-Worker — Anleitung unten.</div>' +
      '<div class="form-row"><label>Worker-URL</label><input class="input" placeholder="https://kraftlog-strava.….workers.dev" value="' + esc(stv.workerUrl || '') + '" data-sinput="workerUrl" autocapitalize="off" autocorrect="off"></div>' +
      '<div class="form-row"><label>Strava Client-ID</label><input class="input" inputmode="numeric" placeholder="z. B. 123456" value="' + esc(stv.clientId || '') + '" data-sinput="clientId"></div>' +
      '<div class="row-2"><button class="btn btn-primary" data-action="strava-verbinden">Mit Strava verbinden</button>' +
      '<button class="btn" data-action="strava-hilfe">Anleitung</button></div>';
  }
  /* Zugangsschlüssel für den Worker (gilt für Strava UND Pausen-Push) */
  h += '<div class="form-row mt-m"><label>Zugangsschlüssel</label>' +
    '<input class="input" type="password" placeholder="wird beim Worker-Deploy festgelegt" value="' + esc(st.workerKey || '') + '" data-appset="workerKey" autocapitalize="off" autocorrect="off" autocomplete="off"></div>' +
    '<div class="mini-note">Schützt deinen Worker vor fremden Zugriffen (Strava und Pausen-Push) — muss auf allen Geräten gleich sein.</div>';
  /* Pausen-Push — mit Diagnose statt einem stummen Schalter */
  h += '<div class="section-title">Pausen-Push</div>';
  h += '<div class="info-box">Der Push-Weckruf ist der <b>einzige</b> Weg, der bei gesperrtem Handy klingelt, ohne deine Musik zu stoppen. Er läuft über deinen Cloudflare-Worker — die App selbst schläft im Sperrbildschirm und kann dort nichts auslösen.</div>';
  h += pushDiagnoseHtml();
  if (S.settings.push.aktiv) {
    h += settingRow('Übungsname in der Meldung', 'Zeigt z. B. „Pause vorbei — Bankdrücken, Satz 3". Der Übungsname verlässt dafür kurz dein Gerät (verschlüsselt zum Push-Dienst). Aus: nur „Pause vorbei".',
      switchHtml('pushInhalt', st.pushInhalt === true));
    h += '<div class="row-2" style="margin-top:2px"><button class="btn btn-primary" data-action="push-test">Test in 5 s</button>' +
      '<button class="btn" data-action="push-aus">Deaktivieren</button></div>';
  } else {
    h += '<button class="btn btn-block btn-primary" data-action="push-aktivieren">Pausen-Push aktivieren</button>';
  }
  h += '<div class="section-title">Datenverwaltung</div>' +
    '<div class="info-box">Deine Daten liegen im Browser-Speicher <b>dieses Geräts</b> und hängen am Speicherort der App — die Kraftlog.app also nicht verschieben oder umbenennen. Zum Übertragen auf ein anderes Gerät (z. B. iPhone) und als Backup: Export → Import.' +
    (st.lastExport ? '<br>Letzter Export: ' + fmtDatumLang(st.lastExport) : '<br>Noch kein Export gemacht.') + '</div>' +
    '<button class="btn btn-block btn-primary" data-action="export-json">Export als JSON-Datei</button>' +
    '<button class="btn btn-block mt-m" data-action="export-clip">Export in Zwischenablage</button>' +
    '<button class="btn btn-block mt-m" data-action="import-open">Import…</button>' +
    '<button class="btn btn-block mt-m" data-action="strong-open">Import aus Strong (CSV)…</button>';
  let backup = null;
  try { backup = localStorage.getItem(BACKUP_KEY); } catch (e) { }
  if (backup) h += '<button class="btn btn-block mt-m" data-action="backup-restore">Backup wiederherstellen</button>';
  h += '<button class="btn btn-block btn-danger mt-xl" data-action="wipe">Alle Daten löschen…</button>';
  /* App-Version & manuelles Update */
  h += '<div class="section-title">App</div>' +
    '<div class="info-box">Kraftlog aktualisiert sich beim Öffnen automatisch. Wenn eine neue Funktion noch fehlt, kannst du hier von Hand nach einem Update suchen — danach lädt die App kurz neu.</div>' +
    '<button class="btn btn-block" data-action="app-update">Nach Update suchen</button>' +
    '<div class="mini-note" style="text-align:center;margin-top:10px">Version ' + esc(APP_VERSION) + ' · ' + allExercises().length + ' Übungen · Daten-Schema v' + SCHEMA_VERSION + '</div>';
  return h;
}
/* ---------- Push-Diagnose ----------
   Der Weckruf im Sperrbildschirm hängt an einer Kette aus sieben Gliedern. Reißt
   eines, passiert einfach nichts — ohne Fehlermeldung. Diese Liste zeigt, welches.
   Die letzten beiden Glieder liegen in den iOS-Einstellungen und sind vom Web aus
   grundsätzlich nicht prüfbar; sie stehen als Hinweis da, nicht als Prüfung. */
function alsAppInstalliert() {
  try {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) { return false; }
}
function pushDiagnose() {
  const st = S.settings;
  const notif = ('Notification' in window) ? Notification.permission : 'unsupported';
  const rows = [];
  rows.push({
    ok: !!st.strava.workerUrl, titel: 'Worker-URL eingetragen',
    text: st.strava.workerUrl ? esc(st.strava.workerUrl) : 'Fehlt — trag sie oben unter Strava ein. Ohne sie wird nie ein Weckruf geplant.'
  });
  rows.push({
    ok: !!st.workerKey, titel: 'Zugangsschlüssel eingetragen',
    text: st.workerKey ? 'Gesetzt (auf allen Geräten derselbe)' : 'Fehlt — der Worker weist Anfragen ohne Schlüssel ab.'
  });
  rows.push({
    ok: alsAppInstalliert(), titel: 'Als App vom Home-Bildschirm',
    text: alsAppInstalliert() ? 'Ja' : 'Nein — iOS erlaubt Web-Push nur in der installierten PWA. In Safari: Teilen ▸ Zum Home-Bildschirm.'
  });
  rows.push({
    ok: notif === 'granted', titel: 'Benachrichtigungen erlaubt',
    text: notif === 'granted' ? 'Ja'
      : notif === 'denied' ? 'Abgelehnt — nur in iOS-Einstellungen ▸ Kraftlog wieder einschaltbar.'
      : notif === 'unsupported' ? 'Dieser Browser kennt keine Benachrichtigungen.'
      : 'Noch nicht gefragt — wird beim ersten abgehakten Satz abgefragt.'
  });
  rows.push({
    ok: !!(st.push && st.push.aktiv && st.push.sub), titel: 'Push-Abo beim Dienst registriert',
    text: (st.push && st.push.aktiv && st.push.sub) ? 'Ja' : 'Noch nicht — unten „Pausen-Push aktivieren".'
  });
  rows.push({
    ok: null, titel: 'iOS: Töne für Kraftlog an',
    text: 'Nicht prüfbar. Einstellungen ▸ Mitteilungen ▸ Kraftlog: „Töne" muss an sein und die Meldung darf nicht in der „Geplanten Zusammenfassung" landen.'
  });
  rows.push({
    ok: null, titel: 'Kein Fokus / Nicht stören',
    text: 'Nicht prüfbar. Ein aktiver Fokus unterdrückt den Ton, auch wenn der Push ankommt.'
  });
  return rows;
}
function pushDiagnoseHtml() {
  const rows = pushDiagnose();
  const offen = rows.filter(r => r.ok === false).length;
  return '<div class="card"><div class="diag-kopf">' +
    (offen ? '<span class="tag tag-orange">' + offen + ' ' + (offen === 1 ? 'Glied fehlt' : 'Glieder fehlen') + '</span>'
           : '<span class="tag tag-gruen">Kette vollständig</span>') +
    '<span class="diag-kopf-text">' + (offen ? 'Bis dahin bleibt es im Sperrbildschirm still.' : 'Prüf den Rest mit einem Test-Push.') + '</span></div>' +
    rows.map(r =>
      '<div class="diag-row"><span class="diag-icon ' + (r.ok === true ? 'ok' : r.ok === false ? 'fehlt' : 'unklar') + '" aria-hidden="true">' +
      (r.ok === true ? '✓' : r.ok === false ? '!' : '?') + '</span>' +
      '<span class="diag-main"><span class="diag-titel">' + esc(r.titel) + '</span>' +
      '<span class="diag-text">' + r.text + '</span></span></div>').join('') +
    '</div>';
}

function settingRow(title, sub, control) {
  return '<div class="setting-row"><div class="li-main"><div class="li-title li-title-sm">' + esc(title) + '</div>' +
    '<div class="li-sub li-sub-wrap">' + esc(sub) + '</div></div>' + control + '</div>';
}
function switchHtml(key, on) {
  return '<label class="switch"><input type="checkbox" data-set="' + key + '"' + (on ? ' checked' : '') + '><span class="knob"></span></label>';
}
function miniInput(key, val) {
  return '<input class="input-mini" inputmode="decimal" value="' + val + '" data-set="' + key + '">';
}

/* ---------- Export / Import ---------- */
function doExport() {
  const data = JSON.stringify(S, null, 1);
  const name = 'kraftlog-export-' + todayStr() + '.json';
  try {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    S.settings.lastExport = Date.now();
    save();
    showToast('Export: ' + name);
    render();
  } catch (e) {
    exportClipboard();
  }
}
function exportClipboard() {
  const data = JSON.stringify(S);
  const fertig = () => {
    S.settings.lastExport = Date.now();
    save();
    showToast('In Zwischenablage kopiert');
    render();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(data).then(fertig, () => exportTextarea(data));
  } else {
    exportTextarea(data);
  }
}
function exportTextarea(data) {
  openSheet('<div class="sheet-title">Export</div><div class="sheet-sub">Text markieren und kopieren:</div>' +
    '<textarea class="input" style="min-height:150px" readonly data-action="ta-select">' + esc(data) + '</textarea>');
  S.settings.lastExport = Date.now();
  save();
}
function tryImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { showToast('Ungültiges JSON'); return; }
  if (!obj || typeof obj !== 'object' || typeof obj.schemaVersion !== 'number' || !Array.isArray(obj.workouts)) {
    showToast('Keine gültige Kraftlog-Datei');
    return;
  }
  if (obj.schemaVersion > SCHEMA_VERSION) { showToast('Datei stammt aus einer neueren App-Version'); return; }
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e) { }
  readOnly = false;
  S = migrate(mergeState(obj));
  verlaufSub = null; uebSub = null; trainSub = null; editDraft = null; tplDraft = null;
  save();
  closeSheet();
  applyTheme();
  render();
  showToast('Import erfolgreich — vorherige Daten als Backup gesichert');
}

/* ---------- Strong-Import (CSV) ----------
 * Liest den CSV-Export der Strong-App (Profil → "Export Strong Data"),
 * übersetzt Übungsnamen auf Kraftlog-Übungen und importiert Workouts + Läufe.
 * Unbekannte Übungen werden automatisch als eigene Übungen angelegt.
 */
const STRONG_MAP = {
  'bench press (barbell)': 'bankdruecken-lh', 'bench press': 'bankdruecken-lh',
  'incline bench press (barbell)': 'schraegbank-lh', 'incline bench press': 'schraegbank-lh',
  'bench press (dumbbell)': 'bankdruecken-kh',
  'incline bench press (dumbbell)': 'schraegbank-kh',
  'chest fly (dumbbell)': 'fliegende-kh', 'chest fly': 'fliegende-kh', 'fly (dumbbell)': 'fliegende-kh',
  'cable crossover': 'cable-crossover', 'cable fly': 'cable-crossover', 'cable fly crossovers': 'cable-crossover',
  'chest fly (machine)': 'butterfly', 'pec deck (machine)': 'butterfly', 'butterfly (machine)': 'butterfly',
  'chest press (machine)': 'brustpresse',
  'chest dip': 'dips', 'dip': 'dips', 'chest dip (assisted)': 'dips',
  'push up': 'liegestuetze', 'push ups': 'liegestuetze',
  'deadlift (barbell)': 'kreuzheben', 'deadlift': 'kreuzheben',
  'sumo deadlift (barbell)': 'sumo-kreuzheben', 'sumo deadlift': 'sumo-kreuzheben',
  'pull up': 'klimmzuege', 'pull up (weighted)': 'klimmzuege', 'chin up': 'klimmzuege', 'pull up (assisted)': 'klimmzuege',
  'lat pulldown (cable)': 'latzug', 'lat pulldown (machine)': 'latzug', 'lat pulldown': 'latzug',
  'lat pulldown - close grip (cable)': 'latzug-eng', 'close grip lat pulldown': 'latzug-eng',
  'bent over row (barbell)': 'lh-rudern', 'bent over row': 'lh-rudern', 'pendlay row (barbell)': 'lh-rudern',
  'bent over one arm row (dumbbell)': 'kh-rudern', 'dumbbell row': 'kh-rudern',
  'seated row (cable)': 'kabelrudern', 'seated cable row': 'kabelrudern',
  't bar row': 'tbar-rudern',
  'seated row (machine)': 'rudermaschine', 'row (machine)': 'rudermaschine', 'iso-lateral row (machine)': 'rudermaschine',
  'pullover (dumbbell)': 'ueberzuege',
  'shrug (barbell)': 'shrugs', 'shrug (dumbbell)': 'shrugs', 'shrug': 'shrugs',
  'overhead press (barbell)': 'schulterdruecken-lh', 'overhead press': 'schulterdruecken-lh',
  'strict military press (barbell)': 'schulterdruecken-lh', 'push press': 'schulterdruecken-lh',
  'overhead press (dumbbell)': 'schulterdruecken-kh', 'shoulder press (dumbbell)': 'schulterdruecken-kh',
  'seated overhead press (dumbbell)': 'schulterdruecken-kh',
  'shoulder press (machine)': 'schulterdruecken-masch', 'shoulder press (plate loaded)': 'schulterdruecken-masch',
  'shoulder press': 'schulterdruecken-masch',
  'arnold press (dumbbell)': 'arnold-press',
  'lateral raise (dumbbell)': 'seitheben', 'lateral raise': 'seitheben',
  'lateral raise (cable)': 'seitheben-kabel',
  'rear delt reverse fly (dumbbell)': 'vorgebeugtes-seitheben',
  'rear delt reverse fly (machine)': 'reverse-butterfly', 'reverse fly (machine)': 'reverse-butterfly',
  'face pull (cable)': 'face-pulls', 'face pull': 'face-pulls',
  'front raise (dumbbell)': 'frontheben', 'front raise (barbell)': 'frontheben', 'front raise': 'frontheben',
  'bicep curl (barbell)': 'lh-curls',
  'ez bar curl': 'sz-curls', 'bicep curl (ez bar)': 'sz-curls',
  'bicep curl (dumbbell)': 'kh-curls', 'bicep curl': 'kh-curls',
  'hammer curl (dumbbell)': 'hammer-curls', 'hammer curl': 'hammer-curls',
  'preacher curl (barbell)': 'scott-curls', 'preacher curl (dumbbell)': 'scott-curls', 'preacher curl (machine)': 'scott-curls', 'preacher curl': 'scott-curls',
  'bicep curl (cable)': 'kabel-curls', 'cable curl': 'kabel-curls',
  'concentration curl (dumbbell)': 'konzentrations-curls', 'concentration curl': 'konzentrations-curls',
  'bench press - close grip (barbell)': 'enges-bankdruecken', 'close grip bench press': 'enges-bankdruecken',
  'triceps pushdown (cable - straight bar)': 'trizeps-kabel', 'triceps pushdown': 'trizeps-kabel', 'triceps rope pushdown': 'trizeps-kabel',
  'triceps extension (cable)': 'trizeps-overhead-kabel', 'overhead triceps extension (cable)': 'trizeps-overhead-kabel',
  'skullcrusher (barbell)': 'french-press', 'skullcrusher (dumbbell)': 'french-press', 'skullcrusher': 'french-press', 'lying triceps extension': 'french-press',
  'triceps extension (dumbbell)': 'trizeps-kh-overhead', 'seated triceps press': 'trizeps-kh-overhead', 'triceps extension': 'trizeps-kh-overhead',
  'triceps kickback (dumbbell)': 'kickbacks', 'kickback': 'kickbacks',
  'bench dip': 'bench-dips',
  'squat (barbell)': 'kniebeugen', 'squat': 'kniebeugen',
  'front squat (barbell)': 'frontkniebeugen', 'front squat': 'frontkniebeugen',
  'squat (smith machine)': 'kniebeugen-multi',
  'goblet squat (kettlebell)': 'goblet-squats', 'goblet squat (dumbbell)': 'goblet-squats', 'goblet squat': 'goblet-squats',
  'leg press': 'beinpresse', 'leg press (machine)': 'beinpresse',
  'hack squat': 'hackenschmidt', 'hack squat (machine)': 'hackenschmidt',
  'lunge (dumbbell)': 'ausfallschritte', 'lunge (barbell)': 'ausfallschritte', 'lunge': 'ausfallschritte', 'walking lunge': 'ausfallschritte',
  'bulgarian split squat': 'bulgarian-split', 'split squat (dumbbell)': 'bulgarian-split',
  'romanian deadlift (barbell)': 'rumaenisches-kh', 'romanian deadlift (dumbbell)': 'rumaenisches-kh', 'romanian deadlift': 'rumaenisches-kh',
  'stiff leg deadlift (barbell)': 'rumaenisches-kh',
  'leg extension (machine)': 'beinstrecker', 'leg extension': 'beinstrecker',
  'lying leg curl (machine)': 'beinbeuger-liegend', 'lying leg curl': 'beinbeuger-liegend',
  'seated leg curl (machine)': 'beinbeuger-sitzend', 'seated leg curl': 'beinbeuger-sitzend',
  'hip adductor (machine)': 'adduktion',
  'hip thrust (barbell)': 'hip-thrusts', 'hip thrust': 'hip-thrusts',
  'glute bridge': 'glute-bridge',
  'glute kickback (machine)': 'glute-kickbacks', 'cable kickback': 'glute-kickbacks',
  'hip abductor (machine)': 'abduktion',
  'pull through (cable)': 'hueftstrecken-kabel',
  'crunch': 'crunches', 'sit up': 'crunches',
  'cable crunch': 'kabel-crunches',
  'ab crunch machine': 'bauchmaschine', 'crunch (machine)': 'bauchmaschine',
  'hanging leg raise': 'beinheben-haengend', 'hanging knee raise': 'beinheben-haengend',
  'lying leg raise': 'beinheben-liegend', 'leg raise': 'beinheben-liegend',
  'russian twist': 'russian-twists',
  'plank': 'plank',
  'standing calf raise (machine)': 'wadenheben-stehend', 'standing calf raise (barbell)': 'wadenheben-stehend', 'standing calf raise': 'wadenheben-stehend', 'calf raise': 'wadenheben-stehend',
  'seated calf raise (machine)': 'wadenheben-sitzend', 'seated calf raise': 'wadenheben-sitzend',
  'calf press on leg press': 'wadenheben-beinpresse', 'calf press (machine)': 'wadenheben-beinpresse', 'calf press': 'wadenheben-beinpresse',
  'wrist curl (barbell)': 'handgelenk-curls', 'wrist curl (dumbbell)': 'handgelenk-curls', 'wrist curl': 'handgelenk-curls',
  'reverse curl (barbell)': 'reverse-curls', 'reverse curl (ez bar)': 'reverse-curls', 'reverse curl': 'reverse-curls',
  'farmers walk': 'farmers-walk', "farmer's walk": 'farmers-walk', 'farmers walk (dumbbell)': 'farmers-walk'
};
const STRONG_LAUF = ['running', 'running (treadmill)', 'treadmill', 'jogging', 'trail running', 'laufen', 'laufband'];
const STRONG_RAD = ['cycling', 'cycling (indoor)', 'cycling (outdoor)', 'radfahren', 'spinning'];

/* Robuster CSV-Parser (Anführungszeichen, Kommas/Zeilenumbrüche in Feldern) */
function parseCsv(text, delim) {
  const rows = [];
  let row = [], feld = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; }
        else inQ = false;
      } else feld += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      row.push(feld); feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(feld); feld = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else feld += c;
  }
  if (feld !== '' || row.length) { row.push(feld); rows.push(row); }
  return rows;
}

function strongGuessMgEq(name) {
  const n = name.toLowerCase();
  let eq = 'Maschine';
  if (n.includes('(barbell)')) eq = 'Langhantel';
  else if (n.includes('(dumbbell)') || n.includes('(kettlebell)')) eq = 'Kurzhantel';
  else if (n.includes('(cable')) eq = 'Kabelzug';
  else if (n.includes('(smith')) eq = 'Multipresse';
  else if (n.includes('(ez bar)')) eq = 'SZ-Stange';
  else if (n.includes('(bodyweight)') || n.includes('(weighted)') || n.includes('(assisted)')) eq = 'Körpergewicht';
  let mg = 'Rücken';
  if (/reverse fly|rear delt/.test(n)) mg = 'Schultern';
  else if (/wallsit|wall sit/.test(n)) mg = 'Beine';
  else if (/schienbein|tibialis/.test(n)) mg = 'Waden';
  else if (/beinheben/.test(n)) mg = 'Bauch/Core';
  else if (/brücke/.test(n)) mg = 'Gesäß';
  else if (/dehnen|foam roll|mobilit|kreisen|pendeln|einbeinstand|eineinstand|hüftbeuger/.test(n)) mg = 'Beine';
  else if (/curl/.test(n) && !/leg|wrist|reverse/.test(n)) mg = 'Bizeps';
  else if (/tricep|skull|pushdown|extension/.test(n) && !/leg|back/.test(n)) mg = 'Trizeps';
  else if (/bench|chest|fly|push up|dip/.test(n)) mg = 'Brust';
  else if (/shoulder|overhead|lateral|delt|face pull|front raise|press/.test(n)) mg = 'Schultern';
  else if (/calf/.test(n)) mg = 'Waden';
  else if (/glute|hip thrust|bridge|abduct/.test(n)) mg = 'Gesäß';
  else if (/squat|leg|lunge|adduct/.test(n)) mg = 'Beine';
  else if (/crunch|plank|ab |twist|raise|sit up/.test(n)) mg = 'Bauch/Core';
  else if (/wrist|forearm|farmer/.test(n)) mg = 'Unterarme';
  return { mg, eq };
}

function parseStrongDauer(str) { // "1h 10m", "45m", "58s"
  if (!str) return null;
  let sec = 0;
  const h = str.match(/(\d+)\s*h/); if (h) sec += (+h[1]) * 3600;
  const m = str.match(/(\d+)\s*m/); if (m) sec += (+m[1]) * 60;
  const s2 = str.match(/(\d+)\s*s/); if (s2) sec += (+s2[1]);
  return sec > 0 ? sec : null;
}

/* Pläne aus Workouts ableiten: pro (getrimmtem) Workout-Namen die neueste Einheit als Vorlage */
function medianRest(werte) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const r = Math.round(m / 15) * 15;
  return (r >= 30 && r <= 600) ? r : null;
}
function deriveTemplateExercises(w) {
  return w.exercises.map(wex => ({
    exId: wex.exId,
    restSec: medianRest(wex.sets.map(s => s.restSec).filter(x => x != null)),
    sets: wex.sets.filter(s => s.reps > 0).map(s => s.warmup
      ? { warmup: true, kg: s.kg != null ? s.kg : 0, reps: s.reps }
      : { reps: s.reps })
  })).filter(it => it.sets.length);
}
function erstellePlaeneAus(workouts) {
  const neueste = new Map();
  for (const w of workouts) {
    const name = (w.name || '').trim() || 'Import';
    const alt = neueste.get(name);
    if (!alt || w.startedAt > alt.startedAt) neueste.set(name, w);
  }
  const angelegt = [], uebersprungen = [];
  let n = 0;
  for (const [name, w] of neueste) {
    if (S.templates.some(t => t.name.trim().toLowerCase() === name.toLowerCase())) { uebersprungen.push(name); continue; }
    const exs = deriveTemplateExercises(w);
    if (!exs.length) continue;
    S.templates.push({ id: 't-' + Date.now() + '-' + (++n), name, createdAt: Date.now(), exercises: exs });
    angelegt.push(name);
  }
  return { angelegt, uebersprungen };
}
function strongStart(modus) {
  const einheit = $('#strong-unit').value;
  const originalNamen = $('#strong-namen').checked;
  const f = $('#strong-file').files[0];
  const los = t => { try { importStrongCsv(t, einheit, modus, originalNamen); } catch (e) { showToast('Import fehlgeschlagen: ' + e.message); } };
  if (f) {
    const r = new FileReader();
    r.onload = () => los(r.result);
    r.readAsText(f);
  } else {
    const t = $('#strong-text').value.trim();
    if (!t) { showToast('Bitte Datei wählen oder Text einfügen'); return; }
    los(t);
  }
}
/* Pläne als Datei exportieren/importieren — inkl. der referenzierten eigenen Übungen,
   damit geteilte Pläne auch bei Freunden funktionieren. */
function exportPlaene(ids) {
  const tpls = S.templates.filter(t => ids.indexOf(t.id) >= 0);
  if (!tpls.length) { showToast('Nichts ausgewählt'); return; }
  const exIds = new Set();
  tpls.forEach(t => t.exercises.forEach(it => exIds.add(it.exId)));
  const daten = {
    typ: 'kraftlog-plaene', schemaVersion: SCHEMA_VERSION,
    templates: tpls,
    customExercises: S.customExercises.filter(c => exIds.has(c.id))
  };
  const json = JSON.stringify(daten, null, 1);
  const name = 'kraftlog-plaene-' + todayStr() + '.json';
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast(tpls.length + ' Pläne exportiert: ' + name);
  } catch (e) {
    openSheet('<div class="sheet-title">Pläne exportieren</div><div class="sheet-sub">Text markieren und kopieren:</div>' +
      '<textarea class="input" style="min-height:150px" readonly data-action="ta-select">' + esc(json) + '</textarea>');
  }
}
function importPlaene(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { showToast('Ungültiges JSON'); return; }
  if (!obj || obj.typ !== 'kraftlog-plaene' || !Array.isArray(obj.templates)) {
    showToast('Keine Kraftlog-Plan-Datei');
    return;
  }
  /* Mitgelieferte eigene Übungen anlegen bzw. per Name auf vorhandene umleiten */
  const remap = {};
  (Array.isArray(obj.customExercises) ? obj.customExercises : []).forEach(c => {
    if (!c || !c.id || !c.name) return;
    if (allExercises().some(e => e.id === c.id)) return;
    const perName = allExercises().find(e => e.name.toLowerCase() === String(c.name).toLowerCase());
    if (perName) { remap[c.id] = perName.id; return; }
    S.customExercises.push({
      id: String(c.id), name: String(c.name).trim(),
      mg: MGS.indexOf(c.mg) >= 0 ? c.mg : 'Rücken',
      eq: EQS.indexOf(c.eq) >= 0 ? c.eq : 'Maschine',
      compound: !!c.compound
    });
  });
  const angelegt = [], uebersprungen = [];
  let n = 0;
  obj.templates.forEach(t => {
    if (!t || !t.name || !Array.isArray(t.exercises)) return;
    const name = String(t.name).trim();
    if (S.templates.some(x => x.name.trim().toLowerCase() === name.toLowerCase())) { uebersprungen.push(name); return; }
    const exs = t.exercises
      .filter(it => it && it.exId)
      .map(it => normalizeTplExercise({ exId: remap[it.exId] || String(it.exId), restSec: it.restSec, sets: it.sets }))
      .filter(it => it.sets.length && allExercises().some(e => e.id === it.exId));
    if (!exs.length) return;
    S.templates.push({ id: 't-import-' + Date.now() + '-' + (++n), name, createdAt: Date.now(), exercises: exs });
    angelegt.push(name);
  });
  save();
  closeSheet();
  render();
  plaeneErgebnisSheet({ angelegt, uebersprungen }, 'Die importierten Pläne findest du unter „Pläne verwalten" — dort kannst du alles anpassen.');
}

function plaeneErgebnisSheet(erg, hinweis) {
  openSheet('<div class="sheet-title">Pläne erstellt</div><div class="sheet-sub">' +
    (erg.angelegt.length ? erg.angelegt.length + ' Pläne angelegt: <b>' + erg.angelegt.map(esc).join('</b>, <b>') + '</b>' : 'Keine neuen Pläne angelegt.') +
    (erg.uebersprungen.length ? '<br>Übersprungen, weil der Name schon existiert: ' + erg.uebersprungen.map(esc).join(', ') : '') +
    '<br><br>' + (hinweis || 'Jeder Plan entspricht deiner jeweils letzten Einheit dieses Workouts — inkl. Aufwärmsätzen und typischer Pausenzeit. Unter „Pläne verwalten" kannst du alles anpassen.') + '</div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Fertig</button></div>');
}

function importStrongCsv(text, standardEinheit, modus, originalNamen) {
  modus = modus || 'verlauf';
  text = text.replace(/^﻿/, ''); // UTF-8-BOM entfernen
  const delim = ((text.split('\n')[0] || '').split(';').length > (text.split('\n')[0] || '').split(',').length) ? ';' : ',';
  const rows = parseCsv(text, delim);
  if (rows.length < 2) { showToast('Datei ist leer oder kein CSV'); return; }
  const header = rows[0].map(h => h.trim().toLowerCase());
  /* Strong exportiert die Spaltennamen in der App-Sprache — deutsche + englische Aliase */
  const col = (...namen) => {
    for (const n of namen) { const i = header.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  const iDate = col('date', 'datum');
  const iWo = col('workout name', 'workout-name');
  const iDur = col('duration', 'workout duration', 'dauer');
  const iEx = col('exercise name', 'name der übung', 'übung', 'übungsname');
  const iOrd = col('set order', 'reihenfolge festlegen', 'satz-reihenfolge');
  const iKg = col('weight', 'gewicht');
  const iKgU = col('weight unit', 'gewichtseinheit');
  const iReps = col('reps', 'wiederh.', 'wiederholungen');
  const iDist = col('distance', 'entfernung', 'distanz');
  const iDistU = col('distance unit', 'entfernungseinheit');
  const iSec = col('seconds', 'sekunden');
  const iNote = col('workout notes', 'workout-notizen', 'notizen');
  const iRpe = col('rpe');
  if (iDate < 0 || iEx < 0) {
    showToast('Spalten nicht erkannt — gefunden: ' + header.join(', '));
    return;
  }

  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e) { }

  /* Zeilen zu Workouts gruppieren (Datum + Workout-Name) */
  const gruppen = new Map();
  for (let r = 1; r < rows.length; r++) {
    const zeile = rows[r];
    if (!zeile[iDate] || !zeile[iEx]) continue;
    const key = zeile[iDate] + '||' + (iWo >= 0 ? zeile[iWo] : '');
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(zeile);
  }
  /* Nur-Pläne-Modus: pro Workout-Name nur die neueste Einheit betrachten */
  if (modus === 'plaene') {
    const neueste = new Map();
    for (const [key, zeilen] of gruppen) {
      const t = new Date(zeilen[0][iDate].trim().replace(' ', 'T')).getTime();
      const name = (iWo >= 0 && zeilen[0][iWo]) ? zeilen[0][iWo].trim() : 'Import';
      const alt = neueste.get(name);
      if (!alt || t > alt.t) neueste.set(name, { t, key });
    }
    const behalten = new Set([...neueste.values()].map(x => x.key));
    for (const key of [...gruppen.keys()]) if (!behalten.has(key)) gruppen.delete(key);
  }
  const neueWorkouts = [];

  const neueCustoms = new Map(); // strong-name → exId
  let cuZaehler = 0;
  const findeExId = name => {
    const n = name.trim().toLowerCase();
    const basis = n.replace(/\s*\(.*\)$/, '');
    /* Nur bei abgeschaltetem Original-Namen-Modus auf Kraftlog-Übungen abbilden */
    if (!originalNamen) {
      if (STRONG_MAP[n]) return STRONG_MAP[n];
      if (STRONG_MAP[basis]) return STRONG_MAP[basis];
    }
    /* Exakter Namens-Treffer (eingebaut oder bereits angelegt) — macht Re-Importe stabil */
    const vorhanden = allExercises().find(e => e.name.toLowerCase() === n);
    if (vorhanden) return vorhanden.id;
    if (neueCustoms.has(n)) return neueCustoms.get(n);
    /* Neu anlegen mit Original-Namen. Kategorie: wenn die Übung bekannt ist (Mapping),
       Muskelgruppe/Grundübungs-Flag von der Kraftlog-Entsprechung erben — nur der Name bleibt original. */
    const vorlageId = STRONG_MAP[n] || STRONG_MAP[basis];
    const rat = strongGuessMgEq(name);
    let mg = rat.mg, eq = rat.eq, compound = false;
    if (vorlageId) {
      const v = exById(vorlageId);
      mg = v.mg;
      compound = !!v.compound;
      /* Equipment: Klammerhinweis im Original-Namen gewinnt, sonst von der Vorlage */
      eq = /\((barbell|dumbbell|kettlebell|cable|machine|smith|ez bar|bodyweight|weighted|assisted)/i.test(name) ? rat.eq : v.eq;
    }
    const id = 'cu-' + Date.now() + '-' + (++cuZaehler);
    S.customExercises.push({ id, name: name.trim(), mg, eq, compound });
    neueCustoms.set(n, id);
    return id;
  };

  let nWorkouts = 0, nSaetze = 0, nLaeufe = 0, nUebersprungen = 0, nRad = 0, nPausen = 0;
  for (const [key, zeilen] of gruppen) {
    const startedAt = new Date(zeilen[0][iDate].trim().replace(' ', 'T')).getTime();
    if (isNaN(startedAt)) continue;
    const woName = (iWo >= 0 && zeilen[0][iWo]) ? zeilen[0][iWo].trim() : 'Import';
    let dauer = iDur >= 0 ? parseStrongDauer(zeilen[0][iDur]) : null;
    if (dauer && dauer > 6 * 3600) dauer = null;   // liegengelassene Workouts ("22h 51min") nicht als Dauer werten
    const wid = 'w-strong-' + startedAt + '-' + woName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    if (modus !== 'plaene' && S.workouts.some(w => w.id === wid)) { nUebersprungen++; continue; }

    const exListe = [];   // Reihenfolge erhalten
    const exMap = new Map();
    let laufKm = 0, laufSec = 0;
    let setIdx = 0;
    for (const z of zeilen) {
      const exName = z[iEx].trim();
      if (!exName) continue;
      const ordnung = iOrd >= 0 ? String(z[iOrd]).trim() : '';
      /* "Ruhezeit"/"Rest Timer"-Zeilen: Pausendauer dem letzten Satz dieser Übung zuschreiben */
      if (/^(ruhezeit|rest timer|rest)$/i.test(ordnung)) {
        const wex = exMap.get(exName);
        const pause = iSec >= 0 ? parseNum(z[iSec]) : null;
        if (wex && wex.sets.length && pause > 0) {
          const letzter = wex.sets[wex.sets.length - 1];
          if (letzter.restSec == null) { letzter.restSec = Math.round(pause); nPausen++; }
        }
        continue;
      }
      /* Läufe separat einsammeln, Radfahren zählen (kein Lauf) */
      if (STRONG_LAUF.includes(exName.toLowerCase())) {
        let km = iDist >= 0 ? (parseNum(z[iDist]) || 0) : 0;
        if (iDistU >= 0 && /mile/i.test(z[iDistU] || '')) km *= 1.60934;
        laufKm += km;
        laufSec += iSec >= 0 ? (parseNum(z[iSec]) || 0) : 0;
        continue;
      }
      if (STRONG_RAD.includes(exName.toLowerCase())) { nRad++; continue; }
      let reps = iReps >= 0 ? parseNum(z[iReps]) : null;
      const sekunden = iSec >= 0 ? parseNum(z[iSec]) : null;
      if ((reps == null || reps <= 0) && sekunden > 0) reps = Math.round(sekunden); // z. B. Plank: Sekunden ins Wdh.-Feld
      if (reps == null || reps <= 0) continue;
      let kg = iKg >= 0 ? (parseNum(z[iKg]) || 0) : 0;
      const einheit = iKgU >= 0 && z[iKgU] ? z[iKgU].trim().toLowerCase() : standardEinheit;
      if (/lb/.test(einheit)) kg = Math.round(kg * 0.453592 * 100) / 100;
      const warm = /^w/i.test(ordnung) && isNaN(ordnung);
      let rpe = iRpe >= 0 ? parseNum(z[iRpe]) : null;
      if (rpe != null && (rpe < 1 || rpe > 10)) rpe = null;
      if (!exMap.has(exName)) { exMap.set(exName, { exId: findeExId(exName), repMin: null, repMax: null, sets: [] }); exListe.push(exMap.get(exName)); }
      exMap.get(exName).sets.push({ kg, reps: Math.round(reps), rpe, warmup: warm, doneAt: startedAt + (setIdx++) * 1000, restSec: null });
      nSaetze++;
    }
    if (modus !== 'plaene' && laufKm > 0 && laufSec > 0) {
      const rid = 'r-strong-' + startedAt;
      if (!S.runs.some(r => r.id === rid)) {
        S.runs.push({ id: rid, startedAt, distanzKm: Math.round(laufKm * 100) / 100, dauerSec: Math.round(laufSec), notiz: woName !== 'Import' ? woName : '' });
        nLaeufe++;
      }
    }
    if (exListe.length) {
      const wo = {
        id: wid, templateId: null, name: woName, startedAt,
        finishedAt: dauer ? startedAt + dauer * 1000 : null,
        notiz: (iNote >= 0 && zeilen[0][iNote]) ? zeilen[0][iNote].trim() : '',
        exercises: exListe
      };
      if (modus === 'plaene') neueWorkouts.push(wo);
      else S.workouts.push(wo);
      nWorkouts++;
    }
  }
  /* Nur-Pläne-Modus: Vorlagen ableiten, Verlauf unangetastet lassen */
  if (modus === 'plaene') {
    const erg = erstellePlaeneAus(neueWorkouts);
    save();
    closeSheet();
    tab = 'start';
    trainSub = 'plaene';
    render();
    plaeneErgebnisSheet(erg);
    return;
  }
  S.workouts.sort((a, b) => a.startedAt - b.startedAt);
  S.runs.sort((a, b) => a.startedAt - b.startedAt);
  save();
  closeSheet();
  verlaufSub = null;
  render();
  openSheet('<div class="sheet-title">Strong-Import fertig</div>' +
    '<div class="sheet-sub">' + nWorkouts + ' Workouts mit ' + nSaetze + ' Sätzen importiert' +
    (nLaeufe ? ' · ' + nLaeufe + ' Läufe' : '') +
    (nPausen ? '<br>' + nPausen + ' Pausenzeiten übernommen' : '') +
    (neueCustoms.size ? '<br>' + neueCustoms.size + ' unbekannte Übungen als „eigene Übungen" angelegt' : '') +
    (nRad ? '<br>' + nRad + ' Radfahr-Einträge übersprungen (Kraftlog trackt Läufe, kein Rad)' : '') +
    (nUebersprungen ? '<br>' + nUebersprungen + ' bereits vorhandene übersprungen' : '') +
    '<br>Vorherige Daten wurden als Backup gesichert.</div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Fertig</button></div>');
}

/* ---------- Strava-Anbindung (über eigenen Cloudflare-Worker-Proxy) ---------- */
function stravaVerbunden() {
  const st = S.settings.strava;
  return !!(st && st.refreshToken && st.workerUrl);
}
function stravaWorker(pfad) {
  return S.settings.strava.workerUrl.replace(/\/+$/, '') + pfad;
}
/* Zentraler Worker-Aufruf: hängt den Zugangsschlüssel an (X-Kraftlog-Key)
 * und meldet einen falschen/fehlenden Schlüssel verständlich. */
function workerFetch(pfad, opts) {
  opts = opts || {};
  const kopf = Object.assign({}, opts.headers);
  if (S.settings.workerKey) kopf['X-Kraftlog-Key'] = S.settings.workerKey;
  opts.headers = kopf;
  return fetch(stravaWorker(pfad), opts).then(r => {
    if (r.status === 401) {
      /* Nur der Worker-eigene 401 betrifft den Schlüssel — Strava-401er
       * (z. B. entzogener Zugriff) werden 1:1 durchgereicht und anders behandelt */
      r.clone().json().then(d => {
        if (d && typeof d.message === 'string' && d.message.indexOf('Zugangsschlüssel') === 0) {
          showToast('Zugangsschlüssel fehlt oder ist falsch (Daten → Zugangsschlüssel)');
        }
      }).catch(() => { });
    }
    return r;
  });
}
function isoLokal(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
async function stravaToken(body) {
  const st = S.settings.strava;
  const r = await workerFetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(d.message || 'Token-Fehler (' + r.status + ')');
  st.accessToken = d.access_token;
  st.accessBis = (d.expires_at || 0) * 1000;
  if (d.refresh_token) st.refreshToken = d.refresh_token;
  if (d.athlete) st.athlet = ((d.athlete.firstname || '') + ' ' + (d.athlete.lastname || '')).trim();
  save();
}
async function stravaAccess() {
  const st = S.settings.strava;
  if (st.accessToken && st.accessBis > Date.now() + 60000) return st.accessToken;
  await stravaToken({ refresh_token: st.refreshToken });
  return st.accessToken;
}
async function stravaAktivitaet(daten) {
  const token = await stravaAccess();
  const r = await workerFetch('/activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(daten)
  });
  const d = await r.json();
  if (!r.ok || !d.id) throw new Error(d.message || 'Strava-Fehler (' + r.status + ')');
  return d.id;
}
function stravaBeschreibung(w) {
  const zeilen = w.exercises.map(wex => {
    const ws = workingSets(wex);
    const t = topSet(ws);
    return exById(wex.exId).name + ': ' + ws.length + (ws.length === 1 ? ' Satz' : ' Sätze') + (t && t.kg > 0 ? ' · Top ' + fmtKg(t.kg) + ' kg × ' + t.reps : '');
  });
  const prs = allPrEvents().filter(ev => ev.w.id === w.id).length;
  let text = zeilen.join('\n') + '\nVolumen: ' + fmtVol(workoutVolume(w));
  if (prs) text += '\n' + prs + ' neue Bestleistung' + (prs > 1 ? 'en' : '');
  return (text + '\n\nGetrackt mit Kraftlog').slice(0, 1900);
}
async function stravaPosteWorkout(wId, leise) {
  const w = S.workouts.find(x => x.id === wId);
  if (!w || w.stravaId || !stravaVerbunden()) return;
  try {
    const id = await stravaAktivitaet({
      name: w.name,
      sport_type: 'WeightTraining',
      start_date_local: isoLokal(w.startedAt),
      elapsed_time: Math.max(60, Math.round(((w.finishedAt || w.startedAt + 3600000) - w.startedAt) / 1000)),
      description: stravaBeschreibung(w)
    });
    w.stravaId = id;
    save();
    render();
    showToast('Auf Strava gepostet');
  } catch (e) {
    if (!leise) showToast('Strava: ' + e.message + ' — später im Verlauf erneut versuchen');
  }
}
async function stravaPosteLauf(rId, leise) {
  const r = S.runs.find(x => x.id === rId);
  if (!r || r.stravaId || !stravaVerbunden()) return;
  try {
    const id = await stravaAktivitaet({
      name: r.notiz || 'Lauf',
      sport_type: 'Run',
      start_date_local: isoLokal(r.startedAt),
      elapsed_time: Math.round(r.dauerSec),
      distance: Math.round(r.distanzKm * 1000),
      description: 'Getrackt mit Kraftlog'
    });
    r.stravaId = id;
    save();
    render();
    showToast('Lauf auf Strava gepostet');
  } catch (e) {
    if (!leise) showToast('Strava: ' + e.message);
  }
}
/* Rückkehr aus der Strava-Freigabe (?code=…) */
function stravaOAuthRueckkehr() {
  const m = location.search.match(/[?&]code=([^&]+)/);
  if (!m) return;
  const code = decodeURIComponent(m[1]);
  try { history.replaceState(null, '', location.pathname); } catch (e) { }
  if (!S.settings.strava.workerUrl) return;
  stravaToken({ code }).then(() => {
    tab = 'daten';
    render();
    showToast('Mit Strava verbunden' + (S.settings.strava.athlet ? ' als ' + S.settings.strava.athlet : ''));
  }).catch(e => showToast('Strava-Verbindung fehlgeschlagen: ' + e.message));
}

/* ---------- Theme ---------- */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'hell' || t === 'dunkel') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

/* ---------- Aktionen (Klick-Dispatch über data-action) ---------- */
const ACTIONS = {
  'tab': el => { markViewAnim(); tab = el.dataset.tab; trainSub = null; uebSub = null; verlaufSub = null; editDraft = null; tplDraft = null; planAuswahl = null; satzAuswahl = null; closeSheet(); render(); window.scrollTo(0, 0); },
  'sheet-close': () => closeSheet(),

  /* Reha-Modus */
  'reha-schmerz': el => rehaSchmerzSheet(el.dataset.mg, el.dataset.exid || null),
  'reha-schmerz-set': el => {
    rehaEintragen(el.dataset.mg, 'uebung', +el.dataset.wert, el.dataset.exid || null);
    closeSheet();
    showToast('Eingetragen — morgen früh kommt der Morgen-Check');
    render();
  },
  'reha-morgen': el => rehaMorgenSheet(el.dataset.mg),
  'reha-morgen-set': el => {
    const mg = el.dataset.mg;
    rehaEintragen(mg, 'morgen', +el.dataset.wert, null);
    closeSheet();
    const w = rehaWerte(mg);
    const a = Coach.rehaAmpel(w.schmerz, w.morgenDelta);
    showToast(a.farbe === 'gruen' ? 'Grün — die Belastung wurde vertragen'
      : (a.farbe === 'rot' ? 'Rot — der Coach nimmt die Last zurück' : 'Gelb — gleiche Last wiederholen'));
    render();
  },
  'reha-detail': el => rehaDetailHtml(el.dataset.mg),
  'reha-an': el => {
    const mg = el.dataset.mg;
    const jetzt = Date.now();
    S.reha[mg] = Object.assign({ stufe: 2, basis: 0 }, S.reha[mg] || {},
      { aktiv: true, seit: jetzt, stufeSeit: jetzt });
    save();
    closeSheet();
    render();
    rehaDetailHtml(mg);
  },
  'reha-aus': el => {
    const mg = el.dataset.mg;
    if (S.reha[mg]) S.reha[mg].aktiv = false;   // Verlauf bleibt erhalten
    save();
    closeSheet();
    showToast(mg + ': Reha-Modus beendet');
    render();
  },
  'reha-stufe-vor': el => {
    const mg = el.dataset.mg;
    const r = S.reha[mg];
    if (!r) return;
    r.stufe = Math.min(4, (r.stufe || 2) + 1);
    r.stufeSeit = Date.now();
    save();
    closeSheet();
    showToast('Stufe ' + r.stufe + ' — ' + Coach.rehaStufe(r.stufe).name);
    render();
  },

  /* Training / Pläne */
  'train-home': () => { markViewAnim(); trainSub = null; tplDraft = null; planAuswahl = null; render(); },
  'plaene': () => { markViewAnim(); trainSub = 'plaene'; tplDraft = null; planAuswahl = null; render(); },

  /* Wochenplan */
  'wochenplan': () => { markViewAnim(); trainSub = 'wochenplan'; render(); window.scrollTo(0, 0); },
  'wp-tag': el => {
    const tag = el.dataset.tag;
    if (!S.templates.length) { showToast('Lege zuerst einen Plan an'); return; }
    let liste = '<button class="li-item" style="min-height:50px" data-action="wp-zuweisen" data-tag="' + tag + '">' +
      '<div class="li-main"><div class="li-title li-title-sm">Ruhetag</div><div class="li-sub">kein Training</div></div></button>';
    S.templates.forEach(t => {
      liste += '<button class="li-item" style="min-height:50px" data-action="wp-zuweisen" data-tag="' + tag + '" data-tpl="' + esc(t.id) + '">' +
        '<div class="li-main"><div class="li-title li-title-sm">' + esc(t.name) + '</div>' +
        '<div class="li-sub">' + t.exercises.length + ' Übungen · ' + saetzeVon(t) + ' Arbeitssätze</div></div></button>';
    });
    openSheet('<div class="sheet-title">' + WP_LABEL[tag] + '</div><div class="sheet-sub">Plan für diesen Tag wählen:</div>' + liste);
  },
  'wp-zuweisen': el => {
    if (el.dataset.tpl) S.wochenplan[el.dataset.tag] = el.dataset.tpl;
    else delete S.wochenplan[el.dataset.tag];
    save();
    closeSheet();
    render();
  },
  'wp-detail': el => {
    const mg = el.dataset.mg;
    let inhalt = '', gesamt = 0;
    for (const tag of WP_TAGE) {
      const tpl = S.templates.find(t => t.id === S.wochenplan[tag]);
      if (!tpl) continue;
      const teile = tpl.exercises
        .map(it => ({ ex: exById(it.exId), n: it.sets.filter(s => !s.warmup).length }))
        .filter(x => x.ex.mg === mg && x.n > 0);
      if (!teile.length) continue;
      inhalt += '<div class="hist-ex-name">' + WP_LABEL[tag] + ' · ' + esc(tpl.name) + '</div>';
      teile.forEach(x => {
        inhalt += '<div class="hist-set"><span class="hs-main hs-main-flex">' + esc(x.ex.name) + '</span>' +
          '<span class="hs-sub">' + x.n + ' ' + (x.n === 1 ? 'Satz' : 'Sätze') + '</span></div>';
        gesamt += x.n;
      });
    }
    const z = Coach.VOLUMEN[mg] || { min: 0, max: 99 };
    openSheet('<div class="sheet-title">' + esc(mg) + ' — Zusammensetzung</div>' +
      '<div class="sheet-sub">' + gesamt + ' direkte Arbeitssätze pro Woche · Ziel: ' + (z.min > 0 ? z.min + '–' + z.max : 'bis ' + z.max) + '</div>' +
      (inhalt ? '<div class="card" style="padding:10px 14px">' + inhalt + '</div>'
        : '<div class="empty"><p>Keine Übungen dieser Muskelgruppe im Wochenplan.</p></div>') +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Fertig</button></div>');
  },
  'wp-info': () => {
    let tabelle = '';
    MGS.forEach(mg => {
      const z = Coach.VOLUMEN[mg];
      tabelle += '<div class="hist-set" style="align-items:flex-start"><span class="hs-main" style="width:96px;flex-shrink:0">' + esc(mg) + '</span>' +
        '<span class="hs-sub" style="white-space:normal">' + (z.min > 0 ? z.min + '–' + z.max : 'optional, bis ' + z.max) + ' Sätze/Woche — ' + esc(z.hinweis) + '</span></div>';
    });
    openSheet('<div class="sheet-title">So rechnet die Analyse</div>' +
      '<div class="sheet-sub">Gezählt werden die <b>direkten Arbeitssätze</b> pro Muskelgruppe aus allen zugewiesenen Plänen einer Woche (Aufwärmsätze zählen nicht). Indirektes Volumen ist in den Zielbereichen bereits einkalkuliert — z. B. braucht der Trizeps wenig Direktvolumen, weil er beim Drücken mitarbeitet.</div>' +
      '<div class="card" style="padding:10px 14px">' + tabelle + '</div>' +
      '<div class="mini-note">Produktive Volumen-Bereiche für Hypertrophie (direkte Sätze/Woche). Grün = im Bereich, Orange = zu wenig, Rot = über dem sinnvollen Maximum.</div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Alles klar</button></div>');
  },
  'tpl-new': () => { tplDraft = { id: null, name: '', createdAt: null, exercises: [] }; trainSub = 'tpl-editor'; render(); },
  'tpl-edit': el => {
    const t = S.templates.find(x => x.id === el.dataset.id);
    if (!t) return;
    tplDraft = JSON.parse(JSON.stringify(t));
    trainSub = 'tpl-editor';
    closeSheet();
    render();
    window.scrollTo(0, 0);
  },
  'tpl-menu': el => {
    const t = S.templates.find(x => x.id === el.dataset.id);
    if (!t) return;
    openSheet('<div class="sheet-title">' + esc(t.name) + '</div>' +
      '<div class="sheet-sub">' + t.exercises.length + ' Übungen · ' + saetzeVon(t) + ' Arbeitssätze</div>' +
      '<div class="sheet-actions">' +
      '<button class="btn btn-primary" data-action="tpl-edit" data-id="' + esc(t.id) + '">Bearbeiten</button>' +
      '<button class="btn" data-action="tpl-single-dup" data-id="' + esc(t.id) + '">Duplizieren</button>' +
      '<button class="btn" data-action="tpl-single-export" data-id="' + esc(t.id) + '">Exportieren (teilen)</button>' +
      '<button class="btn btn-danger" data-action="tpl-single-del" data-id="' + esc(t.id) + '">Löschen</button></div>');
  },
  'tpl-single-dup': el => {
    const t = S.templates.find(x => x.id === el.dataset.id);
    if (!t) return;
    const kopie = JSON.parse(JSON.stringify(t));
    kopie.id = 't-' + Date.now() + '-k1';
    kopie.name = t.name + ' Kopie';
    kopie.createdAt = Date.now();
    S.templates.push(kopie);
    save();
    closeSheet();
    render();
    showToast('„' + kopie.name + '" angelegt');
  },
  'tpl-single-export': el => {
    closeSheet();
    exportPlaene([el.dataset.id]);
  },
  'tpl-single-del': el => {
    const t = S.templates.find(x => x.id === el.dataset.id);
    if (!t) return;
    openSheet('<div class="sheet-title">„' + esc(t.name) + '" löschen?</div>' +
      '<div class="sheet-sub">Deine Trainings im Verlauf bleiben erhalten.</div>' +
      '<div class="sheet-actions"><button class="btn btn-danger" data-action="tpl-single-del-confirm" data-id="' + esc(t.id) + '">Löschen</button>' +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
  },
  'tpl-single-del-confirm': el => {
    S.templates = S.templates.filter(x => x.id !== el.dataset.id);
    save();
    closeSheet();
    render();
    showToast('Plan gelöscht');
  },
  'tpl-mehr': () => openSheet('<div class="sheet-title">Pläne</div><div class="sheet-actions">' +
    '<button class="btn" data-action="plaene-auswahl">Mehrere auswählen (löschen / exportieren / duplizieren)</button>' +
    '<button class="btn" data-action="tpl-import-open">Pläne importieren…</button>' +
    (S.workouts.length ? '<button class="btn" data-action="tpl-derive-sheet">Pläne aus dem Verlauf erstellen</button>' : '') +
    '</div>'),
  'plaene-auswahl': () => {
    trainSub = 'plaene';
    tplDraft = null;
    planAuswahl = new Set();
    closeSheet();
    render();
  },
  'tpl-derive-sheet': () => {
    closeSheet();
    const erg = erstellePlaeneAus(S.workouts);
    save();
    render();
    plaeneErgebnisSheet(erg);
  },
  'tpl-add-ex': () => openExercisePicker(id => {
    tplDraft.exercises.push({ exId: id, restSec: null, sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] });
    render();
  }),
  'tpl-ex-up': el => { const i = +el.dataset.i; if (i > 0) { const a = tplDraft.exercises; [a[i - 1], a[i]] = [a[i], a[i - 1]]; render(); } },
  'tpl-ex-down': el => { const i = +el.dataset.i; const a = tplDraft.exercises; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; render(); } },
  'tpl-ex-del': el => { tplDraft.exercises.splice(+el.dataset.i, 1); render(); },
  'tpl-set-add': el => {
    const it = tplDraft.exercises[+el.dataset.i];
    const letzterArbeit = [...it.sets].reverse().find(s => !s.warmup);
    const neu = { reps: letzterArbeit ? letzterArbeit.reps : 10 };
    if (letzterArbeit && letzterArbeit.kg != null) neu.kg = letzterArbeit.kg;
    it.sets.push(neu);
    render();
  },
  'tpl-set-del': el => {
    const it = tplDraft.exercises[+el.dataset.i];
    it.sets.splice(+el.dataset.j, 1);
    if (!it.sets.length) tplDraft.exercises.splice(+el.dataset.i, 1); // letzter Satz weg → Übung raus
    render();
  },
  'tpl-set-warm': el => {
    const st = tplDraft.exercises[+el.dataset.i].sets[+el.dataset.j];
    st.warmup = !st.warmup;
    render();
  },
  'tpl-warmup': el => {
    const i = +el.dataset.i;
    const it = tplDraft.exercises[i];
    const ex = exById(it.exId);
    /* Vorschlag fürs Arbeitsgewicht: letzter Top-Satz dieser Übung, sonst leer */
    const last = lastSessionFor(it.exId);
    const top = last ? topSet(workingSets(last.wex)) : null;
    const vorschlag = top && top.kg > 0 ? fmtInput(top.kg) : '';
    openSheet('<div class="sheet-title">Aufwärmsätze berechnen</div>' +
      '<div class="sheet-sub">für <b>' + esc(ex.name) + '</b> — nur diese Übung. Gib dein heutiges Arbeitsgewicht ein.</div>' +
      '<div class="form-row"><label>Arbeitsgewicht (kg)</label>' +
      '<input class="input" id="wu-kg" inputmode="decimal" placeholder="z. B. 100" value="' + vorschlag + '" data-ex="' + esc(it.exId) + '"></div>' +
      '<div id="wu-preview">' + warmupPreviewHtml(it.exId, parseNum(vorschlag)) + '</div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="wu-apply" data-i="' + i + '">Als Aufwärmsätze übernehmen</button></div>');
  },
  'wu-apply': el => {
    const it = tplDraft.exercises[+el.dataset.i];
    const target = parseNum($('#wu-kg').value);
    if (!(target > 0)) { showToast('Bitte ein Arbeitsgewicht eingeben'); return; }
    const warm = computeWarmup(target, exById(it.exId)).map(s => ({ warmup: true, kg: s.kg, reps: s.reps }));
    if (!warm.length) { showToast('Kein Aufwärmen nötig — Gewicht zu leicht'); return; }
    it.sets = warm.concat(it.sets.filter(s => !s.warmup)); // vorhandene Aufwärmsätze ersetzen
    closeSheet();
    render();
    showToast(warm.length + ' Aufwärmsätze eingefügt');
  },
  'tpl-save': () => {
    if (!tplDraft.name.trim()) { showToast('Bitte einen Namen eingeben'); return; }
    if (!tplDraft.exercises.length) { showToast('Bitte mindestens eine Übung hinzufügen'); return; }
    tplDraft.name = tplDraft.name.trim();
    if (tplDraft.id) {
      const i = S.templates.findIndex(t => t.id === tplDraft.id);
      if (i >= 0) S.templates[i] = tplDraft;
    } else {
      tplDraft.id = 't-' + Date.now();
      tplDraft.createdAt = Date.now();
      S.templates.push(tplDraft);
    }
    save();
    tplDraft = null;
    trainSub = null;
    render();
    showToast('Plan gespeichert');
  },
  'tpl-del': () => openSheet('<div class="sheet-title">Plan löschen?</div><div class="sheet-sub">„' + esc(tplDraft.name) + '" wird entfernt. Deine Trainings im Verlauf bleiben erhalten.</div>' +
    '<div class="sheet-actions"><button class="btn btn-danger" data-action="tpl-del-confirm">Löschen</button>' +
    '<button class="btn" data-action="sheet-close">Abbrechen</button></div>'),
  'tpl-del-confirm': () => {
    S.templates = S.templates.filter(t => t.id !== tplDraft.id);
    save();
    tplDraft = null;
    trainSub = null;
    closeSheet();
    render();
  },

  /* Aktives Workout */
  'wo-start': el => startWorkout(el.dataset.tpl || null),
  'wo-menu': () => {
    const aw = S.activeWorkout;
    if (!aw) return;
    openSheet('<div class="sheet-title">' + esc(aw.name) + '</div><div class="sheet-actions">' +
      '<button class="btn" data-action="wo-add-ex">+ Übung hinzufügen</button>' +
      (aw.exercises.length > 1 ? '<button class="btn" data-action="wo-ex-order">Reihenfolge ändern…</button>' : '') +
      '<button class="btn btn-danger" data-action="wo-discard">Training verwerfen</button></div>');
  },
  'wo-add-ex': () => {
    openExercisePicker(id => {
      S.activeWorkout.exercises.push(buildWoExercise(id, 3, null));
      save();
      render();
    });
  },
  'wo-note': () => {
    const aw = S.activeWorkout;
    openSheet('<div class="sheet-title">Notiz</div>' +
      '<textarea class="input" id="wo-note-text" placeholder="z. B. wenig geschlafen, neues Gym…">' + esc(aw.notiz || '') + '</textarea>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="wo-note-save">Speichern</button></div>');
  },
  'wo-note-save': () => {
    S.activeWorkout.notiz = $('#wo-note-text').value.trim();
    save();
    closeSheet();
    render();
  },
  'wo-finish': () => {
    const aw = S.activeWorkout;
    if (!aw) return;
    let nArbeit = 0, nOffen = 0, vol = 0;
    aw.exercises.forEach(wex => wex.sets.forEach(s => {
      if (s.done === true) { if (!s.warmup) { nArbeit++; vol += setVolume(s); } }
      else nOffen++;
    }));
    if (!nArbeit) {
      openSheet('<div class="sheet-title">Leeres Training</div><div class="sheet-sub">Es wurden keine Arbeitssätze abgehakt. Training verwerfen?</div>' +
        '<div class="sheet-actions"><button class="btn btn-danger" data-action="wo-discard-confirm">Verwerfen</button>' +
        '<button class="btn" data-action="sheet-close">Weiter trainieren</button></div>');
      return;
    }
    openSheet('<div class="sheet-title">Training beenden?</div>' +
      '<div class="sheet-sub">' + nArbeit + ' Arbeitssätze · ' + fmtVol(vol) + ' Volumen · ' + fmtDauer((Date.now() - aw.startedAt) / 1000) +
      (nOffen ? '<br>' + nOffen + ' nicht abgehakte Sätze werden verworfen.' : '') + '</div>' +
      '<div class="sheet-actions"><button class="btn btn-green" data-action="wo-finish-confirm">Speichern & beenden</button>' +
      '<button class="btn" data-action="sheet-close">Weiter trainieren</button></div>');
  },
  'wo-finish-confirm': () => finishWorkout(),
  'pu-keep': () => { planUpdate = null; closeSheet(); },
  'pu-werte': () => {
    if (!planUpdate) { closeSheet(); return; }
    const tpl = S.templates.find(t => t.id === planUpdate.tplId);
    const w = S.workouts.find(x => x.id === planUpdate.workoutId);
    if (tpl && w) { tplWerteUpdate(tpl, w); save(); showToast('Plan-Werte aktualisiert'); }
    planUpdate = null;
    closeSheet();
  },
  'pu-struktur': () => {
    if (!planUpdate) { closeSheet(); return; }
    const tpl = S.templates.find(t => t.id === planUpdate.tplId);
    const w = S.workouts.find(x => x.id === planUpdate.workoutId);
    if (tpl && w) { tplStrukturUpdate(tpl, w); save(); showToast('Plan komplett aktualisiert'); }
    planUpdate = null;
    closeSheet();
  },
  'wo-discard': () => openSheet('<div class="sheet-title">Training verwerfen?</div><div class="sheet-sub">Alle Eingaben dieses Trainings gehen verloren.</div>' +
    '<div class="sheet-actions"><button class="btn btn-danger" data-action="wo-discard-confirm">Verwerfen</button>' +
    '<button class="btn" data-action="sheet-close">Abbrechen</button></div>'),
  'wo-discard-confirm': () => discardWorkout(),
  'check': el => checkSet(+el.dataset.ex, +el.dataset.set),
  'set-optionen': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex, si = +el.dataset.set;
    const wex = aw.exercises[xi];
    const s = wex.sets[si];
    /* Was ohne eigene Vorgabe passieren würde — damit „auto" nicht raten lässt. */
    const autoSec = (function () {
      const merk = s.restZiel;
      s.restZiel = null;
      const v = restZielFuerSatz(wex, si);
      s.restZiel = merk;
      return v;
    })();
    openSheet('<div class="sheet-title">' + esc(exById(wex.exId).name) + '</div>' +
      '<div class="sheet-sub">Satz ' + (si + 1) + (s.warmup ? ' (Aufwärmsatz)' : '') + '</div>' +
      '<div class="sheet-row-rest"><span>Pause danach</span>' +
      '<input class="num-input" inputmode="numeric" autocomplete="off" placeholder="' +
      (autoSec == null ? 'kein Timer' : 'auto (' + fmtMinSek(autoSec) + ')') + '" value="' +
      (s.restZiel != null ? s.restZiel : '') + '" data-setrest data-ex="' + xi + '" data-set="' + si + '" aria-label="Pause nach diesem Satz in Sekunden"><span>s</span></div>' +
      '<div class="mini-note">Leer = ' + (autoSec == null
        ? 'kein Timer (Rampensatz mitten im Aufwärmen).'
        : fmtMinSek(autoSec) + ' min aus ' + (s.warmup ? 'der Übung — letzter Aufwärmsatz vor dem ersten Arbeitssatz.' : 'Plan bzw. Coach.')) +
      ' Dauerhaft änderst du das in der Vorlage.</div>' +
      '<div class="sheet-actions">' +
      '<button class="btn" data-action="set-warmup" data-ex="' + xi + '" data-set="' + si + '">' +
      (s.warmup ? 'Als Arbeitssatz markieren' : 'Als Aufwärmsatz markieren') + '</button>' +
      '<button class="btn btn-danger" data-action="set-entfernen" data-ex="' + xi + '" data-set="' + si + '">Satz entfernen</button>' +
      (wex.sets.length > 1 ? '<button class="btn" data-action="satz-select-mode" data-ex="' + xi + '">Mehrere Sätze auswählen…</button>' : '') +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
  },
  'set-warmup': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    s.warmup = !s.warmup;
    /* Aufwärmsätze zählen nicht für PRs — der Wechsel kann die PR-Lage der
       ganzen Übung verschieben, in beide Richtungen. */
    if (s.done === true) prNeuBerechnen(+el.dataset.ex);
    save();
    closeSheet();
    render();
  },
  'set-entfernen': el => {
    if (!satzEntfernen(+el.dataset.ex, [+el.dataset.set])) { closeSheet(); return; }
    satzAuswahl = null;
    save();
    closeSheet();
    render();
    showToast('Satz entfernt');
  },

  /* --- Sätze auswählen und in einem Rutsch entfernen (auch mittendrin) --- */
  'satz-select-mode': el => {
    const xi = +el.dataset.ex;
    satzAuswahl = (satzAuswahl && satzAuswahl.xi === xi) ? null : { xi, sets: new Set() };
    closeSheet();
    render();
  },
  'satz-select': el => {
    if (!satzAuswahl) return;
    const si = +el.dataset.set;
    if (satzAuswahl.sets.has(si)) satzAuswahl.sets.delete(si);
    else satzAuswahl.sets.add(si);
    render();
  },
  'satz-select-all': el => {
    const wex = S.activeWorkout && S.activeWorkout.exercises[+el.dataset.ex];
    if (!wex || !satzAuswahl) return;
    if (satzAuswahl.sets.size === wex.sets.length) satzAuswahl.sets.clear();
    else wex.sets.forEach((_, i) => satzAuswahl.sets.add(i));
    render();
  },
  /* Offene Sätze verschwinden sofort — da geht nichts verloren. Sind abgehakte
     Sätze dabei, wird vorher gefragt: dort stecken bereits erfasste Werte. */
  'satz-select-del': el => {
    const xi = +el.dataset.ex;
    const wex = S.activeWorkout && S.activeWorkout.exercises[xi];
    if (!wex || !satzAuswahl || !satzAuswahl.sets.size) { showToast('Nichts ausgewählt'); return; }
    const idx = [...satzAuswahl.sets];
    const fertig = idx.filter(i => wex.sets[i] && wex.sets[i].done === true).length;
    if (fertig) {
      openSheet('<div class="sheet-title">' + idx.length + ' ' + (idx.length === 1 ? 'Satz' : 'Sätze') + ' entfernen?</div>' +
        '<div class="sheet-sub">' + fertig + ' davon ' + (fertig === 1 ? 'ist' : 'sind') + ' bereits abgehakt — ' +
        (fertig === 1 ? 'dieser Wert geht' : 'diese Werte gehen') + ' verloren.</div>' +
        '<div class="sheet-actions"><button class="btn btn-danger" data-action="satz-select-del-confirm" data-ex="' + xi + '">Entfernen</button>' +
        '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
      return;
    }
    ACTIONS['satz-select-del-confirm'](el);
  },
  'satz-select-del-confirm': el => {
    if (!satzAuswahl) { closeSheet(); return; }
    const n = satzEntfernen(+el.dataset.ex, [...satzAuswahl.sets]);
    satzAuswahl = null;
    save();
    closeSheet();
    render();
    if (n) showToast(n + ' ' + (n === 1 ? 'Satz' : 'Sätze') + ' entfernt');
  },
  'step': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    if (s.done === true) return;
    const feld = el.dataset.field;
    const inc = feld === 'kg' ? 2.5 : 1;
    let v = (s[feld] != null ? s[feld] : 0) + inc * (+el.dataset.dir);
    if (v < 0) v = 0;
    if (feld === 'reps') v = Math.round(v);
    s[feld] = v;
    const inp = el.parentElement.querySelector('input');
    if (inp) inp.value = feld === 'kg' ? fmtInput(v) : v;
    saveSoon();
  },
  'prog-apply': el => {
    const kg = parseNum(el.dataset.kg);
    if (kg == null) return;
    const reps = el.dataset.reps ? parseInt(el.dataset.reps, 10) : null;
    vorschlagAufSaetze(S.activeWorkout.exercises[+el.dataset.ex].sets, kg, reps);
    save();
    render();
    showToast('Vorschlag übernommen');
  },
  'prog-warum': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    const ex = exById(wex.exId);
    const prog = progressionFor(wex.exId, wex.repMin, wex.repMax);
    const k = Coach.info(ex);
    /* „So setzt du das um" steht bewusst vor der Begründung: im Training will man
       zuerst wissen, was zu tun ist — die Herleitung kann darunter warten. */
    const schritte = (prog.hinweis && prog.hinweis.length)
      ? '<div class="section-title">So setzt du das um</div><div class="card coach-schritte">' +
        prog.hinweis.map(z => '<div class="coach-schritt"><span class="coach-was">' + esc(z[0]) +
          '</span><span class="coach-wie">' + esc(z[1]) + '</span></div>').join('') + '</div>'
      : '';
    /* Läuft der Reha-Modus, gehört die Ampel über die Empfehlung: Sie ist der
       Grund, warum der Vorschlag so aussieht, wie er aussieht. */
    let rehaKopf = '';
    if (prog.reha) {
      const w = rehaWerte(ex.mg);
      const a = Coach.rehaAmpel(w.schmerz, w.morgenDelta);
      const tut = Coach.rehaTutWoche(rehaTutWocheSek(ex.mg));
      rehaKopf = '<div class="card reha-karte"><div class="reha-kopf"><span class="reha-ampel ' + a.farbe + '"></span>' +
        '<div><div class="li-title li-title-sm">Reha · Stufe ' + prog.reha.stufe + ' — ' + esc(prog.reha.stufeName) + '</div>' +
        '<div class="li-sub li-sub-wrap">' + esc(a.text) + '</div></div></div>' +
        '<div class="mini-note">' + esc(a.grund) + '</div>' +
        '<div class="mini-note">Sehnen-Belastungszeit diese Woche: <b>' + esc(tut.text) + '</b> — ' + esc(tut.grund) + '</div></div>';
    }
    openSheet('<div class="sheet-title">Coach-Empfehlung</div>' +
      '<div class="sheet-sub"><b>' + esc(ex.name) + '</b> · ' + esc(k.label) + '</div>' +
      rehaKopf +
      '<div class="info-box"><b>' + esc(prog.text) + '</b></div>' +
      schritte +
      (prog.grund ? '<div class="section-title">Warum</div><div class="info-box">' + esc(prog.grund) + '</div>' : '') +
      '<div class="info-box">Satzpause: <b>' + fmtMinSek(restTarget(wex.exId, wex.restSec)) + ' min</b><br>' +
      ((wex.restSec || (S.exerciseSettings[wex.exId] && S.exerciseSettings[wex.exId].restSec))
        ? 'Von dir festgelegt (Plan- bzw. Übungs-Einstellung).'
        : (S.settings.coach !== false ? esc(Coach.pauseInfo(ex).grund) : 'Pauschalwert aus den Einstellungen (Klassik-Modus).')) + '</div>' +
      '<div class="mini-note">' + esc(Coach.QUELLEN) + '</div>' +
      (prog.reha ? '<div class="mini-note">' + esc(Coach.REHA_QUELLEN) + '</div>' : '') +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Alles klar</button></div>');
  },
  'set-add': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    const letzter = wex.sets[wex.sets.length - 1];
    wex.sets.push({ kg: letzter ? letzter.kg : null, reps: letzter ? letzter.reps : null, rpe: null, warmup: false, done: false, doneAt: null, restSec: null });
    save();
    render();
  },
  /* Schnellweg: nimmt den letzten noch offenen Satz weg. Wer einen bestimmten
     Satz mittendrin loswerden will, geht über „Auswählen…" bzw. die Satz-Zahl. */
  'set-del': el => {
    const aw = S.activeWorkout;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    for (let i = wex.sets.length - 1; i >= 0; i--) {
      if (wex.sets[i].done !== true) {
        satzEntfernen(xi, [i]);
        satzAuswahl = null;
        save();
        render();
        return;
      }
    }
    showToast('Alle Sätze sind bereits abgehakt');
  },
  'wo-minimieren': () => { zeigeWorkout = false; render(); window.scrollTo(0, 0); },
  'wo-zurueck': () => { tab = 'start'; zeigeWorkout = true; trainSub = null; closeSheet(); render(); window.scrollTo(0, 0); },
  'wo-ex-notiz': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    openSheet('<div class="sheet-title">Notiz — ' + esc(exById(wex.exId).name) + '</div>' +
      '<div class="sheet-sub">Gilt für diese Übung in diesem Training und wird im Verlauf gespeichert.</div>' +
      '<textarea class="input" id="wo-exnotiz-text" placeholder="z. B. Sitz auf Stufe 4, Schulter leicht gezwickt …">' + esc(wex.notiz || '') + '</textarea>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="wo-ex-notiz-save" data-ex="' + el.dataset.ex + '">Speichern</button></div>');
  },
  'wo-ex-notiz-save': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    wex.notiz = $('#wo-exnotiz-text').value.trim();
    save();
    closeSheet();
    render();
  },

  /* --- Optionen einer Übung im laufenden Training --- */
  'wo-ex-menu': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    if (!wex) return;
    const ex = exById(wex.exId);
    const fertig = wex.sets.filter(s => s.done === true).length;
    openSheet('<div class="sheet-title">' + esc(ex.name) + '</div>' +
      '<div class="sheet-sub">' + wex.sets.length + ' ' + (wex.sets.length === 1 ? 'Satz' : 'Sätze') + ' · ' + fertig + ' abgehakt</div>' +
      '<div class="sheet-actions">' +
      '<button class="btn btn-primary" data-action="wo-ex-replace" data-ex="' + xi + '">Übung ersetzen…</button>' +
      '<button class="btn" data-action="wo-ex-notiz" data-ex="' + xi + '">Notiz</button>' +
      '<button class="btn" data-action="wo-warmup" data-ex="' + xi + '">Aufwärmen berechnen</button>' +
      (aw.exercises.length > 1 ? '<button class="btn" data-action="wo-ex-order">Reihenfolge ändern…</button>' : '') +
      '<button class="btn btn-danger" data-action="wo-ex-remove" data-ex="' + xi + '">Übung entfernen</button>' +
      '</div>');
  },
  /* Übung mitten im Training tauschen (Gerät besetzt, Schulter zwickt, …).
     Bereits abgehakte Sätze bleiben bei der alten Übung — so wurden sie ausgeführt.
     Die neue Übung übernimmt nur die noch offenen Sätze und belegt ihre Gewichte
     aus der eigenen Historie vor: 80 kg Bankdrücken sind keine 80 kg Kurzhantel. */
  'wo-ex-replace': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex;
    const alt = aw.exercises[xi];
    if (!alt) return;
    const altId = alt.exId;
    openExercisePicker(neuId => {
      if (neuId === altId) { showToast('Das ist dieselbe Übung'); return; }
      const offen = alt.sets.filter(s => s.done !== true);
      const fertig = alt.sets.filter(s => s.done === true);
      /* Eingestellte Pausenziele wandern mit in die Ersatzübung — sie gehören
         zur Satzstruktur, nicht zur Übung. Der „auto"-Wert dahinter richtet
         sich danach nach der Muskelgruppe der NEUEN Übung. */
      const ziele = offen.length
        ? offen.map(s => Object.assign(
            s.warmup ? { warmup: true, reps: s.reps, kg: null } : { reps: s.reps },
            s.restZiel > 0 ? { restSec: Math.round(s.restZiel) } : null))
        : [{ reps: null }, { reps: null }, { reps: null }];
      const neu = buildWoExercise(neuId, ziele, alt.restSec);
      neu.ersetztFuer = alt.ersetztFuer || altId;
      neu.notiz = alt.notiz || null;
      if (fertig.length) {
        alt.sets = fertig;
        aw.exercises.splice(xi + 1, 0, neu);
        /* Die laufende Pause zeigt auf einen Satz per Index — beim Einschieben mitziehen */
        if (aw.rest && aw.rest.exIdx > xi) aw.rest.exIdx++;
        showToast('Ab hier: ' + exById(neuId).name);
      } else {
        aw.exercises[xi] = neu;
        if (aw.rest && aw.rest.exIdx === xi) { aw.rest = null; pauseWachEnde(); }
        showToast('Ersetzt durch ' + exById(neuId).name);
      }
      satzAuswahl = null;   // die Sätze darunter sind andere geworden
      save();
      render();
    });
  },
  'wo-ex-remove': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    if (!wex) return;
    if (wex.sets.some(s => s.done === true)) {
      showToast('Abgehakte Sätze — erst die Haken lösen');
      return;
    }
    aw.exercises.splice(xi, 1);
    if (aw.rest) {
      if (aw.rest.exIdx === xi) { aw.rest = null; pauseWachEnde(); }
      else if (aw.rest.exIdx > xi) aw.rest.exIdx--;
    }
    satzAuswahl = null;   // die Indizes darunter sind verrutscht
    save();
    closeSheet();
    render();
    showToast('Übung entfernt');
  },
  'wo-ex-order': () => {
    if (!S.activeWorkout) return;
    openSheet(reihenfolgeSheetHtml());
  },
  /* Nach jedem Schritt neu aufbauen: das Sheet zeigt sonst die alte Ordnung und
     die Indizes in den data-ex-Attributen zeigen ins Leere. */
  'wo-ex-move': el => {
    if (!woExVerschieben(+el.dataset.ex, +el.dataset.dir)) return;
    openSheet(reihenfolgeSheetHtml());
    render();
  },
  'wo-warmup': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    const ex = exById(wex.exId);
    /* Vorschlag: erstes eingetragenes Arbeitsgewicht, sonst Top-Satz vom letzten Mal */
    const ersterArbeit = wex.sets.find(s => !s.warmup && s.kg != null);
    const last = lastSessionFor(wex.exId);
    const top = last ? topSet(workingSets(last.wex)) : null;
    const vorschlag = ersterArbeit ? fmtInput(ersterArbeit.kg) : (top && top.kg > 0 ? fmtInput(top.kg) : '');
    openSheet('<div class="sheet-title">Aufwärmsätze berechnen</div>' +
      '<div class="sheet-sub">für <b>' + esc(ex.name) + '</b> — die Aufwärmsätze werden vor deine Arbeitssätze eingefügt.</div>' +
      '<div class="form-row"><label>Arbeitsgewicht (kg)</label>' +
      '<input class="input" id="wu-kg" inputmode="decimal" placeholder="z. B. 100" value="' + vorschlag + '" data-ex="' + esc(wex.exId) + '"></div>' +
      '<div id="wu-preview">' + warmupPreviewHtml(wex.exId, parseNum(vorschlag)) + '</div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="wo-wu-apply" data-ex="' + xi + '">Einfügen</button></div>');
  },
  'wo-wu-apply': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    const target = parseNum($('#wu-kg').value);
    if (!(target > 0)) { showToast('Bitte ein Arbeitsgewicht eingeben'); return; }
    const warm = computeWarmup(target, exById(wex.exId));
    if (!warm.length) { showToast('Kein Aufwärmen nötig — Gewicht zu leicht'); return; }
    /* Pausen-Zeiger über Objekt-Identität retten, dann nicht abgehakte Warmups ersetzen */
    const restSet = (aw.rest && aw.rest.exIdx === xi) ? wex.sets[aw.rest.setIdx] : null;
    wex.sets = wex.sets.filter(s => s.done === true || !s.warmup);
    const neu = warm.map(w2 => ({ kg: w2.kg, reps: w2.reps, rpe: null, warmup: true, done: false, doneAt: null, restSec: null }));
    wex.sets = neu.concat(wex.sets);
    if (restSet) {
      const ni = wex.sets.indexOf(restSet);
      if (ni >= 0) aw.rest.setIdx = ni;
      else { aw.rest = null; pauseWachEnde(); }
    }
    save();
    closeSheet();
    render();
    showToast(neu.length + ' Aufwärmsätze eingefügt');
  },
  'rest-done': () => endRest(true),
  'rest-skip': () => endRest(false),
  'rest-plus': () => {
    const aw = S.activeWorkout;
    if (!aw || !aw.rest) return;
    aw.rest.targetSec += 30;
    if ((Date.now() - aw.rest.startedAt) / 1000 < aw.rest.targetSec) aw.rest.signaled = false;
    pushPlanen((aw.rest.startedAt + aw.rest.targetSec * 1000 - Date.now()) / 1000);
    save();
    renderTimerBar();
  },
  /* Freie Pause aus der Schnellwahl — unabhängig vom Satz-Abhaken */
  'rest-frei': () => {
    const letzte = Math.max(RAD_SEK_SCHRITT, S.settings.letztePauseFrei || 150);
    openSheet('<div class="sheet-title">Pause starten</div>' +
      '<div class="sheet-sub">Läuft unabhängig von den Sätzen — fürs Dehnen, Trinken oder eine Extrapause.</div>' +
      radHtml() +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="rest-frei-start">' +
      'Pause starten <span class="rad-wert" id="rad-wert">' + fmtMinSek(letzte) + '</span></button>' +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
    radPositionSetzen(Math.floor(letzte / 60), Math.round((letzte % 60) / RAD_SEK_SCHRITT));
  },
  /* Tippen auf eine Zahl schiebt sie unter das Band — Rollen ist nicht Pflicht.
     Bewusst ohne 'smooth': sonst liest ein sofort folgender Start-Tipp die
     Position mitten im Flug und startet die falsche Dauer. */
  'rad-pick': el => {
    const rad = el.closest('.rad');
    if (!rad) return;
    rad.scrollTop = (+el.dataset.i) * RAD_ITEM;
    radWertAnzeigen();
  },
  'rest-frei-start': () => {
    const sec = radDauerLesen();
    if (!(sec >= 10)) { showToast('Mindestens 10 Sekunden'); return; }
    S.settings.letztePauseFrei = sec;
    startRest(sec, true);   // schließt das Sheet selbst
  },
  'pick-ex': el => {
    const cb = pickerCb;
    closeSheet();
    if (cb) cb(el.dataset.id);
  },

  /* Verlauf */
  'verlauf-home': () => { markViewAnim(); verlaufSub = null; editDraft = null; render(); },
  'wo-open': el => { markViewAnim(); verlaufSub = { id: el.dataset.id }; render(); window.scrollTo(0, 0); },
  'wo-edit': () => {
    const w = S.workouts.find(x => x.id === verlaufSub.id);
    if (!w) return;
    editDraft = JSON.parse(JSON.stringify(w));
    render();
  },
  'wo-edit-cancel': () => { editDraft = null; render(); },
  'wo-edit-save': () => saveWorkoutEdit(),
  'wo-delete': () => {
    const w = S.workouts.find(x => x.id === verlaufSub.id);
    openSheet('<div class="sheet-title">Training löschen?</div><div class="sheet-sub">„' + esc(w.name) + '" vom ' + fmtDatumLang(w.startedAt) + ' wird endgültig entfernt.</div>' +
      '<div class="sheet-actions"><button class="btn btn-danger" data-action="wo-delete-confirm">Löschen</button>' +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
  },
  'wo-delete-confirm': () => {
    S.workouts = S.workouts.filter(w => w.id !== verlaufSub.id);
    verlaufSub = null;
    save();
    closeSheet();
    render();
    showToast('Training gelöscht');
  },
  'edit-set-w': el => {
    const s = editDraft.exercises[+el.dataset.x].sets[+el.dataset.s];
    s.warmup = !s.warmup;
    render();
  },
  'edit-set-del': el => {
    editDraft.exercises[+el.dataset.x].sets.splice(+el.dataset.s, 1);
    render();
  },
  'edit-set-add': el => {
    const wex = editDraft.exercises[+el.dataset.x];
    const letzter = wex.sets[wex.sets.length - 1];
    wex.sets.push({ kg: letzter ? letzter.kg : null, reps: letzter ? letzter.reps : null, rpe: null, warmup: false, doneAt: Date.now(), restSec: null });
    render();
  },
  'edit-ex-del': el => {
    editDraft.exercises.splice(+el.dataset.x, 1);
    render();
  },
  'edit-ex-add': () => openExercisePicker(id => {
    editDraft.exercises.push({ exId: id, repMin: null, repMax: null, sets: [{ kg: null, reps: null, rpe: null, warmup: false, doneAt: Date.now(), restSec: null }] });
    render();
  }),

  /* Übungen */
  'ueb-open': el => { markViewAnim(); uebSub = { exId: el.dataset.id }; render(); window.scrollTo(0, 0); },
  'ueb-back': () => { markViewAnim(); uebSub = null; render(); },
  'filter-mg': el => { uebFilter.mg = el.dataset.mg === 'Alle' ? null : el.dataset.mg; render(); },
  'filter-eq': el => { uebFilter.eq = el.dataset.eq === 'Alle Geräte' ? null : el.dataset.eq; render(); },
  'filter-reset': () => { uebFilter = { q: '', mg: null, eq: null }; render(); },
  'cu-new': () => openSheet('<div class="sheet-title">Eigene Übung</div>' +
    '<div class="form-row"><label>Name</label><input class="input" id="cu-name" placeholder="z. B. Kabelzug einarmig"></div>' +
    '<div class="form-row"><label>Muskelgruppe</label><select class="input" id="cu-mg">' + MGS.map(m => '<option>' + esc(m) + '</option>').join('') + '</select></div>' +
    '<div class="form-row"><label>Equipment</label><select class="input" id="cu-eq">' + EQS.map(m => '<option>' + esc(m) + '</option>').join('') + '</select></div>' +
    '<div class="setting-row" style="box-shadow:none"><div class="li-main"><div class="li-title li-title-sm">Grundübung</div>' +
    '<div class="li-sub">längere Standardpause</div></div>' +
    '<label class="switch"><input type="checkbox" id="cu-compound"><span class="knob"></span></label></div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="cu-save">Anlegen</button></div>'),
  'cu-save': () => {
    const name = $('#cu-name').value.trim();
    if (!name) { showToast('Bitte einen Namen eingeben'); return; }
    S.customExercises.push({
      id: 'cu-' + Date.now(), name,
      mg: $('#cu-mg').value, eq: $('#cu-eq').value,
      compound: $('#cu-compound').checked
    });
    save();
    closeSheet();
    render();
    showToast('Übung angelegt');
  },
  'cu-edit': el => {
    const ex = exById(el.dataset.id);
    openSheet('<div class="sheet-title">Übung bearbeiten</div>' +
      '<div class="form-row"><label>Name</label><input class="input" id="cu-name" value="' + esc(ex.name) + '"></div>' +
      '<div class="form-row"><label>Muskelgruppe</label><select class="input" id="cu-mg">' + MGS.map(m => '<option' + (m === ex.mg ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' +
      '<div class="form-row"><label>Equipment</label><select class="input" id="cu-eq">' + EQS.map(m => '<option' + (m === ex.eq ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' +
      '<div class="setting-row" style="box-shadow:none"><div class="li-main"><div class="li-title li-title-sm">Grundübung</div>' +
      '<div class="li-sub">längere Standardpause, größerer Steigerungsschritt</div></div>' +
      '<label class="switch"><input type="checkbox" id="cu-compound"' + (ex.compound ? ' checked' : '') + '><span class="knob"></span></label></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="cu-edit-save" data-id="' + esc(ex.id) + '">Speichern</button></div>');
  },
  'cu-edit-save': el => {
    const c = S.customExercises.find(e => e.id === el.dataset.id);
    if (!c) return;
    const name = $('#cu-name').value.trim();
    if (!name) { showToast('Bitte einen Namen eingeben'); return; }
    c.name = name;
    c.mg = $('#cu-mg').value;
    c.eq = $('#cu-eq').value;
    c.compound = $('#cu-compound').checked;
    save();
    closeSheet();
    render();
    showToast('Übung aktualisiert');
  },
  'cu-del': el => {
    const id = el.dataset.id;
    if (sessionsFor(id).length) { showToast('Übung wird im Verlauf verwendet — nicht löschbar'); return; }
    if (S.templates.some(t => t.exercises.some(it => it.exId === id))) { showToast('Übung wird in einem Plan verwendet — nicht löschbar'); return; }
    S.customExercises = S.customExercises.filter(e => e.id !== id);
    delete S.exerciseSettings[id];
    uebSub = null;
    save();
    render();
    showToast('Übung gelöscht');
  },

  /* Läufe */
  'run-add': () => openRunSheet(null),
  'run-open': el => openRunSheet(el.dataset.id),
  'run-save': el => {
    const date = $('#run-date').value;
    const km = parseNum($('#run-km').value);
    const dauer = parseDauer($('#run-dauer').value);
    if (!date || !km || km <= 0 || !dauer) { showToast('Bitte Datum, Distanz und Dauer angeben'); return; }
    const startedAt = new Date(date + 'T12:00').getTime();
    const notiz = $('#run-notiz').value.trim();
    let neuId = null;
    if (el.dataset.id) {
      const r = S.runs.find(x => x.id === el.dataset.id);
      if (r) Object.assign(r, { startedAt, distanzKm: km, dauerSec: dauer, notiz });
    } else {
      neuId = 'r-' + Date.now();
      S.runs.push({ id: neuId, startedAt, distanzKm: km, dauerSec: dauer, notiz });
    }
    S.runs.sort((a, b) => a.startedAt - b.startedAt);
    save();
    closeSheet();
    render();
    showToast('Lauf gespeichert: ' + fmtKg(km) + ' km');
    if (neuId && stravaVerbunden() && S.settings.strava.autoPost !== false) stravaPosteLauf(neuId, true);
  },
  'run-del': el => {
    S.runs = S.runs.filter(r => r.id !== el.dataset.id);
    save();
    closeSheet();
    render();
    showToast('Lauf gelöscht');
  },

  /* Profil-Statistik */
  'stat-mg': el => { statMg = el.dataset.mg; render(); },
  'stat-mode': el => { statMode = el.dataset.mode; render(); },
  'bw-add': () => {
    let liste = '';
    [...S.bodyweight].reverse().slice(0, 6).forEach(b => {
      liste += '<div class="setting-row" style="min-height:44px;padding:8px 12px"><div class="li-main"><div class="li-title li-title-sm">' + fmtKg(b.kg) + ' kg</div>' +
        '<div class="li-sub">' + b.date.split('-').reverse().join('.') + '</div></div>' +
        '<button class="del-btn" data-action="bw-del" data-date="' + b.date + '">×</button></div>';
    });
    openSheet('<div class="sheet-title">Körpergewicht</div>' +
      '<div class="form-row"><label>Datum</label><input type="date" class="input" id="bw-date" value="' + todayStr() + '"></div>' +
      '<div class="form-row"><label>Gewicht (kg)</label><input class="input" id="bw-kg" inputmode="decimal" placeholder="z. B. 81,4"></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="bw-save">Speichern</button></div>' +
      (liste ? '<div class="section-title mt-xl">Letzte Einträge</div>' + liste : ''));
  },
  'bw-save': () => {
    const date = $('#bw-date').value;
    const kg = parseNum($('#bw-kg').value);
    if (!date || kg == null || kg <= 0) { showToast('Bitte Datum und Gewicht angeben'); return; }
    S.bodyweight = S.bodyweight.filter(b => b.date !== date);
    S.bodyweight.push({ date, kg });
    S.bodyweight.sort((a, b) => (a.date < b.date ? -1 : 1));
    save();
    closeSheet();
    render();
    showToast('Gespeichert: ' + fmtKg(kg) + ' kg');
  },
  'bw-del': el => {
    S.bodyweight = S.bodyweight.filter(b => b.date !== el.dataset.date);
    save();
    closeSheet();
    render();
  },

  /* Daten */
  'export-json': () => doExport(),
  'export-clip': () => exportClipboard(),
  'import-open': () => openSheet('<div class="sheet-title">Import</div>' +
    '<div class="sheet-sub">JSON-Datei wählen oder Text einfügen. Die aktuellen Daten werden vorher automatisch als Backup gesichert.</div>' +
    '<input type="file" id="imp-file" accept=".json,application/json" class="input" style="padding:11px">' +
    '<div class="form-row mt-m"><label>… oder JSON-Text einfügen</label><textarea class="input" id="imp-text"></textarea></div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="imp-go">Importieren</button></div>'),
  'imp-go': () => {
    const f = $('#imp-file').files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => tryImport(r.result);
      r.readAsText(f);
    } else {
      const t = $('#imp-text').value.trim();
      if (!t) { showToast('Bitte Datei wählen oder Text einfügen'); return; }
      tryImport(t);
    }
  },
  'strong-open': () => openSheet('<div class="sheet-title">Import aus Strong</div>' +
    '<div class="sheet-sub">In der Strong-App: <b>Profil → Einstellungen → „Export Strong Data"</b> — du erhältst eine CSV-Datei (z. B. per Mail oder in „Dateien"). Wähle sie hier aus.<br><br>' +
    '<b>Verlauf importieren</b> übernimmt alle vergangenen Workouts (inkl. Pausenzeiten) in deinen Verlauf und deine Statistiken.<br>' +
    '<b>Nur Pläne erstellen</b> legt aus der jeweils letzten Einheit jedes Workout-Namens (z. B. „Chest", „Legs") eine Vorlage an — ohne den Verlauf zu füllen. Beides ist wiederholbar, Vorhandenes wird übersprungen.</div>' +
    '<input type="file" id="strong-file" accept=".csv,text/csv" class="input" style="padding:11px">' +
    '<div class="setting-row mt-m"><div class="li-main"><div class="li-title li-title-sm">Original-Übungsnamen behalten</div>' +
    '<div class="li-sub">Übungen heißen wie in Strong und werden bei Bedarf neu angelegt. Aus: bekannte Übungen werden den deutschen Kraftlog-Übungen zugeordnet.</div></div>' +
    '<label class="switch"><input type="checkbox" id="strong-namen" checked><span class="knob"></span></label></div>' +
    '<div class="setting-row mt-m"><div class="li-main"><div class="li-title li-title-sm">Gewichtseinheit in Strong</div>' +
    '<div class="li-sub">nur nötig, falls die Datei keine Einheiten-Spalte hat</div></div>' +
    '<select class="input-mini" id="strong-unit" style="width:70px"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>' +
    '<div class="form-row mt-m"><label>… oder CSV-Text einfügen</label><textarea class="input" id="strong-text"></textarea></div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="strong-go">Verlauf importieren</button>' +
    '<button class="btn btn-soft" data-action="strong-plaene">Nur Pläne erstellen</button></div>'),
  'strong-go': () => strongStart('verlauf'),
  'strong-plaene': () => strongStart('plaene'),
  'tpl-derive': () => {
    const erg = erstellePlaeneAus(S.workouts);
    save();
    render();
    plaeneErgebnisSheet(erg);
  },

  /* Pläne: Auswahlmodus (mehrere löschen / exportieren / duplizieren) */
  'tpl-select-mode': () => { planAuswahl = planAuswahl ? null : new Set(); render(); },
  'tpl-select': el => {
    if (planAuswahl.has(el.dataset.id)) planAuswahl.delete(el.dataset.id);
    else planAuswahl.add(el.dataset.id);
    render();
  },
  'tpl-select-all': () => {
    if (planAuswahl.size === S.templates.length) planAuswahl.clear();
    else S.templates.forEach(t => planAuswahl.add(t.id));
    render();
  },
  'tpl-bulk-del': () => {
    if (!planAuswahl || !planAuswahl.size) { showToast('Nichts ausgewählt'); return; }
    const namen = S.templates.filter(t => planAuswahl.has(t.id)).map(t => esc(t.name));
    openSheet('<div class="sheet-title">' + namen.length + ' Pläne löschen?</div>' +
      '<div class="sheet-sub">' + namen.join(', ') + '<br>Deine Trainings im Verlauf bleiben erhalten.</div>' +
      '<div class="sheet-actions"><button class="btn btn-danger" data-action="tpl-bulk-del-confirm">Löschen</button>' +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
  },
  'tpl-bulk-del-confirm': () => {
    const n = planAuswahl.size;
    S.templates = S.templates.filter(t => !planAuswahl.has(t.id));
    planAuswahl = new Set();
    save();
    closeSheet();
    render();
    showToast(n + ' Pläne gelöscht');
  },
  'tpl-bulk-export': () => {
    if (!planAuswahl || !planAuswahl.size) { showToast('Nichts ausgewählt'); return; }
    exportPlaene([...planAuswahl]);
  },
  'tpl-bulk-dup': () => {
    if (!planAuswahl || !planAuswahl.size) { showToast('Nichts ausgewählt'); return; }
    let n = 0;
    S.templates.filter(t => planAuswahl.has(t.id)).forEach(t => {
      const kopie = JSON.parse(JSON.stringify(t));
      kopie.id = 't-' + Date.now() + '-k' + (++n);
      kopie.name = t.name + ' Kopie';
      kopie.createdAt = Date.now();
      S.templates.push(kopie);
    });
    planAuswahl = null;
    save();
    render();
    showToast(n + ' Pläne dupliziert');
  },
  'tpl-import-open': () => openSheet('<div class="sheet-title">Pläne importieren</div>' +
    '<div class="sheet-sub">Wähle eine Kraftlog-Plan-Datei (aus „Exportieren" — deiner oder von Freunden). Enthaltene eigene Übungen werden automatisch mit angelegt. Pläne, deren Name schon existiert, werden übersprungen.</div>' +
    '<input type="file" id="tplimp-file" accept=".json,application/json" class="input" style="padding:11px">' +
    '<div class="form-row mt-m"><label>… oder Text einfügen</label><textarea class="input" id="tplimp-text"></textarea></div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="tpl-import-go">Importieren</button></div>'),
  'tpl-import-go': () => {
    const f = $('#tplimp-file').files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => importPlaene(r.result);
      r.readAsText(f);
    } else {
      const t = $('#tplimp-text').value.trim();
      if (!t) { showToast('Bitte Datei wählen oder Text einfügen'); return; }
      importPlaene(t);
    }
  },
  'backup-restore': () => openSheet('<div class="sheet-title">Backup wiederherstellen?</div>' +
    '<div class="sheet-sub">Der aktuelle Stand wird mit dem Backup getauscht (erneutes Wiederherstellen macht das rückgängig).</div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="backup-restore-confirm">Wiederherstellen</button>' +
    '<button class="btn" data-action="sheet-close">Abbrechen</button></div>'),
  'backup-restore-confirm': () => {
    let backup = null;
    try { backup = localStorage.getItem(BACKUP_KEY); } catch (e) { }
    if (!backup) { showToast('Kein Backup vorhanden'); return; }
    let obj;
    try { obj = JSON.parse(backup); } catch (e) { showToast('Backup ist beschädigt'); return; }
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e) { }
    readOnly = false;
    S = migrate(mergeState(obj));
    verlaufSub = null; uebSub = null; trainSub = null; editDraft = null; tplDraft = null;
    save();
    closeSheet();
    applyTheme();
    render();
    showToast('Backup wiederhergestellt');
  },
  /* Strava */
  'strava-verbinden': () => {
    const st = S.settings.strava;
    if (!st.workerUrl || !st.clientId) { showToast('Bitte zuerst Worker-URL und Client-ID eintragen'); return; }
    if (!/^https:\/\//.test(st.workerUrl) && location.protocol === 'https:') { showToast('Die Worker-URL muss mit https:// beginnen'); return; }
    const redirect = location.origin + location.pathname;
    location.href = 'https://www.strava.com/oauth/authorize?client_id=' + encodeURIComponent(st.clientId) +
      '&response_type=code&redirect_uri=' + encodeURIComponent(redirect) +
      '&approval_prompt=auto&scope=activity:write,read';
  },
  'strava-trennen': () => {
    Object.assign(S.settings.strava, { refreshToken: null, accessToken: null, accessBis: 0, athlet: '' });
    save();
    render();
    showToast('Strava getrennt');
  },
  'strava-hilfe': () => openSheet('<div class="sheet-title">Strava einrichten</div>' +
    '<div class="sheet-sub">Einmalig, ca. 5 Minuten. Strava erlaubt keine direkten Browser-Zugriffe — deshalb läuft ein Mini-Vermittler unter deinem eigenen kostenlosen Cloudflare-Account (dein Client-Secret bleibt dort, nie im Browser).</div>' +
    '<div class="info-box"><b>1. Strava-API-App anlegen</b><br>strava.com/settings/api → Anwendung erstellen: Name „Kraftlog", Website https://vtokyy.github.io, Autorisierungs-Callback-Domain: <b>vtokyy.github.io</b>. Danach Client-ID und Client-Secret notieren.</div>' +
    '<div class="info-box"><b>2. Cloudflare Worker anlegen</b><br>dash.cloudflare.com (kostenloser Account) → Workers &amp; Pages → Create Worker → Deploy → „Edit code" → den Inhalt der Datei <b>strava-proxy.js</b> aus dem Kraftlog-GitHub-Repo (github.com/vTokyy/kraftlog) einfügen → Deploy. Dann unter Settings → Variables: <b>STRAVA_CLIENT_ID</b> (Text), <b>STRAVA_CLIENT_SECRET</b> (Secret) und empfohlen <b>KRAFTLOG_KEY</b> (Secret, frei gewählter Zugangsschlüssel — denselben Wert unten bei „Zugangsschlüssel" eintragen).</div>' +
    '<div class="info-box"><b>3. Verbinden</b><br>Worker-URL (https://….workers.dev) und Client-ID hier eintragen → „Mit Strava verbinden" → bei Strava freigeben. Fertig — ab dann wird jedes beendete Training automatisch gepostet.</div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Alles klar</button></div>'),
  'push-aktivieren': async () => {
    const st = S.settings.strava;
    if (!st.workerUrl) { showToast('Bitte zuerst die Worker-URL (Strava-Bereich) eintragen'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || location.protocol !== 'https:') {
      showToast('Push geht nur in der installierten App (Home-Bildschirm)');
      return;
    }
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== 'granted') { showToast('Benachrichtigungen wurden nicht erlaubt'); return; }
      const reg = await navigator.serviceWorker.ready;
      const vap = await (await workerFetch('/push/vapid')).json();
      if (!vap.publicKey) throw new Error('Worker liefert keinen Schlüssel — Worker aktuell?');
      const alt = await reg.pushManager.getSubscription();
      if (alt) await alt.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlZuBytes(vap.publicKey)
      });
      S.settings.push = { aktiv: true, sub: sub.toJSON() };
      save();
      render();
      showToast('Pausen-Push aktiv');
    } catch (e) {
      showToast('Aktivierung fehlgeschlagen: ' + e.message);
    }
  },
  /* Test-Weckruf: dieselbe Strecke wie im Training, nur ohne Training.
     Bildschirm sperren, fünf Sekunden warten — dann weiß man, woran man ist. */
  'push-test': async () => {
    if (!pushAktiv()) { showToast('Push ist nicht vollständig eingerichtet'); return; }
    if (!navigator.onLine) { showToast('Keine Internetverbindung'); return; }
    showToast('Test läuft — Handy jetzt sperren');
    try {
      const r = await workerFetch('/push/planen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: S.settings.push.sub, delaySec: 5,
          titel: 'Test-Weckruf', text: 'Wenn das mit Ton kommt, funktioniert die Kette.'
        })
      });
      if (!r || !r.ok) showToast('Worker antwortet nicht (' + (r ? r.status : 'kein Netz') + ')');
    } catch (e) {
      showToast('Worker nicht erreichbar — URL und Schlüssel prüfen');
    }
  },
  'push-aus': async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    } catch (e) { }
    S.settings.push = { aktiv: false, sub: null };
    save();
    render();
    showToast('Pausen-Push deaktiviert');
  },
  'strava-post-wo': el => stravaPosteWorkout(el.dataset.id, false),
  'strava-post-run': el => { closeSheet(); stravaPosteLauf(el.dataset.id, false); },

  /* Export-Fallback-Textarea: Antippen markiert alles (Inline-onclick wäre CSP-blockiert) */
  'ta-select': el => { try { el.select(); } catch (e) { } },

  'app-update': () => {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:' || !swReg) {
      showToast('Automatische Updates gibt es nur in der installierten App (Home-Bildschirm)');
      return;
    }
    /* Schon geladen (z. B. während eines Trainings vorgemerkt)? Jetzt anwenden. */
    if (neueVersionBereit) {
      swNeuladenWennBereit();
      if (!swReloadGeplant) showToast(S.activeWorkout ? 'Wird nach dem Training aktiv' : 'Neue Version wird geladen …');
      return;
    }
    if (!navigator.onLine) { showToast('Kein Internet — für ein Update musst du online sein'); return; }
    showToast('Suche nach Update …');
    swReg.update().then(() => {
      setTimeout(() => {
        /* Neuer Worker gefunden → controllerchange lädt gleich neu. Sonst: schon aktuell. */
        if (swReg.installing || swReg.waiting || neueVersionBereit) showToast('Neue Version wird geladen …');
        else showToast('Du hast bereits die neueste Version (' + APP_VERSION + ')');
      }, 1500);
    }).catch(() => showToast('Update-Prüfung fehlgeschlagen — bist du online?'));
  },

  'wipe': () => openSheet('<div class="sheet-title">Alle Daten löschen?</div>' +
    '<div class="sheet-sub">Alle Trainings, Pläne und Einstellungen werden entfernt. Das lässt sich nicht rückgängig machen — vorher exportieren!</div>' +
    '<div class="sheet-actions"><button class="btn btn-danger" data-action="wipe-confirm">Ja, endgültig löschen</button>' +
    '<button class="btn" data-action="sheet-close">Abbrechen</button></div>'),
  'wipe-confirm': () => {
    readOnly = false;
    S = defaults();
    verlaufSub = null; uebSub = null; trainSub = null; editDraft = null; tplDraft = null;
    save();
    closeSheet();
    applyTheme();
    render();
    showToast('Alle Daten gelöscht');
  }
};

/* ---------- Event-Delegation ---------- */
document.addEventListener('click', e => {
  const dot = e.target.closest('.chart-dot-hit');
  if (dot) { showChartTip(dot, e); return; }
  hideChartTip();
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});

document.addEventListener('input', e => {
  const el = e.target;
  /* Aktives Workout: kg / Wdh. */
  if (el.dataset.winput) {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    let v = parseNum(el.value);
    if (v != null && v < 0) v = 0;
    if (el.dataset.winput === 'reps' && v != null) v = Math.round(v);
    s[el.dataset.winput] = v;
    /* Korrektur an einem bereits abgehakten Satz: PR-Lage neu bewerten.
       Bewusst ohne render() — das würde beim Tippen den Fokus aus dem Feld
       reißen. Der State stimmt sofort, die Abzeichen zieht der change-Handler
       beim Verlassen des Feldes nach. */
    if (s.done === true) prNeuBerechnen(+el.dataset.ex);
    saveSoon();
    return;
  }
  /* Pausenziel eines Satzes im laufenden Training (Satz-Optionen-Sheet).
     Gilt nur für heute — dauerhaft wird das in der Vorlage gesetzt. */
  if (el.hasAttribute && el.hasAttribute('data-setrest')) {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    const v = parseNum(el.value);
    s.restZiel = (v != null && v > 0) ? Math.round(v) : null;
    saveSoon();
    return;
  }
  /* Vorlagen-Editor */
  if (el.dataset.tinput) { tplDraft[el.dataset.tinput] = el.value; return; }
  if (el.dataset.trole) {
    const it = tplDraft.exercises[+el.dataset.i];
    const v = parseNum(el.value);
    if (el.dataset.trole === 'rest') {
      it.restSec = (v != null && v > 0) ? Math.round(v) : null;
    } else if (el.dataset.trole === 'reps') {
      it.sets[+el.dataset.j].reps = (v != null && v > 0) ? Math.round(v) : null;
    } else if (el.dataset.trole === 'kg') {
      it.sets[+el.dataset.j].kg = (v != null && v >= 0) ? v : null;
    } else if (el.dataset.trole === 'setrest') {
      /* Pausenziel dieses Satzes; leer = „auto" (Übungs- bzw. Coach-Wert) */
      const st = it.sets[+el.dataset.j];
      if (v != null && v > 0) st.restSec = Math.round(v);
      else delete st.restSec;
    }
    return;
  }
  /* Aufwärm-Rechner: Live-Vorschau aktualisieren */
  if (el.id === 'wu-kg') {
    const prev = document.getElementById('wu-preview');
    if (prev) prev.innerHTML = warmupPreviewHtml(el.dataset.ex, parseNum(el.value));
    return;
  }
  /* Übungen-Suche & Picker-Suche (nur Liste neu rendern, Fokus behalten) */
  if (el.dataset.finput) {
    uebFilter.q = el.value;
    const list = $('#ueb-list');
    if (list) list.innerHTML = uebListHtml();
    return;
  }
  if (el.dataset.pinput) {
    const list = $('#picker-list');
    if (list) list.innerHTML = pickerListHtml(el.value);
    return;
  }
  /* Verlauf-Editor */
  if (el.dataset.einput) {
    const k = el.dataset.einput;
    if (k === 'name') { editDraft.name = el.value; return; }
    if (k === 'datum') { editDraft._datum = el.value; return; }
    if (k === 'zeit') { editDraft._zeit = el.value; return; }
    const s = editDraft.exercises[+el.dataset.x].sets[+el.dataset.s];
    let v = parseNum(el.value);
    if (v != null && v < 0) v = 0;
    if (k === 'kg') s.kg = v;
    else if (k === 'reps') s.reps = v != null ? Math.round(v) : null;
    else if (k === 'rest') s.restSec = v != null ? Math.round(v) : null;
    return;
  }
  /* Strava-Zugangsdaten */
  if (el.dataset.sinput) {
    S.settings.strava[el.dataset.sinput] = el.value.trim();
    saveSoon();
    return;
  }
  /* String-Einstellungen (z. B. Worker-Zugangsschlüssel) */
  if (el.dataset.appset) {
    S.settings[el.dataset.appset] = el.value.trim();
    saveSoon();
    return;
  }
  /* Übungs-Einstellungen */
  if (el.dataset.exset) {
    const id = el.dataset.id;
    const o = S.exerciseSettings[id] || (S.exerciseSettings[id] = {});
    if (el.dataset.exset === 'restSec') {
      const v = parseNum(el.value);
      if (v && v > 0) o.restSec = Math.round(v);
      else delete o.restSec;
    } else {
      o.notiz = el.value;
    }
    saveSoon();
    return;
  }
  /* Einstellungen (Zahlenfelder) */
  if (el.dataset.set && el.type !== 'checkbox' && el.tagName !== 'SELECT') {
    const v = parseNum(el.value);
    if (v != null && v > 0) { S.settings[el.dataset.set] = v; saveSoon(); }
    return;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  /* Feld eines abgehakten Satzes verlassen: PR-Abzeichen nachziehen.
     Muss VOR dem Einstellungs-Zweig stehen — Workout-Felder tragen ebenfalls
     ein `data-set` (den Satz-Index), das dort sonst als Einstellungs-Schlüssel
     gelesen würde. */
  if (el.dataset.winput) {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    if (s.done === true) { save(); render(); }
    return;
  }
  /* RPE im aktiven Workout */
  if (el.dataset.wsel === 'rpe') {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    s.rpe = el.value ? parseFloat(el.value) : null;
    el.classList.toggle('set', !!el.value);
    saveSoon();
    return;
  }
  /* RPE im Verlauf-Editor */
  if (el.dataset.esel === 'rpe') {
    const s = editDraft.exercises[+el.dataset.x].sets[+el.dataset.s];
    s.rpe = el.value ? parseFloat(el.value) : null;
    return;
  }
  /* Reha-Selects (Stufe, Ausgangswert) — eigener Schlüssel, damit sie sich nicht
     mit dem Satz-Index `data-set` im Training überschneiden. */
  if (el.dataset.rehasel) {
    const mg = el.dataset.mg;
    const r = S.reha[mg];
    if (!r) return;
    if (el.dataset.rehasel === 'stufe') {
      const neu = Math.min(4, Math.max(1, parseInt(el.value, 10) || 2));
      if (neu !== r.stufe) { r.stufe = neu; r.stufeSeit = Date.now(); }
    } else if (el.dataset.rehasel === 'basis') {
      r.basis = Math.min(10, Math.max(0, parseInt(el.value, 10) || 0));
    }
    save();
    rehaDetailHtml(mg);
    render();
    return;
  }
  /* Einstellungen (Schalter & Selects) */
  if (el.dataset.set) {
    const k = el.dataset.set;
    if (k === 'theme') { S.settings.theme = el.value; applyTheme(); }
    else if (k === 'stravaAuto') S.settings.strava.autoPost = el.checked;
    else if (el.type === 'checkbox') S.settings[k] = el.checked;
    save();
    if (k === 'coach' || k === 'goku') render(); // Abhängige UI sofort aktualisieren
    return;
  }
});

/* Pausenrad: die eingestellte Dauer live in den Startknopf schreiben.
   scroll steigt nicht auf, deshalb Capture-Phase — es bleibt ein einziger
   delegierter Listener auf document, kein Handler an den Rädern selbst.
   Per rAF gedrosselt, weil scroll sehr oft feuert. */
let radFrame = 0;
document.addEventListener('scroll', e => {
  const ziel = e.target;
  if (!ziel || !ziel.classList || !ziel.classList.contains('rad')) return;
  if (radFrame) return;
  radFrame = requestAnimationFrame(() => { radFrame = 0; radWertAnzeigen(); });
}, true);

/* Beim Antippen eines Zahlenfelds den ganzen Wert markieren → direkt überschreiben, ohne erst zu löschen */
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el.tagName !== 'INPUT' || !el.value) return;
  if (!el.hasAttribute('inputmode') && el.id !== 'run-dauer') return;   // nur Zahlen-/Zeitfelder, nicht Suche/Namen
  const markiere = () => { try { el.select(); } catch (_) { } };
  markiere();
  setTimeout(markiere, 0);   // iOS: Auswahl nach dem Setzen des Cursors erneut erzwingen
});

/* ---------- Ticker & Start ---------- */
function tick() {
  renderTimerBar();
  const el = $('#wo-elapsed');
  if (el && S.activeWorkout) el.textContent = fmtDauer((Date.now() - S.activeWorkout.startedAt) / 1000);
  const rs = $('#wo-ruecksprung');
  if (rs && !rs.classList.contains('hidden') && S.activeWorkout) {
    rs.textContent = '‹ Zurück zum Training · ' + fmtDauer((Date.now() - S.activeWorkout.startedAt) / 1000);
  }
}
function maybeResumePrompt() {
  const aw = S.activeWorkout;
  if (!aw) return;
  openSheet('<div class="sheet-title">Training fortsetzen?</div>' +
    '<div class="sheet-sub">„' + esc(aw.name) + '" vom ' + fmtDatumLang(aw.startedAt) + ', ' + fmtUhrzeit(aw.startedAt) + ' Uhr ist noch offen.</div>' +
    '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Fortsetzen</button>' +
    '<button class="btn" data-action="wo-finish">Beenden & speichern</button>' +
    '<button class="btn btn-danger" data-action="wo-discard">Verwerfen</button></div>');
}

/* Service Worker: nur auf echtem Hosting (https) — macht die installierte
   iPhone-Version offline-fähig. file:// (Mac-App) und Dev-Server bleiben unberührt.
   Auto-Update: updateViaCache 'none' lädt sw.js immer frisch (nie aus dem
   HTTP-Cache), damit neue Versionen überhaupt erkannt werden. Wird eine neue
   Version aktiv (controllerchange), lädt die App neu — außer mitten im Training,
   dann erst danach. So ist man beim Öffnen automatisch aktuell. */
let swReg = null;
let neueVersionBereit = false;
let swReloadGeplant = false;
/* Nur neu laden, wenn dabei nichts Ungespeichertes verloren geht: kein
   laufendes Training, kein offener Editor (tplDraft/editDraft liegen NICHT in
   localStorage) und kein offenes Dialog-Sheet. Sonst wird verschoben — der
   nächste Vordergrund-Wechsel bzw. das Trainingsende spielt das Update ein. */
function darfJetztNeuladen() {
  if (S.activeWorkout) return false;
  if (tplDraft || editDraft) return false;
  const sheet = document.getElementById('sheet');
  if (sheet && !sheet.classList.contains('hidden')) return false;
  return true;
}
function swNeuladenWennBereit() {
  if (!neueVersionBereit || swReloadGeplant) return;
  if (!darfJetztNeuladen()) return;
  swReloadGeplant = true;
  location.reload();
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const warKontrolliert = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!warKontrolliert) return;          // erster Besuch: initiale Übernahme, kein Update
    neueVersionBereit = true;
    swNeuladenWennBereit();
    if (!swReloadGeplant) {
      showToast(S.activeWorkout ? 'Neue Version bereit — nach dem Training aktiv'
        : 'Neue Version bereit — wird beim nächsten Öffnen aktiv');
    }
  });
  try {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => { swReg = reg; })
      .catch(() => { });
  } catch (e) { }
}

/* Browser bitten, den Speicher als dauerhaft zu behandeln — senkt das Risiko,
 * dass iOS die Daten unter Speicherdruck räumt. Ersetzt nicht den JSON-Export. */
if (navigator.storage && navigator.storage.persist) {
  try { navigator.storage.persist().catch(() => { }); } catch (e) { }
}

applyTheme();
render();
stravaOAuthRueckkehr();
maybeResumePrompt();
setInterval(tick, 500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(saveTimer); save(); } // Debounce flushen — iOS feuert beforeunload nicht zuverlässig
  else {
    renderTimerBar();
    if (S.activeWorkout && S.activeWorkout.rest) wakeLockAn(); // Wake Lock wird beim Verlassen freigegeben → erneuern
    if (swReg) { try { swReg.update(); } catch (e) { } }       // beim Öffnen nach Updates suchen
    swNeuladenWennBereit();                                    // vorgemerktes Update (nach Training) einspielen
  }
});
if (S.activeWorkout && S.activeWorkout.rest) wakeLockAn(); // laufende Pause nach App-Start weiter wachhalten
window.addEventListener('beforeunload', () => save());
})();
