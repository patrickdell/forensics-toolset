/**
 * ela.js — Error Level Analysis
 */

import { img, results } from './app.js';
import { setProgress } from './utils.js';

export function initELA() {
  document.addEventListener('fts:loaded', setupELA);
}

let currentELA = null;
let elaQuality = 75;
let elaAmplification = 15;
let elaDisplay = 'ela-only';

async function setupELA() {
  const controlsEl = document.getElementById('ela-controls');
  const nonJpegWarn = document.getElementById('ela-non-jpeg-warn');
  const canvasWrap = document.getElementById('ela-canvas-wrap');
  const statusEl = document.getElementById('ela-status');

  controlsEl.style.display = 'block';
  canvasWrap.style.display = 'none';
  statusEl.style.display = 'none';
  nonJpegWarn.style.display = img.isJpeg ? 'none' : 'block';

  // Run initial ELA
  await runELA();

  // Wire up controls
  document.getElementById('ela-quality-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.quality === String(elaQuality));
    chip.addEventListener('click', async () => {
      elaQuality = parseInt(chip.dataset.quality);
      setActiveChip(document.getElementById('ela-quality-chips'), chip);
      await runELA();
    });
  });

  document.getElementById('ela-amp-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.amp === String(elaAmplification));
    chip.addEventListener('click', async () => {
      elaAmplification = parseInt(chip.dataset.amp);
      setActiveChip(document.getElementById('ela-amp-chips'), chip);
      await runELA();
    });
  });

  document.getElementById('ela-display-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.display === elaDisplay);
    chip.addEventListener('click', () => {
      elaDisplay = chip.dataset.display;
      setActiveChip(document.getElementById('ela-display-chips'), chip);
      renderELACanvas();
    });
  });
}

async function runELA() {
  const origCanvas = document.createElement('canvas');
  origCanvas.width = img.bitmap.width;
  origCanvas.height = img.bitmap.height;
  const ctx = origCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img.bitmap, 0, 0);

  // Re-encode as JPEG
  const origImageData = ctx.getImageData(0, 0, origCanvas.width, origCanvas.height);

  const jpegBlob = await new Promise(resolve => origCanvas.toBlob(resolve, 'image/jpeg', elaQuality / 100));
  const reloadedBitmap = await createImageBitmap(jpegBlob);

  const resaveCanvas = document.createElement('canvas');
  resaveCanvas.width = img.bitmap.width;
  resaveCanvas.height = img.bitmap.height;
  const resaveCtx = resaveCanvas.getContext('2d', { willReadFrequently: true });
  resaveCtx.drawImage(reloadedBitmap, 0, 0);
  const resaveImageData = resaveCtx.getImageData(0, 0, resaveCanvas.width, resaveCanvas.height);

  // Compute difference
  const w = origImageData.width;
  const h = origImageData.height;
  const origData = origImageData.data;
  const resaveData = resaveImageData.data;

  const diffData = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < origData.length; i += 4) {
    const r = Math.abs(origData[i] - resaveData[i]) * elaAmplification;
    const g = Math.abs(origData[i + 1] - resaveData[i + 1]) * elaAmplification;
    const b = Math.abs(origData[i + 2] - resaveData[i + 2]) * elaAmplification;

    // False color: interpolate 0 (dark blue) → 50 (green) → 150 (yellow) → 200+ (red)
    const intensity = (r + g + b) / 3;
    const [fr, fg, fb] = falseColor(intensity);

    diffData[i] = fr;
    diffData[i + 1] = fg;
    diffData[i + 2] = fb;
    diffData[i + 3] = 255;
  }

  currentELA = {
    original: origImageData,
    difference: new ImageData(diffData, w, h),
    quality: elaQuality,
    amplification: elaAmplification,
  };

  results.ela = {
    quality: elaQuality,
    amplification: elaAmplification,
    canvas: null, // Will be set on render
  };

  renderELACanvas();
}

function falseColor(intensity) {
  // 0 → dark blue (#0f1f4f), 50 → green (#3ecf8e), 150 → yellow (#f5a623), 255+ → red (#ff5f5f)
  const clipped = Math.min(255, Math.max(0, intensity));

  let r, g, b;
  if (clipped < 50) {
    const t = clipped / 50;
    r = Math.round(15 + (62 - 15) * t);
    g = Math.round(31 + (207 - 31) * t);
    b = Math.round(79 + (142 - 79) * t);
  } else if (clipped < 150) {
    const t = (clipped - 50) / 100;
    r = Math.round(62 + (245 - 62) * t);
    g = Math.round(207 + (166 - 207) * t);
    b = Math.round(142 + (35 - 142) * t);
  } else {
    const t = (clipped - 150) / 105;
    r = Math.round(245 + (255 - 245) * t);
    g = Math.round(166 + (95 - 166) * t);
    b = Math.round(35 + (95 - 35) * t);
  }

  return [r, g, b];
}

function renderELACanvas() {
  const canvas = document.getElementById('ela-canvas');
  const wrap = document.getElementById('ela-canvas-wrap');

  if (!currentELA) return;

  canvas.width = currentELA.original.width;
  canvas.height = currentELA.original.height;
  const ctx = canvas.getContext('2d');

  if (elaDisplay === 'ela-only') {
    ctx.putImageData(currentELA.difference, 0, 0);
  } else if (elaDisplay === 'side-by-side') {
    // Left: original, right: ELA
    const w = currentELA.original.width / 2;
    ctx.putImageData(currentELA.original, 0, 0);
    ctx.putImageData(currentELA.difference, w, 0);
  } else if (elaDisplay === 'overlay') {
    // Original with ELA at 70% opacity
    ctx.putImageData(currentELA.original, 0, 0);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = currentELA.original.width;
    tmpCanvas.height = currentELA.original.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.putImageData(currentELA.difference, 0, 0);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(tmpCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  wrap.style.display = 'block';

  // Store data URL for report
  results.ela.canvas = canvas.toDataURL();
}

function setActiveChip(container, activeBtn) {
  container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  activeBtn.classList.add('active');
}
