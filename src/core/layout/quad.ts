import { validQuad } from '../job/job';
import { type CropBox, MIN_SIDE } from './crop';

/**
 * Straightened frames (owner, 2026-10-24: the scanner app's crop, each corner free). A frame is 8 fractions of the
 * upright photo: top-left, top-right, bottom-right, bottom-left, clockwise on screen. The engine straightens the part
 * inside it (the ID-card path); a frame square with the photo is kept as a plain crop instead.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A crop as the frame around it. */
export const quadOfBox = (b: CropBox): number[] => [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h];

/** The crop a frame is when its sides are square with the photo (each within [tol]); null for a slanted frame. */
export function boxOfSquareQuad(q: number[], tol = 0.005): CropBox | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  if (Math.abs(y0 - y1) > tol || Math.abs(y3 - y2) > tol || Math.abs(x0 - x3) > tol || Math.abs(x1 - x2) > tol)
    return null;
  const x = clamp01((x0 + x3) / 2);
  const y = clamp01((y0 + y1) / 2);
  const w = Math.min(1 - x, (x1 + x2) / 2 - x);
  const h = Math.min(1 - y, (y3 + y2) / 2 - y);
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * The straightened part's shape (width ÷ height): its top and bottom sides averaged over its left and right sides,
 * measured on the photo ([photoAspect] = the upright photo's width ÷ height).
 */
export function straightAspect(q: number[], photoAspect: number): number {
  const pt = (k: number) => [(q[2 * k] as number) * photoAspect, q[2 * k + 1] as number] as const;
  const len = (a: number, b: number) => Math.hypot(pt(a)[0] - pt(b)[0], pt(a)[1] - pt(b)[1]);
  return (len(0, 1) + len(3, 2)) / (len(0, 3) + len(1, 2));
}

/** One quarter turn clockwise of a point of the photo: its left edge becomes the top. */
const cw = (x: number, y: number) => [1 - y, x];
const ccw = (x: number, y: number) => [y, 1 - x];

/** The frame on the photo as shown turned [turns] times clockwise, its shown top-left corner first. */
export function shownQuad(q: number[], turns: number): number[] {
  const t = ((turns % 4) + 4) % 4;
  const pts = [0, 1, 2, 3].map((k) => {
    let p = [q[2 * k] as number, q[2 * k + 1] as number];
    for (let i = 0; i < t; i++) p = cw(p[0] as number, p[1] as number);
    return p;
  });
  return [0, 1, 2, 3].flatMap((k) => pts[(k - t + 4) % 4] as number[]);
}

/** The frame back on the upright photo (the inverse of [shownQuad]). */
export function uprightQuad(q: number[], turns: number): number[] {
  const t = ((turns % 4) + 4) % 4;
  const pts = [0, 1, 2, 3].map((k) => {
    let p = [q[2 * k] as number, q[2 * k + 1] as number];
    for (let i = 0; i < t; i++) p = ccw(p[0] as number, p[1] as number);
    return p;
  });
  return [0, 1, 2, 3].flatMap((k) => pts[(k + t) % 4] as number[]);
}

/** A frame the engine can straighten and the shopkeeper can still see: not crossed, at least 5 % each way. */
function usable(q: number[]): boolean {
  const xs = q.filter((_, i) => i % 2 === 0);
  const ys = q.filter((_, i) => i % 2 === 1);
  return (
    validQuad(q) &&
    q.every((v) => v >= 0 && v <= 1) &&
    Math.max(...xs) - Math.min(...xs) >= MIN_SIDE &&
    Math.max(...ys) - Math.min(...ys) >= MIN_SIDE
  );
}

/** Corner [k] (0 top-left … 3 bottom-left) to (x, y), kept on the photo; an unusable frame is not taken. */
export function moveCorner(q: number[], k: number, x: number, y: number): number[] {
  const next = [...q];
  next[2 * k] = clamp01(x);
  next[2 * k + 1] = clamp01(y);
  return usable(next) ? next : q;
}

/** The largest part of (dx, dy) that keeps corners [ks] on the photo. */
function within(q: number[], ks: number[], dx: number, dy: number): [number, number] {
  let ax = dx;
  let ay = dy;
  for (const k of ks) {
    const x = q[2 * k] as number;
    const y = q[2 * k + 1] as number;
    ax = Math.min(Math.max(ax, -x), 1 - x);
    ay = Math.min(Math.max(ay, -y), 1 - y);
  }
  return [ax, ay];
}

function shift(q: number[], ks: number[], dx: number, dy: number): number[] {
  const [ax, ay] = within(q, ks, dx, dy);
  const next = [...q];
  for (const k of ks) {
    next[2 * k] = (q[2 * k] as number) + ax;
    next[2 * k + 1] = (q[2 * k + 1] as number) + ay;
  }
  return usable(next) ? next : q;
}

/** Side [side] (0 top, 1 right, 2 bottom, 3 left) moved by (dx, dy): both of its corners together. */
export const moveSide = (q: number[], side: 0 | 1 | 2 | 3, dx: number, dy: number): number[] =>
  shift(q, [side, (side + 1) % 4], dx, dy);

/** The whole frame moved, stopping at the photo's edges. */
export const moveQuad = (q: number[], dx: number, dy: number): number[] => shift(q, [0, 1, 2, 3], dx, dy);

/** The frame [f] times bigger around its middle, moved back onto the photo if it can be; else not taken. */
export function scaleQuad(q: number[], f: number): number[] {
  const cx = (q.filter((_, i) => i % 2 === 0) as number[]).reduce((s, v) => s + v, 0) / 4;
  const cy = (q.filter((_, i) => i % 2 === 1) as number[]).reduce((s, v) => s + v, 0) / 4;
  const scaled = q.map((v, i) => (i % 2 === 0 ? cx : cy) + (v - (i % 2 === 0 ? cx : cy)) * f);
  const xs = scaled.filter((_, i) => i % 2 === 0);
  const ys = scaled.filter((_, i) => i % 2 === 1);
  if (Math.max(...xs) - Math.min(...xs) > 1 || Math.max(...ys) - Math.min(...ys) > 1) return q;
  const dx = Math.max(0, -Math.min(...xs)) - Math.max(0, Math.max(...xs) - 1);
  const dy = Math.max(0, -Math.min(...ys)) - Math.max(0, Math.max(...ys) - 1);
  const next = scaled.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
  return usable(next) ? next : q;
}

/**
 * The perspective mapping of the unit square onto the frame (Heckbert 1989, square to quadrilateral): (u, v) on the
 * straightened picture → (x, y) on the photo, and back. The engine straightens with the same mapping (Homography.kt).
 */
export function homography(q: number[]): {
  map: (u: number, v: number) => [number, number];
  unmap: (x: number, y: number) => [number, number];
} {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a: number;
  let b: number;
  let d: number;
  let e: number;
  let g: number;
  let h: number;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // A parallelogram: no perspective.
    a = x1 - x0;
    b = x3 - x0;
    d = y1 - y0;
    e = y3 - y0;
    g = 0;
    h = 0;
  } else {
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
  }
  const c = x0;
  const f = y0;
  const map = (u: number, v: number): [number, number] => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
  // The inverse matrix (adjugate of [[a, b, c], [d, e, f], [g, h, 1]]).
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const unmap = (x: number, y: number): [number, number] => {
    const w = G * x + H * y + I;
    return [(A * x + B * y + C) / w, (D * x + E * y + F) / w];
  };
  return { map, unmap };
}
