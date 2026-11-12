import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PrintPlan } from '../plan/plan';
import { movePhotoToPage, pageChoices } from './movePage';

// Round 11 (owner, 2026-11-08): "What if we want to manually move photos across pages? Move to page 2, move to page 1 …
// think of every scenario." A photo goes to a page by name; it keeps its size and, where that spot is free, its place.
const MM = 72 / 25.4;
const EDGE = 12.7; // Word's Narrow margin, as the app's default
const A4 = { w: 210, h: 297 };

type Item = { item: number; x: number; y: number; w: number; h: number };
/** A plan from pages of photos, each given by its top-left corner and size in mm. */
const planOf = (pages: Item[][], orientation: 'portrait' | 'landscape' = 'portrait') =>
  ({
    paper: { id: 'A4', wPt: A4.w * MM, hPt: A4.h * MM },
    pages: pages.map((p) => ({
      orientation,
      placements: p.map((i) => ({
        itemIndex: i.item,
        box: { x: i.x * MM, y: i.y * MM, w: i.w * MM, h: i.h * MM },
      })),
    })),
  }) as unknown as PrintPlan;

const near = (n: number) => expect.closeTo(n, 6);
const spotOf = (it: Item, page: number, z: number) => ({ page, x: it.x + it.w / 2, y: it.y + it.h / 2, z });
const boxMm = (s: { x: number; y: number }, w: number, h: number) => ({
  l: s.x - w / 2,
  t: s.y - h / 2,
  r: s.x + w / 2,
  b: s.y + h / 2,
});
const apart = (a: ReturnType<typeof boxMm>, b: ReturnType<typeof boxMm>, gap = 0) =>
  a.r + gap <= b.l || b.r + gap <= a.l || a.b + gap <= b.t || b.b + gap <= a.t;

