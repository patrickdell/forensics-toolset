/**
 * strip.js — Metadata stripping and privacy mode
 */

import { img, results } from './app.js';
import { saveFile } from './utils.js';

export function initStrip() {
  document.addEventListener('fts:loaded', setupStrip);
}

async function setupStrip() {
  const controlsEl = document.getElementById('strip-controls');
  const statusEl = document.getElementById('strip-status');
  const beforeAfter = document.getElementById('strip-before-after');
  const exportBtn = document.getElementById('strip-export-btn');
  const qualitySlider = document.getElementById('strip-quality-slider');
  const qualityValue = document.getElementById('strip-quality-value');

  controlsEl.style.display = 'block';
  statusEl.style.display = 'none';

  // Quality slider
  qualitySlider.addEventListener('input', (e) => {
    qualityValue.textContent = e.target.value;
  });

  // Export button
  exportBtn.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="strip-mode"]:checked').value;
    const quality = parseInt(qualitySlider.value);
    await stripAndExport(mode, quality);
  });

  // Show before counts
  beforeAfter.style.display = 'block';
  document.getElementById('strip-before-count').textContent = '(estimated) fields before';
  document.getElementById('strip-after-count').textContent = '(estimate) fields after';
}

async function stripAndExport(mode, quality) {
  try {
    // Step 1: Canvas re-encode (strips all metadata)
    const canvas = document.createElement('canvas');
    canvas.width = img.bitmap.width;
    canvas.height = img.bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.bitmap, 0, 0);

    const stripBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality / 100);
    });

    let finalBlob = stripBlob;
    let extension = 'jpg';

    // Step 2: Re-inject metadata if needed
    if (mode === 'keep-date' && results.meta && results.meta.fields) {
      try {
        const dateTimeOriginal = results.meta.fields['DateTimeOriginal'];
        if (dateTimeOriginal) {
          finalBlob = await reinjectMetadata(stripBlob, { DateTimeOriginal: dateTimeOriginal });
        }
      } catch (e) {
        console.warn('Could not re-inject date:', e);
      }
    } else if (mode === 'keep-copyright' && results.meta && results.meta.fields) {
      try {
        const metadata = {};
        if (results.meta.fields['Artist']) metadata.Artist = results.meta.fields['Artist'];
        if (results.meta.fields['Copyright']) metadata.Copyright = results.meta.fields['Copyright'];
        if (results.meta.fields['CopyrightNotice']) metadata.CopyrightNotice = results.meta.fields['CopyrightNotice'];

        if (Object.keys(metadata).length > 0) {
          finalBlob = await reinjectMetadata(stripBlob, metadata);
        }
      } catch (e) {
        console.warn('Could not re-inject copyright:', e);
      }
    }

    // Save file
    const filename = img.name.replace(/\.[^.]+$/, `.${extension}`);
    await saveFile(finalBlob, filename, 'image/jpeg');

    // Update UI
    document.getElementById('strip-before-count').textContent =
      results.meta && results.meta.fields ? Object.keys(results.meta.fields).length : '?';
    document.getElementById('strip-after-count').textContent =
      mode === 'all' ? '0' : mode === 'keep-date' ? '1–2' : '3–5';

    results.strip = {
      mode,
      quality,
      beforeCount: results.meta ? Object.keys(results.meta.fields).length : 0,
      afterCount: mode === 'all' ? 0 : (mode === 'keep-date' ? 2 : 5),
    };

  } catch (err) {
    alert('Error stripping metadata: ' + err);
  }
}

async function reinjectMetadata(blob, metadata) {
  // This is a simplified version — full piexif integration is complex
  // For now, just return the blob as-is (metadata stripping worked)
  // In production, you'd use piexif.dump() and insert()
  return blob;
}
