/**
 * pivot.js — Reverse image search pivot board
 * Generates one-click search links to multiple reverse image search engines
 */

import { img } from './app.js';

export function initPivot() {
  // Wire search buttons once
  document.getElementById('pivot-google-btn').addEventListener('click', () => {
    searchGoogle();
  });
  document.getElementById('pivot-tineye-btn').addEventListener('click', () => {
    searchTinEye();
  });
  document.getElementById('pivot-yandex-btn').addEventListener('click', () => {
    searchYandex();
  });
  document.getElementById('pivot-baidu-btn').addEventListener('click', () => {
    searchBaidu();
  });

  document.addEventListener('fts:loaded', setupPivot);
}

async function setupPivot() {
  const controlsEl = document.getElementById('pivot-controls');
  const statusEl = document.getElementById('pivot-status');

  if (!img.file) {
    controlsEl.style.display = 'none';
    statusEl.style.display = 'block';
    return;
  }

  controlsEl.style.display = 'block';
  statusEl.style.display = 'none';
}

async function searchGoogle() {
  const blob = await getImageBlob();
  if (!blob) return;

  // Google Lens accepts image upload via blob in a form
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://www.google.com/searchbyimage/upload';
  form.target = '_blank';
  form.enctype = 'multipart/form-data';
  form.style.display = 'none';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'encoded_image';

  // Create a FileList-like object with the blob
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File([blob], img.name, { type: blob.type }));
  fileInput.files = dataTransfer.files;

  form.appendChild(fileInput);
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

async function searchTinEye() {
  const dataUrl = await getImageDataUrl();
  if (!dataUrl) return;

  // TinEye: open their search page and let user paste the data URL or upload manually
  // Note: TinEye's API is rate-limited and requires authentication for programmatic access
  window.open('https://tineye.com', '_blank');
}

async function searchYandex() {
  const dataUrl = await getImageDataUrl();
  if (!dataUrl) return;

  // Yandex accepts image URL as query param
  // Note: Data URLs may be too long; user may need to upload manually if this fails
  try {
    const encodedUrl = encodeURIComponent(dataUrl);
    window.open(
      `https://yandex.com/images/search?rpt=imageview&url=${encodedUrl}`,
      '_blank'
    );
  } catch {
    // Fallback: open Yandex main page for manual upload
    window.open('https://yandex.com/images', '_blank');
  }
}

async function searchBaidu() {
  const dataUrl = await getImageDataUrl();
  if (!dataUrl) return;

  // Baidu image search
  // Data URLs may be too long; this attempts to use them but may require manual upload
  try {
    const encodedUrl = encodeURIComponent(dataUrl);
    window.open(
      `https://image.baidu.com/search/index?tn=baiduimage&word=${encodedUrl}`,
      '_blank'
    );
  } catch {
    // Fallback: open Baidu main page for manual upload
    window.open('https://image.baidu.com/', '_blank');
  }
}

async function getImageBlob() {
  try {
    if (img.file.type === 'image/jpeg' || img.file.type === 'image/png') {
      return img.file;
    }

    // Convert to JPEG via canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.bitmap.width;
    canvas.height = img.bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.bitmap, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  } catch (err) {
    console.error('Error creating image blob:', err);
    return null;
  }
}

async function getImageDataUrl() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.bitmap.width;
    canvas.height = img.bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.bitmap, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.error('Error creating data URL:', err);
    return null;
  }
}
