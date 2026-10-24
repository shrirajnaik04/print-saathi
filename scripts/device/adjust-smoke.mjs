// Phases 16-19 on a real Android (emulator): the owner's phone feedback, from a synthetic share to the print file.
// Test devices only (it clears the app's data). Synthetic photos only, never a customer's.
// Usage: node scripts/device/adjust-smoke.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: adjust-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const MM = 72 / 25.4;
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-adjust.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-adjust.xml');
  } catch {
    return ''; // nothing on screen yet (the app is starting)
  }
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
      .find((x) => new RegExp(`(?:text|content-desc)="${t.replace(/&/g, '&amp;')}`).test(x));
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
/** Home from a job: leaving an unprinted job asks first (round 4); Leave keeps it, as Home did before. */
const goHome = async () => {
  await tap('Home');
  await sleep(1200);
  if (!has('Leave this job?')) return;
  const b = xml()
    .split('<node ')
    .find((x) => /(?:text|content-desc)="Leave"/.test(x))
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
  if (b) sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
};
const shot = async (name) => {
  await sleep(1200);
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
const newestJob = () => runAs('ls', '-t', 'no_backup/jobs').trim().split(/\s+/)[0];
/** The newest print file of the newest job, as text (latin1), and the job's first source file's bytes. */
const printFile = () => {
  const job = newestJob();
  const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0];
  const pdf = adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${job}/out/${hash}/print.pdf`], {
    binary: true,
  });
  const text = Buffer.from(pdf).toString('latin1');
  const placed = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map(
    (m) => {
      const [a, b, c, d] = m.slice(1, 5).map(Number);
      return [Math.hypot(a, b) / MM, Math.hypot(c, d) / MM];
    },
  );
  // Each picture's drawn box on the page (mm), turned or not: width |a|+|c|, height |b|+|d|.
  const boxes = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map((m) => {
    const [a, b, c, d] = m.slice(1, 5).map(Number);
    return [(Math.abs(a) + Math.abs(c)) / MM, (Math.abs(b) + Math.abs(d)) / MM];
  });
  return {
    pdf: Buffer.from(pdf),
    pages: (text.match(/\/Type \/Page\b/g) ?? []).length,
    placedMm: placed,
    boxesMm: boxes,
    borders: [...text.matchAll(/q ([\d.]+) w 0 G [\d.]+ [\d.]+ [\d.]+ [\d.]+ re S Q/g)].map((m) => Number(m[1])),
  };
};
const sourceBytes = () => {
  const job = newestJob();
  const first = runAs('ls', `no_backup/jobs/${job}/src`).trim().split(/\s+/).sort()[0];
  return Buffer.from(
    adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${job}/src/${first}`], { binary: true }),
  );
};
/** The newest finished print file's folder (plan hash) of the newest job, or '' when there is none yet. */
const newestPrint = () => {
  try {
    const job = newestJob();
    const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0] ?? '';
    return hash && runAs('ls', `no_backup/jobs/${job}/out/${hash}`).includes('print.pdf') ? hash : '';
  } catch {
    return '';
  }
};
/** After a change on Adjust: wait for Ready's new print file (another plan, another folder), never read the old one. */
const waitNewFile = async (before) => {
  await until('Ready', () => has('Ready to print'));
  await until('a new print file', () => {
    const now = newestPrint();
    return now !== '' && now !== before;
  });
  await sleep(1500);
};
const waitFile = async () => {
  await until('Ready', () => has('Ready to print'));
  await until('print file', () => !has('Preparing'), 60_000).catch(() => {});
  await sleep(3000);
};
const share = async (mode) => {
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);
  await until(
    'Received or New files',
    () => has('Files received') || has('Start a new job') || has('Ready to print'),
    60_000,
  );
  if (has('Start a new job')) await tap('Start a new job');
};
const sizeLabel = () => labels().find((l) => /× [\d.]+ cm/.test(l)) ?? '';
/**
 * A synthetic 1200 × 800 photo stored sideways (orange left half, blue right half) with the camera's "turn once
 * clockwise" note (EXIF Orientation 6), as phone cameras save it: upright it is 800 × 1200, orange on top.
 */
