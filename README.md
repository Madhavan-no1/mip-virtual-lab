# SRM Virtual Lab — Medical Image Processing (MIP)

An interactive, browser-based virtual laboratory for the **Medical Image
Processing** course, B.Tech Biomedical Engineering, SRM Institute of Science and
Technology. Eleven experiments run entirely client-side — **no server, no
Python, no dependencies** — using a from-scratch image-processing engine in
vanilla JavaScript.

> Companion to the *Biomedical Signal Processing* (BSP) virtual lab, rebuilt for
> medical **images** (CT / MRI / X-ray) instead of 1-D signals.

## Experiments

| # | Title | Group |
|---|-------|-------|
| 1 | Basic Operations on Images (resize, rotate, translate, shear, blur, edges, morphology) | Fundamentals |
| 2 | Image Arithmetic & Logical Operations (add, weighted, subtract, AND/OR/XOR/NOT) | Fundamentals |
| 3 | Image Transforms in the Frequency Domain (2-D FFT, spectrum, low-pass, IFFT) | Transforms |
| 4 | Intensity Transformation & Histogram Equalization (negative, log, gamma, contrast, HE) | Enhancement |
| 5 | Averaging, Unsharp Masking & High-Boost Filtering | Enhancement |
| 6 | Colour Image Processing (HSV colour detection) | Enhancement |
| 7 | Image Reconstruction — Radon Transform (sinogram + filtered back-projection) | Reconstruction |
| 8 | Fourier Reconstruction of MRI Images (k-space → IFFT) | Reconstruction |
| 9 | Advanced Edge Detection (Sobel, Laplacian, Canny) | Segmentation |
| 10 | Image Segmentation — Watershed Algorithm (Otsu, distance transform, markers) | Segmentation |
| 11 | Image Fusion (weighted, Haar-wavelet, PCA) | Reconstruction |

Each experiment provides an **Aim**, collapsible **Theory** and **Viva
questions**, interactive **parameters**, and lets you either use a built-in
synthetic medical phantom (Chest CT, Brain MRI, Shepp–Logan, Bone/X-ray, Shapes)
or **upload your own medical image** (JPG/PNG).

## Running it

Open `index.html` directly in a browser, **or** serve the folder for the image
upload / clean routing to work best:

```bash
npx --yes http-server -p 5173 -c-1 .
```

Then open http://localhost:5173 . In the Claude Code app you can also use the
bundled launch config ("MIP Virtual Lab").

## Project structure

```
index.html          Landing page (course, faculty, experiments, curriculum)
lab.html            Interactive lab workbench
css/style.css       Lab styling (light/dark)
js/imglib.js        Image-processing engine (phantoms + all algorithms)
js/plot.js          Canvas image + chart rendering
js/experiments.js   The 11 experiment definitions
js/app.js           App shell (navigation, controls, upload, execution)
assets/             Logos + faculty photo (see assets/README.txt)
```

## Faculty photo

The Faculty section on `index.html` displays `assets/nithya.jpg` for
**Dr. Nithyakalyani K**, with an automatic fallback to her initials if the file
is absent. See `assets/README.txt` for how to add the photo from her
[SRM faculty profile](https://www.srmist.edu.in/faculty/dr-nithyakalyani-k-2/).

## Course

- **Course:** Medical Image Processing
- **Department:** Biomedical Engineering
- **Faculty:** Dr. Nithyakalyani K, Assistant Professor
- **Institution:** SRM Institute of Science and Technology, Kattankulathur
