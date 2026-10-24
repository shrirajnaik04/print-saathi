import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectBorders, MIN_CONFIDENCE, parseAnalysis } from './detect';

// Phase 10 fuzz (PLAN §R levels 1, 12): analysis files are made by the engine from customer photos, so whatever they
// hold, reading them and looking for edges must never throw, and any suggestion must stay inside the photo.
describe('black-edge detector under random input', () => {
  it('reads any bytes as an analysis file or refuses them', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), fc.boolean(), (bytes, header) => {
        const file = header ? Uint8Array.from([0x50, 0x53, 0x41, 0x47, ...bytes]) : bytes;
        const a = parseAnalysis(file);
        if (a) expect(a.grey.length).toBe(a.w * a.h);
      }),
      { numRuns: 3000, seed: 20261017 },
    );
  });

  it('finds edges in random pictures without throwing, inside the photo', () => {
    const picture = fc
      .record({
        w: fc.integer({ min: 1, max: 96 }),
        h: fc.integer({ min: 1, max: 96 }),
        // Random noise, flat colours, and bars: the detector's interesting inputs.
        fill: fc.constantFrom('noise', 'flat', 'bars'),
        level: fc.integer({ min: 0, max: 255 }),
        bar: fc.integer({ min: 0, max: 40 }),
        seed: fc.integer(),
      })
      .map(({ w, h, fill, level, bar, seed }) => {
        let s = seed >>> 0 || 1;
        const rnd = () => {
          s ^= s << 13;
          s ^= s >>> 17;
          s ^= s << 5;
          return (s >>> 0) & 255;
        };
        const grey = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const edge = y < bar || y >= h - bar || x < bar / 2;
            grey[y * w + x] = fill === 'flat' ? level : fill === 'bars' && edge ? level : rnd();
          }
        return { w, h, grey };
      });
    let suggested = 0;
    fc.assert(
      fc.property(picture, fc.constantFrom('photo', 'document', 'screenshot' as const), ({ w, h, grey }, kind) => {
        const r = detectBorders(grey, w, h, kind);
        if (!r) return;
        suggested++;
        const { x, y, w: cw, h: ch } = r.crop;
        expect(r.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + cw).toBeLessThanOrEqual(1 + 1e-9);
        expect(y + ch).toBeLessThanOrEqual(1 + 1e-9);
        // Keeps at least 30 % and removes at least 4 % (PLAN §F5).
        expect(cw * ch).toBeGreaterThanOrEqual(0.3 - 1e-9);
        expect(cw * ch).toBeLessThanOrEqual(0.96 + 1e-9);
      }),
      { numRuns: 3000, seed: 20261017 },
    );
    // The bars pictures do get suggestions, so the checks above really ran.
    expect(suggested).toBeGreaterThan(50);
  });

  it('refuses a picture whose bytes are shorter than its size says', () => {
    expect(detectBorders(new Uint8Array(10), 64, 64, 'photo')).toBeNull();
  });
});
