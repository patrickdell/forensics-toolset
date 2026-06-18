/**
 * redactor.js — Redaction Reversibility Checker
 * Detects blur, pixelation, and swirl artifacts that indicate redacted regions
 */

import { img, results } from './app.js';
import { setProgress } from './utils.js';

let detectionMode = 'blur'; // blur | pixelation | swirl

export function initRedactor() {
  // Wire mode toggles
  document.getElementById('redactor-mode-chips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const container = document.getElementById('redactor-mode-chips');
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      detectionMode = chip.dataset.mode;

      // Re-run analysis if image is loaded
      if (img.file) {
        runRedactorAnalysis();
      }
    });
  });

  document.addEventListener('fts:loaded', setupRedactor);
}

async function setupRedactor() {
  const controlsEl = document.getElementById('redactor-controls');
  const statusEl = document.getElementById('redactor-status');
  const canvasWrapEl = document.getElementById('redactor-canvas-wrap');

  if (!img.file) {
    controlsEl.style.display = 'none';
    canvasWrapEl.style.display = 'none';
    statusEl.style.display = 'block';
    return;
  }

  controlsEl.style.display = 'block';
  statusEl.style.display = 'none';
  canvasWrapEl.style.display = 'block';

  await runRedactorAnalysis();
}

async function runRedactorAnalysis() {
  const canvas = document.getElementById('redactor-canvas');
  const progressBar = document.getElementById('redactor-progress-bar');
  const progressLabel = document.getElementById('redactor-progress-label');

  if (!canvas || !img.bitmap) return;

  canvas.width = img.bitmap.width;
  canvas.height = img.bitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img.bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  setProgress(progressBar, progressLabel, 0, 'Scanning…');

  // Analyze each pixel block (16×16 stride)
  const blockSize = 16;
  const detectedRegions = [];
  const stride = 8; // Overlapping blocks for better coverage
  const suspiciousBlocks = [];

  const totalBlocks = Math.ceil((canvas.width - blockSize) / stride) *
                      Math.ceil((canvas.height - blockSize) / stride);
  let processedBlocks = 0;

  for (let y = 0; y < canvas.height - blockSize; y += stride) {
    for (let x = 0; x < canvas.width - blockSize; x += stride) {
      processedBlocks++;

      // Update progress periodically
      if (processedBlocks % 100 === 0) {
        const pct = Math.min(95, Math.round((processedBlocks / totalBlocks) * 95));
        setProgress(progressBar, progressLabel, pct, 'Scanning…');
      }

      const blockData = ctx.getImageData(x, y, blockSize, blockSize).data;
      const score = analyzeBlock(blockData, detectionMode);

      if (score > 0.6) {
        suspiciousBlocks.push({ x, y, score, blockSize });
      }
    }
  }

  // Cluster nearby blocks to find redacted regions
  const regions = clusterBlocks(suspiciousBlocks, canvas.width, canvas.height);

  // Draw heatmap
  const heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.width = canvas.width;
  heatmapCanvas.height = canvas.height;
  const heatCtx = heatmapCanvas.getContext('2d');

  // Draw original image
  heatCtx.drawImage(img.bitmap, 0, 0);

  // Overlay detection heatmap
  const heatmapData = heatCtx.createImageData(canvas.width, canvas.height);
  const heatData = heatmapData.data;

  // Draw redaction heatmap
  for (const block of suspiciousBlocks) {
    const intensity = Math.min(255, Math.round(block.score * 255));
    const color = scoreToColor(block.score);

    for (let py = block.y; py < block.y + block.blockSize; py++) {
      for (let px = block.x; px < block.x + block.blockSize; px++) {
        if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
          const idx = (py * canvas.width + px) * 4;
          heatData[idx] = color[0];
          heatData[idx + 1] = color[1];
          heatData[idx + 2] = color[2];
          heatData[idx + 3] = Math.round(intensity * 0.7); // 70% opacity
        }
      }
    }
  }

  heatCtx.putImageData(heatmapData, 0, 0);

  // Draw region bounding boxes
  heatCtx.strokeStyle = '#ff5f5f';
  heatCtx.lineWidth = 2;
  for (const region of regions) {
    heatCtx.strokeRect(region.x, region.y, region.width, region.height);
  }

  // Display result on main canvas
  ctx.drawImage(heatmapCanvas, 0, 0);

  setProgress(progressBar, progressLabel, 100, 'Complete');

  // Store results
  results.redactor = {
    canvas: canvas.toDataURL(),
    mode: detectionMode,
    detectedRegions: regions,
    suspiciousBlockCount: suspiciousBlocks.length,
    totalArea: regions.reduce((sum, r) => sum + (r.width * r.height), 0)
  };

  document.dispatchEvent(new CustomEvent('fts:redactor:complete'));

  // Update UI
  document.getElementById('redactor-count').textContent = regions.length;
  const detailsList = document.getElementById('redactor-details');
  detailsList.innerHTML = '';

  if (regions.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'padding:8px;color:var(--muted);font-size:12px;';
    none.textContent   = 'No candidate regions detected.';
    detailsList.appendChild(none);
  } else {
    regions.slice(0, 10).forEach((region, idx) => {
      const item  = document.createElement('div');
      item.className = 'redactor-region-item';

      const info  = document.createElement('div');
      info.className = 'redactor-region-info';

      const label = document.createElement('span');
      label.className = 'redactor-region-label';
      label.textContent = `Region ${idx + 1}`;

      const size  = document.createElement('span');
      size.className = 'redactor-region-size';
      size.textContent = `${Math.round(region.width)} × ${Math.round(region.height)}px`;

      const score = document.createElement('span');
      score.className = 'redactor-region-score';
      score.textContent = `${Math.round(region.avgScore * 100)}% score`;

      info.appendChild(label);
      info.appendChild(size);
      info.appendChild(score);
      item.appendChild(info);
      detailsList.appendChild(item);
    });
  }
}

