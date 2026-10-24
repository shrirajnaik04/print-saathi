// Objective image-quality metrics for print-quality checks (PSNR, luma SSIM) and a trusted
// area-averaging downscaler used as the desktop reference. Images: { width, height, data: RGBA }.

export function psnr(a, b) {
  assertSameSize(a, b);
  let se = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = a.data[i + c] - b.data[i + c];
      se += d * d;
      n++;
    }
  }
  if (se === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / (se / n));
}

const luma = (img) => {
  const out = new Float64Array(img.width * img.height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  return out;
};

/** Mean SSIM on luma over non-overlapping 8x8 windows (Wang et al. constants). */
export function ssimLuma(a, b, win = 8) {
  assertSameSize(a, b);
  const la = luma(a);
  const lb = luma(b);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let sum = 0;
  let count = 0;
  for (let y = 0; y + win <= a.height; y += win) {
    for (let x = 0; x + win <= a.width; x += win) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const p = (y + j) * a.width + x + i;
          ma += la[p];
          mb += lb[p];
        }
      const n = win * win;
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const p = (y + j) * a.width + x + i;
          const da = la[p] - ma;
          const db = lb[p] - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      va /= n - 1;
      vb /= n - 1;
      cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return sum / count;
}

/** Exact area-weighted (box) downscale: every source pixel contributes by its overlap area. */
export function areaDownscale(src, outW, outH) {
  const sx = src.width / outW;
  const sy = src.height / outH;
  const out = new Uint8Array(outW * outH * 4);
  const acc = new Float64Array(3);
  for (let oy = 0; oy < outH; oy++) {
    const y0 = oy * sy;
    const y1 = y0 + sy;
    for (let ox = 0; ox < outW; ox++) {
      const x0 = ox * sx;
      const x1 = x0 + sx;
      acc.fill(0);
      let area = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const w = (Math.min(x + 1, x1) - Math.max(x, x0)) * wy;
          const i = (y * src.width + x) * 4;
          acc[0] += src.data[i] * w;
          acc[1] += src.data[i + 1] * w;
          acc[2] += src.data[i + 2] * w;
          area += w;
        }
      }
      const o = (oy * outW + ox) * 4;
      out[o] = Math.round(acc[0] / area);
      out[o + 1] = Math.round(acc[1] / area);
      out[o + 2] = Math.round(acc[2] / area);
      out[o + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

function assertSameSize(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
}
