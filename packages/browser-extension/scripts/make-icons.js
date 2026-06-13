#!/usr/bin/env node
// Generates the Veyr browser-extension icons (toolbar + Chrome Web Store):
// the dark rounded tile with two arcs and three falling dots — the same mark as
// the desktop app and favicon. Pixel-drawn, no image deps.
//
// Writes icons/{16,32,48,128}.png.

const { deflateSync } = require("node:zlib");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ICONS = join(__dirname, "..", "icons");
mkdirSync(ICONS, { recursive: true });

// --- minimal PNG encoder (8-bit RGBA) ---------------------------------------
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4 + 1;
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

// --- drawing (geometry in 48x48 space, matches favicon.svg) -----------------
const TILE = [0x0a, 0x0f, 0x1e];
const DOT = [0x3e, 0x7b, 0xff];
const ARC1 = [[0x5e, 0xa2, 0xff], [0x2e, 0x6b, 0xff]];
const ARC2 = [[0x3e, 0x7b, 0xff], [0x1d, 0x4e, 0xd8]];
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
function insideTile(x, y) {
  const r = CORNER_R;
  if (x < 0 || x > 48 || y < 0 || y > 48) return false;
  const cx = x < r ? r : x > 48 - r ? 48 - r : null;
  const cy = y < r ? r : y > 48 - r ? 48 - r : null;
  if (cx === null || cy === null) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function markColor(x, y) {
  for (const a of arcs) {
    const cy = a.chordY + Math.sqrt(a.r ** 2 - ((a.x1 - a.x0) / 2) ** 2);
    const t = Math.min(1, Math.max(0, (x - a.x0) / (a.x1 - a.x0)));
    const color = lerp(a.grad[0], a.grad[1], t);
    const d = Math.sqrt((x - 24) ** 2 + (y - cy) ** 2);
    if (y <= a.chordY && Math.abs(d - a.r) <= a.halfW) return color;
    if ((x - a.x0) ** 2 + (y - a.chordY) ** 2 <= a.halfW ** 2) return color;
    if ((x - a.x1) ** 2 + (y - a.chordY) ** 2 <= a.halfW ** 2) return color;
  }
  for (const dot of dots) {
    if ((x - 24) ** 2 + (y - dot.cy) ** 2 <= dot.r ** 2) return DOT;
  }
  return null;
}
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3; // supersample for crisp small sizes
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((x + (sx + 0.5) / SS) / size) * 48;
          const uy = ((y + (sy + 0.5) / SS) / size) * 48;
          if (!insideTile(ux, uy)) continue;
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

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(ICONS, `${size}.png`), drawIcon(size));
}
console.log("Veyr extension icons written to", ICONS);
