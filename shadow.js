/**
 * shadow.js — Shadow & light vector plotter
 * Interactive canvas tool for drawing and measuring light vectors
 */

import { img } from './app.js';
import { setActiveChip } from './utils.js';

let isDrawing = false;
let startX, startY;
let vectors = [];
let selectedVector = null;

let currentColour = '#ffff50';
let currentSize   = 4;

export function initShadow() {
  document.getElementById('shadow-clear-btn').addEventListener('click', clearVectors);
  document.getElementById('shadow-undo-btn').addEventListener('click', undoVector);
  document.getElementById('shadow-export-btn').addEventListener('click', exportShadowMap);

  const colourChips = document.getElementById('shadow-colour-chips');
  colourChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveChip(colourChips, chip);
      currentColour = chip.dataset.colour;
    });
  });

  const sizeChips = document.getElementById('shadow-size-chips');
  sizeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveChip(sizeChips, chip);
      currentSize = parseInt(chip.dataset.size, 10);
    });
  });

  const canvas = document.getElementById('shadow-canvas');
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mouseup', onCanvasMouseUp);
  canvas.addEventListener('mouseleave', onCanvasMouseLeave);

  document.addEventListener('fts:loaded', setupShadow);
}

async function setupShadow() {
  const controlsEl    = document.getElementById('shadow-controls');
  const statusEl      = document.getElementById('shadow-status');
  const canvasWrapEl  = document.getElementById('shadow-canvas-wrap');
  const vectorSection = document.getElementById('shadow-vector-section');

  if (!img.file) {
    controlsEl.style.display    = 'none';
    canvasWrapEl.style.display  = 'none';
    vectorSection.style.display = 'none';
    statusEl.style.display      = 'block';
    return;
  }

  controlsEl.style.display    = 'block';
  canvasWrapEl.style.display  = 'block';
  vectorSection.style.display = 'block';
  statusEl.style.display      = 'none';

  const canvas  = document.getElementById('shadow-canvas');
  canvas.width  = img.bitmap.width;
  canvas.height = img.bitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img.bitmap, 0, 0);

  vectors        = [];
  selectedVector = null;
  updateVectorList();
}

function onCanvasMouseDown(e) {
  if (!img.bitmap) return;
  const { x, y } = canvasCoords(e);
  startX    = x;
  startY    = y;
  isDrawing = true;
}

function onCanvasMouseMove(e) {
  if (!img.bitmap || !isDrawing) return;
  const { x, y } = canvasCoords(e);
  redrawShadowCanvas();
  const ctx = document.getElementById('shadow-canvas').getContext('2d');
  drawVector(ctx, startX, startY, x, y, currentColour, currentSize, true);
}

function onCanvasMouseUp(e) {
  if (!img.bitmap || !isDrawing) return;
  const { x, y } = canvasCoords(e);
  const dist = Math.hypot(x - startX, y - startY);
  if (dist > 10) {
    const angle = Math.atan2(y - startY, x - startX) * (180 / Math.PI);
    vectors.push({ startX, startY, endX: x, endY: y, angle, distance: dist,
                   colour: currentColour, size: currentSize });
    updateVectorList();
  }
  isDrawing = false;
  redrawShadowCanvas();
}

function onCanvasMouseLeave() {
  if (!img.bitmap) return;
  if (isDrawing) {
    isDrawing = false;
    redrawShadowCanvas();
  }
}

function canvasCoords(e) {
  const canvas = document.getElementById('shadow-canvas');
  const rect   = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

function redrawShadowCanvas() {
  const canvas = document.getElementById('shadow-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(img.bitmap, 0, 0);
  vectors.forEach((v, idx) => {
    const colour = selectedVector === idx ? '#ffaa00' : v.colour;
    drawVector(ctx, v.startX, v.startY, v.endX, v.endY, colour, v.size, false);
  });
}

function drawVector(ctx, x1, y1, x2, y2, colour, lineWidth, isPreview) {
  const arrowSize = Math.max(12, lineWidth * 3.5);
  const dotRadius = Math.max(4, lineWidth * 1.2);

  ctx.strokeStyle = colour;
  ctx.fillStyle   = colour;
  ctx.lineWidth   = lineWidth;
  ctx.globalAlpha = isPreview ? 0.6 : 0.85;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - arrowSize * Math.cos(angle - Math.PI / 6),
             y2 - arrowSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - arrowSize * Math.cos(angle + Math.PI / 6),
             y2 - arrowSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x1, y1, dotRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function updateVectorList() {
  const listEl = document.getElementById('shadow-vector-list');
  listEl.innerHTML = '';

  vectors.forEach((v, idx) => {
    const item = document.createElement('div');
    item.className = 'shadow-vector-item';
    if (selectedVector === idx) item.classList.add('selected');

    const angle = v.angle < 0 ? v.angle + 360 : v.angle;
    item.innerHTML = `
      <div class="shadow-vector-info">
        <span class="shadow-vector-swatch" style="background:${v.colour}"></span>
        <span class="shadow-vector-label">Vector ${idx + 1}</span>
        <span class="shadow-vector-angle">${angle.toFixed(1)}°</span>
        <span class="shadow-vector-distance">${Math.round(v.distance)}px</span>
      </div>
      <button class="shadow-vector-delete" data-index="${idx}">Delete</button>
    `;

    item.addEventListener('click', () => {
      selectedVector = selectedVector === idx ? null : idx;
      updateVectorList();
      redrawShadowCanvas();
    });

    item.querySelector('.shadow-vector-delete').addEventListener('click', e => {
      e.stopPropagation();
      vectors.splice(idx, 1);
      selectedVector = null;
      updateVectorList();
      redrawShadowCanvas();
    });

    listEl.appendChild(item);
  });

  document.getElementById('shadow-count').textContent = vectors.length;
}

function clearVectors() {
  if (vectors.length === 0) return;
  if (confirm('Clear all vectors?')) {
    vectors        = [];
    selectedVector = null;
    updateVectorList();
    redrawShadowCanvas();
  }
}

function undoVector() {
  if (vectors.length > 0) {
    vectors.pop();
    selectedVector = null;
    updateVectorList();
    redrawShadowCanvas();
  }
}

async function exportShadowMap() {
  const canvas = document.getElementById('shadow-canvas');
  const blob   = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${img.name.replace(/\.[^.]+$/, '')}_shadow-vectors.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
