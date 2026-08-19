/* Testet satzVorgabe() aus app.js — die Funktion ist rein, deshalb wird ihr
   Quelltext direkt aus app.js extrahiert statt die ganze App zu laden. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const m = src.match(/function satzVorgabe\(z, ref\) \{[\s\S]*?\n\}/);
if (!m) { console.error('FEHLER: satzVorgabe() nicht in app.js gefunden'); process.exit(1); }
const satzVorgabe = eval('(' + m[0] + ')');

let fehler = 0;
function t(titel, z, ref, erwKg, erwReps) {
  const r = satzVorgabe(z, ref);
  const ok = r.kg === erwKg && r.reps === erwReps;
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel);
  console.log('         Plan ' + JSON.stringify(z) + '  letztes Mal ' + JSON.stringify(ref));
  console.log('         → kg=' + r.kg + ' reps=' + r.reps + (ok ? '' : '   ERWARTET kg=' + erwKg + ' reps=' + erwReps));
}

console.log('\n=== Der gemeldete Fall: Plan 8/8/5, letztes Mal 8/8/6 ===');
t('Satz 1: Plan 8, war 8 → bleibt 8',      { reps: 8 }, { kg: 60, reps: 8 }, 60, 8);
t('Satz 2: Plan 8, war 8 → bleibt 8',      { reps: 8 }, { kg: 60, reps: 8 }, 60, 8);
t('Satz 3: Plan 5, war 6 → jetzt 6',       { reps: 5 }, { kg: 60, reps: 6 }, 60, 6);

console.log('\n=== Gegenprobe: darf NICHT hochgezogen werden ===');
t('war schlechter (4 < Plan 5) → Plan 5',  { reps: 5 }, { kg: 60, reps: 4 }, 60, 5);
t('mehr Wdh., aber leichter → Plan gilt',  { reps: 5, kg: 70 }, { kg: 60, reps: 10 }, 70, 5);
t('mehr Wdh. bei mehr kg → beides hoch',   { reps: 5, kg: 60 }, { kg: 65, reps: 7 }, 65, 7);

console.log('\n=== Ränder ===');
t('kein Plan-Wert → letztes Mal',          {}, { kg: 60, reps: 6 }, 60, 6);
t('keine Historie → Plan',                 { reps: 5, kg: 60 }, null, 60, 5);
t('weder noch → leer',                     {}, null, null, null);
t('Körpergewicht (kg null beidseitig)',    { reps: 8 }, { kg: null, reps: 12 }, null, 12);
t('Plan-kg höher als letztes Mal',         { reps: 5, kg: 70 }, { kg: 60, reps: 5 }, 70, 5);
t('Plan-kg 0 (Körpergewicht), mehr Wdh.',  { reps: 8, kg: 0 }, { kg: 0, reps: 11 }, 0, 11);

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
