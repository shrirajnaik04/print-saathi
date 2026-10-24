import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boxOfSquareQuad,
  homography,
  moveCorner,
  moveQuad,
  moveSide,
  quadOfBox,
  scaleQuad,
  shownQuad,
  straightAspect,
  uprightQuad,
} from './quad';

// A straightened frame (owner, 2026-10-24: the scanner app's crop with free corners): 8 fractions of the upright
// photo, top-left, top-right, bottom-right, bottom-left.
const slanted = [0.1, 0.12, 0.85, 0.05, 0.9, 0.8, 0.15, 0.92];
/** Arrays equal to 12 decimals (sums of fractions are not exact in binary). */
const near = (a: readonly number[], b: readonly number[]) => {
  expect(a).toHaveLength(b.length);
  for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i] as number, 12);
};

describe('straightened frames (spec 2026-10-24 Part 4)', () => {
  it('a frame square with the photo is a plain crop (within 0.5 %); a slanted one is not', () => {
    const box = boxOfSquareQuad(quadOfBox({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 }));
    near(box ? [box.x, box.y, box.w, box.h] : [], [0.1, 0.2, 0.5, 0.6]);
    const nearly = [0.1, 0.2, 0.604, 0.203, 0.6, 0.8, 0.103, 0.799];
    const b = boxOfSquareQuad(nearly);
    expect(b).not.toBeNull();
    expect(b?.x).toBeCloseTo(0.1015, 6);
    expect(boxOfSquareQuad(slanted)).toBeNull();
  });

  it('the straightened shape: a 2:1 rectangle drawn on a 4:3 photo is 2:1', () => {
    // On a 4:3 photo, x fractions are 4/3 as long as y fractions.
    const q = quadOfBox({ x: 0, y: 0, w: 0.75, h: 0.5 });
    expect(straightAspect(q, 4 / 3)).toBeCloseTo(2, 9);
    // A trapezium: the average of its top and bottom over the average of its sides.
    const t = [0.2, 0, 0.8, 0, 1, 1, 0, 1];
    expect(straightAspect(t, 1)).toBeCloseTo((0.6 + 1) / 2 / Math.hypot(0.2, 1), 9);
  });

  it('shown and upright are the same four corners, the shown top-left first; four turns change nothing', () => {
    for (const turns of [0, 1, 2, 3]) near(uprightQuad(shownQuad(slanted, turns), turns), slanted);
    let q = slanted;
    for (let k = 0; k < 4; k++) q = shownQuad(q, 1);
    for (const [i, v] of q.entries()) expect(v).toBeCloseTo(slanted[i] as number, 12);
    // One turn clockwise: the photo's bottom-left corner comes to the top-left.
    const s = shownQuad(quadOfBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }), 1);
    expect(s.slice(0, 2).map((v) => Number(v.toFixed(9)))).toEqual([0.4, 0.1]);
  });

  it('a side handle moves both of its corners; a corner moves alone', () => {
    const top = moveSide(slanted, 0, 0.02, 0.03);
    near(top.slice(0, 4), [0.12, 0.15, 0.87, 0.08]);
    expect(top.slice(4)).toEqual(slanted.slice(4));
    const c = moveCorner(slanted, 2, 0.95, 0.9);
    expect(c).toEqual([...slanted.slice(0, 4), 0.95, 0.9, ...slanted.slice(6)]);
  });

  it('never a crossed, folded or tiny frame, never outside the photo', () => {
    // The top-left dragged past the bottom-right: refused.
    expect(moveCorner(slanted, 0, 0.95, 0.95)).toEqual(slanted);
    // Smaller than 5 % of the photo: refused.
    const small = quadOfBox({ x: 0.5, y: 0.5, w: 0.06, h: 0.06 });
    expect(moveSide(small, 1, -0.03, 0)).toEqual(small);
    // A corner outside the photo stops at its edge.
    expect(moveCorner(slanted, 1, 1.4, -0.3).slice(2, 4)).toEqual([1, 0]);
    // Moving the whole frame stops at the photo's edge, keeping its shape.
    const moved = moveQuad(slanted, 0.5, 0);
    expect(Math.max(...moved.filter((_, i) => i % 2 === 0))).toBeCloseTo(1, 12);
    expect(moved[0]! - moved[2]!).toBeCloseTo(slanted[0]! - slanted[2]!, 12);
    // Bigger than the photo: not taken.
    expect(scaleQuad(quadOfBox({ x: 0, y: 0, w: 1, h: 1 }), 1.2)).toEqual(quadOfBox({ x: 0, y: 0, w: 1, h: 1 }));
  });

  it('the square-to-frame mapping hits the corners and its inverse comes back (property)', () => {
    const h = homography(slanted);
    expect(h.map(0, 0)).toEqual([slanted[0], slanted[1]].map((v) => expect.closeTo(v as number, 12)));
    expect(h.map(1, 0)).toEqual([slanted[2], slanted[3]].map((v) => expect.closeTo(v as number, 12)));
    expect(h.map(1, 1)).toEqual([slanted[4], slanted[5]].map((v) => expect.closeTo(v as number, 12)));
    expect(h.map(0, 1)).toEqual([slanted[6], slanted[7]].map((v) => expect.closeTo(v as number, 12)));
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (u, v) => {
        const [x, y] = h.map(u, v);
        const [u2, v2] = h.unmap(x, y);
        expect(u2).toBeCloseTo(u, 9);
        expect(v2).toBeCloseTo(v, 9);
      }),
      { numRuns: 500 },
    );
  });
});
