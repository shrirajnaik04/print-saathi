import type { PrintPlan } from '../plan/plan';
import { type CropBox, FULL, MIN_SIDE, shownOf } from './crop';
import { fitLongMm } from './flow';
import { type Box, EDGE_MM, type LayoutPage, type Paper } from './onePerPage';
import { homography, quadOfBox, straightAspect } from './quad';

const MM = 72 / 25.4;

/**
 * A photo placed by hand (owner, 2026-10-24: "press and hold … place anywhere in the page"): its centre in mm from the
 * page's top-left, in the page's own direction; [page] counts from 0; the one with the highest [z] is drawn on top.
 */
export type Spot = { page: number; x: number; y: number; z: number };

type Direction = 'portrait' | 'landscape';

/** The page's size (points) in its direction. */
function pageOf(paper: Paper, direction: Direction) {
  return direction === 'landscape' ? { w: paper.hPt, h: paper.wPt } : { w: paper.wPt, h: paper.hPt };
}

/** The centre (points) that keeps [box] inside the page's margins (a box larger than the room: at the margin). */
export function clampCentre(box: Box, paper: Paper, direction: Direction): { x: number; y: number } {
  const e = (paper.edgeMm ?? EDGE_MM) * MM;
  const { w, h } = pageOf(paper, direction);
  const fit = (c: number, size: number, room: number) =>
    size >= room - 2 * e ? e + size / 2 : Math.min(room - e - size / 2, Math.max(e + size / 2, c));
  return { x: fit(box.x, box.w, w), y: fit(box.y, box.h, h) };
}

/**
 * The pages of the photos placed by hand: each photo at its size (long side mm, never larger than fits) around its
 * spot, kept inside the margins, drawn in z order; pages left empty are left out. [rest]: the photos with no spot, in
 * order (they flow on pages after these).
 */
export function pinnedPages(
  items: { index: number; aspect: number; longMm: number }[],
  spots: Record<number, Spot>,
  paper: Paper,
  direction: Direction,
): { pages: LayoutPage[]; rest: number[] } {
  const byPage = new Map<number, { index: number; box: Box; z: number }[]>();
  const rest: number[] = [];
  for (const it of items) {
    const s = spots[it.index];
    if (!s) {
      rest.push(it.index);
      continue;
    }
    const long = Math.min(it.longMm, fitLongMm(it.aspect, paper, direction)) * MM;
    const w = it.aspect >= 1 ? long : long * it.aspect;
    const h = w / it.aspect;
    const c = clampCentre({ x: s.x * MM, y: s.y * MM, w, h }, paper, direction);
    const list = byPage.get(s.page) ?? [];
    list.push({ index: it.index, box: { x: c.x - w / 2, y: c.y - h / 2, w, h }, z: s.z });
    byPage.set(s.page, list);
  }
  const pages = [...byPage.keys()]
    .sort((a, b) => a - b)
    .map((p) => ({
      orientation: direction,
      placements: (byPage.get(p) ?? []).sort((a, b) => a.z - b.z).map(({ index, box }) => ({ itemIndex: index, box })),
    }));
  return { pages, rest };
}

/**
 * The first move by hand fixes every photo where it is (owner, 2026-10-24: the others stay): each photo of [plan] gets
 * its page and centre (mm); photos already placed keep their spots, the others go on pages after the last placed one,
 * in drawing order, each above the ones before.
 */
export function spotsFromPlan(plan: PrintPlan, spots: Record<number, Spot> | undefined): Record<number, Spot> {
  const out: Record<number, Spot> = { ...(spots ?? {}) };
  // Pages of photos still on the plan only: a removed photo keeps its spot (Undo) but its page no longer counts.
  const inPlan = new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex)));
  const stored = [
    ...new Set(
      Object.entries(out)
        .filter(([k]) => inPlan.has(Number(k)))
        .map(([, s]) => s.page),
    ),
  ].sort((a, b) => a - b);
  const after = stored.length ? Math.max(...stored) + 1 : 0;
  let z = Math.max(0, ...Object.values(out).map((s) => s.z));
  plan.pages.forEach((pg, i) => {
    for (const p of pg.placements) {
      if (out[p.itemIndex]) continue;
      z += 1;
      out[p.itemIndex] = {
        page: i < stored.length ? (stored[i] as number) : after + (i - stored.length),
        x: (p.box.x + p.box.w / 2) / MM,
        y: (p.box.y + p.box.h / 2) / MM,
        z,
      };
    }
  });
  return out;
}