const sidewaysPhoto = () => {
  const [w, h] = [1200, 800];
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(i % w < w / 2 ? [255, 133, 74, 255] : [48, 75, 238, 255], i * 4);
  const jpg = jpeg.encode({ data, width: w, height: h }, 90).data;
  // Little-endian TIFF with one entry: Orientation (0x0112, SHORT, 1) = 6; no next directory.
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
};
const result = { serial, checks: {} };

sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));
await shot('01-home-logo-medium-size');

// 1. Adjust photos: Bigger three times on photo 1 of six on one page; the print file has it at the size shown.
await share('six-photos');
await until('choices', () => has('All on one page'));
await tap('All on one page');
await waitFile();
const allOnOne = printFile();
await shot('02-ready-all-on-one');
await tap('Adjust photos');
await until('Adjust', () => has('Photo 1 of 6') && labels().some((l) => /× [\d.]+ cm/.test(l)));
await shot('03-adjust');
const beforeAdjust = newestPrint();
for (let i = 0; i < 3; i++) {
  await tap('Bigger');
  await sleep(700);
}
const shown = sizeLabel();
await shot('04-adjust-bigger');
await tap('Done');
await waitNewFile(beforeAdjust);
const grown = printFile();
const [sw, sh2] = (shown.match(/([\d.]+) × ([\d.]+) cm/)?.slice(1) ?? ['0', '0']).map((v) => Number(v) * 10);
const first = grown.placedMm[0] ?? [0, 0];
result.adjust = { shown, firstPlacedMm: first, pagesBefore: allOnOne.pages, pages: grown.pages };
result.checks.adjustPrintsTheSizeShown = Math.abs(first[0] - sw) <= 0.5 && Math.abs(first[1] - sh2) <= 0.5;
// The bigger photo no longer fits with the others: they go on to a new page by themselves.
result.checks.biggerPhotoFlowsOnToANewPage = allOnOne.pages === 1 && grown.pages === 2;
await shot('05-ready-after-adjust');

// 2. Photos as they are: one photo, one on each page: its own picture (from the scan header to the end mark) is
// inside the print file byte for byte; its notes (EXIF, colour profile) are left out (self-audit 2026-10-24).
await share('single-photo');
await until('choices', () => has('One on each page'));
await tap('One on each page');
await waitFile();
const one = printFile();
const src = sourceBytes();
const scans = src.subarray(src.indexOf(Buffer.from([0xff, 0xda])), src.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2);
result.asIs = { sourceBytes: src.length, pictureBytes: scans.length, printBytes: one.pdf.length };
result.checks.originalPhotoInTheFileByteForByte = scans.length > 1000 && one.pdf.indexOf(scans) >= 0;
result.checks.uprightPaperByDefault = labels().some((l) => /A4 · Colour/.test(l)) && !has('Sideways page');

// 3. Passport: the 1½ pt border in the file, inside each photo; Adjust → Bigger is 1 mm wider, exactly.
await share('single-photo');
await until('choices', () => has('Passport photos'));
await tap('Passport photos');
await until('face', () => has('Fit the face in the frame'));
await shot('06-fit-the-face');
await tap('Next');
await waitFile();
const pass = printFile();
result.passport = {
  borders: pass.borders.length,
  borderWidths: [...new Set(pass.borders)],
  placed: pass.placedMm.length,
};
result.checks.passportBorder1_5ptOnEveryPhoto =
  pass.borders.length > 0 && pass.borders.length === pass.placedMm.length && pass.borders.every((w) => w === 1.5);
