/* Testet restZielFuerSatz() aus app.js: Pausenziel je Satz inkl. Aufwärmblock-Regel. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const hole = name => {
  for (const muster of ['\\{[\\s\\S]*?\\n\\}', '\\{.*\\}']) {
    const m = src.match(new RegExp('^function ' + name + '\\([^)]*\\) ' + muster, 'm'));
    if (m) return m[0];
  }
  console.error('FEHLER: ' + name + '() nicht gefunden'); process.exit(1);
};
/* restTarget wird gestubbt: die Hierarchie darüber (Plan → Übung → Coach) ist
   unverändert und anderswo abgedeckt; hier geht es um die Satz-Ebene. */
const bauen = new Function('restTarget', hole('restZielFuerSatz') + '\nreturn restZielFuerSatz;');
const UEBUNG = 180;   // Übungs-/Coach-Wert
const restZielFuerSatz = bauen(() => UEBUNG);

let fehler = 0;
function lauf(titel, saetze, erwartet) {
  const wex = { exId: 'e', restSec: null, sets: saetze };
  const ist = saetze.map((_, i) => { const v = restZielFuerSatz(wex, i); return v == null ? '–' : String(v); });
  const ok = ist.join(' ') === erwartet;
  if (!ok) fehler++;
  console.log((ok ? '  ok   ' : '  FEHL ') + titel);
  console.log('         ' + saetze.map(s => (s.warmup ? 'W' : 'A') + (s.restZiel ? '(' + s.restZiel + ')' : '')).join(' ') +
              '   →   ' + ist.join(' ') + (ok ? '' : '   ERWARTET ' + erwartet));
}
const W = r => ({ warmup: true, restZiel: r || null });
const A = r => ({ warmup: false, restZiel: r || null });

console.log('\n=== Aufwärmblock-Regel (Übungswert 180 s) ===');
lauf('W W W A A A — nur letzter Aufwärmsatz bekommt Timer',
  [W(), W(), W(), A(), A(), A()], '– – 180 180 180 180');
lauf('nur Arbeitssätze',
  [A(), A(), A()], '180 180 180');
lauf('nur Aufwärmsätze — keiner, es folgt kein Arbeitssatz',
  [W(), W(), W()], '– – –');
lauf('zwei Blöcke: W W A W A',
  [W(), W(), A(), W(), A()], '– 180 180 180 180');
lauf('einzelner Aufwärmsatz vor Arbeitssatz',
  [W(), A()], '180 180');

console.log('\n=== Eigene Vorgaben schlagen alles ===');
lauf('Aufwärmsätze mit eigenen Zeiten',
  [W(60), W(90), A(), A()], '60 90 180 180');
lauf('Arbeitssatz mit eigener Zeit',
  [A(), A(210), A(210)], '180 210 210');
lauf('letzter Aufwärmsatz überschrieben',
  [W(), W(45), A()], '– 45 180');
lauf('Vorgabe auch am letzten Aufwärmsatz ohne Folgesatz',
  [W(), W(120)], '– 120');

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Fälle grün');
process.exit(fehler ? 1 : 0);
