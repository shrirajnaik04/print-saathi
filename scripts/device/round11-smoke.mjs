// Phase 49 (owner, round 11) on a real Android (emulator) at a phone's screen size: Passport photos comes before Photos
// on Home; the resize corner on Adjust is a crop corner (the page's own look is checked by the browser suite, here it
// is seen on the phone as a picture); "Move to page" moves a photo to a new page and back, and the print file proves it:
// two pages, the moved photo alone on page 2 at the place it had, then one page again with all six photos.
// Test devices only (it clears the app's data and changes the screen size). Synthetic photos only (the test sender).
// Usage: node scripts/device/round11-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round11-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r11.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r11.xml');
  } catch {
    return '';
  }
};
const nodes = () => xml().split('<node ');
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const boundsIn = (n) =>
  n
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
const esc = (t) => t.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundsOf = (t) => boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="${esc(t)}`).test(x)));
/**
 * A choice of the page list: Android reports its name ("Page 1, 5 photos"), or its text with the line break written as
 * &#10; ("Page 1", new line, "5 photos"); either is accepted (review M6).
 */
const choiceBounds = (n, k) =>
  boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="Page ${n}(?:, |&#10;| )${k} photos?"`).test(x)));
const until = async (what, test, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    await sleep(800);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const [W, H] = [1080, 2340];
const tapAt = (b) => sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
const tap = async (t) => {
  for (let i = 0; i < 8; i++) {
    const b = boundsOf(t);
    if (b && b[2] > b[0] && b[3] > b[1] && b[3] <= H * 0.97) {
      tapAt(b);
      return;
    }
    sh(
      'input',
      'swipe',
      String(W >> 1),
      String(Math.round(H * 0.7)),
      String(W >> 1),
      String(Math.round(H * 0.4)),
      '300',
    );
    await sleep(900);
  }
  throw new Error(`"${t}" not reachable`);
};
/** The tools slide sideways: swipe the row left until [t] is on screen, then tap it. */
const tapTool = async (t) => {
  // The row's height is read while the first tool is still on screen: once it slides away it cannot be found again.
  const first = boundsOf('Cut');
  const y = first ? (first[1] + first[3]) >> 1 : Math.round(H * 0.83);
  for (let i = 0; i < 14; i++) {
    const b = boundsOf(t);
    if (b && b[0] >= 0 && b[2] <= W && b[2] > b[0]) {
      tapAt(b);
      return;
    }
    sh('input', 'swipe', String(Math.round(W * 0.85)), String(y), String(Math.round(W * 0.15)), String(y), '300');
    await sleep(700);
  }
  throw new Error(`tool "${t}" not reachable`);
};
const shot = async (name) => {
  await sleep(1200);
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
const newestJob = () =>
  runAs('ls', '-t', 'no_backup/jobs')
    .trim()
    .split(/\s+/)
    .filter((j) => j && runAs('ls', `no_backup/jobs/${j}`).includes('job.json'))[0];
const newestPrint = () => {
  try {
    const job = newestJob();
    const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0] ?? '';
    return hash && runAs('ls', `no_backup/jobs/${job}/out/${hash}`).includes('print.pdf') ? hash : '';
  } catch {
    return '';
  }
};
const readPrint = async (name) => {
  const file = path.join(outDir, `${name}.pdf`);
  // The print file's folder can change while Ready draws again (a busy phone): read until a real PDF comes back.
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = Buffer.from(
      adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${newestJob()}/out/${newestPrint()}/print.pdf`], {
        binary: true,
      }),
    );
    if (bytes.length > 500 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
      writeFileSync(file, bytes);
      const read = await validatePdf(file);
      rmSync(file);
      return read;
    }
    await sleep(2500);
  }
  throw new Error(`no print file to read for ${name}`);
};
const waitNewFile = async (before) => {
  await until('Ready', () => has('Ready to print'));
  await until(
    'a new print file',
    () => {
      const now = newestPrint();
      return now !== '' && now !== before;
    },
    60_000,
  );
  await sleep(1500);
};
const result = { serial, checks: {} };
// A crash left by an earlier run on this emulator must not fail this one (review M6).
sh('logcat', '-c');

