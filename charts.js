/* ===== Kraftlog — SVG-Charts (ohne Abhängigkeiten) =====
 * Farben ausschließlich über CSS-Variablen (var(--blue) etc.) → Dark Mode automatisch.
 * Es steht kein einziger Farbwert in dieser Datei: die Klassen in style.css tragen sie.
 *
 * Gestaltungsregeln (bewusst, nicht zufällig):
 *  - Punkte nur dort, wo sie etwas bedeuten — letzter Wert, Bestwert, Rekorde.
 *    Ein Punkt auf jedem Datensatz macht aus 60 Messungen eine Raupe.
 *  - Die Fläche ist ein Verlauf, der nach unten ausblendet. Eine satte Fläche über
 *    einer gekappten Y-Achse behauptet einen Nullpunkt, den es nicht gibt.
 *  - Balken sind oben gerundet und an der Grundlinie eckig; zwischen Nachbarn
 *    bleibt Luft statt einer Kontur.
 *  - Trefferflächen sind größer als die Marken (Finger, nicht Mauszeiger).
 *
 * lineChart({points:[{x,y,xLabel,tip,pr}], yFmt, trend, leer, einheit}) → SVG-String
 * barChart({bars:[{label,value,tip,laufend}], yFmt, leer, zone:{min,max}}) → SVG-String
 */
