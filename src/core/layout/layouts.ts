import { mmToPt } from '../units';
import { EDGE_MM, type LayoutPage, onePerPage, type Paper } from './onePerPage';

/** Space between photos (PLAN §G0). */
export const GAP_MM = 3;
/** "Best" = the fewest pages where every photo's shortest side is at least this (PLAN §G0). */
export const MIN_BEST_MM = 40;
/** All on one page warns below this (PLAN §G0, J1). */
export const WARN_MM = 25;

type Item = { index: number; aspect: number };
type Box = { x: number; y: number; w: number; h: number };
type Arrangement = { boxes: Box[]; minShort: number; used: number; grid: number | null };

/** Largest box of [aspect] inside cw x ch, at the top-left of the cell at (x, y) (a Word page, owner 2026-10-24). */
function fitBox(aspect: number, x: number, y: number, cw: number, ch: number): Box {
  const w = aspect >= cw / ch ? cw : ch * aspect;
  const h = w / aspect;
  return { x, y, w, h };
}

function score(boxes: Box[], aw: number, ah: number, grid: number | null): Arrangement {
  const minShort = Math.min(...boxes.map((b) => Math.min(b.w, b.h)));
  const used = boxes.reduce((s, b) => s + b.w * b.h, 0) / (aw * ah);
  return { boxes, minShort, used, grid };
}

/** Uniform grid with [c] columns (rows as needed, or [rows] when shared across pages), filled from the top-left. */
function grid(
  aspects: number[],
  e: number,
  aw: number,
  ah: number,
  g: number,
  c: number,
  rows?: number,
): Arrangement | null {
  const n = aspects.length;
  const r = rows ?? Math.ceil(n / c);
  const cw = (aw - (c - 1) * g) / c;
  const ch = (ah - (r - 1) * g) / r;
  if (cw <= 0 || ch <= 0) return null;
  // Like a Word page (owner, 2026-10-24): the last row starts at the left, a page with fewer rows at the top.
  const boxes = aspects.map((a, k) => fitBox(a, e + (k % c) * (cw + g), e + Math.floor(k / c) * (ch + g), cw, ch));
  return score(boxes, aw, ah, c);
}

/**
 * Order-keeping rows (PLAN §G0): the split of the sequence into rows that gives the largest smallest photo. Binary
 * search on that size; for each size a dynamic program over row breaks finds the least total height where every
 * photo in a row reaches it (a row is never wider than the paper). Then rows are grown evenly into the space left.
 */
function rowsLayout(aspects: number[], e: number, aw: number, ah: number, g: number): Arrangement | null {
  const n = aspects.length;
  const shortOf = aspects.map((a) => Math.min(a, 1)); // a photo's short side per unit of row height
  const plan = (size: number) => {
    const height = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
    const from = new Array<number>(n + 1).fill(-1);
    height[0] = 0;
    for (let i = 1; i <= n; i++) {
      let sum = 0;
      let minShort = Number.POSITIVE_INFINITY;
      for (let j = i - 1; j >= 0; j--) {
        sum += aspects[j] as number;
        minShort = Math.min(minShort, shortOf[j] as number);
        const full = (aw - (i - j - 1) * g) / sum; // row height when the row spans the paper's width
        if (full <= 0) break;
        const need = size / minShort;
        if (need > full + 1e-9) continue;
        const h = (height[j] as number) + (j > 0 ? g : 0) + need;
        if (h < (height[i] as number)) {
          height[i] = h;
          from[i] = j;
        }
      }
    }
    return { fits: (height[n] as number) <= ah + 1e-9, from };
  };
  let lo = 0;
  let hi = Math.min(aw, ah);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (plan(mid).fits) lo = mid;
    else hi = mid;
  }
  if (lo <= 0) return null;
  const { from } = plan(lo);
  const rows: number[][] = [];
  for (let i = n; i > 0; i = from[i] as number) {
    const j = from[i] as number;
    if (j < 0) return null;
    rows.unshift(Array.from({ length: i - j }, (_, k) => j + k));
  }
  const need = rows.map((r) => lo / Math.min(...r.map((i) => shortOf[i] as number)));
  const full = rows.map((r) => (aw - (r.length - 1) * g) / r.reduce((s2, i) => s2 + (aspects[i] as number), 0));
  // Grow every row by the same factor, as far as the paper's height and each row's width allow.
  const grow = Math.max(
    1,
    Math.min(
      (ah - (rows.length - 1) * g) / need.reduce((s2, h) => s2 + h, 0),
      ...rows.map((_, r) => (full[r] as number) / (need[r] as number)),
    ),
  );
  const heights = need.map((h) => h * grow);
  // From the top-left like a Word page (owner, 2026-10-24).
  let y = e;
  const boxes: Box[] = new Array(n);
  rows.forEach((r, ri) => {
    const h = heights[ri] as number;
    let x = e;
    for (const i of r) {
      const w = (aspects[i] as number) * h;
      boxes[i] = { x, y, w, h };
      x += w + g;
    }
    y += h + g;
  });
  return score(boxes, aw, ah, null);
}

const better = (a: Arrangement, b: Arrangement | null) =>
  !b || a.minShort > b.minShort + 1e-9 || (Math.abs(a.minShort - b.minShort) <= 1e-9 && a.used > b.used + 1e-12);

