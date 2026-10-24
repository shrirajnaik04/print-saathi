import { describe, expect, it } from 'vitest';
import { trackGesture } from './gestures';

describe('one finger drags, two fingers pinch (Fit the face, Crop, Adjust)', () => {
  it('one finger: each move is a pan by the finger’s step', () => {
    const g = trackGesture();
    expect(g.down(1, 100, 100)).toBe(true);
    expect(g.move(1, 110, 95)).toEqual({ kind: 'pan', dx: 10, dy: -5 });
    expect(g.move(1, 112, 95)).toEqual({ kind: 'pan', dx: 2, dy: 0 });
  });

  it('two fingers: spreading them is a zoom about their middle', () => {
    const g = trackGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    const s = g.move(2, 300, 100);
    expect(s?.kind).toBe('pinch');
    if (s?.kind !== 'pinch') return;
    expect(s.factor).toBeCloseTo(2, 9);
    expect(s.cx).toBe(200);
    expect(s.cy).toBe(100);
  });

  it('gesture survives cancel and extra fingers', () => {
    const g = trackGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    expect(g.down(3, 50, 50)).toBe(false); // a third finger is ignored
    expect(g.move(3, 60, 60)).toBeNull();
    g.up(2); // one finger lifted (or the touch cancelled): no pinch any more
    expect(g.move(1, 105, 100)).toEqual({ kind: 'pan', dx: 5, dy: 0 }); // no jump to where the other finger was
    g.up(1);
    expect(g.move(1, 300, 300)).toBeNull();
    expect(g.down(4, 10, 10)).toBe(true); // a new drag works
    expect(g.move(4, 12, 10)).toEqual({ kind: 'pan', dx: 2, dy: 0 });
  });
});
