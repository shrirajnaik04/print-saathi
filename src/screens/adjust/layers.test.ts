import { describe, expect, it } from 'vitest';
import { layerState, stackedSpots } from './layers';

// Owner, round 6: Bring to front / Send to back, among the photos on the same page.
const spots = {
  1: { page: 0, x: 40, y: 50, z: 1 },
  2: { page: 0, x: 45, y: 55, z: 2 },
  3: { page: 1, x: 40, y: 50, z: 7 },
};

describe('Bring to front / Send to back (round 6)', () => {
  it('front is above every other photo on its page; photos on other pages do not count', () => {
    const r = stackedSpots(spots, 1, 'front');
    expect(r?.[1]?.z).toBeGreaterThan(r?.[2]?.z ?? 99);
  });
  it('back is below every other photo on its page', () => {
    const r = stackedSpots(spots, 2, 'back');
    expect(r?.[2]?.z).toBeLessThan(r?.[1]?.z ?? -99);
  });
  it('the layers of the page are numbered 1, 2, 3 again, so they never grow without end (review M4)', () => {
    let s: Record<number, (typeof spots)[1]> = { 1: { ...spots[1], z: 998 }, 2: { ...spots[2], z: 999 } };
    for (let i = 0; i < 6; i++) s = stackedSpots(s, i % 2 ? 2 : 1, i % 2 ? 'back' : 'front') ?? s;
    expect(
      Object.values(s)
        .map((p) => p.z)
        .sort(),
    ).toEqual([1, 2]);
  });
  it('already on top (or below), alone on its page, or without a place: nothing to change', () => {
    expect(stackedSpots(spots, 2, 'front')).toBeNull();
    expect(stackedSpots(spots, 1, 'back')).toBeNull();
    expect(stackedSpots(spots, 3, 'front')).toBeNull();
    expect(stackedSpots(spots, 9, 'front')).toBeNull();
  });
  it('photos on other pages are left as they are; the page keeps its order apart from the one moved', () => {
    const r = stackedSpots(spots, 1, 'front');
    expect(r?.[3]).toEqual(spots[3]);
    expect(r?.[2]).toEqual({ ...spots[2], z: 1 });
  });
});

describe('which layer buttons can change anything (round 6)', () => {
  const box = (x: number, y: number) => ({ x, y, w: 100, h: 100 });
  // Drawn bottom to top.
  const boxes = [box(0, 0), box(50, 50), box(500, 500)];
  it('a photo over another can go behind it; the one below it can come forward', () => {
    expect(layerState(boxes, 1)).toEqual({ front: false, back: true });
    expect(layerState(boxes, 0)).toEqual({ front: true, back: false });
  });
  it('in the middle of two it covers, it can go either way', () => {
    expect(layerState([box(0, 0), box(40, 40), box(80, 80)], 1)).toEqual({ front: true, back: true });
  });
  it('a photo that covers nothing has nothing to change; neither has a missing one', () => {
    expect(layerState(boxes, 2)).toEqual({ front: false, back: false });
    expect(layerState(boxes, -1)).toEqual({ front: false, back: false });
  });
  it('touching edges or a sliver (1 mm² or less) is not covering', () => {
    expect(layerState([box(0, 0), box(100, 0)], 0)).toEqual({ front: false, back: false });
    expect(layerState([box(0, 0), { x: 99.5, y: 99.5, w: 100, h: 100 }], 0)).toEqual({ front: false, back: false });
  });
});
