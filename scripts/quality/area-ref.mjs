// Makes the trusted desktop reference: exact area-average downscale (metrics.mjs, unit-tested) of a
// full-resolution raw RGBA image. Usage:
// node --max-old-space-size=8192 scripts/quality/area-ref.mjs <in.rgba> <W>x<H> <outW>x<outH> <out.rgba>
import { readFileSync, writeFileSync } from 'node:fs';
import { areaDownscale } from './metrics.mjs';

const [inPath, size, outSize, outPath] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const [ow, oh] = outSize.split('x').map(Number);
const ref = areaDownscale({ width, height, data: new Uint8Array(readFileSync(inPath)) }, ow, oh);
writeFileSync(outPath, ref.data);
console.log(`ref ${ow}x${oh} -> ${outPath}`);
