import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitLongMm, flowPages, MIN_LONG_MM } from './flow';
import { GAP_MM } from './layouts';
import { A4, type Box, EDGE_MM, type Paper } from './onePerPage';

// "Square" wrap (owner, 2026-10-23: "select each image to resize, wrap text as square … when images don't fit, auto
// shift on new page"): each photo keeps its own size; photos flow left to right in rows, rows top to bottom, and what
// does not fit the page starts the next one.
const MM = 72 / 25.4;
const PHOTO4x6: Paper = { id: 'PHOTO_4x6', wPt: 288, hPt: 432, edgeMm: 4 };
const longOf = (b: Box) => Math.max(b.w, b.h) / MM;

const item = fc.record({
  aspect: fc.double({ min: 0.2, max: 5, noNaN: true }),
  longMm: fc.double({ min: 20, max: 300, noNaN: true }),
});

describe('flowPages', () => {
  it('each photo once, in order, inside the edges, never overlapping, its size kept unless it cannot fit', () => {
    fc.assert(
      fc.property(
        fc.array(item, { minLength: 1, maxLength: 40 }),
        fc.constantFrom(A4, PHOTO4x6),
        fc.constantFrom('portrait' as const, 'landscape' as const),
        (raw, paper, orientation) => {
          const items = raw.map((r, i) => ({ index: i + 1, ...r }));
          const pages = flowPages(items, paper, orientation);
          const placed = pages.flatMap((p) => p.placements);
          expect(placed.map((p) => p.itemIndex)).toEqual(items.map((i) => i.index));
          const [pw, ph] = orientation === 'landscape' ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
          const e = (paper.edgeMm ?? EDGE_MM) * MM;
          const g = GAP_MM * MM;
          for (const p of pages) {
            expect(p.orientation).toBe(orientation);
            for (const { box } of p.placements) {
              expect(box.x).toBeGreaterThanOrEqual(e - 1e-6);
              expect(box.y).toBeGreaterThanOrEqual(e - 1e-6);
              expect(box.x + box.w).toBeLessThanOrEqual(pw - e + 1e-6);
              expect(box.y + box.h).toBeLessThanOrEqual(ph - e + 1e-6);
            }
            for (let a = 0; a < p.placements.length; a++)
              for (let b = a + 1; b < p.placements.length; b++) {
                const A = (p.placements[a] as { box: Box }).box;
                const B = (p.placements[b] as { box: Box }).box;
                const apart =
                  A.x + A.w + g <= B.x + 1e-6 ||
                  B.x + B.w + g <= A.x + 1e-6 ||
                  A.y + A.h + g <= B.y + 1e-6 ||
                  B.y + B.h + g <= A.y + 1e-6;
                expect(apart).toBe(true);
              }
          }
          placed.forEach((p, i) => {
            const it = items[i] as (typeof items)[number];
            const want = Math.min(Math.max(it.longMm, MIN_LONG_MM), fitLongMm(it.aspect, paper, orientation));
            expect(longOf(p.box) / want).toBeCloseTo(1, 3);
            expect(p.box.w / p.box.h).toBeCloseTo(it.aspect, 6);
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('a new page only when the next row does not fit the page; a new row only when the next photo does not fit the row', () => {
    fc.assert(
      fc.property(fc.array(item, { minLength: 2, maxLength: 30 }), (raw) => {
        const items = raw.map((r, i) => ({ index: i + 1, ...r }));
        const pages = flowPages(items, A4, 'portrait');
        const e = EDGE_MM * MM;
        const g = GAP_MM * MM;
        const aw = A4.wPt - 2 * e;
        const ah = A4.hPt - 2 * e;
        // Rows: placements sharing a top line (photos sit on their row's top, like Word; owner 2026-10-24).
        const rowsOf = (p: (typeof pages)[number]) => {
          const rows: Box[][] = [];
          for (const { box } of p.placements) {
            const last = rows[rows.length - 1];
            const top = box.y;
            const lastTop = last ? (last[0] as Box).y : Number.NaN;
            if (last && Math.abs(top - lastTop) < 1e-6 && box.x > (last[last.length - 1] as Box).x) last.push(box);
            else rows.push([box]);
          }
          return rows;
        };
        const width = (r: Box[]) => r.reduce((s, b) => s + b.w, 0) + (r.length - 1) * g;
        const height = (r: Box[]) => Math.max(...r.map((b) => b.h));
        pages.forEach((p, n) => {
          const rows = rowsOf(p);
          // Like a Word page: the first row at the top margin, every row from the left margin, rows one gap apart.
          expect(((rows[0] as Box[])[0] as Box).y).toBeCloseTo(e, 6);
          for (const r of rows) expect((r[0] as Box).x).toBeCloseTo(e, 6);
          rows.slice(1).forEach((r, k) => {
            const above = rows[k] as Box[];
            expect((r[0] as Box).y).toBeCloseTo((above[0] as Box).y + height(above) + g, 6);
          });
          rows.forEach((r, k) => {
            const next = rows[k + 1]?.[0];
            if (next) expect(width(r) + g + next.w).toBeGreaterThan(aw - 1e-6);
          });
          const nextPage = pages[n + 1];
          if (nextPage) {
            const used = rows.reduce((s, r) => s + height(r), 0) + (rows.length - 1) * g;
            expect(used + g + height(rowsOf(nextPage)[0] as Box[])).toBeGreaterThan(ah - 1e-6);
          }
        });
      }),
      { numRuns: 200 },
    );
  });

  // Owner, round 8: photos 10 mm apart, so three of 5.5 cm (not 6 cm) share a row inside A4's edges.
  it('three 5.5 cm photos share a row; growing one pushes the last photo to a new page', () => {
    const three = [1, 2, 3].map((index) => ({ index, aspect: 1, longMm: 55 }));
    const one = flowPages(three, A4, 'portrait');
    expect(one).toHaveLength(1);
    expect(new Set(one[0]?.placements.map((p) => Math.round(p.box.y))).size).toBe(1);
    // A page of 4 rows of three 5.5 cm photos, then one photo grown to fill the width: the rest flows on.
    const twelve = Array.from({ length: 12 }, (_, i) => ({ index: i + 1, aspect: 1, longMm: 55 }));
    expect(flowPages(twelve, A4, 'portrait')).toHaveLength(1);
    const grown = twelve.map((it) => (it.index === 1 ? { ...it, longMm: 150 } : it));
    const pages = flowPages(grown, A4, 'portrait');
    expect(pages).toHaveLength(2);
    expect(pages[1]?.placements.map((p) => p.itemIndex)).toContain(12);
  });

  it('a photo never grows past the space inside the edges, never shrinks below 2 cm', () => {
    const [big] = flowPages([{ index: 1, aspect: 0.75, longMm: 1000 }], A4, 'portrait');
    expect(longOf(big?.placements[0]?.box as Box)).toBeCloseTo(fitLongMm(0.75, A4, 'portrait'), 6);
    // A 3:4 photo on upright A4 is held by the width: 198 mm wide inside the edges, so 198 ÷ 0.75 = 264 mm tall.
    expect(fitLongMm(0.75, A4, 'portrait')).toBeCloseTo((210 - 12) / 0.75, 6);
    // A tall 1:2 photo is held by the height: 297 − 12 = 285 mm.
    expect(fitLongMm(0.5, A4, 'portrait')).toBeCloseTo(297 - 12, 6);
    const [small] = flowPages([{ index: 1, aspect: 1, longMm: 5 }], A4, 'portrait');
    expect(longOf(small?.placements[0]?.box as Box)).toBeCloseTo(MIN_LONG_MM, 6);
  });

  it('100 photos at the smallest size: fast, and never more pages than photos', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ index: i + 1, aspect: 1.5, longMm: 20 }));
    const t0 = performance.now();
    const pages = flowPages(many, A4, 'portrait');
    expect(performance.now() - t0).toBeLessThan(50);
    expect(pages.length).toBeLessThanOrEqual(100);
    expect(pages.flatMap((p) => p.placements)).toHaveLength(100);
  });
});
