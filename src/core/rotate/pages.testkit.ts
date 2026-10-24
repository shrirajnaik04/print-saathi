/**
 * Test-only (Phase 15): generated phone photos of documents and of things that are not documents, as ≤ 512 px grey
 * bytes like the engine's analysis bytes. Fixed seeds; never real files.
 */
export type GreyImage = { grey: Uint8Array; w: number; h: number };

/** A small seeded random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Align = 'left' | 'centre' | 'justified' | 'right';

/**
 * An upright page of text: a centred heading, a right-aligned date line, then paragraphs of word-bars (the first line
 * indented, the last one short) in [align]; photographed on a table that shows around the page (wood-like bands), with
 * a shadow across it, a little blur and noise.
 */
export function page(seed: number, align: Align = 'left'): GreyImage {
  const r = rng(seed);
  const w = 300 + Math.floor(r() * 60);
  const h = 400 + Math.floor(r() * 80);
  const paper = 200 + r() * 45;
  const ink = 20 + r() * 70;
  const img = new Float64Array(w * h).fill(paper);
  const margin = 20 + Math.floor(r() * 20);
  const lineH = 5 + Math.floor(r() * 4);
  const gap = lineH + 3 + Math.floor(r() * 5);
  let y = margin;
  // A centred heading and a right-aligned date (real letters have them).
  const bar = (x0: number, x1: number, yy0: number, hh: number) => {
    for (let yy = yy0; yy < yy0 + hh; yy++)
      for (let xx = Math.floor(x0); xx < Math.floor(x1); xx++) if (r() < 0.8) img[yy * w + xx] = ink;
  };
  const head = (w - 2 * margin) * (0.3 + r() * 0.3);
  bar((w - head) / 2, (w + head) / 2, y, lineH + 2);
  y += 2 * gap;
  const date = 40 + r() * 40;
  bar(w - margin - date, w - margin, y, lineH);
  y += 2 * gap;
  while (y + lineH < h - margin) {
    const lines = 2 + Math.floor(r() * 6);
    for (let k = 0; k < lines && y + lineH < h - margin; k++) {
      const full = w - 2 * margin;
      const last = k === lines - 1;
      const length =
        align === 'justified' && !last ? full : last ? full * (0.2 + r() * 0.5) : full * (0.75 + r() * 0.25);
      const indent = align === 'left' && k === 0 ? 12 + Math.floor(r() * 10) : 0;
      const x0 =
        align === 'centre'
          ? margin + (full - length) / 2
          : align === 'right'
            ? margin + full - length
            : margin + indent;
      let x = x0;
      while (x < x0 + length - indent) {
        const word = 6 + r() * 30;
        const end = Math.min(x + word, x0 + length - indent);
        for (let yy = y; yy < y + lineH; yy++)
          for (let xx = Math.floor(x); xx < Math.floor(end); xx++) if (r() < 0.75) img[yy * w + xx] = ink;
        x = end + 3 + r() * 4;
      }
      y += gap;
    }
    y += gap; // between paragraphs
  }
  // The table around the page: the photo is bigger than the paper.
  const pad = Math.floor(r() * 0.12 * w);
  if (pad > 0) {
    const W2 = w + 2 * pad;
    const H2 = h + 2 * pad;
    const table = new Float64Array(W2 * H2);
    const tone = 70 + r() * 60;
    for (let yy = 0; yy < H2; yy++)
      for (let xx = 0; xx < W2; xx++) {
        const inPage = xx >= pad && xx < pad + w && yy >= pad && yy < pad + h;
        table[yy * W2 + xx] = inPage
          ? (img[(yy - pad) * w + (xx - pad)] as number)
          : tone + 18 * Math.sin(yy / 5 + xx / 60);
      }
    return finish(table, W2, H2, r);
  }
  return finish(img, w, h, r);
}

/** Not a document: blobs, a smooth scene, or a blank sheet (kind = seed % 3). */
export function notADocument(seed: number): GreyImage {
  const r = rng(seed);
  const w = 360;
  const h = 480;
  const img = new Float64Array(w * h);
  const kind = seed % 3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      img[y * w + x] =
        kind === 2 ? 235 : 120 + 60 * Math.sin(x / 40 + seed) * Math.cos(y / 55) + (kind === 1 ? y / 6 : 0);
  if (kind === 0)
    for (let b = 0; b < 12; b++) {
      const cx = r() * w;
      const cy = r() * h;
      const rx = 15 + r() * 80;
      const ry = 15 + r() * 80;
      const level = 30 + r() * 200;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) img[y * w + x] = level;
    }
  return finish(img, w, h, r);
}

/** The image turned [k] quarter turns clockwise (what a sideways photo looks like). */
export function turned(im: GreyImage, k: number): GreyImage {
  let cur = im;
  for (let n = 0; n < ((k % 4) + 4) % 4; n++) {
    const { grey, w, h } = cur;
    const out = new Uint8Array(w * h);
    // Clockwise: (x, y) → (h − 1 − y, x) in a h-wide, w-tall image.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = grey[y * w + x] as number;
    cur = { grey: out, w: h, h: w };
  }
  return cur;
}

function finish(img: Float64Array, w: number, h: number, r: () => number): GreyImage {
  // Shadow across the photo, a little camera blur, sensor noise.
  const gx = (r() - 0.5) * 0.3;
  const gy = (r() - 0.5) * 0.3;
  const blurred = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          s += img[yy * w + xx] as number;
          n++;
        }
      blurred[y * w + x] = (s / n) * (1 - gx * (x / w - 0.5) - gy * (y / h - 0.5));
    }
  const grey = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++)
    grey[i] = Math.min(255, Math.max(0, Math.round((blurred[i] as number) + (r() + r() + r() - 1.5) * 8)));
  return { grey, w, h };
}

/**
 * Not a document but line-like (review I4): blinds or a fence — long even stripes whose ends are uneven (furniture in
 * front), across ([vertical] false) or down the photo.
 */
export function stripes(seed: number, vertical: boolean): GreyImage {
  const r = rng(seed);
  const w = 360;
  const h = 480;
  const img = new Float64Array(w * h).fill(200 + r() * 40);
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  const period = 10 + Math.floor(r() * 10);
  const dark = 40 + r() * 60;
  for (let a = 20; a < across - 20; a += period) {
    const end = along * (0.5 + r() * 0.45);
    for (let t = 0; t < period / 2; t++)
      for (let b = 15; b < end; b++) {
        const x = vertical ? a + t : b;
        const y = vertical ? b : a + t;
        if (x < w && y < h) img[y * w + x] = dark;
      }
  }
  return finish(img, w, h, r);
}