window.KraftlogCharts = (function () {
  'use strict';

  const W = 340, H = 176;                         // viewBox — skaliert responsiv via width:100%
  const PAD = { t: 18, r: 12, b: 26, l: 42 };
  const MAX_BAR = 24;                             // Balken nie breiter: sonst wird die Fläche laut
  const BAR_GAP = 2;                              // Trennung durch Luft, nicht durch Kontur
  const HIT = 26;                                 // Mindest-Trefferfläche für den Finger
  let uid = 0;                                    // eindeutige Verlaufs-IDs je Chart auf der Seite

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  /* Schöne Y-Achsen-Schritte: 1/2/5 × 10^n */
  function niceStep(range, n) {
    const raw = range / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    for (const m of [1, 2, 5, 10]) {
      if (raw <= m * mag) return m * mag;
    }
    return 10 * mag;
  }

  function yScale(values) {
    let min = Math.min(...values), max = Math.max(...values);
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { min = min > 0 ? min * 0.9 : min - 1; max = max > 0 ? max * 1.1 : max + 1; }
    const step = niceStep(max - min, 4);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }

  function fmtDefault(v) {
    const r = Math.round(v * 10) / 10;
    return String(r).replace('.', ',');
  }

  /* X-Beschriftung: außen bündig, innen zentriert — so wird nichts abgeschnitten */
  function xLabel(x, x0, x1, text) {
    if (!text) return '';
    const anchor = x <= x0 + 1 ? 'start' : (x >= x1 - 1 ? 'end' : 'middle');
    return `<text x="${x.toFixed(1)}" y="${H - 8}" class="chart-label" text-anchor="${anchor}">${esc(text)}</text>`;
  }

  function gitter(ys, x0, x1, y0, y1, yFmt) {
    let s = '';
    for (const t of ys.ticks) {
      const y = y0 - (t - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);
      s += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
      s += `<text x="${x0 - 8}" y="${(y + 4).toFixed(1)}" class="chart-label" text-anchor="end">${esc(yFmt(t))}</text>`;
    }
    return s;
  }

  /* ---------- Linien-Chart ---------- */
  function lineChart(opts) {
    const pts = (opts.points || []).filter(p => p && isFinite(p.y));
    const yFmt = opts.yFmt || fmtDefault;
    if (!pts.length) return emptyNote(opts.leer || 'Noch keine Daten');

    const id = 'kl-grad-' + (++uid);
    const ys = yScale(pts.map(p => p.y));
    const x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
    const xMin = pts[0].x, xMax = pts[pts.length - 1].x;
    const xr = xMax - xMin || 1;
    const px = p => pts.length === 1 ? (x0 + x1) / 2 : x0 + (p.x - xMin) / xr * (x1 - x0);
    const py = p => y0 - (p.y - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);

    /* Ist ein Trend gefragt, führt er — die Rohwerte treten dahinter zurück.
       Der gleitende Schnitt ist die Aussage, die Einzelmessung nur ihr Beleg. */
    const trend = opts.trend && pts.length > 2 ? gleitend7(pts) : null;

    let s = svgOpen();
    s += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" class="chart-area-top"/><stop offset="100%" class="chart-area-bottom"/></linearGradient></defs>`;
    s += gitter(ys, x0, x1, y0, y1, yFmt);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="chart-axis"/>`;

    /* X-Beschriftung: erster / mittlerer / letzter Punkt */
    const xTicks = pts.length >= 3 ? [0, Math.floor(pts.length / 2), pts.length - 1] : pts.map((p, i) => i);
    for (const i of [...new Set(xTicks)]) s += xLabel(px(pts[i]), x0, x1, pts[i].xLabel);

    if (pts.length > 1) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(p).toFixed(1)).join(' ');
      s += `<path d="${d} L${px(pts[pts.length - 1]).toFixed(1)} ${y0} L${px(pts[0]).toFixed(1)} ${y0} Z" class="chart-area" fill="url(#${id})"/>`;
      s += `<path d="${d}" pathLength="1" class="${trend ? 'chart-line-raw' : 'chart-line'}"/>`;
      if (trend) {
        const dt = trend.map((p, i) => (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(p).toFixed(1)).join(' ');
        s += `<path d="${dt}" pathLength="1" class="chart-trend"/>`;
      }
    }

    /* Marken nur, wo sie etwas sagen: Rekorde, Bestwert, letzter Wert. */
    const letzter = pts[pts.length - 1];
    let bester = pts[0];
    for (const p of pts) if (p.y > bester.y) bester = p;
    const marken = new Map();
    for (const p of pts) if (p.pr) marken.set(p, 'chart-dot-pr');
    /* Der Höchstwert wird nur markiert, wo „hoch" auch „besser" heißt.
       Beim Körpergewicht ist das Maximum keine Bestleistung. */
    if (pts.length > 2 && opts.maxIstBest !== false) marken.set(bester, marken.get(bester) || 'chart-dot');
    marken.set(letzter, marken.get(letzter) || 'chart-dot');
    for (const [p, cls] of marken) {
      s += `<circle cx="${px(p).toFixed(1)}" cy="${py(p).toFixed(1)}" r="4.5" class="${cls}"/>`;
    }

    /* Der letzte Wert steht direkt an der Linie — ein Tooltip darf nie der
       einzige Weg zu einer Zahl sein. */
    const lx = px(letzter), lyy = py(letzter);
    const obenEng = lyy - y1 < 16;
    s += `<text x="${Math.min(x1, lx + 6).toFixed(1)}" y="${(obenEng ? lyy + 15 : lyy - 9).toFixed(1)}" ` +
      `class="chart-value" text-anchor="end">${esc(yFmt(letzter.y))}${opts.einheit ? ' ' + esc(opts.einheit) : ''}</text>`;

    /* Unsichtbare Trefferflächen über die volle Höhe — treffen muss der Daumen,
       nicht die Mausspitze. Bei vielen Punkten überlappen sie sonst. */
    const schritt = pts.length > 1 ? (x1 - x0) / (pts.length - 1) : x1 - x0;
    const bw = Math.max(HIT, schritt);
    for (const p of pts) {
      const cx = px(p);
      s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1}" width="${bw.toFixed(1)}" height="${(y0 - y1).toFixed(1)}" ` +
        `class="chart-hit chart-dot-hit" data-tip="${esc(p.tip || yFmt(p.y))}"/>`;
    }
    return s + '</svg>';
  }

  /* 7-Tage-Mittel; erwartet x als Zeitstempel in ms */
  function gleitend7(pts) {
    const MS7 = 7 * 86400000;
    return pts.map(p => {
      const win = pts.filter(q => q.x <= p.x && q.x > p.x - MS7);
      return { x: p.x, y: win.reduce((a, q) => a + q.y, 0) / win.length };
    });
  }

  /* ---------- Balken-Chart ---------- */
  function barChart(opts) {
    const bars = opts.bars || [];
    const yFmt = opts.yFmt || fmtDefault;
    if (!bars.length || bars.every(b => !b.value)) return emptyNote(opts.leer || 'Noch keine Daten');

    const ys = yScale([0, ...bars.map(b => b.value)]);
    const x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
    const slot = (x1 - x0) / bars.length;
    const bw = Math.min(MAX_BAR, Math.max(4, slot - BAR_GAP * 2));

    let s = svgOpen();
    /* Optionale Zielzone (z. B. produktiver Volumenbereich) liegt hinter den Balken */
    if (opts.zone && opts.zone.max > opts.zone.min) {
      const zy = v => y0 - (v - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);
      const zt = zy(Math.min(opts.zone.max, ys.hi)), zb = zy(Math.max(opts.zone.min, ys.lo));
      s += `<rect x="${x0}" y="${zt.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(0, zb - zt).toFixed(1)}" class="chart-zone"/>`;
    }
    s += gitter(ys, x0, x1, y0, y1, yFmt);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="chart-axis"/>`;

    const labelEvery = bars.length > 8 ? 2 : 1;
    let maxIdx = 0;
    bars.forEach((b, i) => { if (b.value > bars[maxIdx].value) maxIdx = i; });

    bars.forEach((b, i) => {
      const h = Math.max(0, (b.value - ys.lo) / (ys.hi - ys.lo) * (y0 - y1));
      const cx = x0 + i * slot + slot / 2;
      const x = cx - bw / 2;
      const r = Math.min(4, bw / 2, h);            // oben gerundet, unten eckig
      const top = y0 - h;
      const d = h <= 0.5
        ? ''
        : `M${x.toFixed(1)} ${y0} L${x.toFixed(1)} ${(top + r).toFixed(1)} ` +
          `Q${x.toFixed(1)} ${top.toFixed(1)} ${(x + r).toFixed(1)} ${top.toFixed(1)} ` +
          `L${(x + bw - r).toFixed(1)} ${top.toFixed(1)} ` +
          `Q${(x + bw).toFixed(1)} ${top.toFixed(1)} ${(x + bw).toFixed(1)} ${(top + r).toFixed(1)} ` +
          `L${(x + bw).toFixed(1)} ${y0} Z`;
      if (d) s += `<path d="${d}" class="${b.laufend ? 'chart-bar-current' : 'chart-bar'}"/>`;
      /* Nur der Höchstwert bekommt eine Zahl an die Kappe — Zahlen an jedem Balken liest niemand */
      if (i === maxIdx && h > 14) {
        s += `<text x="${cx.toFixed(1)}" y="${(top - 5).toFixed(1)}" class="chart-value" text-anchor="middle">${esc(yFmt(b.value))}</text>`;
      }
      if (i % labelEvery === 0 || i === bars.length - 1) {
        s += xLabel(cx, x0, x1, b.label);
      }
      const hitW = Math.max(HIT, slot);
      s += `<rect x="${(cx - hitW / 2).toFixed(1)}" y="${y1}" width="${hitW.toFixed(1)}" height="${(y0 - y1).toFixed(1)}" ` +
        `class="chart-hit chart-dot-hit" data-tip="${esc(b.tip || (b.label + ': ' + yFmt(b.value)))}"/>`;
    });
    return s + '</svg>';
  }

  function svgOpen() {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart" role="img">`;
  }
  function emptyNote(text) {
    return `<div class="chart-leer">${esc(text)}</div>`;
  }

  return { lineChart, barChart };
})();
