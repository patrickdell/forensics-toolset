/**
 * report.js — Forensic report assembly and printing
 *
 * Each completed analysis module gets:
 *   • A checkbox to include/exclude its section from the printed report (default: included)
 *   • A free-text note field for analyst commentary
 */

import { img, results } from './app.js';
import { escapeHtml, formatBytes } from './utils.js';

// ── Per-module state ──────────────────────────────────────────────────────────
// Keys must match the labels used in the `completed` object below
const reportIncludes = {};   // { 'Metadata': true, … }
const reportNotes    = {};   // { 'Metadata': '', … }

export function initReport() {
  // Reset state when a new image is loaded
  document.addEventListener('fts:loaded', () => {
    Object.keys(reportIncludes).forEach(k => delete reportIncludes[k]);
    Object.keys(reportNotes).forEach(k => delete reportNotes[k]);
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
          .flag.red { border-color: #ff5f5f; background: #fff5f5; color: #333; }
          .flag.yellow { border-color: #f5a623; background: #fffef0; color: #333; }
          .flag.green { border-color: #3ecf8e; background: #f0fef6; color: #333; }
          .report-analyst-note { font-style: italic; color: #555; border-left: 3px solid #aaa; padding-left: 0.75em; margin: 0.5em 0; }
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

  document.addEventListener('fts:meta:complete', updateReportStatus);
  document.addEventListener('fts:ela:complete', updateReportStatus);
  document.addEventListener('fts:noise:complete', updateReportStatus);
  document.addEventListener('fts:clone:complete', updateReportStatus);
  document.addEventListener('fts:strip:complete', updateReportStatus);
  document.addEventListener('fts:redactor:complete', updateReportStatus);
}

function updateReportStatus() {
  const statusEl    = document.getElementById('report-status');
  const checklistEl = document.getElementById('report-checklist');
  const previewEl   = document.getElementById('report-preview');
  const emptyEl     = document.getElementById('report-empty');

  const completed = {
    'Metadata':             !!results.meta,
    'ELA':                  !!results.ela,
    'Clone Detection':      !!results.clone,
    'Noise Analysis':       !!results.noise,
    'AI Watermarks':        !!results.watermark,
    'Metadata Stripper':    !!results.strip,
    'Redaction Detection':  !!(results.redactor && results.redactor.canvas),
  };

  const anyComplete = Object.values(completed).some(v => v);

  if (!anyComplete) {
    statusEl.style.display  = 'none';
    previewEl.style.display = 'none';
    emptyEl.style.display   = 'block';
    return;
  }

  statusEl.style.display  = 'block';
  previewEl.style.display = 'block';
  emptyEl.style.display   = 'none';

  // ── Rebuild checklist ────────────────────────────────────────────────────
  checklistEl.innerHTML = '';

  Object.entries(completed).forEach(([name, done]) => {
    const row = document.createElement('div');
    row.className = 'report-status-item';

    if (!done) {
      // Incomplete — greyed out, no controls
      row.innerHTML = `
        <span class="report-item-status report-item-pending">◯</span>
        <span class="report-item-name report-item-name--muted">${escapeHtml(name)}</span>
      `;
    } else {
      // Set default include state once (don't reset if user already toggled)
      if (!(name in reportIncludes)) reportIncludes[name] = true;
      if (!(name in reportNotes))    reportNotes[name]    = '';

      const cbId = 'report-cb-' + name.replace(/\s+/g, '-');
      row.innerHTML = `
        <span class="report-item-status report-item-done">✓</span>
        <label class="report-item-label" for="${cbId}">
          <input type="checkbox" class="report-include-cb" id="${cbId}" data-tool="${escapeHtml(name)}"
                 ${reportIncludes[name] ? 'checked' : ''}>
          ${escapeHtml(name)}
        </label>
        <input type="text" class="report-note-input" data-tool="${escapeHtml(name)}"
               placeholder="Add analyst note…" value="${escapeHtml(reportNotes[name] || '')}">
      `;

      // Checkbox → toggle include + refresh preview
      row.querySelector('.report-include-cb').addEventListener('change', e => {
        reportIncludes[e.target.dataset.tool] = e.target.checked;
        document.getElementById('report-content').innerHTML = generateReportHTML();
      });

      // Note field → update notes + refresh preview (on blur to avoid per-keystroke re-render)
      row.querySelector('.report-note-input').addEventListener('input', e => {
        reportNotes[e.target.dataset.tool] = e.target.value;
        document.getElementById('report-content').innerHTML = generateReportHTML();
      });
    }

    checklistEl.appendChild(row);
  });

  // Generate preview
  document.getElementById('report-content').innerHTML = generateReportHTML();
}

function noteHtml(name) {
  const note = reportNotes[name];
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

  // File integrity
  if (results.meta && isIncluded('Metadata')) {
    html += `
      <h2>File Integrity</h2>
      <table>
        <tr><th>Filename</th><td>${escapeHtml(img.name)}</td></tr>
        <tr><th>Size</th><td>${formatBytes(img.file.size)}</td></tr>
        <tr><th>Format</th><td>${escapeHtml(img.type)}</td></tr>
        <tr><th>Dimensions</th><td>${img.bitmap.width} × ${img.bitmap.height}px</td></tr>
        <tr><th>SHA-256</th><td style="font-family:monospace; font-size:0.85em; word-break:break-all;">${results.meta.hash}</td></tr>
      </table>
    `;

    if (results.meta.flags.length > 0) {
      html += '<h2>Forensic Flags</h2>';
      results.meta.flags.forEach(flag => {
        html += `<div class="flag ${flag.level}"><strong>${flag.level.toUpperCase()}</strong>: ${escapeHtml(flag.message)}</div>`;
      });
    }

    html += '<h2>Metadata Fields</h2>';
    html += '<table><tr><th>Field</th><th>Value</th></tr>';
    Object.entries(results.meta.fields).forEach(([key, value]) => {
      if (value) {
        html += `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value)).substring(0, 100)}</td></tr>`;
      }
    });
    html += '</table>';
    html += noteHtml('Metadata');
  }

  // ELA
  if (results.ela && results.ela.canvas && isIncluded('ELA')) {
    html += `
      <h2>Error Level Analysis</h2>
      <p><strong>Settings:</strong> Quality ${results.ela.quality}%, Amplification ${results.ela.amplification}×</p>
      <img src="${results.ela.canvas}" alt="ELA heatmap" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Areas with high ELA values may indicate edited or re-saved regions.
        ELA should never be used in isolation for forensic analysis.</em>
      </p>
    `;
    html += noteHtml('ELA');
  }

  // Clone detection
  if (results.clone && results.clone.canvas && isIncluded('Clone Detection')) {
    html += `
      <h2>Clone Detection</h2>
      <p><strong>Matched regions:</strong> ${results.clone.matchCount} |
      <strong>Sensitivity:</strong> ${results.clone.sensitivity}</p>
      <img src="${results.clone.canvas}" alt="Clone detection map" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Matched regions are shown in colour-coded overlays. Smooth areas generate noise at high sensitivity.</em>
      </p>
    `;
    html += noteHtml('Clone Detection');
  }

  // Noise analysis
  if (results.noise && results.noise.canvas && isIncluded('Noise Analysis')) {
    html += `
      <h2>Noise Residual Analysis</h2>
      <p><strong>Amplification:</strong> ${results.noise.amplification}×</p>
      <img src="${results.noise.canvas}" alt="Noise residual heatmap" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Blue regions have low noise residuals (smooth areas), transitioning to red for high residuals.
        This analysis should be combined with other forensic indicators.</em>
      </p>
    `;
    html += noteHtml('Noise Analysis');
  }

  // AI watermarks & provenance
  if (results.watermark && isIncluded('AI Watermarks')) {
    const w = results.watermark;
    const rows = [
      ['C2PA / Content Credentials', w.c2paPresent ? `Detected (${escapeHtml(w.c2paFormat)})` : 'Not detected'],
      ['IPTC Digital Source Type',   w.digitalSourceType ? escapeHtml(w.digitalSourceType) : 'Not declared'],
      ['AI Generator Fingerprints',  w.aiTools.length > 0 ? w.aiTools.map(escapeHtml).join(', ') : 'None detected'],
    ];
    html += `<h2>AI Watermarks &amp; Provenance</h2>
    <table><tr><th>Check</th><th>Result</th></tr>
    ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
    </table>
    <p style="color:#666; font-size:0.9em;"><em>
      SynthID and invisible steganographic watermarks cannot be verified locally.
      These results reflect declared metadata and binary signatures only.
    </em></p>`;
    html += noteHtml('AI Watermarks');
  }

  // Metadata stripper
  if (results.strip && isIncluded('Metadata Stripper')) {
    html += `
      <h2>Metadata Stripping</h2>
      <p><strong>Mode:</strong> ${escapeHtml(results.strip.mode)}</p>
      <p>${results.strip.beforeCount} fields → ${results.strip.afterCount} fields</p>
    `;
    html += noteHtml('Metadata Stripper');
  }

  // Redaction detection
  if (results.redactor && results.redactor.canvas && isIncluded('Redaction Detection')) {
    html += `
      <h2>Redaction Reversibility Analysis</h2>
      <p><strong>Mode:</strong> ${escapeHtml(results.redactor.mode)} detection</p>
      <p><strong>Regions detected:</strong> ${results.redactor.detectedRegions.length}</p>
      <img src="${results.redactor.canvas}" alt="Redaction heatmap" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Red = high-confidence artifact region; yellow/green = lower confidence.
        Detects blur, pixelation, and swirl artifacts.</em>
      </p>
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
