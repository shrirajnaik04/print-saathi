import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allOnOne, bestPages, GAP_MM, MIN_BEST_MM, onPages, smallestSideMm } from './layouts';
import { A4, EDGE_MM, type LayoutPage } from './onePerPage';

const MM = 72 / 25.4;
const items = (aspects: number[]) => aspects.map((aspect, i) => ({ index: i + 1, aspect }));

/** Every rule of PLAN §G0/§U that must hold for any job. Returns the first broken rule, or null. */
function broken(pages: LayoutPage[], aspects: number[], pageCount?: number): string | null {
  if (pageCount !== undefined && pages.length !== pageCount) return `pages ${pages.length} != ${pageCount}`;
  const seen = pages.flatMap((p) => p.placements.map((x) => x.itemIndex));
  if (seen.join(',') !== aspects.map((_, i) => i + 1).join(',')) return `order/once: ${seen.join(',')}`;
  const e = EDGE_MM * MM;
  const g = GAP_MM * MM;
  for (const pg of pages) {
    const [pw, ph] = pg.orientation === 'landscape' ? [A4.hPt, A4.wPt] : [A4.wPt, A4.hPt];
    const bs = pg.placements.map((p) => p.box);
    for (const [i, p] of pg.placements.entries()) {
      const b = p.box;
      if (!(b.w > 0 && b.h > 0)) return 'empty box';
      if (b.x < e - 1e-6 || b.y < e - 1e-6 || b.x + b.w > pw - e + 1e-6 || b.y + b.h > ph - e + 1e-6)
        return `outside printable area: ${JSON.stringify(b)}`;
      const want = aspects[p.itemIndex - 1] as number;
      if (Math.abs(b.w / b.h - want) / want > 0.001) return `aspect ${b.w / b.h} vs ${want}`;
      for (const o of bs.slice(i + 1)) {
        const apart =
          b.x + b.w + g - 1e-6 <= o.x ||
          o.x + o.w + g - 1e-6 <= b.x ||
          b.y + b.h + g - 1e-6 <= o.y ||
          o.y + o.h + g - 1e-6 <= b.y;
        if (!apart) return 'overlap or closer than the gap';
      }
    }
    // Reading order: each next photo starts lower, or on the same row further right.
    for (let i = 1; i < bs.length; i++) {
      const a = bs[i - 1]!;
      const b = bs[i]!;
      const sameRow = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.max(a.h, b.h) / 2;
      if (sameRow ? b.x <= a.x : b.y + b.h / 2 <= a.y + a.h / 2) return 'reading order';
    }
  }
  return null;
}

const aspectArb = fc.oneof(
  fc.double({ min: 0.1, max: 10, noNaN: true }),
  fc.constantFrom(3 / 4, 4 / 3, 9 / 16, 16 / 9, 1),
);

