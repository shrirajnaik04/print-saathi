import type { PrintPlan } from '../plan/plan';
import { type Spot, spotsFromPlan, storedPage } from './free';
import { EDGE_MM } from './onePerPage';

const MM = 72 / 25.4;
/** The places tried for a photo, a few mm apart, row by row from the top (reading order). */
const STEP_MM = 5;
/** The room kept between the moved photo and the ones already there (it never touches them). */
const ROOM_MM = 2;

export type MovedPhoto = {
  /** Every photo's spot, the moved one on its new page and on top. */
  spots: Record<number, Spot>;
  /** The page it went to, as the spots store it (a new page is the next number after the last). */
  page: number;
  /** That page's place among the pages afterwards (from 0): a page left empty is gone, so later ones count one less. */
  index: number;
  /** False when no free place was left on that page: the photo is at its own place there and covers something. */
  clear: boolean;
};

type Rect = { l: number; t: number; r: number; b: number };
const apart = (a: Rect, b: Rect, room: number) =>
  a.r + room <= b.l || b.r + room <= a.l || a.b + room <= b.t || b.b + room <= a.t;

/**
 * "Move to page n" (owner, round 11): photo [item] goes to the page shown at index [to] (from 0), or to a new page after
 * the last. It keeps its size; where its place on the old page is free it keeps that place, otherwise it goes to the
 * first free place in reading order (top row first, left to right), and when the page has none it keeps its own place and
 * [clear] is false. Every photo is fixed where it is first, as any move by hand does, so the rest stay put. null: nothing
 * would change (its own page, a page or photo that is not there, or a photo alone on the last page going to a new one).
 */
export function movePhotoToPage(
  plan: PrintPlan,
  spots: Record<number, Spot> | undefined,
  item: number,
  to: number | 'new',
  edgeMm: number = EDGE_MM,
): MovedPhoto | null {
  if (!pageChoices(plan, item).includes(to)) return null;
  const from = plan.pages.findIndex((p) => p.placements.some((x) => x.itemIndex === item));
  const mine = plan.pages[from]?.placements.find((x) => x.itemIndex === item);
  if (!mine) return null;
  const target = to === 'new' ? plan.pages.length : to;

  const fixed = spotsFromPlan(plan, spots);
  // A new page is numbered above every place kept, a removed photo's too: its Undo never lands on this page (review M1).
  const page =
    to === 'new' ? Math.max(-1, ...Object.values(fixed).map((s) => s.page)) + 1 : storedPage(plan, fixed, target);
  const z = Math.max(0, ...Object.values(fixed).map((s) => s.z)) + 1;

  const { w, h } = mine.box;
  const there: Rect[] = (to === 'new' ? [] : (plan.pages[target]?.placements ?? [])).map((p) => ({
    l: p.box.x,
    t: p.box.y,
    r: p.box.x + p.box.w,
    b: p.box.y + p.box.h,
  }));
  const rectAt = (cx: number, cy: number): Rect => ({ l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 });
  const free = (r: Rect) => there.every((o) => apart(r, o, ROOM_MM * MM));

  // Where the photo is drawn now (the page keeps it inside the margins), not the place stored for it (review I2).
  let at = { x: (mine.box.x + w / 2) / MM, y: (mine.box.y + h / 2) / MM };
  let clear = true;
  if (!free(rectAt(at.x * MM, at.y * MM))) {
    const first = firstFree(plan.pages[target]?.orientation === 'landscape', plan, w, h, edgeMm, free);
    if (first) at = { x: first.x / MM, y: first.y / MM };
    else clear = false;
  }
  const after = { ...fixed, [item]: { page, x: at.x, y: at.y, z } };
  const inPlan = new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex)));
  const pages = [
    ...new Set(
      Object.entries(after)
        .filter(([k]) => inPlan.has(Number(k)))
        .map(([, v]) => v.page),
    ),
  ];
  return { spots: after, page, index: pages.filter((n) => n < page).length, clear };
}

/**
 * The pages photo [item] can be moved to (what the chooser lists): each other page shown (its index from 0) and a new
 * page at the end, unless the photo is alone on the last page (that is where it already is).
 */
export function pageChoices(plan: PrintPlan, item: number): (number | 'new')[] {
  const from = plan.pages.findIndex((p) => p.placements.some((x) => x.itemIndex === item));
  if (from < 0) return [];
  const others = plan.pages.flatMap((_, i) => (i === from ? [] : [i]));
  const alone = plan.pages[from]?.placements.length === 1;
  return alone && from === plan.pages.length - 1 ? others : [...others, 'new'];
}

/** The centre (points) of the first place in reading order where a [w] × [h] box inside the margins is [free]. */
function firstFree(
  landscape: boolean,
  plan: PrintPlan,
  w: number,
  h: number,
  edgeMm: number,
  free: (r: Rect) => boolean,
): { x: number; y: number } | null {
  const e = edgeMm * MM;
  const pw = landscape ? plan.paper.hPt : plan.paper.wPt;
  const ph = landscape ? plan.paper.wPt : plan.paper.hPt;
  const step = STEP_MM * MM;
  // shortcut: a grid a few mm apart, not every point; finer only if a shop wants photos packed tighter.
  for (let top = e; top + h <= ph - e + 1e-6; top += step)
    for (let left = e; left + w <= pw - e + 1e-6; left += step) {
      const r = { l: left, t: top, r: left + w, b: top + h };
      if (free(r)) return { x: left + w / 2, y: top + h / 2 };
    }
  return null;
}
