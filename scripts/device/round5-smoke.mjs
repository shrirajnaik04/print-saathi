// Phases 33-36 (owner, round 5) on a real Android (emulator): back from Android's print screen, PRINT works again at
// once; no hint line; a finger slide does not change Adjust's page, ‹ › do; Copy, the + mark and Paste make a copy of
// the same file; an ID card held and dragged prints where it was dropped, and side by side prints in one row (both
// read back from the print file by pdf.js); Delete all jobs empties Recent jobs and the jobs folder.
// Test devices only (it clears the app's data). Synthetic pictures only, never a real card.
// Usage: node scripts/device/round5-smoke.mjs <serial> <outDir>
// Helpers as in round4-smoke.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round5-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r5.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r5.xml');
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
    // A button in a row that scrolls sideways (Adjust's tools): brought into view first.
    if (i === 1)
      await evaluate(
        `JSON.stringify(!!([...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()).startsWith(${JSON.stringify(t)}))?.scrollIntoView({ block: 'nearest', inline: 'center' }) ?? 0))`,
      ).catch(() => null);
    if (i === 1) await sleep(600);
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

const result = { serial, checks: {} };
const MM = 72 / 25.4;
/** Where a page element is on the phone's screen (px), from the page's own box and the title's place. */
const onScreen = async (selector, index = 0) => {
  const r = await evaluate(
    `JSON.stringify((() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; const t = document.querySelector('main h1'); if (!e || !t) return null; const a = e.getBoundingClientRect(); const b = t.getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height, tx: b.x, ty: b.y, dpr: devicePixelRatio, title: t.textContent }; })())`,
  );
  if (!r) throw new Error(`${selector} is not on screen`);
  const tb = boundsOf(r.title);
  const ox = tb ? tb[0] - r.tx * r.dpr : 0;
  const oy = tb ? tb[1] - r.ty * r.dpr : 0;
  return { x: ox + r.x * r.dpr, y: oy + r.y * r.dpr, w: r.w * r.dpr, h: r.h * r.dpr, dpr: r.dpr };
};
const printBoxes = async (name) => {
  const pdf = path.join(outDir, `${name}.pdf`);
  writeFileSync(pdf, printBytes());
  const read = await validatePdf(pdf);
  rmSync(pdf);
  return (read.pageSizes[0]?.imageBoxes ?? []).map((b) => ({ x: b.x / MM, y: b.y / MM, w: b.w / MM, h: b.h / MM }));
};
const toReady = async () => {
  const before = newestPrint();
  await tap('Done');
  await until('Ready', () => has('Ready to print'), 30_000);
  await until('a new print file', () => newestPrint() !== '' && newestPrint() !== before, 90_000);
  await sleep(1500);
};

sh('pm', 'clear', PKG);
sh('rm -f /sdcard/Pictures/ps-r5-*.jpg');
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));

// 36a. Back from Android's print screen: PRINT works again at once, still on Ready.
await share('single-photo');
await tap('One on each page');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await sleep(1500);
await tap('PRINT');
await until(
  "Android's print screen",
  () => /printspooler/i.test(sh('dumpsys', 'activity', 'activities').match(/topResumedActivity[^\n]*/)?.[0] ?? ''),
  30_000,
);
await sleep(2500);
await shot('01-print-screen');
const backAt = Date.now();
back();
let printBack = null;
for (let i = 0; i < 20 && !printBack; i++) {
  await sleep(250);
  const s = await evaluate(
    `JSON.stringify((() => { const b = [...document.querySelectorAll('button')].find((x) => /PRINT$/.test(x.textContent.trim())); return b ? { text: b.textContent.trim(), disabled: b.disabled, title: document.querySelector('main h1')?.textContent } : null; })())`,
  ).catch(() => null);
  if (s && !s.disabled && s.text === 'PRINT') printBack = { ...s, ms: Date.now() - backAt };
}
result.printBack = printBack;
await shot('02-back-from-print-screen');
result.checks.backFromPrintScreenPrintAtOnce =
  !!printBack && printBack.title === 'Ready to print' && printBack.ms <= 2500;

