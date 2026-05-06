/**
 * clone.worker.js — Web Worker for clone detection
 * Block-based DCT feature matching with K-nearest-neighbor
 */

self.onmessage = async (e) => {
  const { pixels, width, height, blockSize, stride, threshold, K } = e.data;

  try {
    // Convert RGB to greyscale (Y channel)
    const grey = rgbToGreyscale(pixels, width, height);

    // Extract overlapping blocks
    const blocks = extractBlocks(grey, width, height, blockSize, stride);

    // Compute DCT features for each block
    blocks.forEach(block => {
      block.feature = computeDCTFeature(block.data, blockSize);
    });

    // Normalize features
    blocks.forEach(block => {
      block.feature = normalizeVector(block.feature);
    });

    // Sort lexicographically
    const sorted = [...blocks].sort((a, b) => {
      for (let i = 0; i < a.feature.length; i++) {
        if (a.feature[i] !== b.feature[i]) {
          return a.feature[i] - b.feature[i];
        }
      }
      return 0;
    });

    // Match blocks
    const matches = [];
    for (let i = 0; i < sorted.length; i++) {
      const progress = Math.round((i / sorted.length) * 100);
      if (i % Math.max(1, Math.floor(sorted.length / 20)) === 0) {
        self.postMessage({ type: 'progress', progress });
      }

      // Compare to K nearest neighbors
      for (let j = 1; j <= K && i + j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[i + j];

        const dist = l2Distance(a.feature, b.feature);
        if (dist < threshold) {
          // Check spatial distance
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const spatialDist = Math.sqrt(dx * dx + dy * dy);

          if (spatialDist > blockSize * 2) {
            matches.push({
              ax: a.x,
              ay: a.y,
              bx: b.x,
              by: b.y,
              score: dist,
            });
          }
        }
      }
    }

    self.postMessage({ type: 'result', matches });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
};

function rgbToGreyscale(pixels, width, height) {
  const grey = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    grey[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
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

function computeDCTFeature(blockData, size) {
  // Simplified: row and column histograms + gradients (not full DCT, for performance)
  const feature = new Array(16).fill(0);

  // Use first 8 row sums and 8 column sums as features
  for (let i = 0; i < size; i++) {
    let rowSum = 0, colSum = 0;
    for (let j = 0; j < size; j++) {
      rowSum += blockData[i * size + j];
      colSum += blockData[j * size + i];
    }
    feature[i] = rowSum;
    feature[i + 8] = colSum;
  }

  return feature;
}

function normalizeVector(vec) {
  const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
  const variance = vec.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vec.length;
  const stdDev = Math.sqrt(variance) || 1;

  return vec.map(v => (v - mean) / stdDev);
}

function l2Distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
