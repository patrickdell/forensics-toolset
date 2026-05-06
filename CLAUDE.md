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
utils.js                saveFile, setupDropzone, setProgress, formatBytes, sha256
favicon.svg             Magnifying glass icon, blue accent

── Cloudflare Pages ──
package.json            { "name": "forensics-toolset", "private": true }
_redirects              / /index.html 200
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
6. Listen for `document.dispatchEvent(new CustomEvent('fts:loaded', { detail: img }))`
   to know when image is ready.
7. Store results in `results.mytool = { … }` for the report.

---

## Key patterns

### Shared image state (app.js)

```js
const img = {
  file:       null,   // original File
  arrayBuffer: null,  // for EXIF + SHA-256
  bitmap:     null,   // ImageBitmap for canvas ops
  name:       null,
  type:       null,   // MIME type
  isJpeg:     false,
};
```

### Image load event

```js
document.dispatchEvent(new CustomEvent('fts:loaded', { detail: img }));
```

Each tool module listens for this event to know when it's safe to begin analysis.

### File saves

`saveFile(blob, filename, mimeType)` in `utils.js` — tries the File System Access
API first (shows a native save dialog), falls back to a hidden `<a download>` click.

### Dropzones

`setupDropzone(el, filter, handler)` in `utils.js` — handles drag-and-drop and
`<input type="file">` for a given drop target element.

### Explanation toggles

Each tool panel has a toggleable explanation block wired with:
```js
localStorage.setItem('fts_explain_[toolname]', 'open'|'closed')
```

Default: open in wizard mode, closed in tab mode.

### Web Workers

`clone.worker.js` runs block matching off the main thread to avoid UI freezing.
Use `postMessage` with transferred ArrayBuffer for zero-copy image data:

```js
worker.postMessage({ pixels, width, height, … }, [imageData.data.buffer]);
```

### Canvas heatmaps

ELA and other analyses output canvas elements stored in `results.*` for report
embedding:

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
  - **Red**: AI generation tools, GPS 0°0°, DateTime inconsistencies
  - **Yellow**: Editing software, missing device info, embedded thumbnails
  - **Green**: GPS location detected

### ELA (ela.js)

- Re-encodes image as JPEG and compares pixel differences
- Heatmap: dark blue (0) → green (50) → yellow (150) → red (255+)
- Quality slider: 75, 90, 95
- Amplification slider: 5×, 10×, 15×, 20× (default 15×)
- Display modes: ELA only, side-by-side with original, overlay at 70%
- Non-JPEG warning: ELA designed for JPEG analysis

### Clone Detection (clone.js + clone.worker.js)

- Detects copy-move forgery by finding similar regions at different positions
- Algorithm: Y-channel greyscale → overlapping 16×16 blocks → DCT features →
  lexicographic sort → K-nearest-neighbour comparison
- Sensitivity: Low (stride 16, threshold 0.35), Medium (8, 0.25), High (4, 0.18)
- Size warning if > 2MP; option to analyse at 50% scale
- Results shown as colour-coded rectangles with connecting lines
- Limitations: rotation/scaling partially resistant; smooth areas generate noise

### Metadata Stripper (strip.js)

- Strip all: canvas re-encode only, zero metadata
- Keep date/time: re-inject DateTimeOriginal via piexifjs after strip
- Keep copyright: strip GPS/device, preserve Artist/Copyright/IPTC fields
- JPEG quality slider: 70–100 (default 92)
- Shows before/after field counts

### Report (report.js)

- Compiles findings from all analyses
- Sections: File integrity, Forensic flags, Metadata fields, ELA image, Clone map
- One-click print to PDF via `window.print()`
- Includes disclaimer and analysis context

---

## Licence

Copyright © 2026 Patrick Dell. Free for personal, educational, and non-commercial use.
This tool is intended to assist forensic analysis, not replace it. Findings should always
be reviewed by a qualified professional.

---

## Deployment (Cloudflare Pages)

After code is ready locally:

1. **Create GitHub repo**
   - Go to github.com/new
   - Name: `forensics-toolset`
   - Leave empty (no README)

2. **Push code**
   ```
   cd C:\Code\ForensicsToolset
   git init
   git add .
   git commit -m "Initial commit — Forensics Toolset"
   git remote add forensics-toolset https://github.com/patrickdell/forensics-toolset.git
   git push -u forensics-toolset master
   ```

3. **Connect to Cloudflare Pages**
   - https://dash.cloudflare.com → Pages → Create a project → Connect to Git
   - Select `forensics-toolset` repository
   - Build settings:
     - Framework: None
     - Build command: (leave blank)
     - Build output: `/` (root)
   - Click **Save and Deploy**

4. **Domain**
   - Cloudflare assigns `forensics-toolset.pages.dev` automatically
   - Custom domain can be set later under Settings → Custom domains

---

## Verification checklist

1. Drop a JPEG → loader bar shows filename, all tabs become active
2. Metadata tab: fields table, SHA-256 shown, relevant flags appear
3. ELA tab: heatmap renders, changing quality/amplification updates immediately
4. ELA tab: drop a PNG → non-JPEG warning appears, ELA still runs
5. Clone tab: click Analyse → progress bar runs, result shows on completion
6. Clone tab: large image (>2MP) → size warning appears
7. Strip tab: strip all → download JPEG, metadata reduced to zero
8. Strip tab: keep date → downloaded file has DateTimeOriginal, no GPS
9. Report tab: all analyses complete → report shows findings
10. Report tab: click Print → PDF preview opens
11. Wizard: click 🧭 → overlay appears, steps advance, explanations open by default
12. Wizard: Exit wizard → tabs visible, results still shown
13. Resize to 480px → hamburger menu appears, nav drawer works
14. localStorage persistence: refresh → same tab active, explanation toggles same state

