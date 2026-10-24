// Phase 10 performance check (PLAN §P "20 × 12 MP photos on 2 pages"): synthetic camera-like photos, never customer
// files. Usage: node tests/generate/make-big-photos.mjs <dir> [count=20] [width=4000] [height=3000]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';

const [dir, n = '20', w = '4000', h = '3000'] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const W = Number(w);
const H = Number(h);
for (let k = 1; k <= Number(n); k++) {
  const data = Buffer.alloc(W * H * 4);
  let seed = k * 9973;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const g = (rnd() - 0.5) * 18; // camera-like grain
      data[i] = Math.max(0, Math.min(255, 128 + 90 * Math.sin(x / (300 + k * 7)) + g));
      data[i + 1] = Math.max(0, Math.min(255, 120 + 80 * Math.cos(y / (260 + k * 5)) + g));
      data[i + 2] = Math.max(0, Math.min(255, 110 + 70 * Math.sin((x + y) / 410) + g));
      data[i + 3] = 255;
    }
  writeFileSync(path.join(dir, `big-${k}.jpg`), jpeg.encode({ data, width: W, height: H }, 90).data);
  console.log(`big-${k}.jpg`);
}
