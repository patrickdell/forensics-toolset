/**
 * metadata.js — EXIF/IPTC/XMP extraction + forensic flag checks
 */

import { img, results, getExifData } from './app.js';
import { sha256, formatBytes, escapeHtml } from './utils.js';

export function initMetadata() {
  // Wire "show all fields" toggle once
  document.getElementById('meta-all-fields-toggle').addEventListener('click', () => {
    const allTableEl = document.getElementById('meta-all-table');
    allTableEl.style.display = allTableEl.style.display === 'none' ? 'table' : 'none';
  });

  document.addEventListener('fts:loaded', analyzeMetadata);
}

const FORENSIC_FIELDS = {
  'File': ['Name', 'FileSize', 'MIMEType', 'ImageWidth', 'ImageHeight'],
  'Timestamps': ['DateTimeOriginal', 'DateTime', 'DateTimeDigitized', 'CreateDate', 'ModifyDate'],
  'Location': ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSTimeStamp', 'GPSDateStamp'],
  'Device': ['Make', 'Model', 'Software', 'LensModel', 'SerialNumber'],
  'Edit History': ['ProcessingSoftware', 'HistoryAction', 'HistorySoftwareAgent'],
  'Copyright': ['Artist', 'Copyright', 'ByLine', 'CopyrightNotice', 'Source'],
};

const SOFTWARE_EDIT_TOOLS = [
  'Photoshop', 'Adobe', 'GIMP', 'Lightroom', 'Affinity', 'darktable', 'Canva', 'Snapseed'
];

const AI_GENERATION_TOOLS = [
  'Midjourney', 'DALL-E', 'Stable Diffusion', 'Firefly', 'Imagen', 'ComfyUI', 'Automatic1111'
];

