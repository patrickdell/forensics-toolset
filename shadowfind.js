/**
 * shadowfind.js — Shadow Finder
 * Plots possible locations on Earth where a shadow of the given proportions
 * could occur at a specific date and time (UTC).
 *
 * Algorithm ported from Bellingcat ShadowFinder by Galen Reich et al. (MIT)
 * https://github.com/bellingcat/ShadowFinder
 */

/* global SunCalc, topojson */

import { setActiveChip } from './utils.js';

const MAP_W    = 800;
const MAP_H    = 400;
const STEP_DEG = 1; // 1° grid → ~52 000 points, runs < 1 s in JS

let cachedLand = null;

export function initShadowFind() {
  const modeChips = document.getElementById('shadowfind-mode-chips');
  modeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveChip(modeChips, chip);
      showMode(chip.dataset.mode);
    });
  });

  document.getElementById('shadowfind-run-btn').addEventListener('click', runShadowFind);

  // Pre-fill with current UTC date and time
  const now = new Date();
  document.getElementById('shadowfind-date').value = now.toISOString().slice(0, 10);
  document.getElementById('shadowfind-time').value = now.toISOString().slice(11, 16);
}

function showMode(mode) {
  document.getElementById('shadowfind-lengths-group').style.display = mode === 'lengths' ? '' : 'none';
  document.getElementById('shadowfind-angle-group').style.display   = mode === 'angle'   ? '' : 'none';
}

async function fetchLand() {
  if (cachedLand) return cachedLand;
  const res  = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json');
  const topo = await res.json();
  cachedLand = topojson.feature(topo, topo.objects.land);
  return cachedLand;
}

function drawBaseMap(ctx, land) {
  ctx.fillStyle = '#080b12';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // topojson.feature may return a Feature or a FeatureCollection
  const features = land.type === 'FeatureCollection'
    ? land.features
    : [land];

  ctx.fillStyle   = '#1e2235';
  ctx.strokeStyle = '#2d3148';
  ctx.lineWidth   = 0.5;

  features.forEach(feature => {
    const geom  = feature.geometry;
    if (!geom) return;
    const polys = geom.type === 'MultiPolygon'
      ? geom.coordinates
      : [geom.coordinates];

    polys.forEach(poly => {
      ctx.beginPath();
      poly[0].forEach(([lon, lat], i) => {
        const x = (lon + 180) / 360 * MAP_W;
        const y = (90   - lat) / 180 * MAP_H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  });

  // Equator line
  ctx.strokeStyle = '#2d3148';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  const eq = 90 / 180 * MAP_H;
  ctx.moveTo(0, eq);
  ctx.lineTo(MAP_W, eq);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLikelihood(ctx, dateUTC, mode, objHeight, shadowLen, elevation) {
  const yellowPts = [];
  const orangePts = [];
  const step = STEP_DEG;

  for (let lat = -60; lat <= 85; lat += step) {
    for (let lon = -180; lon <= 180; lon += step) {
      const pos = SunCalc.getPosition(dateUTC, lat, lon);
      if (pos.altitude <= 0) continue;

      let error;
      if (mode === 'lengths') {
        const calcRatio     = 1 / Math.tan(pos.altitude);
        const observedRatio = shadowLen / objHeight;
        error = Math.abs(calcRatio - observedRatio) / observedRatio;
      } else {
        const sunDeg = pos.altitude * 180 / Math.PI;
        error = Math.abs(sunDeg - elevation) / elevation;
      }

      const x  = (lon + 180) / 360 * MAP_W;
      const y  = (90   - lat) / 180 * MAP_H;
      const pw = step / 360 * MAP_W + 1;
      const ph = step / 180 * MAP_H + 1;

      if (error < 0.05)      yellowPts.push([x, y, pw, ph]);
      else if (error < 0.20) orangePts.push([x, y, pw, ph]);
    }
  }

  ctx.fillStyle = 'rgba(255, 130, 0, 0.55)';
  ctx.beginPath();
  orangePts.forEach(([x, y, pw, ph]) => ctx.rect(x, y, pw, ph));
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 80, 0.90)';
  ctx.beginPath();
  yellowPts.forEach(([x, y, pw, ph]) => ctx.rect(x, y, pw, ph));
  ctx.fill();

  return yellowPts.length + orangePts.length;
}

function drawLegend(ctx) {
  const items = [
    { color: 'rgba(255,255,80,0.9)',  label: 'Best match (< 5% error)' },
    { color: 'rgba(255,130,0,0.55)', label: 'Possible (< 20% error)' },
  ];

  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  items.forEach((item, i) => {
    const x = 10;
    const y = MAP_H - 12 - i * 18;
    ctx.fillStyle   = item.color;
    ctx.fillRect(x, y - 5, 12, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(x, y - 5, 12, 10);
    ctx.fillStyle = 'rgba(232,234,240,0.9)';
    ctx.fillText(item.label, x + 16, y);
  });
}

async function runShadowFind() {
  const btn    = document.getElementById('shadowfind-run-btn');
  const status = document.getElementById('shadowfind-status');
  const wrap   = document.getElementById('shadowfind-canvas-wrap');

  const dateVal = document.getElementById('shadowfind-date').value;
  const timeVal = document.getElementById('shadowfind-time').value;

  if (!dateVal || !timeVal) {
    showStatus(status, 'Please enter a date and time (UTC).');
    return;
  }

  const dateUTC = new Date(`${dateVal}T${timeVal}:00Z`);
  if (isNaN(dateUTC.getTime())) {
    showStatus(status, 'Invalid date or time.');
    return;
  }

  const activeChip = document.querySelector('#shadowfind-mode-chips .chip.active');
  const mode = activeChip?.dataset.mode ?? 'lengths';

  let objHeight, shadowLen, elevation;

  if (mode === 'lengths') {
    objHeight = parseFloat(document.getElementById('shadowfind-height').value);
    shadowLen = parseFloat(document.getElementById('shadowfind-shadow').value);
    if (!objHeight || !shadowLen || objHeight <= 0 || shadowLen <= 0) {
      showStatus(status, 'Enter positive values for object height and shadow length.');
      return;
    }
  } else {
    elevation = parseFloat(document.getElementById('shadowfind-elevation').value);
    if (isNaN(elevation) || elevation <= 0 || elevation > 90) {
      showStatus(status, 'Sun elevation angle must be between 0° and 90°.');
      return;
    }
  }

  status.style.display = 'none';
  btn.disabled         = true;
  btn.textContent      = 'Computing…';

  try {
    if (typeof SunCalc === 'undefined') throw new Error('SunCalc library not loaded');
    if (typeof topojson === 'undefined') throw new Error('topojson library not loaded');

    const land = await fetchLand();

    const canvas  = document.getElementById('shadowfind-canvas');
    canvas.width  = MAP_W;
    canvas.height = MAP_H;
    const ctx = canvas.getContext('2d');

    drawBaseMap(ctx, land);
    const hits = drawLikelihood(ctx, dateUTC, mode, objHeight, shadowLen, elevation);
    drawLegend(ctx);

    wrap.style.display = 'block';

    if (hits === 0) {
      showStatus(status, 'No matching locations found — the sun may be below the horizon everywhere at this date/time, or the shadow ratio is outside natural range.');
    }
  } catch (err) {
    showStatus(status, `Error: ${err.message}. Check your internet connection and try again.`);
    console.error(err);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Find locations';
  }
}

function showStatus(el, msg) {
  el.textContent   = msg;
  el.style.display = 'block';
}
