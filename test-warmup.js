/* Testet die Aufwärm-Rampe aus app.js — rein, deshalb wird der Quelltext direkt
   extrahiert statt die ganze App zu laden. Neu ab v42: 2, 3 oder 4 Sätze. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
function hol(re, name) {
  const m = src.match(re);
  if (!m) { console.error('FEHLER: ' + name + ' nicht in app.js gefunden'); process.exit(1); }
  return m[0];
}
const code = hol(/const WARMUP_GROSS = \[[\s\S]*?\nfunction computeWarmup[\s\S]*?\n\}/, 'Aufwärm-Block');
eval(code);

let fehler = 0;
function t(titel, ist, erw) {
  const ok = String(ist) === String(erw);
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel + '   → ' + ist + (ok ? '' : '   ERWARTET ' + erw));
}
const zeig = sets => sets.map(s => s.kg + '×' + s.reps).join(' ');
const bank  = { mg: 'Brust',    eq: 'Langhantel' };
const curl  = { mg: 'Bizeps',   eq: 'Kurzhantel' };
const beine = { mg: 'Beine',    eq: 'Langhantel' };

console.log('\n=== Empfehlung ===');
t('kleine Gruppe → 2',                  warmupSatzzahl(curl, 30),   2);
t('große Gruppe, moderate Last → 3',    warmupSatzzahl(bank, 80),   3);
t('große Gruppe, schwere Last → 4',     warmupSatzzahl(bank, 105),  4);
t('kleine Gruppe bleibt bei 2',         warmupSatzzahl(curl, 120),  2);
t('ohne Gewicht keine Vierer-Rampe',    warmupSatzzahl(bank, null), 3);

console.log('\n=== Rampen ===');
t('105 kg Bankdrücken, Empfehlung (4)', zeig(computeWarmup(105, bank)),      '42.5×10 62.5×5 80×3 92.5×2');
t('dieselbe Last mit 2 Sätzen',         zeig(computeWarmup(105, bank, 2)),   '52.5×8 80×4');
t('dieselbe Last mit 3 Sätzen',         zeig(computeWarmup(105, bank, 3)),   '52.5×8 72.5×4 90×2');
t('Curl 30 kg, Empfehlung (2)',         zeig(computeWarmup(30, curl)),       '15×8 22.5×4');
t('Kniebeuge 140 kg (4)',               zeig(computeWarmup(140, beine)),     '55×10 85×5 105×3 122.5×2');

console.log('\n=== Ränder ===');
t('kein Satz auf oder über dem Ziel',   computeWarmup(105, bank, 4).every(s => s.kg < 105), true);
t('streng aufsteigend',                 computeWarmup(105, bank, 4).every((s, i, a) => i === 0 || s.kg > a[i-1].kg), true);
t('nie unter der leeren Stange',        computeWarmup(30, bank, 4).every(s => s.kg >= 20), true);
/* Leichte Langhantel-Last: Es bleibt genau der Stangensatz übrig — alles
   darunter wäre leichter als die leere Stange, alles darüber schon das
   Arbeitsgewicht. */
t('22,5 kg Langhantel → nur die Stange', zeig(computeWarmup(22.5, bank, 4)),  '20×10');
t('Miniaturlast → gar kein Aufwärmen',   computeWarmup(1, curl, 4).length,    0);
t('unbekannte Anzahl → Empfehlung',     zeig(computeWarmup(105, bank, 9)),   zeig(computeWarmup(105, bank)));

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
