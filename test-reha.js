/* Testfälle für den Reha-Modus. Aufruf: node test-reha.js */
global.window = {};
require('./coach.js');
const C = global.window.KraftlogCoach;

const kniebeuge = { id: 'kb', name: 'Kniebeuge', mg: 'Beine', compound: true };
const beinstr   = { id: 'bs', name: 'Beinstrecker', mg: 'Beine', compound: false };
const wade      = { id: 'wd', name: 'Wadenheben', mg: 'Waden', compound: false };
function s(kg, reps, rpe) { return { kg, reps, rpe: rpe == null ? null : rpe }; }

let fehler = 0;
function pruef(bed, txt) { if (!bed) { fehler++; console.log('   ✗ FEHLER: ' + txt); } else { console.log('   ✓ ' + txt); } }

function zeig(titel, ex, ws, wsDavor, reha) {
  const r = C.rehaEmpfehlung(ex, ws, wsDavor, null, null, reha);
  console.log('\n=== ' + titel + ' ===');
  console.log('  Eingabe: ' + ws.map(x => x.kg + '×' + x.reps + (x.rpe != null ? '@' + x.rpe : '')).join(', ') +
    '  | Stufe ' + (reha.stufe) + ', Schmerz ' + reha.schmerz + ', Morgen ' + reha.morgenDelta);
  console.log('  → [' + r.typ + '] ' + r.text + '   (Ampel: ' + r.reha.ampel + ')');
  return r;
}

console.log('##############################################');
console.log('# AMPEL');
console.log('##############################################');
pruef(C.rehaAmpel(2, 0).farbe === 'gruen',   'Schmerz 2, Morgen 0 → grün');
pruef(C.rehaAmpel(3, 0).farbe === 'gruen',   'Schmerz 3 (Grenze Breda) → noch grün');
pruef(C.rehaAmpel(4, 0).farbe === 'gelb',    'Schmerz 4 → gelb (erlaubt, aber keine Steigerung)');
pruef(C.rehaAmpel(5, 0).farbe === 'gelb',    'Schmerz 5 (Silbernagel-Grenze) → noch gelb');
pruef(C.rehaAmpel(6, 0).farbe === 'rot',     'Schmerz 6 → rot');
pruef(C.rehaAmpel(1, 1).farbe === 'gelb',    'Schmerz 1, aber Morgen +1 → gelb');
pruef(C.rehaAmpel(1, 2).farbe === 'rot',     'Schmerz 1, aber Morgen +2 → rot (verzögerte Reaktion schlägt durch)');
pruef(C.rehaAmpel(null, null).farbe === 'unbekannt', 'Ohne Rückmeldung → unbekannt, nie grün');

console.log('\n##############################################');
console.log('# STEIGERUNG NUR BEI GRÜNER AMPEL');
console.log('##############################################');

// Leistung reicht klar für +kg (Ziel 10-15 in Stufe 2, hier 15 Wdh. bei RPE 7 = 3 RIR)
const gutWs = [s(60, 15, 7), s(60, 14), s(60, 13)];

let r = zeig('Grün + Leistung da → Steigerung, aber gedeckelt', kniebeuge, gutWs, null,
  { stufe: 2, schmerz: 2, morgenDelta: 0 });
pruef(r.typ === 'plus', 'Grüne Ampel erlaubt die Steigerung');
pruef(r.kg <= 60 * 1.05 + 0.01, 'Schritt ist auf 5 % gedeckelt (' + r.kg + ' kg statt normal +5 kg → 65)');

r = zeig('Gelb + gleiche Leistung → halten', kniebeuge, gutWs, null,
  { stufe: 2, schmerz: 4, morgenDelta: 0 });
pruef(r.typ === 'halten', 'Gelbe Ampel blockt die Steigerung trotz guter Leistung');
pruef(r.kg === 60, 'Gewicht bleibt bei 60 kg');
pruef(r.reps === 15, 'Halten heißt: die geschaffte Leistung (15 Wdh.) wiederholen, nicht weniger');

r = zeig('Rot → 20 % runter, nicht Pause', kniebeuge, gutWs, null,
  { stufe: 2, schmerz: 7, morgenDelta: 0 });
