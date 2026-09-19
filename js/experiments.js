/* =========================================================================
   experiments.js — definitions for all 11 Medical Image Processing
   experiments. Each entry supplies aim, theory, interactive controls and a
   run() that returns { images:[{title,img}], plots:[...], outputs:[...] }.
   Powered by the MIP image engine (imglib.js).
   ========================================================================= */
(function (global) {
  'use strict';
  const M = global.MIP;
  const round = (v, n = 3) => Number(v).toFixed(n);

  // Standard working sizes (kept modest so everything is instant in-browser).
  const SIZE = 300;      // general spatial-domain experiments
  const SIZE_FFT = 256;  // frequency-domain (power of two)
  const SIZE_SEG = 256;  // segmentation
  const SIZE_RAD = 140;  // Radon (square, heavier compute)

  // Real bundled medical images (see assets/samples) first, phantoms after.
  const BASES = [
    ['chest_ct', 'Chest CT (real)'], ['brain_mri', 'Brain MRI (real)'],
    ['brain_color', 'Brain MRI colour (real)'], ['hand_xray', 'Hand X-ray (real)'],
    ['shepp', 'Shepp–Logan phantom'], ['blocks', 'Shapes (test)']
  ];
  const baseCtrl = (def) => ({ id: 'base', label: 'Base image', type: 'select', default: def || 'chest_ct', options: BASES });
  const fileCtrl = () => ({ id: 'img', label: 'Upload image', type: 'file', help: 'Optional — JPG/PNG. Overrides the base image above.' });

  // A preloaded real sample image (or null if not yet loaded / unavailable).
  function sample(key) { return (window.SAMPLES && window.SAMPLES[key]) || null; }
  // Resolve a base key to an image: real sample if bundled, else synthetic phantom.
  function resolve(key, size) { const s = sample(key); return s ? M.fit(s, size) : M.phantom(key, size); }
  // Resolve the working image: uploaded file (fit to size), else the base.
  function getBase(p, size, name) {
    if (p.img && p.img.w) return M.fit(p.img, size);
    return resolve(name || p.base, size);
  }
  // Centre-crop a gray image to (cw,ch).
  function crop(img, cw, ch) {
    const g = M.toGray(img), x0 = ((g.w - cw) / 2) | 0, y0 = ((g.h - ch) / 2) | 0, o = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) o[y * cw + x] = g.data[(y + y0) * g.w + (x + x0)];
    return M.Gfrom(cw, ch, o);
  }
  function square(img, s) { return M.resize(M.toGray(img), s, s); }

  const EXPERIMENTS = [
    /* ------------------------------------------------------------------ 1 */
    {
      id: 1, title: 'Basic Operations on Images', tag: 'Fundamentals',
      aim: 'To perform the basic operations of medical image processing — resizing, rotation, translation, shearing, normalisation, edge detection, blurring and morphology.',
      theory: `Fundamental image operations transform a medical image geometrically or in intensity:
        <ul>
          <li><b>Resizing</b> — changing dimensions by interpolation (zoom in / scale down).</li>
          <li><b>Rotation</b> — an affine warp about a centre by a chosen angle.</li>
          <li><b>Translation</b> — shifting the image by (tx, ty) pixels.</li>
          <li><b>Shearing</b> — slanting the image along an axis.</li>
          <li><b>Edge detection</b> (Canny) and <b>blurring</b> (Gaussian) — spatial filtering.</li>
          <li><b>Morphology</b> (dilation / erosion) — shape-based processing.</li>
        </ul>
        Each is a building block of a medical-imaging pipeline.`,
      controls: [
        baseCtrl('chest_ct'),
        { id: 'angle', label: 'Rotation angle (°)', type: 'number', default: 30, step: 5, min: -180, max: 180 },
        { id: 'tx', label: 'Translate x (px)', type: 'number', default: 40, step: 5, min: -150, max: 150 },
        { id: 'ty', label: 'Translate y (px)', type: 'number', default: 25, step: 5, min: -150, max: 150 },
        { id: 'shx', label: 'Shear x', type: 'number', default: 0.2, step: 0.05, min: -0.6, max: 0.6 },
        { id: 'blur', label: 'Blur kernel (odd)', type: 'number', default: 5, step: 2, min: 3, max: 15 },
        fileCtrl()
      ],
      run(p) {
        const base = getBase(p, SIZE);
        const k = (p.blur % 2 === 0) ? p.blur + 1 : p.blur;
        const zoom = crop(M.resize(base, base.w * 2, base.h * 2), base.w, base.h);
        return {
          images: [
            { title: `Original  ${base.w}×${base.h}`, img: base },
            { title: 'Zoomed 2× (centre detail)', img: zoom },
            { title: `Rotated  ${p.angle}°`, img: M.rotate(base, p.angle, 1) },
            { title: `Translated (${p.tx}, ${p.ty})`, img: M.translate(base, p.tx, p.ty) },
            { title: `Sheared  x=${p.shx}`, img: M.shear(base, p.shx, 0) },
            { title: 'Edges (Canny)', img: M.canny(base, 60, 150) },
            { title: `Gaussian blur ${k}×${k}`, img: M.gaussianBlur(base, k, k / 6) },
            { title: 'Dilated', img: M.dilate(base, 3, 2) },
            { title: 'Eroded', img: M.erode(base, 3, 2) }
          ],
          outputs: [
            { label: 'Source', value: (p.img && p.img.w) ? 'Uploaded image' : (sample(p.base) ? 'Bundled real image' : 'Synthetic phantom') },
            { label: 'Size', value: `${base.w} × ${base.h}` },
            { label: 'Operations', value: '9 shown' }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 2 */
    {
      id: 2, title: 'Image Arithmetic & Logical Operations', tag: 'Fundamentals',
      aim: 'To perform image arithmetic (addition, weighted addition, subtraction) and logical (bitwise AND/OR/XOR/NOT) operations on medical images.',
      theory: `Two registered images can be combined pixel-by-pixel:
        <ul>
          <li><b>Addition</b> (saturating) and <b>weighted addition</b> — image blending / fusion.</li>
          <li><b>Subtraction</b> — change / lesion detection between two studies.</li>
          <li><b>Bitwise AND / OR / XOR / NOT</b> — masking and region logic on the pixel bits.</li>
        </ul>`,
      controls: [
        { id: 'base', label: 'Image 1', type: 'select', default: 'brain_mri', options: BASES },
        { id: 'base2', label: 'Image 2', type: 'select', default: 'brain_mri2', options: [['brain_mri2', 'Brain MRI 2 (real)']].concat(BASES) },
        { id: 'alpha', label: 'Blend weight α (Image 1)', type: 'number', default: 0.6, step: 0.05, min: 0, max: 1 },
        fileCtrl()
      ],
      run(p) {
        const a = getBase(p, SIZE);
        const b = resolve(p.base2, SIZE);
        return {
          images: [
            { title: 'Image 1', img: a },
            { title: 'Image 2', img: b },
            { title: 'Addition (saturated)', img: M.add(a, b) },
            { title: `Weighted  α=${p.alpha}`, img: M.addWeighted(a, p.alpha, b, 1 - p.alpha, 0) },
            { title: 'Subtraction (1 − 2)', img: M.subtract(a, b) },
            { title: 'Bitwise AND', img: M.bitAnd(a, b) },
            { title: 'Bitwise OR', img: M.bitOr(a, b) },
            { title: 'Bitwise XOR', img: M.bitXor(a, b) },
            { title: 'Bitwise NOT (Image 1)', img: M.bitNot(a) }
          ],
          outputs: [
            { label: 'Weights', value: `α=${p.alpha}, β=${round(1 - p.alpha, 2)}` },
            { label: 'Images', value: `${p.base} + ${p.base2}` }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 3 */
    {
      id: 3, title: 'Image Transforms in the Frequency Domain', tag: 'Transforms',
      aim: 'To compute the 2-D Fourier transform (DFT/FFT) of a medical image, display its magnitude spectrum and reconstruct the image with the inverse transform and an optional low-pass mask.',
      theory: `The 2-D DFT maps an image f(x,y) to its spatial-frequency content F(u,v):
        <div class="eq">F(u,v) = Σ<sub>x</sub> Σ<sub>y</sub> f(x,y)·e<sup>−j2π(ux/M + vy/N)</sup></div>
        The centred log-magnitude |F| shows low frequencies at the centre and high frequencies (edges,
        detail) at the periphery. Keeping only a centred square (an <b>ideal low-pass</b> filter) and
        inverting the transform blurs the image; keeping everything reconstructs it exactly.`,
      controls: [
        baseCtrl('chest_ct'),
        { id: 'rad', label: 'Low-pass radius (freq. bins)', type: 'number', default: 30, step: 4, min: 4, max: 96 },
        fileCtrl()
      ],
      run(p) {
        const g = M.fit(getBase(p, SIZE_FFT), SIZE_FFT), F = M.fft2(g);
        return {
          images: [
            { title: 'Original image', img: g },
            { title: 'FFT magnitude spectrum (log)', img: M.spectrum(F) },
            { title: `Low-pass reconstruction (r=${p.rad})`, img: M.lowpassFFT(g, p.rad) },
            { title: 'Full reconstruction (IFFT)', img: M.ifft2(F) }
          ],
          outputs: [
            { label: 'Transform', value: `Radix-2 FFT, padded to ${F.W}×${F.H}` },
            { label: 'Low-pass window', value: `${2 * p.rad + 1} × ${2 * p.rad + 1} bins kept` }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 4 */
    {
      id: 4, title: 'Intensity Transformation & Histogram Equalization', tag: 'Enhancement',
      aim: 'To enhance a medical image using intensity transformations (negative, log, gamma, contrast stretching) and histogram equalisation.',
      theory: `Point (intensity) transforms remap each pixel r → s:
        <ul>
          <li><b>Negative:</b> s = 255 − r (photographic negative).</li>
          <li><b>Log:</b> s = c·log(1+r) — expands dark values.</li>
          <li><b>Power-law (gamma):</b> s = 255·(r/255)<sup>γ</sup>.</li>
          <li><b>Contrast stretching:</b> a piecewise-linear map through (r1,s1),(r2,s2).</li>
        </ul>
        <b>Histogram equalisation</b> redistributes intensities using the cumulative histogram (CDF) to
        maximise global contrast.`,
      controls: [
        baseCtrl('hand_xray'),
        { id: 'gam', label: 'Gamma γ', type: 'number', default: 0.5, step: 0.1, min: 0.1, max: 3 },
        { id: 'r1', label: 'Contrast r1', type: 'number', default: 70, step: 5, min: 0, max: 254 },
        { id: 'r2', label: 'Contrast r2', type: 'number', default: 140, step: 5, min: 1, max: 255 },
        fileCtrl()
      ],
      run(p) {
        const g = M.toGray(getBase(p, SIZE));
        const eq = M.histEqualize(g);
        const r1 = Math.min(p.r1, p.r2 - 1), r2 = Math.max(p.r2, r1 + 1);
        const hist = M.histogram(g), histEq = M.histogram(eq), xs = Array.from({ length: 256 }, (_, i) => i);
        return {
          images: [
            { title: 'Original', img: g },
            { title: 'Negative', img: M.negative(g) },
            { title: 'Log transform', img: M.logTransform(g) },
            { title: `Gamma  γ=${p.gam}`, img: M.gamma(g, p.gam) },
            { title: `Contrast stretch (${r1}→${r2})`, img: M.contrastStretch(g, r1, 0, r2, 255) },
            { title: 'Histogram equalised', img: eq }
          ],
          plots: [
            { title: 'Histogram — original', xlabel: 'Intensity', ylabel: 'Count', traces: [{ x: xs, y: Array.from(hist), type: 'bar', color: '#2f6fed' }], xlim: [0, 255] },
            { title: 'Histogram — equalised', xlabel: 'Intensity', ylabel: 'Count', traces: [{ x: xs, y: Array.from(histEq), type: 'bar', color: '#12a150' }], xlim: [0, 255] }
          ],
          outputs: [
            { label: 'Gamma', value: String(p.gam) },
            { label: 'Contrast points', value: `(${r1},0) → (${r2},255)` }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 5 */
    {
      id: 5, title: 'Averaging, Unsharp Masking & High-Boost Filtering', tag: 'Enhancement',
      aim: 'To perform spatial filtering — averaging (smoothing), unsharp masking and high-boost filtering — on a medical image.',
      theory: `<b>Averaging</b> convolves with a box kernel (low-pass) → smoothing/blur.
        <b>Unsharp masking</b> adds a scaled high-frequency mask back to the image:
        <div class="eq">sharp = f + k·(f − blur(f))</div>
        <b>High-boost filtering</b> generalises this with an amplification factor A:
        <div class="eq">high-boost = f + (A − 1)·(f − blur(f))</div>
        A = 1 gives the plain high-pass mask; A &gt; 1 keeps and amplifies the low frequencies too.`,
      controls: [
        baseCtrl('hand_xray'),
        { id: 'avg', label: 'Averaging kernel (odd)', type: 'number', default: 5, step: 2, min: 3, max: 15 },
        { id: 'amount', label: 'Unsharp strength k', type: 'number', default: 1.5, step: 0.1, min: 0.1, max: 4 },
        { id: 'A', label: 'High-boost factor A', type: 'number', default: 2, step: 0.5, min: 1, max: 4 },
        fileCtrl()
      ],
      run(p) {
        const g = M.toGray(getBase(p, SIZE));
        const k = (p.avg % 2 === 0) ? p.avg + 1 : p.avg;
        const blur = M.gaussianBlur(g, 5, 1.5);
        const mask = M.subtract(g, blur);                       // high-frequency mask
        const unsharp = M.addWeighted(g, 1, mask, p.amount, 0);  // f + k·mask
        const highpass = M.mapChannels(M.subtract(g, blur), v => v); // f − blur (clipped)
        const highboost = M.addWeighted(g, 1, mask, p.A - 1, 0);
        return {
          images: [
            { title: 'Original', img: g },
            { title: `Averaging blur ${k}×${k}`, img: M.averaging(g, k) },
            { title: `Unsharp mask (k=${p.amount})`, img: unsharp },
            { title: 'High-pass (f − blur)', img: highpass },
            { title: `High-boost (A=${p.A})`, img: highboost }
          ],
          outputs: [
            { label: 'Averaging kernel', value: `${k} × ${k}` },
            { label: 'Unsharp strength', value: String(p.amount) },
            { label: 'High-boost A', value: String(p.A) }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 6 */
    {
      id: 6, title: 'Colour Image Processing', tag: 'Enhancement',
      aim: 'To perform colour image processing — convert to the HSV colour space and segment a chosen colour range with a mask (colour identification).',
      theory: `Colour medical images (e.g. functional / perfusion maps) are analysed in the <b>HSV</b>
        space, which separates <b>Hue</b> (colour), <b>Saturation</b> (purity) and <b>Value</b>
        (brightness). A colour region is isolated with a threshold band on H/S/V (OpenCV
        <code>inRange</code>) to build a binary mask, which is applied back to the image with a bitwise
        AND to keep only the pixels of that colour.`,
      controls: [
        { id: 'base', label: 'Base image', type: 'select', default: 'brain_color', options: [['brain_color', 'Brain MRI colour (real)'], ['mri_color', 'Brain phantom (colour)'], ['chest_ct', 'Chest CT'], ['brain_mri', 'Brain MRI']] },
        { id: 'color', label: 'Detect colour', type: 'select', default: 'red', options: [['red', 'Red / warm'], ['green', 'Green'], ['blue', 'Blue'], ['yellow', 'Yellow']] },
        fileCtrl()
      ],
      run(p) {
        let src;
        if (p.img && p.img.w) src = M.fit(p.img, SIZE);                       // uploaded (may be colour)
        else if (p.base === 'brain_color' && sample('brain_color')) src = M.fit(sample('brain_color'), SIZE); // real colour scan
        else if (p.base === 'mri_color' || p.base === 'brain_color') src = M.phantom('mri_color', SIZE);       // synthetic colour
        else src = M.applyColormap(M.normalize(M.toGray(resolve(p.base, SIZE))), M.JET); // colourise a gray scan
        const color = M.toColor(src);
        const hsv = M.rgb2hsv(color);
        const RANGES = {
          red: [[0, 60, 60], [13, 255, 255]], yellow: [[14, 60, 60], [40, 255, 255]],
          green: [[40, 40, 40], [86, 255, 255]], blue: [[90, 40, 40], [130, 255, 255]]
        };
        const [lo, hi] = RANGES[p.color];
        const mask = M.inRange(hsv, lo, hi);
        return {
          images: [
            { title: 'Original (colour)', img: color },
            { title: `Mask — ${p.color}`, img: mask },
            { title: `Detected ${p.color} regions`, img: M.applyMask(color, mask) }
          ],
          outputs: [
            { label: 'Colour space', value: 'HSV (H 0–179)' },
            { label: 'Hue range', value: `${lo[0]} – ${hi[0]}` }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 7 */
    {
      id: 7, title: 'Image Reconstruction — Radon Transform', tag: 'Reconstruction',
      aim: 'To compute the Radon transform (sinogram) of an image and reconstruct it with filtered back-projection (FBP).',
      theory: `Computed tomography measures line integrals of the image at many projection angles. The
        <b>Radon transform</b> stacks these projections into a <b>sinogram</b>. Reconstruction inverts
        this: <b>filtered back-projection</b> applies a ramp filter to each projection (Fourier-slice
        theorem) and smears it back across the image plane. More projection angles ⇒ lower
        reconstruction error.`,
      controls: [
        baseCtrl('shepp'),
        { id: 'nA', label: 'Number of projection angles', type: 'number', default: 90, step: 15, min: 30, max: 180 },
        fileCtrl()
      ],
      run(p) {
        const g = square(getBase(p, SIZE_RAD), SIZE_RAD);
        const thetas = []; for (let i = 0; i < p.nA; i++) thetas.push(180 * i / p.nA);
        const sino = M.radon(g, thetas);
        const recon = M.iradon(sino, thetas);
        // rms reconstruction error (both normalised 0..1)
        const gn = M.normalize(g), n = gn.data.length; let se = 0;
        for (let i = 0; i < n; i++) { const d = recon.data[i] / 255 - gn.data[i] / 255; se += d * d; }
        const rms = Math.sqrt(se / n);
        // analytic FBP filter responses
        const N = 256, xs = [], ramp = [], shepp = [], cosine = [], hamming = [], hann = [];
        for (let k = 0; k <= N; k++) { const f = k / N; xs.push(f); ramp.push(f); shepp.push(f * (f === 0 ? 1 : Math.sin(Math.PI * f / 2) / (Math.PI * f / 2))); cosine.push(f * Math.cos(Math.PI * f / 2)); hamming.push(f * (0.54 + 0.46 * Math.cos(Math.PI * f))); hann.push(f * (0.5 + 0.5 * Math.cos(Math.PI * f))); }
        return {
          images: [
            { title: 'Original', img: g },
            { title: `Sinogram (${p.nA} angles)`, img: M.sinogramImage(sino) },
            { title: 'Reconstruction (FBP, ramp)', img: recon }
          ],
          plots: [
            {
              title: 'FBP filter responses', xlabel: 'Normalised frequency', ylabel: 'Gain', traces: [
                { x: xs, y: ramp, type: 'line', label: 'ramp' }, { x: xs, y: shepp, type: 'line', label: 'shepp-logan' },
                { x: xs, y: cosine, type: 'line', label: 'cosine' }, { x: xs, y: hamming, type: 'line', label: 'hamming' }, { x: xs, y: hann, type: 'line', label: 'hann' }
              ]
            }
          ],
          outputs: [
            { label: 'Projection angles', value: String(p.nA) },
            { label: 'FBP RMS error', value: round(rms, 3) },
            { label: 'Filter', value: 'Ramp' }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 8 */
    {
      id: 8, title: 'Fourier Reconstruction of MRI Images', tag: 'Reconstruction',
      aim: 'To reconstruct an MRI image from its k-space (Fourier) representation.',
      theory: `MRI acquires data directly in the spatial-frequency domain, called <b>k-space</b> — the 2-D
        Fourier transform of the image. The image is reconstructed by taking the <b>inverse 2-D Fourier
        transform</b> of k-space and its magnitude:
        <div class="eq">image = |IFFT2( k-space )|</div>
        The centre of k-space holds contrast (low frequencies); the periphery holds edges and detail.`,
      controls: [baseCtrl('brain_mri'), fileCtrl()],
      run(p) {
        const g = M.fit(getBase(p, SIZE_FFT, 'brain_mri'), SIZE_FFT), F = M.fft2(g);
        return {
          images: [
            { title: 'Original MRI', img: g },
            { title: 'k-space (log magnitude)', img: M.spectrum(F) },
            { title: 'Reconstructed MRI (IFFT)', img: M.ifft2(F) }
          ],
          outputs: [
            { label: 'k-space size', value: `${F.W} × ${F.H}` },
            { label: 'Reconstruction', value: '|IFFT2(k-space)|' }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 9 */
    {
      id: 9, title: 'Advanced Edge Detection Techniques', tag: 'Segmentation',
      aim: 'To detect edges in a medical image using the Sobel, Laplacian and Canny operators.',
      theory: `Edges mark object boundaries where intensity changes sharply:
        <ul>
          <li><b>Sobel</b> — first-order gradient magnitude √(G<sub>x</sub>²+G<sub>y</sub>²).</li>
          <li><b>Laplacian</b> — second-order operator highlighting rapid intensity change.</li>
          <li><b>Canny</b> — optimal multi-stage detector: smoothing, gradient, non-maximum
              suppression and hysteresis thresholding.</li>
        </ul>`,
      controls: [
        baseCtrl('chest_ct'),
        { id: 'low', label: 'Canny low threshold', type: 'number', default: 50, step: 5, min: 5, max: 200 },
        { id: 'high', label: 'Canny high threshold', type: 'number', default: 130, step: 5, min: 20, max: 400 },
        fileCtrl()
      ],
      run(p) {
        const g = M.toGray(getBase(p, SIZE));
        const high = Math.max(p.high, p.low + 1);
        const edges = M.canny(g, p.low, high);
        return {
          images: [
            { title: 'Original', img: g },
            { title: 'Sobel gradient magnitude', img: M.normalize(M.sobel(g).mag) },
            { title: 'Laplacian', img: M.normalize(M.laplacian(g)) },
            { title: `Canny (${p.low}, ${high})`, img: edges },
            { title: 'Canny overlay', img: M.overlayEdges(g, edges, [230, 40, 40]) }
          ],
          outputs: [
            { label: 'Canny thresholds', value: `${p.low} / ${high}` },
            { label: 'Operators', value: 'Sobel · Laplacian · Canny' }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 10 */
    {
      id: 10, title: 'Image Segmentation — Watershed Algorithm', tag: 'Segmentation',
      aim: 'To segment a medical image using Otsu thresholding, the distance transform, marker labelling and the watershed algorithm.',
      theory: `The <b>watershed</b> treats the image as a topographic surface and floods it from markers.
        Pipeline: <b>Otsu threshold</b> → binary image; morphological <b>opening</b> removes noise; the
        <b>distance transform</b> peaks at object centres → <b>sure foreground</b>; dilation gives the
        <b>sure background</b>; the gap is <b>unknown</b>. Connected components seed the markers and the
        watershed grows regions from them, drawing boundaries between touching objects.`,
      controls: [
        baseCtrl('chest_ct'),
        { id: 'fg', label: 'Foreground threshold (× max dist)', type: 'number', default: 0.5, step: 0.05, min: 0.2, max: 0.9 },
        fileCtrl()
      ],
      run(p) {
        const g = M.resize(M.toGray(getBase(p, SIZE_SEG)), SIZE_SEG, SIZE_SEG), w = g.w, h = g.h;
        const t = M.otsu(g);
        let bin = M.threshold(g, t, false);          // bright objects → white
        bin = M.opening(bin, 3, 1);                   // noise removal
        const sureBg = M.dilate(bin, 3, 3);
        const dist = M.distanceTransform(bin);
        const dmax = M.maxOf(dist.data);
        const sureFg = M.threshold(dist, p.fg * dmax, false);
        const unknown = M.subtract(sureBg, sureFg);
        // markers: connected components of sure foreground, background = 1
        const cc = M.connectedComponents(sureFg);
        const markers = new Int32Array(w * h);
        for (let i = 0; i < w * h; i++) markers[i] = cc.labels[i] > 0 ? cc.labels[i] + 1 : 1;
        for (let i = 0; i < w * h; i++) if (unknown.data[i] > 127) markers[i] = 0;
        const ws = M.watershed(M.toColor(g), markers, w, h);
        return {
          images: [
            { title: `Otsu binary (T=${t})`, img: bin },
            { title: 'Distance transform', img: M.normalize(dist) },
            { title: `Markers (${cc.count} regions)`, img: M.labelsToColor(markers, w, h, cc.count + 1) },
            { title: 'Watershed segmentation', img: ws.seg },
            { title: 'Boundaries on original', img: ws.overlay }
          ],
          outputs: [
            { label: 'Otsu threshold', value: String(t) },
            { label: 'Regions found', value: String(cc.count) },
            { label: 'Foreground level', value: `${p.fg} × max` }
          ]
        };
      }
    },

    /* ------------------------------------------------------------------ 11 */
    {
      id: 11, title: 'Image Fusion', tag: 'Fusion',
      aim: 'To fuse two medical images using weighted averaging, Haar-wavelet fusion and PCA fusion.',
      theory: `<b>Image fusion</b> combines complementary information from two images into one:
        <ul>
          <li><b>Weighted:</b> fused = α·I₁ + (1−α)·I₂.</li>
          <li><b>Wavelet (Haar):</b> decompose both into approximation (LL) and detail (LH/HL/HH)
              sub-bands; average LL and keep the maximum-magnitude details, then invert.</li>
          <li><b>PCA:</b> weight the two images by the leading eigenvector of their covariance.</li>
        </ul>`,
      controls: [
        { id: 'base', label: 'Image 1', type: 'select', default: 'brain_mri', options: BASES },
        { id: 'alpha', label: 'Weighted α (Image 1)', type: 'number', default: 0.6, step: 0.05, min: 0, max: 1 },
        fileCtrl()
      ],
      run(p) {
        // two complementary images: Image 1 and a real/synthetic partner
        const a = M.toGray(getBase(p, SIZE));
        let b;
        if (p.img && p.img.w) b = M.gaussianBlur(M.rotate(a, 4, 1), 7, 2);       // variant of the upload
        else if (p.base === 'brain_mri' && sample('brain_mri2')) b = M.toGray(M.fit(sample('brain_mri2'), SIZE)); // real partner
        else if (p.base === 'hand_xray') b = M.toGray(M.phantom('bone', SIZE, { variant: true }));
        else b = M.gaussianBlur(M.rotate(a, 4, 1), 7, 2);
        const pca = M.fusePCA(a, b);
        return {
          images: [
            { title: 'Image 1', img: a },
            { title: 'Image 2', img: b },
            { title: `Weighted (α=${p.alpha})`, img: M.fuseWeighted(a, b, p.alpha) },
            { title: 'Wavelet fusion (Haar)', img: M.fuseWavelet(a, b) },
            { title: 'PCA fusion', img: pca.img }
          ],
          outputs: [
            { label: 'Weighted α / β', value: `${p.alpha} / ${round(1 - p.alpha, 2)}` },
            { label: 'PCA weights', value: `${round(pca.w1, 3)}, ${round(pca.w2, 3)}` },
            { label: 'Wavelet', value: 'Haar, 1 level, max-detail rule' }
          ]
        };
      }
    }
  ];

  /* -------- Pre-lab / Post-lab viva questions --------------------------- */
  const VIVA = {
    1: { pre: ['What is the difference between image resizing by interpolation and scaling?', 'What does an affine transformation matrix represent?'], post: ['Distinguish between translation, rotation and shearing.', 'Which interpolation methods suit up-scaling vs down-scaling?'] },
    2: { pre: ['Why must two images be the same size before arithmetic operations?', 'What is saturating (clipped) addition?'], post: ['Give a clinical use of image subtraction.', 'What is the effect of the weight α in weighted addition?'] },
    3: { pre: ['Write the equation of the 2-D DFT.', 'What does the centre of the magnitude spectrum represent?'], post: ['What is the effect of an ideal low-pass filter in the frequency domain?', 'Why is the FFT preferred over a direct DFT?'] },
    4: { pre: ['Write the image-negative transformation.', 'What does gamma (power-law) correction do?'], post: ['How does histogram equalisation improve contrast?', 'What is contrast stretching?'] },
    5: { pre: ['What is an averaging (box) filter used for?', 'Write the unsharp-masking equation.'], post: ['How does the high-boost factor A change the result?', 'Compare a high-pass filter with a high-boost filter.'] },
    6: { pre: ['What do H, S and V represent in the HSV colour space?', 'Why convert from RGB to HSV for colour detection?'], post: ['What does the inRange() operation produce?', 'How is a mask applied back to an image?'] },
    7: { pre: ['What is a sinogram?', 'State the Fourier-slice theorem.'], post: ['Why is a ramp filter used in filtered back-projection?', 'How does the number of projection angles affect the reconstruction?'] },
    8: { pre: ['What is k-space in MRI?', 'How is an MRI image reconstructed from k-space?'], post: ['What information sits at the centre vs the edge of k-space?', 'Why take the magnitude of the inverse transform?'] },
    9: { pre: ['Compare first-order (Sobel) and second-order (Laplacian) edge operators.', 'List the stages of the Canny edge detector.'], post: ['What is non-maximum suppression?', 'What is the role of hysteresis thresholding?'] },
    10: { pre: ['What is Otsu’s thresholding method?', 'What does the distance transform compute?'], post: ['Why are markers needed for the watershed algorithm?', 'What problem does the watershed algorithm solve for touching objects?'] },
    11: { pre: ['What is image fusion and why is it useful in medical imaging?', 'State the weighted-fusion rule.'], post: ['How does wavelet fusion combine two images?', 'How does PCA determine the fusion weights?'] }
  };

  global.EXPERIMENTS = EXPERIMENTS;
  global.VIVA = VIVA;
})(window);
