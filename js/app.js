/* =========================================================================
   app.js — application shell for the MIP Virtual Lab: sidebar navigation,
   control rendering, image upload, experiment execution and result display.
   ========================================================================= */
(function () {
  'use strict';
  const EXP = window.EXPERIMENTS;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  let current = null;
  const state = {}; // per-experiment control values

  /* ------------------------------- Sidebar ------------------------------- */
  function buildSidebar() {
    const nav = $('#nav'); const groups = {};
    EXP.forEach(e => { (groups[e.tag] = groups[e.tag] || []).push(e); });
    Object.keys(groups).forEach(tag => {
      const g = el('div', 'nav-group');
      g.appendChild(el('div', 'nav-group-title', tag));
      groups[tag].forEach(e => {
        const item = el('button', 'nav-item');
        item.innerHTML = `<span class="nav-num">${e.id}</span><span class="nav-label">${e.title}</span>`;
        item.onclick = () => selectExp(e.id);
        item.dataset.id = e.id; item.title = `${e.id}. ${e.title}`;
        g.appendChild(item);
      });
      nav.appendChild(g);
    });
  }

  // fromNav = true means the change came from history (back/forward) — don't push again.
  function selectExp(id, fromNav) {
    const e = EXP.find(x => x.id === id); if (!e) return;
    current = e;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', +n.dataset.id === id));
    renderExp();
    if (window.innerWidth < 900) $('#sidebar').classList.remove('open');
    if (!fromNav) {
      const target = '#exp' + id;
      if (location.hash !== target) {
        try { history.pushState({ exp: id }, '', target); } catch (_) { location.hash = 'exp' + id; }
      }
    }
  }

  /* ---------------------------- Render experiment ------------------------ */
  function renderExp() {
    const main = $('#main'); main.innerHTML = ''; const e = current;

    const header = el('div', 'exp-header');
    header.appendChild(el('div', 'exp-eyebrow', `Experiment ${e.id} · ${e.tag}`));
    header.appendChild(el('h1', 'exp-title', e.title));
    header.appendChild(el('p', 'exp-aim', '<b>Aim.</b> ' + e.aim));
    main.appendChild(header);

    const th = el('details', 'card theory');
    th.appendChild(el('summary', null, 'Theory'));
    th.appendChild(el('div', 'theory-body', e.theory));
    main.appendChild(th);

    const viva = (window.VIVA || {})[e.id];
    if (viva) {
      const q = el('details', 'card theory');
      q.appendChild(el('summary', null, 'Questions'));
      const body = el('div', 'theory-body'), ul = el('ul');
      [].concat(viva.pre || [], viva.post || []).forEach(it => ul.appendChild(el('li', null, it)));
      body.appendChild(ul); q.appendChild(body); main.appendChild(q);
    }

    const layout = el('div', 'exp-layout');
    const controlCard = el('div', 'card controls');
    controlCard.appendChild(el('h3', 'card-h', 'Parameters'));
    const form = el('div', 'control-grid');
    state[e.id] = state[e.id] || {};
    e.controls.forEach(c => form.appendChild(renderControl(e, c)));
    controlCard.appendChild(form);
    const btnRow = el('div', 'btn-row');
    const runBtn = el('button', 'btn primary', '▶ Run experiment'); runBtn.onclick = () => runExp();
    const resetBtn = el('button', 'btn ghost', 'Reset'); resetBtn.onclick = () => { state[e.id] = {}; renderExp(); };
    btnRow.appendChild(runBtn); btnRow.appendChild(resetBtn);
    controlCard.appendChild(btnRow);
    layout.appendChild(controlCard);

    const results = el('div', 'results'); results.id = 'results';
    results.appendChild(el('div', 'placeholder', 'Set the parameters and press <b>Run experiment</b> to see the results.'));
    layout.appendChild(results);
    main.appendChild(layout);

    runExp();
    main.scrollTop = 0;
  }

  /* ------------------------------ Controls ------------------------------- */
  // Load an image file into a MIP colour image (capped in size).
  function loadImageFile(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        const MAXD = 512, s = Math.min(1, MAXD / Math.max(im.width, im.height));
        const w = Math.max(1, Math.round(im.width * s)), h = Math.max(1, Math.round(im.height * s));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, w, h);
        cb(window.MIP.colorFromImageData(ctx.getImageData(0, 0, w, h)));
      };
      im.onerror = () => cb(null);
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function renderControl(e, c) {
    const wrap = el('label', 'control');
    wrap.appendChild(el('span', 'control-label', c.label));

    if (c.type === 'file') {
      const input = el('input', 'control-input file-input'); input.type = 'file'; input.accept = 'image/*';
      const status = el('div', 'file-status');
      const stored = state[e.id][c.id];
      status.innerHTML = (stored && stored.w)
        ? `✓ ${state[e.id][c.id + '__name'] || 'image'} — ${stored.w}×${stored.h} <button type="button" class="file-clear">clear</button>`
        : (c.help || 'Optional — uses the synthetic phantom if none is chosen.');
      input.onchange = () => {
        const f = input.files[0]; if (!f) return;
        status.textContent = '… loading image';
        loadImageFile(f, (img) => {
          if (!img) { status.textContent = '⚠ Could not read that image.'; return; }
          state[e.id][c.id] = img; state[e.id][c.id + '__name'] = f.name;
          renderExp();
        });
      };
      wrap.appendChild(input); wrap.appendChild(status);
      const clr = status.querySelector('.file-clear');
      if (clr) clr.onclick = (ev) => { ev.preventDefault(); delete state[e.id][c.id]; delete state[e.id][c.id + '__name']; renderExp(); };
      return wrap;
    }

    let input;
    const val = state[e.id][c.id] != null ? state[e.id][c.id] : c.default;
    if (c.type === 'select') {
      input = el('select', 'control-input');
      c.options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; if (v === val) o.selected = true; input.appendChild(o); });
    } else {
      input = el('input', 'control-input'); input.type = 'number'; input.value = val;
      if (c.step != null) input.step = c.step; if (c.min != null) input.min = c.min; if (c.max != null) input.max = c.max;
    }
    input.oninput = () => { state[e.id][c.id] = c.type === 'number' ? parseFloat(input.value) : input.value; };
    state[e.id][c.id] = c.type === 'number' ? parseFloat(val) : val;
    wrap.appendChild(input);
    return wrap;
  }

  /* ------------------------------- Run ----------------------------------- */
  function runExp() {
    const e = current, results = $('#results'); results.innerHTML = '';
    let out;
    try { out = e.run(Object.assign({}, state[e.id])); }
    catch (err) { results.appendChild(el('div', 'error', '⚠ ' + err.message)); console.error(err); return; }

    if (out.outputs && out.outputs.length) {
      const metrics = el('div', 'metrics');
      out.outputs.forEach(o => { const card = el('div', 'metric'); card.appendChild(el('div', 'metric-label', o.label)); card.appendChild(el('div', 'metric-value', o.value)); metrics.appendChild(card); });
      results.appendChild(metrics);
    }

    const drawQueue = [];
    if (out.images && out.images.length) {
      const grid = el('div', 'img-grid');
      out.images.forEach(cfg => { const box = el('div', 'img-box'); const cv = el('canvas', 'img-canvas'); box.appendChild(cv); grid.appendChild(box); drawQueue.push([cv, cfg, 'image']); });
      results.appendChild(grid);
    }
    if (out.plots && out.plots.length) {
      const grid = el('div', 'plot-grid');
      out.plots.forEach(cfg => { const box = el('div', 'plot-box'); const cv = el('canvas', 'plot-canvas'); box.appendChild(cv); grid.appendChild(box); drawQueue.push([cv, cfg, 'plot']); });
      results.appendChild(grid);
    }
    requestAnimationFrame(() => drawQueue.forEach(([cv, cfg, kind]) => kind === 'image' ? Plot.drawImage(cv, cfg) : Plot.draw(cv, cfg)));
    lastRender = drawQueue;
  }

  let lastRender = [];
  function redrawAll() { lastRender.forEach(([cv, cfg, kind]) => kind === 'image' ? Plot.drawImage(cv, cfg) : Plot.draw(cv, cfg)); }

  /* ------------------------------- Theme --------------------------------- */
  function initTheme() {
    const saved = (() => { try { return localStorage.getItem('mip-theme'); } catch (e) { return null; } })();
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    updateThemeBtn();
    $('#theme-btn').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      try { localStorage.setItem('mip-theme', cur); } catch (e) {}
      updateThemeBtn(); redrawAll();
    };
  }
  function updateThemeBtn() { $('#theme-btn').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾'; }

  /* ------------------------------- Boot ---------------------------------- */
  function initCollapse() {
    const app = document.querySelector('.app'), btn = $('#collapse-btn'); if (!btn) return;
    let collapsed = true;
    try { const s = localStorage.getItem('mip-sidebar-collapsed'); if (s !== null) collapsed = s === '1'; } catch (e) {}
    const apply = () => { app.classList.toggle('collapsed', collapsed); btn.textContent = collapsed ? '»' : '«'; btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar'; setTimeout(redrawAll, 220); };
    apply();
    btn.onclick = (ev) => { ev.preventDefault(); collapsed = !collapsed; try { localStorage.setItem('mip-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) {} apply(); };
  }

  /* --------------------- Real sample-image preloading -------------------- */
  // Bundled real medical images used as default bases (fall back to phantoms
  // if a file is missing or blocked, e.g. when opened via file://).
  const SAMPLE_FILES = {
    chest_ct: 'assets/samples/chest_ct.jpg',
    brain_mri: 'assets/samples/brain_mri.jpg',
    brain_mri2: 'assets/samples/brain_mri2.jpg',
    brain_color: 'assets/samples/brain_color.jpg',
    hand_xray: 'assets/samples/hand_xray.jpg'
  };
  window.SAMPLES = window.SAMPLES || {};
  function preloadSamples() {
    return Promise.all(Object.keys(SAMPLE_FILES).map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
          window.SAMPLES[k] = window.MIP.colorFromImageData(ctx.getImageData(0, 0, im.width, im.height));
        } catch (_) { /* tainted / unavailable — phantom fallback used */ }
        res();
      };
      im.onerror = () => res();
      im.src = SAMPLE_FILES[k];
    })));
  }

  function goBack() { try { history.back(); } catch (_) { const m = (location.hash.match(/exp(\d+)/) || [0, 1])[1]; selectExp(Math.max(1, +m - 1)); } }

  function boot() {
    buildSidebar(); initTheme(); initCollapse();
    $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
    const backBtn = $('#back-btn'); if (backBtn) backBtn.onclick = goBack;
    window.addEventListener('resize', () => { clearTimeout(window._rt); window._rt = setTimeout(redrawAll, 150); });
    // Proper back/forward: popstate for pushState navigation, hashchange as file:// fallback.
    window.addEventListener('popstate', () => { const m = location.hash.match(/exp(\d+)/); selectExp(m ? +m[1] : 1, true); });
    window.addEventListener('hashchange', () => { const m = location.hash.match(/exp(\d+)/); if (m && (!current || current.id !== +m[1])) selectExp(+m[1], true); });
    // Start on the hashed experiment (or 1) WITHOUT adding a dead history entry.
    const h = location.hash.match(/exp(\d+)/), start = h ? +h[1] : 1;
    try { history.replaceState({ exp: start }, '', '#exp' + start); } catch (_) {}
    selectExp(start, true);
  }
  document.addEventListener('DOMContentLoaded', () => { preloadSamples().then(boot); });
})();