function analyzeBlock(blockData, mode) {
  if (mode === 'blur') {
    return analyzeBlur(blockData);
  } else if (mode === 'pixelation') {
    return analyzePixelation(blockData);
  } else if (mode === 'swirl') {
    return analyzeSwirl(blockData);
  }
  return 0;
}

function analyzeBlur(blockData) {
  // Blur detection: low frequency content, smooth gradients
  // Check for lack of high-frequency detail
  let variance = 0;
  let mean = 0;

  for (let i = 0; i < blockData.length; i += 4) {
    const intensity = (blockData[i] + blockData[i + 1] + blockData[i + 2]) / 3;
    mean += intensity;
  }
  mean /= (blockData.length / 4);

  for (let i = 0; i < blockData.length; i += 4) {
    const intensity = (blockData[i] + blockData[i + 1] + blockData[i + 2]) / 3;
    variance += Math.pow(intensity - mean, 2);
  }
  variance /= (blockData.length / 4);

  // Low variance = blur
  // Normalize to 0-1 range (empirically calibrated)
  const blurScore = Math.max(0, 1 - (Math.sqrt(variance) / 50));
  return blurScore;
}

function analyzePixelation(blockData) {
  // Pixelation detection: sharp color boundaries, reduced unique colors
  const colorSet = new Set();

  for (let i = 0; i < blockData.length; i += 4) {
    const r = blockData[i];
    const g = blockData[i + 1];
    const b = blockData[i + 2];
    colorSet.add(`${r},${g},${b}`);
  }

  // Pixelated regions have fewer unique colors
  const pixelCount = blockData.length / 4;
  const uniqueRatio = colorSet.size / pixelCount;

  // Low unique color ratio = pixelation
  const pixelationScore = Math.max(0, 1 - (uniqueRatio * 5));
  return pixelationScore;
}

function analyzeSwirl(blockData) {
  // Swirl detection: rotational artifact patterns
  // Simplified: detect unusual gradient directions
  let gradientVariance = 0;
  let gradientCount = 0;

  for (let i = 4; i < blockData.length - 4; i += 4) {
    const curr = (blockData[i] + blockData[i + 1] + blockData[i + 2]) / 3;
    const prev = (blockData[i - 4] + blockData[i - 3] + blockData[i - 2]) / 3;
    const next = (blockData[i + 4] + blockData[i + 5] + blockData[i + 6]) / 3;

    const grad = Math.abs(next - prev);
    gradientVariance += grad;
    gradientCount++;
  }

  const avgGradient = gradientCount > 0 ? gradientVariance / gradientCount : 0;

  // Swirl creates unusual gradient patterns
  const swirlScore = Math.min(1, avgGradient / 50);
  return swirlScore;
}

function clusterBlocks(blocks, width, height) {
  if (blocks.length === 0) return [];

  const clusters = [];
  const used = new Set();  // set of block object references — O(1) lookup

  for (const block of blocks) {
    if (used.has(block)) continue;

    const cluster = [block];
    used.add(block);

    for (const other of blocks) {
      if (used.has(other)) continue;

      const dist = Math.hypot(block.x - other.x, block.y - other.y);
      if (dist < 32) {
        cluster.push(other);
        used.add(other);
      }
    }

    // Create bounding box for cluster
    const xs = cluster.map(b => b.x);
    const ys = cluster.map(b => b.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const right = Math.max(...xs.map(bx => bx + 16));
    const bottom = Math.max(...ys.map(by => by + 16));

    const avgScore = cluster.reduce((sum, b) => sum + b.score, 0) / cluster.length;

    clusters.push({
      x, y,
      width: right - x,
      height: bottom - y,
      avgScore,
      blockCount: cluster.length
    });
  }

  return clusters;
}

function scoreToColor(score) {
  // Blue (low) → Green → Yellow → Red (high)
  if (score < 0.33) {
    return [0, 100, 255]; // Blue
  } else if (score < 0.66) {
    return [62, 207, 142]; // Green
  } else {
    return [255, 95, 95]; // Red
  }
}