// 33c + 34a + 33a, on a phone-shaped screen (the tablet turned upright).
const rotation = {
  acc: sh('settings', 'get', 'system', 'accelerometer_rotation').trim(),
  user: sh('settings', 'get', 'system', 'user_rotation').trim(),
};
sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
sh('settings', 'put', 'system', 'user_rotation', '1');
await sleep(3000);
if (W > H) [W, H] = [H, W];
try {
  await tap('Home');
  await sleep(1200);
  if (has('Leave this job?')) await tapExact('Leave');
  await until('Home', () => has('Recent jobs'), 15_000);
  await share('six-photos');
  await tap('One on each page');
  await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1500);
  await shot('03-adjust-no-hint');
  result.checks.noHintLine = !labels().some((l) => /^Tap a photo to choose it/.test(l));
  // A finger sliding sideways over the page does nothing; ‹ › move it at once.
  const strip = await onScreen('.adjust-strip');
  const y = Math.round(strip.y + strip.h * 0.55);
  sh(
    'input',
    'swipe',
    String(Math.round(strip.x + strip.w * 0.8)),
    String(y),
    String(Math.round(strip.x + strip.w * 0.15)),
    String(y),
    '250',
  );
  await sleep(1500);
  const afterSwipe = await pageText('.adjust-page');
  const t0 = Date.now();
  await tap('Show next page');
  let arrow = '';
  for (let i = 0; i < 10 && !/^Page 2 of 6/.test(arrow); i++) {
    arrow = (await pageText('.adjust-page')) ?? '';
    if (!/^Page 2 of 6/.test(arrow)) await sleep(100);
  }
  // Wall time includes adb and the debug connection per read (each a few hundred ms); the e2e test times the app.
  result.pages = { afterSwipe, arrow, msWithAdbReads: Date.now() - t0 };
  result.checks.swipeDoesNothingArrowsMove = /^Page 1 of 6/.test(afterSwipe ?? '') && /^Page 2 of 6/.test(arrow);
  await shot('04-after-arrow');
  // Copy, a tap on an empty spot (the + mark), Paste: a copy on page 2, the job one photo bigger, no file copied.
  const before = jobJson();
  await tap('Copy');
  await sleep(800);
  const paper = await onScreen('.adjust-sheet[data-page="1"] figure');
  // Below the lowest photo on page 2 (CSS px from the page's top), above the tool row pinned at the bottom.
  const below = await evaluate(
    `JSON.stringify((() => { const f = document.querySelector('.adjust-sheet[data-page="1"] figure').getBoundingClientRect(); return Math.max(...[...document.querySelectorAll('.adjust-sheet[data-page="1"] .adjust-pick')].map((e) => e.getBoundingClientRect().bottom)) - f.top; })())`,
  );
  const bar = await onScreen('.actionbar');
  const markY = Math.round((paper.y + below * paper.dpr + Math.min(paper.y + paper.h, bar.y)) / 2);
  sh('input', 'tap', String(Math.round(paper.x + paper.w / 2)), String(markY));
  await sleep(1000);
  // Owner, round 7: the mark is a line ("Paste goes to the line.").
  const marked = has('Paste goes to the line.');
  await shot('05-mark');
  // Paste sits past the tools on screen since round 7: brought into view, then a real tap.
  await evaluate(
    `JSON.stringify(!![...document.querySelectorAll('.actionbar button')].find((b) => b.textContent.trim() === 'Paste')?.scrollIntoView({ block: 'nearest', inline: 'center' }))`,
  );
  await sleep(800);
  await tapExact('Paste');
  await sleep(2000);
  const after = jobJson();
  const copy = after.items.find((i) => !before.items.some((b) => b.index === i.index));
  result.copy = {
    marked,
    items: after.items.length,
    copyOf: copy?.copyOf,
    samePath: copy?.path === before.items.find((i) => i.index === copy?.copyOf)?.path,
  };
  result.checks.copyPasteWithTheMark =
    marked && after.items.length === before.items.length + 1 && copy?.copyOf !== undefined && result.copy.samePath;
  await shot('06-pasted');
  await toReady();
  const pages = (
    Buffer.from(printBytes())
      .toString('latin1')
      .match(/\/Type \/Page\b/g) ?? []
  ).length;
  result.copy.printPages = pages;
} finally {
  sh('settings', 'put', 'system', 'user_rotation', rotation.user === 'null' ? '0' : rotation.user);
  sh('settings', 'put', 'system', 'accelerometer_rotation', rotation.acc === 'null' ? '1' : rotation.acc);
  if (H > W) [W, H] = [H, W];
}

