import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allOnOne, bestPages, smallestSideMm } from './layouts';
import { A4, type LayoutPage } from './onePerPage';

/**
 * Phase 3 exit: the owner reviews what the layout engine does for 1–30 photos. `GALLERY=1 npx vitest run gallery`
 * writes docs/evidence/phase-3/2026-10-03/layout-gallery.html (every sheet drawn from the engine's own boxes). Without GALLERY
 * it only checks that every case can be drawn.
 */
const SHAPES: Record<string, (i: number) => number> = {
  'Phone photos (tall)': () => 3 / 4,
  'Wide photos': () => 4 / 3,
  'Mixed (every 3rd wide, some screenshots)': (i) => (i % 3 === 2 ? 4 / 3 : i % 5 === 4 ? 9 / 19.5 : 3 / 4),
  'Phone photos with one panorama (4:1) first': (i) => (i === 0 ? 4 : 3 / 4),
};
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 24, 30];
const HUES = (i: number) => `hsl(${(i * 47) % 360} 55% 72%)`;

function sheetSvg(page: LayoutPage): string {
  const [w, h] = page.orientation === 'landscape' ? [A4.hPt, A4.wPt] : [A4.wPt, A4.hPt];
  const boxes = page.placements
    .map(
      (p) =>
        `<rect x="${p.box.x.toFixed(1)}" y="${p.box.y.toFixed(1)}" width="${p.box.w.toFixed(1)}" height="${p.box.h.toFixed(1)}" fill="${HUES(p.itemIndex)}"/>` +
        `<text x="${(p.box.x + p.box.w / 2).toFixed(1)}" y="${(p.box.y + p.box.h / 2 + 8).toFixed(1)}" font-size="${Math.max(10, Math.min(p.box.w, p.box.h) / 3).toFixed(0)}" text-anchor="middle" font-family="sans-serif">${p.itemIndex}</text>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" class="${page.orientation}"><rect width="100%" height="100%" fill="#fff"/>${boxes}</svg>`;
}

function section(title: string, shape: (i: number) => number): string {
  const rows = COUNTS.map((n) => {
    const items = Array.from({ length: n }, (_, i) => ({ index: i + 1, aspect: shape(i) }));
    const one = allOnOne(items, A4);
    const best = bestPages(items, A4);
    const cm = (pages: LayoutPage[]) => (smallestSideMm(pages) / 10).toFixed(1);
    return `<tr><th>${n}</th><td>${sheetSvg(one[0] as LayoutPage)}<p>smallest ${cm(one)} cm${smallestSideMm(one) < 25 ? ' — <b>warns</b>' : ''}</p></td><td><div class="pages">${best.map(sheetSvg).join('')}</div><p>${best.length} page${best.length === 1 ? '' : 's'}, smallest ${cm(best)} cm</p></td></tr>`;
  }).join('');
  return `<h2>${title}</h2><table><thead><tr><th>Photos</th><th>All on one page</th><th>Use more pages → Best</th></tr></thead><tbody>${rows}</tbody></table>`;
}

describe('layout gallery for the owner (Phase 3 exit)', () => {
  it('draws every case (written to evidence when GALLERY=1)', () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PrintSaathi layouts</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f8fafc;color:#0f172a}table{border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:8px;vertical-align:top;text-align:left}svg{background:#475569;padding:4px;margin:2px}svg.portrait{width:120px}svg.landscape{width:170px}.pages{display:flex;flex-wrap:wrap;max-width:560px}p{margin:4px 0;font-size:14px}</style></head><body>
<h1>PrintSaathi — how photos are placed on A4</h1>
<p>Drawn by the app's own layout engine (6 mm edge, 3 mm gap). "Best" = fewest pages where every photo is at least 4 cm. "All on one page" warns below 2.5 cm. Please mark any layout that looks wrong.</p>
${Object.entries(SHAPES)
  .map(([title, shape]) => section(title, shape))
  .join('')}</body></html>`;
    expect(html).toContain('<svg');
    if (process.env.GALLERY) writeFileSync(path.resolve('docs/evidence/phase-3/2026-10-03/layout-gallery.html'), html);
  });
});
