// Design review on a real Android WebView (Phase 13+): the main screens as the shopkeeper sees them, from a synthetic share.
// Test devices only (it clears the app's data). Usage: node scripts/device/look-shots.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: look-shots.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-look.xml');
  } catch {
    // busy: the last dump
  }
  return sh('cat', '/sdcard/ps-look.xml');
};
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const until = async (what, test, ms = 60_000) => {
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
      .find((x) => new RegExp(`(?:text|content-desc)="${t}`).test(x));
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
const shot = async (name) => {
  await sleep(1200); // after the entrance motion
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};

sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
if (has('Welcome')) {
  await shot('welcome');
  for (let i = 0; i < 3; i++) await tap('Next');
  await tap('Done');
}
await until('Home', () => has('Recent jobs'));
await shot('home');
sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `look${Date.now()}`);
await until('Received', () => has('All on one page'));
await sleep(2500);
await shot('received');
await tap('All on one page');
await until('Ready', () => has('Ready to print') && !has('Preparing'));
await sleep(3000);
await shot('ready');
await tap('Change');
await until('Change', () => has('Layout'));
await shot('change');
sh('input', 'keyevent', 'KEYCODE_BACK');
await until('Ready again', () => has('Ready to print'));
await tap('PRINT');
await until("Android's print screen", () => !has('Ready to print'), 30_000);
await sleep(2500);
sh('input', 'keyevent', 'KEYCODE_BACK');
await until('Result', () => has('Printing'), 30_000);
await shot('result');
await tap('Home');
await until('Home', () => has('Recent jobs'));
await tap('Settings');
await until('Settings', () => has('Shop name'));
await shot('settings');
console.log(`screenshots in ${outDir}`);
