/**
 * watermark.js — AI Watermark & Content Credentials checker
 *
 * Three locally-verifiable signals:
 *  1. C2PA / Content Credentials manifest  — binary scan for JUMBF in JPEG/PNG
 *  2. IPTC Digital Source Type            — XMP declaration via ExifReader
 *  3. AI-generator software fingerprints  — XMP/EXIF text search
 *
 * What this tool CANNOT detect (explained in-panel):
 *  • SynthID (proprietary Google detector required)
 *  • Invisible steganographic watermarks (each needs its own trained model)
 *
 * All processing is in-browser. No data is sent anywhere.
 */

import { img, results, getExifData } from './app.js';
import { escapeHtml } from './utils.js';

// ── IPTC cv.iptc.org/newscodes/digitalsourcetype/ → label + severity ──────────
const DST_MAP = {
  trainedAlgorithmicMedia:             { label: 'AI-generated — trained generative model',          sev: 'danger' },
  // eslint-disable-next-line camelcase
  trainedAlgorithmicMedia_composite:   { label: 'AI composite — trained generative model',          sev: 'danger' },
  algorithmicMedia:                    { label: 'Computer-generated / CGI (non-AI)',                 sev: 'warning' },
  compositeSynthetic:                  { label: 'Composite containing synthetic elements',           sev: 'warning' },
  compositeSyntheticAndDigitalCapture: { label: 'Photo composite with AI-synthetic elements',       sev: 'warning' },
  minorHumanEdits:                     { label: 'Real photo — minor AI-assisted edits',             sev: 'warning' },
  digitalCapture:                      { label: 'Original digital camera capture',                  sev: 'success' },
  digitalCaptureUnprocessed:           { label: 'Unprocessed digital capture (raw file)',           sev: 'success' },
  negativeScan:                        { label: 'Scanned from film negative',                       sev: 'success' },
  positiveFilmScan:                    { label: 'Scanned positive film / slide',                    sev: 'success' },
  print:                               { label: 'Scanned from a print',                             sev: 'success' },
};

// ── Known AI generator software patterns ─────────────────────────────────────
const AI_TOOLS = [
  { name: 'Midjourney',             pat: /midjourney/i },
  { name: 'DALL-E / OpenAI',        pat: /dall[-‑·]?e|dalle|openai/i },
  { name: 'Stable Diffusion',       pat: /stable.?diffusion|a1111|automatic1111|comfyui|invokeai|forge/i },
  { name: 'Adobe Firefly',          pat: /firefly/i },
  { name: 'Adobe Generative Fill',  pat: /gentech/i },
  { name: 'Google Imagen',          pat: /\bimagen\b/i },
  { name: 'Bing Image Creator',     pat: /bing.image.creator/i },
  { name: 'Topaz AI',               pat: /topaz/i },
  { name: 'Luminar AI',             pat: /luminar/i },
];

export function initWatermark() {
  document.addEventListener('fts:loaded', runWatermarkChecks);
}

