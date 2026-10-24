import { mmToPt } from '../units';

/** [edgeMm]: space kept clear at the paper edges when not the usual (Settings → Space at paper edges: More). */
export type Paper = { id: 'A4' | 'PHOTO_4x6'; wPt: number; hPt: number; edgeMm?: number };
export const A4: Paper = { id: 'A4', wPt: mmToPt(210), hPt: mmToPt(297) };

/** Blank space kept at the paper edges on A4 (PLAN §G0; adjusted to the printer's measured margins in Phase 5). */
export const EDGE_MM = 6;

export type Box = { x: number; y: number; w: number; h: number };
export type LayoutPage = { orientation: 'portrait' | 'landscape'; placements: { itemIndex: number; box: Box }[] };

/**
 * "One on each page" (PLAN §G0, J3): every photo on its own page at the largest size that fits uncut inside the
 * printable area, centred (documents' pages) or at the top-left like a Word page (photos, owner 2026-10-24); a wide
 * photo gets a sideways page. Boxes are in points, top-left origin, in the page's
 * own direction (the renderer turns sideways pages into the portrait PDF page).
 * [aspect] = width / height of the photo as it should appear (after EXIF and turns).
 */
export function onePerPage(
  items: { index: number; aspect: number }[],
  paper: Paper,
  /** The paper's direction (the job's choice); none = each photo's own (wide photos sideways). */
  direction?: 'portrait' | 'landscape',
  align: 'centre' | 'topLeft' = 'centre',
): LayoutPage[] {
  const edge = mmToPt(paper.edgeMm ?? EDGE_MM);
  return items.map(({ index, aspect }) => {
    const orientation = direction ?? (aspect > 1 ? 'landscape' : 'portrait');
    const [pw, ph] = orientation === 'landscape' ? [paper.hPt, paper.wPt] : [paper.wPt, paper.hPt];
    const aw = pw - 2 * edge;
    const ah = ph - 2 * edge;
    const w = aspect >= aw / ah ? aw : ah * aspect;
    const h = w / aspect;
    const at = align === 'topLeft' ? { x: edge, y: edge } : { x: (pw - w) / 2, y: (ph - h) / 2 };
    return { orientation, placements: [{ itemIndex: index, box: { ...at, w, h } }] };
  });
}
