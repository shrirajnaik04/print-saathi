// Phase 14 Task 6: ID card copy on a real Android (emulator), from a synthetic share to the print file and Android's
// print screen. Test devices only (it clears the app's data). Synthetic cards only, never a real card.
// Usage: node scripts/device/card-smoke.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: card-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-card.xml');
  } catch {
    // busy: the last dump
  }
  return sh('cat', '/sdcard/ps-card.xml');
};
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const until = async (what, test, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return;
    await sleep(800);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const [W, H] = (
  sh('wm', 'size')
    .match(/(\d+)x(\d+)/)
    ?.slice(1) ?? ['1080', '2000']
).map(Number);
const tap = async (t) => {
  for (let i = 0; i < 8; i++) {
    const n = xml()
      .split('<node ')
      .find((x) => new RegExp(`(?:text|content-desc)="${t}`).test(x));
    const b = n
      ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
      ?.slice(1)
      .map(Number);
    if (b && b[2] > b[0] && b[3] > b[1] && b[3] <= H * 0.97) {
      sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
      return;
    }
    sh(
      'input',
      'swipe',
      String(W >> 1),
      String(Math.round(H * 0.75)),
      String(W >> 1),
      String(Math.round(H * 0.35)),
      '300',
    );
    await sleep(900);
  }
  throw new Error(`"${t}" not reachable`);
};
const shot = async (name) => {
  await sleep(1200);
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
/** The newest print file of the newest job: its page size and its images' sizes (read from the PDF's own text). */
const printFile = () => {
  const job = runAs('ls', '-t', 'no_backup/jobs').trim().split(/\s+/)[0];
  const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0];
  const pdf = adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${job}/out/${hash}/print.pdf`], {
    binary: true,
  });
  const text = Buffer.from(pdf).toString('latin1');
  const box = text
    .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
    ?.slice(1)
    .map(Number);
  const images = [...text.matchAll(/\/Width\s+(\d+)\s*\/Height\s+(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  // Each card's box on the page: the image drawing matrix "w 0 0 h x y cm" (points).
  // Each image's drawing matrix "a b c d e f cm" (points): its drawn width and height, turned or not (review I9).
  const placed = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map(
    (m) => {
      const [a, b, c, d] = m.slice(1, 5).map(Number);
      return [Math.hypot(a, b), Math.hypot(c, d)];
    },
  );
  return { bytes: pdf.length, pageSizePt: box, images, placedPt: placed };
};

const result = { serial, steps: [] };
const step = (s) => {
  result.steps.push(s);
  console.log(s);
};

sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));
await shot('01-home');

// 1. Two card photos (front and back), shared like WhatsApp does.
sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'card-photos', '--es', 'tag', `card${Date.now()}`);
await until('Received', () => has('ID card copy'));
await shot('02-received');
await tap('ID card copy');
// Owner, round 4: each side from a photo passes its own crop screen first; Done keeps the frame found.
for (const side of ['Front of the card', 'Back of the card']) {
  await until(side, () => has(side), 60_000);
  await sleep(1000);
  await tap('Done');
  await sleep(1500);
}
await until('cards found', () => has('2 ID cards found') || has('1 ID card found') || has("Couldn't find"));
result.photosFound = labels().find((l) => /ID cards? found|Couldn't find/.test(l));
result.photosChecked = labels().filter((l) => l === 'Check the corners').length;
await until('straightened images', () => !has('Getting the card ready'), 30_000).catch(() => {});
await shot('03-cards-found');
step(`photos: ${result.photosFound}, ${result.photosChecked} to check`);
await tap('Card copy');
await until('How big?', () => has('Real card size'));
await shot('04-how-big');
await tap('Real card size');
await until('Ready', () => labels().some((l) => l.startsWith('ID card · real size')));
await until('print file', () => !has('Preparing'), 60_000).catch(() => {});
await sleep(3000);
await shot('05-ready');
result.photosPrintFile = printFile();
step(`photos print file: ${JSON.stringify(result.photosPrintFile)}`);
await tap('PRINT');
await sleep(5000);
await shot('06-android-print-screen');
sh('input', 'keyevent', 'KEYCODE_BACK');
await sleep(3000);

// 2. An e-Aadhaar-like PDF, shared alone: ID card copy is offered.
sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'eaadhaar', '--es', 'tag', `aad${Date.now()}`);
await until(
  'Received or New files',
  () => has('ID card copy') || has('Start a new job') || has('Print the whole document'),
  60_000,
);
if (has('Start a new job')) await tap('Start a new job');
await until('e-Aadhaar choice', () => has('Print the whole document'));
await shot('07-eaadhaar-received');
await tap('ID card copy');
await until('panels found', () => has('2 ID cards found') || has('1 ID card found') || has("Couldn't find"));
result.pdfFound = labels().find((l) => /ID cards? found|Couldn't find/.test(l));
await sleep(2000);
await shot('08-eaadhaar-cards');
await tap('Card copy');
await until('How big? with the whole page', () => has('Real card size'));
result.pdfSizes = labels().filter((l) => /^(Real card size|Big size|Many copies|Whole e-Aadhaar page)/.test(l));
await shot('09-eaadhaar-how-big');
await tap('Real card size');
await until('Ready', () => labels().some((l) => l.startsWith('ID card · real size')));
await sleep(5000);
await shot('10-eaadhaar-ready');
result.pdfPrintFile = printFile();
step(
  `e-Aadhaar: ${result.pdfFound}; sizes ${result.pdfSizes.join(' | ')}; file ${JSON.stringify(result.pdfPrintFile)}`,
);

// What must hold (review I9): both cards found, A4, and every card drawn at 85.6 × 54.0 mm ± 0.5 mm.
const MM = 72 / 25.4;
const exact = (f) =>
  !!f.pageSizePt &&
  Math.abs(f.pageSizePt[0] - 595.28) < 0.5 &&
  Math.abs(f.pageSizePt[1] - 841.89) < 0.5 &&
  f.placedPt.length === 2 &&
  f.placedPt.every(([w, h]) => Math.abs(w / MM - 85.6) <= 0.5 && Math.abs(h / MM - 54) <= 0.5);
result.checks = {
  photosBothFound: result.photosFound === '2 ID cards found',
  photosExactSize: exact(result.photosPrintFile),
  pdfBothFound: result.pdfFound === '2 ID cards found',
  pdfFourSizes: result.pdfSizes.length === 4,
  pdfExactSize: exact(result.pdfPrintFile),
};
writeFileSync(path.join(outDir, 'card-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.log(`CARD-SMOKE-FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exitCode = 1;
} else console.log('CARD-SMOKE-DONE: all checks hold');
