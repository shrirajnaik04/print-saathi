/**
 * Which way up a photo of a document is (Phase 15, spec Part 3 "text direction"), from the ≤ 512 px grey analysis
 * bytes the engine already makes. It answers with the clockwise quarter turns that make the page upright, and whether
 * it is sure; when the signs are weak it abstains (sure = false) rather than guessing.
 *
 * 1. Ink: dark against its neighbourhood (Bradley's local mean, like OCV Black), on paper only (the table around a
 *    photographed page is darker than the paper and its grain is not text).
 * 2. Lines: text lines make the ink profile across them jump (line, gap, line…); along them it is smooth. The axis
 *    whose profile jumps ≥ 1.8× more is the one the lines run across.
 *    Each line must look like text: several pieces with word gaps between them (blinds and fences are one long run).
 * 3. Which end: lines start at a straight margin and end ragged (left-aligned text). The side whose line ends spread
 *    ≥ 2× less is where the lines start: left = upright, right = upside down, top = turned clockwise, bottom = turned
 *    anticlockwise.
 */
export type TextTurn = { turn: 0 | 1 | 2 | 3; sure: boolean };

const AXIS_RATIO = 1.8;
const START_RATIO = 2;
const MIN_LINES = 4;
/** A text line has words: at least this many pieces on a typical line. */
const MIN_WORDS = 3;

const NONE: TextTurn = { turn: 0, sure: false };

export function textTurn(full: Uint8Array, fw: number, fh: number): TextTurn {
  if (fw < 32 || fh < 32 || full.length !== fw * fh) return NONE;
  // Only the paper: a photographed page has the table around it.
  const { grey, w, h } = paperOf(full, fw, fh);
  if (w < 32 || h < 32) return NONE;
  const ink = inkOf(grey, w, h);
  let total = 0;
  for (const v of ink) total += v;
  // Blank, or a photo (a page of text is mostly paper).
  if (total < 0.004 * w * h || total > 0.35 * w * h) return NONE;
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (ink[y * w + x]) {
        rows[y] = (rows[y] as number) + 1;
        cols[x] = (cols[x] as number) + 1;
      }
  const across = jumps(rows);
  const down = jumps(cols);
  let horizontal: boolean;
  if (across >= AXIS_RATIO * down) horizontal = true;
  else if (down >= AXIS_RATIO * across) horizontal = false;
  else return NONE;
  // The lines: bands of the jumping profile; each band's first and last ink along the line.
  const profile = horizontal ? rows : cols;
  const bands = bandsOf(profile);
  if (bands.length < MIN_LINES) return NONE;
  const starts: number[] = [];
  const ends: number[] = [];
  const pieces: number[] = [];
  const len = horizontal ? w : h;
  for (const [a, b] of bands) {
    // The line seen from the side: ink anywhere across the band at each step along it.
    const along = new Uint8Array(len);
    for (let i = a; i <= b; i++)
      for (let j = 0; j < len; j++) if (horizontal ? ink[i * w + j] : ink[j * w + i]) along[j] = 1;
    const first = along.indexOf(1);
    const last = along.lastIndexOf(1);
    if (first < 0) continue;
    starts.push(first);
    ends.push(last);
    // Pieces separated by gaps of 2 or more: the words.
    let n = 0;
    let gap = 2;
    for (let j = first; j <= last; j++) {
      if (along[j]) {
        if (gap >= 2) n++;
        gap = 0;
      } else gap++;
    }
    pieces.push(n);
  }
  if (starts.length < MIN_LINES) return NONE;
  if (median(pieces) < MIN_WORDS) return NONE;
  const spreadStart = spread(starts) + 1;
  const spreadEnd = spread(ends) + 1;
  let atLow: boolean; // lines start at the low end (left, or top)
  if (spreadEnd >= START_RATIO * spreadStart) atLow = true;
  else if (spreadStart >= START_RATIO * spreadEnd) atLow = false;
  else return NONE;
  if (horizontal) return { turn: atLow ? 0 : 2, sure: true };
  // Lines down the photo: starting at the top, the page was turned clockwise (3 more turns undo it); at the bottom,
  // anticlockwise (1 turn).
  return { turn: atLow ? 3 : 1, sure: true };
}

