// Phases 41-43 (owner, round 8) on a real Android (emulator) at a phone's screen size: a WhatsApp text message prints
// as A4 pages; Scan pages takes a paper page's photo with the phone's camera app; a camera closed without a photo
// changes nothing; a photo taken while Android stopped the app is kept at the next start; photos on one page print at
// least 10 mm apart. Print files read back by pdf.js and jpeg-js.
// Camera: since Android 11 only a pre-installed camera app answers the app's camera request, so on API 30+ the
// emulator's own camera app is driven (shutter, Done; Back cancels) — a real camera app writing into the app's private
// storage. Below API 30 the test sender's fake camera answers instead (the emulator's camera is turned off for the run):
// a synthetic typed page at a slant on a table with a red stamp, so the corners found (within 3 %), the straightened
// print and Clean colour's red stamp are checked against known values. [camera] forces one: fake | system.
// Test devices only (it clears the app's data and changes the screen size). Synthetic content only.
// Usage: node scripts/device/round8-smoke.mjs <serial> <outDir> [camera]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir, cameraArg] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round8-smoke.mjs <serial> <outDir> [fake|system]');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
/** The fake camera's page corners on its 1200 × 1600 photo (FakeCameraActivity.CORNERS), as fractions. */
const CORNERS = [230, 200, 1000, 260, 1060, 1380, 150, 1330].map((v, i) => v / (i % 2 === 0 ? 1200 : 1600));
/** The red stamp's middle on the straightened page (FakeCameraActivity: at 520, 860 of a 700 × 990 page). */
const STAMP = { x: 520 / 700, y: 860 / 990 };
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r8.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r8.xml');
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
/** A control of another app (the system camera) by its resource id. */
const byId = (id) => boundsIn(nodes().find((x) => x.includes(`resource-id="${id}"`)));
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
/** Taps the control labelled exactly [t]. */
const tapExact = async (t) => {
  const b = boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="${esc(t)}"`).test(x)));
  if (!b) throw new Error(`"${t}" not on screen`);
  tapAt(b);
};
const shot = async (name) => {
  await sleep(1200);
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
const jobs = () =>
  runAs('ls', '-t', 'no_backup/jobs')
    .trim()
    .split(/\s+/)
    .filter((j) => j && runAs('ls', `no_backup/jobs/${j}`).includes('job.json'));
const newestJob = () => jobs()[0];
const newestPrint = () => {
  try {
    const job = newestJob();
    const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0] ?? '';
    return hash && runAs('ls', `no_backup/jobs/${job}/out/${hash}`).includes('print.pdf') ? hash : '';
  } catch {
    return '';
  }
};
const printBytes = () =>
  adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${newestJob()}/out/${newestPrint()}/print.pdf`], {
    binary: true,
  });
