// Phase 7 Task 6 device check (PLAN §P "memory after 20 jobs in a row", "10-page B&W PDF → Ready"): shares a
// synthetic PDF N times through the test sender, waits for Ready, goes Home (leaving the job), and records the time to
// Ready (UI polled about every 0.5–1.5 s, so the time is coarse), the app's and the engine's memory (PSS) and the
// size of the job folders, after the first job and after the last.
// Usage: node scripts/device/pdf-repeat.mjs <serial> <name pushed into the sender's cache/out> [n=20] [out.json]
// Synthetic fixtures only; push first: adb push … /data/local/tmp/x.pdf; run-as in.printsaathi.sharesender cp …
import { writeFileSync } from 'node:fs';
import { adb, sleep } from './adb.mjs';

const [serial, name, nArg, outFile] = process.argv.slice(2);
if (!serial || !name) throw new Error('usage: pdf-repeat.mjs <serial> <name> [n] [out.json]');
const n = Number(nArg ?? 20);
const PKG = 'in.printsaathi.app';

const sh = (...args) => adb(serial, ['shell', ...args]);
const screen = () => {
  sh('uiautomator', 'dump', '/sdcard/ps-ui.xml');
  return sh('cat', '/sdcard/ps-ui.xml');
};
const centre = (xml, text) => {
  const m = xml
    .split('>')
    .find((l) => l.includes(`text="${text}"`))
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return m ? [(+m[1] + +m[3]) >> 1, (+m[2] + +m[4]) >> 1] : null;
};
/** Total PSS in KB of one process (dumpsys meminfo), or null when it is not running. */
const pss = (proc) => {
  try {
    const m = sh('dumpsys', 'meminfo', proc).match(/TOTAL PSS:\s+(\d+)|TOTAL\s+(\d+)/);
    return m ? Number(m[1] ?? m[2]) : null;
  } catch {
    return null;
  }
};
const jobsKb = () => Number(sh('run-as', PKG, 'du', '-sk', 'no_backup/jobs').trim().split(/\s+/)[0]);
const sample = () => ({ appKb: pss(PKG), engineKb: pss(`${PKG}:engine`), jobsKb: jobsKb() });

const runs = [];
let first = null;
for (let i = 1; i <= n; i++) {
  const t0 = Date.now();
  sh('am', 'start', '-n', 'in.printsaathi.sharesender/.SendActivity', '--es', 'mode', 'pushed', '--es', 'name', name);
  let ready = null;
  let xml = '';
  while (Date.now() - t0 < 60_000) {
    xml = screen();
    if (/text="1 PDF · \d+ pages? · A4/.test(xml)) {
      ready = Date.now() - t0;
      break;
    }
    await sleep(300);
  }
  if (ready === null) throw new Error(`job ${i}: no Ready within 60 s`);
  await sleep(1500); // let the print file and its previews finish
  if (i === 1) first = sample();
  const home = centre(screen(), 'Home');
  if (!home) throw new Error(`job ${i}: no Home button`);
  sh('input', 'tap', String(home[0]), String(home[1]));
  await sleep(1500);
  runs.push({ job: i, readyMs: ready });
  console.log(`job ${i}: Ready in ~${ready} ms`);
}
const last = sample();
const result = { serial, name, n, runs, afterFirst: first, afterLast: last };
console.log(JSON.stringify({ afterFirst: first, afterLast: last }));
if (outFile) writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
