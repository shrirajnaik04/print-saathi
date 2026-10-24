import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { angleOf, innerOf, outline, ownBox, partsOf, shownDegrees, snap } from './tilt';

// Owner, round 3: turn a photo to any angle from the photo itself (WPS's handle). Stored as the quarter turns the job
// already has plus a tilt of −45°…45° (clockwise, 0.1° steps).
describe('any angle = quarter turns + a tilt', () => {
  it('splits an angle into quarter turns and a tilt in (−45, 45], and back', () => {
    for (const [angle, turns, tilt] of [
      [0, 0, 0],
      [10, 0, 10],
      [45, 0, 45],
      [46, 1, -44],
      [89, 1, -1],
      [100, 1, 10],
      [180, 2, 0],
      [271, 3, 1],
      [359.9, 0, -0.1],
      [-10, 0, -10],
      [370, 0, 10],
    ] as const) {
      const p = partsOf(angle);
      expect([p.turns, p.tilt]).toEqual([turns, tilt]);
      expect((((angleOf(p.turns, p.tilt) - angle) % 360) + 360) % 360).toBeCloseTo(0, 6);
    }
    expect(Object.is(partsOf(90).tilt, -0)).toBe(false);
  });
  it('clicks into straight within 3°', () => {
    expect(snap(88)).toBe(90);
    expect(snap(-2)).toBe(0);
    expect(snap(178.5)).toBe(180);
    expect(snap(86)).toBe(86);
    expect(snap(93.1)).toBe(93.1);
  });
  it("a turned photo's outline, and its own size back from the outline (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 500, noNaN: true }),
        fc.double({ min: 5, max: 500, noNaN: true }),
        fc.double({ min: -45, max: 45, noNaN: true }),
        (w, h, deg) => {
          const o = outline(w, h, deg);
          expect(o.w).toBeGreaterThanOrEqual(Math.min(w, h) - 1e-9);
          const back = innerOf(o, w / h, deg);
          expect(back.w).toBeCloseTo(w, 6);
          expect(back.h).toBeCloseTo(h, 6);
        },
      ),
      { numRuns: 500 },
    );
    expect(outline(30, 10, 0)).toEqual({ w: 30, h: 10 });
    const o = outline(30, 10, 90);
    expect([o.w, o.h].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([10, 30]);
  });

  it('a tilted photo is drawn at its own size, centred in its outline; a straight one fills its box', () => {
    const box = { x: 10, y: 20, w: 300, h: 200 };
    expect(ownBox({ box })).toBe(box);
    expect(ownBox({ box, tilt: { w: 260, h: 150 } })).toEqual({ x: 30, y: 45, w: 260, h: 150 });
  });

  it('an angle reads as whole degrees from -179 to 180', () => {
    expect([0, 20, 20.4, 90, 92, 180, 270, 350, -10, 359.6, 720 + 45].map(shownDegrees)).toEqual([
      0, 20, 20, 90, 92, 180, -90, -10, -10, 0, 45,
    ]);
  });
});
