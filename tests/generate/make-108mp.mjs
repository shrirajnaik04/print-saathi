// Generates the 108 MP (12000x9000) fixture for spike (e): smooth gradients, saturated colour strips,
// a photo-like noisy band (realistic entropy, so decode cost is not understated), a 64 px checkerboard
// band and a 200 px magenta border marker. Baseline sRGB JPEG, EXIF orientation 1.
// Usage: node --max-old-space-size=8192 tests/generate/make-108mp.mjs [out]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';

const W = 12000;
const H = 9000;
const out = process.argv[2] || 'tests/fixtures-large/108mp.jpg';
const data = Buffer.alloc(W * H * 4);
const t0 = Date.now();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let r;
    let g;
    let b;
    if (x < 200 || y < 200 || x >= W - 200 || y >= H - 200) {
      [r, g, b] = [230, 0, 200]; // border marker
    } else if (y < 3000) {
      r = Math.round((x / W) * 255); // horizontal + vertical gradients
      g = Math.round((y / 3000) * 255);
      b = 128;
    } else if (y < 6000) {
      const strip = Math.floor(x / 750) % 6; // saturated colour strips
      [r, g, b] = [
        [220, 30, 30],
        [30, 180, 60],
        [30, 60, 220],
        [240, 200, 20],
        [20, 200, 200],
        [40, 40, 40],
      ][strip];
    } else if (y < 7500) {
      // Deterministic pseudo-random texture over a gradient, like foliage/skin detail in a real photo.
      const n = ((x * 73856093) ^ (y * 19349663)) & 63;
      r = Math.min(255, 60 + Math.round((x / W) * 120) + n);
      g = Math.min(255, 90 + n * 2);
      b = Math.min(255, 40 + Math.round((y / H) * 100) + (n >> 1));
    } else {
      const c = (Math.floor(x / 64) + Math.floor(y / 64)) % 2 ? 235 : 20; // checkerboard band
      [r, g, b] = [c, c, c];
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}
const enc = jpeg.encode({ data, width: W, height: H }, 90);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, enc.data);
console.log(`wrote ${out}: ${W}x${H}, ${enc.data.length} bytes in ${Math.round((Date.now() - t0) / 1000)} s`);
