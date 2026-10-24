import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaDownscale, psnr, ssimLuma } from './metrics.mjs';

const img = (w, h, f) => {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data: d };
};

test('identical images give infinite PSNR and SSIM 1', () => {
  const a = img(32, 32, (x, y) => [x * 8, y * 8, 128]);
  assert.equal(psnr(a, a), Infinity);
  assert.ok(Math.abs(ssimLuma(a, a) - 1) < 1e-9);
});

test('a visibly different image scores low', () => {
  const a = img(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, 100]);
  const b = img(64, 64, (x, y) => [((x + y) * 9) % 256, 30, 220]);
  assert.ok(psnr(a, b) < 15);
  assert.ok(ssimLuma(a, b) < 0.5);
});

test('area downscale of a 2x2 block averages exactly', () => {
  const a = img(4, 2, (x) => (x < 2 ? [0, 0, 0] : [200, 100, 50]));
  const d = areaDownscale(a, 2, 1);
  assert.deepEqual([...d.data.slice(0, 3)], [0, 0, 0]);
  assert.deepEqual([...d.data.slice(4, 7)], [200, 100, 50]);
});

test('area downscale handles non-integer ratios by area weighting', () => {
  const a = img(3, 1, (x) => [x === 1 ? 255 : 0, 0, 0]);
  const d = areaDownscale(a, 2, 1); // each output pixel covers 1.5 source pixels
  assert.equal(d.data[0], 85); // (0*1 + 255*0.5) / 1.5
  assert.equal(d.data[4], 85);
});