async function analyzeMetadata() {
  const flagsEl = document.getElementById('meta-flags');
  const fieldsEl = document.getElementById('meta-fields');
  const statusEl = document.getElementById('meta-status');
  const flagsList = document.getElementById('meta-flags-list');
  const tableEl = document.getElementById('meta-table');
  const allTableEl = document.getElementById('meta-all-table');
  const allFieldsToggle = document.getElementById('meta-all-fields-toggle');

  statusEl.style.display = 'none';
  flagsEl.style.display = 'block';
  fieldsEl.style.display = 'block';

  try {
    // Compute SHA-256
    const hashHex = await sha256(img.arrayBuffer);

    // Extract metadata via shared cache (avoids double-parse when watermark.js also runs)
    const exifData = await getExifData();

    // Flatten exif data for easier access
    const flatExif = flattenExif(exifData);

    // Collect forensic fields
    const fields = collectForensicFields(flatExif);

    // Run flag checks
    const flags = runFlagChecks(flatExif, img);

    // Revoke previous thumbnail blob URL before replacing (prevents blob URL accumulation)
    if (results.meta && results.meta.thumbnail) {
      URL.revokeObjectURL(results.meta.thumbnail);
    }

    // Store results
    results.meta = { fields, flags, hash: hashHex, thumbnail: extractThumbnail(exifData) };

    // Render flags
    flagsList.innerHTML = '';
    if (flags.length === 0) {
      const none = document.createElement('p');
      none.style.color = 'var(--muted)';
      none.textContent = 'No forensic flags.';
      flagsList.appendChild(none);
    } else {
      flags.forEach(flag => {
        const badge = document.createElement('div');
        badge.className = `flag-badge ${flag.level}`;
        const icon = document.createElement('strong');
        icon.textContent = flag.level === 'red' ? '⚠️' : flag.level === 'yellow' ? '⚡' : '✓';
        badge.appendChild(icon);
        badge.appendChild(document.createTextNode(' ' + flag.message));
        flagsList.appendChild(badge);
      });
    }

    // Render forensic fields table
    tableEl.innerHTML = '';
    Object.entries(FORENSIC_FIELDS).forEach(([group, fieldNames]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="2" class="meta-group-label">${group}</td>`;
      tableEl.appendChild(tr);

      fieldNames.forEach(fieldName => {
        const value = fields[fieldName] || '(not present)';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="meta-key">${fieldName}</td><td class="meta-val">${escapeHtml(String(value))}</td>`;
        tableEl.appendChild(tr);
      });
    });

    // Add SHA-256 row
    {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="2" class="meta-group-label">File Integrity</td>`;
      tableEl.appendChild(tr);
    }
    {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="meta-key">SHA-256</td><td class="meta-val" style="word-break:break-all; font-family:monospace; font-size:0.85rem">${hashHex}</td>`;
      tableEl.appendChild(tr);
    }

    // Render all fields table
    allTableEl.innerHTML = '';
    Object.entries(flatExif).forEach(([key, value]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="meta-key">${escapeHtml(key)}</td><td class="meta-val">${escapeHtml(String(value)).substring(0, 200)}</td>`;
      allTableEl.appendChild(tr);
    });

    // Add thumbnail if present
    if (results.meta.thumbnail) {
      const thumbRow = document.createElement('tr');
      thumbRow.innerHTML = `<td colspan="2" class="meta-group-label">Embedded Thumbnail</td>`;
      tableEl.appendChild(thumbRow);
      const thumbDataRow = document.createElement('tr');
      thumbDataRow.innerHTML = `<td colspan="2"><img src="${results.meta.thumbnail}" style="max-width:200px; border:1px solid var(--line); border-radius:var(--radius-sm);" /></td>`;
      tableEl.appendChild(thumbDataRow);
    }

  } catch (e) {
    console.error('Metadata analysis error:', e);
    statusEl.style.display = 'block';
    statusEl.textContent = '❌ Error analyzing metadata.';
  }
}

function flattenExif(exifData) {
  const flat = {};

  function walk(obj, prefix = '') {
    Object.entries(obj || {}).forEach(([key, val]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Blob)) {
        walk(val, fullKey);
      } else if (val !== null && val !== undefined) {
        flat[fullKey] = val;
      }
    });
  }

  walk(exifData);
  return flat;
}

function collectForensicFields(flatExif) {
  const fields = {};

  // File info
  fields['Name'] = img.name;
  fields['FileSize'] = formatBytes(img.file.size);
  fields['MIMEType'] = img.type;
  fields['ImageWidth'] = flatExif['Image.ImageWidth'] || flatExif['IFD0.ImageWidth'] || '?';
  fields['ImageHeight'] = flatExif['Image.ImageHeight'] || flatExif['IFD0.ImageHeight'] || '?';

  // Timestamps
  fields['DateTimeOriginal'] = flatExif['IFD0.DateTimeOriginal'] || flatExif['Exif.DateTimeOriginal'] || null;
  fields['DateTime'] = flatExif['IFD0.DateTime'] || flatExif['Image.DateTime'] || null;
  fields['DateTimeDigitized'] = flatExif['Exif.DateTimeDigitized'] || null;
  fields['CreateDate'] = flatExif['XMP.CreateDate'] || null;
  fields['ModifyDate'] = flatExif['XMP.ModifyDate'] || null;

  // Location
  fields['GPSLatitude'] = flatExif['GPS.GPSLatitude'] || null;
  fields['GPSLongitude'] = flatExif['GPS.GPSLongitude'] || null;
  fields['GPSAltitude'] = flatExif['GPS.GPSAltitude'] || null;
  fields['GPSTimeStamp'] = flatExif['GPS.GPSTimeStamp'] || null;
  fields['GPSDateStamp'] = flatExif['GPS.GPSDateStamp'] || null;

  // Device
  fields['Make'] = flatExif['IFD0.Make'] || flatExif['Image.Make'] || null;
  fields['Model'] = flatExif['IFD0.Model'] || flatExif['Image.Model'] || null;
  fields['Software'] = flatExif['IFD0.Software'] || flatExif['Image.Software'] || null;
  fields['LensModel'] = flatExif['Exif.LensModel'] || null;
  fields['SerialNumber'] = flatExif['Exif.InternalSerialNumber'] || null;

  // Edit history
  fields['ProcessingSoftware'] = flatExif['Exif.ProcessingSoftware'] || null;
  fields['HistoryAction'] = flatExif['XMP.HistoryAction'] || null;
  fields['HistorySoftwareAgent'] = flatExif['XMP.HistorySoftwareAgent'] || null;

  // Copyright
  fields['Artist'] = flatExif['IFD0.Artist'] || flatExif['Image.Artist'] || null;
  fields['Copyright'] = flatExif['IFD0.Copyright'] || flatExif['Image.Copyright'] || null;
  fields['ByLine'] = flatExif['IPTC.ByLine'] || null;
  fields['CopyrightNotice'] = flatExif['IPTC.CopyrightNotice'] || null;
  fields['Source'] = flatExif['IPTC.Source'] || null;

  return fields;
}

function runFlagChecks(flatExif, img) {
  const flags = [];
  const allText = Object.values(flatExif).join(' ');

  // Software flags
  AI_GENERATION_TOOLS.forEach(tool => {
    if (allText.includes(tool)) {
      flags.push({
        level: 'red',
        message: `AI generation tool detected in metadata: ${tool}`
      });
    }
  });

  SOFTWARE_EDIT_TOOLS.forEach(tool => {
    if (allText.includes(tool)) {
      flags.push({
        level: 'yellow',
        message: `Edited with ${tool}`
      });
    }
  });

  // Timestamp flags
  const dateTimeOriginal = flatExif['IFD0.DateTimeOriginal'] || flatExif['Exif.DateTimeOriginal'];
  const dateTime = flatExif['IFD0.DateTime'] || flatExif['Image.DateTime'];

  if (dateTimeOriginal && dateTime) {
    const dtOrig = new Date(dateTimeOriginal);
    const dt = new Date(dateTime);
    if (dtOrig > dt) {
      flags.push({
        level: 'red',
        message: 'DateTimeOriginal is after DateTime (modification before original)'
      });
    }
  }

  if (!dateTimeOriginal && dateTime) {
    flags.push({
      level: 'yellow',
      message: 'Original capture time absent; only modification time present'
    });
  }

  // GPS flags
  const gpsLat = flatExif['GPS.GPSLatitude'];
  const gpsLon = flatExif['GPS.GPSLongitude'];

  if (gpsLat && gpsLon) {
    if (gpsLat === 0 && gpsLon === 0) {
      flags.push({
        level: 'red',
        message: 'GPS coordinates are 0°,0° (likely placeholder or removed)'
      });
    } else {
      flags.push({
        level: 'green',
        message: `Location embedded: ${gpsLat.toFixed(4)}°, ${gpsLon.toFixed(4)}°`
      });
    }
  }

  // Missing device info
  const make = flatExif['IFD0.Make'] || flatExif['Image.Make'];
  const model = flatExif['IFD0.Model'] || flatExif['Image.Model'];

  if (!make || !model) {
    flags.push({
      level: 'yellow',
      message: 'No camera identification in metadata'
    });
  }

  // Thumbnail
  const hasThumbnail = flatExif['IFD1'] && Object.keys(flatExif).some(k => k.includes('Thumbnail'));
  if (hasThumbnail) {
    flags.push({
      level: 'yellow',
      message: 'Embedded thumbnail found — may differ from current image'
    });
  }

  return flags;
}

function extractThumbnail(exifData) {
  // Try to extract JPEG thumbnail from IFD1
  if (exifData.IFD1 && exifData.IFD1.JpegInterchangeFormat && exifData.IFD1.JpegInterchangeFormatLength) {
    try {
      const offset = exifData.IFD1.JpegInterchangeFormat.value || 0;
      const length = exifData.IFD1.JpegInterchangeFormatLength.value || 0;
      if (offset > 0 && length > 0) {
        const thumbData = img.arrayBuffer.slice(offset, offset + length);
        const blob = new Blob([thumbData], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('Could not extract thumbnail:', e);
    }
  }
  return null;
}

