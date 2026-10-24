import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PrintPlan } from '../plan/plan';
import { clampCentre, overlaps, pinnedPages, recropSpot, sideCrop, sideCropQuad, snapBox, spotsFromPlan } from './free';
import { A4 } from './onePerPage';
import { homography } from './quad';

const MM = 72 / 25.4;
// Word's Narrow margin on A4 (owner, 2026-10-24).
const paper = { ...A4, edgeMm: 12.7 };
const e = 12.7 * MM;

// Press and hold to place a photo anywhere (owner, 2026-10-24): a spot is the photo's centre (mm) on its page.
describe('photos placed by hand (spec 2026-10-24 Part 5)', () => {
  const photo = (index: number, aspect = 1.5, longMm = 60) => ({ index, aspect, longMm });

  it('a box from its centre and size, kept inside the margins', () => {
    const { pages, rest } = pinnedPages([photo(1)], { 1: { page: 0, x: 50, y: 40, z: 1 } }, paper, 'portrait');
    const b = pages[0]?.placements[0]?.box;
    expect(b?.w).toBeCloseTo(60 * MM, 6);
    expect(b?.h).toBeCloseTo(40 * MM, 6);
    expect(b?.x).toBeCloseTo(20 * MM, 6);
    expect(b?.y).toBeCloseTo(20 * MM, 6);
    expect(rest).toEqual([]);
    // Too near the corner: moved in until it is inside the margins.
    const near = pinnedPages([photo(1)], { 1: { page: 0, x: 5, y: 5, z: 1 } }, paper, 'portrait');
    expect(near.pages[0]?.placements[0]?.box.x).toBeCloseTo(e, 6);
    expect(near.pages[0]?.placements[0]?.box.y).toBeCloseTo(e, 6);
  });

  it('a size larger than the page fits inside the margins', () => {
    const { pages } = pinnedPages([photo(1, 1, 400)], { 1: { page: 0, x: 105, y: 148, z: 1 } }, paper, 'portrait');
    const b = pages[0]?.placements[0]?.box;
    expect(b?.w).toBeCloseTo(A4.wPt - 2 * e, 6);
    expect(b?.x).toBeCloseTo(e, 6);
  });

  it('drawn in z order (the one placed last on top); empty pages left out; the rest flow after', () => {
    const { pages, rest } = pinnedPages(
      [photo(1), photo(2), photo(3), photo(4)],
      { 1: { page: 2, x: 60, y: 60, z: 5 }, 2: { page: 0, x: 60, y: 60, z: 9 }, 3: { page: 0, x: 80, y: 80, z: 2 } },
      paper,
      'portrait',
    );
    expect(pages.map((p) => p.placements.map((x) => x.itemIndex))).toEqual([[3, 2], [1]]);
    expect(rest).toEqual([4]);
  });

  it('a sideways page is measured sideways', () => {
    const { pages } = pinnedPages([photo(1)], { 1: { page: 0, x: 250, y: 100, z: 1 } }, paper, 'landscape');
    expect(pages[0]?.orientation).toBe('landscape');
    const b = pages[0]?.placements[0]?.box;
    expect((b?.x ?? 0) + (b?.w ?? 0)).toBeLessThanOrEqual(A4.hPt - e + 1e-6);
  });

  it('clampCentre keeps a box inside the margins (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 1200, noNaN: true }),
        fc.double({ min: -500, max: 1200, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        fc.double({ min: 10, max: 400, noNaN: true }),
        (x, y, w, h) => {
          const c = clampCentre({ x, y, w, h }, paper, 'portrait');
          expect(c.x - w / 2).toBeGreaterThanOrEqual(e - 1e-6);
          expect(c.y - h / 2).toBeGreaterThanOrEqual(e - 1e-6);
          expect(c.x + w / 2).toBeLessThanOrEqual(A4.wPt - e + 1e-6);
          expect(c.y + h / 2).toBeLessThanOrEqual(A4.hPt - e + 1e-6);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('snapping while a photo is moved (Word-like guides)', () => {
  const page = { w: A4.wPt, h: A4.hPt, e };
  const tol = 2 * MM;

  it('snaps to the page middle within 2 mm and shows the guide', () => {
    const w = 100;
    const box = { x: A4.wPt / 2 - w / 2 + 1.5 * MM, y: 300, w, h: 80 };
    const r = snapBox(box, [], page, tol);
    expect(r.box.x + r.box.w / 2).toBeCloseTo(A4.wPt / 2, 6);
    expect(r.guides).toContainEqual({ x1: A4.wPt / 2, y1: 0, x2: A4.wPt / 2, y2: A4.hPt });
  });

  it('snaps to another photo’s edge and to the margins; never beyond 2 mm', () => {
    const other = { x: 100, y: 100, w: 120, h: 90 };
    const box = { x: 220 + 1 * MM, y: 400, w: 80, h: 60 };
    expect(snapBox(box, [other], page, tol).box.x).toBeCloseTo(220, 6);
    expect(snapBox({ x: e + 1.9 * MM, y: 500, w: 80, h: 60 }, [], page, tol).box.x).toBeCloseTo(e, 6);
    const far = { x: 220 + 3 * MM, y: 400, w: 80, h: 60 };
    const r = snapBox(far, [other], page, tol);
    expect(r.box.x).toBeCloseTo(far.x, 6);
    expect(r.guides.filter((g) => g.x1 === g.x2)).toEqual([]);
  });
});

describe('photos covering each other', () => {
  const plan = (boxes: { x: number; y: number; w: number; h: number }[]) =>
    ({
      pages: [
        {
          orientation: 'portrait',
          placements: boxes.map((box, i) => ({ itemIndex: i + 1, box })),
        },
      ],
    }) as unknown as PrintPlan;

  it('names the pairs that cover each other (more than a hair)', () => {
    expect(
      overlaps(
        plan([
          { x: 0, y: 0, w: 100, h: 100 },
          { x: 50, y: 50, w: 100, h: 100 },
        ]),
      ),
    ).toEqual([[1, 2]]);
    // Only touching, or a hair over: not covering.
    expect(
      overlaps(
        plan([
          { x: 0, y: 0, w: 100, h: 100 },
          { x: 100, y: 0, w: 100, h: 100 },
        ]),
      ),
    ).toEqual([]);
    // 0.05 pt over along 100 pt: 0.6 mm², a hair.
    expect(
      overlaps(
        plan([
          { x: 0, y: 0, w: 100, h: 100 },
          { x: 99.95, y: 0, w: 100, h: 100 },
        ]),
      ),
    ).toEqual([]);
  });
});

// Sides to crop (owner, 2026-10-24, "use the same frame to crop"): Word's crop — the part left keeps its print size.
describe('a side dragged to crop', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  const whole = { x: 0, y: 0, w: 1, h: 1 };

  it('the left side in by 50 pt cuts a quarter off and keeps the scale; only that side moves', () => {
    const r = sideCrop(whole, box, 'l', 50);
    expect(r.crop.x).toBeCloseTo(0.25, 9);
    expect(r.crop.w).toBeCloseTo(0.75, 9);
    expect(r.box).toEqual({ x: 150, y: 100, w: 150, h: 100 });
    const b = sideCrop(whole, box, 'b', 20);
    expect(b.crop.h).toBeCloseTo(0.8, 9);
    expect(b.box).toEqual({ x: 100, y: 100, w: 200, h: 80 });
  });

  it('outward it comes back only as far as the photo goes; never below 5 %', () => {
    const cut = sideCrop(whole, box, 'r', 100).crop;
    const back = sideCrop(cut, { x: 100, y: 100, w: 100, h: 100 }, 'r', -500);
    expect(back.crop.w).toBeCloseTo(1, 9);
    expect(back.box.w).toBeCloseTo(200, 9);
    const tiny = sideCrop(whole, box, 't', 99);
    expect(tiny.crop.h).toBeCloseTo(0.05, 9);
    expect(tiny.box.h).toBeCloseTo(5, 9);
  });

  it('a straightened photo: the cut follows its straightened shape, exactly', () => {
    const quad = [0.1, 0.12, 0.85, 0.05, 0.9, 0.8, 0.15, 0.92];
    const r = sideCropQuad(quad, 0, box, 't', 10); // a tenth of the height off the top
    const h = homography(quad);
    const [x0, y0] = h.map(0, 0.1);
    const [x1, y1] = h.map(1, 0.1);
    expect(r.quad[0]).toBeCloseTo(x0, 9);
    expect(r.quad[1]).toBeCloseTo(y0, 9);
    expect(r.quad[2]).toBeCloseTo(x1, 9);
    expect(r.quad[3]).toBeCloseTo(y1, 9);
    expect(r.quad.slice(4)).toEqual(quad.slice(4));
    expect(r.box).toEqual({ x: 100, y: 110, w: 200, h: 90 });
  });

  it('turned once, the left side shown is the straightened photo’s bottom', () => {
    const quad = [0.1, 0.12, 0.85, 0.05, 0.9, 0.8, 0.15, 0.92];
    const r = sideCropQuad(quad, 1, box, 'l', 20); // a tenth of the width shown off the left
    const h = homography(quad);
    const [x2, y2] = h.map(1, 0.9);
    const [x3, y3] = h.map(0, 0.9);
    expect(r.quad[4]).toBeCloseTo(x2, 9);
    expect(r.quad[5]).toBeCloseTo(y2, 9);
    expect(r.quad[6]).toBeCloseTo(x3, 9);
    expect(r.quad[7]).toBeCloseTo(y3, 9);
    expect(r.quad.slice(0, 4)).toEqual(quad.slice(0, 4));
  });
});

describe('fixing every photo where it is (the first move by hand)', () => {
  const plan = (pages: { itemIndex: number; box: { x: number; y: number; w: number; h: number } }[][]) =>
    ({ pages: pages.map((placements) => ({ orientation: 'portrait', placements })) }) as unknown as PrintPlan;

  it('each photo gets its page and centre (mm), in drawing order', () => {
    const s = spotsFromPlan(
      plan([
        [{ itemIndex: 1, box: { x: 0, y: 0, w: 2 * MM, h: 4 * MM } }],
        [{ itemIndex: 2, box: { x: 10 * MM, y: 10 * MM, w: 2 * MM, h: 2 * MM } }],
      ]),
      undefined,
    );
    expect(s[1]).toEqual({ page: 0, x: expect.closeTo(1, 9), y: expect.closeTo(2, 9), z: 1 });
    expect(s[2]).toEqual({ page: 1, x: expect.closeTo(11, 9), y: expect.closeTo(11, 9), z: 2 });
  });

  it('photos already placed keep their spots; the others after the last placed page', () => {
    const s = spotsFromPlan(
      plan([
        [{ itemIndex: 1, box: { x: 0, y: 0, w: 10, h: 10 } }],
        [{ itemIndex: 2, box: { x: 0, y: 0, w: 10, h: 10 } }],
      ]),
      { 1: { page: 3, x: 50, y: 50, z: 7 } },
    );
    expect(s[1]).toEqual({ page: 3, x: 50, y: 50, z: 7 });
    expect(s[2]?.page).toBe(4);
    expect(s[2]?.z).toBe(8);
  });
});

describe('places of photos no longer in the job (review, 2026-10-24)', () => {
  it('are kept for Undo but do not count as pages: a photo added later never lands on a placed page', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    // Photo 9 (removed) was alone on page 1; photo 1 is on page 0, photo 3 on page 2; photo 4 was added later.
    const plan = {
      pages: [
        { orientation: 'portrait', placements: [{ itemIndex: 1, box }] },
        { orientation: 'portrait', placements: [{ itemIndex: 3, box }] },
        { orientation: 'portrait', placements: [{ itemIndex: 4, box }] },
      ],
    } as unknown as PrintPlan;
    const s = spotsFromPlan(plan, {
      1: { page: 0, x: 5, y: 5, z: 1 },
      9: { page: 1, x: 5, y: 5, z: 2 },
      3: { page: 2, x: 5, y: 5, z: 3 },
    });
    expect(s[4]?.page).toBe(3);
    expect(s[9]).toEqual({ page: 1, x: 5, y: 5, z: 2 });
  });
});

describe('cropped again on its crop screen (review I4, Word-style)', () => {
  const spot = { page: 0, x: 100, y: 150, z: 1 };
  it('keeps the part left where it was, at the same scale (a landscape photo, the top cut)', () => {
    // A 3:2 photo, 90 mm wide: box 90 x 60 around (100, 150): top 120, bottom 180.
    const r = recropSpot(spot, 90, 1.5, 0, {}, { crop: { x: 0, y: 0.1, w: 1, h: 0.9 } });
    expect(r.size).toBeCloseTo(90, 6);
    expect(r.x).toBeCloseTo(100, 6);
    expect(r.y - 54 / 2).toBeCloseTo(126, 6); // the new top: 6 mm lower
    expect(r.y + 54 / 2).toBeCloseTo(180, 6); // the bottom stays
  });
  it('works on a turned photo (a cut on the upright photo is a cut on its shown side)', () => {
    // Upright 3:2, turned once: shown 2:3, long side (height) 90 -> box 60 x 90 around (100, 150).
    // Upright left cut 10 % = shown top cut 10 % (a quarter turn clockwise: the left edge becomes the top).
    const r = recropSpot(spot, 90, 1.5, 1, {}, { crop: { x: 0.1, y: 0, w: 0.9, h: 1 } });
    expect(r.size).toBeCloseTo(81, 6);
    expect(r.x).toBeCloseTo(100, 6);
    expect(r.y + 81 / 2).toBeCloseTo(195, 6);
  });
  it('a crop taken back out grows the box back the same way', () => {
    const r = recropSpot(spot, 90, 1.5, 0, { crop: { x: 0, y: 0.1, w: 1, h: 0.9 } }, {});
    // Box 90 x 54 around (100,150): top 123; the whole photo is 60 tall, its top 6 mm above.
    expect(r.size).toBeCloseTo(90, 6);
    expect(r.y - 30).toBeCloseTo(117, 6);
  });
  it('a straightened frame keeps its centre and its print scale by area', () => {
    const quad = [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9];
    const r = recropSpot(spot, 90, 1, 0, {}, { quad });
    expect(r.x).toBe(100);
    expect(r.y).toBe(150);
    expect(r.size).toBeCloseTo(72, 6); // 0.8 of each side
  });
});
