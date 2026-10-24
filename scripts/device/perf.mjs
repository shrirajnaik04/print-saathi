// Phase 10 performance budgets (PLAN §P) on one emulator or phone, through the real app: cold start, share 6 →
// Received, choice → Ready with the real-file preview, 20 × 12 MP on 2 pages with peak memory, idle memory on Home.
// Synthetic photos only (tests/generate/make-big-photos.mjs; the test sender's own six-photos).
// Usage: node scripts/device/perf.mjs <serial> <dir with big-1..20.jpg> <out.json>   (clears the app's data: test devices only)
// Times come from polling the screen (uiautomator, about 0.3–1 s a look) and the app's own files: coarse but honest.
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, bigDir, outFile] = process.argv.slice(2);
if (!serial || !bigDir || !outFile) throw new Error('usage: perf.mjs <serial> <big photo dir> <out.json>');
assertTestDevice(serial);
assertDebugBuild(serial);
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const runAs = (...a) => sh('run-as', PKG, ...a);
/** The screen's UI tree; uiautomator is sometimes killed while busy (exit 137): then the last dump, or nothing. */
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-ui.xml');
  } catch {
    // keep going with whatever is there
  }
  try {
    return sh('cat', '/sdcard/ps-ui.xml');
  } catch {
    return '';
  }
};
const has = (text) => xml().includes(`text="${text}"`);
const tap = (text) => {
  const line = xml()
    .split('>')
    .find((l) => l.includes(`text="${text}"`));
  const m = line?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) throw new Error(`no "${text}" on screen`);
  sh('input', 'tap', String((+m[1] + +m[3]) >> 1), String((+m[2] + +m[4]) >> 1));
};
const until = async (what, test, limitMs = 120_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    if (test()) return Date.now() - t0;
    await sleep(250);
  }
  throw new Error(`${what}: not within ${limitMs} ms`);
};
/**
 * PSS in KB from the "Total PSS by process" block only (dumpsys lists each process again by OOM level and category):
 * the app, its engine, and WebView renderers (on a test emulator with only this app open, those are the app's).
 */
