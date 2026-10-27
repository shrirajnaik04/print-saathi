// Phases 44-47 (owner, round 9: "when doc file is shared through WhatsApp … we get this error") on a real Android
// (emulator) at a phone's screen size: a Word file (.docx) is made into pages — Ready names it, the print file holds its
// A4 pages — and keeps Print with WPS Office; a PowerPoint file (.pptx) gives one A4 sideways page per slide; an Excel
// file (.xlsx) gives table pages; old Word (.doc) and OpenDocument files are named by
// their kind and offer Print with WPS Office; the emulator has no WPS, so the button says how to get it (or another
// office app opens); a shared .txt file prints as a text message. Files kept as the customer's
// own (NNNN.office) and the kind in the job are read back from the app's storage.
// Test devices only (it clears the app's data and changes the screen size). Synthetic files only (OfficeSamples).
// Usage: node scripts/device/round9-smoke.mjs <serial> <outDir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validatePdf } from '../validate-pdf.mjs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: round9-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const WPS = ['cn.wps.moffice_eng', 'cn.wps.moffice_eng.xiaomi.lite', 'com.kingsoft.moffice_pro'];
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-r9.xml');
  } catch {
    // busy: the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-r9.xml');
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
const jobJson = () => JSON.parse(runAs('cat', `no_backup/jobs/${newestJob()}/job.json`));
const sources = () => runAs('ls', `no_backup/jobs/${newestJob()}/src`).trim().split(/\s+/);
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
const home = async () => {
  if (foreground() !== PKG) sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await sleep(1000);
  await tap('Home');
  await sleep(1200);
  if (has('Leave this job?')) await tapExact('Leave');
  await until('Home', () => has('Recent jobs'), 15_000);
};
const send = (mode) =>
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', mode, '--es', 'tag', `${mode}${Date.now()}`);

const result = { serial, checks: {}, files: {} };
result.wpsInstalled = WPS.filter((p) => sh('pm', 'list', 'packages', p).includes(`package:${p}`));
sh('pm', 'clear', PKG);
const size0 = sh('wm', 'size').trim();
const density0 = sh('wm', 'density').trim();
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

  // Phases 45-46: an Office file made into pages. Ready names it and says to check the preview; the print file holds
  // its pages at [w] × [h] points; the customer's own file is kept beside them for Print with WPS Office.
  const madeIntoPages = async (mode, kind, name, w, h, check) => {
    send(mode);
    await until('Ready', () => has('Ready to print'), 90_000);
    await until('a print file', () => newestPrint() !== '', 120_000);
    await sleep(1500);
    const line = labels().find((l) => l.startsWith(name)) ?? '';
    const pages = Number(/^[^·]+ · (\d+) pages?/.exec(line)?.[1] ?? 0);
    const print = await readPrint(`r9-${mode}`);
    const item = jobJson().items?.[0];
    result[mode] = { line, pages: print.pages, office: item?.office, type: item?.type, files: sources() };
    result.checks[check] =
      pages >= 1 &&
      print.pages === pages &&
      print.pageSizes.every((p) => Math.abs(p.widthPt - w) < 2 && Math.abs(p.heightPt - h) < 2) &&
      item?.type === 'pdf' &&
      item?.office?.kind === kind &&
      result[mode].files.includes('0001.office') &&
      result[mode].files.includes('0001.pdf') &&
      has(`Made from a${name.startsWith('Excel') ? 'n' : ''} ${name}.`);
    await shot(`01-${mode}-ready`);
    return pages;
  };
  await madeIntoPages('docx', 'word', 'Word file', 595, 842, 'docxBecomesPages');
  // Print with WPS Office: no WPS on the emulator, so it says how to get it — or another office app opens.
  await tap('Print with WPS Office');
  await sleep(4000);
  const opened = foreground();
  result.handOff = { opened, said: has('Install WPS Office from the Play Store to print this file.') };
  result.checks.printWithWpsAnswers =
    result.handOff.said || (opened !== '' && opened !== PKG && !opened.startsWith('com.android.systemui'));
  await shot('02-docx-handoff');
  if (opened !== PKG) sh('input', 'keyevent', 'KEYCODE_BACK');
  await sleep(1500);
  await home();
  // The sample deck has two slides: two A4 sideways pages.
  result.checks.pptxOnePagePerSlide =
    (await madeIntoPages('pptx', 'powerpoint', 'PowerPoint file', 842, 595, 'pptxBecomesPages')) === 2;
  await home();

  // Phase 47: the sample fee sheet (3 columns, 6 rows: fits an upright page) as one upright A4 table page.
  await madeIntoPages('xlsx', 'excel', 'Excel file', 595, 842, 'xlsxBecomesTablePages');
  await home();

  // Each other Office file: its kind on the card, the customer's own file kept, nothing that says "can't be printed".
  const cases = [
    ['doc', 'word', 'ole', 'This Word file prints from WPS Office.'],
    ['odt', 'word', 'odf', 'This Word file prints from WPS Office.'],
  ];
  for (const [mode, kind, format, card] of cases) {
    send(mode);
    await until(`the ${mode} card`, () => has(card), 60_000);
    const item = jobJson().items?.[0];
    const files = sources();
    result.files[mode] = { office: item?.office, type: item?.type, files };
    result.checks[`${mode}NamedAndKept`] =
      item?.office?.kind === kind &&
      item?.office?.format === format &&
      files.includes('0001.office') &&
      has('Print with WPS Office') &&
      !has("Office file: can't be printed yet");
    await shot(`01-${mode}-card`);
    await home();
  }

  // A .txt file shared as a file: a text message, ready to print as A4.
  send('txt');
  await until('Ready', () => has('Ready to print'), 60_000);
  await until('a print file', () => newestPrint() !== '', 120_000);
  await sleep(1500);
  const line = labels().find((l) => l.startsWith('Text message')) ?? '';
  const txtPrint = await readPrint('r9-txt');
  result.txt = { line, pages: txtPrint.pages, files: sources() };
  result.checks.txtPrintsAsTextMessage =
    /^Text message · 1 page/.test(line) &&
    txtPrint.pages === 1 &&
    Math.abs(txtPrint.pageSizes[0].widthPt - 595) < 2 &&
    Math.abs(txtPrint.pageSizes[0].heightPt - 842) < 2;
  await shot('03-txt-ready');
} finally {
  sh('wm', 'size', size0.includes('Override') ? size0.split('Override size: ')[1] : 'reset');
  sh('wm', 'density', density0.includes('Override') ? density0.split('Override density: ')[1] : 'reset');
  sh('settings', 'put', 'system', 'accelerometer_rotation', '1');
}

writeFileSync(path.join(outDir, 'round9-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
console.log(JSON.stringify(result.checks));
if (failed.length) {
  console.error(`FAILED: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
}
