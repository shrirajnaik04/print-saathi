import { describe, expect, it } from 'vitest';
import { corpus } from './corpus';
import { detectBorders, parseAnalysis } from './detect';

// Phase 9 (PLAN §F5): the black/blank-edge detector on a synthetic labelled corpus (no customer images).
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe('analysis bytes from the engine', () => {
  it('reads "PSAG", width and height, then the grey rows; anything else is refused', () => {
    const file = new Uint8Array([0x50, 0x53, 0x41, 0x47, 0, 3, 0, 2, 1, 2, 3, 4, 5, 6]);
    expect(parseAnalysis(file)).toEqual({ w: 3, h: 2, grey: new Uint8Array([1, 2, 3, 4, 5, 6]) });
    expect(parseAnalysis(file.slice(0, 13))).toBeNull();
    expect(parseAnalysis(new Uint8Array([0x50, 0x4b, 0x41, 0x47, 0, 1, 0, 1, 9]))).toBeNull();
  });
});

describe('smart crop detector (PLAN §F5 metrics)', () => {
  const samples = corpus();
  const results = samples.map((s) => ({ s, r: detectBorders(s.grey, s.w, s.h, s.kind) }));

  it('the corpus has at least 150 labelled images, positives and negatives', () => {
    expect(samples.length).toBeGreaterThanOrEqual(150);
    expect(samples.filter((s) => s.expect).length).toBeGreaterThanOrEqual(90);
    expect(samples.filter((s) => !s.expect).length).toBeGreaterThanOrEqual(50);
  });

  it('precision ≥ 98 %, recall ≥ 90 %, false suggestions on negatives ≤ 2 %', () => {
    let right = 0;
    let suggested = 0;
    let found = 0;
    let falseOnNegatives = 0;
    const wrong: string[] = [];
    for (const { s, r } of results) {
      if (!r) continue;
      suggested++;
      // Right = within 1 % of each side (the snap inward is ≤ 0.5 %).
      const ok =
        !!s.expect &&
        close(r.crop.x, s.expect.x, 0.01) &&
        close(r.crop.y, s.expect.y, 0.01) &&
        close(r.crop.x + r.crop.w, s.expect.x + s.expect.w, 0.01) &&
        close(r.crop.y + r.crop.h, s.expect.y + s.expect.h, 0.01);
      if (ok) right++;
      else wrong.push(s.name);
      if (!s.expect) falseOnNegatives++;
    }
    for (const { s, r } of results) if (s.expect && r) found++;
    const positives = samples.filter((s) => s.expect).length;
    const negatives = samples.length - positives;
    const precision = right / Math.max(1, suggested);
    const recall = right / positives;
    expect(wrong, `wrong suggestions: ${wrong.join(', ')}`).toEqual(wrong.slice(0, Math.floor(suggested * 0.02)));
    expect(precision).toBeGreaterThanOrEqual(0.98);
    expect(recall, `found ${found} of ${positives}`).toBeGreaterThanOrEqual(0.9);
    expect(falseOnNegatives / negatives).toBeLessThanOrEqual(0.02);
  });

  it('never suggests removing more than 70 % or less than 4 %', () => {
    for (const { r } of results) if (r) expect(r.crop.w * r.crop.h).toBeGreaterThanOrEqual(0.3);
    for (const { r } of results) if (r) expect(1 - r.crop.w * r.crop.h).toBeGreaterThanOrEqual(0.04);
  });

  it('white edges are only for documents and screenshots, never photos', () => {
    const w = 200;
    const h = 200;
    const g = new Uint8Array(w * h).fill(252);
    for (let y = 40; y < 160; y++) for (let x = 0; x < w; x++) g[y * w + x] = (x * 7 + y * 13) % 200;
    expect(detectBorders(g, w, h, 'photo')).toBeNull();
    expect(detectBorders(g, w, h, 'document')?.crop.y).toBeCloseTo(0.2, 1);
  });

  it('is deterministic and leaves a plain photo alone', () => {
    const s = samples[0];
    if (!s) throw new Error('no sample');
    expect(detectBorders(s.grey, s.w, s.h, s.kind)).toEqual(detectBorders(s.grey, s.w, s.h, s.kind));
    expect(detectBorders(new Uint8Array(100 * 100).fill(128), 100, 100, 'photo')).toBeNull();
  });

  it('a turned picture gets the same answer, turned (gate M-7)', () => {
    for (const s of samples.slice(0, 40)) {
      const r = detectBorders(s.grey, s.w, s.h, s.kind);
      // Transposed: rows become columns.
      const tg = new Uint8Array(s.w * s.h);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) tg[x * s.h + y] = s.grey[y * s.w + x] as number;
      const t = detectBorders(tg, s.h, s.w, s.kind);
      expect(!!t, s.name).toBe(!!r);
      if (r && t) {
        expect(t.crop.x, s.name).toBeCloseTo(r.crop.y, 2);
        expect(t.crop.y, s.name).toBeCloseTo(r.crop.x, 2);
        expect(t.crop.w, s.name).toBeCloseTo(r.crop.h, 2);
        expect(t.crop.h, s.name).toBeCloseTo(r.crop.w, 2);
      }
    }
  });
});