const pss = () => {
  const all = sh('dumpsys', 'meminfo');
  const start = all.indexOf('Total PSS by process:');
  const end = all.indexOf('Total PSS by OOM adjustment:');
  const out = start >= 0 ? all.slice(start, end > start ? end : undefined) : '';
  const sum = (re) => [...out.matchAll(re)].reduce((s, m) => s + Number(m[1].replace(/,/g, '')), 0);
  return {
    app: sum(/([\d,]+)K: in\.printsaathi\.app \(pid/g),
    engine: sum(/([\d,]+)K: in\.printsaathi\.app:engine[^\n]*\(pid/g),
    webview: sum(/([\d,]+)K: [^\n]*(?:sandboxed_process|webview)[^\n]*\(pid/gi),
  };
};
/**
 * The app's timing marks (names only: ps-home, ps-choice, ps-ready, ps-ready-file, ps-ready-shown…) as
 * [name, device time ms], read through the WebView's debugging socket (debug builds only).
 */
async function marks() {
  const pid = sh('pidof', PKG).trim().split(/\s+/)[0];
  adb(serial, ['forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`]);
  try {
    const pages = await (await fetch('http://127.0.0.1:9333/json')).json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    });
    const reply = await new Promise((ok) => {
      ws.onmessage = (e) => ok(JSON.parse(String(e.data)));
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression:
              "JSON.stringify(performance.getEntriesByType('mark').map((m) => [m.name, performance.timeOrigin + m.startTime]))",
            returnByValue: true,
          },
        }),
      );
    });
    ws.close();
    return JSON.parse(reply.result.result.value);
  } finally {
    adb(serial, ['forward', '--remove', 'tcp:9333']);
  }
}
const newestJob = () => runAs('ls', '-t', 'no_backup/jobs').trim().split(/\s+/)[0];
const count = (dir, ext) => {
  try {
    return runAs('ls', dir)
      .split(/\s+/)
      .filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
};
const filePreview = (job) => {
  try {
    // One string: adb joins shell arguments with spaces, so the quotes must be part of it.
    return /0\.jpg/.test(sh(`run-as ${PKG} sh -c 'ls no_backup/jobs/${job}/out/*/preview 2>/dev/null'`));
  } catch {
    return false;
  }
};
const home = async () => {
  sh('am', 'force-stop', PKG);
  await sleep(500);
};

const r = { serial, when: new Date().toISOString() };

// 0. A clean app (test emulators only: leftovers of earlier test runs must not open a problem screen).
sh('pm', 'clear', PKG);
// The first start shows the four first-start steps (Phase 10c); they count as seen once shown, so the measured
// start below is the everyday one (Home).
sh('am', 'start', '-n', `${PKG}/.MainActivity`);
await until('first-start steps', () => has('Welcome to PrintSaathi') || has('PrintSaathi'));
await sleep(1500);

// 1. Cold start → Home usable (the app's own "ps-home" mark, read through WebView debugging: debug builds only);
//    then idle memory on Home.
await home();
const launchedAt = Number(sh('date', '+%s%3N').trim());
const start = sh('am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
r.coldStartTotalTimeMs = Number(start.match(/TotalTime: (\d+)/)?.[1] ?? -1);
await until('Home', () => has('Photos Choose from phone') || has('PrintSaathi'));
r.coldStartToHomeMs = Math.round(((await marks()).find(([n]) => n === 'ps-home')?.[1] ?? Number.NaN) - launchedAt);
/** Time from the last [from] mark to the first [to] mark after it. */
const between = (ms, from, to) => {
  const f = ms.filter(([n]) => n === from).at(-1)?.[1];
  const t = ms.find(([n, at]) => n === to && f !== undefined && at >= f)?.[1];
  return f !== undefined && t !== undefined ? Math.round(t - f) : null;
};
await sleep(4000);
r.idleKb = pss();

// 2. Share 6 photos → Received usable, and their thumbnails made.
const tag = `perf${Date.now()}`;
const s0 = Date.now();
const d0 = Number(sh('date', '+%s%3N').trim()); // the device's clock, for the app's own mark
sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', tag);
await until('Received', () => has('What did the customer ask?'));
r.share6ToReceivedMs = Date.now() - s0;
// uiautomator only reads a screen once it has been still for a second, so a screen that moves in is seen later
// than it is shown: the app's own mark says when the choices were on screen (device clock).
const shownAt = (await marks()).filter(([n, at]) => n === 'ps-received' && at >= d0).at(0)?.[1];
r.share6ToReceivedShownMs = shownAt === undefined ? null : Math.round(shownAt - d0);
const job6 = newestJob();
await until('6 thumbnails', () => count(`no_backup/jobs/${job6}/thumbs`, '.jpg') >= 6);
r.share6ToThumbnailsMs = Date.now() - s0;

// 3. All on one page → Ready with the real print file's page shown.
const c0 = Date.now();
tap('All on one page');
await until('Ready screen', () => {
  if (has('Keep as they are')) tap('Keep as they are');
  return has('Ready to print');
});
r.choiceToReadyScreen6Ms = Date.now() - c0;
await until('Ready file preview', () => {
  if (has('Keep as they are')) tap('Keep as they are');
  return filePreview(job6);
});
r.choiceToReadyFile6Ms = Date.now() - c0; // polled (coarse)
{
  const ms = await marks();
  r.marks6 = {
    choiceToReady: between(ms, 'ps-choice', 'ps-ready'),
    choiceToFileMade: between(ms, 'ps-choice', 'ps-ready-file'),
    choiceToFileShown: between(ms, 'ps-choice', 'ps-ready-shown'),
    blackEdgeCheck: between(ms, 'ps-edges-start', 'ps-edges-done'),
  };
}

// 4. 20 × 12 MP → 2 pages, peak memory sampled all the way.
await home();
const bigs = readdirSync(bigDir).filter((f) => /^big-\d+\.jpg$/.test(f));
for (const f of bigs) adb(serial, ['push', path.join(bigDir, f), `/data/local/tmp/${f}`]);
// One string: adb joins shell arguments with spaces, so the quotes must be part of it.
sh(`run-as ${SENDER} sh -c 'mkdir -p cache/out && cp ${bigs.map((f) => `/data/local/tmp/${f}`).join(' ')} cache/out/'`);
let peak = { app: 0, engine: 0, webview: 0, total: 0 };
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const p = pss();
    const total = p.app + p.engine + p.webview;
    if (total > peak.total) peak = { ...p, total };
    await sleep(500);
  }
})();
const b0 = Date.now();
sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'pushed-many', '--es', 'names', bigs.join(','));
// The 6-photo job comes back on screen (restored within 30 minutes), so the share asks first (New files arrived).
await until(
  'Received (20)',
  () => {
    if (has('Start a new job')) tap('Start a new job');
    return has('What did the customer ask?');
  },
  180_000,
);
r.share20ToReceivedMs = Date.now() - b0;
const job20 = newestJob();
await until('20 thumbnails', () => count(`no_backup/jobs/${job20}/thumbs`, '.jpg') >= bigs.length, 300_000);
r.share20ToThumbnailsMs = Date.now() - b0;
const u0 = Date.now();
tap('Use more pages');
await until('Ready', () => has('Change') || has('Keep as they are'), 120_000);
if (has('Keep as they are')) tap('Keep as they are');
await until('Ready', () => has('Change'));
r.twentyBigChoiceToReadyScreenMs = Date.now() - u0;
await until('Ready file preview (20, best)', () => filePreview(job20), 300_000);
r.twentyBigChoiceToReadyFileMs = Date.now() - u0; // polled (coarse)
{
  const ms = await marks();
  r.marks20 = {
    choiceToReady: between(ms, 'ps-choice', 'ps-ready'),
    choiceToFileShown: between(ms, 'ps-choice', 'ps-ready-shown'),
    blackEdgeCheck: between(ms, 'ps-edges-start', 'ps-edges-done'),
  };
}
tap('Change');
await until('Change', () => has('Pages') || xml().includes('Pages '));
const pagesRow = xml()
  .split('>')
  .find((l) => /text="Pages [^"]*Change"/.test(l));
const m = pagesRow?.match(/text="([^"]+)"/);
if (!m) throw new Error('no Pages row');
tap(m[1]);
await until('Pages screen', () => has('2 pages'));
const p0 = Date.now();
tap('2 pages');
await until('Ready file preview (20 on 2 pages)', () => filePreview(job20), 300_000);
r.twentyBigOnTwoPagesMs = Date.now() - p0; // polled (coarse)
r.marks20TwoPages = { readyToFileShown: between(await marks(), 'ps-ready', 'ps-ready-shown') };
sampling = false;
await sampler;
r.peakKbTwentyBig = peak;
await home();

writeFileSync(outFile, `${JSON.stringify(r, null, 2)}\n`);
console.log(JSON.stringify(r, null, 2));
