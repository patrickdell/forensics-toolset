/**
 * app.js — Forensics Toolset orchestration
 * Handles image load, shared state, tab routing, wizard mode, about modal
 */

import { initMetadata } from './metadata.js';
import { initELA } from './ela.js';
import { initClone } from './clone.js';
import { initStrip } from './strip.js';
import { initReport } from './report.js';
import { setupDropzone } from './utils.js';

// ============================================================================
// Shared image state
// ============================================================================
export const img = {
  file: null,
  arrayBuffer: null,
  bitmap: null,
  name: null,
  type: null,
  isJpeg: false,
};

export const results = {
  meta: null,
  ela: null,
  clone: null,
  strip: null,
};

// ============================================================================
// Panel routing
// ============================================================================
const panels = {
  meta: 'panel-meta',
  ela: 'panel-ela',
  clone: 'panel-clone',
  strip: 'panel-strip',
  report: 'panel-report',
};

const panelOrder = ['meta', 'ela', 'clone', 'strip', 'report'];

function setActivePanel(tabName) {
  Object.values(panels).forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
  if (panels[tabName]) {
    document.getElementById(panels[tabName]).classList.add('visible');
    localStorage.setItem('fts_tab', tabName);
  }
}

// ============================================================================
// Image loading
// ============================================================================
async function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) return;

  img.file = file;
  img.name = file.name;
  img.type = file.type;
  img.isJpeg = file.type === 'image/jpeg';
  img.arrayBuffer = await file.arrayBuffer();

  try {
    img.bitmap = await createImageBitmap(file);
  } catch (e) {
    console.error('Failed to create bitmap:', e);
    return;
  }

  // Update UI
  const dropzone = document.getElementById('fts-dropzone');
  const loadedBar = document.getElementById('fts-loaded-bar');
  const panelsContainer = document.getElementById('panels-container');

  dropzone.style.display = 'none';
  loadedBar.style.display = 'block';
  panelsContainer.style.display = 'block';

  document.getElementById('fts-loaded-name').textContent = img.name;
  document.getElementById('fts-loaded-dims').textContent =
    `${img.bitmap.width} × ${img.bitmap.height}px`;

  // Enable all panels
  Object.values(panels).forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('disabled');
  });

  // Dispatch event for tool modules
  document.dispatchEvent(new CustomEvent('fts:loaded', { detail: img }));
}

// Setup dropzone
setupDropzone(
  document.getElementById('fts-dropzone'),
  (file) => file.type.startsWith('image/'),
  loadImage
);

// Browse button
document.getElementById('fts-browse-btn').addEventListener('click', () => {
  document.getElementById('fts-file-input').click();
});

document.getElementById('fts-file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadImage(e.target.files[0]);
});

// Load different image
document.getElementById('fts-load-new-btn').addEventListener('click', () => {
  document.getElementById('fts-file-input').click();
});

// ============================================================================
// Tab routing
// ============================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    setActivePanel(tabName);
  });
});

document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    if (tabName) setActivePanel(tabName);
    closeDrawer();
  });
});

// Restore saved tab on page load
const savedTab = localStorage.getItem('fts_tab') || 'meta';
setActivePanel(savedTab);

// ============================================================================
// Explanation toggles
// ============================================================================
document.querySelectorAll('.tool-explain-toggle').forEach(btn => {
  const target = btn.dataset.target;
  const el = document.getElementById(target);
  const key = `fts_explain_${target}`;

  // Default: open in wizard mode, closed in tab mode
  const isOpen = localStorage.getItem(key) !== 'closed';
  if (isOpen) el.style.display = 'block';

  btn.addEventListener('click', () => {
    const willOpen = el.style.display === 'none';
    el.style.display = willOpen ? 'block' : 'none';
    localStorage.setItem(key, willOpen ? 'open' : 'closed');
  });
});

// ============================================================================
// Mobile nav drawer
// ============================================================================
const drawer = document.getElementById('nav-drawer');
const hamburger = document.getElementById('nav-hamburger');

