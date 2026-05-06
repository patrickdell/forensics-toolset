/**
 * clone.worker.js — Web Worker for clone detection
 * Block-based feature matching with K-nearest-neighbor
 */

const MIN_BLOCK_VARIANCE = 80;  // skip smooth/uniform blocks (sky, walls, solid colour)
const MAX_MATCHES        = 60;  // cap displayed matches to avoid visual noise

self.onmessage = async (e) => {
  const { pixels, width, height, blockSize, stride, threshold, K } = e.data;

  try {
    const grey = rgbToGreyscale(pixels, width, height);
    const allBlocks = extractBlocks(grey, width, height, blockSize, stride);

    // Filter out low-variance (featureless) blocks before matching
    const blocks = allBlocks.filter(b => blockVariance(b.data, blockSize) >= MIN_BLOCK_VARIANCE);

    blocks.forEach(block => {
      block.feature = computeFeature(block.data, blockSize);
    });
    blocks.forEach(block => {
      block.feature = normalizeVector(block.feature);
    });

    // Lexicographic sort
    const sorted = [...blocks].sort((a, b) => {
      for (let i = 0; i < a.feature.length; i++) {
        if (a.feature[i] !== b.feature[i]) return a.feature[i] - b.feature[i];
      }
      return 0;
    });

    const matches = [];
    const minSpatial = blockSize * 4; // require blocks to be well-separated

    for (let i = 0; i < sorted.length; i++) {
      if (i % Math.max(1, Math.floor(sorted.length / 20)) === 0) {
        self.postMessage({ type: 'progress', progress: Math.round((i / sorted.length) * 100) });
      }

      for (let j = 1; j <= K && i + j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[i + j];
        const dist = l2Distance(a.feature, b.feature);

        if (dist < threshold) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.sqrt(dx * dx + dy * dy) >= minSpatial) {
            matches.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, score: dist });
          }
        }
      }
    }

    // Sort by score (most similar first) and cap results
    matches.sort((a, b) => a.score - b.score);
    const trimmed = matches.slice(0, MAX_MATCHES);

    self.postMessage({ type: 'result', matches: trimmed });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
};

function rgbToGreyscale(pixels, width, height) {
  const grey = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    grey[j] = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }
  return grey;
}

function extractBlocks(grey, width, height, blockSize, stride) {
  const blocks = [];
  for (let y = 0; y <= height - blockSize; y += stride) {
    for (let x = 0; x <= width - blockSize; x += stride) {
      const data = new Uint8Array(blockSize * blockSize);
      for (let by = 0; by < blockSize; by++) {
        for (let bx = 0; bx < blockSize; bx++) {
          data[by * blockSize + bx] = grey[(y + by) * width + (x + bx)];
        }
      }
      blocks.push({ x, y, data });
    }
  }
  return blocks;
}

function blockVariance(data, size) {
  const n = size * size;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  return data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
}

function computeFeature(blockData, size) {
  // Row sums + column sums + horizontal/vertical gradient energy
  const feature = new Array(20).fill(0);
  for (let i = 0; i < size; i++) {
    let rowSum = 0, colSum = 0, rowGrad = 0, colGrad = 0;
    for (let j = 0; j < size; j++) {
      rowSum  += blockData[i * size + j];
      colSum  += blockData[j * size + i];
      if (j < size - 1) {
        rowGrad += Math.abs(blockData[i * size + j + 1] - blockData[i * size + j]);
        colGrad += Math.abs(blockData[(j + 1) * size + i] - blockData[j * size + i]);
      }
    }
    if (i < 8) {
      feature[i]     = rowSum;
      feature[i + 8] = colSum;
    }
    if (i < 2) {
      feature[16 + i * 2]     = rowGrad;
      feature[16 + i * 2 + 1] = colGrad;
    }
  }
  return feature;
}

function normalizeVector(vec) {
  const mean   = vec.reduce((a, b) => a + b, 0) / vec.length;
  const stdDev = Math.sqrt(vec.reduce((s, v) => s + (v - mean) ** 2, 0) / vec.length) || 1;
  return vec.map(v => (v - mean) / stdDev);
}

function l2Distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
