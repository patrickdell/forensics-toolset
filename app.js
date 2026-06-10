/**
 * app.js — Forensics Toolset orchestration
 */

import { initMetadata } from './metadata.js';
import { initELA }      from './ela.js';
import { initClone }    from './clone.js';
import { initStrip }    from './strip.js';
import { initNoise }    from './noise.js';
import { initShadow }     from './shadow.js';
import { initWatermark }  from './watermark.js';
import { setupDropzone } from './utils.js';

// ── Shared image state ────────────────────────────────────────────────────────
export const img = {
  file: null, arrayBuffer: null, bitmap: null,
  name: null, type: null, isJpeg: false,
};

export const results = {
  meta: null, ela: null, noise: null, clone: null, strip: null, watermark: null,
};

// ── ExifReader cache (avoid parsing arrayBuffer twice per image) ──────────────
/* global ExifReader */
let _exifCache = null;
export function getExifData() {
  if (!_exifCache) {
    _exifCache = ExifReader.load(img.arrayBuffer, { expanded: true })
      .then(d => d || {})
      .catch(() => ({}));
  }
  return _exifCache;
}

// ── Panel routing ─────────────────────────────────────────────────────────────
const panels = {
  meta:     'panel-meta',
  ela:      'panel-ela',
  clone:    'panel-clone',
  strip:    'panel-strip',
  noise:    'panel-noise',
  shadow:      'panel-shadow',
  watermark:   'panel-watermark',
  synthid:     'panel-synthid',
  weather:     'panel-weather',
  suncalc:     'panel-suncalc',
};

function setActivePanel(tabName) {
  if (!panels[tabName]) return;
  Object.values(panels).forEach(id => {
    document.getElementById(id)?.classList.remove('visible');
  });
  document.getElementById(panels[tabName])?.classList.add('visible');
  document.querySelectorAll('.tab-btn, .nav-drawer-item[data-tab]').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    if (btn.hasAttribute('aria-selected')) btn.setAttribute('aria-selected', String(isActive));
  });
  history.replaceState(null, '', '#' + tabName);
  localStorage.setItem('fts_tab', tabName);
  // Close drawer after it's initialized (see below)
  if (typeof closeDrawer === 'function') closeDrawer();
}

// Restore tab from hash or localStorage
const hash = location.hash.replace('#', '');
const savedTab = (hash && panels[hash]) ? hash : (localStorage.getItem('fts_tab') || 'meta');

document.querySelectorAll('.tab-btn[data-tab], .nav-drawer-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => setActivePanel(btn.dataset.tab));
});

// Permalink links — copy full URL to clipboard on click
document.addEventListener('click', e => {
  const link = e.target.closest('[data-permalink]');
  if (!link) return;
  e.preventDefault();
  const url = location.origin + location.pathname + '#' + link.dataset.permalink;
  navigator.clipboard?.writeText(url).catch(() => {});
  const orig = link.textContent;
  link.textContent = '✓ Copied link!';
  setTimeout(() => { link.textContent = orig; }, 2000);
});

// ── Image loading ─────────────────────────────────────────────────────────────
async function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) return;

  _exifCache = null;   // invalidate ExifReader cache for new image
  img.file        = file;
  img.name        = file.name;
  img.type        = file.type;
  img.isJpeg      = file.type === 'image/jpeg';
  img.arrayBuffer = await file.arrayBuffer();

  try {
    img.bitmap = await createImageBitmap(file);
  } catch (e) {
    console.error('Failed to create bitmap:', e);
    return;
  }

  document.getElementById('fts-dropzone').style.display  = 'none';
  document.getElementById('fts-loaded-bar').style.display = 'flex';
  document.getElementById('fts-loaded-name').textContent  = img.name;
  document.getElementById('fts-loaded-dims').textContent  =
    `${img.bitmap.width} × ${img.bitmap.height}px · ${(img.file.size / 1024).toFixed(0)} KB`;

  document.dispatchEvent(new CustomEvent('fts:loaded', { detail: img }));
}

// Dropzone
setupDropzone(
  document.getElementById('fts-dropzone'),
  f => f.type.startsWith('image/'),
  loadImage
);

document.getElementById('fts-browse-btn').addEventListener('click', () => {
  document.getElementById('fts-file-input').click();
});
document.getElementById('fts-file-input').addEventListener('change', e => {
  if (e.target.files[0]) loadImage(e.target.files[0]);
});
document.getElementById('fts-load-new-btn').addEventListener('click', () => {
  document.getElementById('fts-file-input').click();
});

