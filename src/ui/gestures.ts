/** One step of a drag (one finger) or a pinch (two fingers: how much bigger, about which point, and how far it moved). */
export type GestureStep =
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'pinch'; factor: number; cx: number; cy: number; dx: number; dy: number };

/**
 * Follows up to two fingers (screen px; pointer ids) and turns each move into a step: one finger drags, two pinch. A
 * third finger is ignored; a finger lifted or a cancelled touch ends the pinch, and the finger left drags on from where
 * it is, without a jump. Pure, so it is tested without a screen (Fit the face, Crop, Adjust).
 */
export function trackGesture() {
  const at = new Map<number, { x: number; y: number }>();
  const middle = () => {
    const [a, b] = [...at.values()];
    if (!a) return { x: 0, y: 0, d: 0 };
    if (!b) return { x: a.x, y: a.y, d: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  return {
    /** A finger touched; false when it is ignored (a third finger). */
    down(id: number, x: number, y: number): boolean {
      if (at.size >= 2 && !at.has(id)) return false;
      at.set(id, { x, y });
      return true;
    },
    move(id: number, x: number, y: number): GestureStep | null {
      if (!at.has(id)) return null;
      const before = middle();
      at.set(id, { x, y });
      const after = middle();
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      if (at.size === 1) return { kind: 'pan', dx, dy };
      return { kind: 'pinch', factor: before.d > 0 ? after.d / before.d : 1, cx: after.x, cy: after.y, dx, dy };
    },
    /** A finger lifted, or its touch cancelled. */
    up(id: number): void {
      at.delete(id);
    },
    /** How many fingers are down. */
    get fingers(): number {
      return at.size;
    },
  };
}
