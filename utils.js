/**
 * utils.js — shared utilities for Forensics Toolset
 */

/** Wire drag-and-drop + click-to-browse on a dropzone element. */
export function setupDropzone(el, filter, handler) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const f = [...e.dataTransfer.files].find(filter);
    if (f) handler(f);
  });
}

/** Set exactly one chip active inside a container. */
export function setActiveChip(container, activeBtn) {
  container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  activeBtn.classList.add('active');
}

/**
 * Save a Blob as a file.
 * Priority: showSaveFilePicker → Web Share (mobile) → <a download>
 */
export async function saveFile(blob, name, mime) {
  if (window.showSaveFilePicker) {
    try {
      const ext = name.split('.').pop();
      const fh  = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: mime, accept: { [mime]: ['.' + ext] } }],
      });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch { /* fall through */ }
  }
  if (navigator.canShare?.({ files: [new File([blob], name, { type: mime })] })) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: mime })] });
      return;
    } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Update a progress bar and optional label. pct = 0–100. */
export function setProgress(barEl, labelEl, pct, text) {
  barEl.style.width = Math.round(pct) + '%';
  if (labelEl && text !== undefined) labelEl.textContent = text;
}

/** Escape HTML special characters. */
const _escDiv = document.createElement('div');
export function escapeHtml(text) {
  _escDiv.textContent = text;
  return _escDiv.innerHTML;
}

/** Format bytes to human-readable string. */
export function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/** Compute SHA-256 of an ArrayBuffer, return hex string. */
export async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Returns a debounced version of fn — delays execution until ms have passed since the last call. */
export function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Flatten ExifReader's expanded-mode output into a dot-path key/value map.
 *
 * ExifReader's `expanded:true` tags are wrapped as {id, value, description} (EXIF/IPTC)
 * or {value, attributes, description} (XMP) — a node is a leaf tag once it has a `value`
 * key, even though `value` itself can be 0 or "". Recursing past that point (the original
 * bug here) produces useless flattened keys like "exif.Make.value" / "exif.Make.description"
 * instead of "exif.Make". The precomputed `gps` group (Latitude/Longitude/Altitude) holds
 * plain numbers, not wrapped tags, and falls through to the leaf branch unchanged.
 */
export function flattenExif(exifData) {
  const flat = {};

  function walk(obj, prefix) {
    Object.entries(obj || {}).forEach(([key, val]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Blob)) {
        if ('value' in val) {
          flat[fullKey] = val.description ?? val.value;
        } else {
          walk(val, fullKey);
        }
      } else if (val !== null && val !== undefined) {
        flat[fullKey] = val;
      }
    });
  }

  walk(exifData, '');
  return flat;
}

/**
 * False-colour heatmap lookup: blue (low) → green → yellow → red (high).
 * intensity: 0–255. Returns [r, g, b].
 */
export function falseColorLUT(intensity) {
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
