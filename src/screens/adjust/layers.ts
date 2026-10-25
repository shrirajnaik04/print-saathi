import type { Spot } from '../../core/layout/free';

/**
 * Bring to front / Send to back (owner, round 6): [spots] with photo [index] one layer above (or below) every other
 * photo on its page, or null when there is nothing to change (no place, alone on its page, already there).
 */
export function stackedSpots(
  spots: Record<number, Spot>,
  index: number,
  to: 'front' | 'back',
): Record<number, Spot> | null {
  const mine = spots[index];
  if (!mine) return null;
  const others = Object.entries(spots)
    .filter(([k, s]) => Number(k) !== index && s.page === mine.page)
    .map(([, s]) => s.z);
  if (others.length === 0) return null;
  if (to === 'front' ? mine.z > Math.max(...others) : mine.z < Math.min(...others)) return null;
  // The page's layers numbered 1, 2, 3 again with this one first or last, so the numbers never grow without end.
  const rest = Object.entries(spots)
    .filter(([k, s]) => Number(k) !== index && s.page === mine.page)
    .sort((a, b) => a[1].z - b[1].z || Number(a[0]) - Number(b[0]))
    .map(([k]) => Number(k));
  const out = { ...spots };
  (to === 'front' ? [...rest, index] : [index, ...rest]).forEach((k, i) => {
    out[k] = { ...(spots[k] as Spot), z: i + 1 };
  });
  return out;
}

const MM = 72 / 25.4;
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Which of Bring to front / Send to back can change anything for the one at [me] in [boxes] (drawn bottom to top):
 * front when one it covers is drawn above it, back when one it covers is drawn below it. Covering means more than 1 mm²
 * in common, as the page's "These photos cover each other" note says.
 */
export function layerState(boxes: readonly Rect[], me: number): { front: boolean; back: boolean } {
  const mine = boxes[me];
  const covered = (i: number) => {
    const b = boxes[i];
    if (!mine || !b || i === me) return false;
    const w = Math.min(mine.x + mine.w, b.x + b.w) - Math.max(mine.x, b.x);
    const h = Math.min(mine.y + mine.h, b.y + b.h) - Math.max(mine.y, b.y);
    return w > 0 && h > 0 && w * h > MM * MM;
  };
  return {
    front: boxes.some((_, i) => i > me && covered(i)),
    back: boxes.some((_, i) => i < me && covered(i)),
  };
}