pruef(r.typ === 'deload', 'Rote Ampel → Deload');
pruef(r.kg === 47.5, 'Rund 20 % runter auf Raster: 47,5 kg (' + r.kg + ')');
pruef(/Silbernagel/.test(r.grund), 'Begründung nennt die Quelle für „nicht schonen"');

r = zeig('Morgen +2 trotz Schmerz 1 → rot', kniebeuge, gutWs, null,
  { stufe: 2, schmerz: 1, morgenDelta: 2 });
pruef(r.typ === 'deload', 'Der Morgen-Check allein kippt die Ampel auf rot');

r = zeig('Keine Rückmeldung → halten, nicht steigern', kniebeuge, gutWs, null,
  { stufe: 2, schmerz: null, morgenDelta: null });
pruef(r.typ === 'halten', 'Ohne Schmerzwert wird nie gesteigert');

console.log('\n##############################################');
console.log('# STUFEN');
console.log('##############################################');
r = zeig('Stufe 1: Isometrie führt, Last steht', kniebeuge, [s(40, 12)], null,
  { stufe: 1, schmerz: 2, morgenDelta: 0 });
pruef(r.typ === 'halten', 'Stufe 1 steigert nie über die Hantel');
pruef(r.hinweis.some(h => /Isometrie/.test(h[0])), 'Stufe 1 gibt die Isometrie-Vorgabe aus');

r = zeig('Stufe 3: schwerer Bereich (6–10 Wdh.)', kniebeuge, [s(80, 10, 7), s(80, 9)], null,
  { stufe: 3, schmerz: 2, morgenDelta: 0 });
pruef(r.typ === 'plus', 'Stufe 3 steigert bei grüner Ampel');
pruef(r.reps <= 10, 'Wiederholungsziel bleibt im HSR-Endbereich (' + r.reps + ')');
pruef(r.kg - 80 <= 80 * 0.05 + 0.001, '5-%-Deckel hält auch bei 80 kg: +' + (r.kg - 80) + ' kg (normal wären +5)');

console.log('\n  Stufenwechsel-Kriterium:');
let sc = C.rehaStufenCheck(2, 3, 3);
pruef(!sc.kann, 'Nach 3 Tagen noch kein Stufenwechsel (Mindestdauer 7 Tage)');
sc = C.rehaStufenCheck(2, 9, 1);
pruef(!sc.kann, 'Nach 9 Tagen, aber nur 1 grüner Einheit: noch nicht');
sc = C.rehaStufenCheck(2, 9, 3);
pruef(sc.kann && sc.naechste === 3, 'Nach 9 Tagen und 3 grünen Einheiten → Stufe 3');

console.log('\n##############################################');
console.log('# SEHNEN-BELASTUNGSZEIT (Tsai et al. 2024)');
console.log('##############################################');
const tut = C.rehaTut([s(60, 10), s(60, 10), s(60, 8)]);
pruef(tut === 28 * 6, '3 Sätze mit 28 Wdh. × 6 s = ' + tut + ' s');
pruef(C.rehaTut([s(60, 10), s(20, 20)]) === 60, 'Leichte Sätze (< 70 % der Top-Last) zählen nicht mit');
pruef(C.rehaTutWoche(120).stand === 'wenig', '120 s/Woche → zu wenig');
pruef(C.rehaTutWoche(240).stand === 'gut',   '240 s/Woche → im Fenster');
pruef(C.rehaTutWoche(400).stand === 'viel',  '400 s/Woche → über dem Fenster');

console.log('\n##############################################');
console.log('# WADEN BLEIBEN UNANGETASTET');
console.log('##############################################');
const normal = C.empfehlung(wade, [s(40, 12, 7), s(40, 12)], [s(40, 12), s(40, 12)], null, null);
pruef(normal.reha === undefined, 'Ohne Reha-Modus trägt die Empfehlung kein Reha-Feld');
console.log('  Waden-Empfehlung (normaler Coach): [' + normal.typ + '] ' + normal.text);

console.log('\n' + (fehler === 0 ? '✓ ALLE TESTS BESTANDEN' : '✗ ' + fehler + ' FEHLER'));
process.exit(fehler ? 1 : 0);
