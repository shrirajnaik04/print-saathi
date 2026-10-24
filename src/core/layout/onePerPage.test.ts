import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { A4, EDGE_MM, onePerPage } from './onePerPage';

const MM = 72 / 25.4;

describe('onePerPage (PLAN §G0: largest uncut fit, page direction per photo)', () => {
  it('a portrait photo gets a portrait page filled edge to edge in one direction', () => {
    const [p] = onePerPage([{ index: 1, aspect: 3 / 4 }], A4);
    expect(p?.orientation).toBe('portrait');
    const b = p!.placements[0]!.box;
    const availW = A4.wPt - 2 * EDGE_MM * MM;
    const availH = A4.hPt - 2 * EDGE_MM * MM;
    expect(Math.abs(b.w - availW) < 1e-6 || Math.abs(b.h - availH) < 1e-6).toBe(true);
  });

  it('a landscape photo gets a sideways page', () => {
    expect(onePerPage([{ index: 1, aspect: 4 / 3 }], A4)[0]?.orientation).toBe('landscape');
  });

  // Photos fill a page like Word (owner, 2026-10-24); documents keep their page centred (the default).
  it('top-left: the photo at the top-left corner inside the edges, as large as fits', () => {
    for (const aspect of [0.5, 3 / 4, 1, 4 / 3, 3]) {
      const [p] = onePerPage([{ index: 1, aspect }], A4, 'portrait', 'topLeft');
      const b = p!.placements[0]!.box;
      expect(b.x).toBeCloseTo(EDGE_MM * MM, 6);
      expect(b.y).toBeCloseTo(EDGE_MM * MM, 6);
      expect(Math.abs(b.w / b.h - aspect) / aspect).toBeLessThan(0.001);
    }
  });

  it('property: one photo per page, in order, uncut, inside the printable area, centred, maximal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.2, max: 5, noNaN: true }), { minLength: 1, maxLength: 30 }),
        (aspects) => {
          const pages = onePerPage(
            aspects.map((aspect, i) => ({ index: i + 1, aspect })),
            A4,
          );
          if (pages.length !== aspects.length) return false;
          return pages.every((pg, i) => {
            const [pw, ph] = pg.orientation === 'landscape' ? [A4.hPt, A4.wPt] : [A4.wPt, A4.hPt];
            const e = EDGE_MM * MM;
            const pl = pg.placements;
            if (pl.length !== 1 || pl[0]!.itemIndex !== i + 1) return false;
            const b = pl[0]!.box;
            const inside =
              b.x >= e - 1e-6 && b.y >= e - 1e-6 && b.x + b.w <= pw - e + 1e-6 && b.y + b.h <= ph - e + 1e-6;
            const aspectErr = Math.abs(b.w / b.h - aspects[i]!) / aspects[i]!;
            const centred = Math.abs(b.x + b.w / 2 - pw / 2) < 1e-6 && Math.abs(b.y + b.h / 2 - ph / 2) < 1e-6;
            const maximal = Math.abs(b.w - (pw - 2 * e)) < 1e-6 || Math.abs(b.h - (ph - 2 * e)) < 1e-6;
            const directionMatches = aspects[i]! > 1 === (pg.orientation === 'landscape');
            return inside && aspectErr <= 0.001 && centred && maximal && directionMatches;
          });
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('is deterministic', () => {
    const items = [
      { index: 1, aspect: 0.75 },
      { index: 2, aspect: 1.5 },
    ];
    expect(onePerPage(items, A4)).toEqual(onePerPage(items, A4));
  });
});
