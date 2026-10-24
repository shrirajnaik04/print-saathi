import { describe, expect, it } from 'vitest';
import { dragCorner, moveBox, scaleBox } from './crop';

// Phase 9 manual crop (PLAN §H2.5): big buttons and corner handles; the frame never leaves the photo.
const near = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k], k).toBeCloseTo(b[k], 9);
};

describe('manual crop frame', () => {
  it('moves by steps and stops at the photo edge', () => {
    near(moveBox({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 0.05, -0.05), { x: 0.15, y: 0.05, w: 0.5, h: 0.5 });
    near(moveBox({ x: 0.45, y: 0.02, w: 0.5, h: 0.5 }, 0.2, -0.2), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('grows and shrinks about its centre, never beyond the photo and never below 5 %', () => {
    near(scaleBox({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1.2), { x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
    near(scaleBox({ x: 0, y: 0, w: 0.9, h: 0.9 }, 2), { x: 0, y: 0, w: 1, h: 1 });
    near(scaleBox({ x: 0.5, y: 0.5, w: 0.05, h: 0.05 }, 0.5), { x: 0.5, y: 0.5, w: 0.05, h: 0.05 });
  });

  it('a dragged corner changes the shape; the opposite corner stays', () => {
    near(dragCorner({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'br', 0.1, -0.2), { x: 0.2, y: 0.2, w: 0.6, h: 0.3 });
    near(dragCorner({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'tl', -0.5, 0.1), { x: 0, y: 0.3, w: 0.7, h: 0.4 });
    // Never thinner than 5 %, never outside.
    near(dragCorner({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'tr', -0.9, -0.9), { x: 0.2, y: 0, w: 0.05, h: 0.7 });
  });
});
