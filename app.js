/* ===== Kraftlog — App-Engine =====
 * State-Schema (localStorage 'kraftlog-state-v1'):
 *   settings:        { theme, sound, vibration, restCompound, restIsolation, incUpper, incLower, lastExport }
 *   customExercises: [ { id:'cu-…', name, mg, eq, compound } ]
 *   exerciseSettings:{ exId: { restSec, notiz } }
 *   templates:       [ { id, name, createdAt, exercises:[{exId, restSec, sets:[{reps, kg?, warmup?}]}] } ]  // reps/kg = Ziel je Satz
 *   workouts:        [ { id, templateId, name, startedAt, finishedAt, notiz,
 *                        exercises:[{exId, repMin, repMax, sets:[{kg, reps, rpe, warmup, doneAt, restSec}]}] } ]
 *   activeWorkout:   wie workout, Sätze zusätzlich mit done:true/false; rest = laufende Pause
 *   bodyweight:      [ { date:'YYYY-MM-DD', kg } ]
 * PRs werden nie gespeichert, immer aus der Historie berechnet.
 */
(function () {
'use strict';

/* ---------- Kurzhelfer & Konstanten ---------- */
const $ = sel => document.querySelector(sel);
const LS_KEY = 'kraftlog-state-v1';
const BACKUP_KEY = 'kraftlog-backup';
const SCHEMA_VERSION = 1;
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
      coach: true,
      restCompound: 180, restIsolation: 90,
      incUpper: 2.5, incLower: 5, lastExport: null,
      groesseCm: null
    },
    customExercises: [],
    exerciseSettings: {},
    templates: [],
    wochenplan: {},
    workouts: [],
    runs: [],
    activeWorkout: null,
    bodyweight: []
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
function prGegen(b, s) {
  if (!b.any || s.warmup || s.kg == null || s.reps == null) return null;
  if (s.kg > 0 && (b.maxKg == null || s.kg > b.maxKg)) {
    return { typ: 'gewicht', text: 'Neuer Gewichts-PR: ' + fmtKg(s.kg) + ' kg!' };
  }
  const e = e1rmOf(s.kg, s.reps);
  if (e != null && b.maxE1rm != null && e > b.maxE1rm) {
    return { typ: 'e1rm', text: 'Neuer e1RM-PR: ' + fmtKg(Math.round(e * 10) / 10) + ' kg!' };
  }
  const prev = b.repsAtKg[String(s.kg)];
  if (prev != null && s.reps > prev) {
    return { typ: 'wdh', text: 'Wiederholungs-PR: ' + s.reps + ' × ' + fmtKg(s.kg) + ' kg!' };
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
 * Rampe in Prozent des Arbeitsgewichts, mit weniger Wdh. je schwerer.
 * Für Langhantel/SZ/Multipresse startet es mit der leeren Stange; nie über dem Arbeitsgewicht.
 * Gerundet auf 2,5-kg-Schritte. Rückgabe: [{ kg, reps }] (aufsteigend). */
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
  if (isBar && targetKg >= barKg * 2) out.push({ kg: barKg, reps: 12 }); // leere Stange
  const rampe = targetKg < 40 ? [[0.5, 8], [0.75, 5]] : [[0.5, 8], [0.7, 5], [0.85, 3]];
  for (const [pct, reps] of rampe) {
    let w = round(targetKg * pct);
    if (isBar) w = Math.max(w, barKg);
    push(w, reps);
  }
  if (targetKg >= 60) push(round(targetKg * 0.92), 1);     // schwerer Einzelsatz vor der Arbeit
  return out;
}
function warmupPreviewHtml(exId, targetKg) {
  const sets = computeWarmup(targetKg, exById(exId));
  if (!sets.length) return '<div class="chart-leer">Gib dein Arbeitsgewicht ein</div>';
  return '<div class="wu-list">' + sets.map((s, i) =>
    '<div class="hist-set"><span class="hs-n">A' + (i + 1) + '</span>' +
    '<span class="hs-main">' + fmtKg(s.kg) + ' kg × ' + s.reps + '</span></div>').join('') +
    '<div class="hist-set" style="border-top:1px solid var(--sep);margin-top:4px;padding-top:6px"><span class="hs-n">→</span>' +
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
    return {
      typ: 'neu', text: 'Erstes Mal — Arbeitsgewicht für ' + repRangeText(repMin, repMax) + ' finden',
      grund: coachAn ? ('Kategorie: ' + k.label + '. Empfohlener Zielbereich: ' + k.repMin + '–' + k.repMax + ' Wdh., Satzpause ~' + fmtMinSek(k.pause) + ' min. Wähle ein Gewicht, mit dem du das untere Ziel technisch sauber schaffst — gesteigert wird ab der nächsten Einheit automatisch.') : null
    };
  }
  const ws = workingSets(sess[sess.length - 1].wex);
  const wsDavor = sess.length > 1 ? workingSets(sess[sess.length - 2].wex) : null;
  if (coachAn) return Coach.empfehlung(ex, ws, wsDavor, repMin, repMax);
  /* Klassik-Modus (Coach aus): einfache Pauschalregel mit den Einstellungs-Werten */
  const inc = (ex.compound && (ex.mg === 'Beine' || ex.mg === 'Gesäß')) ? S.settings.incLower : S.settings.incUpper;
  const topKg = Math.max(...ws.map(s => s.kg || 0));
  if (ws.every(s => s.reps >= repMax)) {
    return { typ: 'plus', kg: topKg + inc, text: '+' + fmtKg(inc) + ' kg → ' + fmtKg(topKg + inc) + ' kg (' + repRangeText(repMin, repMax) + ')' };
  }
  if (ws.some(s => s.reps < repMin)) {
    const prevBelow = wsDavor && wsDavor.some(s => s.reps < repMin);
    if (prevBelow) {
      const deload = Math.max(0, Math.min(topKg - 2.5, Math.round(topKg * 0.95 / 2.5) * 2.5));
      if (deload > 0 && deload < topKg) {
        return { typ: 'halten', kg: deload, text: 'Deload erwägen: ' + fmtKg(deload) + ' kg' };
      }
    }
    return { typ: 'halten', kg: topKg, text: 'Gewicht halten: ' + fmtKg(topKg) + ' kg (' + repRangeText(repMin, repMax) + ')' };
  }
  return { typ: 'wdh', kg: topKg, text: fmtKg(topKg) + ' kg halten, +1 Wdh. anpeilen' };
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
let confettiTimer = null;
function burstConfetti() {
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
function openSheet(html) {
  $('#sheet-content').innerHTML = html;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#sheet-content').innerHTML = '';
  pickerCb = null;
}
function showChartTip(dot) {
  const tip = $('#chart-tip');
  tip.textContent = dot.dataset.tip || '';
  tip.classList.remove('hidden');
  const r = dot.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
}
function hideChartTip() { $('#chart-tip').classList.add('hidden'); }

/* ---------- Navigation & Render ---------- */
let tab = 'start';
let trainSub = null;     // null | 'plaene' | 'tpl-editor'
let tplDraft = null;     // Arbeitskopie im Vorlagen-Editor
let planAuswahl = null;  // Set von Plan-IDs im Auswahlmodus (null = normal)
let uebSub = null;       // null | { exId }
let uebFilter = { q: '', mg: null, eq: null };
let verlaufSub = null;   // null | { id }
let editDraft = null;    // Arbeitskopie im Verlauf-Editor
let statMg = 'Alle';
let statMode = 'saetze';

function render() {
  document.querySelectorAll('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  if (tab === 'start') v.innerHTML = renderStart();
  else if (tab === 'profil') v.innerHTML = renderProfil();
  else if (tab === 'verlauf') v.innerHTML = renderVerlauf();
  else if (tab === 'uebungen') v.innerHTML = renderUebungen();
  else v.innerHTML = renderDaten();
  renderTimerBar();
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
function chartCard(title, inner) {
  return '<div class="card chart-card"><h3>' + esc(title) + '</h3>' + inner + '</div>';
}

/* ---------- View: Start (Workout beginnen) ---------- */
function renderStart() {
  if (S.activeWorkout) return renderActiveWorkout();
  if (trainSub === 'plaene') return renderPlaene();
  if (trainSub === 'tpl-editor') return renderTplEditor();
  if (trainSub === 'wochenplan') return renderWochenplan();

  const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = '<h1 class="view-title">Workout starten<small>' + esc(heute) + '</small></h1>' + warnHtml();
  /* Heutiger Tag laut Wochenplan */
  const wpHeuteTpl = S.templates.find(t => t.id === S.wochenplan[heuteWpTag()]);
  const wpAktiv = WP_TAGE.some(t => S.templates.some(x => x.id === S.wochenplan[t]));
  if (wpHeuteTpl) {
    const heuteErledigt = S.workouts.some(w => w.templateId === wpHeuteTpl.id && w.startedAt >= startOfDay(Date.now()));
    h += '<div class="card" style="display:flex;align-items:center;gap:10px">' +
      '<div class="li-main"><div class="li-sub">Heute laut Wochenplan</div><div class="li-title">' + esc(wpHeuteTpl.name) + '</div></div>' +
      (heuteErledigt
        ? '<span class="tag" style="background:var(--green-soft);color:var(--green);font-size:14px;font-weight:800;padding:7px 13px;margin:0">Erledigt ✓</span>'
        : '<button class="btn btn-small btn-primary" data-action="wo-start" data-tpl="' + esc(wpHeuteTpl.id) + '">Start</button>') +
      '</div>';
  } else if (wpAktiv) {
    h += '<div class="card"><div class="li-sub" style="white-space:normal">Heute laut Wochenplan: <b>Ruhetag</b> — gute Erholung!</div></div>';
  }
  h += '<div class="section-title" style="display:flex;align-items:baseline;gap:12px">Meine Workouts<span style="flex:1"></span>' +
    '<button class="linklike" style="text-transform:none;letter-spacing:0;font-size:13px" data-action="tpl-new">+ Neu</button>' +
    '<button class="linklike" style="text-transform:none;letter-spacing:0;font-size:13px" data-action="tpl-mehr">Mehr …</button></div>';
  h += '<div class="tpl-grid">';
  for (const tpl of S.templates) {
    const letzte = [...S.workouts].reverse().find(w => w.templateId === tpl.id);
    h += '<div class="tpl-wrap">' +
      '<button class="tpl-box" data-action="wo-start" data-tpl="' + esc(tpl.id) + '">' +
      '<div class="tpl-box-name">' + esc(tpl.name) + '</div>' +
      '<div class="tpl-box-sub">' + tpl.exercises.length + ' Übungen</div>' +
      (letzte ? '<div class="tpl-box-sub">zuletzt ' + relTage(letzte.startedAt) + '</div>' : '') +
      '<div class="tpl-box-cta">Starten ›</div></button>' +
      '<button class="tpl-menu" data-action="tpl-menu" data-id="' + esc(tpl.id) + '" title="Plan-Optionen">⋯</button></div>';
  }
  h += '<button class="tpl-box" data-action="wo-start">' +
    '<div class="tpl-box-name">Freies Training</div><div class="tpl-box-sub">ohne Vorlage</div>' +
    '<div class="tpl-box-cta">Starten ›</div></button>';
  h += '<button class="tpl-box tpl-box-lauf" data-action="run-add">' +
    '<div class="tpl-box-name">Lauf</div><div class="tpl-box-sub">Distanz &amp; Zeit</div>' +
    '<div class="tpl-box-cta">Eintragen ›</div></button>';
  h += '</div>';
  if (!S.templates.length) {
    h += '<div class="card" style="margin-top:12px"><div class="li-sub" style="white-space:normal">Noch keine eigenen Workouts. Lege mit „+ Neu" Vorlagen an (z. B. Push / Pull / Beine) — dann startest du mit einem Tap und siehst pro Übung die Werte vom letzten Mal.</div></div>';
  }
  const wpStatus = wochenplanStatus();
  h += '<button class="btn btn-block" style="margin-top:10px" data-action="wochenplan">Wochenplan' +
    (wpStatus.zugewiesen && wpStatus.warnungen ? ' <span class="tag" style="background:var(--orange-soft);color:var(--orange);margin:0 0 0 4px">' + wpStatus.warnungen + ' Hinweise</span>' : '') + '</button>';
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
    statusHtml = '<div class="vol-status" style="color:var(--text-2)">Optional — nicht im Plan</div>';
  } else {
    statusHtml = '<div class="vol-status st-ok">Im optimalen Bereich</div>';
  }
  return '<div class="vol-row"><div class="vol-kopf"><span class="vol-mg">' + esc(z.mg) + '</span>' +
    '<span class="vol-ist ' + (z.status === 'ok' ? '' : cls === 's-wenig' ? 'st-wenig' : 'st-viel') + '">' + z.ist + '</span>' +
    '<span class="vol-ziel">/ ' + (z.z.min > 0 ? z.z.min + '–' + z.z.max : 'bis ' + z.z.max) + ' Sätze</span></div>' +
    '<div class="vol-bar"><div class="vol-zone" style="left:' + zoneL.toFixed(1) + '%;width:' + zoneB.toFixed(1) + '%"></div>' +
    '<div class="vol-fill ' + cls + '" style="width:' + fuellung.toFixed(1) + '%"></div></div>' +
    statusHtml +
    '<button class="linklike" style="font-size:12.5px;margin-top:6px" data-action="wp-detail" data-mg="' + esc(z.mg) + '">Zusammensetzung anzeigen</button></div>';
}
function renderWochenplan() {
  let h = '<button class="back-btn" data-action="train-home">‹ Training</button><h1 class="view-title">Wochenplan</h1>' +
    '<div class="mini-note" style="margin:-8px 0 12px 2px">Tippe auf einen Tag, um ihm einen Plan zuzuweisen. Kein Plan = Ruhetag.</div>';
  const heute = heuteWpTag();
  for (const tag of WP_TAGE) {
    const tpl = S.templates.find(t => t.id === S.wochenplan[tag]);
    h += '<button class="li-item" style="min-height:52px" data-action="wp-tag" data-tag="' + tag + '">' +
      '<div class="li-main"><div class="li-title" style="font-size:15px">' + WP_LABEL[tag] +
      (tag === heute ? ' <span class="tag tag-lauf" style="margin-left:4px">heute</span>' : '') + '</div>' +
      '<div class="li-sub">' + (tpl ? esc(tpl.name) : 'Ruhetag') + '</div></div>' +
      (tpl ? '<span class="tag">' + saetzeVon(tpl) + ' Sätze</span>' : '') + '<span class="chev">›</span></button>';
  }
  const st = wochenplanStatus();
  h += '<div class="section-title" style="display:flex;align-items:baseline;gap:10px">Volumen-Analyse (Sätze/Woche) ' +
    '<button class="linklike" style="font-size:12px;text-transform:none;letter-spacing:0" data-action="wp-info">Wie wird gerechnet?</button></div>';
  if (!st.zugewiesen) {
    h += '<div class="card"><div class="li-sub" style="white-space:normal">Weise mindestens einem Tag einen Plan zu — dann prüfe ich dein Wochenvolumen pro Muskelgruppe gegen die optimalen Bereiche und warne bei zu wenig oder zu viel.</div></div>';
  } else {
    st.zeilen.forEach(z => { h += volZeile(z); });
  }
  return h;
}

/* --- Aktives Workout --- */
function renderActiveWorkout() {
  const aw = S.activeWorkout;
  let h = '<div class="wo-header"><div class="wo-name"><h2>' + esc(aw.name) + '</h2>' +
    '<div class="wo-elapsed" id="wo-elapsed">' + fmtDauer((Date.now() - aw.startedAt) / 1000) + '</div></div>' +
    '<button class="btn btn-small" data-action="wo-menu">⋯</button>' +
    '<button class="btn btn-small btn-green" data-action="wo-finish">Fertig</button></div>';
  if (aw.notiz) h += '<div class="info-box">Notiz: ' + esc(aw.notiz) + '</div>';
  aw.exercises.forEach((wex, xi) => { h += renderExCard(wex, xi); });
  h += '<button class="btn btn-block btn-soft" data-action="wo-add-ex">+ Übung hinzufügen</button>';
  return h;
}
function renderExCard(wex, xi) {
  const ex = exById(wex.exId);
  let h = '<div class="ex-card"><div class="ex-head">' + Icons.thumb(ex) + '<div class="ex-title">' + esc(ex.name) + '</div><span class="tag">' + esc(ex.mg) + '</span></div>';
  if (ex.hint) h += '<div class="ex-hint">' + esc(ex.hint) + '</div>';
  const last = lastSessionFor(wex.exId);
  if (last) {
    const ws = workingSets(last.wex);
    const pausen = ws.map(s => s.restSec).filter(x => x != null);
    const avg = pausen.length ? ' · ⌀ Pause ' + fmtMinSek(pausen.reduce((a, b) => a + b, 0) / pausen.length) : '';
    h += '<div class="lastmal">Letztes Mal (' + relTage(last.w.startedAt) + '): <b>' +
      ws.map(s => fmtKg(s.kg) + '×' + s.reps).join(' · ') + '</b>' + avg + '</div>';
  } else {
    h += '<div class="lastmal">Noch keine früheren Einheiten.</div>';
  }
  const prog = progressionFor(wex.exId, wex.repMin, wex.repMax);
  const warum = prog.grund ? ' <button class="linklike" style="font-size:13px" data-action="prog-warum" data-ex="' + xi + '">Warum?</button>' : '';
  if (prog.typ === 'neu') {
    h += '<div style="margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="prog-chip neutral" style="margin:0">' + esc(prog.text) + '</span>' + warum + '</div>';
  } else {
    const cls = prog.typ === 'plus' ? '' : (prog.typ === 'halten' ? 'halten' : 'neutral');
    h += '<div style="margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="prog-chip ' + cls + '" style="margin:0" data-action="prog-apply" data-ex="' + xi + '" data-kg="' + prog.kg + '"' + (prog.reps ? ' data-reps="' + prog.reps + '"' : '') + '>' + esc(prog.text) + '</button>' + warum + '</div>';
  }
  h += '<div class="set-cols"><span></span><span>' + (ex.bw ? '+kg' : 'kg') + '</span><span>Wdh.</span><span>RPE</span><span>✓</span></div>';
  let wNum = 0;
  wex.sets.forEach((s, si) => {
    const done = s.done === true;
    if (!s.warmup) wNum++;
    const label = s.warmup ? 'W' : String(wNum);
    const dis = done ? ' disabled' : '';
    const ds = ' data-ex="' + xi + '" data-set="' + si + '"';
    h += '<div class="set-row' + (done ? ' done' : '') + '">' +
      '<button class="w-toggle' + (s.warmup ? ' on' : '') + '" data-action="set-optionen"' + ds + ' title="Satz-Optionen">' + label + '</button>' +
      '<div class="num-group">' +
      '<button class="step-btn" data-action="step" data-field="kg" data-dir="-1"' + ds + dis + '>−</button>' +
      '<input class="num-input" inputmode="decimal" autocomplete="off" placeholder="' + (ex.bw ? '+kg' : 'kg') + '" value="' + fmtInput(s.kg) + '" data-winput="kg"' + ds + dis + '>' +
      '<button class="step-btn" data-action="step" data-field="kg" data-dir="1"' + ds + dis + '>+</button></div>' +
      '<div class="num-group">' +
      '<button class="step-btn" data-action="step" data-field="reps" data-dir="-1"' + ds + dis + '>−</button>' +
      '<input class="num-input" inputmode="numeric" autocomplete="off" placeholder="Wdh" value="' + (s.reps != null ? s.reps : '') + '" data-winput="reps"' + ds + dis + '>' +
      '<button class="step-btn" data-action="step" data-field="reps" data-dir="1"' + ds + dis + '>+</button></div>' +
      '<select class="rpe-sel' + (s.rpe ? ' set' : '') + '" data-wsel="rpe"' + ds + dis + '>' +
      '<option value="">RPE</option>' +
      RPE_WERTE.map(r => '<option value="' + r + '"' + (String(s.rpe) === r ? ' selected' : '') + '>' + r.replace('.', ',') + '</option>').join('') +
      '</select>' +
      '<button class="check-btn' + (done ? ' done' : '') + '" data-action="check"' + ds + '>✓</button>' +
      setInfoLine(s) +
      '</div>';
  });
  h += '<div style="display:flex;gap:14px"><button class="add-set-btn" data-action="set-add" data-ex="' + xi + '">+ Satz</button>' +
    '<button class="add-set-btn" style="color:var(--text-2)" data-action="set-del" data-ex="' + xi + '">− Satz</button></div>';
  return h + '</div>';
}
function setInfoLine(s) {
  const bits = [];
  if (s.pr) bits.push('<span class="badge-pr">' + ({ gewicht: 'Gewichts-PR', e1rm: 'e1RM-PR', wdh: 'Wdh.-PR' })[s.pr] + '</span>');
  if (s.restSec != null) bits.push('Pause ' + fmtMinSek(s.restSec));
  return bits.length ? '<div class="pause-info">' + bits.join(' · ') + '</div>' : '';
}

/* Template-Übung in einheitliche Form bringen: sets = Liste von { reps } (exaktes Ziel je Satz).
   Migriert die alte Form { sets:N, repMin, repMax } idempotent. */
function normalizeTplExercise(it) {
  if (Array.isArray(it.sets)) {
    it.sets = it.sets.map(s => {
      const reps = (s && s.reps > 0) ? Math.round(s.reps) : null;
      const kg = (s && s.kg > 0) ? Math.round(s.kg * 100) / 100 : null;
      if (s && s.warmup) return { warmup: true, kg: (kg != null ? kg : 0), reps };
      return (kg != null) ? { reps, kg } : { reps };
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
  const sets = ziele.map(z => {
    if (z.warmup) {
      return { kg: z.kg != null ? z.kg : null, reps: z.reps != null ? z.reps : null, rpe: null, warmup: true, done: false, doneAt: null, restSec: null };
    }
    const ref = lastWs[wi] || lastWs[lastWs.length - 1] || null;
    wi++;
    return {
      kg: z.kg != null ? z.kg : (ref ? ref.kg : null),   // geplantes Gewicht schlägt „letztes Mal"
      reps: z.reps != null ? z.reps : (ref ? ref.reps : null),
      rpe: null, warmup: false, done: false, doneAt: null, restSec: null
    };
  });
  return {
    exId,
    repMin: repWerte.length ? Math.min(...repWerte) : null,
    repMax: repWerte.length ? Math.max(...repWerte) : null,
    restSec: restSec || null, sets
  };
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
    if (aw.rest && aw.rest.exIdx === xi && aw.rest.setIdx === si) { aw.rest = null; Signal.restStop(); }
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
  const pr = prGegen(bests, s);
  if (pr) {
    s.pr = pr.typ;
    showToast(pr.text, 'pr');
    burstConfetti();
  }
  /* Pause starten */
  aw.rest = { startedAt: now, targetSec: restTarget(wex.exId, wex.restSec), exIdx: xi, setIdx: si, signaled: false };
  if (S.settings.sound) Signal.restStart();   // stille Schleife hält die App im Hintergrund wach
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
    if (sets.length) cleaned.push({ exId: wex.exId, repMin: wex.repMin, repMax: wex.repMax, sets });
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
  Signal.restStop();
  save();
  closeSheet();
  showToast('Training gespeichert');
  tab = 'verlauf';
  verlaufSub = { id: w.id };
  render();
  window.scrollTo(0, 0);
  /* Weicht das Training vom Plan ab? → fragen, ob der Plan aktualisiert werden soll */
  const tpl = w.templateId ? S.templates.find(t => t.id === w.templateId) : null;
  if (tpl) {
    const diff = planUpdateDiff(tpl, w);
    if (diff.struktur || diff.werte) {
      planUpdate = { tplId: tpl.id, workoutId: w.id };
      openSheet('<div class="sheet-title">Plan „' + esc(tpl.name) + '" aktualisieren?</div>' +
        '<div class="sheet-sub">Dein heutiges Training weicht vom Plan ab' +
        (diff.struktur ? ' — auch bei Übungen bzw. Satzanzahl.' : ' — bei Wiederholungen/Gewichten.') + '</div>' +
        '<div class="sheet-actions">' +
        (diff.struktur ? '<button class="btn btn-primary" data-action="pu-struktur">Struktur &amp; Werte übernehmen</button>' : '') +
        '<button class="btn' + (diff.struktur ? '' : ' btn-primary') + '" data-action="pu-werte">Nur Werte übernehmen (Wdh./Gewichte)</button>' +
        '<button class="btn" data-action="pu-keep">Plan so lassen</button></div>');
    }
  }
}
function discardWorkout() {
  S.activeWorkout = null;
  Signal.restStop();
  save();
  closeSheet();
  render();
  showToast('Training verworfen');
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
      sets: wex.sets.map(s => s.warmup
        ? { warmup: true, kg: s.kg != null ? s.kg : 0, reps: s.reps }
        : { reps: s.reps })
    };
  });
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
  const aw = S.activeWorkout;
  if (!aw || !aw.rest) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const el = (Date.now() - aw.rest.startedAt) / 1000;
  const t = aw.rest.targetSec;
  const over = el >= t;
  bar.classList.toggle('over', over);
  $('#timer-progress').style.width = Math.min(100, el / t * 100) + '%';
  const gesamt = ' · Training ' + fmtDauer((Date.now() - aw.startedAt) / 1000);
  $('#timer-text').innerHTML = over
    ? 'Pause vorbei <small>+' + fmtMinSek(el - t) + gesamt + '</small>'
    : fmtMinSek(t - el) + ' <small>Ziel ' + fmtMinSek(t) + gesamt + '</small>';
  if (over && !aw.rest.signaled) {
    aw.rest.signaled = true;
    save();
    if (S.settings.sound) {
      Signal.beep();       // Vordergrund (WebAudio)
      Signal.beepLaut();   // Hintergrund/gesperrt (Audio-Element)
    }
    if (S.settings.vibration) Signal.vibrate();
    notifyPause();
    Signal.restStop();     // stille Schleife beenden — Signal ist raus
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
  Signal.restStop();
  save();
  render();
}

/* --- Pläne (Vorlagen) --- */
function renderPlaene() {
  const auswahl = planAuswahl;
  let h = '<button class="back-btn" data-action="train-home">‹ Training</button>';
  h += '<div style="display:flex;align-items:flex-start;gap:10px">' +
    '<h1 class="view-title" style="flex:1">Trainingspläne</h1>' +
    (S.templates.length ? '<button class="btn btn-small' + (auswahl ? ' btn-primary' : '') + '" style="margin-top:6px" data-action="tpl-select-mode">' + (auswahl ? 'Fertig' : 'Auswählen') + '</button>' : '') +
    '</div>';
  if (!S.templates.length) h += '<div class="empty"><p>Noch keine Pläne.<br>Erstelle z. B. „Push A" mit deinen Übungen und Ziel-Wiederholungsbereichen.</p></div>';
  if (auswahl) {
    h += '<div class="mini-note" style="margin:-8px 0 10px 2px">' + auswahl.size + ' ausgewählt · ' +
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
    h += '<div class="row-2" style="margin-top:14px">' +
      '<button class="btn btn-danger" data-action="tpl-bulk-del">Löschen</button>' +
      '<button class="btn" data-action="tpl-bulk-export">Exportieren</button>' +
      '<button class="btn" data-action="tpl-bulk-dup">Duplizieren</button></div>';
  } else {
    h += '<button class="btn btn-block btn-primary" style="margin-top:8px" data-action="tpl-new">+ Neuer Plan</button>';
    if (S.workouts.length) h += '<button class="btn btn-block btn-soft" style="margin-top:10px" data-action="tpl-derive">Pläne aus dem Verlauf erstellen</button>';
    h += '<button class="btn btn-block" style="margin-top:10px" data-action="tpl-import-open">Pläne importieren…</button>';
  }
  return h;
}
function renderTplEditor() {
  const d = tplDraft;
  let h = '<button class="back-btn" data-action="train-home">‹ Zurück</button>' +
    '<h1 class="view-title" style="font-size:24px">' + (d.id ? 'Plan bearbeiten' : 'Neuer Plan') + '</h1>' +
    '<div class="form-row"><label>Name</label><input class="input" value="' + esc(d.name) + '" placeholder="z. B. Push A" data-tinput="name"></div>' +
    '<div class="section-title">Übungen</div>';
  if (d.exercises.length) h += '<div class="mini-note" style="margin:-4px 0 10px 2px">Gewicht leer = beim Training vom letzten Mal übernommen. Tipp auf die Zahl links, um einen Satz als Aufwärmsatz (W) zu markieren — Aufwärmsätze zählen nicht in die Statistik.</div>';
  if (!d.exercises.length) h += '<div class="card"><div class="li-sub" style="white-space:normal">Noch keine Übungen im Plan.</div></div>';
  d.exercises.forEach((it, i) => {
    const ex = exById(it.exId);
    h += '<div class="tpl-ex-card"><div class="tpl-ex-head">' +
      Icons.thumb(ex) +
      '<div class="tpl-ex-name">' + esc(ex.name) + '</div>' +
      '<div class="tpl-ex-tools">' +
      '<button class="icon-btn" data-action="tpl-ex-up" data-i="' + i + '">↑</button>' +
      '<button class="icon-btn" data-action="tpl-ex-down" data-i="' + i + '">↓</button>' +
      '<button class="icon-btn" style="background:var(--red-soft);color:var(--red)" data-action="tpl-ex-del" data-i="' + i + '">×</button>' +
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
    '<div class="row-2" style="margin-top:16px"><button class="btn btn-primary" data-action="tpl-save">Speichern</button>' +
    (d.id ? '<button class="btn btn-danger" data-action="tpl-del">Löschen</button>' : '') + '</div>';
  return h;
}

/* --- Übungs-Picker (Sheet) --- */
function openExercisePicker(cb) {
  pickerCb = cb;
  openSheet('<div class="sheet-title">Übung wählen</div>' +
    '<input class="input" placeholder="Suchen…" data-pinput="q" style="margin-bottom:10px">' +
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
        '<div class="li-main"><div class="li-title" style="font-size:15px">' + esc(e.name) + '</div></div>' +
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
    return h + '<div class="empty"><p>Noch keine Trainings.<br>Starte dein erstes Workout über den Start-Tab.</p></div>';
  }
  const prByWorkout = {};
  allPrEvents().forEach(ev => { prByWorkout[ev.w.id] = (prByWorkout[ev.w.id] || 0) + 1; });
  const eintraege = S.workouts.map(w => ({ t: w.startedAt, w }))
    .concat(S.runs.map(r => ({ t: r.startedAt, r })))
    .sort((a, b) => b.t - a.t);
  let lastMonat = null;
  for (const e of eintraege) {
    const monat = fmtMonat(e.t);
    if (monat !== lastMonat) { h += '<div class="month-hd">' + esc(monat) + '</div>'; lastMonat = monat; }
    if (e.w) {
      const w = e.w;
      const dauer = w.finishedAt ? fmtDauer((w.finishedAt - w.startedAt) / 1000) : '';
      const prs = prByWorkout[w.id];
      h += '<button class="li-item" data-action="wo-open" data-id="' + esc(w.id) + '">' +
        '<div class="li-main"><div class="li-title">' + esc(w.name) + '</div>' +
        '<div class="li-sub">' + fmtDatumLang(w.startedAt) + ' · ' + dauer + ' · ' + workoutSetCount(w) + ' Sätze · ' + fmtVol(workoutVolume(w)) + '</div></div>' +
        (prs ? '<span class="badge-pr">' + prs + '× PR</span>' : '') + '<span class="chev">›</span></button>';
    } else {
      const r = e.r;
      h += '<button class="li-item" data-action="run-open" data-id="' + esc(r.id) + '">' +
        '<div class="li-main"><div class="li-title">Lauf' + (r.notiz ? ' · ' + esc(r.notiz) : '') + '</div>' +
        '<div class="li-sub">' + fmtDatumLang(r.startedAt) + ' · ' + fmtKg(r.distanzKm) + ' km · ' + fmtDauer(r.dauerSec) + ' · ' + fmtPace(r.dauerSec / r.distanzKm) + '</div></div>' +
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
    (r ? '<button class="btn btn-danger" data-action="run-del" data-id="' + esc(r.id) + '">Löschen</button>' : '') + '</div>');
}
function renderWorkoutDetail() {
  const w = S.workouts.find(x => x.id === verlaufSub.id);
  if (!w) { verlaufSub = null; return renderVerlauf(); }
  if (editDraft) return renderWorkoutEdit();
  const prSets = new Set(allPrEvents().filter(ev => ev.w.id === w.id).map(ev => ev.set));
  let h = '<button class="back-btn" data-action="verlauf-home">‹ Verlauf</button>' +
    '<h1 class="view-title" style="font-size:24px">' + esc(w.name) +
    '<small>' + fmtDatumLang(w.startedAt) + ', ' + fmtUhrzeit(w.startedAt) + ' Uhr</small></h1>';
  h += '<div class="stat-grid stat-grid-3">' +
    '<div class="stat-tile"><div class="stat-val">' + (w.finishedAt ? fmtDauer((w.finishedAt - w.startedAt) / 1000) : '–') + '</div><div class="stat-lab">Dauer</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + fmtVol(workoutVolume(w)) + '</div><div class="stat-lab">Volumen</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + workoutSetCount(w) + '</div><div class="stat-lab">Sätze</div></div></div>';
  h += '<div class="card">';
  w.exercises.forEach((wex, i) => {
    const ex = exById(wex.exId);
    if (i) h += '<div class="divider"></div>';
    h += '<div class="hist-ex-name">' + esc(ex.name) + '</div>';
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
  h += '<div class="row-2" style="margin-top:6px"><button class="btn" data-action="wo-edit">Bearbeiten</button>' +
    '<button class="btn btn-danger" data-action="wo-delete">Löschen</button></div>';
  return h;
}
function renderWorkoutEdit() {
  const d = editDraft;
  let h = '<button class="back-btn" data-action="wo-edit-cancel">‹ Abbrechen</button>' +
    '<h1 class="view-title" style="font-size:24px">Training bearbeiten</h1>' +
    '<div class="form-row"><label>Name</label><input class="input" value="' + esc(d.name) + '" data-einput="name"></div>' +
    '<div class="row-2"><div class="form-row"><label>Datum</label><input type="date" class="input" value="' + todayStr(new Date(d.startedAt)) + '" data-einput="datum"></div>' +
    '<div class="form-row"><label>Uhrzeit</label><input type="time" class="input" value="' + fmtUhrzeit(d.startedAt) + '" data-einput="zeit"></div></div>' +
    '<div class="mini-note" style="margin:-6px 0 12px">Spalten: Aufwärmsatz · kg · Wdh. · RPE · Pause (s)</div>';
  d.exercises.forEach((wex, xi) => {
    const ex = exById(wex.exId);
    h += '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<div class="li-title" style="flex:1;font-size:15px">' + esc(ex.name) + '</div>' +
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
    '<button class="btn btn-block btn-primary" style="margin-top:14px" data-action="wo-edit-save">Speichern</button>';
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
    '<input class="input" placeholder="Übung suchen…" value="' + esc(uebFilter.q) + '" data-finput="q" style="margin-bottom:10px">' +
    '<div class="chip-row">' + ['Alle'].concat(MGS).map(m =>
      '<button class="chip' + ((uebFilter.mg || 'Alle') === m ? ' active' : '') + '" data-action="filter-mg" data-mg="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div class="chip-row">' + ['Alle Geräte'].concat(EQS).map(m =>
      '<button class="chip' + ((uebFilter.eq || 'Alle Geräte') === m ? ' active' : '') + '" data-action="filter-eq" data-eq="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>' +
    '<div id="ueb-list">' + uebListHtml() + '</div>' +
    '<button class="btn btn-block btn-soft" style="margin-top:6px" data-action="cu-new">+ Eigene Übung</button>';
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
        '<div class="li-main"><div class="li-title" style="font-size:15px">' + esc(e.name) +
        (e.id.indexOf('cu-') === 0 ? ' <span class="tag">eigene</span>' : '') + '</div>' +
        '<div class="li-sub"><span class="tag">' + esc(e.eq) + '</span>' + (e.compound ? '<span class="tag">Grundübung</span>' : '') + '</div></div>' +
        '<div class="li-side">' + side + '</div><span class="chev">›</span></button>';
    }
  }
  return h || '<div class="empty"><p>Keine Übung gefunden</p></div>';
}
function renderUebungDetail() {
  const ex = exById(uebSub.exId);
  const sess = sessionsFor(ex.id);
  const bests = prBests(ex.id);
  const os = S.exerciseSettings[ex.id] || {};
  let h = '<button class="back-btn" data-action="ueb-back">‹ Übungen</button>' +
    '<div class="detail-head">' + Icons.thumb(ex, true) +
    '<h1 class="view-title" style="font-size:24px;margin:0">' + esc(ex.name) +
    '<small><span class="tag">' + esc(ex.mg) + '</span><span class="tag">' + esc(ex.eq) + '</span>' +
    (ex.compound ? '<span class="tag">Grundübung</span>' : '') + '</small></h1></div>';
  if (ex.hint) h += '<div class="ex-hint" style="margin-bottom:10px">' + esc(ex.hint) + '</div>';
  h += '<div class="stat-grid stat-grid-3">' +
    '<div class="stat-tile"><div class="stat-val">' + (bests.maxKg != null ? fmtKg(bests.maxKg) : '–') + '</div><div class="stat-lab">Max. kg' + (ex.bw ? ' (Zusatz)' : '') + '</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + (bests.maxE1rm != null ? fmtKg(Math.round(bests.maxE1rm * 10) / 10) : '–') + '</div><div class="stat-lab">e1RM (kg)</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + sess.length + '</div><div class="stat-lab">Einheiten</div></div></div>';
  /* Charts */
  const mk = (fn, einheit) => sess.map(({ w, wex }) => {
    const v = fn(wex);
    return v == null ? null : {
      x: w.startedAt, xLabel: fmtDatumKurz(w.startedAt), y: v,
      tip: fmtDatumKurz(w.startedAt) + ': ' + fmtKg(Math.round(v * 10) / 10) + ' ' + einheit
    };
  }).filter(Boolean);
  const nurKoerpergewicht = ex.bw && !sess.some(({ wex }) => workingSets(wex).some(s => s.kg > 0));
  if (nurKoerpergewicht) {
    h += chartCard('Wiederholungen (bester Satz)', Charts.lineChart({
      points: mk(wex => { const r = workingSets(wex).map(s => s.reps); return r.length ? Math.max(...r) : null; }, 'Wdh.'),
      leer: 'Noch keine Einheiten'
    }));
  } else {
    h += chartCard('Geschätztes 1RM (Epley)', Charts.lineChart({
      points: mk(wex => {
        const es = workingSets(wex).map(s => e1rmOf(s.kg, s.reps)).filter(x => x != null);
        return es.length ? Math.max(...es) : null;
      }, 'kg'), leer: 'Noch keine Einheiten'
    }));
    h += chartCard('Top-Satz-Gewicht', Charts.lineChart({
      points: mk(wex => { const t = topSet(workingSets(wex)); return t ? t.kg : null; }, 'kg'), leer: 'Noch keine Einheiten'
    }));
  }
  h += chartCard('Volumen pro Einheit', Charts.lineChart({
    points: mk(wex => workingSets(wex).reduce((a, s) => a + setVolume(s), 0) || null, 'kg'), leer: 'Noch keine Einheiten'
  }));
  /* Übungs-Einstellungen */
  h += '<div class="section-title">Einstellungen</div>' +
    '<div class="setting-row"><div class="li-main"><div class="li-title" style="font-size:15px">Pausenziel</div>' +
    '<div class="li-sub">leer = Standard (' + pauseStandard(ex.id) + ' s' + (S.settings.coach !== false ? ' · Coach: ' + esc(Coach.info(ex).label) : '') + ')</div></div>' +
    '<input class="input-mini" inputmode="numeric" placeholder="auto" value="' + (os.restSec || '') + '" data-exset="restSec" data-id="' + esc(ex.id) + '"><span class="li-sub">s</span></div>' +
    '<div class="form-row"><label>Notiz (z. B. Sitzeinstellung, Griffbreite)</label>' +
    '<textarea class="input" data-exset="notiz" data-id="' + esc(ex.id) + '">' + esc(os.notiz || '') + '</textarea></div>';
  /* Historie */
  h += '<div class="section-title">Historie</div>';
  if (!sess.length) h += '<div class="empty"><p>Noch keine Einheiten mit dieser Übung.</p></div>';
  [...sess].reverse().slice(0, 20).forEach(({ w, wex }) => {
    h += '<div class="card" style="padding:10px 14px"><div class="li-sub" style="margin-bottom:2px">' + fmtDatumLang(w.startedAt) + '</div>' +
      '<div class="li-title" style="font-size:15px">' +
      wex.sets.map(s => (s.warmup ? '(' : '') + fmtKg(s.kg) + '×' + s.reps + (s.warmup ? ')' : '')).join(' · ') + '</div></div>';
  });
  if (ex.id.indexOf('cu-') === 0) {
    h += '<button class="btn btn-block" style="margin-top:10px" data-action="cu-edit" data-id="' + esc(ex.id) + '">Übung bearbeiten (Name, Muskelgruppe, Gerät)</button>';
    h += '<button class="btn btn-block btn-danger" style="margin-top:10px" data-action="cu-del" data-id="' + esc(ex.id) + '">Eigene Übung löschen</button>';
  }
  return h;
}

/* ---------- View: Profil (Dashboard) ---------- */
function renderProfil() {
  const d30 = Date.now() - 30 * TAG_MS;
  const wkStart = weekStartMs(0);
  let ton30 = 0;
  S.workouts.forEach(w => { if (w.startedAt >= d30) ton30 += workoutVolume(w); });
  const prs = allPrEvents();
  const pr30 = prs.filter(ev => ev.w.startedAt >= d30).length;
  const gesamt = S.workouts.length + S.runs.length;
  const woche = S.workouts.filter(w => w.startedAt >= wkStart).length + S.runs.filter(r => r.startedAt >= wkStart).length;
  const km30 = S.runs.filter(r => r.startedAt >= d30).reduce((a, r) => a + r.distanzKm, 0);
  let h = '<h1 class="view-title">Profil</h1>' + warnHtml() +
    '<div class="stat-grid">' +
    '<div class="stat-tile stat-blau"><div class="stat-val">' + gesamt + '</div><div class="stat-lab">Trainings gesamt</div></div>' +
    '<div class="stat-tile stat-blau"><div class="stat-val">' + woche + '</div><div class="stat-lab">diese Woche</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + fmtVol(ton30) + '</div><div class="stat-lab">Volumen (30 Tage)</div></div>' +
    '<div class="stat-tile"><div class="stat-val">' + pr30 + '</div><div class="stat-lab">PRs (30 Tage)</div></div></div>';
  if (S.runs.length) {
    h += '<div class="stat-grid">' +
      '<div class="stat-tile"><div class="stat-val">' + S.runs.length + '</div><div class="stat-lab">Läufe gesamt</div></div>' +
      '<div class="stat-tile"><div class="stat-val">' + fmtKg(Math.round(km30 * 10) / 10) + ' km</div><div class="stat-lab">gelaufen (30 Tage)</div></div></div>';
  }
  /* Wochenvolumen pro Muskelgruppe */
  h += '<div class="section-title">Wochenvolumen (12 Wochen)</div>' +
    '<div class="chip-row">' + ['Alle'].concat(MGS).map(m =>
      '<button class="chip' + (statMg === m ? ' active' : '') + '" data-action="stat-mg" data-mg="' + esc(m) + '">' + esc(m) + '</button>').join('') + '</div>';
  const weeks = weeklyStats(12);
  const wert = wk => statMode === 'saetze'
    ? (statMg === 'Alle' ? wk.saetzeGesamt : (wk.saetze[statMg] || 0))
    : (statMg === 'Alle' ? wk.tonnageGesamt : (wk.tonnage[statMg] || 0));
  const bars = weeks.map(wk => ({
    label: String(kwNummer(wk.start)), value: wert(wk),
    tip: wk.label + ': ' + (statMode === 'saetze' ? wert(wk) + ' Sätze' : fmtVol(wert(wk)))
  }));
  h += '<div class="card chart-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">' +
    '<h3 style="margin:0">' + esc(statMg) + '</h3>' +
    '<div class="seg"><button class="' + (statMode === 'saetze' ? 'active' : '') + '" data-action="stat-mode" data-mode="saetze">Sätze</button>' +
    '<button class="' + (statMode === 'tonnage' ? 'active' : '') + '" data-action="stat-mode" data-mode="tonnage">Tonnage</button></div></div>' +
    Charts.barChart({ bars, yFmt: statMode === 'tonnage' ? fmtVol : undefined, leer: 'Noch keine Trainingsdaten' }) + '</div>';
  /* Trainings pro Woche (Kraft + Läufe) */
  const runsProWoche = weeks.map(wk => S.runs.filter(r => r.startedAt >= wk.start && r.startedAt < wk.end).length);
  h += '<div class="section-title">Trainings pro Woche</div><div class="card chart-card">' +
    Charts.barChart({
      bars: weeks.map((wk, i) => ({
        label: String(kwNummer(wk.start)), value: wk.workouts + runsProWoche[i],
        tip: wk.label + ': ' + wk.workouts + ' Kraft · ' + runsProWoche[i] + ' Läufe'
      })),
      leer: 'Noch keine Trainingsdaten'
    }) + '</div>';
  /* PR-Liste */
  h += '<div class="section-title">Letzte PRs</div>';
  const recent = prs.slice(-12).reverse();
  if (!recent.length) h += '<div class="empty"><p>Noch keine PRs — leg los!</p></div>';
  recent.forEach(ev => {
    h += '<div class="card" style="padding:10px 14px"><div style="display:flex;align-items:center;gap:8px">' +
      '<div class="li-main"><div class="li-title" style="font-size:15px">' + esc(exById(ev.exId).name) + '</div>' +
      '<div class="li-sub">' + fmtDatumKurz(ev.w.startedAt) + ' · ' + esc(ev.pr.text) + '</div></div>' +
      '<span class="badge-pr">PR</span></div></div>';
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
      bmiTxt = (delta != null ? ' · ' : '') + 'BMI ' + fmtKg(Math.round(bmi * 10) / 10);
    }
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;gap:8px;flex-wrap:wrap">' +
      '<div class="stat-val">' + fmtKg(letzte.kg) + ' kg</div>' +
      '<div class="li-sub">' + (delta != null ? (delta > 0 ? '+' : '') + fmtKg(Math.round(delta * 10) / 10) + ' kg ggü. Vorwoche' : '') + bmiTxt + '</div></div>';
    h += Charts.lineChart({
      points: S.bodyweight.map(b => {
        const x = new Date(b.date + 'T12:00').getTime();
        return { x, xLabel: fmtDatumKurz(x), y: b.kg, tip: fmtDatumKurz(x) + ': ' + fmtKg(b.kg) + ' kg' };
      }), trend: true
    });
    h += '<div class="mini-note">Gestrichelte Linie: 7-Tage-Durchschnitt</div>';
  } else {
    h += '<div class="chart-leer">Noch kein Körpergewicht erfasst</div>';
  }
  h += '<button class="btn btn-block btn-soft" style="margin-top:10px" data-action="bw-add">+ Gewicht eintragen</button></div>';
  h += settingRow('Größe', 'in cm — für den BMI', miniInput('groesseCm', st.groesseCm || ''));
  h += '<div class="section-title">Darstellung & Signale</div>' +
    settingRow('Design', 'Automatisch folgt dem System',
      '<select data-set="theme">' +
      [['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(o =>
        '<option value="' + o[0] + '"' + (st.theme === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') +
    settingRow('Ton', 'Piepton am Pausenende — hält die App während der Pause im Hintergrund wach (leise Audio-Session)',
      switchHtml('sound', st.sound)) +
    settingRow('Benachrichtigung', 'Systemmeldung am Pausenende; die Erlaubnis fragt dein Gerät beim ersten abgehakten Satz ab',
      switchHtml('benachrichtigung', st.benachrichtigung !== false)) +
    settingRow('Vibration', 'wo unterstützt (Android)',
      switchHtml('vibration', st.vibration));
  h += '<div class="section-title">Training</div>' +
    settingRow('Intelligenter Coach', 'Pausen, Steigerungen und Wdh.-Ziele je nach Übungstyp & Muskelgruppe (evidenzbasiert), mit RPE-Autoregulation und Deload-Logik', switchHtml('coach', st.coach !== false));
  if (st.coach !== false) {
    h += '<div class="info-box">Der Coach setzt die Standards automatisch — z. B. ~3:30 min Pause und ~5-%-Schritte bei Beine-Grundübungen, 1:30 min und kleinste Schritte bei Bizeps &amp; Co. Pro Plan oder pro Übung kannst du die Pause weiterhin manuell überschreiben. Im Training zeigt dir „Warum?" die Begründung jeder Empfehlung.</div>';
  } else {
    h += settingRow('Pause Grundübung', 'Standard in Sekunden', miniInput('restCompound', st.restCompound)) +
      settingRow('Pause Isolationsübung', 'Standard in Sekunden', miniInput('restIsolation', st.restIsolation)) +
      settingRow('Steigerungsschritt', 'Oberkörper (kg)', miniInput('incUpper', fmtInput(st.incUpper))) +
      settingRow('Steigerungsschritt', 'Beine/Gesäß-Grundübungen (kg)', miniInput('incLower', fmtInput(st.incLower)));
  }
  h += '<div class="section-title">Datenverwaltung</div>' +
    '<div class="info-box">Deine Daten liegen im Browser-Speicher <b>dieses Geräts</b> und hängen am Speicherort der App — die Kraftlog.app also nicht verschieben oder umbenennen. Zum Übertragen auf ein anderes Gerät (z. B. iPhone) und als Backup: Export → Import.' +
    (st.lastExport ? '<br>Letzter Export: ' + fmtDatumLang(st.lastExport) : '<br>Noch kein Export gemacht.') + '</div>' +
    '<button class="btn btn-block btn-primary" data-action="export-json">Export als JSON-Datei</button>' +
    '<button class="btn btn-block" style="margin-top:10px" data-action="export-clip">Export in Zwischenablage</button>' +
    '<button class="btn btn-block" style="margin-top:10px" data-action="import-open">Import…</button>' +
    '<button class="btn btn-block" style="margin-top:10px" data-action="strong-open">Import aus Strong (CSV)…</button>';
  let backup = null;
  try { backup = localStorage.getItem(BACKUP_KEY); } catch (e) { }
  if (backup) h += '<button class="btn btn-block" style="margin-top:10px" data-action="backup-restore">Backup wiederherstellen</button>';
  h += '<button class="btn btn-block btn-danger" style="margin-top:22px" data-action="wipe">Alle Daten löschen…</button>';
  h += '<div class="mini-note" style="text-align:center;margin-top:20px">Kraftlog v1 · ' + allExercises().length + ' Übungen · Daten-Schema v' + SCHEMA_VERSION + '</div>';
  return h;
}
function settingRow(title, sub, control) {
  return '<div class="setting-row"><div class="li-main"><div class="li-title" style="font-size:15px">' + esc(title) + '</div>' +
    '<div class="li-sub" style="white-space:normal">' + esc(sub) + '</div></div>' + control + '</div>';
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
    '<textarea class="input" style="min-height:150px" readonly onclick="this.select()">' + esc(data) + '</textarea>');
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
      '<textarea class="input" style="min-height:150px" readonly onclick="this.select()">' + esc(json) + '</textarea>');
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

/* ---------- Theme ---------- */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'hell' || t === 'dunkel') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

/* ---------- Aktionen (Klick-Dispatch über data-action) ---------- */
const ACTIONS = {
  'tab': el => { tab = el.dataset.tab; trainSub = null; uebSub = null; verlaufSub = null; editDraft = null; tplDraft = null; planAuswahl = null; closeSheet(); render(); window.scrollTo(0, 0); },
  'sheet-close': () => closeSheet(),

  /* Training / Pläne */
  'train-home': () => { trainSub = null; tplDraft = null; planAuswahl = null; render(); },
  'plaene': () => { trainSub = 'plaene'; tplDraft = null; planAuswahl = null; render(); },

  /* Wochenplan */
  'wochenplan': () => { trainSub = 'wochenplan'; render(); window.scrollTo(0, 0); },
  'wp-tag': el => {
    const tag = el.dataset.tag;
    if (!S.templates.length) { showToast('Lege zuerst einen Plan an'); return; }
    let liste = '<button class="li-item" style="min-height:50px" data-action="wp-zuweisen" data-tag="' + tag + '">' +
      '<div class="li-main"><div class="li-title" style="font-size:15px">Ruhetag</div><div class="li-sub">kein Training</div></div></button>';
    S.templates.forEach(t => {
      liste += '<button class="li-item" style="min-height:50px" data-action="wp-zuweisen" data-tag="' + tag + '" data-tpl="' + esc(t.id) + '">' +
        '<div class="li-main"><div class="li-title" style="font-size:15px">' + esc(t.name) + '</div>' +
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
        inhalt += '<div class="hist-set"><span class="hs-main" style="flex:1;font-size:14px">' + esc(x.ex.name) + '</span>' +
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
      '<button class="btn" data-action="wo-note">Notiz ' + (aw.notiz ? 'bearbeiten' : 'hinzufügen') + '</button>' +
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
    openSheet('<div class="sheet-title">' + esc(exById(wex.exId).name) + '</div>' +
      '<div class="sheet-sub">Satz ' + (si + 1) + (s.warmup ? ' (Aufwärmsatz)' : '') + '</div>' +
      '<div class="sheet-actions">' +
      '<button class="btn" data-action="set-warmup" data-ex="' + xi + '" data-set="' + si + '">' +
      (s.warmup ? 'Als Arbeitssatz markieren' : 'Als Aufwärmsatz markieren') + '</button>' +
      '<button class="btn btn-danger" data-action="set-entfernen" data-ex="' + xi + '" data-set="' + si + '">Satz entfernen</button>' +
      '<button class="btn" data-action="sheet-close">Abbrechen</button></div>');
  },
  'set-warmup': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const s = aw.exercises[+el.dataset.ex].sets[+el.dataset.set];
    s.warmup = !s.warmup;
    save();
    closeSheet();
    render();
  },
  'set-entfernen': el => {
    const aw = S.activeWorkout;
    if (!aw) return;
    const xi = +el.dataset.ex, i = +el.dataset.set;
    const wex = aw.exercises[xi];
    wex.sets.splice(i, 1);
    /* Pausen-Zeiger korrigieren */
    if (aw.rest && aw.rest.exIdx === xi) {
      if (aw.rest.setIdx === i) { aw.rest = null; Signal.restStop(); }
      else if (aw.rest.setIdx > i) aw.rest.setIdx--;
    }
    if (!wex.sets.length) {
      aw.exercises.splice(xi, 1);
      if (aw.rest) {
        if (aw.rest.exIdx === xi) { aw.rest = null; Signal.restStop(); }
        else if (aw.rest.exIdx > xi) aw.rest.exIdx--;
      }
    }
    save();
    closeSheet();
    render();
    showToast('Satz entfernt');
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
    S.activeWorkout.exercises[+el.dataset.ex].sets.forEach(s => {
      if (s.done !== true && !s.warmup) {
        s.kg = kg;
        if (reps) s.reps = reps;
      }
    });
    save();
    render();
    showToast('Vorschlag übernommen');
  },
  'prog-warum': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    const ex = exById(wex.exId);
    const prog = progressionFor(wex.exId, wex.repMin, wex.repMax);
    const k = Coach.info(ex);
    openSheet('<div class="sheet-title">Coach-Empfehlung</div>' +
      '<div class="sheet-sub"><b>' + esc(ex.name) + '</b> · ' + esc(k.label) + '</div>' +
      '<div class="info-box"><b>' + esc(prog.text) + '</b>' + (prog.grund ? '<br><br>' + esc(prog.grund) : '') + '</div>' +
      '<div class="info-box">Satzpause: <b>' + fmtMinSek(restTarget(wex.exId, wex.restSec)) + ' min</b><br>' +
      ((wex.restSec || (S.exerciseSettings[wex.exId] && S.exerciseSettings[wex.exId].restSec))
        ? 'Von dir festgelegt (Plan- bzw. Übungs-Einstellung).'
        : (S.settings.coach !== false ? esc(k.pauseGrund) : 'Pauschalwert aus den Einstellungen (Klassik-Modus).')) + '</div>' +
      '<div class="mini-note">' + esc(Coach.QUELLEN) + '</div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="sheet-close">Alles klar</button></div>');
  },
  'set-add': el => {
    const wex = S.activeWorkout.exercises[+el.dataset.ex];
    const letzter = wex.sets[wex.sets.length - 1];
    wex.sets.push({ kg: letzter ? letzter.kg : null, reps: letzter ? letzter.reps : null, rpe: null, warmup: false, done: false, doneAt: null, restSec: null });
    save();
    render();
  },
  'set-del': el => {
    const aw = S.activeWorkout;
    const xi = +el.dataset.ex;
    const wex = aw.exercises[xi];
    for (let i = wex.sets.length - 1; i >= 0; i--) {
      if (wex.sets[i].done !== true) {
        wex.sets.splice(i, 1);
        /* Pausen-Zeiger mitschieben, damit restSec nicht im falschen Satz landet */
        if (aw.rest && aw.rest.exIdx === xi) {
          if (aw.rest.setIdx === i) aw.rest = null;
          else if (aw.rest.setIdx > i) aw.rest.setIdx--;
        }
        if (!wex.sets.length) {
          aw.exercises.splice(xi, 1);
          if (aw.rest) {
            if (aw.rest.exIdx === xi) aw.rest = null;
            else if (aw.rest.exIdx > xi) aw.rest.exIdx--;
          }
        }
        save();
        render();
        return;
      }
    }
    showToast('Alle Sätze sind bereits abgehakt');
  },
  'rest-done': () => endRest(true),
  'rest-skip': () => endRest(false),
  'rest-plus': () => {
    const aw = S.activeWorkout;
    if (!aw || !aw.rest) return;
    aw.rest.targetSec += 30;
    if ((Date.now() - aw.rest.startedAt) / 1000 < aw.rest.targetSec) aw.rest.signaled = false;
    save();
    renderTimerBar();
  },
  'pick-ex': el => {
    const cb = pickerCb;
    closeSheet();
    if (cb) cb(el.dataset.id);
  },

  /* Verlauf */
  'verlauf-home': () => { verlaufSub = null; editDraft = null; render(); },
  'wo-open': el => { verlaufSub = { id: el.dataset.id }; render(); window.scrollTo(0, 0); },
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
  'ueb-open': el => { uebSub = { exId: el.dataset.id }; render(); window.scrollTo(0, 0); },
  'ueb-back': () => { uebSub = null; render(); },
  'filter-mg': el => { uebFilter.mg = el.dataset.mg === 'Alle' ? null : el.dataset.mg; render(); },
  'filter-eq': el => { uebFilter.eq = el.dataset.eq === 'Alle Geräte' ? null : el.dataset.eq; render(); },
  'cu-new': () => openSheet('<div class="sheet-title">Eigene Übung</div>' +
    '<div class="form-row"><label>Name</label><input class="input" id="cu-name" placeholder="z. B. Kabelzug einarmig"></div>' +
    '<div class="form-row"><label>Muskelgruppe</label><select class="input" id="cu-mg">' + MGS.map(m => '<option>' + esc(m) + '</option>').join('') + '</select></div>' +
    '<div class="form-row"><label>Equipment</label><select class="input" id="cu-eq">' + EQS.map(m => '<option>' + esc(m) + '</option>').join('') + '</select></div>' +
    '<div class="setting-row" style="box-shadow:none"><div class="li-main"><div class="li-title" style="font-size:15px">Grundübung</div>' +
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
      '<div class="setting-row" style="box-shadow:none"><div class="li-main"><div class="li-title" style="font-size:15px">Grundübung</div>' +
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
    if (el.dataset.id) {
      const r = S.runs.find(x => x.id === el.dataset.id);
      if (r) Object.assign(r, { startedAt, distanzKm: km, dauerSec: dauer, notiz });
    } else {
      S.runs.push({ id: 'r-' + Date.now(), startedAt, distanzKm: km, dauerSec: dauer, notiz });
    }
    S.runs.sort((a, b) => a.startedAt - b.startedAt);
    save();
    closeSheet();
    render();
    showToast('Lauf gespeichert: ' + fmtKg(km) + ' km');
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
      liste += '<div class="setting-row" style="min-height:44px;padding:8px 12px"><div class="li-main"><div class="li-title" style="font-size:15px">' + fmtKg(b.kg) + ' kg</div>' +
        '<div class="li-sub">' + b.date.split('-').reverse().join('.') + '</div></div>' +
        '<button class="del-btn" data-action="bw-del" data-date="' + b.date + '">×</button></div>';
    });
    openSheet('<div class="sheet-title">Körpergewicht</div>' +
      '<div class="form-row"><label>Datum</label><input type="date" class="input" id="bw-date" value="' + todayStr() + '"></div>' +
      '<div class="form-row"><label>Gewicht (kg)</label><input class="input" id="bw-kg" inputmode="decimal" placeholder="z. B. 81,4"></div>' +
      '<div class="sheet-actions"><button class="btn btn-primary" data-action="bw-save">Speichern</button></div>' +
      (liste ? '<div class="section-title" style="margin-top:18px">Letzte Einträge</div>' + liste : ''));
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
    '<div class="form-row" style="margin-top:10px"><label>… oder JSON-Text einfügen</label><textarea class="input" id="imp-text"></textarea></div>' +
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
    '<div class="setting-row" style="margin-top:10px"><div class="li-main"><div class="li-title" style="font-size:15px">Original-Übungsnamen behalten</div>' +
    '<div class="li-sub">Übungen heißen wie in Strong und werden bei Bedarf neu angelegt. Aus: bekannte Übungen werden den deutschen Kraftlog-Übungen zugeordnet.</div></div>' +
    '<label class="switch"><input type="checkbox" id="strong-namen" checked><span class="knob"></span></label></div>' +
    '<div class="setting-row" style="margin-top:10px"><div class="li-main"><div class="li-title" style="font-size:15px">Gewichtseinheit in Strong</div>' +
    '<div class="li-sub">nur nötig, falls die Datei keine Einheiten-Spalte hat</div></div>' +
    '<select class="input-mini" id="strong-unit" style="width:70px"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>' +
    '<div class="form-row" style="margin-top:10px"><label>… oder CSV-Text einfügen</label><textarea class="input" id="strong-text"></textarea></div>' +
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
    '<div class="form-row" style="margin-top:10px"><label>… oder Text einfügen</label><textarea class="input" id="tplimp-text"></textarea></div>' +
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
  const dot = e.target.closest('.chart-dot');
  if (dot) { showChartTip(dot); return; }
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
  /* Einstellungen (Schalter & Selects) */
  if (el.dataset.set) {
    const k = el.dataset.set;
    if (k === 'theme') { S.settings.theme = el.value; applyTheme(); }
    else if (el.type === 'checkbox') S.settings[k] = el.checked;
    save();
    if (k === 'coach') render(); // Klassik-Einstellungen ein-/ausblenden
    return;
  }
});

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
   iPhone-Version offline-fähig. file:// (Mac-App) und Dev-Server bleiben unberührt. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  try { navigator.serviceWorker.register('./sw.js'); } catch (e) { }
}

applyTheme();
render();
maybeResumePrompt();
setInterval(tick, 500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(saveTimer); save(); } // Debounce flushen — iOS feuert beforeunload nicht zuverlässig
  else renderTimerBar();
});
window.addEventListener('beforeunload', () => save());
})();
