# Forensics Toolset — CLAUDE.md

## What this is

A privacy-first collection of digital image forensics tools. Every operation runs entirely
in the user's browser — nothing is uploaded to any server. Built as a single-page app using
vanilla ES modules, no bundler, no build step.

Deployed on Cloudflare Pages: **https://forensics-toolset.pages.dev**  
Source: **https://github.com/patrickdell/forensics-toolset**

---

## Running locally

Open `index.html` directly in a browser, or serve with any static file server:

```
npx serve .
# or
python -m http.server
```

There is no build step, no install step, and no `node_modules`. The `package.json`
exists only to name the project.

---

## Git

Single remote — `forensics-toolset`:

```
git push forensics-toolset master
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Modules | Native ES modules (`type="module"`) |
| Bundler | None |
| Metadata parsing | ExifReader via CDN |
| Metadata injection | piexifjs via CDN |
| Image processing | Canvas API + Web Workers |
| File saving | File System Access API + fallback |
| Hashing | Web Crypto API (`crypto.subtle.digest`) |
| CSS | Single `style.css`, custom properties, no framework |
| Favicon | `favicon.svg` — SVG linked from `<head>` |

---

## File structure

```
index.html              Single HTML file; all panels live here as <section> elements
style.css               All styles; CSS custom properties define the design system
app.js                  Tab routing, image load, shared state, wizard mode, about modal
favicon.svg             SVG favicon — magnifying glass over image grid

── Tool modules (each exports one init* function called from app.js) ──
metadata.js             EXIF/IPTC/XMP extraction + forensic flag checks
ela.js                  Error Level Analysis (re-encode diff + false-colour heatmap)
clone.js                Clone detection coordinator + result rendering
clone.worker.js         Web Worker — block feature extraction + K-nearest-neighbour match
strip.js                Metadata stripping with keep-date / keep-copyright options
report.js               Compile findings → window.print() PDF

── Utilities ──
utils.js                setupDropzone, setActiveChip, saveFile, setProgress,
                        formatBytes, sha256, escapeHtml

── Cloudflare Pages ──
package.json            { "name": "forensics-toolset", "private": true }
_redirects              Cloudflare Pages routing stub
CLAUDE.md               This file
```

---

## Design system

Cool-grey palette with clinical aesthetic — images and analysis are the visual focus.
No light/dark mode toggle — single dark theme optimised for colour-critical analysis.

Key tokens:

| Property | Role | Value |
|----------|------|-------|
| `--bg` | Page background | `#0f1117` |
| `--card` | Panel / card surface | `#1a1d26` |
| `--card2` | Hover state / inset surface | `#22263a` |
| `--ink` | Primary text | `#e8eaf0` |
| `--muted` | Secondary text, labels | `#7a8099` |
| `--accent` | Interactive highlight | `#4d9fff` |
| `--accent-hover` | Hover state | `#6ab2ff` |
| `--line` | Borders and dividers | `#2d3148` |
| `--success` | Positive finding (green) | `#3ecf8e` |
| `--warning` | Caution flag (yellow) | `#f5a623` |
| `--danger` | Suspicious finding (red) | `#ff5f5f` |
| `--code-bg` | Code/monospace background | `#0a0c14` |
| `--code-text` | Code/monospace text | `#a8c4ff` |

---

## Adding a new tool

1. Create `mytool.js` exporting `export function initMyTool() { … }`.
2. Add the panel `<section id="panel-mytool">…</section>` in `index.html`.
3. Add a tab button `<button class="tab-btn" data-tab="mytool">…</button>` in the nav.
4. Register the panel in `app.js` `panels` map: `mytool: 'panel-mytool'`.
5. Import and call `initMyTool()` from `app.js`.
6. In `initMyTool`, register `fts:loaded` listener and wire any button/chip listeners.
   **All addEventListener calls go in init*, not inside the fts:loaded handler** —
   the fts:loaded handler fires on every image load and would stack duplicate listeners.
7. Store results in `results.mytool = { … }` for the report.

---

## Key patterns

### Shared image state (app.js)

```js
export const img = {
  file:        null,   // original File
  arrayBuffer: null,   // for EXIF + SHA-256
  bitmap:      null,   // ImageBitmap for canvas ops
  name:        null,
  type:        null,   // MIME type
  isJpeg:      false,
};

export const results = {
  meta: null, ela: null, clone: null, strip: null,
};
```

### Image load event

```js
document.dispatchEvent(new CustomEvent('fts:loaded', { detail: img }));
```

Each tool module listens for this event. The handler should only reset UI state and
trigger analysis — **not** register new event listeners (those go in `init*`).

### init* structure

```js
export function initMyTool() {
  // Wire all persistent listeners here — runs once at page load
  document.getElementById('my-btn').addEventListener('click', doSomething);
  document.getElementById('my-chips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => { … });
  });
  // Register image-load handler last
  document.addEventListener('fts:loaded', setupMyTool);
}

async function setupMyTool() {
  // Reset UI state and run analysis — called on every new image
  if (!img.bitmap) return;
  …
}
```

### File saves

`saveFile(blob, filename, mimeType)` in `utils.js` — tries the File System Access
API first (shows a native save dialog), falls back to a hidden `<a download>` click.

### Dropzones

