/**
 * ela.js — Error Level Analysis
 */

import { img, results } from './app.js';
import { setActiveChip, debounce } from './utils.js';

let currentELA = null;
let elaQuality = 75;
let elaAmplification = 15;
let elaDisplay = 'ela-only';

const _debouncedRunELA = debounce(() => runELA(), 200);

export function initELA() {
  // Wire chip listeners once — safe to call before any image is loaded
  document.getElementById('ela-quality-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.quality === String(elaQuality));
    chip.addEventListener('click', () => {
      elaQuality = parseInt(chip.dataset.quality);
      setActiveChip(document.getElementById('ela-quality-chips'), chip);
      _debouncedRunELA();
    });
  });

  document.getElementById('ela-amp-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.amp === String(elaAmplification));
    chip.addEventListener('click', () => {
      elaAmplification = parseInt(chip.dataset.amp);
      setActiveChip(document.getElementById('ela-amp-chips'), chip);
      _debouncedRunELA();
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

  document.addEventListener('fts:loaded', setupELA);
}

async function setupELA() {
  document.getElementById('ela-controls').style.display = 'block';
  document.getElementById('ela-canvas-wrap').style.display = 'none';
  document.getElementById('ela-status').style.display = 'none';
  document.getElementById('ela-non-jpeg-warn').style.display = img.isJpeg ? 'none' : 'block';
  currentELA = null;
  await runELA();
}

async function runELA() {
  if (!img.bitmap) return;

  const origCanvas = document.createElement('canvas');
  origCanvas.width  = img.bitmap.width;
  origCanvas.height = img.bitmap.height;
  const ctx = origCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img.bitmap, 0, 0);

  const origImageData = ctx.getImageData(0, 0, origCanvas.width, origCanvas.height);
  const jpegBlob      = await new Promise(resolve => origCanvas.toBlob(resolve, 'image/jpeg', elaQuality / 100));
  const reloadedBitmap = await createImageBitmap(jpegBlob);

  const resaveCanvas = document.createElement('canvas');
  resaveCanvas.width  = img.bitmap.width;
  resaveCanvas.height = img.bitmap.height;
  const resaveCtx = resaveCanvas.getContext('2d', { willReadFrequently: true });
  resaveCtx.drawImage(reloadedBitmap, 0, 0);
  const resaveImageData = resaveCtx.getImageData(0, 0, resaveCanvas.width, resaveCanvas.height);

  const w          = origImageData.width;
  const h          = origImageData.height;
  const origData   = origImageData.data;
  const resaveData = resaveImageData.data;

  const diffData = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < origData.length; i += 4) {
    const r = Math.abs(origData[i]     - resaveData[i])     * elaAmplification;
    const g = Math.abs(origData[i + 1] - resaveData[i + 1]) * elaAmplification;
    const b = Math.abs(origData[i + 2] - resaveData[i + 2]) * elaAmplification;
    const [fr, fg, fb] = falseColor((r + g + b) / 3);
    diffData[i]     = fr;
    diffData[i + 1] = fg;
    diffData[i + 2] = fb;
    diffData[i + 3] = 255;
  }

  currentELA = {
    difference:   new ImageData(diffData, w, h),
    quality:      elaQuality,
    amplification: elaAmplification,
  };

  results.ela = { quality: elaQuality, amplification: elaAmplification, canvas: null };

  renderELACanvas();
}

function falseColor(intensity) {
  // 0 → dark blue (#0f1f4f), 50 → green (#3ecf8e), 150 → yellow (#f5a623), 255+ → red (#ff5f5f)
  const c = Math.min(255, Math.max(0, intensity));
  if (c < 50) {
    const t = c / 50;
    return [Math.round(15 + 47 * t), Math.round(31 + 176 * t), Math.round(79 + 63 * t)];
  }
  if (c < 150) {
    const t = (c - 50) / 100;
    return [Math.round(62 + 183 * t), Math.round(207 - 41 * t), Math.round(142 - 107 * t)];
  }
  const t = (c - 150) / 105;
  return [Math.round(245 + 10 * t), Math.round(166 - 71 * t), Math.round(35 + 60 * t)];
}

function renderELACanvas() {
  const canvas = document.getElementById('ela-canvas');
  const wrap   = document.getElementById('ela-canvas-wrap');
  if (!currentELA) return;

  const w = currentELA.difference.width;
  const h = currentELA.difference.height;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (elaDisplay === 'ela-only') {
    ctx.putImageData(currentELA.difference, 0, 0);
  } else if (elaDisplay === 'side-by-side') {
    ctx.drawImage(img.bitmap, 0, 0, w, h);
    ctx.putImageData(currentELA.difference, Math.floor(w / 2), 0);
  } else if (elaDisplay === 'overlay') {
    ctx.drawImage(img.bitmap, 0, 0, w, h);
    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    tmp.getContext('2d').putImageData(currentELA.difference, 0, 0);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Non-JPEG: desaturate result and stamp a persistent warning banner so
  // the unreliable output is visually unmistakable, not just a text note.
  if (!img.isJpeg) {
    const desat = ctx.getImageData(0, 0, w, h);
    const d = desat.data;
    for (let i = 0; i < d.length; i += 4) {
      const grey = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      d[i] = d[i + 1] = d[i + 2] = grey;
    }
    ctx.putImageData(desat, 0, 0);

    const bannerH  = Math.max(36, Math.round(h * 0.05));
    const fontSize = Math.max(13, Math.round(bannerH * 0.48));
    ctx.fillStyle = 'rgba(245,166,35,0.93)';
    ctx.fillRect(0, 0, w, bannerH);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('ELA — JPEG ONLY: results for non-JPEG images are not meaningful', 10, bannerH / 2);
  }

  wrap.style.display  = 'block';
  results.ela.canvas  = canvas.toDataURL();
}
