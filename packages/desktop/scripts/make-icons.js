#!/usr/bin/env node
// Generates PLACEHOLDER app icons: a blue square with blocky white "PL".
// Real icons must replace these before publishing.
//
// Writes (all in ../assets):
//   icon.svg   — editable source of truth
//   icon.png   — 512x512, drawn pixel-by-pixel (no image deps)
//   icon.ico   — Windows icon wrapping a 256x256 PNG (PNG-in-ICO format)
//   icon.icns  — macOS icon via `iconutil` (skipped with a warning elsewhere)

const { deflateSync } = require("node:zlib");
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const ASSETS = join(__dirname, "..", "assets");
mkdirSync(ASSETS, { recursive: true });

const BLUE = [0x3b, 0x82, 0xf6];
const WHITE = [0xff, 0xff, 0xff];

// 5x7 cell bitmaps for "P" and "L".
const GLYPHS = {
  P: ["1111", "1001", "1001", "1111", "1000", "1000", "1000"],
  L: ["1000", "1000", "1000", "1000", "1000", "1000", "1111"],
};

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGB, no interlace)
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
  ihdr[9] = 2; // color type: truecolor RGB
  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Draw the placeholder: blue square, white "PL"
// ---------------------------------------------------------------------------
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) px.set(BLUE, i * 3);

  const cell = Math.floor(size / 16); // glyphs are 4x7 cells each
  const gap = cell;
  const totalW = 4 * cell + gap + 4 * cell;
  const totalH = 7 * cell;
  const ox = Math.floor((size - totalW) / 2);
  const oy = Math.floor((size - totalH) / 2);

  const blit = (rows, startX) => {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] !== "1") continue;
        for (let y = oy + r * cell; y < oy + (r + 1) * cell; y++) {
          for (let x = startX + c * cell; x < startX + (c + 1) * cell; x++) {
            px.set(WHITE, (y * size + x) * 3);
          }
        }
      }
    }
  };
  blit(GLYPHS.P, ox);
  blit(GLYPHS.L, ox + 4 * cell + gap);
  return encodePng(px, size);
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <!-- PLACEHOLDER icon — replace with real artwork before publishing -->
  <rect width="512" height="512" rx="96" fill="#3B82F6"/>
  <text x="256" y="332" font-family="Helvetica, Arial, sans-serif" font-size="220"
        font-weight="bold" fill="#fff" text-anchor="middle">PL</text>
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
  const setDir = mkdtempSync(join(tmpdir(), "pl-icon-"));
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

console.log("Placeholder icons written to", ASSETS);
console.log("⚠ Replace with real artwork before publishing.");