// 35: ID cards held and dragged, and side by side, read back from the print file.
await tap('Home');
await sleep(1200);
if (has('Leave this job?')) await tapExact('Leave');
await until('Home', () => has('Recent jobs'), 15_000);
await share('card-photos');
await tap('ID card copy');
// Each card's side bars first (owner, round 4): Done on the front, then on the back.
for (const side of ['Front of the card', 'Back of the card']) {
  await until(side, () => has(side), 60_000);
  await sleep(1000);
  await tapExact('Done');
  await sleep(1500);
}
await until('both found', () => has('2 ID cards found'), 60_000);
await tap('Card copy');
await until('How big?', () => has('Real card size'));
await tap('Real card size');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await sleep(1500);
const auto = await printBoxes('cards-auto');
await tap('Adjust cards');
await until('Adjust', () => has('Card 1 of 2'));
await sleep(1500);
const pick = await onScreen('.adjust-sheet[data-page="0"] .adjust-pick', 1);
const [cx, cy] = [Math.round(pick.x + pick.w / 2), Math.round(pick.y + pick.h / 2)];
sh('input', 'motionevent', 'DOWN', String(cx), String(cy));
await sleep(900);
for (let k = 1; k <= 10; k++) sh('input', 'motionevent', 'MOVE', String(cx + 12 * k), String(cy + 6 * k));
sh('input', 'motionevent', 'UP', String(cx + 120), String(cy + 60));
await sleep(1500);
await shot('07-card-dragged');
const spots = jobJson().idCard?.spots;
await toReady();
const dragged = await printBoxes('cards-dragged');
result.cards = { auto, dragged, spots };
const moved = dragged.some((d) => !auto.some((a) => Math.abs(a.x - d.x) < 0.5 && Math.abs(a.y - d.y) < 0.5));
result.checks.aCardHeldAndDraggedPrintsThere = !!spots && Object.keys(spots).length === 1 && moved;
await tap('Adjust cards');
await until('Adjust', () => has('Card 1 of 2'));
await tap('Side by side');
await sleep(1200);
await shot('08-side-by-side');
await toReady();
const row = await printBoxes('cards-row');
result.cards.row = row;
const mids = row.map((b) => b.y + b.h / 2);
result.checks.sideBySideInThePrintFile = row.length === 2 && Math.abs((mids[0] ?? 0) - (mids[1] ?? 9)) < 0.5;

// 36b: Delete all jobs on Recent jobs.
await tap('Home');
await sleep(1200);
if (has('Leave this job?')) await tapExact('Leave');
await until('Home', () => has('Recent jobs'), 15_000);
await tap('Recent jobs');
await until('Recent jobs', () => has('Delete all jobs'), 15_000);
await tap('Delete all jobs');
await until('the question', () => has('Delete all jobs?'), 10_000);
await shot('09-delete-all-question');
await tapExact('Delete all');
await until('empty', () => has('No jobs yet.'), 15_000);
const left = runAs('ls', 'no_backup/jobs').trim();
result.deleteAll = { jobsLeft: left };
result.checks.deleteAllEmptiesRecentAndTheJobsFolder = left === '';
await shot('10-recent-empty');

writeFileSync(path.join(outDir, 'round5-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
