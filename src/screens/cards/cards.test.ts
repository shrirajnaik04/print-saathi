import { describe, expect, it } from 'vitest';
import { landscapeQuad, pickCards } from './Cards';

const q1 = [0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43];
const q2 = [0.15, 0.52, 0.85, 0.52, 0.85, 0.92, 0.15, 0.92];
const card = (quad: number[], confidence: number, face = false) => ({ quad, confidence, face });

describe('which cards print, front first (Phase 14 spec Part 2)', () => {
  it('two photos: the surest card of each; the one with a face is the front', () => {
    const picked = pickCards([
      { index: 1, state: 'ok', cards: [card(q1, 0.9)] },
      { index: 2, state: 'ok', cards: [card(q2, 0.95, true), card(q1, 0.8)] },
    ]);
    expect(picked.map((c) => c.item)).toEqual([2, 1]);
    expect(picked[0]?.quad).toEqual(q2);
    expect(picked.every((c) => c.sure)).toBe(true);
  });

  it('both faces or none: received order', () => {
    const none = pickCards([
      { index: 1, state: 'ok', cards: [card(q1, 0.9)] },
      { index: 2, state: 'ok', cards: [card(q2, 0.9)] },
    ]);
    expect(none.map((c) => c.item)).toEqual([1, 2]);
    const both = pickCards([
      { index: 1, state: 'ok', cards: [card(q1, 0.9, true)] },
      { index: 2, state: 'ok', cards: [card(q2, 0.9, true)] },
    ]);
    expect(both.map((c) => c.item)).toEqual([1, 2]);
  });

  it('one photo with both sides: both cards; an e-Aadhaar: the two panels of its first page with cards', () => {
    expect(
      pickCards([{ index: 1, state: 'ok', cards: [card(q1, 0.9), card(q2, 0.9, true)] }]).map((c) => c.quad),
    ).toEqual([q2, q1]);
    const pdf = pickCards([
      { index: 3, page: 0, state: 'ok', cards: [] },
      { index: 3, page: 1, state: 'ok', cards: [card(q1, 0.95, true), card(q2, 0.95)] },
    ]);
    expect(pdf.map((c) => c.page)).toEqual([1, 1]);
  });

  it('an unsure card is kept but marked; a photo with none gets a starting frame to fix', () => {
    const picked = pickCards([
      { index: 1, state: 'ok', cards: [card(q1, 0.6)] },
      { index: 2, state: 'ok', cards: [] },
    ]);
    expect(picked).toHaveLength(2);
    expect(picked.map((c) => c.sure)).toEqual([false, false]);
    expect(picked[1]?.quad).toHaveLength(8);
  });

  it('a card whose face reads only turned over prints with a half turn (card orientation)', () => {
    const picked = pickCards([
      { index: 1, state: 'ok', cards: [{ quad: q1, confidence: 0.9, face: true, upsideDown: true }] },
    ]);
    expect(picked[0]?.turns).toBe(2);
    expect(pickCards([{ index: 1, state: 'ok', cards: [card(q1, 0.9, true)] }])[0]?.turns).toBe(0);
  });

  it('never more than two cards; damaged files give nothing; bad corners from the engine are ignored', () => {
    expect(
      pickCards([
        { index: 1, state: 'ok', cards: [card(q1, 0.9)] },
        { index: 2, state: 'ok', cards: [card(q2, 0.9)] },
        { index: 3, state: 'ok', cards: [card(q1, 0.9)] },
      ]),
    ).toHaveLength(2);
    expect(pickCards([{ index: 1, state: 'damaged', cards: [] }])).toHaveLength(0);
    expect(pickCards([{ index: 1, state: 'ok', cards: [card([0, 0, 0, 0, 0, 0, 0, 0], 0.99)] }])[0]?.sure).toBe(false);
  });

  it('one photo with a sure and an unsure card: both kept, the unsure one marked (review I5)', () => {
    const picked = pickCards([{ index: 1, state: 'ok', cards: [card(q1, 0.82), card(q2, 0.6)] }]);
    expect(picked).toHaveLength(2);
    expect(picked.map((c) => c.sure)).toEqual([true, false]);
  });

  it('a PDF page with no panels gets a starting frame to fix; a locked one gets nothing (review I3)', () => {
    const pdf = pickCards([{ index: 3, page: 0, state: 'ok', cards: [] }]);
    expect(pdf).toHaveLength(1);
    expect(pdf[0]?.page).toBe(0);
    expect(pdf[0]?.sure).toBe(false);
    expect(pickCards([{ index: 3, page: 0, state: 'locked', cards: [] }])).toHaveLength(0);
  });

  it("a card touching the photo's edge (corners just outside) is kept, its corners brought inside (review m13)", () => {
    const edge = [-0.03, 0.1, 0.6, 0.12, 0.58, 0.45, -0.025, 0.43];
    const picked = pickCards([{ index: 1, state: 'ok', cards: [card(edge, 0.9)] }]);
    expect(picked[0]?.sure).toBe(true);
    expect(Math.min(...(picked[0]?.quad ?? [1]))).toBeGreaterThanOrEqual(0);
  });
});

describe('corners set by hand always print the card lying down (review I4)', () => {
  it('a card standing up: the corners start at a long side, so it is never stretched', () => {
    // On a 4:3 photo, a card standing up: narrow and tall.
    const standing = [0.4, 0.1, 0.6, 0.1, 0.6, 0.7, 0.4, 0.7];
    const q = landscapeQuad(standing, 4 / 3);
    const px = (i: number) => [(q[2 * i] ?? 0) * 4, (q[2 * i + 1] ?? 0) * 3];
    const len = (a: number, b: number) =>
      Math.hypot((px(b)[0] ?? 0) - (px(a)[0] ?? 0), (px(b)[1] ?? 0) - (px(a)[1] ?? 0));
    expect(len(0, 1)).toBeGreaterThan(len(1, 2));
    // Still clockwise and the same four points.
    expect([...q].sort()).toEqual([...standing].sort());
    // A card lying down is left as it is.
    expect(landscapeQuad(q1, 4 / 3)).toEqual(q1);
  });
});
