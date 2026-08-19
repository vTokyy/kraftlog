/* Testet vorschlagAufSaetze() aus app.js — rein, deshalb wird der Quelltext
   direkt extrahiert statt die ganze App zu laden. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const m = src.match(/function vorschlagAufSaetze\(sets, kg, reps\) \{[\s\S]*?\n\}/);
if (!m) { console.error('FEHLER: vorschlagAufSaetze() nicht gefunden'); process.exit(1); }
const anwenden = eval('(' + m[0] + ')');

let fehler = 0;
function t(titel, vorher, kg, reps, erw) {
  const sets = vorher.map(s => Object.assign({}, s));
  anwenden(sets, kg, reps);
  const ist = sets.map(s => (s.warmup ? 'W' : '') + (s.done === true ? 'X' : '') + s.kg + '×' + s.reps).join(' ');
  const ok = ist === erw;
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel);
  console.log('         Vorschlag ' + kg + ' kg × ' + reps + '  →  ' + ist + (ok ? '' : '   ERWARTET ' + erw));
}
const p = (kg, reps) => ({ kg, reps, warmup: false, done: false });

console.log('\n=== Vorbelegung 8/8/6 @60kg ===');
t('Steigerung auf 6 → Schema zieht mit',   [p(60,8),p(60,8),p(60,6)], 62.5, 6,  '62.5×6 62.5×6 62.5×6');
t('Bestätigen auf 8 → hintere bleiben',    [p(60,8),p(60,8),p(60,6)], 60,   8,  '60×8 60×8 60×6');
t('Halten auf 5 → gedeckelt, kein 8er',    [p(60,8),p(60,8),p(60,6)], 60,   5,  '60×5 60×5 60×5');
t('Ziel 10 über allem → absteigend ok',    [p(60,8),p(60,8),p(60,6)], 60,  10,  '60×10 60×8 60×6');

console.log('\n=== Ränder ===');
t('leere Felder → Ziel überall',           [p(null,null),p(null,null)], 60, 8,  '60×8 60×8');
t('kein Wdh.-Ziel → nur kg',               [p(60,8),p(60,6)],           65, null,'65×8 65×6');
t('Aufwärmsatz bleibt unberührt',          [{kg:20,reps:10,warmup:true,done:false},p(60,8),p(60,6)], 62.5, 6, 'W20×10 62.5×6 62.5×6');
t('erledigter Satz bleibt unberührt',      [{kg:60,reps:8,warmup:false,done:true},p(60,8),p(60,6)],  62.5, 6, 'X60×8 62.5×6 62.5×6');

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