describe('a photo moved to another page by name (round 11)', () => {
  const p1 = { item: 1, x: 20, y: 20, w: 60, h: 40 };
  const p2 = { item: 2, x: 100, y: 200, w: 60, h: 40 };

  it('goes to the page, at the place it had when that place is free, on top of the others', () => {
    const m = movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 1, EDGE);
    expect(m?.page).toBe(1);
    expect(m?.clear).toBe(true);
    expect(m?.spots[1]).toEqual({ page: 1, x: near(50), y: near(40), z: expect.any(Number) });
    expect((m?.spots[1]?.z ?? 0) > (m?.spots[2]?.z ?? 99)).toBe(true);
  });

  it('every other photo stays exactly where it is (the first move fixes them, the rest keep their spots)', () => {
    const m = movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 1, EDGE);
    expect(m?.spots[2]).toEqual({ page: 1, x: near(130), y: near(220), z: expect.any(Number) });
    const placed = { 1: spotOf(p1, 0, 5), 2: { page: 1, x: 111, y: 222, z: 9 } };
    const again = movePhotoToPage(planOf([[p1], [p2]]), placed, 1, 1, EDGE);
    expect(again?.spots[2]).toEqual({ page: 1, x: 111, y: 222, z: 9 });
  });

  it('does not change the spots it was given', () => {
    const given = { 1: spotOf(p1, 0, 1), 2: spotOf(p2, 1, 2) };
    const copy = JSON.parse(JSON.stringify(given));
    movePhotoToPage(planOf([[p1], [p2]]), given, 1, 1, EDGE);
    expect(given).toEqual(copy);
  });

  it('a place that is taken: the first free place in reading order (top row, beside what is there)', () => {
    const taken = { item: 2, x: 20, y: 20, w: 60, h: 40 };
    const m = movePhotoToPage(planOf([[p1], [taken]]), undefined, 1, 1, EDGE);
    const s = m?.spots[1];
    if (!s) throw new Error('no spot');
    const me = boxMm(s, 60, 40);
    expect(m?.clear).toBe(true);
    // The top margin row, to the right of the photo already there, with a little room (not touching).
    expect(me.t).toBeCloseTo(EDGE, 6);
    expect(me.l).toBeGreaterThanOrEqual(80 + 2);
    expect(apart(me, boxMm({ x: 50, y: 40 }, 60, 40), 2)).toBe(true);
    expect(me.r).toBeLessThanOrEqual(A4.w - EDGE + 1e-9);
  });

  it('when the top row is full it goes to the next row down, never over a photo', () => {
    const row = [0, 1, 2].map((k) => ({ item: 10 + k, x: EDGE + k * 62, y: EDGE, w: 60, h: 40 }));
    const m = movePhotoToPage(planOf([[p1], row]), undefined, 1, 1, EDGE);
    const s = m?.spots[1];
    if (!s) throw new Error('no spot');
    const me = boxMm(s, 60, 40);
    expect(m?.clear).toBe(true);
    for (const r of row) expect(apart(me, boxMm({ x: r.x + 30, y: r.y + 20 }, 60, 40))).toBe(true);
    expect(me.t).toBeGreaterThanOrEqual(EDGE + 40);
  });

  it('a page with no room left: it still goes there, at its own place, and says it covers something', () => {
    const full = { item: 2, x: EDGE, y: EDGE, w: A4.w - 2 * EDGE, h: A4.h - 2 * EDGE };
    const m = movePhotoToPage(planOf([[p1], [full]]), undefined, 1, 1, EDGE);
    expect(m?.page).toBe(1);
    expect(m?.clear).toBe(false);
    expect(m?.spots[1]).toMatchObject({ page: 1, x: near(50), y: near(40) });
  });

  it('a new page goes after the last one, at the place it had', () => {
    const m = movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 'new', EDGE);
    expect(m?.page).toBe(2);
    expect(m?.clear).toBe(true);
    expect(m?.spots[1]).toMatchObject({ page: 2, x: near(50), y: near(40) });
    // The page it left is empty now, so pages 2 and 3 become 1 and 2: stored pages 1 and 2 are the only ones left.
    expect(m?.spots[2]?.page).toBe(1);
  });

  it('a photo alone on the last page has nowhere new to go', () => {
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 2, 'new', EDGE)).toBeNull();
  });

  it('a photo alone on an earlier page can go to a new page at the end (it moves the page to the end)', () => {
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 'new', EDGE)).not.toBeNull();
  });

  it('a photo with others on its page can go to a new page, and the others stay', () => {
    const q = { item: 3, x: 100, y: 100, w: 50, h: 50 };
    const m = movePhotoToPage(planOf([[p1, q]]), undefined, 1, 'new', EDGE);
    expect(m?.page).toBe(1);
    expect(m?.spots[3]).toMatchObject({ page: 0, x: near(125), y: near(125) });
  });

  it('its own page, a page that is not there, or a photo that is not there: nothing to do', () => {
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 0, EDGE)).toBeNull();
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, 2, EDGE)).toBeNull();
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 1, -1, EDGE)).toBeNull();
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 7, 1, EDGE)).toBeNull();
    expect(movePhotoToPage(planOf([[p1], [p2]]), undefined, 7, 'new', EDGE)).toBeNull();
  });

  it('pages numbered with gaps (after Cut or Remove): the page shown is found by its stored number', () => {
    const p3 = { item: 3, x: 30, y: 30, w: 40, h: 40 };
    const spots = { 1: spotOf(p1, 0, 1), 2: spotOf(p2, 2, 2), 3: spotOf(p3, 5, 3) };
    const plan = planOf([[p1], [p2], [p3]]);
    expect(movePhotoToPage(plan, spots, 1, 1, EDGE)?.page).toBe(2);
    expect(movePhotoToPage(plan, spots, 1, 2, EDGE)?.page).toBe(5);
    expect(movePhotoToPage(plan, spots, 1, 'new', EDGE)?.page).toBe(6);
    // A removed photo's kept place is not a page shown, but its Undo must never land on the new page (review M1): the
    // new page is numbered above every kept place.
    const withRemoved = { ...spots, 9: { page: 8, x: 10, y: 10, z: 4 } };
    expect(movePhotoToPage(plan, withRemoved, 1, 'new', EDGE)?.page).toBe(9);
    // ...and among the pages shown it is the last of three (photo 1 left page 1 empty, so it is gone).
    expect(movePhotoToPage(plan, withRemoved, 1, 'new', EDGE)?.index).toBe(2);
  });

  it('a photo that is not placed by hand yet is fixed where it is first (flowing layouts)', () => {
    const m = movePhotoToPage(planOf([[p1], [p2]]), undefined, 2, 0, EDGE);
    expect(m?.spots[1]).toMatchObject({ page: 0, x: near(50), y: near(40) });
    expect(m?.spots[2]).toMatchObject({ page: 0, x: near(130), y: near(220) });
  });

  it('a sideways page is measured sideways', () => {
    const wide = { item: 1, x: 20, y: 20, w: 100, h: 60 };
    const there = { item: 2, x: 20, y: 20, w: 100, h: 60 };
    const m = movePhotoToPage(planOf([[wide], [there]], 'landscape'), undefined, 1, 1, EDGE);
    const s = m?.spots[1];
    if (!s) throw new Error('no spot');
    const me = boxMm(s, 100, 60);
    expect(m?.clear).toBe(true);
    expect(me.r).toBeLessThanOrEqual(A4.h - EDGE + 1e-9); // the page is 297 mm wide now
    expect(me.b).toBeLessThanOrEqual(A4.w - EDGE + 1e-9); // and 210 mm tall
    expect(apart(me, boxMm({ x: 70, y: 50 }, 100, 60), 2)).toBe(true);
  });

  it('a turned photo is measured by its turned outline (its box in the plan)', () => {
    const tilted = { item: 1, x: 20, y: 20, w: 90, h: 70 };
    const m = movePhotoToPage(planOf([[tilted], [{ item: 2, x: 20, y: 20, w: 60, h: 60 }]]), undefined, 1, 1, EDGE);
    const s = m?.spots[1];
    if (!s) throw new Error('no spot');
    expect(m?.clear).toBe(true);
    expect(apart(boxMm(s, 90, 70), boxMm({ x: 50, y: 50 }, 60, 60), 2)).toBe(true);
  });

  it('a place stored outside the margins is judged where the photo is drawn, not where it is stored (review I2)', () => {
    // Stored centre 170 mm, 80 mm wide: the page draws it kept inside the margins, at 117.3–197.3 mm. Page 2 has a photo
    // at 115–125 mm, so the drawn photo would cover it, though the stored place (130–210 mm) does not.
    const wide = { item: 1, x: 117.3, y: 20, w: 80, h: 40 };
    const there = { item: 2, x: 115, y: 15, w: 10, h: 50 };
    const spots = { 1: { page: 0, x: 170, y: 40, z: 1 }, 2: spotOf(there, 1, 2) };
    const m = movePhotoToPage(planOf([[wide], [there]]), spots, 1, 1, EDGE);
    const s = m?.spots[1];
    if (!s) throw new Error('no spot');
    // The page draws a photo's centre kept inside the margins (what pinnedPages does).
    const drawn = {
      x: Math.min(Math.max(s.x, EDGE + 40), A4.w - EDGE - 40),
      y: Math.min(Math.max(s.y, EDGE + 20), A4.h - EDGE - 20),
    };
    expect(m?.clear).toBe(true);
    expect(apart(boxMm(drawn, 80, 40), boxMm({ x: 120, y: 40 }, 10, 50))).toBe(true);
  });

  it('a photo bigger than the room stays at the margin and still moves', () => {
    const huge = { item: 1, x: 5, y: 5, w: 400, h: 100 };
    const m = movePhotoToPage(planOf([[huge], [p2]]), undefined, 1, 1, EDGE);
    expect(m?.page).toBe(1);
    expect(m?.spots[1]).toBeDefined();
  });

  it('property: it is never moved off the paper, and "clear" is true only when nothing is covered', () => {
    const photo = fc.record({
      x: fc.integer({ min: 13, max: 120 }),
      y: fc.integer({ min: 13, max: 200 }),
      w: fc.integer({ min: 20, max: 90 }),
      h: fc.integer({ min: 20, max: 90 }),
    });
    fc.assert(
      fc.property(photo, fc.array(photo, { minLength: 1, maxLength: 5 }), (mover, others) => {
        // The app's plans keep every box inside the margins (pinnedPages clamps), so the mover starts inside them.
        const kept = (v: number, size: number, room: number) => Math.max(EDGE, Math.min(v, room - EDGE - size));
        const mine = {
          item: 1,
          ...mover,
          x: kept(mover.x, mover.w, A4.w),
          y: kept(mover.y, mover.h, A4.h),
        };
        const theirs = others.map((o, k) => ({ item: 2 + k, ...o }));
        const m = movePhotoToPage(planOf([[mine], theirs]), undefined, 1, 1, EDGE);
        if (!m) return false;
        const s = m.spots[1];
        if (!s) return false;
        const me = boxMm(s, mover.w, mover.h);
        const inside =
          me.l >= EDGE - 1e-6 && me.t >= EDGE - 1e-6 && me.r <= A4.w - EDGE + 1e-6 && me.b <= A4.h - EDGE + 1e-6;
        const free = theirs.every((o) => apart(me, boxMm({ x: o.x + o.w / 2, y: o.y + o.h / 2 }, o.w, o.h)));
        // A photo that fits stays on the paper; "clear" never claims a clash is a clean fit.
        return (inside || mover.w > A4.w - 2 * EDGE || mover.h > A4.h - 2 * EDGE) && (!m.clear || free);
      }),
      { numRuns: 200 },
    );
  });
});