sh('pm', 'clear', PKG);
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
try {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await until('first start', () => has('Welcome') || has('PrintSaathi'));
  if (has('Welcome')) {
    for (let i = 0; i < 3; i++) {
      await tap('Next');
      await sleep(900);
    }
    await tap('Done');
  }
  await until('Home', () => has('Recent jobs'));

  // 1. Home: Passport photos first, Photos next to it (the first two tiles, left to right).
  const passport = boundsOf('Passport photos');
  const photos = boundsOf('Photos');
  result.home = { passport, photos };
  result.checks.passportPhotosBeforePhotos =
    !!passport &&
    !!photos &&
    (passport[1] < photos[1] - 20 || (Math.abs(passport[1] - photos[1]) <= 20 && passport[0] < photos[0]));
  await shot('01-home-passport-first');

  // 2. Six photos on one page: the resize corner as a picture, then Move to page → a new page at the end.
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `r11${Date.now()}`);
  await until('choices', () => has('All on one page') || has('Start a new job'), 60_000);
  if (has('Start a new job')) await tap('Start a new job');
  await until('choices', () => has('All on one page'));
  await tap('All on one page');
  await until('Ready', () => has('Ready to print'));
  await until('print file', () => newestPrint() !== '', 60_000);
  await sleep(1500);
  const first = await readPrint('first');
  result.first = { pages: first.pages, images: first.pageSizes.map((p) => p.imagesDrawn) };
  const photo1 = first.pageSizes[0]?.imageBoxes[0];
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1500);
  await shot('02-adjust-resize-corner');
  await tapTool('Move to page');
  await until('the list of pages', () => has('Move photo 1 to which page?'));
  await shot('03-move-sheet-one-page');
  // One page only: the only place to go is a new page at the end (its own page is never listed).
  result.checks.listHasNewPageOnly = has('A new page at the end') && !choiceBounds(1, 6) && has('Cancel');
  let before = newestPrint();
  await tap('A new page at the end');
  await until('the note', () => has('Photo 1 is now on page 2.'));
  result.checks.noteSaysPage2 = has('Photo 1 is now on page 2.');
  await shot('04-moved-to-page-2');
  await tap('Done');
  await waitNewFile(before);
  const moved = await readPrint('moved');
  const alone = moved.pageSizes[1]?.imageBoxes[0];
  result.moved = { pages: moved.pages, images: moved.pageSizes.map((p) => p.imagesDrawn), alone, photo1 };
  const near = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= 1);
  result.checks.printFileHasTwoPages = moved.pages === 2 && moved.pageSizes[0]?.imagesDrawn === 5;
  result.checks.movedPhotoAloneOnPage2AtItsOwnPlace = moved.pageSizes[1]?.imagesDrawn === 1 && near(alone, photo1);

  // 3. Back to page 1 (from the last page, alone: the list is page 1 only), at the place it had.
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1200);
  await tapTool('Move to page');
  await until('the list of pages', () => has('Move photo 1 to which page?'));
  await shot('05-move-sheet-two-pages');
  const back = choiceBounds(1, 5);
  result.checks.listHasPage1OnlyNoNewPage = !!back && !has('A new page at the end');
  before = newestPrint();
  if (back) tapAt(back);
  await until('the note', () => has('Photo 1 is now on page 1.'));
  await tap('Done');
  await waitNewFile(before);
  const again = await readPrint('again');
  result.again = { pages: again.pages, images: again.pageSizes.map((p) => p.imagesDrawn) };
  result.checks.backToOnePageWithSixPhotos = again.pages === 1 && again.pageSizes[0]?.imagesDrawn === 6;

  result.checks.noCrash = !/Process: in\.printsaathi/.test(adb(serial, ['logcat', '-d', '-b', 'crash']));
} finally {
  sh('wm', 'size', 'reset');
  sh('wm', 'density', 'reset');
}
writeFileSync(path.join(outDir, 'round11-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
