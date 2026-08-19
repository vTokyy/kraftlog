global.window = {};
require('/Users/olespieker/Desktop/Kraftlog-Quellcode/coach.js');
const C = global.window.KraftlogCoach;

const schraegbank = { id: 'sb', name: 'Schrägbankdrücken', mg: 'Brust', compound: true };
const curl       = { id: 'cu', name: 'Bizepscurl', mg: 'Bizeps', compound: false };
const kniebeuge  = { id: 'kb', name: 'Kniebeuge', mg: 'Beine', compound: true };
const beinstr    = { id: 'bs', name: 'Beinstrecker', mg: 'Beine', compound: false };

function s(kg, reps, rpe) { return { kg, reps, rpe: rpe == null ? null : rpe }; }

function zeig(titel, ex, ws, wsDavor, repMin, repMax) {
  const r = C.empfehlung(ex, ws, wsDavor, repMin, repMax);
  console.log('\n=== ' + titel + ' ===');
  console.log('  Eingabe : ' + ws.map(x => x.kg + '×' + x.reps + (x.rpe != null ? '@' + x.rpe : '')).join(', ')
    + '   Ziel ' + repMin + '–' + repMax
    + (wsDavor ? '   | davor: ' + wsDavor.map(x => x.kg + '×' + x.reps).join(', ') : ''));
  console.log('  → [' + r.typ + '] ' + r.text);
  if (r.hinweis) r.hinweis.forEach(h => console.log('      · ' + h[0] + ': ' + h[1]));
  return r;
}

console.log('##################################################');
console.log('# DIE BEIDEN GEMELDETEN FEHLFÄLLE');
console.log('##################################################');

// Fall 1: Schrägbank, Plan 2×5, beide Sätze 5 geschafft. ALT: "+2,5 kg". Erwartet jetzt: halten.
zeig('Fall 1a — Schrägbank 2×5 geschafft, kein RPE, erstes Mal',
  schraegbank, [s(70, 5), s(70, 5)], null, 5, 5);

zeig('Fall 1b — Schrägbank 2×5, hart (RPE 9,5)',
  schraegbank, [s(70, 5, 9.5), s(70, 5, 9.5)], null, 5, 5);

zeig('Fall 1c — Schrägbank 2×5 mit Reserve (RPE 7,5) → DARF hoch',
  schraegbank, [s(70, 5, 7.5), s(70, 5, 8)], null, 5, 5);

zeig('Fall 1d — Schrägbank 2×5, zweite Einheit in Folge bestätigt → DARF hoch',
  schraegbank, [s(70, 5), s(70, 5)], [s(70, 5), s(70, 4)], 5, 5);

// Fall 2: 10, 8, 5 bei gleichem Gewicht. ALT: "3×6". Erwartet: Last halten/hoch, Ermüdungshinweis.
zeig('Fall 2 — 10/8/5 bei gleicher Last, Plan 10/8/6',
  beinstr, [s(40, 10), s(40, 8), s(40, 5)], null, 6, 10);

zeig('Fall 2b — 10/8/5 mit RPE 8 im Top-Satz → Reserve vorhanden',
  beinstr, [s(40, 10, 8), s(40, 8), s(40, 5)], null, 6, 10);

console.log('\n##################################################');
console.log('# WEITERE SZENARIEN');
console.log('##################################################');

zeig('Ziel klar übertroffen (8 statt 5) → größerer Schritt',
  schraegbank, [s(70, 8, 8), s(70, 7)], null, 5, 5);

zeig('Ziel knapp verfehlt (4 von 5), einmalig → halten',
  schraegbank, [s(70, 4), s(70, 4)], null, 5, 5);

zeig('Ziel zweimal in Folge verfehlt → Deload',
  schraegbank, [s(70, 4), s(70, 3)], [s(70, 4), s(70, 4)], 5, 5);

zeig('Ziel massiv verfehlt (2 von 8) → sofort zu schwer',
  kniebeuge, [s(120, 2), s(120, 2)], null, 6, 8);

