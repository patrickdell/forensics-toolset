/**
 * metadata.js — EXIF/IPTC/XMP extraction + forensic flag checks
 */

import { img, results, getExifData } from './app.js';
import { sha256, formatBytes, escapeHtml, flattenExif } from './utils.js';

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
  'Camera Settings': ['Orientation', 'ColorSpace', 'ISOSpeedRatings', 'ExposureTime', 'FNumber', 'FocalLength', 'OffsetTimeOriginal'],
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
    const flags = runFlagChecks(flatExif, exifData, img);

    // ExifReader's Thumbnail group already provides ready-to-use base64 — no manual
    // byte-offset slicing needed, and nothing to revoke (it's a data URI, not a blob URL).
    const thumbnail = exifData.Thumbnail?.base64
      ? `data:image/jpeg;base64,${exifData.Thumbnail.base64}`
      : null;

    // Store results
    results.meta = { fields, flags, hash: hashHex, thumbnail };

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

function collectForensicFields(flatExif) {
  const fields = {};

  // File info — dimensions come from the decoded bitmap, not EXIF (always accurate,
  // and ExifReader's 'file' group key for this is inconsistently spelled across formats)
  fields['Name'] = img.name;
  fields['FileSize'] = formatBytes(img.file.size);
  fields['MIMEType'] = img.type;
  fields['ImageWidth'] = img.bitmap?.width ?? '?';
  fields['ImageHeight'] = img.bitmap?.height ?? '?';

  // Timestamps — ExifReader expanded mode merges 0th-IFD + Exif-IFD tags into one 'exif' group
  fields['DateTimeOriginal'] = flatExif['exif.DateTimeOriginal'] || null;
  fields['DateTime'] = flatExif['exif.DateTime'] || null;
  fields['DateTimeDigitized'] = flatExif['exif.DateTimeDigitized'] || null;
  fields['CreateDate'] = flatExif['xmp.CreateDate'] || null;
  fields['ModifyDate'] = flatExif['xmp.ModifyDate'] || null;

  // Location — raw GPS IFD tags merge into 'exif' too; only Latitude/Longitude/Altitude
  // get a separate precomputed 'gps' group of plain decimal numbers (handled in runFlagChecks,
  // which has access to raw exifData — here we just show the same precomputed pair if present)
  fields['GPSLatitude'] = flatExif['gps.Latitude'] ?? null;
  fields['GPSLongitude'] = flatExif['gps.Longitude'] ?? null;
  fields['GPSAltitude'] = flatExif['gps.Altitude'] ?? null;
  fields['GPSTimeStamp'] = flatExif['exif.GPSTimeStamp'] || null;
  fields['GPSDateStamp'] = flatExif['exif.GPSDateStamp'] || null;

  // Device
  fields['Make'] = flatExif['exif.Make'] || null;
  fields['Model'] = flatExif['exif.Model'] || null;
  fields['Software'] = flatExif['exif.Software'] || null;
  fields['LensModel'] = flatExif['exif.LensModel'] || null;
  fields['SerialNumber'] = flatExif['exif.BodySerialNumber'] || flatExif['exif.SerialNumber'] || null;

  // Camera settings
  fields['Orientation'] = flatExif['exif.Orientation'] || null;
  fields['ColorSpace'] = flatExif['exif.ColorSpace'] || null;
  fields['ISOSpeedRatings'] = flatExif['exif.ISOSpeedRatings'] || null;
  fields['ExposureTime'] = flatExif['exif.ExposureTime'] || null;
  fields['FNumber'] = flatExif['exif.FNumber'] || null;
  fields['FocalLength'] = flatExif['exif.FocalLength'] || null;
  fields['OffsetTimeOriginal'] = flatExif['exif.OffsetTimeOriginal'] || null;

  // Edit history
  fields['ProcessingSoftware'] = flatExif['exif.ProcessingSoftware'] || null;
  fields['HistoryAction'] = flatExif['xmp.HistoryAction'] || null;
  fields['HistorySoftwareAgent'] = flatExif['xmp.HistorySoftwareAgent'] || null;

  // Copyright — IPTC IIM tag names are 'By-line' (hyphenated) and 'Copyright Notice' (spaced)
  fields['Artist'] = flatExif['exif.Artist'] || null;
  fields['Copyright'] = flatExif['exif.Copyright'] || null;
  fields['ByLine'] = flatExif['iptc.By-line'] || null;
  fields['CopyrightNotice'] = flatExif['iptc.Copyright Notice'] || null;
  fields['Source'] = flatExif['iptc.Source'] || null;

  return fields;
}

/** Word-boundary, case-insensitive substring test (avoids "Canva" matching inside "Canon"). */
function containsWord(haystack, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

function runFlagChecks(flatExif, exifData, img) {
  const flags = [];
  const allText = Object.values(flatExif).join(' ');

  // Software flags
  AI_GENERATION_TOOLS.forEach(tool => {
    if (containsWord(allText, tool)) {
      flags.push({
        level: 'red',
        message: `AI generation tool detected in metadata: ${tool}`
      });
    }
  });

  SOFTWARE_EDIT_TOOLS.forEach(tool => {
    if (containsWord(allText, tool)) {
      flags.push({
        level: 'yellow',
        message: `Edited with ${tool}`
      });
    }
  });

  // Timestamp flags
  const dateTimeOriginal = flatExif['exif.DateTimeOriginal'];
  const dateTime = flatExif['exif.DateTime'];

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

  // GPS flags — read directly from the precomputed numeric 'gps' group, not flatExif
  const gpsLat = exifData.gps?.Latitude;
  const gpsLon = exifData.gps?.Longitude;

  if (typeof gpsLat === 'number' && typeof gpsLon === 'number') {
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
  const make = flatExif['exif.Make'];
  const model = flatExif['exif.Model'];

  if (!make || !model) {
    flags.push({
      level: 'yellow',
      message: 'No camera identification in metadata'
    });
  }

  // EXIF-vs-actual dimension mismatch — signals cropping/resizing after metadata was written
  const exifWidth = flatExif['exif.PixelXDimension'];
  const exifHeight = flatExif['exif.PixelYDimension'];
  if (exifWidth && exifHeight && img.bitmap &&
      (Number(exifWidth) !== img.bitmap.width || Number(exifHeight) !== img.bitmap.height)) {
    flags.push({
      level: 'yellow',
      message: `EXIF dimensions (${exifWidth}×${exifHeight}) differ from actual image (${img.bitmap.width}×${img.bitmap.height}) — possible crop/resize after metadata was written`
    });
  }

  // Thumbnail
  if (exifData.Thumbnail?.base64 || exifData.Thumbnail?.image) {
    flags.push({
      level: 'yellow',
      message: 'Embedded thumbnail found — may differ from current image'
    });
  }

  return flags;
}

