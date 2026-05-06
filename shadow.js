/**
 * shadow.js — Shadow & light vector plotter
 * Interactive canvas tool for drawing and measuring light vectors
 */

import { img } from './app.js';

let isDrawing = false;
let startX, startY;
let vectors = [];
let selectedVector = null;

export function initShadow() {
  // Wire tool buttons once
  document.getElementById('shadow-clear-btn').addEventListener('click', clearVectors);
  document.getElementById('shadow-undo-btn').addEventListener('click', undoVector);
  document.getElementById('shadow-export-btn').addEventListener('click', exportShadowMap);

  // Wire mode toggles
  document.getElementById('shadow-mode-chips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const container = document.getElementById('shadow-mode-chips');
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  document.addEventListener('fts:loaded', setupShadow);
}

async function setupShadow() {
  const controlsEl = document.getElementById('shadow-controls');
  const statusEl = document.getElementById('shadow-status');
  const canvasWrapEl = document.getElementById('shadow-canvas-wrap');

  if (!img.file) {
    controlsEl.style.display = 'none';
    canvasWrapEl.style.display = 'none';
    statusEl.style.display = 'block';
    return;
  }

  controlsEl.style.display = 'block';
  statusEl.style.display = 'none';

  // Initialize canvas
  const canvas = document.getElementById('shadow-canvas');
  canvas.width = img.bitmap.width;
  canvas.height = img.bitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img.bitmap, 0, 0);

  // Reset vectors
  vectors = [];
  selectedVector = null;
  canvasWrapEl.style.display = 'block';

  // Wire canvas events
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mouseup', onCanvasMouseUp);
  canvas.addEventListener('mouseleave', onCanvasMouseLeave);
}

function onCanvasMouseDown(e) {
  const canvas = document.getElementById('shadow-canvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  startX = (e.clientX - rect.left) * scaleX;
  startY = (e.clientY - rect.top) * scaleY;

  isDrawing = true;
}

function onCanvasMouseMove(e) {
  if (!isDrawing) return;

  const canvas = document.getElementById('shadow-canvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const currentX = (e.clientX - rect.left) * scaleX;
  const currentY = (e.clientY - rect.top) * scaleY;

  // Redraw canvas with preview
  redrawShadowCanvas();

  // Draw preview vector
  const ctx = canvas.getContext('2d');
  drawVector(ctx, startX, startY, currentX, currentY, '#4d9fff', true);
}

function onCanvasMouseUp(e) {
  if (!isDrawing) return;

  const canvas = document.getElementById('shadow-canvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const endX = (e.clientX - rect.left) * scaleX;
  const endY = (e.clientY - rect.top) * scaleY;

  // Only add if meaningful distance
  const dist = Math.hypot(endX - startX, endY - startY);
  if (dist > 10) {
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    vectors.push({ startX, startY, endX, endY, angle, distance: dist });
    updateVectorList();
  }

  isDrawing = false;
  redrawShadowCanvas();
}

function onCanvasMouseLeave() {
  if (isDrawing) {
    isDrawing = false;
    redrawShadowCanvas();
  }
}

function redrawShadowCanvas() {
  const canvas = document.getElementById('shadow-canvas');
  const ctx = canvas.getContext('2d');

  // Redraw original image
  ctx.drawImage(img.bitmap, 0, 0);

  // Redraw all vectors
  vectors.forEach((v, idx) => {
    const colour = selectedVector === idx ? '#ffaa00' : '#3ecf8e';
    drawVector(ctx, v.startX, v.startY, v.endX, v.endY, colour, false);
  });
}

function drawVector(ctx, x1, y1, x2, y2, colour, isPreview) {
  const lineWidth = isPreview ? 2 : 3;
  const arrowSize = 15;

  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = isPreview ? 0.6 : 0.8;

  // Draw line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - arrowSize * Math.cos(angle - Math.PI / 6), y2 - arrowSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - arrowSize * Math.cos(angle + Math.PI / 6), y2 - arrowSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  // Draw start dot
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x1, y1, 5, 0, Math.PI * 2);
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

    item.querySelector('.shadow-vector-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      vectors.splice(idx, 1);
      selectedVector = null;
      updateVectorList();
      redrawShadowCanvas();
    });

    listEl.appendChild(item);
  });

  // Update count
  document.getElementById('shadow-count').textContent = vectors.length;
}

function clearVectors() {
  if (confirm('Clear all vectors?')) {
    vectors = [];
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
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${img.name.replace(/\.[^.]+$/, '')}_shadow-vectors.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
