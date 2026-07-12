/* ===== Kraftlog — Übungsdatenbank =====
 * Übung: { id, name, mg (Muskelgruppe), eq (Equipment), compound (Grundübung → 180 s Standardpause),
 *          bw (Körpergewichtsübung → Zusatzgewicht wird getrackt, 0 kg erlaubt), hint (optionaler UI-Hinweis) }
 * Eigene Übungen des Nutzers leben im State (customExercises) mit id-Präfix 'cu-'.
 */
window.KRAFTLOG_MUSKELGRUPPEN = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Gesäß', 'Bauch/Core', 'Waden', 'Unterarme'];
window.KRAFTLOG_EQUIPMENT = ['Langhantel', 'SZ-Stange', 'Kurzhantel', 'Maschine', 'Kabelzug', 'Körpergewicht', 'Multipresse'];

window.KRAFTLOG_EXERCISES = [
  /* ---------- Brust ---------- */
  { id: 'bankdruecken-lh',        name: 'Bankdrücken (Langhantel)',            mg: 'Brust',      eq: 'Langhantel',    compound: true  },
  { id: 'schraegbank-lh',         name: 'Schrägbankdrücken (Langhantel)',      mg: 'Brust',      eq: 'Langhantel',    compound: true  },
  { id: 'bankdruecken-kh',        name: 'Kurzhantel-Bankdrücken',              mg: 'Brust',      eq: 'Kurzhantel',    compound: true  },
  { id: 'schraegbank-kh',         name: 'Kurzhantel-Schrägbankdrücken',        mg: 'Brust',      eq: 'Kurzhantel',    compound: true  },
  { id: 'fliegende-kh',           name: 'Fliegende (Kurzhantel)',              mg: 'Brust',      eq: 'Kurzhantel',    compound: false },
  { id: 'cable-crossover',        name: 'Cable Crossover',                     mg: 'Brust',      eq: 'Kabelzug',      compound: false },
  { id: 'butterfly',              name: 'Butterfly',                           mg: 'Brust',      eq: 'Maschine',      compound: false },
  { id: 'brustpresse',            name: 'Brustpresse',                         mg: 'Brust',      eq: 'Maschine',      compound: true  },
  { id: 'dips',                   name: 'Dips',                                mg: 'Brust',      eq: 'Körpergewicht', compound: true,  bw: true },
  { id: 'liegestuetze',           name: 'Liegestütze',                         mg: 'Brust',      eq: 'Körpergewicht', compound: true,  bw: true },

  /* ---------- Rücken ---------- */
  { id: 'kreuzheben',             name: 'Kreuzheben',                          mg: 'Rücken',     eq: 'Langhantel',    compound: true  },
  { id: 'sumo-kreuzheben',        name: 'Sumo-Kreuzheben',                     mg: 'Rücken',     eq: 'Langhantel',    compound: true  },
  { id: 'klimmzuege',             name: 'Klimmzüge',                           mg: 'Rücken',     eq: 'Körpergewicht', compound: true,  bw: true },
  { id: 'latzug',                 name: 'Latzug (weiter Griff)',               mg: 'Rücken',     eq: 'Kabelzug',      compound: true  },
  { id: 'latzug-eng',             name: 'Latzug (enger Griff)',                mg: 'Rücken',     eq: 'Kabelzug',      compound: true  },
  { id: 'lh-rudern',              name: 'Langhantelrudern',                    mg: 'Rücken',     eq: 'Langhantel',    compound: true  },
  { id: 'kh-rudern',              name: 'Kurzhantelrudern (einarmig)',         mg: 'Rücken',     eq: 'Kurzhantel',    compound: true  },
  { id: 'kabelrudern',            name: 'Kabelrudern (sitzend)',               mg: 'Rücken',     eq: 'Kabelzug',      compound: true  },
  { id: 'tbar-rudern',            name: 'T-Bar-Rudern',                        mg: 'Rücken',     eq: 'Langhantel',    compound: true  },
  { id: 'rudermaschine',          name: 'Rudermaschine',                       mg: 'Rücken',     eq: 'Maschine',      compound: true  },
  { id: 'ueberzuege',             name: 'Überzüge',                            mg: 'Rücken',     eq: 'Kurzhantel',    compound: false },
  { id: 'shrugs',                 name: 'Shrugs',                              mg: 'Rücken',     eq: 'Kurzhantel',    compound: false },

  /* ---------- Schultern ---------- */
  { id: 'schulterdruecken-lh',    name: 'Schulterdrücken (Langhantel)',        mg: 'Schultern',  eq: 'Langhantel',    compound: true  },
  { id: 'schulterdruecken-kh',    name: 'Schulterdrücken (Kurzhantel)',        mg: 'Schultern',  eq: 'Kurzhantel',    compound: true  },
  { id: 'schulterdruecken-masch', name: 'Schulterdrücken (Maschine)',          mg: 'Schultern',  eq: 'Maschine',      compound: true  },
  { id: 'arnold-press',           name: 'Arnold Press',                        mg: 'Schultern',  eq: 'Kurzhantel',    compound: true  },
  { id: 'seitheben',              name: 'Seitheben',                           mg: 'Schultern',  eq: 'Kurzhantel',    compound: false },
  { id: 'seitheben-kabel',        name: 'Seitheben am Kabel',                  mg: 'Schultern',  eq: 'Kabelzug',      compound: false },
  { id: 'vorgebeugtes-seitheben', name: 'Vorgebeugtes Seitheben',              mg: 'Schultern',  eq: 'Kurzhantel',    compound: false },
  { id: 'reverse-butterfly',      name: 'Reverse Butterfly',                   mg: 'Schultern',  eq: 'Maschine',      compound: false },
  { id: 'face-pulls',             name: 'Face Pulls',                          mg: 'Schultern',  eq: 'Kabelzug',      compound: false },
  { id: 'frontheben',             name: 'Frontheben',                          mg: 'Schultern',  eq: 'Kurzhantel',    compound: false },

  /* ---------- Bizeps ---------- */
  { id: 'lh-curls',               name: 'Langhantel-Curls',                    mg: 'Bizeps',     eq: 'Langhantel',    compound: false },
  { id: 'sz-curls',               name: 'SZ-Curls',                            mg: 'Bizeps',     eq: 'SZ-Stange',     compound: false },
  { id: 'kh-curls',               name: 'Kurzhantel-Curls',                    mg: 'Bizeps',     eq: 'Kurzhantel',    compound: false },
  { id: 'hammer-curls',           name: 'Hammer-Curls',                        mg: 'Bizeps',     eq: 'Kurzhantel',    compound: false },
  { id: 'scott-curls',            name: 'Scott-Curls',                         mg: 'Bizeps',     eq: 'SZ-Stange',     compound: false },
  { id: 'kabel-curls',            name: 'Kabel-Curls',                         mg: 'Bizeps',     eq: 'Kabelzug',      compound: false },
  { id: 'konzentrations-curls',   name: 'Konzentrations-Curls',                mg: 'Bizeps',     eq: 'Kurzhantel',    compound: false },

  /* ---------- Trizeps ---------- */
  { id: 'enges-bankdruecken',     name: 'Enges Bankdrücken',                   mg: 'Trizeps',    eq: 'Langhantel',    compound: true  },
  { id: 'trizeps-kabel',          name: 'Trizepsdrücken am Kabel',             mg: 'Trizeps',    eq: 'Kabelzug',      compound: false },
  { id: 'trizeps-overhead-kabel', name: 'Overhead-Trizepsdrücken (Kabel)',     mg: 'Trizeps',    eq: 'Kabelzug',      compound: false },
  { id: 'french-press',           name: 'French Press (Stirndrücken)',         mg: 'Trizeps',    eq: 'SZ-Stange',     compound: false },
  { id: 'trizeps-kh-overhead',    name: 'Trizepsdrücken über Kopf (KH)',       mg: 'Trizeps',    eq: 'Kurzhantel',    compound: false },
  { id: 'kickbacks',              name: 'Trizeps-Kickbacks',                   mg: 'Trizeps',    eq: 'Kurzhantel',    compound: false },
  { id: 'bench-dips',             name: 'Bench Dips',                          mg: 'Trizeps',    eq: 'Körpergewicht', compound: false, bw: true },

  /* ---------- Beine ---------- */
  { id: 'kniebeugen',             name: 'Kniebeugen',                          mg: 'Beine',      eq: 'Langhantel',    compound: true  },
  { id: 'frontkniebeugen',        name: 'Frontkniebeugen',                     mg: 'Beine',      eq: 'Langhantel',    compound: true  },
  { id: 'kniebeugen-multi',       name: 'Kniebeugen (Multipresse)',            mg: 'Beine',      eq: 'Multipresse',   compound: true  },
  { id: 'goblet-squats',          name: 'Goblet Squats',                       mg: 'Beine',      eq: 'Kurzhantel',    compound: true  },
  { id: 'beinpresse',             name: 'Beinpresse',                          mg: 'Beine',      eq: 'Maschine',      compound: true  },
  { id: 'hackenschmidt',          name: 'Hackenschmidt-Kniebeuge',             mg: 'Beine',      eq: 'Maschine',      compound: true  },
  { id: 'ausfallschritte',        name: 'Ausfallschritte',                     mg: 'Beine',      eq: 'Kurzhantel',    compound: true  },
  { id: 'bulgarian-split',        name: 'Bulgarian Split Squats',              mg: 'Beine',      eq: 'Kurzhantel',    compound: true  },
  { id: 'rumaenisches-kh',        name: 'Rumänisches Kreuzheben',              mg: 'Beine',      eq: 'Langhantel',    compound: true  },
  { id: 'beinstrecker',           name: 'Beinstrecker',                        mg: 'Beine',      eq: 'Maschine',      compound: false },
  { id: 'beinbeuger-liegend',     name: 'Beinbeuger (liegend)',                mg: 'Beine',      eq: 'Maschine',      compound: false },
  { id: 'beinbeuger-sitzend',     name: 'Beinbeuger (sitzend)',                mg: 'Beine',      eq: 'Maschine',      compound: false },
  { id: 'adduktion',              name: 'Adduktion (Maschine)',                mg: 'Beine',      eq: 'Maschine',      compound: false },

  /* ---------- Gesäß ---------- */
  { id: 'hip-thrusts',            name: 'Hip Thrusts',                         mg: 'Gesäß',      eq: 'Langhantel',    compound: true  },
  { id: 'glute-bridge',           name: 'Glute Bridge',                        mg: 'Gesäß',      eq: 'Körpergewicht', compound: false, bw: true },
  { id: 'glute-kickbacks',        name: 'Glute-Kickbacks am Kabel',            mg: 'Gesäß',      eq: 'Kabelzug',      compound: false },
  { id: 'abduktion',              name: 'Abduktion (Maschine)',                mg: 'Gesäß',      eq: 'Maschine',      compound: false },
  { id: 'hueftstrecken-kabel',    name: 'Hüftstrecken am Kabel',               mg: 'Gesäß',      eq: 'Kabelzug',      compound: false },

  /* ---------- Bauch/Core ---------- */
  { id: 'crunches',               name: 'Crunches',                            mg: 'Bauch/Core', eq: 'Körpergewicht', compound: false, bw: true },
  { id: 'kabel-crunches',         name: 'Kabel-Crunches',                      mg: 'Bauch/Core', eq: 'Kabelzug',      compound: false },
  { id: 'bauchmaschine',          name: 'Bauchmaschine',                       mg: 'Bauch/Core', eq: 'Maschine',      compound: false },
  { id: 'beinheben-haengend',     name: 'Beinheben (hängend)',                 mg: 'Bauch/Core', eq: 'Körpergewicht', compound: false, bw: true },
  { id: 'beinheben-liegend',      name: 'Beinheben (liegend)',                 mg: 'Bauch/Core', eq: 'Körpergewicht', compound: false, bw: true },
  { id: 'russian-twists',         name: 'Russian Twists',                      mg: 'Bauch/Core', eq: 'Kurzhantel',    compound: false },
  { id: 'plank',                  name: 'Unterarmstütz (Plank)',               mg: 'Bauch/Core', eq: 'Körpergewicht', compound: false, bw: true, hint: 'Sekunden ins Wdh.-Feld eintragen' },

  /* ---------- Waden ---------- */
  { id: 'wadenheben-stehend',     name: 'Wadenheben (stehend)',                mg: 'Waden',      eq: 'Maschine',      compound: false },
  { id: 'wadenheben-sitzend',     name: 'Wadenheben (sitzend)',                mg: 'Waden',      eq: 'Maschine',      compound: false },
  { id: 'wadenheben-beinpresse',  name: 'Wadenheben an der Beinpresse',        mg: 'Waden',      eq: 'Maschine',      compound: false },

  /* ---------- Unterarme ---------- */
  { id: 'handgelenk-curls',       name: 'Handgelenk-Curls',                    mg: 'Unterarme',  eq: 'Langhantel',    compound: false },
  { id: 'reverse-curls',          name: 'Reverse Curls',                       mg: 'Unterarme',  eq: 'SZ-Stange',     compound: false },
  { id: 'farmers-walk',           name: "Farmer's Walk",                       mg: 'Unterarme',  eq: 'Kurzhantel',    compound: true,  hint: 'Meter oder Sekunden ins Wdh.-Feld' }
];
