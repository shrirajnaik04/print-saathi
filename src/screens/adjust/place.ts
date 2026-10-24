import type { Box } from '../../core/layout/onePerPage';
import type { Placement, PrintPlan } from '../../core/plan/plan';

const MM = 72 / 25.4;

/** A box's long side in mm (the size Adjust keeps for a photo). */
export const longMm = (b: Box) => Math.max(b.w, b.h) / MM;

/** "8.4 × 6.3 cm": a box as a ruler reads it. */
export const cmText = (b: Box) => `${Math.round(b.w / MM) / 10} × ${Math.round(b.h / MM) / 10} cm`;

/** The photos (or cards) as the plan places them, in print order, each once. */
export function itemsInPlan(plan: PrintPlan): number[] {
  const seen: number[] = [];
  for (const p of plan.pages) for (const x of p.placements) if (!seen.includes(x.itemIndex)) seen.push(x.itemIndex);
  return seen;
}

/** Where [item] is: its page (from 0) and its first placement there. */
export function findItem(plan: PrintPlan, item: number): { page: number; placement: Placement } | undefined {
  for (const [page, p] of plan.pages.entries()) {
    const placement = p.placements.find((x) => x.itemIndex === item);
    if (placement) return { page, placement };
  }
  return undefined;
}

/** The placement under a point (page points, in the page's own direction) on page [page], if any. */
export function pickAt(plan: PrintPlan, page: number, x: number, y: number): Placement | undefined {
  return plan.pages[page]?.placements.find(
    (p) => x >= p.box.x && x <= p.box.x + p.box.w && y >= p.box.y && y <= p.box.y + p.box.h,
  );
}

/** The page's size in points as it is seen (a sideways page is wide). */
export function pageSize(plan: PrintPlan, page: number): { w: number; h: number } {
  const wide = plan.pages[page]?.orientation === 'landscape';
  return wide ? { w: plan.paper.hPt, h: plan.paper.wPt } : { w: plan.paper.wPt, h: plan.paper.hPt };
}

/** A tap at (clientX, clientY) on a drawn page ([rect] on screen) as page points. */
export function toPagePoints(
  plan: PrintPlan,
  page: number,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const { w, h } = pageSize(plan, page);
  return { x: ((clientX - rect.left) / rect.width) * w, y: ((clientY - rect.top) / rect.height) * h };
}
