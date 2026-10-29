// Phase 48 (owner, round 10: "What if some pages need to be printed in colour and some in black and white") on a real
// Android (emulator) at a phone's screen size: a four-page PDF (black lines; a red and a blue block on pages 2 and 4)
// shared from another app starts in Colour; "Choose pages in colour" makes the first guess from the engine's own page
// pictures (pages 2 and 4 stay Colour, 1 and 3 become Black & white); the print file holds pages drawn from grey data
// and two colour pictures with real colour in them, four pages in order; a tap changes one page; All black & white is
// a plain black & white print; All colour is the customer's own file again (same size in bytes).
// Test devices only (it clears the app's data and changes the screen size). Synthetic files only (the test sender).
// Usage: node scripts/device/round10-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round10-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const _WPS = ['cn.wps.moffice_eng', 'cn.wps.moffice_eng.xiaomi.lite', 'com.kingsoft.moffice_pro'];
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r10.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r10.xml');
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
const _jobJson = () => JSON.parse(runAs('cat', `no_backup/jobs/${newestJob()}/job.json`));
const _sources = () => runAs('ls', `no_backup/jobs/${newestJob()}/src`).trim().split(/\s+/);
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
  writeFileSync(
    file,
    adb(serial, ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${newestJob()}/out/${newestPrint()}/print.pdf`], {
      binary: true,
    }),
  );
  const read = await validatePdf(file);
  rmSync(file);
  return read;
};
const foreground = () => /mCurrentFocus=.*\{[^ ]+ [^ ]+ ([^/ ]+)/.exec(sh('dumpsys', 'window'))?.[1] ?? '';
const _home = async () => {
  if (foreground() !== PKG) sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await sleep(1000);
  await tap('Home');
  await sleep(1200);
  if (has('Leave this job?')) await tapExact('Leave');
  await until('Home', () => has('Recent jobs'), 15_000);
};
const send = (mode) =>
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);

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

// The print file's own pictures: how many pages are drawn from grey data (DeviceGray) and which colour pictures it holds.
const printFacts = () => {
  const pdf = adb(
    serial,
    ['exec-out', 'run-as', PKG, 'cat', `no_backup/jobs/${newestJob()}/out/${newestPrint()}/print.pdf`],
    {
      binary: true,
    },
  );
  const text = pdf.toString('latin1');
  const grey = (text.match(/\/DeviceGray/g) ?? []).length;
  const colourPictures = [];
  let at = 0;
  for (;;) {
    const start = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), at);
    if (start < 0) break;
    const end = pdf.indexOf(Buffer.from('endstream'), start);
    if (end < 0) break;
    try {
      const img = jpeg.decode(pdf.subarray(start, end), { useTArray: true, formatAsRGBA: true });
      let coloured = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 40) coloured++;
      }
      colourPictures.push(Math.round((coloured / (img.width * img.height)) * 1000) / 1000);
    } catch {
      // not a picture we can read
    }
    at = end;
  }
  return { bytes: pdf.length, greyPictures: grey, colourPictures };
};
const waitNewPrint = async (before) => {
  await until('a new print file', () => newestPrint() !== '' && newestPrint() !== before, 120_000);
  await sleep(1500);
};
/** Taps [t] once it sits in the clear part of the screen (not under the pinned bars), scrolling to it first. */
const tapClear = async (t, from = 'below') => {
  for (let i = 0; i < 14; i++) {
    const b = boundsOf(t);
    // An item scrolled out of the web page has empty bounds: it is somewhere below (the page was scrolled up past it
    // only when it has real bounds above the top).
    const shown = !!b && b[3] > b[1];
    if (shown && b[1] > H * 0.18 && b[3] < H * 0.74) {
      tapAt(b);
      return;
    }
    // Off the page both ways reads as empty bounds, so the caller says where [t] is: 'below' or 'above' the screen.
    const above = shown ? b[3] <= H * 0.18 + 1 : from === 'above';
    const [y0, y1] = above ? [0.35, 0.65] : [0.7, 0.45];
    sh('input', 'swipe', String(W >> 1), String(Math.round(H * y0)), String(W >> 1), String(Math.round(H * y1)), '300');
    await sleep(900);
  }
  throw new Error(`"${t}" not reachable`);
};
const summaryNow = () => pageText('.summary');
const untilSummary = (part) =>
  until(`the summary "${part}"`, async () => ((await summaryNow()) ?? '').includes(part), 60_000);

const result = { serial, checks: {} };
const size0 = sh('wm', 'size').trim();
const density0 = sh('wm', 'density').trim();
sh('pm', 'clear', PKG);
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
sh('settings', 'put', 'system', 'user_rotation', '0');
await sleep(3000);
try {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await until('first start', () => has('Welcome') || has('PrintSaathi'));
  if (has('Welcome')) {
    for (let i = 0; i < 3; i++) await tap('Next');
    await tap('Done');
  }
  await until('Home', () => has('Recent jobs'));

  // A four-page PDF: black lines on every page, a red and a blue block on pages 2 and 4.
  send('colour-pdf');
  await until('Ready', () => has('Ready to print'), 90_000);
  await until('a print file', () => newestPrint() !== '', 120_000);
  await untilSummary('4 pages');
  result.start = await summaryNow();
  result.checks.startsInColour = result.start === '1 PDF · 4 pages · A4 · Colour · 1 copy';
  const untouched = printFacts();
  result.untouched = untouched;
  await shot('01-ready-colour');

  // The first guess, from the engine's own page pictures: pages 2 and 4 have colour, 1 and 3 are plain.
  const before1 = newestPrint();
  await tap('Choose pages in colour');
  await untilSummary('2 colour, 2 black & white');
  await waitNewPrint(before1);
  result.guess = { summary: await summaryNow(), print: printFacts() };
  result.checks.guessGreysPlainPages =
    result.guess.summary === '1 PDF · 4 pages · A4 · 2 colour, 2 black & white · 1 copy' &&
    has('Page 1: Black & white') &&
    has('Page 2: Colour') &&
    has('Page 3: Black & white') &&
    has('Page 4: Colour');
  // The print file: two pages from grey data, two colour pictures with real colour in them, four pages in all.
  result.checks.printHoldsGreyAndColourPages =
    result.guess.print.greyPictures >= 2 &&
    result.guess.print.colourPictures.length === 2 &&
    result.guess.print.colourPictures.every((c) => c > 0.02);
  const read = await readPrint('r10-mixed');
  result.checks.fourPagesInOrder = read.pages === 4 && read.pageSizes.every((p) => Math.abs(p.widthPt - 595) < 2);
  await shot('02-chooser-guess');

  // A tap on a page changes that page.
  const before2 = newestPrint();
  await tapClear('Page 1: Black & white');
  await untilSummary('3 colour, 1 black & white');
  await waitNewPrint(before2);
  result.afterTap = { summary: await summaryNow(), print: printFacts() };
  result.checks.tapChangesThatPage =
    result.afterTap.print.colourPictures.length === 3 && result.afterTap.print.greyPictures >= 1;
  await shot('03-page-1-colour');

  // All black & white: a plain black & white print.
  const before3 = newestPrint();
  await tapClear('All black & white', 'above');
  await untilSummary('Black & white');
  await waitNewPrint(before3);
  result.allGrey = { summary: await summaryNow(), print: printFacts() };
  result.checks.allBlackAndWhiteIsPlainGrey =
    result.allGrey.summary === '1 PDF · 4 pages · A4 · Black & white · 1 copy' &&
    result.allGrey.print.colourPictures.length === 0;

  // All colour: every page in colour again — the customer's own file when nothing else changed.
  const before4 = newestPrint();
  await tapClear('All colour', 'above');
  await untilSummary('Colour · 1 copy');
  await waitNewPrint(before4);
  result.allColour = { summary: await summaryNow(), print: printFacts() };
  result.checks.allColourIsTheCustomersFile =
    result.allColour.summary === '1 PDF · 4 pages · A4 · Colour · 1 copy' &&
    result.allColour.print.bytes === untouched.bytes;
  await shot('04-all-colour');
} finally {
  sh('wm', 'size', size0.includes('Override') ? size0.split('Override size: ')[1] : 'reset');
  sh('wm', 'density', density0.includes('Override') ? density0.split('Override density: ')[1] : 'reset');
  sh('settings', 'put', 'system', 'accelerometer_rotation', '1');
}

writeFileSync(path.join(outDir, 'round10-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