// ── Explanation toggles ───────────────────────────────────────────────────────
document.querySelectorAll('.tool-explain-toggle').forEach(btn => {
  const targetId = btn.dataset.target;
  const el = document.getElementById(targetId);
  if (!el) return;
  const key = `fts_explain_${targetId}`;
  const saved = localStorage.getItem(key);
  if (saved === 'open') el.style.display = 'block';

  btn.addEventListener('click', () => {
    const willOpen = el.style.display === 'none';
    el.style.display = willOpen ? 'block' : 'none';
    localStorage.setItem(key, willOpen ? 'open' : 'closed');
  });
});

// ── Mobile nav drawer ─────────────────────────────────────────────────────────
const drawer   = document.getElementById('nav-drawer');
const backdrop = document.getElementById('nav-backdrop');

function openDrawer() {
  drawer.classList.add('open');
  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('nav-hamburger').addEventListener('click', openDrawer);
document.getElementById('nav-drawer-close').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);

// Now that drawer is initialized, restore the saved tab
setActivePanel(savedTab);

// ── About modal ───────────────────────────────────────────────────────────────
const aboutModal = document.getElementById('about-modal');

function openAbout()  {
  aboutModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  closeDrawer();
}
function closeAbout() {
  aboutModal.style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('about-btn').addEventListener('click', openAbout);
document.getElementById('about-close-btn').addEventListener('click', closeAbout);
document.getElementById('about-backdrop').addEventListener('click', closeAbout);

document.querySelectorAll('[data-about]').forEach(btn => {
  btn.addEventListener('click', openAbout);
});

// ── Wizard mode ───────────────────────────────────────────────────────────────
const wizardOverlay  = document.getElementById('wizard-overlay');
const wizardStepLabel = document.getElementById('wizard-step-label');
const wizardStepTitle = document.getElementById('wizard-step-title');
const wizardDots     = document.getElementById('wizard-dots');

const wizardSteps = [
  { key: 'meta',      title: 'Metadata' },
  { key: 'ela',       title: 'ELA' },
  { key: 'clone',     title: 'Clone Detection' },
  { key: 'watermark', title: 'AI Watermarks' },
];
let wizardStep = 0;

function updateWizardUI() {
  const step = wizardSteps[wizardStep];
  wizardStepLabel.textContent = `Step ${wizardStep + 1} of ${wizardSteps.length}`;
  wizardStepTitle.textContent = step.title;

  // Update dots
  document.querySelectorAll('.wizard-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === wizardStep);
    dot.classList.toggle('done', i < wizardStep);
  });

  // Show correct panel
  setActivePanel(step.key);

  // Open explanations in wizard mode (they appear at the bottom via CSS order)
  const panel = document.getElementById(panels[step.key]);
  if (panel) {
    panel.querySelectorAll('.tool-explain').forEach(el => {
      el.style.display = 'block';
    });
  }

  // Auto-run analyses that require a button click
  if (step.key === 'clone') {
    setTimeout(() => {
      const btn = document.getElementById('clone-analyse-btn');
      if (btn && !btn.disabled) btn.click();
    }, 150);
  }

  const nextBtn = document.getElementById('wizard-next');
  const skipBtn = document.getElementById('wizard-skip');
  if (nextBtn) nextBtn.textContent = wizardStep === wizardSteps.length - 1 ? 'Done' : 'Continue →';
  if (skipBtn) skipBtn.style.display = wizardStep === wizardSteps.length - 1 ? 'none' : '';
}

function openWizard() {
  if (!img.file) {
    alert('Please load an image first.');
    return;
  }
  wizardStep = 0;
  wizardOverlay.style.display = 'block';
  document.body.classList.add('wizard-mode');
  updateWizardUI();
  closeDrawer();
}

function closeWizard() {
  wizardOverlay.style.display = 'none';
  document.body.classList.remove('wizard-mode');
}

document.getElementById('wizard-btn').addEventListener('click', openWizard);
document.getElementById('wizard-exit').addEventListener('click', closeWizard);
document.getElementById('nav-wizard-btn')?.addEventListener('click', openWizard);

function advanceWizard() {
  if (wizardStep < wizardSteps.length - 1) {
    wizardStep++;
    updateWizardUI();
  }
}

document.getElementById('wizard-next').addEventListener('click', () => {
  if (wizardStep < wizardSteps.length - 1) advanceWizard();
  else closeWizard();
});

document.getElementById('wizard-skip').addEventListener('click', advanceWizard);

// ── Global keyboard shortcuts ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (aboutModal.style.display !== 'none') closeAbout();
    else if (wizardOverlay.style.display !== 'none') closeWizard();
    else closeDrawer();
  }
});

// ── Init tools ────────────────────────────────────────────────────────────────
initMetadata();
initELA();
initClone();
initStrip();
initNoise();
initShadow();
initWatermark();
