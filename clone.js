/**
 * clone.js — Clone (copy-move forgery) detection coordinator
 */

import { img, results } from './app.js';

export function initClone() {
  document.addEventListener('fts:loaded', setupClone);
}

let cloneSensitivity = 'medium';
let cloneWorker = null;

async function setupClone() {
  const controlsEl = document.getElementById('clone-controls');
  const analyseBtn = document.getElementById('clone-analyse-btn');
  const sizeWarnEl = document.getElementById('clone-size-warn');
  const scaleCheckbox = document.getElementById('clone-scale-checkbox');
  const canvasWrap = document.getElementById('clone-canvas-wrap');
  const statusEl = document.getElementById('clone-status');

  controlsEl.style.display = 'block';
  analyseBtn.style.display = 'block';
  canvasWrap.style.display = 'none';
  statusEl.style.display = 'none';

  // Show size warning if image > 2MP
  const megapixels = (img.bitmap.width * img.bitmap.height) / 1_000_000;
  if (megapixels > 2) {
    sizeWarnEl.style.display = 'block';
  } else {
    sizeWarnEl.style.display = 'none';
  }

  // Wire up sensitivity chips
  document.getElementById('clone-sensitivity-chips').querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sensitivity === cloneSensitivity);
    chip.addEventListener('click', () => {
      cloneSensitivity = chip.dataset.sensitivity;
      setActiveChip(document.getElementById('clone-sensitivity-chips'), chip);
    });
  });

  // Analyse button
  analyseBtn.addEventListener('click', async () => {
    await runCloneDetection(scaleCheckbox.checked);
  });
}

const sensitivitySettings = {
  low: { stride: 16, threshold: 0.35, K: 2 },
  medium: { stride: 8, threshold: 0.25, K: 4 },
  high: { stride: 4, threshold: 0.18, K: 6 },
};

async function runCloneDetection(scaleDown) {
  const progressWrap = document.getElementById('clone-progress-wrap');
  const progressBar = document.getElementById('clone-progress-bar');
  const progressText = document.getElementById('clone-progress-text');
  const analyseBtn = document.getElementById('clone-analyse-btn');

  progressWrap.style.display = 'block';
  analyseBtn.disabled = true;

  try {
    // Prepare image data
    let bitmap = img.bitmap;
    let scale = 1;

    if (scaleDown) {
      const canvas = document.createElement('canvas');
      canvas.width = img.bitmap.width / 2;
      canvas.height = img.bitmap.height / 2;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img.bitmap, 0, 0, canvas.width, canvas.height);
      bitmap = await createImageBitmap(canvas);
      scale = 0.5;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bitmap.width;
    tempCanvas.height = bitmap.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(bitmap, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, bitmap.width, bitmap.height);

    // Start worker
    if (!cloneWorker) {
      cloneWorker = new Worker('clone.worker.js');
    }

    // Send message to worker with transferred buffer
    const settings = sensitivitySettings[cloneSensitivity];
    cloneWorker.postMessage(
      {
        pixels: imageData.data,
        width: bitmap.width,
        height: bitmap.height,
        blockSize: 16,
        stride: settings.stride,
        threshold: settings.threshold,
        K: settings.K,
      },
      [imageData.data.buffer]
    );

    // Listen for progress and result
    cloneWorker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        const progress = e.data.progress;
        progressBar.style.width = progress + '%';
        progressText.textContent = `Analysing… ${progress}%`;
      } else if (e.data.type === 'result') {
        const matches = e.data.matches;
        progressWrap.style.display = 'none';
        analyseBtn.disabled = false;

        // Scale matches back if needed
        if (scale !== 1) {
          matches.forEach(m => {
            m.ax /= scale;
            m.ay /= scale;
            m.bx /= scale;
            m.by /= scale;
          });
        }

        renderCloneResults(matches, bitmap.width / scale, bitmap.height / scale);
      } else if (e.data.type === 'error') {
        progressWrap.style.display = 'none';
        analyseBtn.disabled = false;
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
  const canvas = document.getElementById('clone-canvas');
  const wrap = document.getElementById('clone-canvas-wrap');
  const resultText = document.getElementById('clone-result-text');

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(img.bitmap, 0, 0, width, height);

  // Draw matched regions
  const blockSize = 16;
  const colours = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'];

  matches.forEach((match, idx) => {
    const colour = colours[idx % colours.length];

    // Draw bounding boxes
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;

    ctx.strokeRect(match.ax, match.ay, blockSize, blockSize);
    ctx.strokeRect(match.bx, match.by, blockSize, blockSize);

    // Draw connecting line if > 50px apart
    const dx = match.bx - match.ax;
    const dy = match.by - match.ay;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 50) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(match.ax + blockSize / 2, match.ay + blockSize / 2);
      ctx.lineTo(match.bx + blockSize / 2, match.by + blockSize / 2);
      ctx.stroke();
    }
  });

  ctx.globalAlpha = 1;

  wrap.style.display = 'block';
  resultText.textContent = `Matched regions: ${matches.length}`;

  // Store for report
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
