/**
 * report.js — Forensic report assembly and printing
 *
 * Each tool row in the Report tab shows:
 *   • A radio-style toggle to mark the tool's findings as included in the report
 *   • A free-text analyst note field
 * Tools that have not yet produced results are greyed out and non-interactive.
 */

import { img, results } from './app.js';
import { escapeHtml, formatBytes } from './utils.js';

// ── Per-module state ──────────────────────────────────────────────────────────
const reportIncludes = {};   // { 'Metadata': true, … }  — defaults to true when analysis completes
const reportNotes    = {};   // { 'Metadata': '', … }

// Canonical tool list (order shown in Report tab)
const TOOLS = [
  'Metadata',
  'ELA',
  'Clone Detection',
  'Noise Analysis',
  'AI Watermarks',
  'Metadata Stripper',
  'Redaction Detection',
];

function hasResult(name) {
  switch (name) {
    case 'Metadata':            return !!results.meta;
    case 'ELA':                 return !!(results.ela && results.ela.canvas);
    case 'Clone Detection':     return !!(results.clone && results.clone.canvas);
    case 'Noise Analysis':      return !!(results.noise && results.noise.canvas);
    case 'AI Watermarks':       return !!results.watermark;
    case 'Metadata Stripper':   return !!results.strip;
    case 'Redaction Detection': return !!(results.redactor && results.redactor.canvas);
    default:                    return false;
  }
}