zeig('Leichte Übung 10 kg — 2,5-kg-Sprung wäre 25 % → Wdh.-Progression',
  curl, [s(10, 12, 7.5), s(10, 11), s(10, 10)], null, 8, 12);

zeig('Curl bei 30 kg — Sprung trägt jetzt',
  curl, [s(30, 12, 7.5), s(30, 11), s(30, 10)], null, 8, 12);

zeig('Sauber im Bereich, kein Abfall, Reserve unklar',
  kniebeuge, [s(100, 7), s(100, 7), s(100, 7)], null, 6, 8);

zeig('Extremer Abfall 12/6/3 UND Volumen bricht ein → Steigerung blockiert',
  beinstr, [s(40, 12, 8), s(40, 6), s(40, 3)], [s(40, 10), s(40, 9), s(40, 8)], 6, 10);

zeig('Nur ein Arbeitssatz',
  schraegbank, [s(70, 6, 8)], null, 5, 5);

console.log('\n##################################################');
console.log('# HILFSFUNKTIONEN');
console.log('##################################################');
console.log('schritt(Schrägbank, 70 kg) =', C.schritt(schraegbank, 70));
console.log('schritt(Curl, 10 kg)       =', C.schritt(curl, 10), '(null = Wdh.-Progression)');
console.log('schritt(Curl, 30 kg)       =', C.schritt(curl, 30));
console.log('schritt(Kniebeuge, 120 kg) =', C.schritt(kniebeuge, 120));
console.log('repsFuerSprung(10, 1.25, 8)=', C.repsFuerSprung(10, 1.25, 8));
console.log('abfallAnalyse(10/8/5)      =', JSON.stringify(C.abfallAnalyse([s(40,10),s(40,8),s(40,5)])));
console.log('abfallAnalyse(Pyramide)    =', JSON.stringify(C.abfallAnalyse([s(40,10),s(50,8),s(60,5)])));

console.log('\n##################################################');
console.log('# NACHGEZOGENE FÄLLE');
console.log('##################################################');
zeig('Stagnation: 4 von 5, zweimal in Folge → jetzt Deload',
  schraegbank, [s(70, 4), s(70, 4)], [s(70, 4), s(70, 4)], 5, 5);
zeig('Bestätigungslauf 1/2 (Ziel 10 getroffen, ohne RPE)',
  beinstr, [s(40, 10), s(40, 9), s(40, 8)], null, 6, 10);
zeig('Bestätigungslauf 2/2 → jetzt hoch',
  beinstr, [s(40, 10), s(40, 9), s(40, 8)], [s(40, 10), s(40, 9), s(40, 9)], 6, 10);
zeig('Dauerhaft starker Abfall (Stil) → Steigerung nicht blockiert',
  beinstr, [s(40, 12, 8), s(40, 6), s(40, 4)], [s(40, 11), s(40, 5), s(40, 3)], 6, 10);
zeig('Massiv verfehlt (2 von 8) → Reduktion jetzt am Ausmaß bemessen',
  kniebeuge, [s(120, 2), s(120, 2)], null, 6, 8);

console.log('\n##################################################');
console.log('# ECHTER BEREICH (repMin < repMax)');
console.log('##################################################');
zeig('7/7/7 im Bereich 6–8 → ausbauen, KEIN Verfehlen',
  kniebeuge, [s(100, 7), s(100, 7), s(100, 7)], null, 6, 8);
zeig('6/6/6 an der Untergrenze 6–8 → ausbauen',
  kniebeuge, [s(100, 6), s(100, 6), s(100, 6)], null, 6, 8);
zeig('5/5/5 unter der Untergrenze 6–8 → zurückerobern',
  kniebeuge, [s(100, 5), s(100, 5), s(100, 5)], null, 6, 8);
zeig('8/8/7 am oberen Ende 6–8, ohne RPE → bestätigen',
  kniebeuge, [s(100, 8), s(100, 8), s(100, 7)], null, 6, 8);
zeig('8/8/7 bestätigt → hoch',
  kniebeuge, [s(100, 8), s(100, 8), s(100, 7)], [s(100, 8), s(100, 7), s(100, 7)], 6, 8);
