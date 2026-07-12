/* ===== Kraftlog — SVG-Charts (ohne Abhängigkeiten) =====
 * Farben ausschließlich über CSS-Variablen (var(--blue) etc.) → Dark Mode automatisch.
 * lineChart({points:[{x,y,tip}], yFmt, trend}) → SVG-String, Punkte klickbar (.chart-dot[data-tip])
 * barChart({bars:[{label,value,tip}], yFmt}) → SVG-String
 */
window.KraftlogCharts = (function () {
  'use strict';

  const W = 340, H = 170;                         // viewBox — skaliert responsiv via width:100%
  const PAD = { t: 12, r: 10, b: 22, l: 40 };

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

  /* ---------- Linien-Chart ---------- */
  function lineChart(opts) {
    const pts = (opts.points || []).filter(p => p && isFinite(p.y));
    const yFmt = opts.yFmt || fmtDefault;
    if (!pts.length) return emptyNote(opts.leer || 'Noch keine Daten');

    const ys = yScale(pts.map(p => p.y));
    const x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
    const xMin = pts[0].x, xMax = pts[pts.length - 1].x;
    const xr = xMax - xMin || 1;
    const px = p => pts.length === 1 ? (x0 + x1) / 2 : x0 + (p.x - xMin) / xr * (x1 - x0);
    const py = p => y0 - (p.y - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);

    let s = svgOpen();
    /* Gitter + Y-Beschriftung */
    for (const t of ys.ticks) {
      const y = y0 - (t - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);
      s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="chart-grid"/>`;
      s += `<text x="${x0 - 6}" y="${y + 3.5}" class="chart-label" text-anchor="end">${esc(yFmt(t))}</text>`;
    }
    /* X-Beschriftung: erster / mittlerer / letzter Punkt */
    const xTicks = pts.length >= 3 ? [0, Math.floor(pts.length / 2), pts.length - 1] : pts.map((p, i) => i);
    for (const i of [...new Set(xTicks)]) {
      const p = pts[i];
      s += `<text x="${px(p)}" y="${H - 6}" class="chart-label" text-anchor="middle">${esc(p.xLabel || '')}</text>`;
    }
    /* Fläche + Linie */
    if (pts.length > 1) {
      const line = pts.map((p, i) => (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(p).toFixed(1)).join(' ');
      s += `<path d="${line} L${px(pts[pts.length - 1]).toFixed(1)} ${y0} L${px(pts[0]).toFixed(1)} ${y0} Z" class="chart-area"/>`;
      s += `<path d="${line}" class="chart-line"/>`;
    }
    /* 7-Tage-Trend (optional, z. B. Körpergewicht) */
    if (opts.trend && pts.length > 2) {
      const MS7 = 7 * 86400000;
      const tr = pts.map(p => {
        const win = pts.filter(q => q.x <= p.x && q.x > p.x - MS7);
        return { x: p.x, y: win.reduce((a, q) => a + q.y, 0) / win.length };
      });
      s += `<path d="${tr.map((p, i) => (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(p).toFixed(1)).join(' ')}" class="chart-trend"/>`;
    }
    /* Punkte (klickbar → Tooltip in app.js) */
    for (const p of pts) {
      s += `<circle cx="${px(p).toFixed(1)}" cy="${py(p).toFixed(1)}" r="4" class="chart-dot" data-tip="${esc(p.tip || yFmt(p.y))}"/>`;
    }
    return s + '</svg>';
  }

  /* ---------- Balken-Chart ---------- */
  function barChart(opts) {
    const bars = opts.bars || [];
    const yFmt = opts.yFmt || fmtDefault;
    if (!bars.length || bars.every(b => !b.value)) return emptyNote(opts.leer || 'Noch keine Daten');

    const ys = yScale([0, ...bars.map(b => b.value)]);
    const x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
    const bw = (x1 - x0) / bars.length;

    let s = svgOpen();
    for (const t of ys.ticks) {
      const y = y0 - (t - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);
      s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="chart-grid"/>`;
      s += `<text x="${x0 - 6}" y="${y + 3.5}" class="chart-label" text-anchor="end">${esc(yFmt(t))}</text>`;
    }
    const labelEvery = bars.length > 8 ? 2 : 1;
    bars.forEach((b, i) => {
      const h = (b.value - ys.lo) / (ys.hi - ys.lo) * (y0 - y1);
      const x = x0 + i * bw + bw * 0.15;
      s += `<rect x="${x.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" class="chart-bar chart-dot" data-tip="${esc(b.tip || (b.label + ': ' + yFmt(b.value)))}"/>`;
      if (i % labelEvery === 0) {
        s += `<text x="${(x0 + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="chart-label" text-anchor="middle">${esc(b.label)}</text>`;
      }
    });
    return s + '</svg>';
  }

  function svgOpen() {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart">`;
  }
  function emptyNote(text) {
    return `<div class="chart-leer">${esc(text)}</div>`;
  }

  return { lineChart, barChart };
})();
