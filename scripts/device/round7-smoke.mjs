// Phases 39-40 (owner, round 7) on a real Android (emulator) at a phone's screen size: front and back one under the
// other print 60 mm apart; the side bars of a photo at the page's top-left are drawn on its edges; the paste mark is a
// thin blinking line and Paste puts the photo's top-left corner at it (print files read back by pdf.js).
// Test devices only (it clears the app's data, and changes the screen size for the run). Synthetic pictures only.
// Usage: node scripts/device/round7-smoke.mjs <serial> <outDir>
// Helpers as in round5-smoke.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round7-smoke.mjs <serial> <outDir>');
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
  return {
    x: ox + r.x * r.dpr,
    y: oy + r.y * r.dpr,
    w: r.w * r.dpr,
    h: r.h * r.dpr,
    dpr: r.dpr,
    cssX: r.x,
    cssY: r.y,
    cssW: r.w,
    cssH: r.h,
  };
};
const printBoxes = async (name) => {
  const pdf = path.join(outDir, `${name}.pdf`);
  writeFileSync(pdf, printBytes());
  const read = await validatePdf(pdf);
  rmSync(pdf);
  return (read.pageSizes[0]?.imageBoxes ?? []).map((b) => ({ x: b.x / MM, y: b.y / MM, w: b.w / MM, h: b.h / MM }));
};
const same = (a, b) => Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;
const toReady = async () => {
  const before = newestPrint();
  await tap('Done');
  await until('Ready', () => has('Ready to print'), 30_000);
  await until('a new print file', () => newestPrint() !== '' && newestPrint() !== before, 90_000);
  await sleep(1500);
};
const home = async () => {
  await tap('Home');
  await sleep(1200);
  if (has('Leave this job?')) await tapExact('Leave');
  await until('Home', () => has('Recent jobs'), 15_000);
};

