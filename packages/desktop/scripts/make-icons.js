#!/usr/bin/env node
// Generates the Canopy app icons: dark rounded tile, two canopy arcs, three
// falling dots (programmatic recreation of the brand mark — keep in sync with
// packages/dashboard/public/favicon.svg).
//
// Writes (all in ../assets):
//   icon.svg   — editable source of truth
//   icon.png   — 512x512 RGBA, drawn pixel-by-pixel (no image deps)
//   icon.ico   — Windows icon wrapping a 256x256 PNG (PNG-in-ICO format)
//   icon.icns  — macOS icon via `iconutil` (macOS only)

const { deflateSync } = require("node:zlib");
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const ASSETS = join(__dirname, "..", "assets");
mkdirSync(ASSETS, { recursive: true });

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlace)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  const stride = size * 4 + 1; // filter byte per scanline
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing — geometry in the favicon's 48x48 space, scaled to `size`
// ---------------------------------------------------------------------------
const TILE = [0x0a, 0x0f, 0x1e];
const DOT = [0x3e, 0x7b, 0xff];
// x-gradient stops [left RGB, right RGB] per arc
const ARC1 = [[0x5e, 0xa2, 0xff], [0x2e, 0x6b, 0xff]];
const ARC2 = [[0x3e, 0x7b, 0xff], [0x1d, 0x4e, 0xd8]];

// Arcs as "M x0 y A r r 0 0 1 x1 y": circle center is below the chord.
const arcs = [
  { x0: 8, x1: 40, chordY: 21, r: 18, halfW: 2.2, grad: ARC1 },
  { x0: 14, x1: 34, chordY: 26.5, r: 12, halfW: 1.8, grad: ARC2 },
];
const dots = [
  { cy: 33, r: 2.3 },
  { cy: 38.6, r: 2 },
  { cy: 43.6, r: 1.7 },
];
const CORNER_R = 11;

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function insideRoundedTile(x, y) {
  const r = CORNER_R;
  if (x < 0 || x > 48 || y < 0 || y > 48) return false;
  const cx = x < r ? r : x > 48 - r ? 48 - r : null;
  const cy = y < r ? r : y > 48 - r ? 48 - r : null;
  if (cx === null || cy === null) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Color of the mark at point (x,y) in 48-space, or null for tile color. */
function markColor(x, y) {
  for (const a of arcs) {
    const cy = a.chordY + Math.sqrt(a.r ** 2 - ((a.x1 - a.x0) / 2) ** 2);
    const t = Math.min(1, Math.max(0, (x - a.x0) / (a.x1 - a.x0)));
    const color = lerp(a.grad[0], a.grad[1], t);
    const d = Math.sqrt((x - 24) ** 2 + (y - cy) ** 2);
    // stroked arc band, above the chord only
    if (y <= a.chordY && Math.abs(d - a.r) <= a.halfW) return color;
    // round end caps
    if ((x - a.x0) ** 2 + (y - a.chordY) ** 2 <= a.halfW ** 2) return color;
    if ((x - a.x1) ** 2 + (y - a.chordY) ** 2 <= a.halfW ** 2) return color;
  }
  for (const dot of dots) {
    if ((x - 24) ** 2 + (y - dot.cy) ** 2 <= dot.r ** 2) return DOT;
  }
  return null;
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4); // starts fully transparent
  const SS = 2; // 2x2 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((x + (sx + 0.5) / SS) / size) * 48;
          const uy = ((y + (sy + 0.5) / SS) / size) * 48;
          if (!insideRoundedTile(ux, uy)) continue;
          const c = markColor(ux, uy) ?? TILE;
          rs += c[0]; gs += c[1]; bs += c[2]; as += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (as > 0) {
        const cover = as / (255 * n);
        px[i] = Math.round(rs / (n * cover));
        px[i + 1] = Math.round(gs / (n * cover));
        px[i + 2] = Math.round(bs / (n * cover));
        px[i + 3] = Math.round(as / n);
      }
    }
  }
  return encodePng(px, size);
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <!-- Canopy mark — keep in sync with packages/dashboard/public/favicon.svg -->
  <defs>
    <linearGradient id="arc1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5EA2FF"/>
      <stop offset="1" stop-color="#2E6BFF"/>
    </linearGradient>
    <linearGradient id="arc2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3E7BFF"/>
      <stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="11" fill="#0A0F1E"/>
  <path d="M 8 21 A 18 18 0 0 1 40 21" fill="none" stroke="url(#arc1)" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M 14 26.5 A 12 12 0 0 1 34 26.5" fill="none" stroke="url(#arc2)" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="24" cy="33" r="2.3" fill="#3E7BFF"/>
  <circle cx="24" cy="38.6" r="2" fill="#3E7BFF"/>
  <circle cx="24" cy="43.6" r="1.7" fill="#3E7BFF"/>
</svg>
`;
writeFileSync(join(ASSETS, "icon.svg"), svg);

const png512 = drawIcon(512);
writeFileSync(join(ASSETS, "icon.png"), png512);

// ICO: single 256x256 entry, PNG-encoded (supported since Vista).
const png256 = drawIcon(256);
const icoHeader = Buffer.alloc(6 + 16);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type: icon
icoHeader.writeUInt16LE(1, 4); // count
icoHeader[6] = 0; // width 256 -> 0
icoHeader[7] = 0; // height 256 -> 0
icoHeader.writeUInt16LE(1, 10); // color planes
icoHeader.writeUInt16LE(32, 12); // bpp hint
icoHeader.writeUInt32LE(png256.length, 14);
icoHeader.writeUInt32LE(22, 18); // data offset
writeFileSync(join(ASSETS, "icon.ico"), Buffer.concat([icoHeader, png256]));

// ICNS via iconutil (macOS only).
if (process.platform === "darwin") {
  const setDir = mkdtempSync(join(tmpdir(), "canopy-icon-"));
  const iconset = join(setDir, "icon.iconset");
  mkdirSync(iconset);
  for (const s of [16, 32, 64, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${s}x${s}.png`), drawIcon(s));
    if (s <= 256) writeFileSync(join(iconset, `icon_${s}x${s}@2x.png`), drawIcon(s * 2));
  }
  try {
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(ASSETS, "icon.icns")]);
  } catch (err) {
    console.warn("iconutil failed — icon.icns not generated:", err.message);
  } finally {
    rmSync(setDir, { recursive: true, force: true });
  }
} else {
  console.warn("Not macOS — skipping icon.icns (electron-builder can fall back to icon.png).");
}

console.log("Canopy icons written to", ASSETS);
