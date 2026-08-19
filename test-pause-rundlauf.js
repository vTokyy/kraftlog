const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const hole = name => {
  for (const m of ['\\{[\\s\\S]*?\\n\\}', '\\{.*\\}']) {
    const r = src.match(new RegExp('^function ' + name + '\\([^)]*\\) ' + m, 'm'));
    if (r) return r[0];
  }
  throw new Error(name + ' nicht gefunden');
};
const f = new Function(
  'lastSessionFor', 'workingSets',
  [hole('satzVorgabe'), hole('normalizeTplExercise'), hole('buildWoExercise'), hole('tplStrukturUpdate')].join('\n') +
  '\nreturn { normalizeTplExercise, buildWoExercise, tplStrukturUpdate };'
)(() => null, () => []);

let fehler = 0;
const zeig = (t, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + t);
  console.log('         ' + JSON.stringify(a) + (ok ? '' : '\n         ERWARTET ' + JSON.stringify(b))); };

console.log('\n=== Vorlage → Training → Plan-Abgleich → Vorlage ===');
const roh = { exId: 'e', restSec: null, sets: [
  { warmup: true, kg: 40, reps: 8, restSec: 60 },
  { warmup: true, kg: 55, reps: 5 },
  { reps: 5 }, { reps: 5, restSec: 210 }, { reps: 5, restSec: 210 } ] };

const tpl = f.normalizeTplExercise(JSON.parse(JSON.stringify(roh)));
zeig('1. normalizeTplExercise erhält restSec je Satz',
  tpl.sets.map(s => s.restSec ?? null), [60, null, null, 210, 210]);

const wex = f.buildWoExercise('e', tpl.sets, tpl.restSec);
zeig('2. buildWoExercise überträgt es als restZiel',
  wex.sets.map(s => s.restZiel), [60, null, null, 210, 210]);

/* Training gelaufen: gemessene Pausen landen in restSec, restZiel bleibt */
wex.sets.forEach((s, i) => { s.restSec = 100 + i; s.done = true; });
zeig('3. gemessene Pause überschreibt die Vorgabe NICHT',
  wex.sets.map(s => s.restZiel), [60, null, null, 210, 210]);

const tpl2 = { exercises: [{ exId: 'e', restSec: null, sets: [] }] };
f.tplStrukturUpdate(tpl2, { exercises: [wex] });
zeig('4. Plan-Abgleich schreibt die Vorgabe zurück (nicht die Messung)',
  tpl2.exercises[0].sets.map(s => s.restSec ?? null), [60, null, null, 210, 210]);

const tpl3 = f.normalizeTplExercise(tpl2.exercises[0]);
zeig('5. zweiter Rundlauf stabil',
  tpl3.sets.map(s => s.restSec ?? null), [60, null, null, 210, 210]);

console.log('\n=== Altbestand ohne die neuen Felder ===');
const alt = f.normalizeTplExercise({ exId: 'e', restSec: 150, sets: [{ reps: 8 }, { reps: 8 }] });
zeig('alte Vorlage bleibt unverändert gültig', alt.sets.map(s => s.restSec ?? null), [null, null]);
const wexAlt = f.buildWoExercise('e', alt.sets, alt.restSec);
zeig('daraus gebaute Sätze haben restZiel null', wexAlt.sets.map(s => s.restZiel), [null, null]);

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
