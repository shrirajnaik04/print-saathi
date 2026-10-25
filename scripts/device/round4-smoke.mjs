// Phases 29-32 (owner, round 4) on a real Android (emulator): leaving a job and closing the app ask first; Home has no
// WhatsApp card; Ready's Colour | B&W sits by its title and glossy paper is reminded; an ID card's sides each pass
// through their crop screen, a side's photo is changed from the gallery and a side turned a quarter prints standing
// (read back from the print file by pdf.js); Adjust's compact tools, the pages slid by a real finger, and zoom.
// Test devices only (it clears the app's data). Synthetic pictures only, never a real card.
// Usage: node scripts/device/round4-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round4-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r4.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r4.xml');
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
const until = async (what, test, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return;
    await sleep(800);
  }
  throw new Error(`timed out waiting for ${what}`);
};
let [W, H] = (
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
      String(Math.round(H * 0.7)),
      String(W >> 1),
      String(Math.round(H * 0.4)),
      '300',
    );
    await sleep(900);
  }
  throw new Error(`"${t}" not reachable`);
};
/** Taps the control labelled exactly [t] ("Leave", not the question "Leave this job?" above it). */
const tapExact = async (t) => {
  const b = boundsIn(nodes().find((x) => new RegExp(`(?:text|content-desc)="${esc(t)}"`).test(x)));
  if (!b) throw new Error(`"${t}" not on screen`);
  tapAt(b);
};
const back = () => sh('input', 'keyevent', 'KEYCODE_BACK');
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
const share = async (mode) => {
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);
  await until('Received or New files', () => has('Files received') || has('Start a new job'), 60_000);
  if (has('Start a new job')) await tap('Start a new job');
};
/** Runs [expression] in the app's page (debug builds: WebView debugging) and returns its JSON result. */
async function evaluate(expression) {
  const pid = sh('pidof', PKG).trim().split(/\s+/)[0];
  adb(serial, ['forward', 'tcp:9337', `localabstract:webview_devtools_remote_${pid}`]);
  try {
    const pages = await (await fetch('http://127.0.0.1:9337/json')).json();
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
    adb(serial, ['forward', '--remove', 'tcp:9337']);
  }
}
const pageText = (sel) =>
  evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null)`);

/** A synthetic ID card photographed on a table: [band] is the card's top band colour (each photo its own). */
function cardPhoto(band) {
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
        if (v < 86) c = band;
        else if (u >= 43 && u < 240 && v >= 130 && v < 430) c = [70, 70, 70];
        else if (u >= 290 && u < 790 && (v - 150) % 60 >= 0 && (v - 150) % 60 < 20 && v < 450) c = [70, 70, 70];
      }
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  return jpeg.encode({ data, width: w, height: h }, 90).data;
}
const toGallery = async (name, bytes) => {
  const local = path.join(outDir, `.${name}`);
  writeFileSync(local, bytes);
  adb(serial, ['push', local, `/sdcard/Pictures/${name}`]);
  rmSync(local);
  sh('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Pictures/${name}`);
  await sleep(3000);
};
/** Android's photo picker: the newest photo (a picker for several only ticks it: its own Add / Done sends it). */
const pickNewest = async () => {
  await until(
    'the photo picker',
    () => nodes().some((n) => /resource-id="[^"]*icon_thumbnail"|content-desc="Photo taken/.test(n)),
    30_000,
  );
  const first = nodes().find((n) => /resource-id="[^"]*icon_thumbnail"|content-desc="Photo taken/.test(n));
  const b = boundsIn(first);
  if (!b) throw new Error('no photo in the picker');
  tapAt(b);
  await sleep(1500);
  const confirm = boundsIn(
    nodes().find((n) => /text="(Add|Done)\b/.test(n) && /package="[^"]*providers\.media/.test(n)),
  );
  if (confirm) tapAt(confirm);
};
const title = () => pageText('main h1');

const result = { serial, checks: {} };
sh('pm', 'clear', PKG);
sh('rm -f /sdcard/Pictures/ps-r4-*.jpg');
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));
await shot('01-home');

// 31c. Home has no WhatsApp card.
result.checks.homeHasNoWhatsAppCard = !labels().some((l) => /Customer sent files on WhatsApp/.test(l));

// 31b. Back on Home asks; Stay keeps the app open.
back();
await until('Close PrintSaathi?', () => has('Close PrintSaathi?'), 15_000);
await shot('02-close-question');
const exitChoices = ['Stay', 'Close the app'].every((c) => has(c));
await tap('Stay');
await sleep(1500);
const stayed = !has('Close PrintSaathi?') && has('Recent jobs') && sh('pidof', PKG).trim() !== '';
result.checks.backOnHomeAsksAndStayStays = exitChoices && stayed;

