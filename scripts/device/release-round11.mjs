// Phase 49 (owner, round 11) on the RELEASE build (shrunk, signed, no debug access): Passport photos comes before Photos on
// Home; six shared photos on one page → Adjust photos → Move to page → A new page at the end moves the chosen photo to
// page 2 (the note says so) and Ready then says 2 pages; the turn handle and resize corner are drawn (screenshot); no
// PrintSaathi crash. The screen only: the release build gives no access to the app's private files.
// Test devices only (it clears the app's data and changes the screen size). Synthetic photos only (the test sender).
// Usage: node scripts/device/release-round11.mjs <serial> <outDir>   (the release APK installed first)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: release-round11.mjs <serial> <outDir>');
assertTestDevice(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const dump = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/r11rel.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/r11rel.xml');
  } catch {
    return '';
  }
};
const labels = () => [...dump().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const hasAny = (t) => labels().some((l) => l.includes(t));
const esc = (t) => t.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundsOf = (t) => {
  const n = dump()
    .split('<node ')
    .find((x) => new RegExp(`(?:text|content-desc)="${esc(t)}`).test(x));
  return n
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
};
const [W, H] = [1080, 2340];
const tapAt = (b) => sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
const until = async (what, test, ms = 120_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return true;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
};
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
/** The tools slide sideways: swipe the row left until [t] shows, then tap it (the row's height is read from "Cut"). */
const tapTool = async (t) => {
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
const result = { serial, checks: {} };

sh('logcat', '-c');
sh('pm', 'clear', PKG);
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
try {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  // The Welcome tour: tap Next, then Done, as the cards come (looked at again each time: a busy emulator misses taps).
  for (let end = Date.now() + 240_000; !has('Recent jobs') && Date.now() < end; ) {
    if (has('Done')) await tap('Done');
    else if (has('Next')) await tap('Next');
    await sleep(1500);
  }
  await until('Home', () => has('Recent jobs'));
  const passport = boundsOf('Passport photos');
  const photos = boundsOf('Photos');
  result.home = { passport, photos };
  result.checks.passportPhotosBeforePhotos =
    !!passport &&
    !!photos &&
    (passport[1] < photos[1] - 20 || (Math.abs(passport[1] - photos[1]) <= 20 && passport[0] < photos[0]));
  await shot('01-home');

  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `rr11${Date.now()}`);
  await until('choices', () => has('All on one page') || has('Start a new job'));
  if (has('Start a new job')) await tap('Start a new job');
  await until('choices', () => has('All on one page'));
  await tap('All on one page');
  await until('Ready', () => has('Ready to print'));
  await until('six photos on one page', () => hasAny('6 photos'));
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1500);
  await shot('02-adjust-corner-and-turn-handle');
  await tapTool('Move to page');
  await until('the page list', () => has('Move photo 1 to which page?'));
  await shot('03-page-list');
  result.checks.listOffersNewPage = has('A new page at the end') && has('Cancel');
  await tap('A new page at the end');
  await until('the note', () => has('Photo 1 is now on page 2.'));
  result.checks.noteSaysPage2 = true;
  await shot('04-moved');
  await tap('Done');
  await until('Ready', () => has('Ready to print'));
  await until('two pages', () => hasAny('2 pages'), 90_000);
  result.checks.readyShowsTwoPages = hasAny('2 pages');
  await shot('05-ready-two-pages');
  result.checks.noCrash = !/Process: in\.printsaathi/.test(adb(serial, ['logcat', '-d', '-b', 'crash']));
} finally {
  sh('wm', 'size', 'reset');
  sh('wm', 'density', 'reset');
}
writeFileSync(path.join(outDir, 'release-round11.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
