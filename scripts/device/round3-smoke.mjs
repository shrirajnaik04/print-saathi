// Phases 25-28 (owner, round 3) on a real Android (emulator): the ID card's back side added from the gallery through
// Android's photo picker (the owner's failing flow), the Colour | Black & white switch on Ready, a typed number of
// passport photos that needs a second sheet, and the round handle that turns a photo to any angle (read back from the
// print file by pdf.js). Test devices only (it clears the app's data). Synthetic pictures only, never a real card.
// Usage: node scripts/device/round3-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round3-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r3.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r3.xml');
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
const boundsOf = (t) =>
  boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="${t.replace(/&/g, '&amp;')}`).test(x)));
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
      String(Math.round(H * 0.75)),
      String(W >> 1),
      String(Math.round(H * 0.35)),
      '300',
    );
    await sleep(900);
  }
  throw new Error(`"${t}" not reachable`);
};
/** Taps [t] once it is scrolled clear of the pinned bar whose button reads [bar]. */
const tapAbovePinned = async (t, bar) => {
  for (let i = 0; i < 8; i++) {
    const b = boundsOf(t);
    const top = boundsOf(bar)?.[1] ?? H * 0.75;
    if (b && b[2] > b[0] && b[3] > b[1] && b[3] <= top) {
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
  throw new Error(`"${t}" not reachable above the pinned bar`);
};
const shot = async (name) => {
  await sleep(1200);
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
const newestJob = () => runAs('ls', '-t', 'no_backup/jobs').trim().split(/\s+/)[0];
const jobJson = () => JSON.parse(runAs('cat', `no_backup/jobs/${newestJob()}/job.json`));
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
const waitNewFile = async (before) => {
  await until('Ready', () => has('Ready to print'));
  await until(
    'a new print file',
    () => {
      const now = newestPrint();
      return now !== '' && now !== before;
    },
    90_000,
  );
  await sleep(1500);
};
const share = async (mode) => {
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);
  await until('Received or New files', () => has('Files received') || has('Start a new job'), 60_000);
  if (has('Start a new job')) {
    result.newFilesScreen = (result.newFilesScreen ?? 0) + 1;
    await tap('Start a new job');
  }
};
/** Runs [expression] in the app's page (debug builds: WebView debugging) and returns its JSON result. */
async function evaluate(expression) {
  const pid = sh('pidof', PKG).trim().split(/\s+/)[0];
  adb(serial, ['forward', 'tcp:9336', `localabstract:webview_devtools_remote_${pid}`]);
  try {
    const pages = await (await fetch('http://127.0.0.1:9336/json')).json();
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
    adb(serial, ['forward', '--remove', 'tcp:9336']);
  }
}
/** An element's box on the phone's screen (px): the page's own box times the screen density, plus the page's offset. */
const onScreen = async (selector, scroll = true) => {
  const r = await evaluate(
    `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(selector)}); const t = document.querySelector('main h1'); if (!e || !t) return null; if (${scroll}) e.scrollIntoView({ block: 'center' }); const a = e.getBoundingClientRect(); const b = t.getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height, tx: b.x, ty: b.y, dpr: devicePixelRatio, title: t.textContent }; })())`,
  );
  if (!r) throw new Error(`${selector} is not on screen`);
  const t = boundsOf(r.title);
  const ox = t ? t[0] - r.tx * r.dpr : 0;
  const oy = t ? t[1] - r.ty * r.dpr : 0;
  return { x: ox + r.x * r.dpr, y: oy + r.y * r.dpr, w: r.w * r.dpr, h: r.h * r.dpr };
};

/** A synthetic ID card photographed on a brown table (like the test sender's), front or back. */
function cardPhoto(front) {
  const [w, h] = [1600, 1200];
  const data = Buffer.alloc(w * h * 4);
  const [cx, cy, cw, ch] = [372, 330, 856, 540];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = [120, 82, 52];
      if (x >= cx && x < cx + cw && y >= cy && y < cy + ch) {
        const u = x - cx;
        const v = y - cy;
        c = [240, 240, 234];
        if (v < 86) c = front ? [235, 130, 40] : [60, 120, 200];
        else if (front && u >= 43 && u < 240 && v >= 130 && v < 430) c = [70, 70, 70];
        else if (u >= (front ? 290 : 60) && u < 790 && (v - 150) % 60 >= 0 && (v - 150) % 60 < 20 && v < 450)
          c = [70, 70, 70];
      }
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  return jpeg.encode({ data, width: w, height: h }, 90).data;
}
/** Puts a picture in the phone's gallery (Pictures), indexed so the photo picker lists it first (newest). */
const toGallery = async (name, bytes) => {
  const local = path.join(outDir, `.${name}`);
  writeFileSync(local, bytes);
  adb(serial, ['push', local, `/sdcard/Pictures/${name}`]);
  rmSync(local);
  sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Pictures/${name}`);
  await sleep(3000);
};
/** Android's photo picker: taps the newest photo (single choice returns at once). */
const pickNewest = async () => {
  await until(
    'the photo picker',
    () => nodes().some((n) => /resource-id="[^"]*icon_thumbnail"|content-desc="Photo taken/.test(n)),
    30_000,
  );
  await shot(`picker-${Date.now()}`);
  const first = nodes().find((n) => /resource-id="[^"]*icon_thumbnail"|content-desc="Photo taken/.test(n));
  const b = boundsIn(first);
  if (!b) throw new Error('no photo in the picker');
  tapAt(b);
  await sleep(1500);
  // A picker that takes several photos only ticks it: its own "Add (1)" / "Done" button sends it (never the app's
  // "Add the back side").
  const confirm = boundsIn(
    nodes().find((n) => /text="(Add|Done)\b/.test(n) && /package="[^"]*providers\.media/.test(n)),
  );
  if (confirm) tapAt(confirm);
};

/** Round 4: the side's crop screen, if it shows (it does for every side from a photo): Done keeps the found frame. */
const throughCrop = async (name) => {
  await until(name, () => has(name) || /ID cards? found/.test(labels().join('|')), 60_000);
  if (has(name)) await tap('Done');
};

const result = { serial, checks: {} };
sh('pm', 'clear', PKG);
sh('rm -f /sdcard/Pictures/ps-r3-*.jpg');
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));
await shot('01-home-card-edges');

// 1. Item 2: an ID card's back side added from the gallery after the front (the owner's failing flow).
await toGallery('ps-r3-front.jpg', cardPhoto(true));
await tap('Aadhaar & ID cards');
await until('Where is the card?', () => has('Where is the card?'));
await tap('Photos of the card');
await pickNewest();
// Round 4: each side from a photo is fitted on its crop screen first.
await throughCrop('Front of the card');
await until('the front', () => has('1 ID card found') || has('2 ID cards found') || has("Couldn't find"), 60_000);
result.front = labels().find((l) => /ID cards? found|Couldn't find/.test(l));
result.oneSideNote = has('Only the front will print.');
await shot('02-front-only');
await toGallery('ps-r3-back.jpg', cardPhoto(false));
await tapAbovePinned('Add the back side', 'Card copy');
await until('Where is the back side?', () => has('Where is the back side?'));
await tap('From the gallery');
await pickNewest();
await throughCrop('Back of the card');
await until('the back too', () => has('2 ID cards found'), 60_000).catch(() => {});
result.afterBack = labels().find((l) => /ID cards? found|Couldn't find/.test(l));
await shot('03-front-and-back');
result.checks.backSideAddedFromTheGallery =
  result.front === '1 ID card found' && result.oneSideNote && result.afterBack === '2 ID cards found';

// 2. Item 5: every job starts in colour; Ready's switch prints in black & white and back in one tap each.
await tap('Card copy');
await until('How big?', () => has('Real card size'));
await tap('Real card size');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await sleep(1500);
const startsIn = jobJson().colour;
await shot('04-ready-colour');
let before = newestPrint();
// Round 4: beside the title the half reads "B&W" (Android names it by that text).
await tap(has('B&W') ? 'B&W' : 'Black & white');
await waitNewFile(before);
const bw = jobJson().colour;
// Ready's line names it (grey pixels themselves: PlanRenderDeviceTest "a black and white print holds only grey pixels").
const bwSummary = labels().some((l) => /· Black & white ·/.test(l));
await shot('05-ready-black-and-white');
before = newestPrint();
await tap('Colour');
await waitNewFile(before);
const back = jobJson().colour;
const colourSummary = labels().some((l) => /· Colour ·/.test(l));
result.colour = { startsIn, afterBlackAndWhite: bw, afterColour: back };
result.checks.startsInColourAndTheSwitchFlipsIt =
  startsIn === 'colour' && bw === 'bw' && back === 'colour' && bwSummary && colourSummary;

// 3. Item 3: 40 passport photos typed: more than one A4 sheet holds (30), so a second sheet is added.
await share('single-photo');
await tap('Passport photos');
await until('face', () => has('Fit the face in the frame'));
await tap('Next');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await tap('Change');
await tap('How many photos?');
await until('How many?', () => has('Or type a number'));
const field = boundsOf('Or type a number');
// The box is under its label: tap just below the label's own line.
const input = nodes().find((n) => /class="android.widget.EditText"/.test(n));
tapAt(boundsIn(input) ?? field);
await sleep(800);
sh('input', 'text', '40');
sh('input', 'keyevent', '66');
await sleep(1500);
await shot('06-typed-40');
before = newestPrint();
// Done on the count: back on Ready (through Change, if it shows).
await tap('Done');
await until('Ready or Change', () => has('Ready to print') || has('How many photos? 40'));
if (!has('Ready to print')) await tap('Done');
await waitNewFile(before);
const pages = (
  Buffer.from(printBytes())
    .toString('latin1')
    .match(/\/Type \/Page\b/g) ?? []
).length;
result.passport = { count: jobJson().passport?.count, pages };
await shot('07-ready-40-passport');
result.checks.typedCountFlowsOntoASecondSheet = result.passport.count === 40 && pages === 2;

// 4. Item 6 (+7): the round handle above a photo on Adjust's big preview turns it; the print file draws it there.
await share('single-photo');
await tap('One on each page');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await tap('Adjust photos');
await until('Adjust', () => has('Photo 1 of 1'));
await sleep(1500);
await shot('08-adjust-big-preview');
// The photo scrolled to the middle once; then the handle, measured without scrolling again (its place is current).
const photo = await onScreen('.adjust-pick[data-item="1"]');
const handle = await onScreen('.adjust-rotate', false);
{
  const [hx, hy] = [handle.x + handle.w / 2, handle.y + handle.h / 2];
  const [cx, cy] = [photo.x + photo.w / 2, photo.y + photo.h / 2];
  const r = Math.hypot(hx - cx, hy - cy);
  const from = Math.atan2(hy - cy, hx - cx);
  sh('input', 'motionevent', 'DOWN', String(Math.round(hx)), String(Math.round(hy)));
  await sleep(120);
  for (let k = 1; k <= 12; k++) {
    const a = from + ((15 * k) / 12) * (Math.PI / 180);
    sh(
      'input',
      'motionevent',
      'MOVE',
      String(Math.round(cx + r * Math.cos(a))),
      String(Math.round(cy + r * Math.sin(a))),
    );
  }
  await shot('09-turning');
  const a = from + 15 * (Math.PI / 180);
  sh('input', 'motionevent', 'UP', String(Math.round(cx + r * Math.cos(a))), String(Math.round(cy + r * Math.sin(a))));
}
await sleep(1500);
await tap('Tilt right');
await sleep(1500);
await shot('10-turned');
const tilt = jobJson().tilts?.['1'];
before = newestPrint();
await tap('Done');
await waitNewFile(before);
const pdfPath = path.join(outDir, 'turned-photo.pdf');
writeFileSync(pdfPath, printBytes());
const read = await validatePdf(pdfPath);
const box = read.pageSizes[0]?.imageBoxes[0];
result.turned = { tilt, angle: box?.angle, outline: box ? { w: box.w, h: box.h } : null };
await shot('11-ready-turned');
// About 16° clockwise (15° by hand, 1° by button): the PDF angle is anticlockwise, so near 344°.
result.checks.roundHandleTurnsThePhotoInThePrintFile =
  typeof tilt === 'number' && tilt > 13 && tilt < 19 && !!box && Math.abs(box.angle - (360 - tilt)) <= 0.1;
rmSync(pdfPath);

sh('rm -f /sdcard/Pictures/ps-r3-*.jpg');
writeFileSync(path.join(outDir, 'round3-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
