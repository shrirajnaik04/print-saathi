// Phase 7 fixtures: customer-like PDFs (synthetic, no personal data) with marks a device test can check.
//   one.pdf          A4, a red 30 mm square at the top-left, a blue one at the bottom-right
//   three.pdf        3 A4 pages with a full-width band: page 1 red, page 2 green, page 3 blue (page order)
//   landscape.pdf    A4 sideways (297 x 210 mm), red square top-left
//   mixed.pdf        A4 portrait, US Letter landscape, A5 portrait (red square top-left on each)
//   rotate90.pdf     A4 portrait page with /Rotate 90: shown sideways, red square ends top-right
//   forms.pdf        a text form field (/AcroForm, /Annots)
//   stamp.pdf        a square annotation only (/Annots, like a stamp)
//   blank.pdf        one empty page
//   tiny.pdf         72 x 72 pt page, red
//   huge.pdf         14400 x 14400 pt page (the PDF maximum), red square top-left
//   photo.pdf        one A4 page with an embedded photo-like JPEG
//   text.pdf         one A4 page of text and lines (vector)
//   pages-120.pdf    120 pages, page n with n mod 3 band (red/green/blue)
//   pages-320.pdf    320 pages (the "over 300 pages" notice)
// Hostile (must end as an error, never a crash of the app):
//   zero.pdf, garbage.pdf, truncated.pdf, badxref.pdf, bomb.pdf (200 MB of inflated content), bigimage.pdf
//   (an 8000 x 8000 image of nothing but zeros)
// Usage: node tests/generate/make-doc-pdfs.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { degrees, PDFDocument, PDFName, rgb, StandardFonts } from '@cantoo/pdf-lib';
import jpeg from 'jpeg-js';

const MM = 72 / 25.4;
const A4 = [210 * MM, 297 * MM];
const RED = rgb(1, 0, 0);
const GREEN = rgb(0, 0.8, 0);
const BLUE = rgb(0, 0, 1);
const BANDS = [RED, GREEN, BLUE];

/** A red 30 mm square at the top-left corner (10 mm in), as the page is defined (before any /Rotate). */
function cornerMark(page) {
  const [, h] = [page.getWidth(), page.getHeight()];
  page.drawRectangle({ x: 10 * MM, y: h - 40 * MM, width: 30 * MM, height: 30 * MM, color: RED });
}

function band(page, colour) {
  page.drawRectangle({
    x: 0,
    y: page.getHeight() * 0.6,
    width: page.getWidth(),
    height: page.getHeight() * 0.3,
    color: colour,
  });
}

/** Fixed dates, so running the generator again gives the very same bytes (deterministic fixtures). */
async function save(doc) {
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  doc.setProducer('PrintSaathi test fixtures');
  doc.setCreator('PrintSaathi test fixtures');
  return doc.save({ useObjectStreams: false });
}

export async function makeAll(outDir = 'tests/fixtures/pdf/docs') {
  mkdirSync(outDir, { recursive: true });
  const out = {};
  const put = (name, bytes) => {
    writeFileSync(path.join(outDir, name), bytes);
    out[name] = bytes.length;
  };

  let d = await PDFDocument.create();
  let p = d.addPage(A4);
  cornerMark(p);
  p.drawRectangle({ x: A4[0] - 40 * MM, y: 10 * MM, width: 30 * MM, height: 30 * MM, color: BLUE });
  const one = await save(d);
  put('one.pdf', one);

  d = await PDFDocument.create();
  for (const c of BANDS) band(d.addPage(A4), c);
  put('three.pdf', await save(d));

  d = await PDFDocument.create();
  cornerMark(d.addPage([A4[1], A4[0]]));
  put('landscape.pdf', await save(d));

  d = await PDFDocument.create();
  for (const size of [A4, [11 * 72, 8.5 * 72], [148 * MM, 210 * MM]]) cornerMark(d.addPage(size));
  put('mixed.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage(A4);
  cornerMark(p);
  p.setRotation(degrees(90));
  put('rotate90.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage(A4);
  const form = d.getForm();
  const field = form.createTextField('name');
  field.setText('Customer form');
  field.addToPage(p, { x: 20 * MM, y: 200 * MM, width: 100 * MM, height: 12 * MM });
  put('forms.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage(A4);
  const annot = d.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [20 * MM, 200 * MM, 80 * MM, 240 * MM],
    C: [1, 0, 0],
    Contents: 'APPROVED',
  });
  p.node.set(PDFName.of('Annots'), d.context.obj([d.context.register(annot)]));
  put('stamp.pdf', await save(d));

  d = await PDFDocument.create();
  d.addPage(A4);
  put('blank.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage([72, 72]);
  p.drawRectangle({ x: 0, y: 0, width: 72, height: 72, color: RED });
  put('tiny.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage([14400, 14400]);
  p.drawRectangle({ x: 200, y: 14400 - 3000, width: 2800, height: 2800, color: RED });
  put('huge.pdf', await save(d));

  // A photo-like JPEG: smooth colour gradient (synthetic).
  const w = 800;
  const h = 600;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = (x * 255) / w;
      px[i + 1] = (y * 255) / h;
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  const jpg = jpeg.encode({ data: px, width: w, height: h }, 90).data;
  d = await PDFDocument.create();
  p = d.addPage(A4);
  const img = await d.embedJpg(jpg);
  p.drawImage(img, { x: 20 * MM, y: 120 * MM, width: 170 * MM, height: 127.5 * MM });
  put('photo.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage(A4);
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 40; i++)
    p.drawText(`Line ${i + 1}: PrintSaathi document test, plain text and vector lines.`, {
      x: 20 * MM,
      y: (280 - i * 6) * MM,
      size: 11,
      font,
    });
  p.drawLine({ start: { x: 20 * MM, y: 30 * MM }, end: { x: 190 * MM, y: 30 * MM }, thickness: 2 });
  put('text.pdf', await save(d));

  for (const n of [120, 320]) {
    d = await PDFDocument.create();
    for (let i = 0; i < n; i++) band(d.addPage(A4), BANDS[i % 3]);
    put(`pages-${n}.pdf`, await save(d));
  }

  // Hostile.
  put('zero.pdf', Buffer.alloc(0));
  put(
    'garbage.pdf',
    Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 256))]),
  );
  put('truncated.pdf', Buffer.from(one).subarray(0, Math.floor(one.length * 0.6)));
  put(
    'badxref.pdf',
    Buffer.from(
      Buffer.from(one)
        .toString('latin1')
        .replace(/\d{10} 00000 n/g, '9999999999 00000 n'),
      'latin1',
    ),
  );

  d = await PDFDocument.create();
  p = d.addPage(A4);
  // 200 MB of zero bytes compress to ~200 KB: a decompression bomb in the page content.
  const raw = d.context.stream(deflateSync(Buffer.alloc(200 * 1024 * 1024)), { Filter: 'FlateDecode' });
  p.node.set(PDFName.of('Contents'), d.context.register(raw));
  put('bomb.pdf', await save(d));

  d = await PDFDocument.create();
  p = d.addPage(A4);
  const big = d.context.stream(deflateSync(Buffer.alloc(8000 * 8000 * 3)), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 8000,
    Height: 8000,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
  });
  const ref = d.context.register(big);
  p.node.setXObject(PDFName.of('Big'), ref);
  const content = d.context.stream(`q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Big Do Q`);
  p.node.set(PDFName.of('Contents'), d.context.register(content));
  put('bigimage.pdf', await save(d));

  console.log(JSON.stringify(out));
}

if (process.argv[1]?.endsWith('make-doc-pdfs.mjs')) await makeAll(process.argv[2]);
