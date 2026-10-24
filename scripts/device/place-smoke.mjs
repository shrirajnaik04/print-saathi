// Phases 20-24 on a real Android (emulator): Word margins from the top-left, press and hold to place a photo, the
// scanner-style crop with its magnifier, side handles that crop, Add photos through Android's file manager, and the
// card edges and Home bar. Test devices only (it clears the app's data). Synthetic photos only, never a customer's.
// Usage: node scripts/device/place-smoke.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: place-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const MM = 72 / 25.4;
const A4H = 297 * MM;
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-place.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-place.xml');
  } catch {
    return '';
  }
};
const nodes = () => xml().split('<node ');
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const boundsOf = (t) => {
  const n = nodes().find((x) => new RegExp(`(?:text|content-desc)="${t.replace(/&/g, '&amp;')}`).test(x));
  return n
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
};
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
    const b = boundsOf(t);
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
/** A finger: down at (x, y), held [holdMs], moved to (x2, y2) in steps, lifted. */
const press = async (x, y, holdMs, x2, y2, during) => {
  sh('input', 'motionevent', 'DOWN', String(Math.round(x)), String(Math.round(y)));
  await sleep(holdMs);
  for (let k = 1; k <= 10; k++)
    sh(
      'input',
      'motionevent',
      'MOVE',
      String(Math.round(x + ((x2 - x) * k) / 10)),
      String(Math.round(y + ((y2 - y) * k) / 10)),
    );
  if (during) await during();
  sh('input', 'motionevent', 'UP', String(Math.round(x2)), String(Math.round(y2)));
};
const newestJob = () => runAs('ls', '-t', 'no_backup/jobs').trim().split(/\s+/)[0];
const newestPrint = () => {
  try {
    const job = newestJob();
    const hash = runAs('ls', '-t', `no_backup/jobs/${job}/out`).trim().split(/\s+/)[0] ?? '';
    return hash && runAs('ls', `no_backup/jobs/${job}/out/${hash}`).includes('print.pdf') ? hash : '';
  } catch {
    return '';
  }
};
/** Each picture's box on page 1 of the newest print file, in mm from the page's top-left: [x, y, w, h]. */
const boxesMm = () => {
  const job = newestJob();
  const hash = newestPrint();
  const pdf = adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${job}/out/${hash}/print.pdf`], {
    binary: true,
  });
  const text = Buffer.from(pdf).toString('latin1');
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map((m) => {
    const [a, b, c, d, e, f] = m.slice(1, 7).map(Number);
    const w = Math.abs(a) + Math.abs(c);
    const h = Math.abs(b) + Math.abs(d);
    return [e / MM, (A4H - f - h) / MM, w / MM, h / MM].map((v) => Math.round(v * 10) / 10);
  });
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
const share = async (mode) => {
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);
  await until(
    'Received or New files',
    () => has('Files received') || has('Start a new job') || has('Ready to print'),
    60_000,
  );
  if (has('Start a new job')) await tap('Start a new job');
};
/** Runs [expression] in the app's page (debug builds: WebView debugging) and returns its JSON result. */
async function evaluate(expression) {
  const pid = sh('pidof', PKG).trim().split(/\s+/)[0];
  adb(serial, ['forward', 'tcp:9335', `localabstract:webview_devtools_remote_${pid}`]);
  try {
    const pages = await (await fetch('http://127.0.0.1:9335/json')).json();
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
    adb(serial, ['forward', '--remove', 'tcp:9335']);
  }
}
/** An element's box on the phone's screen (px): the page's own box times the screen density, plus the page's offset. */
const onScreen = async (selector) => {
  const r = await evaluate(
    `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); const t = document.querySelector('main h1'); if (!e || !t) return null; const a = e.getBoundingClientRect(); const b = t.getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height, tx: b.x, ty: b.y, dpr: devicePixelRatio, title: t.textContent }; })())`,
  );
  if (!r) throw new Error(`${selector} is not on screen`);
  // Where the page sits on the screen: its title as Android sees it, against the title as the page sees it.
  const t = boundsOf(r.title);
  const ox = t ? t[0] - r.tx * r.dpr : 0;
  const oy = t ? t[1] - r.ty * r.dpr : 0;
  return { x: ox + r.x * r.dpr, y: oy + r.y * r.dpr, w: r.w * r.dpr, h: r.h * r.dpr };
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
await shot('01-home-edges-and-bar');

// 1. Word's Narrow margins, from the top-left: the first photo at 12.7 mm from the paper's top and left.
await share('six-photos');
await until('choices', () => has('All on one page'));
await tap('All on one page');
await until('Ready', () => has('Ready to print'));
await until('print file', () => newestPrint() !== '', 60_000);
await sleep(1500);
const first = boxesMm();
result.margins = { firstBoxMm: first[0] };
result.checks.narrowMarginFromTheTopLeft =
  !!first[0] && Math.abs(first[0][0] - 12.7) <= 0.3 && Math.abs(first[0][1] - 12.7) <= 0.3;
await shot('02-ready-narrow-top-left');

// 2. Press and hold photo 2, drag it down; it is printed where it was dropped and the others stay.
await tap('Adjust photos');
await until('Adjust', () => has('Photo 1 of 6'));
await sleep(1500);
const p2 = first[1];
const photo = await onScreen('.adjust-pick[data-item="2"]');
const paper = await onScreen('.adjust-paper figure');
const pxPerMm = paper.w / 210;
const [cx, cy] = [photo.x + photo.w / 2, photo.y + photo.h / 2];
const before = newestPrint();
await press(cx, cy, 800, cx, cy + 40 * pxPerMm, async () => shot('03-adjust-photo-lifted'));
await sleep(800);
await tap('Done');
await waitNewFile(before);
const moved = boxesMm();
// The print file lists pictures in drawing order, and the photo moved last is drawn last (on top): match by place.
const same = (a, b) => Math.abs(a[0] - b[0]) <= 0.2 && Math.abs(a[1] - b[1]) <= 0.2;
const added = moved.filter((m) => !first.some((b) => same(m, b)));
const dy = (added[0]?.[1] ?? 0) - p2[1];
result.place = { before: first, after: moved, photo2Now: added[0] ?? null };
result.checks.heldPhotoGoesWhereItIsDropped =
  added.length === 1 && dy > 30 && dy < 50 && Math.abs((added[0]?.[0] ?? 0) - p2[0]) <= 2.5;
result.checks.theOthersStay = first.filter((_, k) => k !== 1).every((b) => moved.some((m) => same(m, b)));
result.checks.movedPhotoPrintsOnTop = !!added[0] && same(moved[moved.length - 1] ?? [], added[0]);
await shot('04-ready-after-moving');

// 3. The crop frame (owner, round 3: the middle bars only): drag the top bar down (the magnifier shows while held);
// the photo is cropped from the top.
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
await tap('Crop');
await until('Crop', () => has('Crop photo'));
await sleep(1500);
const topBar = await onScreen('[aria-label="The top side"]');
{
  const [x, y] = [topBar.x + topBar.w / 2, topBar.y + topBar.h / 2];
  await press(x, y, 300, x + 60, y + 120, async () => shot('05-crop-magnifier'));
}
await sleep(800);
await shot('06-crop-top-bar');
const beforeCrop = newestPrint();
await tap('Done');
await until('Adjust', () => has('Photo'));
await tap('Done');
await waitNewFile(beforeCrop);
const job = newestJob();
{
  const saved = JSON.parse(runAs('cat', `no_backup/jobs/${job}/job.json`));
  const crop = saved.crops?.[1] ?? Object.values(saved.crops ?? {})[0];
  result.crop = { crop: crop ?? null, quads: saved.quads ?? null };
  // Dragged slanting, the top bar moved only down: a plain crop from the top, never a straightened frame.
  result.checks.topBarCropsFromTheTop = !!crop && crop.y > 0.02 && crop.x === 0 && !saved.quads;
}
await shot('07-ready-cropped');

// 3b. Word's crop: photo 3's right side dragged 20 mm in; placed by hand, its left side, top and height stay, and it
// prints 20 mm narrower (spec Part 5, sides to crop).
const sideBefore = boxesMm();
const third = sideBefore.find((b) => Math.abs(b[0] - 12.7) <= 0.3 && Math.abs(b[1] - 104.2) <= 0.3);
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
for (let i = 0; i < 6 && !has('Photo 3 of 6'); i++) {
  await tap('Next photo');
  await sleep(700);
}
await sleep(1200);
const sidePaper = await onScreen('.adjust-paper figure');
const side = await onScreen('.adjust-selected .adjust-side-r');
{
  const [x, y] = [side.x + side.w / 2, side.y + side.h / 2];
  await press(x, y, 150, x - 20 * (sidePaper.w / 210), y, async () => shot('07b-adjust-side-crop'));
}
await sleep(800);
const beforeSide = newestPrint();
await tap('Done');
await waitNewFile(beforeSide);
const sideAfter = boxesMm();
const cut = sideAfter.find((b) => Math.abs(b[0] - 12.7) <= 0.3 && Math.abs(b[1] - 104.2) <= 0.3);
result.side = { before: third ?? null, after: cut ?? null };
result.checks.sideCropKeepsTheOtherSidesAndCutsThatSide =
  !!third && !!cut && Math.abs(cut[3] - third[3]) <= 0.3 && Math.abs(third[2] - cut[2] - 20) <= 1.5;
await shot('07c-ready-side-cropped');

// 4. Add photos from Android's file manager: one synthetic photo in Download joins the open job.
const data = Buffer.alloc(400 * 300 * 4, 0x80);
writeFileSync(path.join(outDir, '.add-me.jpg'), jpeg.encode({ data, width: 400, height: 300 }, 85).data);
adb(serial, ['push', path.join(outDir, '.add-me.jpg'), '/sdcard/Download/ps-add-me.jpg']);
sh(
  'am',
  'broadcast',
  '-a',
  'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
  '-d',
  'file:///sdcard/Download/ps-add-me.jpg',
);
const filesBefore = runAs('ls', `no_backup/jobs/${job}/src`).trim().split(/\s+/).length;
const jobsBefore = runAs('ls', 'no_backup/jobs').trim().split(/\s+/).length;
await tap('Change');
await tap('Photos');
await until('Photos', () => has('Add photos'));
await tap('Add photos');
await until('source', () => has('Where are the photos?'));
await shot('08-where-are-the-photos');
await tap('From the file manager');
await sleep(3500);
await shot('09-file-manager');
const pick = boundsOf('ps-add-me.jpg');
if (pick) sh('input', 'tap', String((pick[0] + pick[2]) >> 1), String((pick[1] + pick[3]) >> 1));
await until('back on the list', () => has('Add photos'), 60_000).catch(() => {});
await sleep(2500);
const filesAfter = runAs('ls', `no_backup/jobs/${job}/src`).trim().split(/\s+/).length;
const jobsAfter = runAs('ls', 'no_backup/jobs').trim().split(/\s+/).length;
result.add = { picked: !!pick, filesBefore, filesAfter, jobsBefore, jobsAfter };
result.checks.addedFromTheFileManagerJoinsTheJob = !!pick && filesAfter === filesBefore + 1 && jobsAfter === jobsBefore;
await shot('10-photo-list-after-add');
sh('rm', '/sdcard/Download/ps-add-me.jpg');

// 5. The round corner on a passport sheet (owner, 2026-10-24: "resizes must be allowed for all sections that have
// photos in the preview"): dragged out a few mm, every photo prints bigger, its shape kept.
await share('single-photo');
await until('choices', () => has('Passport photos'));
await tap('Passport photos');
await until('face', () => has('Fit the face in the frame'));
await tap('Next');
await until('Ready', () => has('Ready to print'));
await until('print file', () => newestPrint() !== '', 60_000);
await sleep(1500);
const passBefore = boxesMm()[0];
await tap('Adjust passport photo');
await until('Adjust passport', () => labels().some((l) => l.startsWith('3.5 × 4.5 cm')));
await sleep(1200);
const passPaper = await onScreen('.adjust-paper figure');
const passCorner = await onScreen('.adjust-handle');
{
  const [x, y] = [passCorner.x + passCorner.w / 2, passCorner.y + passCorner.h / 2];
  const mm = passPaper.w / 210;
  await press(x, y, 150, x + 5 * mm, y + 5 * mm, async () => shot('11-passport-round-corner'));
}
await sleep(800);
const passShown = labels().find((l) => /^[\d.]+ × [\d.]+ cm/.test(l)) ?? '';
const beforePass = newestPrint();
await tap('Done');
await waitNewFile(beforePass);
const passAfter = boxesMm()[0];
result.passportCorner = { before: passBefore ?? null, shown: passShown, after: passAfter ?? null };
result.checks.roundCornerResizesPassportPhotos =
  !!passBefore &&
  !!passAfter &&
  passAfter[2] > passBefore[2] + 2 &&
  Math.abs(passAfter[2] / passAfter[3] - 35 / 45) < 0.01 &&
  !passShown.startsWith('3.5 × 4.5');
await shot('12-ready-passport-bigger');

writeFileSync(path.join(outDir, 'place-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