async function runWatermarkChecks() {
  const container = document.getElementById('watermark-results');
  const statusEl  = document.getElementById('watermark-status');

  if (!img.file) {
    container.style.display = 'none';
    statusEl.style.display  = 'block';
    return;
  }

  container.style.display = 'block';
  statusEl.style.display  = 'none';
  container.innerHTML     = '<p class="watermark-scanning">Scanning…</p>';

  // ── 1. C2PA binary scan ────────────────────────────────────────────────────
  const c2pa = detectC2PABytes(img.arrayBuffer, img.type);

  // ── 2. XMP metadata checks (shared cache — no double-parse) ──────────────
  const flatExif = flattenExif(await getExifData());

  const dst    = detectDigitalSourceType(flatExif);
  const aiSoft = detectAIFingerprints(flatExif);

  // ── Store for report ────────────────────────────────────────────────────────
  results.watermark = {
    c2paPresent:       c2pa.present,
    c2paFormat:        c2pa.format,
    digitalSourceType: dst.value || null,
    aiTools:           aiSoft.found,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  container.innerHTML = '';

  // — C2PA —
  if (c2pa.present) {
    container.appendChild(card('success', 'C2PA / Content Credentials', 'Content Credentials detected',
      `A C2PA manifest was found embedded in this ${escapeHtml(c2pa.format)}. ` +
      `Content Credentials record the provenance chain — which tools edited the image and ` +
      `whether AI was involved — using cryptographic signatures. ` +
      `<strong>Presence confirms the creator declared provenance; it does not independently authenticate authenticity.</strong> ` +
      `Full cryptographic verification requires a C2PA validator such as ` +
      `<a href="https://verify.contentauthenticity.org/" target="_blank" rel="noopener noreferrer">Content Authenticity Initiative Verify ↗</a> ` +
      `<em>(third-party — your image is processed on their server if you upload it)</em>.`
    ));
  } else {
    container.appendChild(card('neutral', 'C2PA / Content Credentials', 'No Content Credentials found',
      'No C2PA manifest was detected in this file. This is expected for the vast majority of images — ' +
      'most cameras and editing tools do not yet embed Content Credentials. ' +
      '<strong>Absence does not confirm that no credentials exist</strong> — very large files may store ' +
      'manifests beyond the scan window. Absence is not evidence of manipulation.'
    ));
  }

  // — IPTC DigitalSourceType —
  if (dst.found) {
    const localName = (dst.value || '').split('/').pop().split('#').pop();
    const entry = DST_MAP[localName];
    const sev   = entry ? entry.sev : 'warning';
    const label = entry ? entry.label : `Declared type: ${localName}`;
    container.appendChild(card(sev, 'IPTC Digital Source Type', label,
      `The image contains an IPTC <code>DigitalSourceType</code> field with value ` +
      `<code>${escapeHtml(dst.value)}</code>. ` +
      `This is a <strong>declared</strong> provenance indicator — it reflects what the creator or tool reported, ` +
      `not an independently verifiable fact. It can be added or removed with any metadata editor.`
    ));
  } else {
    container.appendChild(card('neutral', 'IPTC Digital Source Type', 'Not declared',
      'No <code>DigitalSourceType</code> field was found. Most images lack this field — its absence is not meaningful. ' +
      'Adobe Photoshop, Lightroom, and Firefly embed this field when generating or editing AI content.'
    ));
  }

  // — AI fingerprints —
  if (aiSoft.found.length > 0) {
    container.appendChild(card('danger', 'AI Generator Fingerprints', `Detected: ${aiSoft.found.join(', ')}`,
      `Metadata fields reference known AI generation software: ` +
      `<strong>${aiSoft.found.map(escapeHtml).join(', ')}</strong>. ` +
      `Metadata can be removed or fabricated with any metadata editor — presence is a strong indicator ` +
      `but not conclusive proof. Cross-reference with ELA and other analyses.`
    ));
  } else {
    container.appendChild(card('success', 'AI Generator Fingerprints', 'None found in metadata',
      'No known AI tool signatures were found in software, creator, or history fields. ' +
      'AI-generated images are frequently distributed after metadata is stripped, so absence is not conclusive.'
    ));
  }

  // — SynthID (informational) —
  container.appendChild(card('info', 'SynthID (Google DeepMind)', 'Cannot verify locally',
    'SynthID embeds an imperceptible watermark at the pixel level using Google\'s proprietary neural model. ' +
    'Detection requires Google\'s confidential detector — it cannot be run in a browser. ' +
    'SynthID is applied to images generated by Imagen, Gemini, and related Google tools. ' +
    '<a href="https://deepmind.google/technologies/synthid/" target="_blank" rel="noopener noreferrer">About SynthID ↗</a> ' +
    '<em>(third-party)</em>'
  ));

  // — Other invisible watermarks (informational) —
  container.appendChild(card('info', 'Other Invisible Watermarks', 'Cannot verify locally',
    'Watermarking systems such as Tree-Ring, StegaStamp, and proprietary generator marks ' +
    'embed signals in pixel or frequency domains. Each requires its own trained detector model. ' +
    'No general-purpose browser-runnable detector exists for these formats.'
  ));
}

// ── Detection functions ────────────────────────────────────────────────────────

/**
 * Scan file bytes for ASCII 'c2pa' — appears in JUMBF labels and manifest JSON
 * for both JPEG (APP11) and PNG (iTXt/caBX chunk) C2PA containers.
 * Files under 5 MB are scanned in full; larger files get first+last 512 KB.
 */
function detectC2PABytes(arrayBuffer, mimeType) {
  const bytes    = new Uint8Array(arrayBuffer);
  const fileSize = bytes.length;
  const SMALL    = 5 * 1024 * 1024;   // 5 MB threshold
  const WINDOW   = 524288;             // 512 KB scan window for large files

  const zones = fileSize <= SMALL
    ? [[0, fileSize - 4]]
    : [[0, Math.min(WINDOW, fileSize - 4)],
       [Math.max(WINDOW, fileSize - WINDOW), fileSize - 4]];

  for (const [start, end] of zones) {
    for (let i = start; i < end; i++) {
      if (bytes[i]   === 0x63 &&   // 'c'
          bytes[i+1] === 0x32 &&   // '2'
          bytes[i+2] === 0x70 &&   // 'p'
          bytes[i+3] === 0x61) {   // 'a'
        const fmt = mimeType === 'image/jpeg' ? 'JPEG (APP11 / JUMBF)'
                  : mimeType === 'image/png'  ? 'PNG'
                  : mimeType === 'image/webp' ? 'WebP'
                  : 'file';
        return { present: true, format: fmt };
      }
    }
  }
  return { present: false, format: null };
}

/** Find IPTC DigitalSourceType in flattened XMP — namespace-prefix-agnostic. */
function detectDigitalSourceType(flatExif) {
  for (const [key, val] of Object.entries(flatExif)) {
    if (key.toLowerCase().includes('digitalsourcetype')) {
      return { found: true, value: String(val) };
    }
  }
  return { found: false, value: null };
}

/** Match AI generator tool names against all metadata field values. */
function detectAIFingerprints(flatExif) {
  const allText = Object.values(flatExif).join(' ');
  const found   = [];
  for (const { name, pat } of AI_TOOLS) {
    if (pat.test(allText) && !found.includes(name)) found.push(name);
  }
  return { found };
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function card(sev, title, verdict, detail) {
  const ICONS = { danger: '⚠️', warning: '⚡', success: '✅', neutral: '◯', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `watermark-card watermark-${sev}`;
  el.innerHTML = `
    <div class="watermark-card-hd">
      <span class="watermark-card-icon">${ICONS[sev] ?? '◯'}</span>
      <span class="watermark-card-title">${escapeHtml(title)}</span>
      <span class="watermark-card-verdict">${escapeHtml(verdict)}</span>
    </div>
    <p class="watermark-card-body">${detail}</p>
  `;
  return el;
}

/** Flatten ExifReader's nested output into a dot-path key/value map. */
function flattenExif(obj) {
  const flat = {};
  function walk(o, prefix) {
    Object.entries(o || {}).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Blob)) {
        walk(v, key);
      } else if (v != null) {
        flat[key] = v;
      }
    });
  }
  walk(obj, '');
  return flat;
}
