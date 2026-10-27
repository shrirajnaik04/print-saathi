// Phase 15: a photo of a typed page taken sideways is turned upright on a real Android (emulator), with the note and
// Undo. Test devices only (it clears the app's data). Synthetic page only.
// Usage: node scripts/device/rotate-smoke.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: rotate-smoke.mjs <serial> <outDir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const sh = (...a) => adb(serial, ['shell', ...a]);
const labels = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-rot.xml');
  } catch {
    // busy: the last dump
  }
  // Round 9: right after the app starts the first dump can find no window (and no older dump exists): not yet.
  let xml = '';
  try {
    xml = sh('cat', '/sdcard/ps-rot.xml');
  } catch {
    // no dump yet
  }
  return [...xml.matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1]);
};
const has = (t) => labels().some((l) => l.startsWith(t));
const until = async (what, test, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(800);
  }
  return false;
};
const shot = (name) =>
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));

sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first start', () => has('Welcome') || has('PrintSaathi'));
sh(
  'am',
  'start',
  '-n',
  'in.printsaathi.sharesender/.SendActivity',
  '--es',
  'mode',
  'sideways-doc',
  '--es',
  'tag',
  `rot${Date.now()}`,
);
await until('Received', () => has('One on each page'));
const turned = await until('turned upright note', () => has('Turned 1 photo upright'), 20_000);
await sleep(1500);
shot('01-received-choices');
// The note and the photo sit below the choices: scroll to them (review M6).
const [W, H] = (
  sh('wm', 'size')
    .match(/(\d+)x(\d+)/)
    ?.slice(1) ?? ['1080', '2000']
).map(Number);
sh('input', 'swipe', String(W >> 1), String(Math.round(H * 0.8)), String(W >> 1), String(Math.round(H * 0.2)), '400');
await sleep(1500);
shot('02-received-note-and-photo');
const result = { serial, turnedNote: turned };
writeFileSync(path.join(outDir, 'rotate-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(turned ? 'ROTATE-SMOKE-DONE: turned upright' : 'ROTATE-SMOKE-FAILED: no note');
if (!turned) process.exitCode = 1;