// 29. ID card from two shared photos: each side through its crop screen (Front, then Back), then both found.
await share('card-photos');
await tap('ID card copy');
const crops = [];
for (const want of ['Front of the card', 'Back of the card']) {
  await until(want, () => has(want), 60_000);
  crops.push(want);
  await shot(`03-crop-${crops.length}`);
  await tap('Done');
  await sleep(1500);
}
await until('both found', () => has('2 ID cards found'), 60_000).catch(() => {});
result.cropChain = crops;
result.checks.eachSidePassesItsCropScreen = crops.length === 2 && has('2 ID cards found');
await shot('04-cards-found');

// 29. Change photo (Front) from the gallery: the new photo's crop screen, then it is the front.
const frontBefore = jobJson().idCard?.cards?.[0]?.item;
await toGallery('ps-r4-new-front.jpg', cardPhoto([40, 160, 90]));
await tap('Change photo (Front)');
await until('Where is the new photo?', () => has('Where is the new photo?'));
await tap('From the gallery');
await pickNewest();
await until('its crop screen', () => has('Front of the card'), 60_000);
await shot('05-changed-photo-crop');
await tap('Done');
await until('back on the cards', () => has('2 ID cards found'), 60_000).catch(() => {});
const afterChange = jobJson();
const frontAfter = afterChange.idCard?.cards?.[0]?.item;
result.changePhoto = { frontBefore, frontAfter, items: afterChange.items.map((i) => i.index) };
result.checks.changePhotoReplacesTheFront =
  frontAfter !== undefined &&
  frontAfter !== frontBefore &&
  !afterChange.items.some((i) => i.index === frontBefore) &&
  has('2 ID cards found');
await shot('06-front-changed');

// 29. Turn right (Front): a quarter turn; Real card size prints that side standing, 54 × 85.6 mm ± 0.5 mm.
await tap('Turn right (Front)');
await sleep(1500);
const turns = jobJson().idCard?.cards?.[0]?.turns;
await tap('Card copy');
await until('How big?', () => has('Real card size'));
await tap('Real card size');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await sleep(2000);
await shot('07-ready-card-standing');
const cardPdf = path.join(outDir, 'card-standing.pdf');
writeFileSync(cardPdf, printBytes());
const read = await validatePdf(cardPdf);
rmSync(cardPdf);
const MM = 72 / 25.4;
const boxes = (read.pageSizes[0]?.imageBoxes ?? []).map((b) => ({
  wMm: +(b.w / MM).toFixed(2),
  hMm: +(b.h / MM).toFixed(2),
}));
result.card = { turns, boxes };
const near = (a, b) => Math.abs(a - b) <= 0.5;
result.checks.turnedSidePrintsStanding =
  turns === 1 &&
  boxes.some((b) => near(b.wMm, 54) && near(b.hMm, 85.6)) &&
  boxes.some((b) => near(b.wMm, 85.6) && near(b.hMm, 54));

