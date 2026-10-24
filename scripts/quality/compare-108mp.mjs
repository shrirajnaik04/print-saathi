// Spike (e) quality gate: compares the engine's decode-to-size output against a trusted desktop
// reference made from the SAME source at the SAME target size (exact area-average downscale).
// Usage: node --max-old-space-size=8192 scripts/quality/compare-108mp.mjs <engine-output.jpg> [source.jpg]
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { areaDownscale, psnr, ssimLuma } from './metrics.mjs';

const [enginePath, sourcePath = 'tests/fixtures-large/108mp.jpg'] = process.argv.slice(2);
const decode = (p) =>
  jpeg.decode(readFileSync(p), { useTArray: true, maxResolutionInMP: 200, maxMemoryUsageInMB: 4096 });

// .rgba = lossless raw dump from the engine (width x height x 4); dimensions passed as WxH in argv[4].
const engine = enginePath.endsWith('.rgba')
  ? (() => {
      const [w, h] = (process.argv[4] || '2048x1536').split('x').map(Number);
      return { width: w, height: h, data: new Uint8Array(readFileSync(enginePath)) };
    })()
  : decode(enginePath);
const source = decode(sourcePath);
const reference = areaDownscale(source, engine.width, engine.height);

const crop = (img, y0, y1) => ({
  width: img.width,
  height: y1 - y0,
  data: img.data.subarray(y0 * img.width * 4, y1 * img.width * 4),
});
const band = (name, fy0, fy1) => {
  const y0 = Math.round(fy0 * engine.height);
  const y1 = Math.round(fy1 * engine.height);
  const a = crop(engine, y0, y1);
  const b = crop(reference, y0, y1);
  return { band: name, psnrDb: +psnr(a, b).toFixed(2), ssim: +ssimLuma(a, b).toFixed(4) };
};
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
const isMagenta = ([r, g, b]) => r > 180 && g < 60 && b > 150;
const borderPx = Math.round((200 * engine.width) / source.width); // 200 source px at this scale

const result = {
  source: `${source.width}x${source.height}`,
  engineOutput: `${engine.width}x${engine.height}`,
  referenceMethod: 'exact area-average downscale of the decoded source (desktop, jpeg-js)',
  overall: { psnrDb: +psnr(engine, reference).toFixed(2), ssim: +ssimLuma(engine, reference).toFixed(4) },
  bands: [
    band('gradients', 0.03, 0.33),
    band('colour strips', 0.34, 0.66),
    band('photo-like noise', 0.67, 0.83),
    band('checkerboard', 0.84, 0.97),
  ],
  borderMarker: {
    expectedWidthPx: borderPx,
    insideIsMagenta: isMagenta(px(engine, Math.floor(borderPx / 2), Math.floor(engine.height / 2))),
    outsideIsNotMagenta: !isMagenta(px(engine, borderPx + 6, Math.floor(engine.height / 2))),
  },
};
console.log(JSON.stringify(result, null, 2));
