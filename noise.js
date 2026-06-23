/**
 * noise.js — Noise residual analyzer
 * Detects compression artifacts and noise via median filter comparison
 */

import { img, results } from './app.js';
import { setProgress, debounce, setActiveChip, falseColorLUT } from './utils.js';

let noiseAmplification = 3;

const _debouncedRunNoise = debounce(() => runNoiseAnalysis(), 200);

export function initNoise() {
  // Wire amplification chips once
  document.getElementById('noise-amp-chips').querySelectorAll('.chip').forEach(chip => {
    const amp = parseInt(chip.dataset.amp);
    chip.classList.toggle('active', amp === noiseAmplification);
    chip.addEventListener('click', () => {
      noiseAmplification = amp;
      setActiveChip(document.getElementById('noise-amp-chips'), chip);
      _debouncedRunNoise();
    });
  });

  document.addEventListener('fts:loaded', setupNoise);
}

async function setupNoise() {
  const controlsEl = document.getElementById('noise-controls');
  const statusEl = document.getElementById('noise-status');
  const canvasWrapEl = document.getElementById('noise-canvas-wrap');

  if (!img.file) {
    controlsEl.style.display = 'none';
    canvasWrapEl.style.display = 'none';
    statusEl.style.display = 'block';
    return;
  }

  controlsEl.style.display = 'block';
  statusEl.style.display = 'none';

  // Auto-run analysis
  await runNoiseAnalysis();
}

async function runNoiseAnalysis() {
  const canvas = document.getElementById('noise-canvas');
  const canvasWrapEl = document.getElementById('noise-canvas-wrap');
  const progressWrap = document.getElementById('noise-progress-wrap');
  const progressBar = document.getElementById('noise-progress-bar');
  const progressText = document.getElementById('noise-progress-text');

  progressWrap.style.display = 'block';
  canvasWrapEl.style.display = 'none';

  try {
    const width = img.bitmap.width;
    const height = img.bitmap.height;

    // Draw image to canvas
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
    tmpCtx.drawImage(img.bitmap, 0, 0);

    const imageData = tmpCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert to greyscale for analysis
    const grey = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      grey[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Compute noise residuals via median filter
    const residuals = new Uint8ClampedArray(width * height);
    const kernel = 3; // 3x3 median filter
    const half = Math.floor(kernel / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Collect neighbourhood
        const neighbours = [];
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const ny = Math.max(0, Math.min(height - 1, y + dy));
            const nx = Math.max(0, Math.min(width - 1, x + dx));
            neighbours.push(grey[ny * width + nx]);
          }
        }

        // Compute median
        neighbours.sort((a, b) => a - b);
        const median = neighbours[Math.floor(neighbours.length / 2)];
        const pixel = grey[y * width + x];
        const residual = Math.abs(pixel - median);

        residuals[y * width + x] = residual;
      }

      // Update progress
      const pct = Math.round((y / height) * 100);
      setProgress(progressBar, progressText, pct, `Analysing… ${pct}%`);
    }

    // Draw original onto main canvas first
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.bitmap, 0, 0);

    // Build heatmap on a separate offscreen canvas so compositing works correctly.
    // putImageData ignores globalAlpha and replaces pixels entirely, so we must
    // drawImage the offscreen canvas onto the main one to get proper alpha blending.
    const heatCanvas = document.createElement('canvas');
    heatCanvas.width  = width;
    heatCanvas.height = height;
    const heatCtx    = heatCanvas.getContext('2d');
    const heatmapData = heatCtx.createImageData(width, height);
    const hdata       = heatmapData.data;

    for (let i = 0; i < residuals.length; i++) {
      const residual  = residuals[i];
      const amplified = Math.min(255, residual * noiseAmplification);
      const [r, g, b] = falseColorLUT(amplified);

      const idx     = i * 4;
      hdata[idx]     = r;
      hdata[idx + 1] = g;
      hdata[idx + 2] = b;
      hdata[idx + 3] = Math.round(amplified / 2);  // semi-transparent overlay
    }

    heatCtx.putImageData(heatmapData, 0, 0);
    // Composite heatmap over original using alpha blending via drawImage
    ctx.drawImage(heatCanvas, 0, 0);
    setProgress(progressBar, progressText, 100, 'Done');

    // Store result
    let maxResidual = 0;
    for (let i = 0; i < residuals.length; i++) {
      if (residuals[i] > maxResidual) maxResidual = residuals[i];
    }

    results.noise = {
      canvas: canvas.toDataURL(),
      amplification: noiseAmplification,
      maxResidual,
    };

    // Dispatch completion event for report
    document.dispatchEvent(new CustomEvent('fts:noise:complete'));

    progressWrap.style.display = 'none';
    canvasWrapEl.style.display = 'block';
  } catch (err) {
    console.error('Noise analysis error:', err);
    progressWrap.style.display = 'none';
    const errEl = document.createElement('div');
    errEl.className = 'fts-warn';
    errEl.style.cssText = 'margin:0.75rem 0;padding:0.5rem 0.75rem;font-size:0.875rem;';
    errEl.textContent = 'Error analysing noise: ' + err.message;
    document.getElementById('noise-controls').appendChild(errEl);
  }
}
