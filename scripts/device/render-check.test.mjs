import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validatePdf } from '../validate-pdf.mjs';
import { compareRender } from './render-check.mjs';

const jpeg = readFileSync('android/app/src/test/resources/2x2.jpg');

/** A minimal PDF built here by hand (not by our Kotlin writer): one page, the given `cm` matrices each drawing /Im1. */
function handMadePdf(matrices, w = 595.2756, h = 841.8898) {
  const content = matrices.map((m) => `q ${m} cm /Im1 Do Q`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`,
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let len = parts[0].length;
  const push = (b) => {
    parts.push(b);
    len += b.length;
  };
  objs.forEach((body, i) => {
    offsets.push(len);
    push(Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
  });
  offsets.push(len);
  push(Buffer.from(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`, 'latin1'));
  offsets.push(len);
  push(
    Buffer.from(
      `5 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      'latin1',
    ),
  );
  push(jpeg);
  push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  const xref = len;
  push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      'latin1',
    ),
  );
  const file = join(mkdtempSync(join(tmpdir(), 'render-check-')), 'p.pdf');
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

test('pdf.js reads back where each image is drawn and which way round', async () => {
  // The writer's four quarter-turn matrices (MiniPdfWriterTest), each into a 100 x 200 box.
  const file = handMadePdf([
    '100 0 0 200 10 621.8898',
    '0 200 -100 0 210 621.8898',
    '-100 0 0 -200 310 821.8898',
    '0 -200 100 0 400 821.8898',
  ]);
  const r = await validatePdf(file);
  assert.equal(r.pages, 1);
  assert.deepEqual(
    r.pageSizes[0].imageBoxes.map(({ x, y, w, h, turns }) => ({ x, y, w, h, turns })),
    [
      { x: 10, y: 20, w: 100, h: 200, turns: 0 },
      { x: 110, y: 20, w: 100, h: 200, turns: 1 },
      { x: 210, y: 20, w: 100, h: 200, turns: 2 },
      { x: 400, y: 20, w: 100, h: 200, turns: 3 },
    ],
  );
});

const page = (boxes) => ({ widthPt: 595.2756, heightPt: 841.8898, boxes });
const withTurns = (bs) => bs.map((b) => ({ ...b, turns: b.turned ? 1 : 0 }));
const actualOf = (pages) => ({
  pages: pages.length,
  pageSizes: pages.map((p) => ({ widthPt: p.widthPt, heightPt: p.heightPt, imageBoxes: withTurns(p.boxes) })),
});

test('a mirrored image is reported (the turn sign alone would miss it)', async () => {
  // Flipped left-right: x scale negative, y scale positive.
  const file = handMadePdf(['-100 0 0 200 110 621.8898', '100 0 0 200 210 621.8898']);
  const boxes = (await validatePdf(file)).pageSizes[0].imageBoxes;
  assert.deepEqual(
    boxes.map((b) => b.mirrored),
    [true, false],
  );
  const want = { pages: [page([{ x: 10, y: 20, w: 100, h: 200, turns: 2 }])] };
  const got = {
    pages: 1,
    pageSizes: [{ widthPt: 595.2756, heightPt: 841.8898, imageBoxes: [{ ...boxes[0], turns: 2 }] }],
  };
  assert.match(compareRender(got, want).join(), /mirrored/);
});

test('a file that matches its plan within 0.1 pt passes', () => {
  const want = { pages: [page([{ x: 17, y: 17, w: 561, h: 808, turned: false }])] };
  const got = actualOf([page([{ x: 17.05, y: 16.96, w: 561.09, h: 808, turned: false }])]);
  assert.deepEqual(compareRender(got, want), []);
});

test('a box off by more than 0.1 pt, a wrong turn, a wrong size or page count each fail', () => {
  const want = { pages: [page([{ x: 17, y: 17, w: 561, h: 808, turned: true }])] };
  assert.equal(compareRender(actualOf([page([{ x: 17.2, y: 17, w: 561, h: 808, turned: true }])]), want).length, 1);
  assert.equal(compareRender(actualOf([page([{ x: 17, y: 17, w: 561, h: 808, turned: false }])]), want).length, 1);
  const letter = { widthPt: 612, heightPt: 792, boxes: [{ x: 17, y: 17, w: 561, h: 808, turned: true }] };
  assert.equal(compareRender(actualOf([letter]), want).length, 1);
  assert.match(compareRender(actualOf([]), want)[0], /page count 0/);
});

test('pdf.js reads back a tilted image: its outline and its angle', async () => {
  // MiniPdfWriterTest's 30° clockwise tilt of a 100 x 200 box at (10, 20): centre (60, 120) top-left origin.
  const file = handMadePdf(['86.6025 -50 100 173.2051 -33.3013 660.2873']);
  const [b] = (await validatePdf(file)).pageSizes[0].imageBoxes;
  assert.ok(Math.abs(b.w - 186.6025) < 0.01 && Math.abs(b.h - 223.2051) < 0.01, `outline ${b.w} x ${b.h}`);
  assert.ok(Math.abs(b.x + b.w / 2 - 60) < 0.01 && Math.abs(b.y + b.h / 2 - 120) < 0.01, 'centred on the box');
  assert.ok(Math.abs(b.angle - 330) < 0.01, `angle ${b.angle}`);
  assert.equal(b.turns, 0, 'nearest quarter turn');
  assert.equal(b.mirrored, false);
});

test('angles are compared within 0.1°, across 0°', () => {
  const want = (angle) => ({ pages: [page([{ x: 17, y: 17, w: 561, h: 808, turns: 0, angle }])] });
  const got = (angle) => ({
    pages: 1,
    pageSizes: [
      { widthPt: 595.2756, heightPt: 841.8898, imageBoxes: [{ x: 17, y: 17, w: 561, h: 808, turns: 0, angle }] },
    ],
  });
  assert.deepEqual(compareRender(got(330.05), want(330)), []);
  assert.match(compareRender(got(330.2), want(330)).join(), /angle 330.2, expected 330/);
  assert.deepEqual(compareRender(got(359.96), want(0.05)), []);
  assert.match(compareRender(got(10), want(350)).join(), /angle/);
});
