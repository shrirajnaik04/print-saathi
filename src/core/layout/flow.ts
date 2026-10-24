import type { PrintPlan } from '../plan/plan';
import { GAP_MM } from './layouts';
import { type Box, EDGE_MM, type LayoutPage, onePerPage, type Paper } from './onePerPage';

const MM = 72 / 25.4;
/** The smallest a photo gets on Adjust: its long side (owner, 2026-10-23). */
export const MIN_LONG_MM = 20;

/** The largest long side (mm) a photo of [aspect] (width ÷ height) can have inside the paper's edges. */
export function fitLongMm(aspect: number, paper: Paper, orientation: 'portrait' | 'landscape'): number {
  const e = paper.edgeMm ?? EDGE_MM;
  const [pw, ph] = orientation === 'landscape' ? [paper.hPt / MM, paper.wPt / MM] : [paper.wPt / MM, paper.hPt / MM];
  const aw = pw - 2 * e;
  const ah = ph - 2 * e;
  return aspect >= 1 ? Math.min(aw, ah * aspect) : Math.min(ah, aw / aspect);
}

/**
 * Photos at the sizes the shopkeeper chose, Word's "Square" wrap (owner, 2026-10-23): in print order, left to right in
 * rows with GAP_MM between, rows top to bottom; a photo that does not fit the rest of its row starts the next row, and
 * a row that does not fit the rest of the page starts the next page. Like a Word page (owner, 2026-10-24) the rows
 * start at the top margin and each at the left margin, its photos on its top line. A size is the photo's long side in mm, kept between
 * MIN_LONG_MM and the largest that fits inside the edges. Every page has [orientation].
 */
export function flowPages(
  items: { index: number; aspect: number; longMm: number }[],
  paper: Paper,
  orientation: 'portrait' | 'landscape',
): LayoutPage[] {
  const e = (paper.edgeMm ?? EDGE_MM) * MM;
  const g = GAP_MM * MM;
  const [pw, ph] = orientation === 'landscape' ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
  const aw = pw - 2 * e;
  const ah = ph - 2 * e;
  const EPS = 1e-6;
  type Placed = { index: number; w: number; h: number };
  type Row = { items: Placed[]; w: number; h: number };
  const pages: Row[][] = [];
  let page: Row[] = [];
  let used = 0; // height used on this page by its rows and the gaps between them
  let row: Row | null = null;
  const closeRow = () => {
    if (!row) return;
    const extra = page.length > 0 ? g : 0;
    if (page.length > 0 && used + extra + row.h > ah + EPS) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += (page.length > 0 ? g : 0) + row.h;
    page.push(row);
    row = null;
  };
  for (const it of items) {
    const max = fitLongMm(it.aspect, paper, orientation);
    const long = Math.min(Math.max(it.longMm, Math.min(MIN_LONG_MM, max)), max) * MM;
    const w = it.aspect >= 1 ? long : long * it.aspect;
    const h = w / it.aspect;
    if (row && row.w + g + w > aw + EPS) closeRow();
    if (!row) row = { items: [], w: -g, h: 0 };
    row.items.push({ index: it.index, w, h });
    row.w += g + w;
    row.h = Math.max(row.h, h);
  }
  closeRow();
  if (page.length > 0) pages.push(page);
  return pages.map((rows) => {
    let y = e;
    const placements: { itemIndex: number; box: Box }[] = [];
    for (const r of rows) {
      let x = e;
      for (const p of r.items) {
        placements.push({ itemIndex: p.index, box: { x, y, w: p.w, h: p.h } });
        x += p.w + g;
      }
      y += r.h + g;
    }
    return { orientation, placements };
  });
}

/** Each photo's chosen long side (mm); a photo without one (added later, brought back) takes the median of the others. */
export function sizeOf(sizes: Record<number, number>): (index: number) => number {
  const v = Object.values(sizes).sort((a, b) => a - b);
  const mid = v.length / 2;
  const median =
    v.length % 2 === 1 ? (v[Math.floor(mid)] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
  return (index) => sizes[index] ?? median;
}

/** One on each page at the sizes chosen: each photo at its page's top-left, never larger than fits, never below 2 cm. */
export function onePerPageAt(
  items: { index: number; aspect: number; longMm: number }[],
  paper: Paper,
  direction: 'portrait' | 'landscape',
): LayoutPage[] {
  return onePerPage(items, paper, direction, 'topLeft').map((p, k) => {
    const pl = p.placements[0] as { itemIndex: number; box: Box };
    const b = pl.box;
    const fit = Math.max(b.w, b.h);
    const long = Math.min(fit, Math.max(Math.min(MIN_LONG_MM * MM, fit), (items[k]?.longMm ?? 0) * MM));
    const s = long / fit;
    const w = b.w * s;
    const h = b.h * s;
    return {
      ...p,
      placements: [{ itemIndex: pl.itemIndex, box: { x: b.x, y: b.y, w, h } }],
    };
  });
}

/** The sizes a plan's photos have now (long side, mm): Adjust starts from these at the first size change. */
export function freezeSizes(plan: PrintPlan): Record<number, number> {
  const out: Record<number, number> = {};
  for (const page of plan.pages)
    for (const p of page.placements)
      if (out[p.itemIndex] === undefined) out[p.itemIndex] = Math.max(p.box.w, p.box.h) / MM;
  return out;
}