export function initReport() {
  // Reset state when a new image is loaded
  document.addEventListener('fts:loaded', () => {
    TOOLS.forEach(name => {
      delete reportIncludes[name];
      delete reportNotes[name];
    });
    updateReportStatus();
  });

  // Wire print button once
  document.getElementById('report-print-btn').addEventListener('click', () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Forensic Image Analysis Report</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #333; }
          h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
          h1 { font-size: 1.8em; border-bottom: 2px solid #333; padding-bottom: 0.5em; }
          h2 { font-size: 1.3em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
          table { width: 100%; border-collapse: collapse; margin: 1em 0; }
          th, td { padding: 0.5em; border: 1px solid #ddd; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          img { max-width: 100%; height: auto; margin: 1em 0; border: 1px solid #ddd; }
          .flag { padding: 0.5em; margin: 0.5em 0; border-left: 4px solid; border-radius: 2px; }
          .flag.red { border-color: #ff5f5f; background: #fff5f5; }
          .flag.yellow { border-color: #f5a623; background: #fffef0; }
          .flag.green { border-color: #3ecf8e; background: #f0fef6; }
          .report-analyst-note { font-style: italic; color: #555; border-left: 3px solid #bbb; padding-left: 0.75em; margin: 0.75em 0; }
          .disclaimer { margin-top: 2em; padding: 1em; background: #f5f5f5; border-radius: 4px; font-size: 0.9em; }
          @media print { body { margin: 0; padding: 1cm; } img { page-break-inside: avoid; } }
        </style>
      </head>
      <body>${generateReportHTML()}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  });

  // Update checklist whenever any analysis completes
  [
    'fts:loaded', 'fts:meta:complete', 'fts:ela:complete',
    'fts:noise:complete', 'fts:clone:complete',
    'fts:strip:complete', 'fts:redactor:complete',
  ].forEach(evt => document.addEventListener(evt, updateReportStatus));
}

// ── Checklist renderer ────────────────────────────────────────────────────────

function updateReportStatus() {
  const statusEl    = document.getElementById('report-status');
  const checklistEl = document.getElementById('report-checklist');
  const previewEl   = document.getElementById('report-preview');
  const emptyEl     = document.getElementById('report-empty');

  const anyComplete = TOOLS.some(hasResult);

  if (!anyComplete) {
    statusEl.style.display  = 'none';
    previewEl.style.display = 'none';
    emptyEl.style.display   = 'block';
    return;
  }

  statusEl.style.display  = 'block';
  previewEl.style.display = 'block';
  emptyEl.style.display   = 'none';

  // Preserve existing note input values before rebuilding DOM
  checklistEl.querySelectorAll('.report-note-input').forEach(input => {
    reportNotes[input.dataset.tool] = input.value;
  });

  checklistEl.innerHTML = '';

  TOOLS.forEach(name => {
    const done = hasResult(name);
    const row  = document.createElement('div');
    row.className = 'report-status-item' + (done ? '' : ' report-status-item--inactive');

    if (!done) {
      // No results yet — show greyed-out row, no interactivity
      row.innerHTML = `
        <span class="report-radio report-radio--disabled" aria-disabled="true"></span>
        <span class="report-tool-name report-tool-name--muted">${escapeHtml(name)}</span>
        <span class="report-tool-hint">Not yet run</span>
      `;
    } else {
      // Default to included the first time results arrive
      if (!(name in reportIncludes)) reportIncludes[name] = true;
      if (!(name in reportNotes))    reportNotes[name]    = '';

      const included = reportIncludes[name];
      const toolKey  = escapeHtml(name);

      row.innerHTML = `
        <button class="report-radio${included ? ' report-radio--on' : ''}"
                aria-pressed="${included}"
                data-tool="${toolKey}"
                title="${included ? 'Included in report — click to exclude' : 'Excluded — click to include'}">
        </button>
        <span class="report-tool-name">${escapeHtml(name)}</span>
        <input type="text" class="report-note-input" data-tool="${toolKey}"
               placeholder="Add analyst note…"
               value="${escapeHtml(reportNotes[name] || '')}">
      `;

      // Radio toggle
      row.querySelector('.report-radio').addEventListener('click', e => {
        const btn = e.currentTarget;
        const tool = btn.dataset.tool;
        reportIncludes[tool] = !reportIncludes[tool];
        btn.classList.toggle('report-radio--on', reportIncludes[tool]);
        btn.setAttribute('aria-pressed', String(reportIncludes[tool]));
        btn.title = reportIncludes[tool]
          ? 'Included in report — click to exclude'
          : 'Excluded — click to include';
        document.getElementById('report-content').innerHTML = generateReportHTML();
      });

      // Note field — update live
      row.querySelector('.report-note-input').addEventListener('input', e => {
        reportNotes[e.target.dataset.tool] = e.target.value;
        document.getElementById('report-content').innerHTML = generateReportHTML();
      });
    }

    checklistEl.appendChild(row);
  });

  document.getElementById('report-content').innerHTML = generateReportHTML();
}

// ── Report HTML generation ────────────────────────────────────────────────────

function noteHtml(name) {
  const note = (reportNotes[name] || '').trim();
  if (!note) return '';
  return `<p class="report-analyst-note"><strong>Analyst note:</strong> ${escapeHtml(note)}</p>`;
}

function isIncluded(name) {
  return reportIncludes[name] !== false;
}

function generateReportHTML() {
  let html = `
    <h1>Forensic Image Analysis Report</h1>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()} |
    <strong>File:</strong> ${escapeHtml(img.name || '—')}</p>
  `;

  // Metadata
  if (results.meta && isIncluded('Metadata')) {
    html += `
      <h2>File Integrity &amp; Metadata</h2>
      <table>
        <tr><th>Filename</th><td>${escapeHtml(img.name)}</td></tr>
        <tr><th>Size</th><td>${formatBytes(img.file.size)}</td></tr>
        <tr><th>Format</th><td>${escapeHtml(img.type)}</td></tr>
        <tr><th>Dimensions</th><td>${img.bitmap.width} × ${img.bitmap.height}px</td></tr>
        <tr><th>SHA-256</th><td style="font-family:monospace;font-size:0.85em;word-break:break-all">${results.meta.hash}</td></tr>
      </table>
    `;
    if (results.meta.flags.length > 0) {
      html += '<h3>Forensic Flags</h3>';
      results.meta.flags.forEach(f => {
        html += `<div class="flag ${f.level}"><strong>${f.level.toUpperCase()}:</strong> ${escapeHtml(f.message)}</div>`;
      });
    }
    html += '<h3>Metadata Fields</h3><table><tr><th>Field</th><th>Value</th></tr>';
    Object.entries(results.meta.fields).forEach(([k, v]) => {
      if (v) html += `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v)).substring(0, 200)}</td></tr>`;
    });
    html += '</table>';
    html += noteHtml('Metadata');
  }

  // ELA
  if (results.ela && results.ela.canvas && isIncluded('ELA')) {
    html += `
      <h2>Error Level Analysis</h2>
      <p><strong>Quality:</strong> ${results.ela.quality}% &nbsp;|&nbsp; <strong>Amplification:</strong> ${results.ela.amplification}×</p>
      <img src="${results.ela.canvas}" alt="ELA heatmap">
      <p><em>High ELA values in smooth regions may indicate editing or re-saving. Do not use in isolation.</em></p>
    `;
    html += noteHtml('ELA');
  }

  // Clone Detection
  if (results.clone && results.clone.canvas && isIncluded('Clone Detection')) {
    html += `
      <h2>Clone Detection</h2>
      <p><strong>Matched regions:</strong> ${results.clone.matchCount} &nbsp;|&nbsp; <strong>Sensitivity:</strong> ${results.clone.sensitivity}</p>
      <img src="${results.clone.canvas}" alt="Clone detection map">
      <p><em>Matched regions shown as colour-coded overlays. Smooth uniform areas may generate false matches at high sensitivity.</em></p>
    `;
    html += noteHtml('Clone Detection');
  }

  // Noise Analysis
  if (results.noise && results.noise.canvas && isIncluded('Noise Analysis')) {
    html += `
      <h2>Noise Residual Analysis</h2>
      <p><strong>Amplification:</strong> ${results.noise.amplification}×</p>
      <img src="${results.noise.canvas}" alt="Noise residual heatmap">
      <p><em>Blue = low residuals (smooth/uniform areas). Red = high residuals (texture, compression, or possible compositing).</em></p>
    `;
    html += noteHtml('Noise Analysis');
  }

  // AI Watermarks
  if (results.watermark && isIncluded('AI Watermarks')) {
    const w = results.watermark;
    html += `
      <h2>AI Watermarks &amp; Provenance</h2>
      <table>
        <tr><th>Check</th><th>Result</th></tr>
        <tr><td>C2PA / Content Credentials</td><td>${w.c2paPresent ? `Detected (${escapeHtml(w.c2paFormat)})` : 'Not detected'}</td></tr>
        <tr><td>IPTC Digital Source Type</td><td>${w.digitalSourceType ? escapeHtml(w.digitalSourceType) : 'Not declared'}</td></tr>
        <tr><td>AI Generator Fingerprints</td><td>${w.aiTools.length > 0 ? w.aiTools.map(escapeHtml).join(', ') : 'None detected'}</td></tr>
      </table>
      <p><em>SynthID and steganographic watermarks cannot be verified locally. Results reflect declared metadata and binary signatures only.</em></p>
    `;
    html += noteHtml('AI Watermarks');
  }

  // Metadata Stripper
  if (results.strip && isIncluded('Metadata Stripper')) {
    html += `
      <h2>Metadata Stripping</h2>
      <p><strong>Mode:</strong> ${escapeHtml(results.strip.mode)} &nbsp;|&nbsp; ${results.strip.beforeCount} fields → ${results.strip.afterCount} fields</p>
    `;
    html += noteHtml('Metadata Stripper');
  }

  // Redaction Detection
  if (results.redactor && results.redactor.canvas && isIncluded('Redaction Detection')) {
    html += `
      <h2>Redaction Reversibility Analysis</h2>
      <p><strong>Mode:</strong> ${escapeHtml(results.redactor.mode)} &nbsp;|&nbsp; <strong>Regions detected:</strong> ${results.redactor.detectedRegions.length}</p>
      <img src="${results.redactor.canvas}" alt="Redaction heatmap">
      <p><em>Red = high confidence in artifact region. Detects blur, pixelation, and swirl patterns.</em></p>
    `;
    html += noteHtml('Redaction Detection');
  }

  html += `
    <div class="disclaimer">
      <strong>Disclaimer:</strong> This report is an automated analysis to assist human review.
      Findings are indicators only and must be interpreted by a qualified analyst.
      This tool is intended to support forensic investigation, not replace it.
    </div>
  `;

  return html;
}