/** Runs [expression] in the app's page (debug builds: WebView debugging) and returns its JSON result. */
async function evaluate(expression) {
  const pid = sh('pidof', PKG).trim().split(/\s+/)[0];
  adb(serial, ['forward', 'tcp:9338', `localabstract:webview_devtools_remote_${pid}`]);
  try {
    const pages = await (await fetch('http://127.0.0.1:9338/json')).json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    });
    const reply = await new Promise((ok) => {
      ws.onmessage = (e) => ok(JSON.parse(String(e.data)));
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    ws.close();
    return JSON.parse(reply.result.result.value);
  } finally {
    adb(serial, ['forward', '--remove', 'tcp:9338']);
  }
}
const pageText = (sel) =>
  evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null)`);
const MM = 72 / 25.4;
/** The print file's pages and image boxes (mm), read by pdf.js. */
const readPrint = async (name) => {
  const file = path.join(outDir, `${name}.pdf`);
  writeFileSync(file, printBytes());
  const read = await validatePdf(file);
  rmSync(file);
  return read;
};
/** The first photo the print file holds, decoded (its JPEG stream, as the engine wrote it). */
const firstImage = () => {
  const pdf = printBytes();
  const start = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const end = pdf.indexOf(Buffer.from('endstream'), start);
  if (start < 0 || end < 0) return null;
  return jpeg.decode(pdf.subarray(start, end), { useTArray: true, formatAsRGBA: true });
};
/** Average colour of a patch around (fx, fy) (fractions of the image). */
const patch = (img, fx, fy, r = 0.02) => {
  let n = 0;
  const sum = [0, 0, 0];
  const x0 = Math.floor((fx - r) * img.width);
  const y0 = Math.floor((fy - r) * img.height);
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + 2 * r * img.height); y++)
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + 2 * r * img.width); x++) {
      const i = 4 * (y * img.width + x);
      for (let k = 0; k < 3; k++) sum[k] += img.data[i + k];
      n++;
    }
  return sum.map((v) => Math.round(v / Math.max(1, n)));
};
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const waitPrint = async (before) => {
  await until('Ready', () => has('Ready to print'), 60_000);
  await until('a new print file', () => newestPrint() !== '' && newestPrint() !== before, 120_000);
  await sleep(1500);
};
const home = async () => {
  await tap('Home');
  await sleep(1200);
  if (has('Leave this job?')) await tapExact('Leave');
  await until('Home', () => has('Recent jobs'), 15_000);
};
/** The app's process id, or "" when it is not running. */
const pidOf = () => {
  try {
    return sh('pidof', PKG).trim();
  } catch {
    return '';
  }
};
const camera = (mode) => sh('am', 'start', '-W', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode);

const result = { serial, checks: {} };
const sdk = Number(sh('getprop', 'ro.build.version.sdk').trim());
const mode = cameraArg ?? (sdk >= 30 ? 'system' : 'fake');
result.camera = { sdk, mode };
const CAM = 'com.android.camera2';
const hasCamera2 = sh('pm', 'list', 'packages', CAM).includes(`package:${CAM}`);
if (mode === 'system' && !hasCamera2) throw new Error('no system camera app on this emulator');
// System camera: its permissions granted (no first-run questions); fake camera: the system one off (no chooser).
if (mode === 'system')
  for (const perm of ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'])
    try {
      sh('pm', 'grant', CAM, `android.permission.${perm}`);
    } catch {
      // not asked for by this version
    }
const cameras = mode === 'fake' && hasCamera2 ? [CAM] : [];
/** In the system camera: the shutter, then Done on its review screen. */
const systemShot = async () => {
  await until('the camera', () => !!byId(`${CAM}:id/shutter_button`), 30_000);
  await sleep(1500);
  tapAt(byId(`${CAM}:id/shutter_button`));
  await until("the camera's review", () => !!byId(`${CAM}:id/done_button`), 30_000);
  tapAt(byId(`${CAM}:id/done_button`));
};
sh('pm', 'clear', PKG);
const size0 = sh('wm', 'size').trim();
const density0 = sh('wm', 'density').trim();
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
sh('settings', 'put', 'system', 'user_rotation', '0');
for (const p of cameras) sh('pm', 'disable-user', p);
await sleep(3000);
try {
  // No camera permission is asked for or held (spec 43a).
  result.checks.noCameraPermission = !/android\.permission\.CAMERA/.test(sh('dumpsys', 'package', PKG));
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await until('first start', () => has('Welcome') || has('PrintSaathi'));
  if (has('Welcome')) {
    for (let i = 0; i < 3; i++) await tap('Next');
    await tap('Done');
  }
  await until('Home', () => has('Recent jobs'));

  // 42: a WhatsApp text message (80 lines, English and Devanagari, WhatsApp's marks) → Ready → the print file's pages.
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'text', '--es', 'tag', `t${Date.now()}`);
  await waitPrint('');
  const line = await pageText('.summary');
  const pages = Number(/^Text message · (\d+) pages?/.exec(line ?? '')?.[1] ?? 0);
  const textPrint = await readPrint('r8-text');
  result.text = { line, pages: textPrint.pages, editText: has('Edit text') };
  result.checks.textPrintsAsA4Pages =
    pages >= 2 &&
    textPrint.pages === pages &&
    textPrint.pageSizes.every((p) => Math.abs(p.widthPt - 595) < 2 && Math.abs(p.heightPt - 842) < 2) &&
    result.text.editText;
  await shot('01-text-ready');
  await home();

  // Review I5: a message that could not print (here: one with nothing in it) can be shared again straight away.
  result.blankShares = [];
  for (let k = 0; k < 2; k++) {
    sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'text-blank');
    await until('the empty-message problem', () => has('There is no text to print.'), 20_000).catch(() => {});
    const said = has('There is no text to print.');
    result.blankShares.push(said);
    if (said) sh('input', 'keyevent', 'KEYCODE_BACK');
    await sleep(1500);
    if (!has('Recent jobs')) sh('am', 'start', '-n', `${PKG}/.MainActivity`);
    await sleep(1500);
    if (!has('Recent jobs')) await home();
  }
  result.checks.failedTextCanBeSharedAgain = result.blankShares.every(Boolean);

  // 43: Scan pages → the camera → Page 1 with the page's frame (corner circles and side bars).
  if (mode === 'fake') camera('camera-ok');
  await tap('Scan pages');
  if (mode === 'system') await systemShot();
  await until('Page 1', () => has('Point 1 of 8'), 60_000);
  await until(
    'the page looked for',
    () => has("Check that the corners sit on the page's corners.") || has("Couldn't find the page's edges."),
    30_000,
  );
  result.checks.cornerCircles =
    (await evaluate(`JSON.stringify(document.querySelectorAll('.scan-corner').length)`)) === 4 &&
    (await evaluate(`JSON.stringify(document.querySelectorAll('.scan-side').length)`)) === 4;
  if (mode === 'fake') {
    const pts = await evaluate(`JSON.stringify(document.querySelector('.scan-lines polygon')?.getAttribute('points'))`);
    result.found = (pts ?? '').split(' ').flatMap((p) => p.split(',').map((v) => Number(v) / 100));
    result.cornerMiss = Math.max(...CORNERS.map((v, i) => Math.abs(v - (result.found[i] ?? -1))));
    result.checks.pageFoundWithin3Percent = result.cornerMiss <= 0.03;
  } else {
    // The emulator's camera sees its own room, with no paper page: the whole photo, and it says so.
    result.checks.noPageSaysSo = has("Couldn't find the page's edges.");
  }
  await shot('02-scan-corners');
  await tapExact('Done');
  await until('Scanned pages', () => has('Scanned pages') && has('Finish (1 page)'), 30_000);
  await shot('03-scanned-pages');
  if (mode === 'fake') {
    // Original look first: a straightened page has page-white at all four corners (the table is gone).
    await tap('Original');
    await sleep(1500);
  }
  await tap('Finish (1 page)');
  await waitPrint('');
  const scanned = await readPrint('r8-scan');
  const shown = firstImage();
  result.scan = { pages: scanned.pages, images: scanned.pageSizes[0]?.imagesDrawn, line: await pageText('.summary') };
  result.checks.scannedPagePrints =
    scanned.pages === 1 &&
    scanned.pageSizes[0]?.imagesDrawn === 1 &&
    /^Scanned pages · 1 page/.test(result.scan.line ?? '');
  if (mode === 'fake') {
    const cornersLuma = shown
      ? [0.04, 0.96].flatMap((y) => [0.04, 0.96].map((x) => Math.round(luma(patch(shown, x, y)))))
      : [];
    result.scan.cornersLuma = cornersLuma;
    result.checks.scannedPagePrintsStraightened = cornersLuma.length === 4 && cornersLuma.every((l) => l > 200);
    await shot('04-scan-ready-original');
    // Clean colour: the paper white, the stamp still red.
    const beforeClean = newestPrint();
    sh('input', 'keyevent', 'KEYCODE_BACK');
    await until('Scanned pages', () => has('Finish (1 page)'), 15_000);
    await tap('Clean colour');
    await sleep(1500);
    await tap('Finish (1 page)');
    await waitPrint(beforeClean);
    const clean = firstImage();
    const paper = clean ? patch(clean, 0.5, 0.04) : [0, 0, 0];
    const stamp = clean ? patch(clean, STAMP.x, STAMP.y, 0.015) : [0, 0, 0];
    result.clean = { paper, stamp, line: await pageText('.summary') };
    result.checks.cleanColourWhitePaperRedStamp =
      luma(paper) >= 240 && stamp[0] - stamp[1] >= 80 && /Clean colour/.test(result.clean.line ?? '');
  } else {
    result.checks.scanStartsInCleanColour = /Clean colour/.test(result.scan.line ?? '');
  }
  await shot('05-scan-ready');
  await home();

  // A camera closed without a photo: nothing changes (still Home, no new job).
  const before = jobs().length;
  if (mode === 'fake') camera('camera-cancel');
  await tap('Scan pages');
  if (mode === 'system') {
    await until('the camera', () => !!byId(`${CAM}:id/shutter_button`), 30_000);
    sh('input', 'keyevent', 'KEYCODE_BACK');
  }
  await sleep(4000);
  result.checks.cancelledCameraChangesNothing = has('Recent jobs') && !has('Point 1 of 8') && jobs().length === before;

  // Android stops the app while the camera is open (2 GB phones): the photo is kept at the next start.
  if (mode === 'fake') camera('camera-hold');
  await tap('Scan pages');
  if (mode === 'system') await until('the camera', () => !!byId(`${CAM}:id/shutter_button`), 30_000);
  await sleep(3000);
  sh('am', 'kill', PKG);
  await sleep(1500);
  const killed = !pidOf();
  if (mode === 'system') await systemShot();
  else sh('input', 'keyevent', 'KEYCODE_BACK'); // the fake camera already wrote it; it closes
  await sleep(3000);
  if (!pidOf()) sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await until('the kept photo opens', () => has('Point 1 of 8'), 60_000).catch(() => {});
  result.checks.photoKeptAfterAppStopped = killed && has('Point 1 of 8') && jobs().length === before + 1;
  await shot('06-kept-after-stop');
  if (mode === 'fake') camera('camera-ok');
  await home();

  // 41: six photos on one page, at least 10 mm apart in the print file.
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `g${Date.now()}`);
  await until('Received', () => has('All on one page'), 60_000);
  await tap('All on one page');
  await waitPrint('');
  const boxes = ((await readPrint('r8-gap')).pageSizes[0]?.imageBoxes ?? []).map((b) => ({
    x: b.x / MM,
    y: b.y / MM,
    w: b.w / MM,
    h: b.h / MM,
  }));
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      gap = Math.min(gap, Math.max(dx, dy));
    }
  result.gap = { photos: boxes.length, smallestMm: Math.round(gap * 100) / 100 };
  result.checks.photosAtLeast10mmApart = boxes.length === 6 && gap >= 10 - 0.1;
  await shot('07-gap-ready');
} finally {
  for (const p of cameras) sh('pm', 'enable', p);
  if (mode === 'fake') sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'camera-ok');
  sh('wm', 'size', size0.includes('Override') ? size0.split('Override size: ')[1] : 'reset');
  sh('wm', 'density', density0.includes('Override') ? density0.split('Override density: ')[1] : 'reset');
  sh('settings', 'put', 'system', 'accelerometer_rotation', '1');
}

writeFileSync(path.join(outDir, 'round8-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
