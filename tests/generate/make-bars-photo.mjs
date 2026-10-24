// Phase 9 device check: a synthetic photo with black bars (letterbox) for the smart-crop flow; never a customer file.
// Usage: node tests/generate/make-bars-photo.mjs <out.jpg>   (1600 × 1000, bars 120 px top and bottom)
import { writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const w = 1600;
const h = 1000;
const data = Buffer.alloc(w * h * 4);
const v = (a) => Math.max(0, Math.min(255, Math.round(a)));
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const bar = y < 120 || y >= 880;
    data[i] = bar ? 2 : v(120 + 70 * Math.sin(x / 40) * Math.cos(y / 55));
    data[i + 1] = bar ? 2 : v(110 + 60 * Math.cos(x / 70));
    data[i + 2] = bar ? 2 : v(100 + 50 * Math.sin(y / 33));
    data[i + 3] = 255;
  }
writeFileSync(process.argv[2], jpeg.encode({ data, width: w, height: h }, 95).data);
