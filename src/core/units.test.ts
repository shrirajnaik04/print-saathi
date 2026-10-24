import { describe, expect, it } from 'vitest';
import { mmToPt, mmToPx, ptToMm } from './units';

describe('units', () => {
  it('converts A4 width to PDF points', () => {
    expect(mmToPt(210)).toBeCloseTo(595.2756, 4);
  });
  it('converts 4x6 inch width exactly', () => {
    expect(mmToPt(101.6)).toBe(288);
  });
  it('converts A4 height back to millimetres', () => {
    expect(ptToMm(841.8898)).toBeCloseTo(297, 3);
  });
  it('gives print pixels at 300 dpi for passport and A4', () => {
    expect(mmToPx(35, 300)).toBe(413);
    expect(mmToPx(45, 300)).toBe(531);
    expect(mmToPx(210, 300)).toBe(2480);
  });
});
