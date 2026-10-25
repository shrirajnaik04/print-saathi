// Phases 37-38 (owner, round 6) on a real Android (emulator): a photo dragged, then Undo (the automatic layout back) and
// Redo (the drag again); with the dragged photo over another, Send to back and Bring to front change the drawing order
// of the print file (all read back from the print file by pdf.js).
// Test devices only (it clears the app's data). Synthetic pictures only.
// Usage: node scripts/device/round6-smoke.mjs <serial> <outDir>
// Helpers as in round5-smoke.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round6-smoke.mjs <serial> <outDir>');
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
const [W, H] = (
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
/** The images of the newest print file's first page, in drawing order (bottom to top), as boxes in mm. */
const printBoxes = async (name) => {
  const pdf = path.join(outDir, `${name}.pdf`);
  writeFileSync(pdf, printBytes());
  const read = await validatePdf(pdf);
  rmSync(pdf);
  return (read.pageSizes[0]?.imageBoxes ?? []).map((b) => ({ x: b.x / MM, y: b.y / MM, w: b.w / MM, h: b.h / MM }));
};
const same = (a, b) => Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;
const sameSet = (a, b) => a.length === b.length && a.every((p) => b.some((q) => same(p, q)));
const toReady = async () => {
  const before = newestPrint();
  await tap('Done');
  await until('Ready', () => has('Ready to print'), 30_000);
  await until('a new print file', () => newestPrint() !== '' && newestPrint() !== before, 90_000);
  await sleep(1500);
};
/** Press and hold the [from]th photo of page 1 and drop it where the [onto]th one is, on the phone's screen. */
const dragOnto = async (from, onto) => {
  const a = await onScreen('.adjust-sheet[data-page="0"] .adjust-pick', from);
  const b = await onScreen('.adjust-sheet[data-page="0"] .adjust-pick', onto);
  const [sx, sy] = [Math.round(a.x + a.w / 2), Math.round(a.y + a.h / 2)];
  const [ex, ey] = [Math.round(b.x + b.w / 2) + 20, Math.round(b.y + b.h / 2) + 20];
  sh('input', 'motionevent', 'DOWN', String(sx), String(sy));
  await sleep(900);
  for (let k = 1; k <= 10; k++)
    sh(
      'input',
      'motionevent',
      'MOVE',
      String(Math.round(sx + ((ex - sx) * k) / 10)),
      String(Math.round(sy + ((ey - sy) * k) / 10)),
    );
  sh('input', 'motionevent', 'UP', String(ex), String(ey));
  await sleep(1500);
};

sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));

// Six photos, all on one page: the automatic layout.
await share('six-photos');
await tap('All on one page');
await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
await sleep(1500);
const auto = await printBoxes('r6-auto');

// 37: a photo dragged, then Undo (the automatic layout again), then Redo (the drag again), each read from the print file.
await tap('Adjust photos');
await until('Adjust', () => has('Photo 1 of 6'));
await sleep(1500);
await shot('01-adjust');
await dragOnto(1, 0);
await shot('02-dragged');
const undoEnabled = await evaluate(
  `JSON.stringify([...document.querySelectorAll('button')].find((b) => /^Undo/.test(b.textContent.trim()))?.disabled === false)`,
);
await toReady();
const dragged = await printBoxes('r6-dragged');
const movedBox = dragged.find((d) => !auto.some((a) => same(a, d)));
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
await sleep(1500);
await tap('Undo');
await sleep(1500);
await shot('03-undone');
await toReady();
const undone = await printBoxes('r6-undone');
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
await sleep(1500);
await tap('Redo');
await sleep(1500);
await shot('04-redone');
await toReady();
const redone = await printBoxes('r6-redone');
result.undoRedo = { undoEnabled, auto, dragged, undone, redone };
result.checks.aDragIsUndoneAndRedone =
  undoEnabled === true && !!movedBox && sameSet(undone, auto) && sameSet(redone, dragged);

// 38: the dragged photo lies over another; Send to back draws it first, Bring to front last (the print file's order).
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
await sleep(1500);
// Adjust opens on photo 1; the dragged one is photo 2.
await tap('Next photo');
await sleep(800);
await tap('Send to back');
await sleep(1500);
await shot('05-sent-back');
await toReady();
const sentBack = await printBoxes('r6-back');
await tap('Adjust photos');
await until('Adjust', () => has('Photo'));
await sleep(1500);
await tap('Next photo');
await sleep(800);
await tap('Bring to front');
await sleep(1500);
await shot('06-brought-front');
await toReady();
const broughtFront = await printBoxes('r6-front');
const at = (list) => list.findIndex((b) => movedBox && same(b, movedBox));
result.layers = { movedBox, sentBack, broughtFront, atBack: at(sentBack), atFront: at(broughtFront) };
result.checks.sendToBackAndBringToFrontChangeTheDrawingOrder =
  !!movedBox &&
  at(sentBack) === 0 &&
  at(broughtFront) === broughtFront.length - 1 &&
  sameSet(sentBack, dragged) &&
  sameSet(broughtFront, dragged);

writeFileSync(path.join(outDir, 'round6-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