`setupDropzone(el, filter, handler)` in `utils.js` — handles drag-and-drop and
`<input type="file">` for a given drop target element. `filter` is a function that
returns true for accepted files (e.g. `f => f.type.startsWith('image/')`).

### Chip groups

`setActiveChip(container, activeBtn)` in `utils.js` — removes `.active` from all
chips in the container and adds it to `activeBtn`.

### Utility functions in utils.js

| Function | Signature | Purpose |
|----------|-----------|---------|
| `setupDropzone` | `(el, filter, handler)` | Drag-and-drop + browse |
| `setActiveChip` | `(container, activeBtn)` | Chip group selection |
| `saveFile` | `(blob, name, mime)` | Download a Blob |
| `setProgress` | `(barEl, labelEl, pct, text)` | Progress bar update |
| `formatBytes` | `(bytes)` | Human-readable file size |
| `sha256` | `(arrayBuffer)` → hex string | SHA-256 digest |
| `escapeHtml` | `(text)` | Escape HTML special chars (cached div) |

### Web Workers

`clone.worker.js` runs block matching off the main thread to avoid UI freezing.
Use `postMessage` with a transferred ArrayBuffer for zero-copy image data:

```js
worker.postMessage({ pixels, width, height, … }, [imageData.data.buffer]);
```

Progress is reported via `{ type: 'progress', progress: 0–100 }` messages.
Results arrive as `{ type: 'result', matches: […] }`.

### Canvas heatmaps

ELA and clone analyses store data URLs for report embedding:

```js
results.ela.canvas = canvas.toDataURL();
```

---

## Forensic tools overview

### Metadata (metadata.js)

- Extracts EXIF, IPTC, XMP using ExifReader CDN
- Computes SHA-256 via Web Crypto
- Displays forensically relevant fields by default; "Show all fields" toggle for extended view
- Flags:
  - **Red**: AI generation tools detected, GPS 0°0°, DateTime inconsistencies
  - **Yellow**: Editing software, missing device info, embedded thumbnails
  - **Green**: GPS location detected

### ELA (ela.js)

- Re-encodes image as JPEG and compares per-pixel differences
- Heatmap: dark blue (0) → green (50) → yellow (150) → red (255+)
- Quality chips: 75 (default), 90, 95
- Amplification chips: 5×, 10×, 15× (default), 20×
- Display modes: ELA only, side-by-side with original, overlay at 70%
- Non-JPEG warning shown; ELA still runs for reference
- `currentELA` only stores the difference ImageData — original is drawn from `img.bitmap`
  on demand to avoid holding a second full-resolution copy in memory

### Clone Detection (clone.js + clone.worker.js)

- Detects copy-move forgery by finding similar image regions at different positions
- Algorithm: Y-channel greyscale → overlapping 16×16 blocks → row/column feature
  vectors → lexicographic sort → K-nearest-neighbour L2 distance comparison
- Variance filter (`MIN_BLOCK_VARIANCE = 80`) skips smooth/uniform regions (sky, walls)
  that would otherwise generate noise
- Sensitivity settings:

  | Setting | Stride | Threshold | K |
  |---------|--------|-----------|---|
  | Low (default) | 16px | 0.10 | 2 |
  | Medium | 8px | 0.07 | 3 |
  | High | 4px | 0.05 | 4 |

- Capped at 60 matches to avoid visual noise
- Size warning if > 2MP; option to analyse at 50% scale (single canvas draw, no
  intermediate bitmap)
- Results: colour-coded rectangles with connecting lines on annotated canvas

### Metadata Stripper (strip.js)

- Strip all: canvas re-encode only, zero metadata
- Keep date/time: re-inject DateTimeOriginal via piexifjs after strip
- Keep copyright: strip GPS/device, preserve Artist/Copyright/IPTC fields
- JPEG quality slider: 70–100 (default 92)
- Shows before/after field counts

### Report (report.js)

- Compiles findings from all completed analyses
- Sections: File integrity, Forensic flags, Metadata fields, ELA image, Clone map
- Print button wired once in `initReport` (not on every tool completion)
- Opens a new window with light-mode print CSS for clean PDF output
- Includes disclaimer and analysis context

---

## Licence

Copyright © 2026 Patrick Dell. Free for personal, educational, and non-commercial use.
This tool is intended to assist forensic analysis, not replace it. Findings should always
be reviewed by a qualified professional.

---

## Verification checklist

1. Drop a JPEG → loader bar shows filename + dimensions + file size, all tabs become active
2. Metadata tab: fields table, SHA-256 shown, relevant flags appear
3. ELA tab: heatmap renders, changing quality/amplification updates immediately
4. ELA tab: drop a PNG → non-JPEG warning appears, ELA still runs
5. Clone tab: click Analyse → progress bar runs, result shows on completion
6. Clone tab: large image (>2MP) → size warning appears
7. Clone tab: load 3 images in sequence → clicking Analyse only fires once per click
8. Strip tab: strip all → download JPEG, metadata reduced to zero
9. Strip tab: keep date → downloaded file has DateTimeOriginal, no GPS
10. Report tab: all analyses complete → report shows all findings sections
11. Report tab: click Print → new window opens, PDF preview renders
12. Wizard: click 🧭 → overlay appears, steps advance, explanations open by default
13. Wizard: Exit wizard → tabs visible, results still shown
14. Resize to 480px → hamburger menu appears, nav drawer works
15. localStorage persistence: refresh → same tab active, explanation toggles same state