await shot('07-ready-passport-border');
const beforeBigger = newestPrint();
await tap('Adjust passport photo');
// The screen has its plan (and size line) before Bigger is used.
await until('Adjust passport', () => labels().some((l) => l.startsWith('3.5 × 4.5 cm')));
await tap('Bigger');
await until('1 mm bigger', () => labels().some((l) => l.startsWith('3.6 × 4.63 cm')), 15_000);
await shot('08-adjust-passport');
await tap('Done');
await waitNewFile(beforeBigger);
const bigger = printFile();
const p0 = bigger.placedMm[0] ?? [0, 0];
result.passport.biggerMm = p0;
result.checks.passportOneMmBiggerExactly = Math.abs(p0[0] - 36) <= 0.3 && Math.abs(p0[1] - 46.3) <= 0.3;

// 4. The ID card tile asks where the card is; the gallery opens Android's photo picker.
sh('input', 'keyevent', 'KEYCODE_HOME');
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('Home or a screen', () => has('Home') || has('Recent jobs'));
if (!has('Recent jobs')) await goHome();
await until('Home', () => has('Recent jobs'));
await tap('Aadhaar & ID cards');
await until('card source', () => has('Where is the card?'));
await shot('09-where-is-the-card');
await tap('Photos of the card');
await sleep(3000);
const top = sh('dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0] ?? '';
result.cardSource = { top: top.replace(/\{[^ ]+ /, '{') };
result.checks.galleryOpensThePhotoPicker = /photopicker|PhotoPicker|documentsui/i.test(top);
await shot('10-photo-picker');
sh('input', 'keyevent', 'KEYCODE_BACK');
// The other answer, an e-Aadhaar PDF or file, opens Android's file manager.
await until('Where is the card? (back)', () => has('Where is the card?'));
await tap('e-Aadhaar PDF or file');
await sleep(3000);
const files = sh('dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0] ?? '';
result.cardSource.filesTop = files.replace(/\{[^ ]+ /, '{');
result.checks.fileAnswerOpensTheFileManager = /documentsui/i.test(files);
await shot('10b-file-manager');
sh('input', 'keyevent', 'KEYCODE_BACK');

// 5. A photo picked from the gallery is printed as it is (owner, 2026-10-23): one stored sideways with the camera's
// "turn once" note shows and prints upright by that note alone; the app adds no turn of its own (no "Turned" note).
const devPhoto = '/sdcard/Pictures/ps-smoke-sideways.jpg';
const localPhoto = path.join(outDir, 'sideways-exif6.jpg');
writeFileSync(localPhoto, sidewaysPhoto());
adb(serial, ['push', localPhoto, devPhoto]);
sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${devPhoto}`);
await sleep(2000);
await until('Where is the card? again', () => has('Where is the card?'));
await goHome();
await until('Home', () => has('Recent jobs'));
await tap('Photos Choose');
await until('the photo picker', () =>
  /photopicker/i.test(sh('dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0] ?? ''),
);
await sleep(1500);
await shot('11-photo-picker-sideways-photo');
await tap('Photo taken on');
await sleep(800);
await tap('Add');
await until('choices', () => has('One on each page'));
await tap('One on each page');
await waitFile();
await shot('12-ready-picked-photo-upright');
const pickedJob = JSON.parse(runAs('cat', `no_backup/jobs/${newestJob()}/job.json`));
const picked = printFile();
const box = picked.boxesMm[0] ?? [0, 0];
result.picked = { picked: pickedJob.picked, turns: pickedJob.turns, boxMm: box, turnedNote: has('Turned') };
result.checks.pickedPhotoNeverTurnedByTheApp =
  pickedJob.picked === true && Object.keys(pickedJob.turns ?? {}).length === 0 && !has('Turned');
result.checks.pickedSidewaysPhotoPrintsUpright = box[1] > box[0] * 1.3;
// The photo's own notes (here its EXIF) never reach the print file, the print service or the printer.
result.checks.photoNotesLeftOutOfThePrintFile = !picked.pdf.includes(Buffer.from('Exif\0\0', 'latin1'));
sh('rm', '-f', devPhoto);
sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${devPhoto}`);

writeFileSync(path.join(outDir, 'adjust-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result, null, 2));
if (failed.length) {
  console.log(`ADJUST-SMOKE-FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exitCode = 1;
} else console.log('ADJUST-SMOKE-DONE: all checks hold');
