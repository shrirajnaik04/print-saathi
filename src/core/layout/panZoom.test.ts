import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centredFrame } from '../plan/plan';
import { panPhoto, zoomPhoto } from './panZoom';

// Fit the face, the WhatsApp way (owner, 2026-10-23): the frame stands still, the photo moves and zooms under it. The
// numbers are still the part of the photo inside the frame (fractions of the photo as shown).
const FRAME = 35 / 45;
const inside = (r: { x: number; y: number; w: number; h: number }) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

describe('pan and zoom under a still frame', () => {
  it('pan keeps the frame inside the photo, the same size', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 3, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (shown, dx, dy) => {
          const r = zoomPhoto(centredFrame(shown, FRAME), 1.5, shown, FRAME);
          const p = panPhoto(r, dx, dy, shown, FRAME);
          expect(inside(p)).toBe(true);
          expect(p.w).toBeCloseTo(r.w, 9);
          expect(p.h).toBeCloseTo(r.h, 9);
        },
      ),
    );
  });

  it('the photo moves the way the finger moves: right shows more of the left side', () => {
    const r = zoomPhoto(centredFrame(4 / 3, FRAME), 2, 4 / 3, FRAME);
    expect(panPhoto(r, 0.1, 0, 4 / 3, FRAME).x).toBeLessThan(r.x);
    expect(panPhoto(r, 0, -0.1, 4 / 3, FRAME).y).toBeGreaterThan(r.y);
  });

  it('zoom in keeps the pinch point still', () => {
    const shown = 3 / 4;
    const r = centredFrame(shown, FRAME);
    const at = { x: 0.3, y: 0.4 };
    const z = zoomPhoto(r, 1.25, shown, FRAME, at);
    expect(z.w).toBeCloseTo(r.w / 1.25, 9);
    expect(z.x + at.x * z.w).toBeCloseTo(r.x + at.x * r.w, 9);
    expect(z.y + at.y * z.h).toBeCloseTo(r.y + at.y * r.h, 9);
  });

  it('zoom stops at the smallest frame (20 % of the photo) and at the whole photo', () => {
    const shown = 3 / 4;
    const r = centredFrame(shown, FRAME);
    expect(zoomPhoto(r, 100, shown, FRAME).w).toBeCloseTo(0.2, 9);
    expect(zoomPhoto(r, 0.01, shown, FRAME).w).toBeCloseTo(r.w, 9);
    expect(inside(zoomPhoto(r, 0.01, shown, FRAME))).toBe(true);
  });
});
