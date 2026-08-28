/* Testet die beiden neuen Achsen des Coaches:
   1. Satzvorgabe — jede Empfehlung trägt einen vollständigen Satzplan
   2. Satzzahl    — sie ist eine eigene Progressionsachse, keine Dekoration
   Dazu die Periodisierung (4-Wochen-Block). */
global.window = {};
require(__dirname + '/coach.js');
const C = global.window.KraftlogCoach;

const bank   = { id: 'bd', name: 'Bankdrücken', mg: 'Brust', compound: true };
const curl   = { id: 'cu', name: 'Bizepscurl',  mg: 'Bizeps', compound: false };
const s = (kg, reps, rpe) => ({ kg, reps, rpe: rpe == null ? null : rpe });
const TAG = 86400000;

let fehler = 0;
function pruef(titel, ist, erwartet) {
  const ok = String(ist) === String(erwartet);
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel + '   → ' + ist + (ok ? '' : '   ERWARTET ' + erwartet));
}
const schema = r => (r.plan || []).map(p => p.reps).join('/');
const lasten = r => (r.plan || []).map(p => p.kg).join('/');

console.log('\n########## 1. Jede Empfehlung trägt alle Arbeitssätze ##########\n');
const r1 = C.empfehlung(bank, [s(100, 8), s(100, 8), s(100, 7)], [s(100, 8), s(100, 7), s(100, 7)], 6, 8);
pruef('Steigerung: 3 Sätze im Plan', r1.plan.length, 3);
/* Oberkörper-Grundübung: 2,5 % auf 100 kg = 2,5 kg. Das Wiederholungsziel an der
   neuen Last ist über e1RM zurückgerechnet, nicht auf repMin gesetzt. */
pruef('Steigerung: alle Sätze auf der neuen Last', lasten(r1), '102.5/102.5/102.5');
pruef('Steigerung: Abfall nach hinten eingeplant', schema(r1), '7/7/6');
pruef('Steigerung: planText steht', !!r1.planText, true);

const r2 = C.empfehlung(curl, [s(12, 12), s(12, 11), s(12, 10)], null, 8, 12);
pruef('Ohne Historie davor trotzdem ein voller Plan', r2.plan.length, 3);

console.log('\n########## 2. Kein Satz unter 75 % des ersten ##########\n');
/* 10/8/5 = −50 % Abfall. Die Vorgabe darf diesen Einbruch nicht fortschreiben. */
const r3 = C.empfehlung(curl, [s(40, 10), s(40, 8), s(40, 5)], null, 6, 10);
pruef('Vorgabe bricht nicht auf 5 ein', schema(r3), '10/9/8');

console.log('\n########## 3. Satzzahl als eigene Achse ##########\n');
/* Last steht seit zwei Einheiten, Sätze halten zusammen, Volumen hat Luft. */
const gleich = [s(100, 7), s(100, 7), s(100, 6)];
const rPlus = C.empfehlung(bank, gleich, gleich, 6, 8, { sessionSaetze: 3, wochenSaetze: 12 });
pruef('Stagnation + Luft im Volumen → ein Satz mehr', rPlus.plan.length, 4);
pruef('… und das wird auch so gemeldet', rPlus.satzPlus, true);

const rMax = C.empfehlung(bank, gleich, gleich, 6, 8, { sessionSaetze: 3, wochenSaetze: 18 });
pruef('Wochenvolumen am Maximum (18) → kein Satz mehr', rMax.plan.length, 3);

const rDeckel = C.empfehlung(bank,
  [s(100, 7), s(100, 7), s(100, 7), s(100, 7), s(100, 6)],
  [s(100, 7), s(100, 7), s(100, 7), s(100, 7), s(100, 6)], 6, 8, { sessionSaetze: 5, wochenSaetze: 12 });
pruef('Obergrenze je Übung greift bei 5', rDeckel.plan.length, 5);

const rFrisch = C.empfehlung(bank, gleich, [s(100, 7), s(100, 7)], 6, 8, { sessionSaetze: 3, wochenSaetze: 12 });
pruef('Satzzahl gerade erst geändert → erst setzen lassen', rFrisch.plan.length, 3);

const rHoch = C.empfehlung(bank, [s(100, 8), s(100, 8), s(100, 7)], [s(100, 8), s(100, 8), s(100, 7)], 6, 8,
  { sessionSaetze: 3, wochenSaetze: 12 });
pruef('Wenn die Last steigt, bleibt die Satzzahl stehen', rHoch.typ + '/' + rHoch.plan.length, 'plus/3');

