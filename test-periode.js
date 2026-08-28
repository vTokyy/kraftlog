/* Testet die App-Seite der Periodisierung: Zustandslesen, Wochenrechnung und die
   Rangfolge im Pausenziel. Die Funktionen sind rein bis auf S/Coach/exById —
   die werden hier gestellt, statt die ganze App zu laden. */
const fs = require('fs');
global.window = {};
require(__dirname + '/coach.js');
const Coach = global.window.KraftlogCoach;
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');

function hol(name, re) {
  const m = src.match(re);
  if (!m) { console.error('FEHLER: ' + name + ' nicht in app.js gefunden'); process.exit(1); }
  return m[0];
}
const teile = [
  hol('wochenStart',   /function wochenStart\(ts\) \{[\s\S]*?\n\}/),
  hol('periodFuer',    /function periodFuer\(exId\) \{[\s\S]*?\n\}/),
  hol('periodWoche',   /function periodWoche\(exId\) \{[\s\S]*?\n\}/),
  hol('restDefault',   /function restDefault\(exId\) \{[\s\S]*?\n\}/),
  hol('pauseStandard', /function pauseStandard\(exId\) \{[\s\S]*?\n\}/),
  hol('restTarget',    /function restTarget\(exId, tplRest\) \{[\s\S]*?\n\}/)
].join('\n');

const BANK = { id: 'bankdruecken-lh', name: 'Bankdrücken (Langhantel)', mg: 'Brust', eq: 'Langhantel', compound: true };
const CURL = { id: 'cu', name: 'Curl', mg: 'Bizeps', eq: 'Kurzhantel', compound: false };
let S = null;
const exById = id => (id === BANK.id ? BANK : CURL);
/* `S` wird als Proxy durchgereicht, damit jeder Testfall den Zustand wechseln kann,
   ohne den extrahierten Quelltext neu zu bauen. */
const A = new Function('Coach', 'exById', 'getS',
  'const S = new Proxy({}, { get: (_, k) => getS()[k] });\n' + teile +
  '\nreturn { wochenStart, periodFuer, periodWoche, restTarget };')(Coach, exById, () => S);

let fehler = 0;
function t(titel, ist, erw) {
  const ok = String(ist) === String(erw);
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel + '   → ' + ist + (ok ? '' : '   ERWARTET ' + erw));
}
const TAG = 86400000;
function zustand(periode, restSec) {
  const o = {};
  if (periode) o.periode = periode;
  if (restSec) o.restSec = restSec;
  return { settings: { coach: true, restCompound: 180, restIsolation: 150 }, exerciseSettings: { [BANK.id]: o } };
}

console.log('\n=== wochenStart liegt immer auf Montag 00:00 ===');
[0, 1, 2, 3, 4, 5, 6].forEach(off => {
  const d = new Date(2026, 7, 24 + off, 15, 37);   // Mo 24.08.2026 + off
  const w = new Date(A.wochenStart(d.getTime()));
  t('Tag ' + d.toLocaleDateString('de-DE'), w.getDay() + '/' + w.getHours(), '1/0');
});

console.log('\n=== Block ist aus, solange kein Startgewicht steht ===');
S = zustand({ aktiv: true, basis: null, saetze: 4, reps: 4, seit: Date.now() });
t('ohne Basis kein Block', A.periodFuer(BANK.id), null);
S = zustand({ aktiv: false, basis: 105, saetze: 4, reps: 4, seit: Date.now() });
t('ausgeschaltet kein Block', A.periodFuer(BANK.id), null);

console.log('\n=== Wochenlauf ===');
const start = A.wochenStart(Date.now());
[[0, 1], [7, 2], [14, 3], [21, 4], [28, 1], [35, 2]].forEach(([tage, woche]) => {
  S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start - tage * TAG });
  const pw = A.periodWoche(BANK.id);
  t('nach ' + tage + ' Tagen → Woche ' + woche, pw.woche, woche);
});
S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start - 28 * TAG });
t('nach 28 Tagen → Block 2', A.periodWoche(BANK.id).block, 2);
t('Block 2 startet bei 107,5 kg', A.periodWoche(BANK.id).kg, 107.5);

console.log('\n=== Pausenziel: Rangfolge ===');
S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start });
t('Woche 1 → Coach-Pause (180) + 30',        A.restTarget(BANK.id, null), 210);
S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start - 14 * TAG });
t('Peak-Woche → 180 + 90',                    A.restTarget(BANK.id, null), 270);
S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start - 21 * TAG });
t('Deload-Woche → 180 − 30',                  A.restTarget(BANK.id, null), 150);
S = zustand({ aktiv: true, basis: 105, saetze: 4, reps: 4, seit: start }, 240);
t('eigene Übungspause schlägt die Woche',     A.restTarget(BANK.id, null), 240);
t('Plan-/Tagesvorgabe schlägt alles',         A.restTarget(BANK.id, 300), 300);
S = zustand(null);
t('ohne Block der normale Coach-Wert',        A.restTarget(BANK.id, null), 180);
S = { settings: { coach: false, restCompound: 180, restIsolation: 150 }, exerciseSettings: {} };
t('Klassik-Modus: Pauschalwert',              A.restTarget(BANK.id, null), 180);

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