type Line = { x1: number; y1: number; x2: number; y2: number };

/**
 * A box being moved snaps (within [tol] points) to the page's middle lines, its margins, and the other boxes' edges and
 * middles, like Word's alignment guides: each direction on its nearest line, the guide drawn across the page.
 */
export function snapBox(
  box: Box,
  others: Box[],
  page: { w: number; h: number; e: number },
  tol: number,
): { box: Box; guides: Line[] } {
  const xs = [page.w / 2, page.e, page.w - page.e, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [page.h / 2, page.e, page.h - page.e, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  // The box's own lines: its two sides and its middle, as offsets from its left (or top).
  const nearest = (start: number, size: number, lines: number[]) => {
    let best: { shift: number; at: number } | null = null;
    for (const own of [0, size / 2, size])
      for (const l of lines) {
        const shift = l - (start + own);
        if (Math.abs(shift) <= tol && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: l };
      }
    return best;
  };
  const sx = nearest(box.x, box.w, xs);
  const sy = nearest(box.y, box.h, ys);
  const guides: Line[] = [];
  if (sx) guides.push({ x1: sx.at, y1: 0, x2: sx.at, y2: page.h });
  if (sy) guides.push({ x1: 0, y1: sy.at, x2: page.w, y2: sy.at });
  return { box: { ...box, x: box.x + (sx?.shift ?? 0), y: box.y + (sy?.shift ?? 0) }, guides };
}

/** Pairs of photos (item numbers) on one page that cover part of each other: more than 1 mm² in common. */
export function overlaps(plan: PrintPlan): [number, number][] {
  const out: [number, number][] = [];
  for (const page of plan.pages)
    page.placements.forEach((a, i) => {
      for (const b of page.placements.slice(i + 1)) {
        const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
        const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
        if (w > 0 && h > 0 && w * h > MM * MM) out.push([a.itemIndex, b.itemIndex]);
      }
    });
  return out;
}

export type Side = 'l' | 'r' | 't' | 'b';

/**
 * Word's crop (owner, 2026-10-24): a side of the photo's box dragged in by [d] points cuts that much off the photo,
 * dragged out (negative) brings it back as far as the photo goes. The part left keeps its print size, so the box gets
 * smaller on that side only. [crop] and [box] are as shown (turned). At least 5 % of the photo stays.
 */
export function sideCrop(crop: CropBox, box: Box, side: Side, d: number): { crop: CropBox; box: Box } {
  const horizontal = side === 'l' || side === 'r';
  const perPt = horizontal ? crop.w / box.w : crop.h / box.h; // photo fraction per point
  const size = horizontal ? crop.w : crop.h;
  const start = horizontal ? crop.x : crop.y;
  const lead = side === 'l' || side === 't';
  // How far that side can go: in, until 5 % is left; out, until the photo's edge.
  const most = (size - MIN_SIDE) / perPt;
  const least = -(lead ? start : 1 - start - size) / perPt;
  const by = Math.min(most, Math.max(least, d));
  const f = by * perPt;
  const next = { ...crop };
  const nbox = { ...box };
  if (horizontal) {
    next.w = crop.w - f;
    nbox.w = box.w - by;
    if (lead) {
      next.x = crop.x + f;
      nbox.x = box.x + by;
    }
  } else {
    next.h = crop.h - f;
    nbox.h = box.h - by;
    if (lead) {
      next.y = crop.y + f;
      nbox.y = box.y + by;
    }
  }
  return { crop: next, box: nbox };
}

/**
 * The same for a straightened photo: the cut is made on the straightened picture (its frame's square), and the new
 * corners are where that square's cut maps to on the photo, exactly. [turns]: how the photo is shown, so a side as
 * shown is the right side of the straightened picture. Corners stay on the photo; at least 5 % stays.
 */
export function sideCropQuad(
  quad: number[],
  turns: number,
  box: Box,
  side: Side,
  d: number,
): { quad: number[]; box: Box } {
  const shownSides: Side[] = ['t', 'r', 'b', 'l'];
  const t = ((turns % 4) + 4) % 4;
  // The shown side's place on the upright straightened picture (turned back by the photo's turns).
  const upright = shownSides[(shownSides.indexOf(side) - t + 4) % 4] as Side;
  const horizontal = side === 'l' || side === 'r';
  const span = horizontal ? box.w : box.h;
  const h = homography(quad);
  const cut = (f: number) => {
    let [u0, v0, u1, v1] = [0, 0, 1, 1];
    if (upright === 'l') u0 = f;
    if (upright === 'r') u1 = 1 - f;
    if (upright === 't') v0 = f;
    if (upright === 'b') v1 = 1 - f;
    // Corners not on the cut side keep their own values (no rounding drift).
    const corners: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    const unit = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    return corners.flatMap(([u, v], k) =>
      u === unit[k]?.[0] && v === unit[k]?.[1] ? [quad[2 * k] as number, quad[2 * k + 1] as number] : h.map(u, v),
    );
  };
  const ok = (q: number[]) => q.every((v) => v >= 0 && v <= 1);
  // In: at most down to 5 %. Out: halved until every corner is on the photo.
  let f = Math.min(d / span, 1 - MIN_SIDE);
  let next = cut(f);
  for (let i = 0; i < 30 && !ok(next); i++) {
    f /= 2;
    next = cut(f);
  }
  if (!ok(next)) return { quad, box };
  const by = f * span;
  const nbox = { ...box };
  if (horizontal) {
    nbox.w = box.w - by;
    if (side === 'l') nbox.x = box.x + by;
  } else {
    nbox.h = box.h - by;
    if (side === 't') nbox.y = box.y + by;
  }
  return { quad: next, box: nbox };
}

/** The area of a frame on the photo (fractions; its own shape cancels out of a ratio). */
const areaOf = (q: number[]) =>
  Math.abs(
    [0, 1, 2, 3].reduce((s, k) => {
      const n = (k + 1) % 4;
      return s + (q[2 * k] as number) * (q[2 * n + 1] as number) - (q[2 * n] as number) * (q[2 * k + 1] as number);
    }, 0),
  ) / 2;

/**
 * Cropped again on its crop screen (review I4, Word's crop): a photo placed by hand keeps the part left where it was,
 * at the same print scale. [spot]/[longMm]: where it is and its size now; [a]: the upright photo's shape (w ÷ h);
 * [from]/[to]: the cut before and after, upright (a crop, a straightened frame, or neither for the whole photo). A
 * straightened frame cannot be mapped part by part: it keeps its centre and its scale by area. Returns the new centre
 * (mm) and long side (mm).
 */
export function recropSpot(
  spot: Spot,
  longMm: number,
  a: number,
  turns: number,
  from: { crop?: CropBox; quad?: number[] },
  to: { crop?: CropBox; quad?: number[] },
): { x: number; y: number; size: number } {
  const odd = turns % 2 === 1;
  const shown = odd ? 1 / a : a;
  const shapeOf = (c: { crop?: CropBox; quad?: number[] }) => {
    if (c.quad) return odd ? 1 / straightAspect(c.quad, a) : straightAspect(c.quad, a);
    const s = shownOf(c.crop ?? FULL, turns);
    return (s.w * shown) / s.h;
  };
  const k0 = shapeOf(from);
  const w0 = k0 >= 1 ? longMm : longMm * k0;
  const h0 = w0 / k0;
  if (!from.quad && !to.quad) {
    const s0 = shownOf(from.crop ?? FULL, turns);
    const s1 = shownOf(to.crop ?? FULL, turns);
    const w1 = (s1.w / s0.w) * w0;
    const h1 = (s1.h / s0.h) * h0;
    const x1 = spot.x - w0 / 2 + ((s1.x - s0.x) / s0.w) * w0;
    const y1 = spot.y - h0 / 2 + ((s1.y - s0.y) / s0.h) * h0;
    return { x: x1 + w1 / 2, y: y1 + h1 / 2, size: Math.max(w1, h1) };
  }
  const area = (c: { crop?: CropBox; quad?: number[] }) => areaOf(c.quad ?? quadOfBox(c.crop ?? FULL));
  const k1 = shapeOf(to);
  const w1 = Math.sqrt((w0 * h0 * area(to) * k1) / area(from));
  return { x: spot.x, y: spot.y, size: Math.max(w1, w1 / k1) };
}
