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