sh('pm', 'clear', PKG);
// A phone's screen (about 411 px wide), where a photo at the page's edge has its side bars' touch areas moved inside.
const size0 = sh('wm', 'size').trim();
const density0 = sh('wm', 'density').trim();
sh('wm', 'size', '1080x2340');
sh('wm', 'density', '420');
sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
sh('settings', 'put', 'system', 'user_rotation', '0');
await sleep(3000);
[W, H] = [1080, 2340];
try {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await until('first start', () => has('Welcome') || has('PrintSaathi'));
  if (has('Welcome')) {
    for (let i = 0; i < 3; i++) await tap('Next');
    await tap('Done');
  }
  await until('Home', () => has('Recent jobs'));

  // 40a: front and back one under the other, 60 mm apart, read from the print file.
  await share('card-photos');
  await tap('ID card copy');
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
  await shot('01-cards-ready');
  const cards = (await printBoxes('r7-cards')).sort((a, b) => a.y - b.y);
  const gap = cards.length === 2 ? cards[1].y - (cards[0].y + cards[0].h) : null;
  result.cards = { cards, gap };
  result.checks.frontAndBack60mmApart = gap !== null && Math.abs(gap - 60) < 0.6 && Math.abs(cards[0].y - 20) < 0.6;
  await home();

  // 39c + 39b: six photos, one on each page; Adjust on photo 1 (alone on page 1, at its top-left).
  await share('six-photos');
  await tap('One on each page');
  await until('print file', () => has('Ready to print') && newestPrint() !== '', 90_000);
  await sleep(1500);
  await tap('Adjust photos');
  await until('Adjust', () => has('Photo 1 of 6'));
  await sleep(1500);
  await shot('02-adjust-bars');
  const bars = await evaluate(`JSON.stringify((() => {
    const out = {};
    for (const s of ['l', 'r', 't', 'b']) {
      const el = document.querySelector('.adjust-side-' + s);
      const pick = el && (el.closest('.adjust-pick') || el.parentElement);
      if (!el || !pick) continue;
      const r = el.getBoundingClientRect();
      const p = pick.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      const cx = r.left + parseFloat(a.left);
      const cy = r.top + parseFloat(a.top);
      out[s] = { inside: el.classList.contains('adjust-in'), off: s === 'l' ? cx - p.left : s === 'r' ? cx - p.right : s === 't' ? cy - p.top : cy - p.bottom, touch: Math.min(r.width, r.height) };
    }
    return out;
  })())`);
  result.bars = bars;
  result.checks.sideBarsOnTheEdges =
    Object.keys(bars).length === 4 &&
    Object.values(bars).every((b) => Math.abs(b.off) <= 2 && b.touch >= 55.5) &&
    Object.values(bars).some((b) => b.inside);

  // The chosen photo made small, Copy, a tap on the first empty spot where a copy fits (the blinking line), Paste:
  // the copy's top-left corner at the line.
  // (Smaller is pressed from the page: it sits far along the sliding row, and is not what this checks.)
  for (let i = 0; i < 8; i++) {
    await evaluate(
      `JSON.stringify(!![...document.querySelectorAll('.actionbar button')].find((b) => b.textContent.trim() === 'Smaller' && !b.disabled)?.click())`,
    );
    await sleep(700);
  }
  // Copy too (the tap that matters here, the one that puts the line, is a real touch below; Paste is a real tap).
  await evaluate(
    `JSON.stringify(!![...document.querySelectorAll('.actionbar button')].find((b) => b.textContent.trim() === 'Copy')?.click())`,
  );
  await sleep(1200);
  const copiedNote = has('Photo 1 copied.');
  const paper = await onScreen('.adjust-sheet[data-page="0"] figure');
  const spot = await evaluate(`JSON.stringify((() => {
    const paperBox = document.querySelector('.adjust-sheet[data-page="0"] figure').getBoundingClientRect();
    const picks = [...document.querySelectorAll('.adjust-sheet[data-page="0"] .adjust-pick')].map((e) => e.getBoundingClientRect());
    const chosen = document.querySelector('.adjust-sheet[data-page="0"] .adjust-selected').getBoundingClientRect();
    const bar = document.querySelector('.actionbar').getBoundingClientRect().top;
    const m = (paperBox.width * 12.7) / 210;
    const free = (x, y) => !picks.some((r) => { const c = r.left === chosen.left && r.top === chosen.top ? 36 : 8; return x < r.right + c && x + chosen.width > r.left - c && y < r.bottom + c && y + chosen.height > r.top - c; });
    // Only where the page shows on the screen (the window may have scrolled the page's top under the status bar).
    for (let y = Math.max(paperBox.top + m, 100); y + chosen.height <= Math.min(paperBox.bottom - m, bar - 4); y += 4)
      for (let x = paperBox.left + m; x + chosen.width <= paperBox.right - m; x += 4) if (free(x, y)) return { x, y };
    return null;
  })())`);
  if (!spot) throw new Error('no empty spot where a copy fits');
  const tapX = Math.round(paper.x + (spot.x - paper.cssX) * paper.dpr);
  const tapY = Math.round(paper.y + (spot.y - paper.cssY) * paper.dpr);
  sh('input', 'tap', String(tapX), String(tapY));
  await sleep(1000);
  const noted = has('Paste goes to the line.');
  const line = await evaluate(
    `JSON.stringify((() => { const e = document.querySelector('.adjust-mark'); if (!e) return null; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, anim: getComputedStyle(e).animationName }; })())`,
  );
  await shot('03-line');
  // Paste sits past the tools on screen (round 7 order): brought into view, then a real tap.
  await evaluate(
    `JSON.stringify(!![...document.querySelectorAll('.actionbar button')].find((b) => b.textContent.trim() === 'Paste')?.scrollIntoView({ block: 'nearest', inline: 'center' }))`,
  );
  await sleep(800);
  await tapExact('Paste');
  await sleep(2000);
  await toReady();
  const pasted = await printBoxes('r7-pasted');
  // Page 1 holds photo 1 and, drawn last (on top), the copy.
  const copy = pasted.length === 2 ? pasted[1] : null;
  const at = { x: ((tapX - paper.x) / paper.w) * 210, y: ((tapY - paper.y) / paper.h) * 297 };
  const fits = copy && at.y + copy.h <= 297 - 12.7;
  result.paste = { copiedNote, line, noted, at, copy, fits };
  result.checks.pasteStartsAtTheBlinkingLine =
    copiedNote &&
    !!line &&
    noted &&
    fits &&
    line.w <= 4 &&
    line.h >= 20 &&
    line.anim !== 'none' &&
    !!copy &&
    Math.abs(copy.x - at.x) <= 2 &&
    (fits ? Math.abs(copy.y - at.y) <= 2 : Math.abs(copy.y + copy.h - (297 - 12.7)) <= 1);
  await shot('04-ready-pasted');
} finally {
  sh('wm', 'size', size0.includes('Override') ? size0.split('Override size: ')[1] : 'reset');
  sh('wm', 'density', density0.includes('Override') ? density0.split('Override density: ')[1] : 'reset');
  sh('settings', 'put', 'system', 'accelerometer_rotation', '1');
}

writeFileSync(path.join(outDir, 'round7-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
