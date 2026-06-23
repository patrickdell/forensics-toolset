/**
 * clone.js — Clone (copy-move forgery) detection coordinator
 */

import { img, results } from './app.js';
import { setActiveChip } from './utils.js';

let cloneSensitivity = 'low';  // default low — reduces false positives
let cloneWorker = null;

// Tighter thresholds to suppress false positives in smooth regions
const sensitivitySettings = {
  low:    { stride: 16, threshold: 0.10, K: 2 },
  medium: { stride: 8,  threshold: 0.07, K: 3 },
  high:   { stride: 4,  threshold: 0.05, K: 4 },
};

export function initClone() {
  // Wire sensitivity chips once
  document.getElementById('clone-sensitivity-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sensitivity === cloneSensitivity);
    chip.addEventListener('click', () => {
      cloneSensitivity = chip.dataset.sensitivity;
      setActiveChip(document.getElementById('clone-sensitivity-chips'), chip);
    });
  });

  // Wire analyse button once — reads checkbox state at click time
  document.getElementById('clone-analyse-btn').addEventListener('click', () => {
    const scaleCheckbox = document.getElementById('clone-scale-checkbox');
    runCloneDetection(scaleCheckbox.checked);
  });

  document.addEventListener('fts:loaded', setupClone);
}

async function setupClone() {
  const sizeWarnEl = document.getElementById('clone-size-warn');

  document.getElementById('clone-controls').style.display  = 'block';
  document.getElementById('clone-analyse-btn').style.display = 'block';
  document.getElementById('clone-canvas-wrap').style.display = 'none';

  const resultText = document.getElementById('clone-result-text');
  if (resultText) resultText.style.display = 'none';
  document.getElementById('clone-status').style.display = 'none';

  const mp = (img.bitmap.width * img.bitmap.height) / 1_000_000;
  sizeWarnEl.style.display = mp > 2 ? 'block' : 'none';
}

async function runCloneDetection(scaleDown) {
  const progressWrap = document.getElementById('clone-progress-wrap');
  const progressBar  = document.getElementById('clone-progress-bar');
  const progressText = document.getElementById('clone-progress-text');
  const analyseBtn   = document.getElementById('clone-analyse-btn');

  progressWrap.style.display = 'block';
  analyseBtn.disabled = true;

  if (cloneWorker) { cloneWorker.terminate(); cloneWorker = null; }

  try {
    let scale = 1;
    let srcW  = img.bitmap.width;
    let srcH  = img.bitmap.height;

    if (scaleDown) {
      srcW  = Math.round(srcW / 2);
      srcH  = Math.round(srcH / 2);
      scale = 0.5;
    }

    if (srcW < 16 || srcH < 16) {
      progressWrap.style.display = 'none';
      analyseBtn.disabled = false;
      showCloneError('Image is too small for clone detection (minimum 16×16px after any scaling applied).');
      return;
    }

    const tmp = document.createElement('canvas');
    tmp.width  = srcW;
    tmp.height = srcH;
    const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
    tmpCtx.drawImage(img.bitmap, 0, 0, srcW, srcH);
    const imageData = tmpCtx.getImageData(0, 0, srcW, srcH);

    cloneWorker = new Worker('clone.worker.js');
    const settings = sensitivitySettings[cloneSensitivity];

    cloneWorker.postMessage(
      { pixels: imageData.data, width: srcW, height: srcH,
        blockSize: 16, stride: settings.stride, threshold: settings.threshold, K: settings.K },
      [imageData.data.buffer]
    );

    cloneWorker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        progressBar.style.width  = e.data.progress + '%';
        progressText.textContent = `Analysing… ${e.data.progress}%`;

      } else if (e.data.type === 'result') {
        progressWrap.style.display = 'none';
        analyseBtn.disabled = false;
        cloneWorker = null;

        let { matches } = e.data;
        if (scale !== 1) {
          matches = matches.map(m => ({
            ax: m.ax / scale, ay: m.ay / scale,
            bx: m.bx / scale, by: m.by / scale,
            score: m.score,
          }));
        }
        renderCloneResults(matches, img.bitmap.width, img.bitmap.height);

      } else if (e.data.type === 'error') {
        progressWrap.style.display = 'none';
        analyseBtn.disabled = false;
        cloneWorker = null;
        showCloneError('Clone detection error: ' + e.data.error);
      }
    };

  } catch (err) {
    progressWrap.style.display = 'none';
    analyseBtn.disabled = false;
    if (cloneWorker) { cloneWorker.terminate(); cloneWorker = null; }
    showCloneError('Clone detection error: ' + err.message);
  }
}

function showCloneError(msg) {
  let errEl = document.getElementById('clone-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id        = 'clone-error';
    errEl.className = 'fts-warn';
    errEl.style.cssText = 'margin:0.75rem 0;padding:0.5rem 0.75rem;font-size:0.875rem;';
    document.getElementById('clone-controls').appendChild(errEl);
  }
  errEl.textContent = msg;
}

function renderCloneResults(matches, width, height) {
  const canvas     = document.getElementById('clone-canvas');
  const wrap       = document.getElementById('clone-canvas-wrap');
  const resultText = document.getElementById('clone-result-text');
  const blockSize  = 16;

  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img.bitmap, 0, 0, width, height);

  if (matches.length > 0) {
    const colours = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#a29bfe'];
    matches.forEach((m, idx) => {
      const col = colours[idx % colours.length];
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2;
      ctx.strokeRect(m.ax, m.ay, blockSize, blockSize);
      ctx.strokeRect(m.bx, m.by, blockSize, blockSize);

      ctx.globalAlpha = 0.35;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(m.ax + blockSize / 2, m.ay + blockSize / 2);
      ctx.lineTo(m.bx + blockSize / 2, m.by + blockSize / 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  wrap.style.display = 'block';

  if (resultText) {
    resultText.style.display = 'block';
    if (matches.length === 0) {
      resultText.textContent = '✓ No suspicious cloned regions found at this sensitivity.';
      resultText.style.color = 'var(--success)';
    } else {
      resultText.textContent = `${matches.length} matched region pair${matches.length === 1 ? '' : 's'} found — sensitivity: ${cloneSensitivity}. Consider whether matches are visually meaningful before drawing conclusions.`;
      resultText.style.color = 'var(--muted)';
    }
  }

  results.clone = {
    canvas:      canvas.toDataURL(),
    matchCount:  matches.length,
    sensitivity: cloneSensitivity,
  };
}
