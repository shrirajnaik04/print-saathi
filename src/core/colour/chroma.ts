/**
 * Round 10 (some pages in colour, some in black & white): the first guess of which pages have colour in them. Pure
 * functions over a page's small picture (RGBA bytes); the picture is read in guess.ts. Loaded only with the colour
 * chooser (startup JS budget).
 */

/** A pixel has colour when its strongest and weakest channel differ by this much (JPEG noise and cream paper stay below). */
const CHROMA = 40;
/** A page has colour when this share of its pixels does (a stamp, a logo, a coloured line of text; not one stray pixel). */
const PAGE_SHARE = 0.004;

/** The share (0–1) of the visible pixels that have colour. */
export function colourShare(rgba: ArrayLike<number>): number {
  let seen = 0;
  let coloured = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] as number) < 128) continue;
    seen++;
    const r = rgba[i] as number;
    const g = rgba[i + 1] as number;
    const b = rgba[i + 2] as number;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= CHROMA) coloured++;
  }
  return seen === 0 ? 0 : coloured / seen;
}

export const hasColour = (share: number) => share >= PAGE_SHARE;
