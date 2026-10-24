// Phase 14/15 on the RELEASE build (R8 could strip new bridge methods): two card photos → ID card copy → 2 found →
// Card copy → Real card size → Ready, and a sideways typed page turned upright. UI only (a release build has no
// run-as). Test devices only. Usage: node scripts/device/release-cards.mjs <serial> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: release-cards.mjs <serial> <outDir>');
assertTestDevice(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const sh = (...a) => adb(serial, ['shell', ...a]);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-rel.xml');
  } catch {
    // busy: the last dump
  }
  return sh('cat', '/sdcard/ps-rel.xml');
};
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const until = async (test, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(800);
  }
  return false;
};
const tap = (t) => {
  const n = xml()
    .split('<node ')
    .find((x) => new RegExp(`(?:text|content-desc)="${t}`).test(x));
  const b = n
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
  if (!b) throw new Error(`"${t}" not on screen`);
  sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
};
const shot = (name) =>
  writeFileSync(path.join(outDir, `${name}.png`), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));

const r = {};
sh('pm', 'clear', PKG);
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until(() => has('Welcome') || has('PrintSaathi'));
sh(
  'am',
  'start',
  '-n',
  'in.printsaathi.sharesender/.SendActivity',
  '--es',
  'mode',
  'card-photos',
  '--es',
  'tag',
  `rel${Date.now()}`,
);
r.received = await until(() => has('ID card copy'));
tap('ID card copy');
r.found = await until(() => has('2 ID cards found'));
await sleep(2000);
shot('01-release-cards-found');
tap('Card copy');
r.howBig = await until(() => has('Real card size'));
tap('Real card size');
r.ready = await until(() => labels().some((l) => l.startsWith('ID card · real size · A4')));
await sleep(4000);
shot('02-release-ready');
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
  `relrot${Date.now()}`,
);
if (await until(() => has('Start a new job'), 20_000)) tap('Start a new job');
r.turned = await until(() => has('Turned 1 photo upright'), 30_000);
r.pass = Object.values(r).every(Boolean);
writeFileSync(path.join(outDir, 'release-cards.json'), `${JSON.stringify(r, null, 2)}\n`);
console.log(JSON.stringify(r));
if (!r.pass) process.exitCode = 1;
