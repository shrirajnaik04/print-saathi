import { describe, expect, it } from 'vitest';
import { colourShare, hasColour } from './chroma';

// Round 10: the first guess of "Some in colour": which pages have colour in them, from the page's small picture.
const grey = (n: number, v = 40) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : v));
const paint = (px: Uint8ClampedArray, from: number, count: number, rgb: [number, number, number]) => {
  for (let i = from; i < from + count; i++) px.set([...rgb, 255], i * 4);
  return px;
};

describe('colourShare', () => {
  it('a page of black text on white has none', () => {
    const px = grey(10_000, 255);
    for (let i = 0; i < 10_000; i += 7) px.set([20, 20, 20, 255], i * 4);
    expect(colourShare(px)).toBe(0);
    expect(hasColour(colourShare(px))).toBe(false);
  });

  it('JPEG noise on grey and a cream scan do not count as colour', () => {
    const px = grey(10_000, 200);
    for (let i = 0; i < 10_000; i += 3) px.set([200 + (i % 7), 200, 200 - (i % 5), 255], i * 4);
    for (let i = 1; i < 10_000; i += 3) px.set([246, 240, 226, 255], i * 4); // cream paper: chroma 20
    expect(hasColour(colourShare(px))).toBe(false);
  });

  it('a small red stamp is colour', () => {
    const px = paint(grey(10_000, 255), 100, 200, [200, 30, 30]);
    expect(colourShare(px)).toBeCloseTo(0.02, 3);
    expect(hasColour(colourShare(px))).toBe(true);
  });

  it('a coloured photo is colour; transparent pixels are ignored', () => {
    expect(hasColour(colourShare(paint(grey(1000, 128), 0, 1000, [30, 120, 200])))).toBe(true);
    const clear = new Uint8ClampedArray(4000).fill(0);
    for (let i = 0; i < 1000; i++) clear.set([255, 0, 0, 0], i * 4);
    expect(colourShare(clear)).toBe(0);
  });

  it('an empty picture has none', () => {
    expect(colourShare(new Uint8ClampedArray(0))).toBe(0);
  });
});
