import { describe, expect, it } from 'vitest';
import { nextZoom, ZOOM_STEPS } from './zoom';

describe('zoom steps on Adjust (owner, round 4)', () => {
  it('goes 100 % to 400 % in steps', () => {
    expect(ZOOM_STEPS).toEqual([1, 1.5, 2, 3, 4]);
  });
  it('Zoom in goes to the next step up, and stops at 400 %', () => {
    expect(nextZoom(1, 1)).toBe(1.5);
    expect(nextZoom(3, 1)).toBe(4);
    expect(nextZoom(4, 1)).toBe(4);
  });
  it('Zoom out goes to the next step down, and stops at 100 %', () => {
    expect(nextZoom(2, -1)).toBe(1.5);
    expect(nextZoom(1, -1)).toBe(1);
  });
  it('after a pinch (between steps) the buttons go to the nearest step that way', () => {
    expect(nextZoom(1.7, 1)).toBe(2);
    expect(nextZoom(1.7, -1)).toBe(1.5);
    expect(nextZoom(2.0000001, -1)).toBe(1.5);
  });
});