function closeDrawer() {
  drawer.style.display = 'none';
}

hamburger.addEventListener('click', () => {
  drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', (e) => {
  if (drawer.style.display === 'block' && !drawer.contains(e.target) && !hamburger.contains(e.target)) {
    closeDrawer();
  }
});

// ============================================================================
// About modal
// ============================================================================
const aboutModal = document.getElementById('about-modal');
const aboutBtn = document.getElementById('about-btn');
const aboutCloseBtn = document.getElementById('about-close-btn');
const aboutBackdrop = document.getElementById('about-backdrop');

function openAbout() {
  aboutModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeAbout() {
  aboutModal.style.display = 'none';
  document.body.style.overflow = '';
}

aboutBtn.addEventListener('click', openAbout);
aboutCloseBtn.addEventListener('click', closeAbout);
aboutBackdrop.addEventListener('click', closeAbout);

document.querySelectorAll('[data-about]').forEach(btn => {
  btn.addEventListener('click', openAbout);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (aboutModal.style.display === 'block') closeAbout();
    if (wizardOverlay.style.display === 'block') closeWizard();
  }
});

// ============================================================================
// Wizard mode
// ============================================================================
const wizardBtn = document.getElementById('wizard-btn');
const wizardOverlay = document.getElementById('wizard-overlay');
const wizardBody = document.getElementById('wizard-body');
const wizardStepLabel = document.getElementById('wizard-step-label');
const wizardDots = document.getElementById('wizard-dots');
const wizardSkipBtn = document.getElementById('wizard-skip');
const wizardNextBtn = document.getElementById('wizard-next');
const wizardExitBtn = document.getElementById('wizard-exit');

let wizardStep = 0;
const wizardSteps = ['meta', 'ela', 'clone', 'report'];

function updateWizardUI() {
  const step = wizardSteps[wizardStep];
  wizardStepLabel.textContent = `Step ${wizardStep + 1} of ${wizardSteps.length}: ${
    { meta: 'Metadata', ela: 'ELA', clone: 'Clone Detection', report: 'Report' }[step]
  }`;

  // Update dots
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === wizardStep);
  });

  // Clone panel content into wizard body
  const panelId = panels[step];
  const panelEl = document.getElementById(panelId);
  const cloned = panelEl.cloneNode(true);
  cloned.id = '';
  cloned.classList.remove('visible');
  cloned.style.display = 'block';

  wizardBody.innerHTML = '';
  wizardBody.appendChild(cloned);

  // Open all explanations in wizard mode
  cloned.querySelectorAll('.tool-explain').forEach(el => {
    el.style.display = 'block';
  });

  // Reattach event listeners for explanation toggles
  cloned.querySelectorAll('.tool-explain-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const el = cloned.querySelector(`#${target}`);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // Update button labels
  wizardSkipBtn.style.display = wizardStep === wizardSteps.length - 1 ? 'none' : 'block';
  wizardNextBtn.textContent = wizardStep === wizardSteps.length - 1 ? 'Done' : 'Continue →';
}

function openWizard() {
  if (!img.file) {
    // No image loaded; show loader only
    alert('Please load an image first.');
    return;
  }
  wizardStep = 0;
  wizardOverlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
  updateWizardUI();
}

function closeWizard() {
  wizardOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

wizardBtn.addEventListener('click', openWizard);
wizardExitBtn.addEventListener('click', closeWizard);

wizardNextBtn.addEventListener('click', () => {
  if (wizardStep < wizardSteps.length - 1) {
    wizardStep++;
    updateWizardUI();
  } else {
    closeWizard();
  }
});

wizardSkipBtn.addEventListener('click', () => {
  wizardStep++;
  updateWizardUI();
});

// ============================================================================
// Initialize tool modules
// ============================================================================
initMetadata();
initELA();
initClone();
initStrip();
initReport();