describe('the pages a photo can go to (the chooser, round 11)', () => {
  const at = (item: number) => ({ item, x: 20, y: 20, w: 40, h: 40 });
  it('every other page, and a new page at the end', () => {
    expect(pageChoices(planOf([[at(1)], [at(2)], [at(3)]]), 2)).toEqual([0, 2, 'new']);
    expect(pageChoices(planOf([[at(1)], [at(2)]]), 1)).toEqual([1, 'new']);
  });
  it('no new page for the only photo of the last page', () => {
    expect(pageChoices(planOf([[at(1)], [at(2)]]), 2)).toEqual([0]);
  });
  it('one page: a new page, if the photo has company', () => {
    expect(pageChoices(planOf([[at(1), at(2)]]), 1)).toEqual(['new']);
    expect(pageChoices(planOf([[at(1)]]), 1)).toEqual([]);
  });
  it('a photo that is not there has nowhere to go', () => {
    expect(pageChoices(planOf([[at(1)], [at(2)]]), 9)).toEqual([]);
  });
  it('agrees with the move itself: every choice moves, nothing else does', () => {
    const plan = planOf([[at(1), at(4)], [at(2)], [at(3)]]);
    for (const item of [1, 2, 3, 4]) {
      const ok = pageChoices(plan, item);
      for (const to of [0, 1, 2, 3, 'new' as const, -1])
        expect(movePhotoToPage(plan, undefined, item, to, EDGE) !== null, `${item} -> ${to}`).toBe(ok.includes(to));
    }
  });
});

describe('where the page is among the pages afterwards (what the note says)', () => {
  const at = (item: number) => ({ item, x: 20, y: 20, w: 40, h: 40 });
  it('moving the only photo of page 1 to page 2 leaves it on page 1: the empty page is gone', () => {
    expect(movePhotoToPage(planOf([[at(1)], [at(2)]]), undefined, 1, 1, EDGE)?.index).toBe(0);
  });
  it('a page after the photo that stays keeps its number', () => {
    expect(movePhotoToPage(planOf([[at(1), at(4)], [at(2)]]), undefined, 1, 1, EDGE)?.index).toBe(1);
  });
  it('a new page is last, and one more than the rest when its old page stays', () => {
    expect(movePhotoToPage(planOf([[at(1), at(4)], [at(2)]]), undefined, 1, 'new', EDGE)?.index).toBe(2);
    expect(movePhotoToPage(planOf([[at(1)], [at(2)]]), undefined, 1, 'new', EDGE)?.index).toBe(1);
  });
});
