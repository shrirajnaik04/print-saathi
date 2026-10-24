import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worstRow } from './compare-raw.mjs';

const img = (w, h, f) => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
};

test('worstRow finds a single damaged row (a strip seam) that an average would hide', () => {
  const a = img(64, 64, (x, y) => [x * 4, y * 4, 100]);
  const b = img(64, 64, (x, y) => (y === 37 ? [0, 0, 0] : [x * 4, y * 4, 100]));
  const r = worstRow(a, b);
  assert.equal(r.row, 37);
  assert.ok(r.psnrDb < 20);
});

test('identical images have an infinite worst-row PSNR', () => {
  const a = img(8, 8, () => [10, 20, 30]);
  assert.equal(worstRow(a, a).psnrDb, Number.POSITIVE_INFINITY);
});
