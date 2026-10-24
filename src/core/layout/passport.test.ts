import { describe, expect, it } from 'vitest';
import { PASSPORT_PRESETS, passportSheets } from './passport';

const MM = 72 / 25.4;
const A4 = { wPt: 595.2755905511812, hPt: 841.8897637795275 };
const PHOTO_4X6 = { wPt: 288, hPt: 432 };
const P35 = PASSPORT_PRESETS['35x45'];
const mm = (pt: number) => pt / MM;

describe('passport sheets (PLAN §G0: slots computed from the paper and its edges)', () => {
  it('4×6 photo paper with 4 mm edges holds 6 photos, upright', () => {
    const s = passportSheets(6, PHOTO_4X6, 4, P35);
    expect(s.perSheet).toBe(6);
    expect(s.pages).toHaveLength(1);
    expect(s.pages[0]?.orientation).toBe('portrait');
  });

  it('4×6 photo paper with 3 mm edges holds 8 photos on a sideways sheet', () => {
    const s = passportSheets(8, PHOTO_4X6, 3, P35);
    expect(s.perSheet).toBe(8);
    expect(s.pages[0]?.orientation).toBe('landscape');
  });

  it('A4 with 6 mm edges holds 30 photos', () => {
    expect(passportSheets(30, A4, 6, P35).perSheet).toBe(30);
  });

  it('7 photos at 6 per sheet are 2 sheets: 6 then 1, never a cut-off seventh', () => {
    const s = passportSheets(7, PHOTO_4X6, 4, P35);
    expect(s.pages.map((p) => p.boxes.length)).toEqual([6, 1]);
  });

  it('every box is exactly the preset size, inside the paper edges, never overlapping, in reading order', () => {
    for (const [paper, edge] of [
      [PHOTO_4X6, 4],
      [PHOTO_4X6, 3],
      [A4, 6],
    ] as const)
      for (const preset of Object.values(PASSPORT_PRESETS)) {
        const s = passportSheets(s0(paper, edge, preset), paper, edge, preset);
        for (const page of s.pages) {
          const [pw, ph] = page.orientation === 'landscape' ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
          page.boxes.forEach((b, i) => {
            expect(mm(b.w)).toBeCloseTo(preset.wMm, 6);
            expect(mm(b.h)).toBeCloseTo(preset.hMm, 6);
            expect(mm(b.x)).toBeGreaterThanOrEqual(edge - 1e-6);
            expect(mm(b.y)).toBeGreaterThanOrEqual(edge - 1e-6);
            expect(mm(pw - b.x - b.w)).toBeGreaterThanOrEqual(edge - 1e-6);
            expect(mm(ph - b.y - b.h)).toBeGreaterThanOrEqual(edge - 1e-6);
            const prev = page.boxes[i - 1];
            if (prev) expect(b.y > prev.y + 1e-6 || (Math.abs(b.y - prev.y) < 1e-6 && b.x > prev.x)).toBe(true);
            for (const o of page.boxes.slice(i + 1))
              expect(
                b.x + b.w <= o.x + 1e-6 ||
                  o.x + o.w <= b.x + 1e-6 ||
                  b.y + b.h <= o.y + 1e-6 ||
                  o.y + o.h <= b.y + 1e-6,
              ).toBe(true);
          });
        }
      }
  });

  it('cut lines run along the gaps only, inside the photo area', () => {
    const s = passportSheets(6, PHOTO_4X6, 4, P35);
    const page = s.pages[0];
    // 2 columns × 3 rows: one line between the columns, two between the rows.
    expect(page?.guides).toHaveLength(3);
    for (const g of page?.guides ?? []) {
      const vertical = Math.abs(g.x1 - g.x2) < 1e-9;
      if (vertical)
        for (const b of page?.boxes ?? []) expect(g.x1 <= b.x + 1e-6 || g.x1 >= b.x + b.w - 1e-6).toBe(true);
      else for (const b of page?.boxes ?? []) expect(g.y1 <= b.y + 1e-6 || g.y1 >= b.y + b.h - 1e-6).toBe(true);
    }
  });

  it('presets: 35 × 45 mm, 20 × 25 mm and 2 × 2 in', () => {
    expect(PASSPORT_PRESETS['35x45']).toMatchObject({ wMm: 35, hMm: 45 });
    expect(PASSPORT_PRESETS['20x25']).toMatchObject({ wMm: 20, hMm: 25 });
    expect(PASSPORT_PRESETS['2x2in']).toMatchObject({ wMm: 50.8, hMm: 50.8 });
  });

  it('no photo fits: no sheets (never a box past the paper)', () => {
    expect(passportSheets(5, { wPt: 50, hPt: 50 }, 4, P35).pages).toEqual([]);
  });
});

/** As many photos as one sheet holds, so the test sees a full sheet. */
function s0(
  paper: { wPt: number; hPt: number },
  edge: number,
  preset: (typeof PASSPORT_PRESETS)[keyof typeof PASSPORT_PRESETS],
) {
  return passportSheets(1, paper, edge, preset).perSheet;
}
