// Independent PDF validation with Mozilla pdf.js (not our writer's code): parses the file, reports pages,
// page sizes in points/mm, image XObjects drawn per page, where each image lands (box in points, top-left origin,
// and whether it is drawn turned), and whether every page renders its operator list.
// Usage: node scripts/validate-pdf.mjs <file.pdf> [--json]
import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** m1 x m2 for PDF matrices [a b c d e f]: the result of `m2 cm` while the current matrix is m1. */
function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Where the unit square (an image) lands under matrix m, as a top-left-origin box on a page [pageH] tall. */
function imageBox(m, pageH) {
  const pts = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const r = (n) => +n.toFixed(4);
  // Degrees anticlockwise the image's own x axis is turned on the page, 0 to 360 (a photo turned to any angle).
  const angle = ((((Math.atan2(m[1], m[0]) * 180) / Math.PI) % 360) + 360) % 360;
  return {
    x: r(Math.min(...xs)),
    y: r(pageH - Math.max(...ys)),
    w: r(Math.max(...xs) - Math.min(...xs)),
    h: r(Math.max(...ys) - Math.min(...ys)),
    turned: Math.abs(m[1]) > 1e-9,
    // Quarter turns anticlockwise of the image on the page: 0 upright, 1 top to the left, 2 upside down, 3 top
    // to the right (the nearest quarter turn of a tilted image).
    turns: Math.round(angle / 90) % 4,
    angle: r(angle),
    // A mirrored image (negative determinant) is never right on paper, whatever its turn.
    mirrored: m[0] * m[3] - m[1] * m[2] < 0,
  };
}

export async function validatePdf(path) {
  const data = new Uint8Array(readFileSync(path));
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [x0, y0, x1, y1] = page.view;
    const ops = await page.getOperatorList();
    const boxes = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = multiply(ctm, ops.argsArray[i]);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) boxes.push(imageBox(ctm, y1 - y0));
    });
    pages.push({
      page: n,
      widthPt: +(x1 - x0).toFixed(4),
      heightPt: +(y1 - y0).toFixed(4),
      widthMm: +(((x1 - x0) * 25.4) / 72).toFixed(2),
      heightMm: +(((y1 - y0) * 25.4) / 72).toFixed(2),
      imagesDrawn: boxes.length,
      imageBoxes: boxes,
      operators: ops.fnArray.length,
    });
  }
  await task.destroy();
  return { file: path, pages: pages.length, pageSizes: pages };
}

if (process.argv[1]?.endsWith('validate-pdf.mjs')) {
  const r = await validatePdf(process.argv[2]);
  console.log(JSON.stringify(r, null, process.argv.includes('--json') ? 0 : 2));
}
