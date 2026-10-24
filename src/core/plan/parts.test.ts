import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SHEETS_PER_PART, splitParts } from './parts';
import type { PrintPlan } from './plan';

/** A plan whose page n holds one placement of item n, so every printed sheet can be traced back to its page. */
const planOf = (pages: number, copies: number): PrintPlan => ({
  v: 1,
  jobId: 'j',
  rev: 1,
  paper: { id: 'A4', wPt: 595.28, hPt: 841.89 },
  colour: 'colour',
  copies,
  contentType: 'photo',
  pages: Array.from({ length: pages }, (_, i) => ({
    orientation: 'portrait' as const,
    placements: [
      { itemIndex: i + 1, crop: { x: 0, y: 0, w: 1, h: 1 }, turns: 0, box: { x: 0, y: 0, w: 10, h: 10 } },
    ] as never,
  })),
});
/** The printed sheets in order (collated: every page of copy 1, then of copy 2, …), as page numbers. */
const sheets = (p: PrintPlan) =>
  Array.from({ length: p.copies }, () =>
    p.pages.map((pg) => (pg.placements[0] as { itemIndex: number }).itemIndex),
  ).flat();

describe('big jobs print in parts (PLAN §D4: at most 40 sheets each)', () => {
  it('a job of up to 40 sheets is one part: the very same plan (same print file)', () => {
    const p = planOf(20, 2);
    expect(splitParts(p)).toEqual([p]);
    expect(splitParts(p)[0]).toBe(p);
    expect(splitParts(planOf(40, 1))).toHaveLength(1);
  });

  it('41 sheets are two parts: 40 then 1', () => {
    const parts = splitParts(planOf(41, 1));
    expect(parts.map((x) => sheets(x).length)).toEqual([40, 1]);
  });

  it('1 photo × 99 copies prints as 40 + 40 + 19 single copies', () => {
    const parts = splitParts(planOf(1, 99));
    expect(parts.map((x) => sheets(x).length)).toEqual([40, 40, 19]);
    expect(parts.every((x) => x.copies === 1)).toBe(true);
  });

  it('every sheet prints exactly once, in order, never more than 40 in a part', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 120 }), fc.integer({ min: 1, max: 99 }), (pages, copies) => {
        const p = planOf(pages, copies);
        const parts = splitParts(p);
        expect(parts.flatMap(sheets)).toEqual(sheets(p));
        expect(parts.every((x) => sheets(x).length >= 1 && sheets(x).length <= MAX_SHEETS_PER_PART)).toBe(true);
        expect(parts).toHaveLength(Math.ceil((pages * copies) / MAX_SHEETS_PER_PART));
        // Everything but the pages and copies stays as chosen (paper, colour, job).
        for (const x of parts) expect({ ...x, pages: [], copies: 0 }).toEqual({ ...p, pages: [], copies: 0 });
      }),
      { numRuns: 2000 },
    );
  });
});