/** The best arrangement of [aspects] on one page of pw x ph (PLAN §G0 scoring; a grid wins within 8 %). */
function arrangePage(
  aspects: number[],
  pw: number,
  ph: number,
  gridColumns?: { c: number; rows: number },
  edgeMm: number = EDGE_MM,
): Arrangement {
  const e = mmToPt(edgeMm);
  const g = mmToPt(GAP_MM);
  const aw = pw - 2 * e;
  const ah = ph - 2 * e;
  if (gridColumns) {
    const shared = grid(aspects, e, aw, ah, g, gridColumns.c, gridColumns.rows);
    if (shared) return shared;
  }
  let best: Arrangement | null = null;
  let bestGrid: Arrangement | null = null;
  for (let c = 1; c <= aspects.length; c++) {
    const a = grid(aspects, e, aw, ah, g, c);
    if (a && better(a, bestGrid)) bestGrid = a;
  }
  best = rowsLayout(aspects, e, aw, ah, g);
  if (!best || (bestGrid && bestGrid.minShort >= 0.92 * best.minShort)) best = bestGrid ?? best;
  return best as Arrangement;
}

function groupsOf<T>(list: T[], n: number): T[][] {
  const base = Math.floor(list.length / n);
  const extra = list.length % n;
  const out: T[][] = [];
  let at = 0;
  for (let k = 0; k < n; k++) {
    const size = base + (k < extra ? 1 : 0);
    out.push(list.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * Exactly [n] pages (PLAN §G0 "N pages"): balanced in-order groups, one page direction for all, and when a grid
 * wins on the fullest page the same grid (same photo size) on every page. More pages than photos = one each.
 */
export function onPages(items: Item[], paper: Paper, n: number, direction?: 'portrait' | 'landscape'): LayoutPage[] {
  if (items.length === 0) return [];
  // As many pages as photos: each photo on its own page, in its own direction (gate review #11).
  if (n >= items.length) return onePerPage(items, paper, direction, 'topLeft');
  const groups = groupsOf(items, Math.max(1, n));
  const tryDirection = (orientation: 'portrait' | 'landscape') => {
    const [pw, ph] = orientation === 'landscape' ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
    const first = arrangePage(
      (groups[0] as Item[]).map((i) => i.aspect),
      pw,
      ph,
      undefined,
      paper.edgeMm,
    );
    const shared = first.grid
      ? { c: first.grid, rows: Math.ceil((groups[0] as Item[]).length / first.grid) }
      : undefined;
    // Later pages keep page 1's grid (same photo size) only when it is nearly as good as their own best
    // arrangement; a wide photo in a tall shared cell must not shrink (gate review #1).
    const pages = groups.map((grp, k) => {
      if (k === 0) return first;
      const own = arrangePage(
        grp.map((i) => i.aspect),
        pw,
        ph,
        undefined,
        paper.edgeMm,
      );
      if (!shared) return own;
      const same = arrangePage(
        grp.map((i) => i.aspect),
        pw,
        ph,
        shared,
        paper.edgeMm,
      );
      return same.minShort >= 0.92 * own.minShort ? same : own;
    });
    const minShort = Math.min(...pages.map((p) => p.minShort));
    const used = pages.reduce((s, p) => s + p.used, 0);
    return { orientation, pages, minShort, used };
  };
  // The job's paper direction (owner, 2026-10-23); without one, upright unless sideways is clearly better (> 3 %).
  const portrait = direction === 'landscape' ? null : tryDirection('portrait');
  const landscape = direction === 'portrait' ? null : tryDirection('landscape');
  const pick =
    portrait && (!landscape || portrait.minShort >= 0.97 * landscape.minShort)
      ? portrait
      : (landscape as NonNullable<typeof landscape>);
  return pick.pages.map((p, k) => ({
    orientation: pick.orientation,
    placements: (groups[k] as Item[]).map((it, j) => ({ itemIndex: it.index, box: p.boxes[j] as Box })),
  }));
}

/** All on one page (PLAN §J1). */
export const allOnOne = (items: Item[], paper: Paper, direction?: 'portrait' | 'landscape'): LayoutPage[] =>
  onPages(items, paper, 1, direction);

/** The smallest photo's shortest side, in mm (for Best and the "very small" warning). */
export function smallestSideMm(pages: LayoutPage[]): number {
  const pt = Math.min(...pages.flatMap((p) => p.placements.map((x) => Math.min(x.box.w, x.box.h))));
  return (pt * 25.4) / 72;
}

/**
 * "Best" (PLAN §J2): the fewest pages where every photo is at least 4 cm. A photo that cannot reach 4 cm even alone
 * on a page (a 10:1 panorama, a long screenshot) gets a page of its own, and the photos before and after it are laid
 * out as usual, so one such photo never turns the whole job into one photo per page (re-review #1). Order is kept.
 */
export function bestPages(items: Item[], paper: Paper, direction?: 'portrait' | 'landscape'): LayoutPage[] {
  const aloneMm = new Map(
    onePerPage(items, paper, direction, 'topLeft').map((p) => [p.placements[0]?.itemIndex, smallestSideMm([p])]),
  );
  const out: LayoutPage[] = [];
  let run: Item[] = [];
  const flush = () => {
    if (run.length) out.push(...bestRun(run, paper, direction));
    run = [];
  };
  for (const it of items) {
    if ((aloneMm.get(it.index) ?? 0) < MIN_BEST_MM) {
      flush();
      out.push(...onePerPage([it], paper, direction, 'topLeft'));
    } else run.push(it);
  }
  flush();
  return out;
}

function bestRun(items: Item[], paper: Paper, direction?: 'portrait' | 'landscape'): LayoutPage[] {
  for (let p = 1; p < items.length; p++) {
    const pages = onPages(items, paper, p, direction);
    if (smallestSideMm(pages) >= MIN_BEST_MM) return pages;
  }
  return onePerPage(items, paper, direction, 'topLeft');
}
