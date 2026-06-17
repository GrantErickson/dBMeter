#!/usr/bin/env node
/**
 * Icon generator for the dB Meter PWA.
 *
 * Pure Node — no native dependencies (sharp/ImageMagick/Inkscape are NOT
 * required). It draws the app's "EQ bar meter" mark (the same design as
 * public/favicon.svg) and emits every icon the manifest and iOS need:
 *
 *   icons/icon.svg                  – scalable source (also used by the manifest)
 *   icons/icon-192x192.png          – "any" purpose, rounded-square
 *   icons/icon-512x512.png
 *   icons/icon-192x192-maskable.png – full-bleed, content in the safe zone
 *   icons/icon-512x512-maskable.png
 *   icons/apple-touch-icon.png      – 180x180 full-bleed for iOS home screen
 *
 * Run with:  npm run generate-icons
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// ---- design (all geometry expressed on a 512x512 reference canvas) ----
const REF = 512;
const BG = { c0: "#1b2c44", c1: "#0d101a", radius: 112 }; // diagonal gradient + squircle-ish corners
const BAR_COLORS = ["#2bb673", "#7ec850", "#e0d96a", "#ff9e64", "#f7768e"];
const BAR_W = 45.4;
const BAR_GAP = 22.7;
const BAR_X0 = 97.3;
const BAR_TOPS = [256, 205, 133, 174, 102]; // y of each bar's top (rising meter, loudest on the right)
const BAR_BOTTOM = 399;
const BAR_RADIUS = 16;

const bars = BAR_COLORS.map((color, i) => {
  const x = BAR_X0 + i * (BAR_W + BAR_GAP);
  const y = BAR_TOPS[i];
  return { x, y, w: BAR_W, h: BAR_BOTTOM - y, r: BAR_RADIUS, color };
});

// ---- tiny vector helpers ----
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const BG0 = hexToRgb(BG.c0);
const BG1 = hexToRgb(BG.c1);
const lerp = (a, b, t) => a + (b - a) * t;

// point inside an axis-aligned rounded rectangle (rr = 0 → plain rect)
function insideRR(x, y, x0, y0, x1, y1, rr) {
  const cx = clamp(x, x0 + rr, x1 - rr);
  const cy = clamp(y, y0 + rr, y1 - rr);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rr * rr;
}

// colour (premultiplication-ready straight RGBA) at a point in reference space
function colorAt(x, y, mode) {
  // bars are on top; for maskable we shrink content to 80% about the centre
  let bx = x;
  let by = y;
  if (mode === "maskable") {
    bx = 256 + (x - 256) / 0.8;
    by = 256 + (y - 256) / 0.8;
  }
  for (const b of bars) {
    if (insideRR(bx, by, b.x, b.y, b.x + b.w, b.y + b.h, b.r)) {
      const [r, g, bl] = hexToRgb(b.color);
      return [r, g, bl, 255];
    }
  }
  const bgRadius = mode === "any" ? BG.radius : 0; // full-bleed for maskable / apple
  if (insideRR(x, y, 0, 0, REF, REF, bgRadius)) {
    const t = clamp((x + y) / (2 * REF), 0, 1);
    return [lerp(BG0[0], BG1[0], t), lerp(BG0[1], BG1[1], t), lerp(BG0[2], BG1[2], t), 255];
  }
  return [0, 0, 0, 0];
}

// render to an RGBA buffer with 4x4 supersampled anti-aliasing
function render(size, mode) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  const scale = REF / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const rx = (px + (sx + 0.5) / ss) * scale;
          const ry = (py + (sy + 0.5) / ss) * scale;
          const [r, g, b, a] = colorAt(rx, ry, mode);
          R += r * a; G += g * a; B += b * a; A += a; // premultiplied accumulation
        }
      }
      const n = ss * ss;
      const idx = (py * size + px) * 4;
      if (A > 0) {
        buf[idx] = Math.round(R / A);
        buf[idx + 1] = Math.round(G / A);
        buf[idx + 2] = Math.round(B / A);
      }
      buf[idx + 3] = Math.round(A / n);
    }
  }
  return buf;
}

// ---- minimal PNG encoder (8-bit RGBA, no external deps) ----
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- scalable source (kept in sync with the raster design above) ----
function buildSvg() {
  const rects = bars
    .map(
      (b) =>
        `  <rect x="${+b.x.toFixed(1)}" y="${b.y}" width="${+b.w.toFixed(1)}" height="${+b.h.toFixed(
          1,
        )}" rx="${b.r}" fill="${b.color}"/>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG.c0}"/>
      <stop offset="1" stop-color="${BG.c1}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${BG.radius}" fill="url(#bg)"/>
${rects}
</svg>
`;
}

// ---- emit everything ----
const targets = [
  { file: "icon-192x192.png", size: 192, mode: "any" },
  { file: "icon-512x512.png", size: 512, mode: "any" },
  { file: "icon-192x192-maskable.png", size: 192, mode: "maskable" },
  { file: "icon-512x512-maskable.png", size: 512, mode: "maskable" },
  { file: "apple-touch-icon.png", size: 180, mode: "apple" },
];

writeFileSync(join(OUT, "icon.svg"), buildSvg());
console.log("wrote icon.svg");
for (const { file, size, mode } of targets) {
  writeFileSync(join(OUT, file), encodePng(size, render(size, mode)));
  console.log(`wrote ${file} (${size}x${size}, ${mode})`);
}
console.log("done.");
