/**
 * strip.js — Metadata stripping and privacy mode
 */

/* global piexif */
import { img, results } from './app.js';
import { saveFile } from './utils.js';

export function initStrip() {
  const qualitySlider = document.getElementById('strip-quality-slider');
  const qualityValue  = document.getElementById('strip-quality-value');

  // Wire persistent listeners once
  qualitySlider.addEventListener('input', (e) => {
    qualityValue.textContent = e.target.value;
  });

  document.getElementById('strip-export-btn').addEventListener('click', async () => {
    const mode    = document.querySelector('input[name="strip-mode"]:checked').value;
    const quality = parseInt(qualitySlider.value);
    await stripAndExport(mode, quality);
  });

  document.addEventListener('fts:loaded', setupStrip);
}

async function setupStrip() {
  const controlsEl  = document.getElementById('strip-controls');
  const statusEl    = document.getElementById('strip-status');
  const beforeAfter = document.getElementById('strip-before-after');

  controlsEl.style.display  = 'block';
  statusEl.style.display    = 'none';
  beforeAfter.style.display = 'block';

  document.getElementById('strip-before-count').textContent = '—';
  document.getElementById('strip-after-count').textContent  = '—';

  const errEl = document.getElementById('strip-error');
  if (errEl) errEl.remove();
}

async function stripAndExport(mode, quality) {
  try {
    // Step 1: Canvas re-encode strips all metadata
    const canvas = document.createElement('canvas');
    canvas.width  = img.bitmap.width;
    canvas.height = img.bitmap.height;
    canvas.getContext('2d').drawImage(img.bitmap, 0, 0);

    const stripBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality / 100);
    });

    let finalBlob = stripBlob;

    // Step 2: Re-inject requested metadata using piexifjs
    if (mode === 'keep-date' && results.meta && results.meta.fields) {
      const dateTimeOriginal = results.meta.fields['DateTimeOriginal'];
      if (dateTimeOriginal) {
        try { finalBlob = await reinjectMetadata(stripBlob, { DateTimeOriginal: dateTimeOriginal }); }
        catch (e) { console.warn('Could not re-inject date:', e); }
      }
    } else if (mode === 'keep-copyright' && results.meta && results.meta.fields) {
      const metadata = {};
      const f = results.meta.fields;
      if (f['Artist'])          metadata.Artist = f['Artist'];
      if (f['Copyright'])       metadata.Copyright = f['Copyright'];
      if (f['CopyrightNotice']) metadata.CopyrightNotice = f['CopyrightNotice'];
      if (Object.keys(metadata).length > 0) {
        try { finalBlob = await reinjectMetadata(stripBlob, metadata); }
        catch (e) { console.warn('Could not re-inject copyright:', e); }
      }
    }

    const filename = img.name.replace(/\.[^.]+$/, '.jpg');
    await saveFile(finalBlob, filename, 'image/jpeg');

    const beforeCount = results.meta && results.meta.fields
      ? Object.keys(results.meta.fields).length : '?';
    document.getElementById('strip-before-count').textContent = beforeCount;
    document.getElementById('strip-after-count').textContent  =
      mode === 'all' ? '0' : mode === 'keep-date' ? '1–2' : '3–5';

    results.strip = {
      mode, quality,
      beforeCount: results.meta ? Object.keys(results.meta.fields).length : 0,
      afterCount:  mode === 'all' ? 0 : (mode === 'keep-date' ? 2 : 5),
    };

  } catch (err) {
    showStripError('Error stripping metadata: ' + err.message);
  }
}

function showStripError(msg) {
  let errEl = document.getElementById('strip-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id        = 'strip-error';
    errEl.className = 'fts-warn';
    errEl.style.cssText = 'margin-top:0.75rem;padding:0.5rem 0.75rem;font-size:0.875rem;';
    document.getElementById('strip-controls').appendChild(errEl);
  }
  errEl.textContent = msg;
}

async function reinjectMetadata(blob, metadata) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
        const exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, 'Interop': {}, '1st': {} };

        function rawVal(v) {
          if (v == null) return null;
          return typeof v === 'object' ? (v.description ?? String(v)) : String(v);
        }

        if (metadata.DateTimeOriginal) {
          const v = rawVal(metadata.DateTimeOriginal);
          if (v) {
            exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = v;
            exifObj['0th'][piexif.ImageIFD.DateTime] = v;
          }
        }
        if (metadata.Artist) {
          const v = rawVal(metadata.Artist);
          if (v) exifObj['0th'][piexif.ImageIFD.Artist] = v;
        }
        if (metadata.Copyright) {
          const v = rawVal(metadata.Copyright);
          if (v) exifObj['0th'][piexif.ImageIFD.Copyright] = v;
        }

        const exifBytes  = piexif.dump(exifObj);
        const newDataUrl = piexif.insert(exifBytes, dataUrl);

        const byteStr = atob(newDataUrl.split(',')[1]);
        const bytes   = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        resolve(new Blob([bytes], { type: 'image/jpeg' }));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsDataURL(blob);
  });
}
