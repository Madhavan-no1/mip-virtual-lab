/* =========================================================================
   plot.js — canvas rendering for the MIP Virtual Lab.
   • Plot.drawImage(canvas, {title, img})   — render a MIP image (gray/colour)
   • Plot.draw(canvas, {title,xlabel,ylabel,traces:[...]}) — line/stem plots
     (used for histograms and the Radon filter responses)
   High-DPI, light/dark aware, zero dependencies.
   ========================================================================= */
(function (global) {
  'use strict';

  const PALETTE = ['#2f6fed', '#e6484f', '#12a150', '#f5a623', '#8b5cf6', '#0ea5e9', '#ec4899', '#64748b'];

  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? { fg: '#e5e7eb', grid: '#2a3242', axis: '#8b94a7', sub: '#9aa4b8', frame: '#2a3242' }
      : { fg: '#1f2733', grid: '#e6e9ef', axis: '#8892a4', sub: '#5b6472', frame: '#d8deea' };
  }

  /* ------------------------------- images -------------------------------- */
  function drawImage(canvas, cfg) {
    const img = cfg.img;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 250;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = themeColors();
    ctx.clearRect(0, 0, cssW, cssH);

    const titleH = cfg.title ? 24 : 6;
    // draw title
    if (cfg.title) {
      ctx.fillStyle = col.fg; ctx.font = '600 12.5px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cfg.title, cssW / 2, 13);
    }
    if (!img || !img.w) return;

    // render the image to an offscreen canvas at native resolution
    const off = document.createElement('canvas'); off.width = img.w; off.height = img.h;
    off.getContext('2d').putImageData(MIP.toImageData(img), 0, 0);

    // fit within the box preserving aspect ratio, centred both axes (integer-aligned for crispness)
    const availW = cssW - 12, availH = cssH - titleH - 10;
    const scale = Math.min(availW / img.w, availH / img.h);
    const dw = Math.round(img.w * scale), dh = Math.round(img.h * scale);
    const dx = Math.round((cssW - dw) / 2), dy = Math.round(titleH + (availH - dh) / 2);
    ctx.imageSmoothingEnabled = true;          // smooth (bilinear) scaling for clean medical images
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, img.w, img.h, dx, dy, dw, dh);
    ctx.strokeStyle = col.frame; ctx.lineWidth = 1; ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
  }

  /* ------------------------------- plots --------------------------------- */
  function niceExtent(min, max) { if (min === max) { min -= 1; max += 1; } const p = (max - min) * 0.06; return [min - p, max + p]; }

  function draw(canvas, cfg) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 640, cssH = canvas.clientHeight || 250;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssW, cssH);
    const col = themeColors(), traces = cfg.traces || [], hasLegend = traces.some(t => t.label);
    const m = { l: 52, r: 14, t: cfg.title ? 28 : 12, b: 38 + (hasLegend ? 16 : 0) };
    const W = cssW - m.l - m.r, H = cssH - m.t - m.b;

    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const tr of traces) for (let i = 0; i < tr.x.length; i++) {
      if (tr.x[i] < xmin) xmin = tr.x[i]; if (tr.x[i] > xmax) xmax = tr.x[i];
      if (tr.y[i] < ymin) ymin = tr.y[i]; if (tr.y[i] > ymax) ymax = tr.y[i];
    }
    if (!isFinite(xmin)) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
    if (cfg.xlim) { xmin = cfg.xlim[0]; xmax = cfg.xlim[1]; }
    if (cfg.ylim) { ymin = cfg.ylim[0]; ymax = cfg.ylim[1]; } else [ymin, ymax] = niceExtent(ymin, ymax);
    const X = x => m.l + (x - xmin) / (xmax - xmin || 1) * W;
    const Y = y => m.t + H - (y - ymin) / (ymax - ymin || 1) * H;

    if (cfg.title) { ctx.fillStyle = col.fg; ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(cfg.title, m.l + W / 2, 17); }
    ctx.strokeStyle = col.grid; ctx.fillStyle = col.sub; ctx.lineWidth = 1; ctx.font = '11px system-ui, sans-serif';
    const nX = 6, nY = 5; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i <= nX; i++) { const xv = xmin + (xmax - xmin) * i / nX, px = X(xv); ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + H); ctx.stroke(); ctx.fillText(fmt(xv), px, m.t + H + 6); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= nY; i++) { const yv = ymin + (ymax - ymin) * i / nY, py = Y(yv); ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(m.l + W, py); ctx.stroke(); ctx.fillText(fmt(yv), m.l - 8, py); }
    ctx.strokeStyle = col.axis; ctx.lineWidth = 1.2; ctx.strokeRect(m.l, m.t, W, H);
    if (ymin < 0 && ymax > 0) { ctx.strokeStyle = col.axis; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(m.l + W, Y(0)); ctx.stroke(); ctx.globalAlpha = 1; }

    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, W, H); ctx.clip();
    traces.forEach((tr, ti) => {
      const color = tr.color || PALETTE[ti % PALETTE.length]; ctx.strokeStyle = color; ctx.fillStyle = color;
      const type = tr.type || 'line';
      if (type === 'stem') {
        ctx.lineWidth = 1.3;
        for (let i = 0; i < tr.x.length; i++) { const px = X(tr.x[i]), py = Y(tr.y[i]); ctx.beginPath(); ctx.moveTo(px, Y(0)); ctx.lineTo(px, py); ctx.stroke(); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 2 * Math.PI); ctx.fill(); }
      } else if (type === 'bar') {
        const bw = Math.max(1, W / tr.x.length * 0.8);
        for (let i = 0; i < tr.x.length; i++) { const px = X(tr.x[i]), py = Y(tr.y[i]); ctx.fillRect(px - bw / 2, py, bw, Y(0) - py); }
      } else {
        ctx.lineWidth = tr.width || 1.6; ctx.beginPath();
        for (let i = 0; i < tr.x.length; i++) { const px = X(tr.x[i]), py = Y(tr.y[i]); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke();
      }
    });
    ctx.restore();

    ctx.fillStyle = col.sub; ctx.font = '11px system-ui, sans-serif';
    if (cfg.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(cfg.xlabel, m.l + W / 2, cssH - (hasLegend ? 18 : 2)); }
    if (cfg.ylabel) { ctx.save(); ctx.translate(13, m.t + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(cfg.ylabel, 0, 0); ctx.restore(); }
    if (hasLegend) {
      let lx = m.l, ly = cssH - 10; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      traces.forEach((tr, ti) => { if (!tr.label) return; const color = tr.color || PALETTE[ti % PALETTE.length]; ctx.fillStyle = color; ctx.fillRect(lx, ly - 4, 14, 3); ctx.fillStyle = col.sub; const tw = ctx.measureText(tr.label).width; ctx.fillText(tr.label, lx + 19, ly); lx += 19 + tw + 16; });
    }
  }

  function fmt(v) { if (v === 0) return '0'; const a = Math.abs(v); if (a >= 1000 || a < 0.01) return v.toExponential(1); if (a >= 100) return v.toFixed(0); if (a >= 10) return v.toFixed(1); return v.toFixed(2); }

  global.Plot = { draw, drawImage, PALETTE };
})(window);