// 32a. Colour | B&W beside Ready's title (above the summary line).
const colourB = boundsOf('Colour');
const summaryB = boundsIn(nodes().find((n) => /(?:text|content-desc)="ID card · real size/.test(n)));
result.colourSwitch = { colour: colourB, summary: summaryB };
result.checks.colourSwitchIsByTheTitle = !!colourB && !!summaryB && colourB[3] <= summaryB[1];

// 32b. Paper type: Glossy photo paper → the reminder on Ready, and PRINT says the paper is loaded.
await tap('Change');
await tap('Paper type');
await until('Which paper?', () => has('Which paper is in the printer?'));
await tap('Glossy photo paper');
await until('Ready', () => has('Ready to print'), 30_000);
await sleep(1500);
await shot('08-glossy-reminder');
result.checks.glossyIsReminded =
  has('Put glossy photo paper in the printer.') && has('PAPER LOADED — PRINT') && jobJson().paperType === 'glossy';

// 31a. Leaving the job asks: Keep working stays; Back inside the job does not ask; Back out of the job's first screen
// asks; Leave goes Home with the job kept (Continue).
await tap('Home');
await until('Leave this job?', () => has('Leave this job?'), 15_000);
await shot('09-leave-question');
const leave = { choices: ['Keep working', 'Leave', 'Delete this job'].every((c) => has(c)) };
await tap('Keep working');
await sleep(1200);
leave.keptOnReady = has('Ready to print') && !has('Leave this job?');
back();
await sleep(1500);
leave.backInsideTheJobDoesNotAsk = has('How big?') && !has('Leave this job?');
for (let i = 0; i < 8 && !has('Leave this job?'); i++) {
  back();
  await sleep(1500);
}
leave.backOutOfTheJobAsks = has('Leave this job?');
await shot('10-back-out-of-the-job');
await tapExact('Leave');
await until('Home', () => has('Recent jobs'), 15_000);
leave.leftWithTheJobKept = has('Continue the last job');
result.leave = leave;
result.checks.leavingAsksKeepWorkingStays = Object.values(leave).every(Boolean);
await shot('11-left-to-home');

// 30. Adjust on a phone-shaped screen (the tablet turned upright): compact tools, the pages slid by a real finger (the
// first photo on that page is chosen), zoom, and a finger panning the zoomed page.
const rotation = {
  acc: sh('settings', 'get', 'system', 'accelerometer_rotation').trim(),
  user: sh('settings', 'get', 'system', 'user_rotation').trim(),
};
sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
sh('settings', 'put', 'system', 'user_rotation', '1');
await sleep(3000);
if (W > H) [W, H] = [H, W];
try {
  await share('six-photos');
  await tap('One on each page');
  await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1500);
  await shot('12-adjust-pages-strip-upright');
  const tools = await evaluate(
    `JSON.stringify(Array.from(document.querySelectorAll('.actionbar .tool-row .btn, .adjust-body .tool-grid .btn')).map((b) => ({ name: b.getAttribute('aria-label') || b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })))`,
  );
  result.tools = tools;
  result.checks.toolsAreCompact =
    tools.length > 4 &&
    tools[0]?.name === 'Zoom out' &&
    tools[1]?.name === 'Zoom in' &&
    tools.every((t) => t.h >= 56 && t.h <= 64 && t.w >= 56);
  // Where the strip is on the screen (px): the page's box times the density, plus the page's offset (the title's).
  const strip = await evaluate(
    `JSON.stringify((() => { const s = document.querySelector('.adjust-strip').getBoundingClientRect(); const n = document.querySelector('.adjust-sheet[data-page="1"]').getBoundingClientRect(); const t = document.querySelector('main h1').getBoundingClientRect(); return { x: s.x, y: s.y, w: s.width, h: s.height, nextLeft: n.x, tx: t.x, ty: t.y, dpr: devicePixelRatio, vw: innerWidth, title: document.querySelector('main h1').textContent }; })())`,
  );
  const tb = boundsOf(strip.title);
  const ox = tb ? tb[0] - strip.tx * strip.dpr : 0;
  const oy = tb ? tb[1] - strip.ty * strip.dpr : 0;
  // The next page's edge shows at the right side (CSS px of it on screen).
  result.peek = Math.round(strip.vw - strip.nextLeft);
  result.checks.theNextPageShowsAtTheSide = result.peek >= 4 && result.peek <= 40;
  const midY = Math.round(oy + (strip.y + strip.h * 0.55) * strip.dpr);
  const xAt = (f) => String(Math.round(ox + (strip.x + strip.w * f) * strip.dpr));
  // Owner, round 5: pages move with ‹ › only (a finger slide no longer does; round5-smoke checks that).
  await tap('Show next page');
  await sleep(1500);
  const afterNext = { label: await pageText('.adjust-page'), title: await title() };
  result.next = afterNext;
  result.checks.nextPageGoesToPage2 = afterNext.label === 'Page 2 of 6' && afterNext.title === 'Photo 2 of 6';
  await shot('13-after-next-page');
  const paperW = () =>
    evaluate(`JSON.stringify(document.querySelector('.adjust-paper figure').getBoundingClientRect().width)`);
  const w100 = await paperW();
  await tap('Zoom in');
  await sleep(800);
  await tap('Zoom in');
  await sleep(1500);
  const zoomed = { label: await pageText('.adjust-page'), ratio: +((await paperW()) / w100).toFixed(3) };
  result.zoom = zoomed;
  await shot('14-zoomed-200');
  result.checks.zoomInTwiceIs200 = zoomed.label === 'Page 2 of 6 · 200 %' && Math.abs(zoomed.ratio - 2) < 0.02;
  // Zoomed, a finger pans the page (it no longer slides to another page): sideways, then up.
  const scrollOf = () =>
    evaluate(
      `JSON.stringify({ left: document.querySelector('.adjust-strip').scrollLeft, top: document.querySelector('.adjust-strip').scrollTop, label: document.querySelector('.adjust-page').textContent.trim() })`,
    );
  const before = await scrollOf();
  sh('input', 'swipe', xAt(0.7), String(midY), xAt(0.3), String(midY), '400');
  await sleep(1200);
  sh('input', 'swipe', xAt(0.5), String(midY + 200), xAt(0.5), String(midY - 200), '400');
  await sleep(1500);
  const panned = await scrollOf();
  result.zoomPan = { before, after: panned };
  result.checks.zoomedAFingerPansThePage =
    panned.left > before.left + 20 && panned.top > before.top + 20 && panned.label === 'Page 2 of 6 · 200 %';
  await shot('15-zoomed-panned');
} finally {
  sh('settings', 'put', 'system', 'user_rotation', rotation.user === 'null' ? '0' : rotation.user);
  sh('settings', 'put', 'system', 'accelerometer_rotation', rotation.acc === 'null' ? '1' : rotation.acc);
}

sh('rm -f /sdcard/Pictures/ps-r4-*.jpg');
writeFileSync(path.join(outDir, 'round4-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
