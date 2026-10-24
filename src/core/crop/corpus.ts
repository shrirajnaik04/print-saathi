/**
 * A synthetic, labelled smart-crop corpus (PLAN §F5, Phase 9): no customer images. Every image is made from a fixed
 * seed, so the metrics are the same on every run. "Clearly croppable" = uniform bars of at least 4 % of the area.
 */
import type { Kind } from './detect';

export type Sample = {
  name: string;
  kind: Kind;
  w: number;
  h: number;
  grey: Uint8Array;
  /** The content area as fractions, or null for a negative (nothing to crop). */
  expect: { x: number; y: number; w: number; h: number } | null;
};

/** Small, fast, seeded random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** A photo-like picture: smooth shapes plus grain, mean around [base]. */
function texture(w: number, h: number, base: number, r: () => number): (x: number, y: number) => number {
  const fx = 2 + r() * 6;
  const fy = 2 + r() * 6;
  const phase = r() * 6.28;
  const amp = 30 + r() * 50;
  return (x, y) =>
    base +
    amp * Math.sin((x / w) * fx * 3.14 + phase) * Math.cos((y / h) * fy * 3.14) +
    40 * Math.sin(((x + y) / (w + h)) * 9 + phase) +
    (r() - 0.5) * 24;
}

function image(w: number, h: number, px: (x: number, y: number) => number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = clamp(px(x, y));
  return g;
}

/** Bars of [bar] colour around a content box; the boundary is softened over 1 px (like a resized screenshot). */
function barred(
  w: number,
  h: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  bar: number,
  content: (x: number, y: number) => number,
  r: () => number,
): Uint8Array {
  return image(w, h, (x, y) => {
    const inside = x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
    if (inside) return content(x, y);
    const edge = x === box.x0 - 1 || x === box.x1 || y === box.y0 - 1 || y === box.y1;
    return bar + (r() - 0.5) * 4 + (edge ? (content(x, y) - bar) * 0.25 : 0);
  });
}

export function corpus(): Sample[] {
  const out: Sample[] = [];
  const r = rng(20261017);
  const sizes: [number, number][] = [
    [512, 384],
    [384, 512],
    [512, 288],
    [236, 512],
  ];
  // ---- Positives: letterbox, pillarbox, screenshot status/navigation bars, scan margins ----
  for (let i = 0; i < 100; i++) {
    const [w, h] = sizes[i % sizes.length] as [number, number];
    const kind: Kind = i % 5 === 0 ? 'document' : i % 5 === 1 ? 'screenshot' : 'photo';
    const white = kind !== 'photo' && i % 3 === 0;
    const bar = white ? 248 + r() * 6 : r() * 25;
    const variant = i % 4;
    const t = 0.06 + r() * 0.14; // bar size: 6–20 % of the side
    const box = { x0: 0, y0: 0, x1: w, y1: h };
    if (variant === 0) {
      box.y0 = Math.round(h * t);
      box.y1 = h - Math.round(h * t);
    } else if (variant === 1) {
      box.x0 = Math.round(w * t);
      box.x1 = w - Math.round(w * t);
    } else if (variant === 2) {
      box.y0 = Math.round(h * t); // a status bar only
    } else {
      box.x0 = Math.round(w * t * 0.6);
      box.x1 = w - Math.round(w * t * 0.6);
      box.y0 = Math.round(h * t * 0.6);
      box.y1 = h - Math.round(h * t * 0.6);
    }
    const base = white ? 60 + r() * 120 : 80 + r() * 120;
    const content = texture(w, h, base, r);
    out.push({
      name: `bars-${i}`,
      kind,
      w,
      h,
      grey: barred(w, h, box, bar, content, r),
      expect: { x: box.x0 / w, y: box.y0 / h, w: (box.x1 - box.x0) / w, h: (box.y1 - box.y0) / h },
    });
  }
  // ---- Negatives ----
  for (let i = 0; i < 60; i++) {
    const [w, h] = sizes[i % sizes.length] as [number, number];
    const kind: Kind = i % 6 === 0 ? 'document' : 'photo';
    const type = i % 5;
    let px: (x: number, y: number) => number;
    if (type === 0) {
      // A dark photo: everything dim, grainy.
      const t = texture(w, h, 25, r);
      px = (x, y) => t(x, y) * 0.5;
    } else if (type === 1) {
      // A night scene: a black sky at the top fading into a lit city.
      const t = texture(w, h, 110, r);
      const sky = 0.2 + r() * 0.25;
      px = (x, y) => (y < h * sky ? 4 + (r() - 0.5) * 4 : t(x, y) * Math.min(1, (y - h * sky) / (h * 0.15)));
    } else if (type === 2) {
      // An object on a black studio background.
      const t = texture(w, h, 150, r);
      const cx = w / 2;
      const cy = h / 2;
      const rad = Math.min(w, h) * (0.25 + r() * 0.15);
      px = (x, y) => (Math.hypot(x - cx, y - cy) < rad ? t(x, y) : 3 + (r() - 0.5) * 4);
    } else if (type === 3) {
      // A vignette: corners darken smoothly.
      const t = texture(w, h, 140, r);
      px = (x, y) => t(x, y) * (1 - 0.9 * (Math.hypot(x / w - 0.5, y / h - 0.5) / 0.71) ** 2);
    } else {
      // An ordinary photo with nothing to crop.
      px = texture(w, h, 70 + r() * 110, r);
    }
    out.push({ name: `negative-${type}-${i}`, kind, w, h, grey: image(w, h, px), expect: null });
  }
  return out;
}
