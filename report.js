/**
 * report.js — Forensic report assembly and printing
 */

import { img, results } from './app.js';
import { escapeHtml, formatBytes } from './utils.js';

export function initReport() {
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

  document.addEventListener('fts:loaded', updateReportStatus);
  document.addEventListener('fts:meta:complete', updateReportStatus);
  document.addEventListener('fts:ela:complete', updateReportStatus);
  document.addEventListener('fts:clone:complete', updateReportStatus);
  document.addEventListener('fts:strip:complete', updateReportStatus);
}

function updateReportStatus() {
  const statusEl = document.getElementById('report-status');
  const checklistEl = document.getElementById('report-checklist');
  const previewEl = document.getElementById('report-preview');
  const emptyEl = document.getElementById('report-empty');
  const printBtn = document.getElementById('report-print-btn');

  const completed = {
    Metadata: !!results.meta,
    ELA: !!results.ela,
    'Clone Detection': !!results.clone,
    'Metadata Stripper': !!results.strip,
  };

  const anyComplete = Object.values(completed).some(v => v);

  if (!anyComplete) {
    statusEl.style.display = 'none';
    previewEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  statusEl.style.display = 'block';
  previewEl.style.display = 'block';
  emptyEl.style.display = 'none';

  // Update checklist
  checklistEl.innerHTML = '';
  Object.entries(completed).forEach(([name, done]) => {
    const item = document.createElement('div');
    item.className = 'report-status-item';
    item.innerHTML = `<span style="margin-right:0.5rem">${done ? '✓' : '◯'}</span> ${name}`;
    item.style.color = done ? 'var(--success)' : 'var(--muted)';
    checklistEl.appendChild(item);
  });

  // Generate preview
  document.getElementById('report-content').innerHTML = generateReportHTML();
}

function generateReportHTML() {
  let html = `
    <h1>Forensic Image Analysis Report</h1>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()} |
    <strong>File:</strong> ${img.name}</p>
  `;

  // File integrity
  if (results.meta) {
    html += `
      <h2>File Integrity</h2>
      <table>
        <tr><th>Filename</th><td>${escapeHtml(img.name)}</td></tr>
        <tr><th>Size</th><td>${formatBytes(img.file.size)}</td></tr>
        <tr><th>Format</th><td>${img.type}</td></tr>
        <tr><th>Dimensions</th><td>${img.bitmap.width} × ${img.bitmap.height}px</td></tr>
        <tr><th>SHA-256</th><td style="font-family:monospace; font-size:0.85em; word-break:break-all;">${results.meta.hash}</td></tr>
      </table>
    `;

    // Forensic flags
    if (results.meta.flags.length > 0) {
      html += '<h2>Forensic Flags</h2>';
      results.meta.flags.forEach(flag => {
        html += `<div class="flag ${flag.level}"><strong>${flag.level.toUpperCase()}</strong>: ${escapeHtml(flag.message)}</div>`;
      });
    }

    // Metadata fields
    html += '<h2>Metadata Fields</h2>';
    html += '<table><tr><th>Field</th><th>Value</th></tr>';
    Object.entries(results.meta.fields).forEach(([key, value]) => {
      if (value) {
        html += `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value)).substring(0, 100)}</td></tr>`;
      }
    });
    html += '</table>';
  }

  // ELA
  if (results.ela && results.ela.canvas) {
    html += `
      <h2>Error Level Analysis</h2>
      <p><strong>Settings:</strong> Quality ${results.ela.quality}%, Amplification ${results.ela.amplification}×</p>
      <img src="${results.ela.canvas}" alt="ELA heatmap" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Areas with high ELA values may indicate edited or re-saved regions.
        ELA should never be used in isolation for forensic analysis.</em>
      </p>
    `;
  }

  // Clone detection
  if (results.clone && results.clone.canvas) {
    html += `
      <h2>Clone Detection</h2>
      <p><strong>Matched regions:</strong> ${results.clone.matchCount} |
      <strong>Sensitivity:</strong> ${results.clone.sensitivity}</p>
      <img src="${results.clone.canvas}" alt="Clone detection map" style="max-width:100%; height:auto;" />
      <p style="color:#666; font-size:0.9em;">
        <em>Matched regions are shown in colour-coded overlays. Smooth areas generate noise at high sensitivity.</em>
      </p>
    `;
  }

  // Metadata stripper
  if (results.strip) {
    html += `
      <h2>Metadata Stripping</h2>
      <p><strong>Mode:</strong> ${results.strip.mode}</p>
      <p>${results.strip.beforeCount} fields → ${results.strip.afterCount} fields</p>
    `;
  }

  // Disclaimer
  html += `
    <div class="disclaimer">
      <strong>Disclaimer:</strong> This report is an automated analysis to assist human review.
      Findings are indicators only and must be interpreted by a qualified analyst.
      This tool is intended to support forensic investigation, not replace it.
    </div>
  `;

  return html;
}