/** The brightest tones of a photo (its 95th percentile): the paper, on a photo of a page. */
function brightest(grey: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (const v of grey) hist[v] = (hist[v] as number) + 1;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v] as number;
    if (seen >= 0.95 * grey.length) return v;
  }
  return 255;
}

/**
 * The paper's box: from the first to the last row (and column) that is mostly paper-bright, a little inside it; the
 * whole photo when no clear paper is seen.
 */
function paperOf(grey: Uint8Array, w: number, h: number): { grey: Uint8Array; w: number; h: number } {
  const bright = 0.75 * brightest(grey);
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((grey[y * w + x] as number) >= bright) {
        rows[y] = (rows[y] as number) + 1;
        cols[x] = (cols[x] as number) + 1;
      }
  const first = (p: Float64Array, n: number) => p.findIndex((v) => v >= 0.5 * n);
  const last = (p: Float64Array, n: number) => p.length - 1 - [...p].reverse().findIndex((v) => v >= 0.5 * n);
  let y0 = first(rows, w);
  let y1 = last(rows, w);
  let x0 = first(cols, h);
  let x1 = last(cols, h);
  if (y0 < 0 || x0 < 0 || y1 - y0 < 0.3 * h || x1 - x0 < 0.3 * w) return { grey, w, h };
  const iy = Math.round(0.03 * (y1 - y0));
  const ix = Math.round(0.03 * (x1 - x0));
  y0 += iy;
  y1 -= iy;
  x0 += ix;
  x1 -= ix;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) out.set(grey.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + cw), y * cw);
  return { grey: out, w: cw, h: ch };
}

/**
 * Bradley's adaptive threshold: ink where a pixel is under 85 % of the mean around it (window ≈ ⅛ of the photo), and
 * only where that mean is paper-bright (at least 70 % of the photo's brightest tones).
 */
function inkOf(grey: Uint8Array, w: number, h: number): Uint8Array {
  const s = Math.max(8, Math.round(Math.min(w, h) / 8));
  const paper = 0.7 * brightest(grey);
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grey[y * w + x] as number;
      sum[(y + 1) * (w + 1) + x + 1] = (sum[y * (w + 1) + x + 1] as number) + row;
    }
  }
  const out = new Uint8Array(w * h);
  const r = s >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const local =
        (sum[y1 * (w + 1) + x1] as number) -
        (sum[y0 * (w + 1) + x1] as number) -
        (sum[y1 * (w + 1) + x0] as number) +
        (sum[y0 * (w + 1) + x0] as number);
      const v = grey[y * w + x] as number;
      out[y * w + x] = v * area < local * 0.85 && local >= paper * area ? 1 : 0;
    }
  }
  return out;
}

/** How much a profile jumps from bin to bin, against its size (total variation ÷ total). */
function jumps(p: Float64Array): number {
  let tv = 0;
  let total = 0;
  for (let i = 0; i < p.length; i++) {
    total += p[i] as number;
    if (i > 0) tv += Math.abs((p[i] as number) - (p[i - 1] as number));
  }
  return total > 0 ? tv / total : 0;
}

/** Runs of the profile above a tenth of its peak: the text lines ([first, last] index). */
function bandsOf(p: Float64Array): [number, number][] {
  let peak = 0;
  for (const v of p) peak = Math.max(peak, v);
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= p.length; i++) {
    const on = i < p.length && (p[i] as number) > 0.1 * peak;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= 2) out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

/** Median absolute deviation: a spread that a few indented or short lines don't sway. */
function spread(v: number[]): number {
  const m = median(v);
  return median(v.map((x) => Math.abs(x - m)));
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? (s[(n - 1) / 2] as number) : ((s[n / 2 - 1] as number) + (s[n / 2] as number)) / 2;
}