describe('layout engine (PLAN §G0)', () => {
  it('2 portrait photos go side by side on a sideways A4', () => {
    const [p] = allOnOne(items([3 / 4, 3 / 4]), A4);
    expect(p?.orientation).toBe('landscape');
    const [a, b] = p!.placements.map((x) => x.box);
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(1e-6);
    expect(b!.x).toBeGreaterThan(a!.x);
  });

  it('4 equal photos make a 2 x 2 grid of equal size', () => {
    const [p] = allOnOne(items([4 / 3, 4 / 3, 4 / 3, 4 / 3]), A4);
    const bs = p!.placements.map((x) => x.box);
    expect(new Set(bs.map((b) => b.w.toFixed(3))).size).toBe(1);
    expect(new Set(bs.map((b) => b.y.toFixed(3))).size).toBe(2);
  });

  it('Best for 6 phone photos is one page (every photo still at least 4 cm)', () => {
    const pages = bestPages(items([3 / 4, 3 / 4, 4 / 3, 3 / 4, 3 / 4, 3 / 4]), A4);
    expect(pages).toHaveLength(1);
    expect(smallestSideMm(pages)).toBeGreaterThanOrEqual(MIN_BEST_MM);
  });

  it('Best uses more pages when one page would make photos smaller than 4 cm', () => {
    const many = items(Array.from({ length: 30 }, () => 3 / 4));
    expect(smallestSideMm(allOnOne(many, A4))).toBeLessThan(MIN_BEST_MM);
    const pages = bestPages(many, A4);
    expect(pages.length).toBeGreaterThan(1);
    expect(smallestSideMm(pages)).toBeGreaterThanOrEqual(MIN_BEST_MM);
    // ... and not more pages than needed.
    expect(smallestSideMm(onPages(many, A4, pages.length - 1))).toBeLessThan(MIN_BEST_MM);
  });

  it('exactly N pages: balanced groups in order, one direction for every page', () => {
    const pages = onPages(items([1, 1, 1, 1, 1, 1, 1]), A4, 3);
    expect(pages.map((p) => p.placements.length)).toEqual([3, 2, 2]);
    expect(new Set(pages.map((p) => p.orientation)).size).toBe(1);
  });

  it('more pages than photos is capped at one photo per page', () => {
    expect(onPages(items([1, 1]), A4, 5)).toHaveLength(2);
  });

  it('a 10:1 panorama and a 1:3 screenshot still fit, uncut', () => {
    const pages = allOnOne(items([10, 1 / 3, 1]), A4);
    expect(broken(pages, [10, 1 / 3, 1], 1)).toBeNull();
  });

  // Gate review (Phase 3) #1: one wide photo must not make Best use many more pages than without it.
  it.each([
    [19, 2],
    [23, 2.5],
    [29, 4],
    [29, 6],
    // Re-review #1: a photo that can never reach 4 cm, even alone (a 10:1 panorama, a long screenshot).
    [29, 10],
    [29, 1 / 7.4],
    [99, 1 / 10],
  ])('Best: %i phone photos and one %f:1 photo stay within one page of the same job without it', (n, wide) => {
    const tall = Array.from({ length: n }, () => 3 / 4);
    const without = bestPages(items(tall), A4).length;
    expect(bestPages(items([...tall, wide]), A4).length).toBeLessThanOrEqual(without + 1);
    expect(bestPages(items([wide, ...tall]), A4).length).toBeLessThanOrEqual(without + 1);
  });

  // Gate review (Phase 3) #2: rows must be split well, not greedily (an order-keeping split reaches 60 mm here).
  it('mixed shapes on one page get the best order-keeping rows', () => {
    expect(smallestSideMm(allOnOne(items([16 / 9, 4 / 3, 3 / 4, 0.46, 3]), A4))).toBeGreaterThanOrEqual(55);
  });

  // Gate review (Phase 3) #8: a later page with fewer photos is centred, not stuck at the top.
  it('a page with fewer photos than the shared grid holds is centred on the paper', () => {
    const pages = onPages(items([3 / 4, 3 / 4, 3 / 4, 3 / 4, 3 / 4]), A4, 2);
    const last = pages[1]!;
    const ph = last.orientation === 'landscape' ? A4.wPt : A4.hPt;
    const top = Math.min(...last.placements.map((p) => p.box.y));
    const bottom = Math.max(...last.placements.map((p) => p.box.y + p.box.h));
    expect(Math.abs(top - (ph - bottom))).toBeLessThan(1);
  });

  // Gate review (Phase 3) #11: as many pages as photos = one per page, each page in its photo's direction.
  it('exactly as many pages as photos gives each photo its own direction', () => {
    const pages = onPages(items([3 / 4, 4 / 3]), A4, 2);
    expect(pages.map((p) => p.orientation)).toEqual(['portrait', 'landscape']);
  });

  it('property (10 000 jobs): every rule holds for all on one page, N pages and Best', () => {
    fc.assert(
      fc.property(
        // fast-check keeps arrays short by default: draw the length first so 1–30 photos are really covered.
        fc.integer({ min: 1, max: 30 }).chain((n) => fc.array(aspectArb, { minLength: n, maxLength: n })),
        fc.integer({ min: 1, max: 8 }),
        (aspects, n) => {
          const its = items(aspects);
          const one = allOnOne(its, A4);
          const nPages = onPages(its, A4, n);
          const best = bestPages(its, A4);
          const problem =
            broken(one, aspects, 1) ??
            broken(nPages, aspects, Math.min(n, aspects.length)) ??
            broken(best, aspects) ??
            (JSON.stringify(allOnOne(its, A4)) === JSON.stringify(one) ? null : 'not deterministic');
          if (problem) throw new Error(`${problem} for ${JSON.stringify(aspects)} n=${n}`);
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  }, 120_000);
});
