/* ===== Kraftlog — Übungs-Icons =====
 * Kleine, schematische Kachel je Übung: Hintergrundfarbe = Muskelgruppe,
 * Piktogramm = Equipment. Rein per SVG (offline, keine externen Bilder).
 * window.KraftlogIcons.thumb(ex, big) → HTML-String einer Kachel.
 */
window.KraftlogIcons = (function () {
  'use strict';

  /* Muskelgruppen-Farben (in Hell & Dunkel gut sichtbar) */
  const MG_COLOR = {
    'Brust': '#ff5a5f',
    'Rücken': '#3a86ff',
    'Schultern': '#ff9f0a',
    'Bizeps': '#a06bff',
    'Trizeps': '#12b5b0',
    'Beine': '#34c759',
    'Gesäß': '#ff5fa2',
    'Bauch/Core': '#d4a017',
    'Waden': '#b5773a',
    'Unterarme': '#6366f1'
  };

  /* Equipment-Piktogramme (24×24, Kontur in currentColor) */
  const EQ_ICON = {
    'Langhantel':
      '<line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="7" x2="5" y2="17"/>' +
      '<line x1="7.5" y1="9" x2="7.5" y2="15"/><line x1="19" y1="7" x2="19" y2="17"/>' +
      '<line x1="16.5" y1="9" x2="16.5" y2="15"/>',
    'SZ-Stange':
      '<path d="M2 12h4.5l2-3 2 6 2-6 2 3H21"/><line x1="4" y1="8.5" x2="4" y2="15.5"/>' +
      '<line x1="20" y1="8.5" x2="20" y2="15.5"/>',
    'Kurzhantel':
      '<rect x="3.5" y="7" width="4" height="10" rx="1.5"/><rect x="16.5" y="7" width="4" height="10" rx="1.5"/>' +
      '<line x1="7.5" y1="12" x2="16.5" y2="12"/>',
    'Maschine':
      '<rect x="7" y="5.5" width="10" height="14" rx="1.5"/><line x1="7" y1="9.5" x2="17" y2="9.5"/>' +
      '<line x1="7" y1="12.5" x2="17" y2="12.5"/><line x1="7" y1="15.5" x2="17" y2="15.5"/>',
    'Kabelzug':
      '<circle cx="12" cy="5.5" r="2.4"/><path d="M12 7.9V14"/>' +
      '<path d="M9.5 14h5v2.2a2.5 2.5 0 0 1-5 0z"/>',
    'Körpergewicht':
      '<circle cx="12" cy="5" r="2.3"/><path d="M12 7.3v7.2"/>' +
      '<path d="M12 9.5l-4-1.8M12 9.5l4-1.8"/><path d="M12 14.5l-3 5M12 14.5l3 5"/>',
    'Multipresse':
      '<line x1="6" y1="3" x2="6" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/>' +
      '<line x1="7.5" y1="12" x2="16.5" y2="12"/><line x1="9.5" y1="9" x2="9.5" y2="15"/>' +
      '<line x1="14.5" y1="9" x2="14.5" y2="15"/>'
  };

  function softBg(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',0.16)';
  }

  function thumb(ex, big) {
    const color = MG_COLOR[ex && ex.mg] || '#8e8e93';
    const inner = EQ_ICON[ex && ex.eq] || EQ_ICON['Kurzhantel'];
    return '<span class="ex-thumb' + (big ? ' ex-thumb-lg' : '') + '" style="background:' + softBg(color) + ';color:' + color + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg></span>';
  }

  return { thumb, MG_COLOR };
})();
