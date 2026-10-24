// Phase 2 Task 6 device check: the print file the phone rendered matches its plan. Page sizes and every photo's
// box (points, top-left origin, turned or not) are read back by pdf.js (independent of our writer) and compared
// with the expectation the device test wrote from the plan, within 0.1 pt (PLAN §R level 3).
// Usage: node scripts/device/render-check.mjs <print.pdf> <expected.json>   (exit 1 on any difference)
import { readFileSync } from 'node:fs';
import { validatePdf } from '../validate-pdf.mjs';

/**
 * [actual]: validatePdf() output. [expected]: { pages: [{ widthPt, heightPt, boxes: [{x, y, w, h, turns}] }] }
 * (turns = quarter turns anticlockwise; older expectations with `turned` are compared as turns 1 / 0).
 * Returns the differences in words; empty means the file matches.
 */
export function compareRender(actual, expected, tol = 0.1) {
  const problems = [];
  if (actual.pages !== expected.pages.length) return [`page count ${actual.pages}, expected ${expected.pages.length}`];
  expected.pages.forEach((want, i) => {
    const got = actual.pageSizes[i];
    const n = i + 1;
    if (Math.abs(got.widthPt - want.widthPt) > tol || Math.abs(got.heightPt - want.heightPt) > tol)
      problems.push(`page ${n}: size ${got.widthPt}x${got.heightPt}, expected ${want.widthPt}x${want.heightPt}`);
    if (got.imageBoxes.length !== want.boxes.length) {
      problems.push(`page ${n}: ${got.imageBoxes.length} photos drawn, expected ${want.boxes.length}`);
      return;
    }
    want.boxes.forEach((b, j) => {
      const g = got.imageBoxes[j];
      const off = ['x', 'y', 'w', 'h'].filter((k) => Math.abs(g[k] - b[k]) > tol);
      if (off.length)
        problems.push(`page ${n} photo ${j + 1}: ${off.map((k) => `${k} ${g[k]} vs ${b[k]}`).join(', ')}`);
      const want = b.turns ?? (b.turned ? 1 : 0);
      if (g.turns !== want) problems.push(`page ${n} photo ${j + 1}: quarter turns ${g.turns}, expected ${want}`);
      if (g.mirrored) problems.push(`page ${n} photo ${j + 1}: drawn mirrored`);
    });
  });
  return problems;
}

if (process.argv[1]?.endsWith('render-check.mjs')) {
  const [pdf, exp] = process.argv.slice(2);
  const actual = await validatePdf(pdf);
  const problems = compareRender(actual, JSON.parse(readFileSync(exp, 'utf8')));
  console.log(JSON.stringify({ pages: actual.pages, problems, verdict: problems.length ? 'FAIL' : 'PASS' }, null, 2));
  process.exit(problems.length ? 1 : 0);
}
