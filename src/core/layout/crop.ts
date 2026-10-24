/** A part of a photo as fractions (0..1, top-left origin). */
export type CropBox = { x: number; y: number; w: number; h: number };

export const FULL: CropBox = { x: 0, y: 0, w: 1, h: 1 };

export const isFull = (c: CropBox) => c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;

/** Inside the photo and not empty (a hair of rounding allowed). */
export const validBox = (c: unknown): c is CropBox => {
  const b = c as CropBox;
  return (
    !!b &&
    [b.x, b.y, b.w, b.h].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.w > 0 &&
    b.h > 0 &&
    b.x + b.w <= 1 + 1e-9 &&
    b.y + b.h <= 1 + 1e-9
  );
};

/**
 * The same area on the upright photo for a photo shown turned [turns] quarter turns clockwise: exactly the native
 * Crop.uprightOf (a shown point (u, v) is the upright point (v, 1 − u)), kept inside the photo.
 */
export function uprightOf(c: CropBox, turns: number): CropBox {
  const t = ((turns % 4) + 4) % 4;
  const r =
    t === 1
      ? { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w }
      : t === 2
        ? { x: 1 - c.x - c.w, y: 1 - c.y - c.h, w: c.w, h: c.h }
        : t === 3
          ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w }
          : c;
  const x = Math.min(1, Math.max(0, r.x));
  const y = Math.min(1, Math.max(0, r.y));
  return { x, y, w: Math.min(r.w, 1 - x), h: Math.min(r.h, 1 - y) };
}

/** An area of the upright photo as it appears on the photo shown turned [turns] times (the inverse of uprightOf). */
export const shownOf = (c: CropBox, turns: number): CropBox => uprightOf(c, (4 - (((turns % 4) + 4) % 4)) % 4);

/** The smallest side of a hand-made crop (fractions of the photo). */
export const MIN_SIDE = 0.05;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Moves [b] by (dx, dy), stopping at the photo's edges. */
export function moveBox(b: CropBox, dx: number, dy: number): CropBox {
  return { x: clamp01(Math.min(b.x + dx, 1 - b.w)), y: clamp01(Math.min(b.y + dy, 1 - b.h)), w: b.w, h: b.h };
}

/** Grows (f > 1) or shrinks [b] about its centre, within the photo and never below MIN_SIDE. */
export function scaleBox(b: CropBox, f: number): CropBox {
  const w = Math.min(1, Math.max(MIN_SIDE, b.w * f));
  const h = Math.min(1, Math.max(MIN_SIDE, b.h * f));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { x: clamp01(Math.min(cx - w / 2, 1 - w)), y: clamp01(Math.min(cy - h / 2, 1 - h)), w, h };
}

/** Drags corner [corner] (top-left, top-right, bottom-left, bottom-right) by (dx, dy); the opposite corner stays. */
export function dragCorner(b: CropBox, corner: 'tl' | 'tr' | 'bl' | 'br', dx: number, dy: number): CropBox {
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (corner === 'tl' || corner === 'bl') x0 = Math.min(clamp01(x0 + dx), x1 - MIN_SIDE);
  else x1 = Math.max(clamp01(x1 + dx), x0 + MIN_SIDE);
  if (corner === 'tl' || corner === 'tr') y0 = Math.min(clamp01(y0 + dy), y1 - MIN_SIDE);
  else y1 = Math.max(clamp01(y1 + dy), y0 + MIN_SIDE);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
