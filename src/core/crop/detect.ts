/** What the picture is: white edges are cropped only from documents and screenshots (PLAN §F5). */
export type Kind = 'photo' | 'document' | 'screenshot';

export type CropBox = { x: number; y: number; w: number; h: number };

/** The engine's analysis file (AnalysisGrey.kt): "PSAG", 16-bit big-endian width and height, then grey rows. */
export function parseAnalysis(file: Uint8Array): { w: number; h: number; grey: Uint8Array } | null {
  if (file.length < 8 || String.fromCharCode(...file.subarray(0, 4)) !== 'PSAG') return null;
  const w = ((file[4] as number) << 8) | (file[5] as number);
  const h = ((file[6] as number) << 8) | (file[7] as number);
  if (w < 1 || h < 1 || file.length !== 8 + w * h) return null;
  return { w, h, grey: file.slice(8) };
}

/** Below this, a suggestion is not made (PLAN §F5). */
export const MIN_CONFIDENCE = 0.9;

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Smart auto-crop (PLAN §F5): uniform black (or, for documents and screenshots, blank white) borders found from each
 * edge inwards on the analysis bytes (≤ 512 px grey, PLAN §F3). Returns the area to keep, in fractions of the photo as
 * stored upright, or null when nothing should be suggested. Never applied without the shopkeeper's yes.
 *
 * - A line is border when it is uniform (std dev < 8), within ± 12 of its edge's reference colour, and dark (< 45) or
 *   blank-white (> 225). The scan stops after 2 non-border lines in a row.
 * - Suggested only with confidence ≥ 0.9: it removes ≥ 4 % and keeps ≥ 30 % of the area, the kept area is not uniform,
 *   and the boundary is a sharp step: just past each border, at most 40 % of the kept pixels are still near the
 *   border's colour (a black sky fading into a city or an object on a black background keep far more).
 * - The crop is snapped inward by at most 0.5 % past the border's soft edge.
 */
export function detectBorders(
  grey: Uint8Array,
  w: number,
  h: number,
  kind: Kind,
): { crop: CropBox; confidence: number } | null {
  if (w < 16 || h < 16 || grey.length < w * h) return null;
  const allowWhite = kind !== 'photo';
  const lineLength = (side: Side) => (side === 'top' || side === 'bottom' ? w : h);
  const depth = (side: Side) => (side === 'top' || side === 'bottom' ? h : w);
  const at = (side: Side, i: number, k: number) => {
    switch (side) {
      case 'top':
        return grey[i * w + k] as number;
      case 'bottom':
        return grey[(h - 1 - i) * w + k] as number;
      case 'left':
        return grey[k * w + i] as number;
      default:
        return grey[k * w + (w - 1 - i)] as number;
    }
  };
  const stats = (side: Side, i: number) => {
    const n = lineLength(side);
    let sum = 0;
    let sq = 0;
    for (let k = 0; k < n; k++) {
      const v = at(side, i, k);
      sum += v;
      sq += v * v;
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  };
  const borderish = (mean: number) => mean < 45 || (allowWhite && mean > 225);

  const sides: Side[] = ['top', 'bottom', 'left', 'right'];
  const found = new Map<Side, { extent: number; ref: number }>();
  for (const side of sides) {
    const first = stats(side, 0);
    if (first.std >= 8 || !borderish(first.mean)) continue;
    const ref = first.mean;
    let extent = 0;
    let misses = 0;
    const max = Math.floor(depth(side) * 0.7);
    for (let i = 0; i < max; i++) {
      const s = stats(side, i);
      if (s.std < 8 && Math.abs(s.mean - ref) <= 12 && borderish(s.mean)) {
        extent = i + 1;
        misses = 0;
      } else if (++misses >= 2) break;
    }
    if (extent > 0) found.set(side, { extent, ref });
  }
  if (found.size === 0) return null;

  // Snap inward past the soft edge: at most 0.5 % of the side.
  const snap = (side: Side) => Math.max(1, Math.floor(depth(side) * 0.005));
  const cut = (side: Side) => {
    const f = found.get(side);
    return f ? f.extent + snap(side) : 0;
  };
  const x0 = cut('left');
  const x1 = w - cut('right');
  const y0 = cut('top');
  const y1 = h - cut('bottom');
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  const kept = ((x1 - x0) * (y1 - y0)) / (w * h);
  if (kept < 0.3 || 1 - kept < 0.04) return null;

  // Sharp step: just past each border, few pixels of the kept area still look like the border (the other sides'
  // bars are not part of it).
  let confidence = 1;
  for (const [side, { ref }] of found) {
    const start = cut(side);
    const [k0, k1] = side === 'top' || side === 'bottom' ? [x0, x1] : [y0, y1];
    let near = 0;
    let n = 0;
    for (let i = start; i < start + 2 && i < depth(side); i++) {
      for (let k = k0; k < k1; k++) {
        if (Math.abs(at(side, i, k) - ref) <= 20) near++;
        n++;
      }
    }
    // Confidence 0.9 = 40 % still near the border colour. Measured on the corpus: clear bars ≤ 38 %; a night sky,
    // an object on black, ≥ 61 % (docs/smart-crop.md).
    confidence = Math.min(confidence, n ? 1 - near / n / 4 : 0);
  }
  // The kept area is not uniform (a blank page is not "content between bars").
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 4)
    for (let x = x0; x < x1; x += 4) {
      const v = grey[y * w + x] as number;
      sum += v;
      sq += v * v;
      n++;
    }
  const mean = sum / n;
  if (Math.sqrt(Math.max(0, sq / n - mean * mean)) < 8) return null;
  if (confidence < MIN_CONFIDENCE) return null;
  return { crop: { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h }, confidence };
}
