/* Testet prNeuBerechnen() aus app.js: PR-Abzeichen nach Korrektur eines bereits
   abgehakten Satzes. Die beteiligten Funktionen werden aus app.js extrahiert und
   in einem Scope mit einem gefälschten State ausgeführt. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const hole = name => {
  /* mehrzeilige Form zuerst, sonst die einzeilige (z. B. isDone) */
  for (const muster of ['\\{[\\s\\S]*?\\n\\}', '\\{.*\\}']) {
    const m = src.match(new RegExp('^function ' + name + '\\([^)]*\\) ' + muster, 'm'));
    if (m) return m[0];
  }
  console.error('FEHLER: ' + name + '() nicht gefunden'); process.exit(1);
};
const quelle = ['isDone', 'neueBests', 'feedBests', 'e1rmOf', 'prBests', 'prNeuBerechnen', 'prGegen']
  .map(hole).join('\n');
const bauen = new Function('S', 'fmtKg', quelle + '\nreturn { prNeuBerechnen };');

let fehler = 0;
function lauf(titel, historie, saetze, erwartet) {
  const S = {
    workouts: historie.map(sets => ({ exercises: [{ exId: 'e', sets }] })),
    activeWorkout: { exercises: [{ exId: 'e', sets: saetze }] }
  };
  bauen(S, x => String(x)).prNeuBerechnen(0);
  const ist = saetze.map(s => s.pr || '–').join(' ');
  const ok = ist === erwartet;
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel);
  console.log('         Sätze ' + saetze.map(s => s.kg + '×' + s.reps + (s.warmup ? 'W' : '')).join(', '));
  console.log('         → ' + ist + (ok ? '' : '   ERWARTET ' + erwartet));
}
const d = (kg, reps, at, warmup) => ({ kg, reps, done: true, doneAt: at, warmup: !!warmup, pr: 'gewicht' });

// Historie: bestes Gewicht 100 kg, bei 100 kg bisher 6 Wdh.
const hist = [[{ kg: 100, reps: 6, doneAt: 1 }, { kg: 90, reps: 8, doneAt: 2 }]];

console.log('\n=== Historie: 100 kg × 6 als Bestwert ===');
lauf('Vertipper 100×8 → korrigiert auf 100×5: PR muss weg',
  hist, [d(100, 5, 10)], '–');
lauf('100×8 → e1RM-PR (Priorität: Gewicht > e1RM > Wdh.)',
  hist, [d(100, 8, 10)], 'e1rm');
lauf('105 kg ist Gewichts-PR',
  hist, [d(105, 3, 10)], 'gewicht');
lauf('Kette: mittlerer Satz kein PR, dritter schlägt den ersten',
  hist, [d(100, 7, 10), d(100, 6, 11), d(100, 8, 12)], 'e1rm – e1rm');
lauf('Kette: erster Satz war der PR, danach nichts mehr',
  hist, [d(100, 8, 10), d(100, 7, 11)], 'e1rm –');

/* Historie mit hohem e1RM-Deckel (120×3), damit ein reiner Wdh.-PR greift */
const hist2 = [[{ kg: 120, reps: 3, doneAt: 1 }, { kg: 100, reps: 6, doneAt: 2 }]];
console.log('\n=== Historie: 120 kg × 3 und 100 kg × 6 ===');
lauf('100×7 → reiner Wdh.-PR (e1RM bleibt unter 120×3)',
  hist2, [d(100, 7, 10)], 'wdh');
lauf('100×6 → kein PR, exakt der alte Stand',
  hist2, [d(100, 6, 10)], '–');
lauf('Korrektur 100×7 → 100×5: PR verschwindet',
  hist2, [d(100, 5, 10)], '–');
lauf('Aufwärmsatz bekommt nie einen PR',
  hist, [d(120, 3, 10, true)], '–');
lauf('Zwei Sätze, nur der erste zählt als Gewichts-PR',
  hist, [d(110, 3, 10), d(110, 3, 11)], 'gewicht –');

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
