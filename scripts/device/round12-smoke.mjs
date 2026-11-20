// Phase 50 (owner, round 12) on a real Android (emulator) at a phone's screen size: One on each page asks each photo's
// corners in turn ("Photo 1 of 6" ... "Done") before Ready, each photo is then centred on its page in the print file read
// back by pdf.js, and the picture files the screens show are made at 1536 px (sharper previews). Real-engine detection of
// a paper page in a photo and of a standing card are covered by the engine tests, not by this synthetic share.
// Test devices only (it clears the app's data and changes the screen size). Synthetic photos only (the test sender).
// Usage: node scripts/device/round12-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round12-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r12.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r12.xml');
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
/** A control named exactly [t] ("Next", not "Next point"). */
const tapExact = async (t) => {
  for (let i = 0; i < 6; i++) {
    const b = boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="${esc(t)}"`).test(x)));
    if (b && b[2] > b[0] && b[3] > b[1]) return tapAt(b);
    await sleep(800);
  }
  throw new Error(`"${t}" not on screen`);
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
sh('logcat', '-c');
sh('pm', 'clear', PKG);
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
try {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  for (let end = Date.now() + 240_000; !has('Recent jobs') && Date.now() < end; ) {
    if (has('Done')) await tap('Done');
    else if (has('Next')) await tap('Next');
    await sleep(1500);
  }
  await until('Home', () => has('Recent jobs'));
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `r12${Date.now()}`);
  await until('choices', () => has('One on each page') || has('Start a new job'), 60_000);
  if (has('Start a new job')) await tap('Start a new job');
  await until('choices', () => has('One on each page'));
  await tap('One on each page');
  // Each photo's corners in turn, then Ready.
  await until('Photo 1 of 6', () => has('Photo 1 of 6'), 90_000);
  await shot('01-photo-1-corners');
  for (let n = 1; n < 6; n++) {
    await tapExact('Next');
    await until(`Photo ${n + 1} of 6`, () => has(`Photo ${n + 1} of 6`), 60_000);
  }
  await shot('02-photo-6-corners');
  // The last photo says Done (the button "Next point" is another control).
  result.checks.askedEachPhotoInTurn = !nodes().some((x) => /(?:text|content-desc)="Next"/.test(x)) && has('Done');
  const before = newestPrint();
  await tap('Done');
  await until('Ready', () => has('Ready to print'));
  await until('a print file', () => newestPrint() !== '' && newestPrint() !== before, 90_000);
  await sleep(1500);
  await shot('03-ready');
  const made = await readPrint('r12');
  result.pages = made.pages;
  result.checks.sixPages = made.pages === 6;
  const centred = made.pageSizes.every((pg) => {
    const b = pg.imageBoxes[0];
    return !!b && Math.abs(b.x + b.w / 2 - pg.widthPt / 2) <= 1.5 && Math.abs(b.y + b.h / 2 - pg.heightPt / 2) <= 1.5;
  });
  result.checks.everyPhotoCentredOnItsPage = centred;
  // The pictures the screens show: made at 1536 px (never below the 640 px of before).
  const thumbs = runAs('ls', `no_backup/jobs/${newestJob()}/thumbs`).split(/\s+/);
  result.thumbs = thumbs.filter((f) => f.endsWith('.jpg')).slice(0, 3);
  result.checks.picturesMadeAt1536 =
    thumbs.some((f) => f.endsWith('-1536.jpg')) && !thumbs.some((f) => f.endsWith('-640.jpg'));
  result.checks.noCrash = !/Process: in\.printsaathi/.test(adb(serial, ['logcat', '-d', '-b', 'crash']));
} finally {
  sh('wm', 'size', 'reset');
  sh('wm', 'density', 'reset');
}
writeFileSync(
  path.join(outDir, 'round12-smoke.json'),
  `${JSON.stringify(result, null, 2)}
`,
);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