console.log('\n########## 4. Volumenvergleich pro Satz (der alte Fehler) ##########\n');
/* Letzte Einheit 4 Sätze, davor 3 — die Rohsumme steigt, die Leistung je Satz
   nicht. Vorher galt das als Fortschritt bzw. als Einbruch. */
const vier = [s(100, 8), s(100, 7), s(100, 7), s(100, 7)];
const drei = [s(100, 8), s(100, 7), s(100, 7)];
const rVol = C.empfehlung(bank, drei, vier, 6, 8, { sessionSaetze: 3, wochenSaetze: 12 });
pruef('Ein Satz weniger ist kein Leistungseinbruch', rVol.typ, 'plus');

console.log('\n########## 5. Anstrengung zählt am LETZTEN Satz ##########\n');
/* Genau die gemeldete Unstimmigkeit: RPE 8 im frischen ersten Satz reichte für
   den Sprung, obwohl der letzte Satz am Limit lag. */
const rFrueh = C.empfehlung(bank, [s(100, 6, 8), s(100, 6, 9.5), s(100, 6, 9.5)], null, 6, 6);
pruef('RPE 9,5 im letzten Satz → kein Sprung', rFrueh.typ, 'wdh');
const rSpaet = C.empfehlung(bank, [s(100, 6, 8), s(100, 6, 8), s(100, 6, 8)], null, 6, 6);
pruef('RPE 8 auch im letzten Satz → Sprung', rSpaet.typ, 'plus');

console.log('\n########## 6. Periodisierung ##########\n');
const cfg = { aktiv: true, basis: 105, saetze: 4, reps: 4, seit: Date.now() };
const wochen = C.periodWochen(bank, cfg, 1);
pruef('Woche 1 = Basis', wochen[0].kg, 105);
pruef('Woche 2 = ein Steigerungsschritt', wochen[1].kg, 107.5);
pruef('Woche 3 = zwei Schritte (Peak)', wochen[2].kg, 110);
pruef('Woche 4 = ~85 % der Peak-Last', wochen[3].kg, 92.5);
pruef('Woche 1–3 gleiches Schema', wochen[0].saetze + 'x' + wochen[0].reps, '4x4');
pruef('Woche 4 reduziert', wochen[3].saetze + 'x' + wochen[3].reps, '3x3');
pruef('Pause Woche 1 (Brust 180 + 30)', wochen[0].pause, 210);
pruef('Pause Peak-Woche länger', wochen[2].pause, 270);
pruef('Pause Deload kürzer', wochen[3].pause, 150);
pruef('Block 2 beginnt einen Schritt höher', C.periodWochen(bank, cfg, 2)[0].kg, 107.5);

const jetzt = Date.now();
const w1 = C.periodEmpfehlung(bank, { basis: 105, saetze: 4, reps: 4, seit: jetzt }, {}, jetzt);
pruef('Woche 1: vier Sätze à vier Wdh.', schema(w1), '4/4/4/4');
pruef('Woche 1: alle auf 105 kg', lasten(w1), '105/105/105/105');

/* Woche 2 mit vollständig absolvierter Woche 1 → steigt auf 107,5 kg */
const start = jetzt - 8 * TAG;
const erfuellt = { einheiten: [{ ts: start + 2 * TAG, ws: [s(105, 4), s(105, 4), s(105, 4), s(105, 4)] }] };
const w2ok = C.periodEmpfehlung(bank, { basis: 105, saetze: 4, reps: 4, seit: start }, erfuellt, jetzt);
pruef('Woche 2 nach voller Woche 1 → 107,5 kg', lasten(w2ok), '107.5/107.5/107.5/107.5');

/* Dieselbe Woche 2, aber Woche 1 stand nicht → Last bleibt stehen */
const luecke = { einheiten: [{ ts: start + 2 * TAG, ws: [s(105, 4), s(105, 4), s(105, 3), s(105, 2)] }] };
const w2halt = C.periodEmpfehlung(bank, { basis: 105, saetze: 4, reps: 4, seit: start }, luecke, jetzt);
pruef('Woche 2 mit unvollständiger Woche 1 → hält 105 kg', lasten(w2halt), '105/105/105/105');
pruef('… und sagt es auch', w2halt.periode.gehalten, true);

const w4 = C.periodEmpfehlung(bank, { basis: 105, saetze: 4, reps: 4, seit: jetzt - 22 * TAG }, {}, jetzt);
pruef('Woche 4 ist der Deload', w4.typ + ' ' + schema(w4), 'deload 3/3/3');
const w5 = C.periodEmpfehlung(bank, { basis: 105, saetze: 4, reps: 4, seit: jetzt - 29 * TAG }, {}, jetzt);
pruef('Nach vier Wochen beginnt Block 2', w5.periode.block + '/W' + w5.periode.woche, '2/W1');

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
