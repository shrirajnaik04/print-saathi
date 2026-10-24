// Spike (e) quality gate for any source format: engine raw RGBA output vs a trusted desktop reference
// (tests/generate/make-variants.py ref) of the same size. Reports overall PSNR/SSIM plus the worst single
// row, so a seam at a strip boundary cannot hide inside an average.
// Usage: node scripts/quality/compare-raw.mjs <engine.rgba> <reference.rgba> <W>x<H>
import { readFileSync } from 'node:fs';
import { psnr, ssimLuma } from './metrics.mjs';

const row = (img, y) => ({
  width: img.width,
  height: 1,
  data: img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4),
});

export function worstRow(a, b) {
  let worst = { row: -1, psnrDb: Number.POSITIVE_INFINITY };
  for (let y = 0; y < a.height; y++) {
    const p = psnr(row(a, y), row(b, y));
    if (p < worst.psnrDb) worst = { row: y, psnrDb: p };
  }
  return worst;
}

if (process.argv[1]?.endsWith('compare-raw.mjs')) {
  const [enginePath, refPath, size] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const load = (p) => ({ width, height, data: new Uint8Array(readFileSync(p)) });
  const engine = load(enginePath);
  const reference = load(refPath);
  if (engine.data.length !== width * height * 4 || reference.data.length !== engine.data.length)
    throw new Error(
      `size mismatch: engine ${engine.data.length} B, reference ${reference.data.length} B, expected ${width * height * 4}`,
    );
  const w = worstRow(engine, reference);
  console.log(
    JSON.stringify({
      engine: enginePath.split(/[/]/).pop(),
      size,
      psnrDb: +psnr(engine, reference).toFixed(2),
      ssim: +ssimLuma(engine, reference).toFixed(4),
      worstRow: w.row,
      worstRowPsnrDb: +w.psnrDb.toFixed(2),
    }),
  );
}
