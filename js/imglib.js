/* =========================================================================
   imglib.js — Medical Image Processing engine for the MIP Virtual Lab.
   Pure vanilla JavaScript, zero dependencies. Implements everything the 11
   experiments need: synthetic medical phantoms, geometric transforms,
   spatial filtering, edge detection, morphology, arithmetic / logical ops,
   intensity transforms, histogram equalisation, 2-D FFT, colour (HSV)
   processing, Radon transform + filtered back-projection, watershed
   segmentation and image fusion (weighted / Haar-wavelet / PCA).

   Image representations
     • Grayscale : { w, h, data:Float32Array }   values 0..255
     • Colour    : { w, h, r, g, b:Float32Array } values 0..255
   ========================================================================= */
(function (global) {
  'use strict';

  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const clamp255 = v => v < 0 ? 0 : (v > 255 ? 255 : v);

  /* ------------------------- constructors / helpers ---------------------- */
  function G(w, h) { return { w, h, data: new Float32Array(w * h) }; }
  function Gfrom(w, h, data) { return { w, h, data }; }
  function C(w, h) { return { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) }; }
  const isColor = img => !img.data;

  function clone(img) {
    if (isColor(img)) return { w: img.w, h: img.h, r: img.r.slice(), g: img.g.slice(), b: img.b.slice() };
    return { w: img.w, h: img.h, data: img.data.slice() };
  }
  function toGray(img) {
    if (!isColor(img)) return clone(img);
    const n = img.w * img.h, d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = 0.299 * img.r[i] + 0.587 * img.g[i] + 0.114 * img.b[i];
    return Gfrom(img.w, img.h, d);
  }
  function toColor(img) {
    if (isColor(img)) return clone(img);
    return { w: img.w, h: img.h, r: img.data.slice(), g: img.data.slice(), b: img.data.slice() };
  }
  function maxOf(arr) { let m = -Infinity; for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]; return m; }
  function minOf(arr) { let m = Infinity; for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]; return m; }

  /* ------------------------------ ImageData ------------------------------ */
  // Convert either representation to a browser ImageData for display.
  function toImageData(img) {
    const { w, h } = img, out = new Uint8ClampedArray(w * h * 4);
    if (isColor(img)) {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        out[j] = clamp255(img.r[i]); out[j + 1] = clamp255(img.g[i]); out[j + 2] = clamp255(img.b[i]); out[j + 3] = 255;
      }
    } else {
      for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const v = clamp255(img.data[i]); out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
      }
    }
    return new ImageData(out, w, h);
  }
  // Build an image (gray) from a browser ImageData (luminance).
  function fromImageData(id) {
    const { width: w, height: h, data } = id, out = new Float32Array(w * h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    return Gfrom(w, h, out);
  }
  // Build a colour image from ImageData (keeps RGB).
  function colorFromImageData(id) {
    const { width: w, height: h, data } = id, im = C(w, h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) { im.r[i] = data[j]; im.g[i] = data[j + 1]; im.b[i] = data[j + 2]; }
    return im;
  }

  /* ------------------------------ sampling ------------------------------- */
  function px(data, w, h, x, y) { // nearest with clamp
    x = x < 0 ? 0 : (x >= w ? w - 1 : x); y = y < 0 ? 0 : (y >= h ? h - 1 : y);
    return data[y * w + x];
  }
  function bilinear(data, w, h, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const a = px(data, w, h, x0, y0), b = px(data, w, h, x0 + 1, y0);
    const c = px(data, w, h, x0, y0 + 1), d = px(data, w, h, x0 + 1, y0 + 1);
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }

  /* --------------------------- geometric ops ----------------------------- */
  // Forward affine M (2x3): dst(x,y) <- src( M·[x,y,1] ). Implemented by
  // inverting M and inverse-mapping each dst pixel (bilinear).
  function warpAffine(img, M, outW, outH) {
    outW = outW || img.w; outH = outH || img.h;
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0] || 1e-9;
    const iA = M[1][1] / det, iB = -M[0][1] / det, iD = -M[1][0] / det, iE = M[0][0] / det;
    const iC = -(iA * M[0][2] + iB * M[1][2]), iF = -(iD * M[0][2] + iE * M[1][2]);
    const run = (src) => {
      const o = new Float32Array(outW * outH);
      for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
        const sx = iA * x + iB * y + iC, sy = iD * x + iE * y + iF;
        o[y * outW + x] = (sx < -0.5 || sy < -0.5 || sx > img.w - 0.5 || sy > img.h - 0.5) ? 0 : bilinear(src, img.w, img.h, sx, sy);
      }
      return o;
    };
    if (isColor(img)) return { w: outW, h: outH, r: run(img.r), g: run(img.g), b: run(img.b) };
    return Gfrom(outW, outH, run(img.data));
  }
  function rotationMatrix(cx, cy, angleDeg, scale) {
    const a = angleDeg * Math.PI / 180, al = scale * Math.cos(a), be = scale * Math.sin(a);
    return [[al, be, (1 - al) * cx - be * cy], [-be, al, be * cx + (1 - al) * cy]];
  }
  function rotate(img, angleDeg, scale) { return warpAffine(img, rotationMatrix(img.w / 2, img.h / 2, angleDeg, scale || 1), img.w, img.h); }
  function translate(img, tx, ty) { return warpAffine(img, [[1, 0, tx], [0, 1, ty]], img.w, img.h); }
  function shear(img, shx, shy) { return warpAffine(img, [[1, shx, 0], [shy, 1, 0]], img.w, img.h); }
  function resize(img, newW, newH) {
    const sx = img.w / newW, sy = img.h / newH;
    const run = (src) => {
      const o = new Float32Array(newW * newH);
      for (let y = 0; y < newH; y++) for (let x = 0; x < newW; x++)
        o[y * newW + x] = bilinear(src, img.w, img.h, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
      return o;
    };
    if (isColor(img)) return { w: newW, h: newH, r: run(img.r), g: run(img.g), b: run(img.b) };
    return Gfrom(newW, newH, run(img.data));
  }
  // Fit an image within a maximum dimension (keeps aspect ratio).
  function fit(img, maxDim) {
    const m = Math.max(img.w, img.h);
    if (m <= maxDim) return img;
    const s = maxDim / m;
    return resize(img, Math.round(img.w * s), Math.round(img.h * s));
  }

  /* ---------------------------- convolution ------------------------------ */
  function convolve(src, kernel, kw, kh) { // gray in, gray out, border replicate
    const { w, h, data } = src, o = new Float32Array(w * h);
    const cx = (kw - 1) >> 1, cy = (kh - 1) >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let ky = 0; ky < kh; ky++) for (let kx = 0; kx < kw; kx++)
        s += kernel[ky * kw + kx] * px(data, w, h, x + kx - cx, y + ky - cy);
      o[y * w + x] = s;
    }
    return Gfrom(w, h, o);
  }
  function boxKernel(n) { const k = new Float32Array(n * n).fill(1 / (n * n)); return k; }
  function gaussianKernel(n, sigma) {
    const k = new Float32Array(n * n), c = (n - 1) / 2; let sum = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = Math.exp(-((x - c) ** 2 + (y - c) ** 2) / (2 * sigma * sigma)); k[y * n + x] = v; sum += v;
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    return k;
  }
  function averaging(img, n) { return convolve(toGray(img), boxKernel(n), n, n); }
  function gaussianBlur(img, n, sigma) { return convolve(toGray(img), gaussianKernel(n, sigma || n / 6), n, n); }
  function medianBlur(img, n) {
    const g = toGray(img), { w, h, data } = g, o = new Float32Array(w * h), c = (n - 1) >> 1, buf = new Float32Array(n * n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let ky = -c; ky <= c; ky++) for (let kx = -c; kx <= c; kx++) buf[m++] = px(data, w, h, x + kx, y + ky);
      const s = buf.slice(0, m).sort((a, b) => a - b); o[y * w + x] = s[m >> 1];
    }
    return Gfrom(w, h, o);
  }

  /* ------------------------- gradients / edges --------------------------- */
  const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  function sobel(img) {
    const g = toGray(img), gx = convolve(g, SOBEL_X, 3, 3), gy = convolve(g, SOBEL_Y, 3, 3);
    const n = g.w * g.h, mag = new Float32Array(n);
    for (let i = 0; i < n; i++) mag[i] = Math.hypot(gx.data[i], gy.data[i]);
    return { gx, gy, mag: Gfrom(g.w, g.h, mag) };
  }
  function laplacian(img) {
    const g = toGray(img), l = convolve(g, LAPLACIAN, 3, 3), n = g.w * g.h, o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = Math.abs(l.data[i]);
    return Gfrom(g.w, g.h, o);
  }
  // Canny edge detector — returns a 0/255 gray edge map.
  function canny(img, low, high) {
    const g = gaussianBlur(img, 5, 1.4), { w, h } = g;
    const gx = convolve(g, SOBEL_X, 3, 3).data, gy = convolve(g, SOBEL_Y, 3, 3).data;
    const mag = new Float32Array(w * h), dir = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { mag[i] = Math.hypot(gx[i], gy[i]); dir[i] = Math.atan2(gy[i], gx[i]); }
    // non-maximum suppression
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; let a = (dir[i] * 180 / Math.PI + 180) % 180, q, r;
      if (a < 22.5 || a >= 157.5) { q = mag[i + 1]; r = mag[i - 1]; }
      else if (a < 67.5) { q = mag[i - w + 1]; r = mag[i + w - 1]; }
      else if (a < 112.5) { q = mag[i - w]; r = mag[i + w]; }
      else { q = mag[i - w - 1]; r = mag[i + w + 1]; }
      nms[i] = (mag[i] >= q && mag[i] >= r) ? mag[i] : 0;
    }
    // double threshold + hysteresis
    const out = new Uint8Array(w * h), STRONG = 2, WEAK = 1;
    for (let i = 0; i < w * h; i++) out[i] = nms[i] >= high ? STRONG : (nms[i] >= low ? WEAK : 0);
    const stack = [];
    for (let i = 0; i < w * h; i++) if (out[i] === STRONG) stack.push(i);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (out[j] === WEAK) { out[j] = STRONG; stack.push(j); }
      }
    }
    const res = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) res[i] = out[i] === STRONG ? 255 : 0;
    return Gfrom(w, h, res);
  }
  // Overlay a 0/255 edge map on a colour copy of the base image (edges in colour).
  function overlayEdges(base, edges, rgb) {
    const c = toColor(base), col = rgb || [230, 40, 40];
    for (let i = 0; i < c.w * c.h; i++) if (edges.data[i] > 127) { c.r[i] = col[0]; c.g[i] = col[1]; c.b[i] = col[2]; }
    return c;
  }

  /* ------------------------------ morphology ----------------------------- */
  function morphRun(src, ksize, iters, isMax) {
    let g = toGray(src); const { w, h } = g, c = (ksize - 1) >> 1;
    for (let it = 0; it < iters; it++) {
      const inp = g.data, o = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = isMax ? -Infinity : Infinity;
        for (let ky = -c; ky <= c; ky++) for (let kx = -c; kx <= c; kx++) {
          const p = px(inp, w, h, x + kx, y + ky); v = isMax ? Math.max(v, p) : Math.min(v, p);
        }
        o[y * w + x] = v;
      }
      g = Gfrom(w, h, o);
    }
    return g;
  }
  const dilate = (img, k, it) => morphRun(img, k || 3, it || 1, true);
  const erode = (img, k, it) => morphRun(img, k || 3, it || 1, false);
  const opening = (img, k, it) => dilate(erode(img, k, it || 1), k, it || 1);
  const closing = (img, k, it) => erode(dilate(img, k, it || 1), k, it || 1);
  function morphGradient(img, k) {
    const d = dilate(img, k, 1), e = erode(img, k, 1), o = new Float32Array(d.w * d.h);
    for (let i = 0; i < o.length; i++) o[i] = d.data[i] - e.data[i];
    return Gfrom(d.w, d.h, o);
  }

  /* --------------------------- intensity ops ----------------------------- */
  function mapChannels(img, fn) {
    const run = a => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = fn(a[i]); return o; };
    if (isColor(img)) return { w: img.w, h: img.h, r: run(img.r), g: run(img.g), b: run(img.b) };
    return Gfrom(img.w, img.h, run(img.data));
  }
  function negative(img) { return mapChannels(img, v => 255 - v); }
  function logTransform(img) {
    const mx = isColor(img) ? Math.max(maxOf(img.r), maxOf(img.g), maxOf(img.b)) : maxOf(img.data);
    const c = 255 / Math.log(1 + mx); return mapChannels(img, v => c * Math.log(1 + v));
  }
  function gamma(img, g) { return mapChannels(img, v => 255 * Math.pow(v / 255, g)); }
  function contrastStretch(img, r1, s1, r2, s2) {
    return mapChannels(img, v => {
      if (v <= r1) return r1 === 0 ? s1 : (s1 / r1) * v;
      if (v <= r2) return ((s2 - s1) / (r2 - r1)) * (v - r1) + s1;
      return ((255 - s2) / (255 - r2)) * (v - r2) + s2;
    });
  }
  function normalize(img) {
    const g = toGray(img), mn = minOf(g.data), mx = maxOf(g.data), r = (mx - mn) || 1;
    return Gfrom(g.w, g.h, g.data.map(v => (v - mn) / r * 255));
  }
  function histogram(img) {
    const g = toGray(img), h = new Float32Array(256);
    for (let i = 0; i < g.data.length; i++) h[clamp(Math.round(g.data[i]), 0, 255)]++;
    return h;
  }
  function histEqualize(img) {
    const g = toGray(img), n = g.data.length, hist = histogram(g), cdf = new Float32Array(256);
    let acc = 0; let cdfMin = 0, seen = false;
    for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc; if (!seen && acc > 0) { cdfMin = acc; seen = true; } }
    const lut = new Float32Array(256), denom = (n - cdfMin) || 1;
    for (let i = 0; i < 256; i++) lut[i] = Math.round((cdf[i] - cdfMin) / denom * 255);
    return Gfrom(g.w, g.h, g.data.map(v => lut[clamp(Math.round(v), 0, 255)]));
  }

  /* ---------------------- arithmetic / logical ops ----------------------- */
  function matchSize(a, b) { return (a.w === b.w && a.h === b.h) ? b : resize(b, a.w, a.h); }
  function pair(a, b, fn) {
    a = toGray(a); b = matchSize(a, toGray(b)); const o = new Float32Array(a.w * a.h);
    for (let i = 0; i < o.length; i++) o[i] = fn(a.data[i], b.data[i]);
    return Gfrom(a.w, a.h, o);
  }
  const add = (a, b) => pair(a, b, (x, y) => clamp255(x + y));
  const subtract = (a, b) => pair(a, b, (x, y) => clamp255(x - y));
  const addWeighted = (a, alpha, b, beta, gam) => pair(a, b, (x, y) => clamp255(alpha * x + beta * y + (gam || 0)));
  const bitAnd = (a, b) => pair(a, b, (x, y) => (Math.round(x) & Math.round(y)));
  const bitOr = (a, b) => pair(a, b, (x, y) => (Math.round(x) | Math.round(y)));
  const bitXor = (a, b) => pair(a, b, (x, y) => (Math.round(x) ^ Math.round(y)));
  const bitNot = (a) => mapChannels(toGray(a), v => (~Math.round(v)) & 255);

  /* ------------------------------ colour --------------------------------- */
  // RGB->HSV in OpenCV scale: H 0..179, S 0..255, V 0..255
  function rgb2hsv(img) {
    const c = toColor(img), n = c.w * c.h, H = new Float32Array(n), S = new Float32Array(n), V = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = c.r[i] / 255, g = c.g[i] / 255, b = c.b[i] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d > 1e-6) {
        if (mx === r) h = 60 * (((g - b) / d) % 6);
        else if (mx === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      H[i] = h / 2; S[i] = mx === 0 ? 0 : d / mx * 255; V[i] = mx * 255;
    }
    return { w: c.w, h: c.h, H, S, V };
  }
  function inRange(hsv, lo, hi) {
    const n = hsv.w * hsv.h, m = new Float32Array(n);
    for (let i = 0; i < n; i++)
      m[i] = (hsv.H[i] >= lo[0] && hsv.H[i] <= hi[0] && hsv.S[i] >= lo[1] && hsv.S[i] <= hi[1] && hsv.V[i] >= lo[2] && hsv.V[i] <= hi[2]) ? 255 : 0;
    return Gfrom(hsv.w, hsv.h, m);
  }
  function applyMask(img, mask) {
    const c = toColor(img);
    for (let i = 0; i < c.w * c.h; i++) if (mask.data[i] < 127) { c.r[i] = 0; c.g[i] = 0; c.b[i] = 0; }
    return c;
  }
  // Colormaps for pseudo-colour display (value expected 0..255).
  const JET = t => { // t in 0..1
    const v = clamp(t, 0, 1);
    const r = clamp255(255 * clamp(Math.min(4 * v - 1.5, -4 * v + 4.5), 0, 1));
    const g = clamp255(255 * clamp(Math.min(4 * v - 0.5, -4 * v + 3.5), 0, 1));
    const b = clamp255(255 * clamp(Math.min(4 * v + 0.5, -4 * v + 2.5), 0, 1));
    return [r, g, b];
  };
  function applyColormap(img, fn) {
    const g = toGray(img), c = C(g.w, g.h);
    for (let i = 0; i < g.data.length; i++) { const [r, gg, b] = fn(g.data[i] / 255); c.r[i] = r; c.g[i] = gg; c.b[i] = b; }
    return c;
  }

  /* ------------------------------- 2-D FFT ------------------------------- */
  function fft1(re, im, inv) { // in-place radix-2, length power of two
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  const nextPow2 = v => { let p = 1; while (p < v) p <<= 1; return p; };
  // 2-D FFT of a gray image (zero padded to power of two). Returns {re,im,W,H}.
  function fft2(img) {
    const g = toGray(img), W = nextPow2(g.w), H = nextPow2(g.h);
    const re = new Float32Array(W * H), im = new Float32Array(W * H);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) re[y * W + x] = g.data[y * g.w + x];
    const rr = new Float32Array(W), ri = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) { rr[x] = re[y * W + x]; ri[x] = im[y * W + x]; }
      fft1(rr, ri, false);
      for (let x = 0; x < W; x++) { re[y * W + x] = rr[x]; im[y * W + x] = ri[x]; }
    }
    const cr = new Float32Array(H), ci = new Float32Array(H);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) { cr[y] = re[y * W + x]; ci[y] = im[y * W + x]; }
      fft1(cr, ci, false);
      for (let y = 0; y < H; y++) { re[y * W + x] = cr[y]; im[y * W + x] = ci[y]; }
    }
    return { re, im, W, H, w: g.w, h: g.h };
  }
  function ifft2(F) {
    const { W, H } = F, re = F.re.slice(), im = F.im.slice();
    const cr = new Float32Array(H), ci = new Float32Array(H);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) { cr[y] = re[y * W + x]; ci[y] = im[y * W + x]; }
      fft1(cr, ci, true);
      for (let y = 0; y < H; y++) { re[y * W + x] = cr[y]; im[y * W + x] = ci[y]; }
    }
    const rr = new Float32Array(W), ri = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) { rr[x] = re[y * W + x]; ri[x] = im[y * W + x]; }
      fft1(rr, ri, true);
      for (let x = 0; x < W; x++) { re[y * W + x] = rr[x]; im[y * W + x] = ri[x]; }
    }
    const o = new Float32Array(F.w * F.h);
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) o[y * F.w + x] = Math.hypot(re[y * W + x], im[y * W + x]);
    return Gfrom(F.w, F.h, o);
  }
  // Centred log-magnitude spectrum as a gray image (fftshift + normalise).
  function spectrum(F) {
    const { W, H } = F, mag = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) mag[i] = Math.log(1 + Math.hypot(F.re[i], F.im[i]));
    // fftshift
    const sh = new Float32Array(W * H), hw = W >> 1, hh = H >> 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      sh[((y + hh) % H) * W + ((x + hw) % W)] = mag[y * W + x];
    const mn = minOf(sh), mx = maxOf(sh), r = (mx - mn) || 1;
    for (let i = 0; i < sh.length; i++) sh[i] = (sh[i] - mn) / r * 255;
    return Gfrom(W, H, sh);
  }
  // Ideal low-pass in frequency domain: keep a centred square of half-size `rad`.
  function lowpassFFT(img, rad) {
    const F = fft2(img), { W, H } = F, hw = W >> 1, hh = H >> 1;
    // keep only the low frequencies within ±rad of DC (DC sits at the corner, wrapped)
    const re = new Float32Array(W * H), im = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = ((x + hw) % W) - hw, cy = ((y + hh) % H) - hh; // -hw..hw
      const keep = Math.abs(cx) <= rad && Math.abs(cy) <= rad;
      const i = y * W + x; if (keep) { re[i] = F.re[i]; im[i] = F.im[i]; }
    }
    return ifft2({ re, im, W, H, w: F.w, h: F.h });
  }

  /* ---------------------------- Radon transform -------------------------- */
  // Sinogram: for each angle rotate the image and sum along columns.
  function radon(img, thetas) {
    let g = toGray(img); const size = g.w; // assume square (caller squares it)
    const sino = new Float32Array(size * thetas.length); // rows=detector, cols=angle
    for (let a = 0; a < thetas.length; a++) {
      const rot = rotate(g, thetas[a], 1); // rotate by +theta
      for (let r = 0; r < size; r++) { let s = 0; for (let c = 0; c < size; c++) s += rot.data[r * size + c]; sino[r * thetas.length + a] = s; }
    }
    return { data: sino, det: size, nAngles: thetas.length, thetas };
  }
  // Filtered back-projection with a ramp filter → reconstructed gray image.
  function iradon(sino, thetas) {
    const N = sino.det, nA = sino.nAngles, L = nextPow2(N);
    // ramp filter in frequency domain
    const filtered = new Float32Array(N * nA);
    const re = new Float32Array(L), im = new Float32Array(L);
    const ramp = new Float32Array(L);
    for (let k = 0; k < L; k++) { const f = k <= L / 2 ? k : L - k; ramp[k] = f / (L / 2); }
    for (let a = 0; a < nA; a++) {
      re.fill(0); im.fill(0);
      for (let r = 0; r < N; r++) re[r] = sino.data[r * nA + a];
      fft1(re, im, false);
      for (let k = 0; k < L; k++) { re[k] *= ramp[k]; im[k] *= ramp[k]; }
      fft1(re, im, true);
      for (let r = 0; r < N; r++) filtered[r * nA + a] = re[r];
    }
    // back-projection
    const out = new Float32Array(N * N), cen = (N - 1) / 2;
    const cos = new Float32Array(nA), sin = new Float32Array(nA);
    for (let a = 0; a < nA; a++) { const t = thetas[a] * Math.PI / 180; cos[a] = Math.cos(t); sin[a] = Math.sin(t); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const xr = x - cen, yr = y - cen; let acc = 0;
      for (let a = 0; a < nA; a++) {
        const t = xr * cos[a] + yr * sin[a] + cen, r0 = Math.floor(t), fr = t - r0;
        if (r0 >= 0 && r0 < N - 1) acc += filtered[r0 * nA + a] * (1 - fr) + filtered[(r0 + 1) * nA + a] * fr;
        else if (r0 >= 0 && r0 < N) acc += filtered[r0 * nA + a];
      }
      out[y * N + x] = acc * Math.PI / (2 * nA);
    }
    return normalize(Gfrom(N, N, out));
  }
  // Sinogram as a displayable gray image (normalised).
  function sinogramImage(sino) { return normalize(Gfrom(sino.nAngles, sino.det, sino.data)); }

  /* ---------------------- thresholding / watershed ----------------------- */
  function otsu(img) {
    const g = toGray(img), hist = histogram(g), total = g.data.length;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, mx = 0, thr = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break;
      sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > mx) { mx = between; thr = t; }
    }
    return thr;
  }
  function threshold(img, t, inv) {
    const g = toGray(img), o = new Float32Array(g.data.length);
    for (let i = 0; i < o.length; i++) o[i] = (g.data[i] > t) !== !!inv ? 255 : 0;
    return Gfrom(g.w, g.h, o);
  }
  // Two-pass chamfer distance transform of a binary image (fg = >127).
  function distanceTransform(bin) {
    const { w, h } = bin, INF = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = bin.data[i] > 127 ? INF : 0;
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (d[i] === 0) continue; let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + D1);
      if (y > 0) m = Math.min(m, d[i - w] + D1);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + D2);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + D2);
      d[i] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (d[i] === 0) continue; let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + D1);
      if (y < h - 1) m = Math.min(m, d[i + w] + D1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + D2);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + D2);
      d[i] = m;
    }
    return Gfrom(w, h, d);
  }
  // Connected components (8-connectivity) of a binary image → Int32 labels.
  function connectedComponents(bin) {
    const { w, h } = bin, labels = new Int32Array(w * h).fill(0); let cur = 0;
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (bin.data[s] <= 127 || labels[s] !== 0) continue;
      cur++; labels[s] = cur; stack.length = 0; stack.push(s);
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx; if (bin.data[j] > 127 && labels[j] === 0) { labels[j] = cur; stack.push(j); }
        }
      }
    }
    return { labels, count: cur };
  }
  // Colour an integer label map for display (label 0 stays dark).
  function labelsToColor(labels, w, h, count) {
    const c = C(w, h), pal = [];
    for (let k = 0; k <= count + 1; k++) { const hue = (k * 47) % 360; pal.push(hsvToRgb(hue, 0.6, 0.9)); }
    for (let i = 0; i < w * h; i++) {
      const l = labels[i];
      if (l <= 0) { c.r[i] = 20; c.g[i] = 20; c.b[i] = 40; }
      else { const p = pal[l % pal.length]; c.r[i] = p[0]; c.g[i] = p[1]; c.b[i] = p[2]; }
    }
    return c;
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  // Marker-controlled region growth (approximate watershed): flood every
  // foreground pixel from the nearest seed marker, then mark boundaries.
  function watershed(baseColor, markers, w, h) {
    const labels = markers.slice();       // Int32Array; 0 = unknown, 1 = bg, >=2 seeds
    const q = [];
    for (let i = 0; i < w * h; i++) if (labels[i] > 1) q.push(i);
    let head = 0;
    while (head < q.length) {
      const i = q[head++], x = i % w, y = (i / w) | 0, lab = labels[i];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (labels[j] === 0) { labels[j] = lab; q.push(j); }
      }
    }
    // boundaries
    const out = toColor(baseColor);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, l = labels[i]; if (l <= 1) continue;
      let edge = false;
      if (x < w - 1 && labels[i + 1] !== l && labels[i + 1] > 1) edge = true;
      if (y < h - 1 && labels[i + w] !== l && labels[i + w] > 1) edge = true;
      if (edge) { out.r[i] = 223; out.g[i] = 23; out.b[i] = 0; }
    }
    return { seg: labelsToColor(labels, w, h, maxOf(labels)), overlay: out };
  }

  /* --------------------------- registration ------------------------------ */
  // Normalised cross-correlation between two same-size gray images (−1..1).
  function ncc(A, B) {
    A = toGray(A); B = matchSize(A, toGray(B)); const n = A.w * A.h;
    let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += A.data[i]; mb += B.data[i]; } ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const a = A.data[i] - ma, b = B.data[i] - mb; num += a * b; da += a * a; db += b * b; }
    return num / (Math.sqrt(da * db) + 1e-9);
  }
  // False-colour overlay of two images: reference→green, other→magenta
  // (well-aligned pixels appear neutral grey).
  function overlayPair(ref, img) {
    const R = toGray(ref), I = matchSize(R, toGray(img)), c = C(R.w, R.h);
    for (let i = 0; i < R.w * R.h; i++) { c.r[i] = I.data[i]; c.g[i] = R.data[i]; c.b[i] = I.data[i]; }
    return c;
  }

  /* ------------------------------- fusion -------------------------------- */
  const fuseWeighted = (a, b, alpha) => addWeighted(a, alpha, b, 1 - alpha, 0);
  // One-level 2-D Haar DWT/IDWT (image dims are made even by cropping).
  function haarDWT(g) {
    const w = g.w & ~1, h = g.h & ~1, hw = w / 2, hh = h / 2;
    const src = g.data, tmp = new Float32Array(w * h);
    // rows
    for (let y = 0; y < h; y++) for (let x = 0; x < hw; x++) {
      const a = src[y * g.w + 2 * x], b = src[y * g.w + 2 * x + 1];
      tmp[y * w + x] = (a + b) / Math.SQRT2; tmp[y * w + hw + x] = (a - b) / Math.SQRT2;
    }
    const LL = new Float32Array(hw * hh), LH = new Float32Array(hw * hh), HL = new Float32Array(hw * hh), HH = new Float32Array(hw * hh);
    for (let x = 0; x < w; x++) for (let y = 0; y < hh; y++) {
      const a = tmp[(2 * y) * w + x], b = tmp[(2 * y + 1) * w + x];
      const lo = (a + b) / Math.SQRT2, hi = (a - b) / Math.SQRT2;
      if (x < hw) { LL[y * hw + x] = lo; LH[y * hw + x] = hi; }
      else { HL[y * hw + (x - hw)] = lo; HH[y * hw + (x - hw)] = hi; }
    }
    return { LL, LH, HL, HH, hw, hh, w, h };
  }
  function haarIDWT(co) {
    const { LL, LH, HL, HH, hw, hh, w, h } = co, tmp = new Float32Array(w * h);
    for (let x = 0; x < w; x++) for (let y = 0; y < hh; y++) {
      let lo, hi;
      if (x < hw) { lo = LL[y * hw + x]; hi = LH[y * hw + x]; }
      else { lo = HL[y * hw + (x - hw)]; hi = HH[y * hw + (x - hw)]; }
      tmp[(2 * y) * w + x] = (lo + hi) / Math.SQRT2; tmp[(2 * y + 1) * w + x] = (lo - hi) / Math.SQRT2;
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < hw; x++) {
      const lo = tmp[y * w + x], hi = tmp[y * w + hw + x];
      out[y * w + 2 * x] = (lo + hi) / Math.SQRT2; out[y * w + 2 * x + 1] = (lo - hi) / Math.SQRT2;
    }
    return Gfrom(w, h, out);
  }
  function fuseWavelet(a, b) {
    a = toGray(a); b = matchSize(a, toGray(b));
    const A = haarDWT(a), B = haarDWT(b), n = A.hw * A.hh;
    const LL = new Float32Array(n), LH = new Float32Array(n), HL = new Float32Array(n), HH = new Float32Array(n);
    const pick = (u, v) => Math.abs(u) >= Math.abs(v) ? u : v;
    for (let i = 0; i < n; i++) { LL[i] = (A.LL[i] + B.LL[i]) / 2; LH[i] = pick(A.LH[i], B.LH[i]); HL[i] = pick(A.HL[i], B.HL[i]); HH[i] = pick(A.HH[i], B.HH[i]); }
    return haarIDWT({ LL, LH, HL, HH, hw: A.hw, hh: A.hh, w: A.w, h: A.h });
  }
  // PCA fusion: weights from the leading eigenvector of the 2×2 covariance.
  function fusePCA(a, b) {
    a = toGray(a); b = matchSize(a, toGray(b)); const n = a.w * a.h;
    let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a.data[i]; mb += b.data[i]; } ma /= n; mb /= n;
    let caa = 0, cbb = 0, cab = 0;
    for (let i = 0; i < n; i++) { const da = a.data[i] - ma, db = b.data[i] - mb; caa += da * da; cbb += db * db; cab += da * db; }
    caa /= n; cbb /= n; cab /= n;
    const tr = caa + cbb, det = caa * cbb - cab * cab, lam = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
    let v1 = cab, v2 = lam - caa; if (Math.abs(v1) < 1e-9 && Math.abs(v2) < 1e-9) { v1 = 1; v2 = 1; }
    const s = v1 + v2 || 1, w1 = v1 / s, w2 = v2 / s;
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = clamp255(w1 * a.data[i] + w2 * b.data[i]);
    return { img: Gfrom(a.w, a.h, o), w1, w2 };
  }

  /* ---------------------------- phantom images --------------------------- */
  // Sum-of-ellipses evaluator (Toft Shepp–Logan style).
  function ellipseImage(w, h, ellipses, bg) {
    const d = new Float32Array(w * h).fill(bg || 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2), ny = (y - h / 2) / (h / 2);
      let v = bg || 0;
      for (const e of ellipses) {
        const [A, a, b, x0, y0, phi] = e, c = Math.cos(phi * Math.PI / 180), s = Math.sin(phi * Math.PI / 180);
        const xt = (nx - x0) * c + (ny - y0) * s, yt = -(nx - x0) * s + (ny - y0) * c;
        if ((xt * xt) / (a * a) + (yt * yt) / (b * b) <= 1) v += A;
      }
      d[y * w + x] = clamp(v, 0, 1) * 255;
    }
    return Gfrom(w, h, d);
  }
  const SHEPP = [
    [1.0, .69, .92, 0, 0, 0], [-0.8, .6624, .874, 0, -.0184, 0], [-0.2, .11, .31, .22, 0, -18],
    [-0.2, .16, .41, -.22, 0, 18], [0.1, .21, .25, 0, .35, 0], [0.1, .046, .046, 0, .1, 0],
    [0.1, .046, .046, 0, -.1, 0], [0.1, .046, .023, -.08, -.605, 0], [0.1, .023, .023, 0, -.606, 0],
    [0.1, .023, .046, .06, -.605, 0]
  ];
  const CHEST = [
    [0.35, .78, .62, 0, .05, 0],     // soft tissue body
    [-0.30, .30, .40, -.34, -.02, 8], // right lung
    [-0.30, .30, .40, .34, -.02, -8], // left lung
    [0.55, .07, .09, 0, .18, 0],      // spine
    [0.25, .55, .10, 0, .60, 0]       // table/mediastinum band
  ];
  const BRAIN = [
    [0.55, .70, .80, 0, 0, 0],        // skull outer (bright)
    [-0.30, .62, .72, 0, 0, 0],       // brain tissue
    [0.18, .60, .70, 0, 0, 0],
    [-0.16, .12, .18, -.14, .05, 0],  // left ventricle
    [-0.16, .12, .18, .14, .05, 0],   // right ventricle
    [0.12, .05, .10, 0, .30, 0]
  ];
  function bonePhantom(w, h, variant) {
    const d = new Float32Array(w * h); const rng = mulberry(variant ? 77 : 12);
    // dark background with a soft glow, plus a set of bright tapering "bones"
    const bones = variant
      ? [[.30, .18, .70], [.44, .22, .64], [.58, .20, .68], [.70, .26, .60], [.34, .78, .40]]
      : [[.32, .20, .72], [.46, .24, .66], [.60, .22, .70], [.72, .28, .62], [.36, .80, .42]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h; let v = 8 + 10 * rng();
      for (const [bx, top, bot] of bones) {
        const cx = bx, halfW = 0.055 + 0.02 * Math.sin(ny * 6);
        if (ny > top && ny < bot && Math.abs(nx - cx) < halfW) {
          const edge = 1 - Math.abs(nx - cx) / halfW;
          v = Math.max(v, 150 + 90 * edge);
        }
      }
      // wrist block
      if (ny > 0.78 && ny < 0.92 && nx > 0.25 && nx < 0.82) v = Math.max(v, 120 + 40 * rng());
      d[y * w + x] = clamp255(v);
    }
    return Gfrom(w, h, d);
  }
  function blocksPhantom(w, h) {
    const d = new Float32Array(w * h).fill(30);
    const put = (cx, cy, r, val, circle) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = x - cx * w, dy = y - cy * h;
        const in_ = circle ? (dx * dx + dy * dy <= (r * w) * (r * w)) : (Math.abs(dx) <= r * w && Math.abs(dy) <= r * w);
        if (in_) d[y * w + x] = val;
      }
    };
    put(0.30, 0.32, 0.14, 210, true); put(0.68, 0.30, 0.12, 180, false);
    put(0.34, 0.70, 0.10, 235, false); put(0.70, 0.68, 0.15, 160, true);
    put(0.50, 0.50, 0.07, 250, true);
    return Gfrom(w, h, d);
  }
  function mulberry(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // Public phantom factory.
  function phantom(name, size, opts) {
    opts = opts || {}; const w = size, h = size;
    switch (name) {
      case 'shepp': return ellipseImage(w, h, SHEPP, 0);
      case 'ct': case 'chest_ct': return ellipseImage(w, h, CHEST, 0);
      case 'mri': case 'brain_mri': case 'brain_mri2': return ellipseImage(w, h, BRAIN, 0);
      case 'mri_color': case 'brain_color': return applyColormap(normalize(ellipseImage(w, h, BRAIN, 0)), JET);
      case 'bone': case 'hand_xray': return bonePhantom(w, h, opts.variant);
      case 'blocks': return blocksPhantom(w, h);
      default: return ellipseImage(w, h, CHEST, 0);
    }
  }

  /* ------------------------------- exports ------------------------------- */
  global.MIP = {
    // helpers
    G, Gfrom, C, isColor, clone, toGray, toColor, resize, fit, maxOf, minOf,
    toImageData, fromImageData, colorFromImageData,
    // geometry
    warpAffine, rotationMatrix, rotate, translate, shear,
    // filtering / edges
    convolve, boxKernel, gaussianKernel, averaging, gaussianBlur, medianBlur,
    sobel, laplacian, canny, overlayEdges,
    // morphology
    dilate, erode, opening, closing, morphGradient,
    // intensity
    negative, logTransform, gamma, contrastStretch, normalize, histogram, histEqualize, mapChannels,
    // arithmetic / logical
    add, subtract, addWeighted, bitAnd, bitOr, bitXor, bitNot,
    // colour
    rgb2hsv, inRange, applyMask, applyColormap, JET,
    // frequency
    fft2, ifft2, spectrum, lowpassFFT,
    // radon
    radon, iradon, sinogramImage,
    // segmentation
    otsu, threshold, distanceTransform, connectedComponents, labelsToColor, watershed,
    // fusion
    fuseWeighted, fuseWavelet, fusePCA, haarDWT, haarIDWT,
    // registration
    ncc, overlayPair,
    // phantoms
    phantom
  };
})(window);
