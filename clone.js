/**
 * clone.js — Clone (copy-move forgery) detection coordinator
 */

import { img, results } from './app.js';

export function initClone() {
  document.addEventListener('fts:loaded', setupClone);
}

let cloneSensitivity = 'low';  // default low — reduces false positives
let cloneWorker = null;

// Tighter thresholds to suppress false positives in smooth regions
const sensitivitySettings = {
  low:    { stride: 16, threshold: 0.10, K: 2 },
  medium: { stride: 8,  threshold: 0.07, K: 3 },
  high:   { stride: 4,  threshold: 0.05, K: 4 },
};

async function setupClone() {
  const controlsEl  = document.getElementById('clone-controls');
  const analyseBtn  = document.getElementById('clone-analyse-btn');
  const sizeWarnEl  = document.getElementById('clone-size-warn');
  const scaleCheckbox = document.getElementById('clone-scale-checkbox');
  const canvasWrap  = document.getElementById('clone-canvas-wrap');
  const resultText  = document.getElementById('clone-result-text');
  const statusEl    = document.getElementById('clone-status');

  controlsEl.style.display = 'block';
  analyseBtn.style.display = 'block';
  canvasWrap.style.display = 'none';
  if (resultText) resultText.style.display = 'none';
  statusEl.style.display = 'none';

  // Size warning for > 2 MP
  const mp = (img.bitmap.width * img.bitmap.height) / 1_000_000;
  sizeWarnEl.style.display = mp > 2 ? 'block' : 'none';

  // Wire sensitivity chips
  document.getElementById('clone-sensitivity-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sensitivity === cloneSensitivity);
    chip.addEventListener('click', () => {
      cloneSensitivity = chip.dataset.sensitivity;
      setActiveChip(document.getElementById('clone-sensitivity-chips'), chip);
    });
  });

  analyseBtn.addEventListener('click', () => runCloneDetection(scaleCheckbox.checked));
}

async function runCloneDetection(scaleDown) {
  const progressWrap = document.getElementById('clone-progress-wrap');
  const progressBar  = document.getElementById('clone-progress-bar');
  const progressText = document.getElementById('clone-progress-text');
  const analyseBtn   = document.getElementById('clone-analyse-btn');

  progressWrap.style.display = 'block';
  analyseBtn.disabled = true;

  // Terminate previous worker if still running
  if (cloneWorker) { cloneWorker.terminate(); cloneWorker = null; }

  try {
    let bitmap = img.bitmap;
    let scale  = 1;

    if (scaleDown) {
      const c = document.createElement('canvas');
      c.width  = Math.round(img.bitmap.width  / 2);
      c.height = Math.round(img.bitmap.height / 2);
      c.getContext('2d').drawImage(img.bitmap, 0, 0, c.width, c.height);
      bitmap = await createImageBitmap(c);
      scale = 0.5;
    }

    const tmp = document.createElement('canvas');
    tmp.width  = bitmap.width;
    tmp.height = bitmap.height;
    tmp.getContext('2d').drawImage(bitmap, 0, 0);
    const imageData = tmp.getContext('2d').getImageData(0, 0, bitmap.width, bitmap.height);

    cloneWorker = new Worker('clone.worker.js');
    const settings = sensitivitySettings[cloneSensitivity];

    cloneWorker.postMessage(
      { pixels: imageData.data, width: bitmap.width, height: bitmap.height,
        blockSize: 16, stride: settings.stride, threshold: settings.threshold, K: settings.K },
      [imageData.data.buffer]
    );

    cloneWorker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        progressBar.style.width = e.data.progress + '%';
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
        alert('Clone detection error: ' + e.data.error);
      }
    };

  } catch (err) {
    progressWrap.style.display = 'none';
    analyseBtn.disabled = false;
    alert('Clone detection error: ' + err);
  }
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
      ctx.lineWidth = 2;
      ctx.strokeRect(m.ax, m.ay, blockSize, blockSize);
      ctx.strokeRect(m.bx, m.by, blockSize, blockSize);

      // Connecting line
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
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
    canvas: canvas.toDataURL(),
    matchCount: matches.length,
    sensitivity: cloneSensitivity,
  };
}

function setActiveChip(container, activeBtn) {
  container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  activeBtn.classList.add('active');
}
