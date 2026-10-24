// Phase 10 privacy checks on one test emulator (PLAN §Q, §R level 10), through the real app:
//   1. Retention, time-shifted: a job last touched 2 days ago is deleted at the next start; the open job is kept.
//   2. Recents: a screenshot of the Recents screen while customer photos are open (Android 13+: the card is blank).
//   3. Backups: `bmgr backupnow` refuses the app (debug build, then the release build).
//   4. Network: the installed release build has no INTERNET permission at all.
//   5. Logs: no line of the app's log over the whole session carries a private path, a file name or a password.
// Synthetic files only (the test sender's photos). Test devices only: it clears the app's data and replaces the app.
// Usage: node scripts/device/privacy.mjs <serial> <out dir>   (debug build + test sender installed first)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outDir] = process.argv.slice(2);
if (!serial || !outDir) throw new Error('usage: privacy.mjs <serial> <out dir>');
assertTestDevice(serial);
assertDebugBuild(serial);
mkdirSync(outDir, { recursive: true });
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const sdk = Number(sh('getprop', 'ro.build.version.sdk').trim());
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-ui.xml');
  } catch {
    // uiautomator is sometimes killed while busy; read the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-ui.xml');
  } catch {
    return '';
  }
};
const has = (text) => xml().includes(`text="${text}"`);
const tap = (text) => {
  const m = xml()
    .split('>')
    .find((l) => l.includes(`text="${text}"`))
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) throw new Error(`no "${text}" on screen`);
  sh('input', 'tap', String((+m[1] + +m[3]) >> 1), String((+m[2] + +m[4]) >> 1));
};
const until = async (what, test, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (test()) return;
    await sleep(400);
  }
  throw new Error(`${what}: not within ${ms} ms`);
};
const pidOf = () => {
  try {
    return sh('pidof', PKG).trim();
  } catch {
    return ''; // pidof fails when there is no such process
  }
};
const jobs = () => {
  try {
    return sh('run-as', PKG, 'ls', 'no_backup/jobs').split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
};
const share = async (tag) => {
  sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', tag);
  await until('Received', () => has('What did the customer ask?'));
};
/** Makes a job look untouched since [when]: its manifest time and every file's time (one string: adb joins args). */
const age = (job, when, ms) =>
  sh(
    `run-as ${PKG} sh -c 'cd no_backup/jobs/${job} && sed -i "s/\\"updatedAt\\":[0-9]*/\\"updatedAt\\":${ms}/" job.json && find . -exec touch -d "${when}" {} +'`,
  );

const r = { serial, sdk, when: new Date().toISOString() };
sh('logcat', '-c');

// 1. Retention, time-shifted (the 1-day default, PLAN §E).
sh('pm', 'clear', PKG);
sh('am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
// A cleared app starts with the first-start steps (Phase 10c), then Home.
await until('Welcome or Home', () => has('Welcome to PrintSaathi') || has('Recent jobs'));
if (has('Welcome to PrintSaathi')) {
  for (let i = 0; i < 3; i++) {
    tap('Next');
    await sleep(600);
  }
  tap('Done');
}
await until('Home', () => has('Recent jobs'));
const tags = [`old${Date.now()}`];
await share(tags[0]);
const oldJob = jobs()[0];
tap('Home'); // the first job is no longer open
await until('Home', () => has('PrintSaathi'));
tags.push(`open${Date.now()}`);
await share(tags[1]);
const openJob = jobs().find((j) => j !== oldJob);
sh('am', 'force-stop', PKG);
await sleep(800);
const twoDaysAgo = Date.now() - 2 * 24 * 3600 * 1000;
const stamp = new Date(twoDaysAgo).toISOString().slice(0, 19).replace('T', ' ');
for (const j of [oldJob, openJob]) age(j, stamp, twoDaysAgo); // both old; only the open one is protected
sh('am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
await until('reopened on the open job', () => has('What did the customer ask?'));
await sleep(4000); // the first sweep runs once the web app has said which jobs are open
const after = jobs();
r.retention = {
  oldJobDeleted: !after.includes(oldJob),
  openJobKept: after.includes(openJob),
  verdict: !after.includes(oldJob) && after.includes(openJob) ? 'PASS' : 'FAIL',
};

// 1b. The daily cleanup in a cold process (review M4): the web app is not running, so only the open jobs saved on
//     disk protect the job on screen. Android closes the app in the background (am kill: the scheduled job stays;
//     force-stop would cancel it), both jobs are made 2 days old, and the daily job is forced to run now.
// Two fresh jobs: one left (Home), one on screen; both are made old only once the process is gone.
tap('Home');
await until('Home', () => has('PrintSaathi'));
const known = new Set(jobs());
tags.push(`left${Date.now()}`);
await share(tags[2]);
const leftJob = jobs().find((j) => !known.has(j));
tap('Home');
await until('Home', () => has('PrintSaathi'));
tags.push(`cold${Date.now()}`);
await share(tags[3]);
const onScreen = jobs().find((j) => !known.has(j) && j !== leftJob);
sh('input', 'keyevent', 'KEYCODE_HOME');
await sleep(1500);
for (let tries = 0; tries < 5 && pidOf() !== ''; tries++) {
  sh('am', 'kill', PKG);
  await sleep(800);
}
const coldKilled = pidOf() === '';
for (const j of [leftJob, onScreen]) age(j, stamp, twoDaysAgo);
const forced = sh('cmd', 'jobscheduler', 'run', '-f', PKG, '4201').trim();
await sleep(6000);
const afterCold = jobs();
r.retentionCold = {
  processKilledFirst: coldKilled,
  forced,
  leftJobDeleted: !afterCold.includes(leftJob),
  onScreenJobKept: afterCold.includes(onScreen),
  verdict: coldKilled && leftJob && !afterCold.includes(leftJob) && afterCold.includes(onScreen) ? 'PASS' : 'FAIL',
};
sh('am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
await until('reopened on the job on screen', () => has('What did the customer ask?'));

// 2. Recents while customer photos are open. Opened straight from the app, the launcher draws the app's live window
//    (what the person holding the phone already sees; nothing is stored). Opened later, after leaving the app, it
//    shows the stored screenshot: that is what the flag hides (Android 13+: a blank card).
const recents = async (name) => {
  sh('input', 'keyevent', 'KEYCODE_APP_SWITCH');
  await sleep(2500);
  writeFileSync(path.join(outDir, name), adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }));
};
await recents(`recents-live-api${sdk}.png`);
sh('input', 'keyevent', 'KEYCODE_HOME');
await sleep(1500);
await recents(`recents-stored-api${sdk}.png`);
sh('input', 'keyevent', 'KEYCODE_HOME');
r.recents = {
  live: `recents-live-api${sdk}.png`,
  stored: `recents-stored-api${sdk}.png`,
  expected:
    sdk >= 33
      ? 'stored: a blank PrintSaathi card (setRecentsScreenshotEnabled(false))'
      : 'both blank (FLAG_SECURE on customer screens)',
  verdict: 'LOOK AT THE SCREENSHOTS',
};

// 3. Backups refused (debug build).
const backup = () => {
  try {
    sh('bmgr', 'enable', 'true');
    return sh('bmgr', 'backupnow', PKG).trim();
  } catch (e) {
    return String(e.stdout ?? e.message);
  }
};
const refused = (out) => /not allowed|not eligible|BackupNotAllowed|Backup is not allowed/i.test(out);
const debugBackup = backup();
r.backupDebug = { output: debugBackup, verdict: refused(debugBackup) ? 'PASS' : 'FAIL' };

// 5. Logs over the whole session (before the release build replaces the debug one). Every line of every process is
//    searched (the app, its isolated engine, the WebView and web console, review I8), except system (uid 1000) and
//    the test sender's own lines, which rightly name the sender's files and URIs.
const senderUid = sh('pm', 'list', 'packages', '-U', SENDER).match(/uid:(\d+)/)?.[1] ?? 'none';
const senderName = `u0_a${Number(senderUid) - 10000}`;
const log = sh('logcat', '-d', '-v', 'uid');
const lines = log.split(/\r?\n/).filter((l) => {
  const uid = l.split(/\s+/)[2];
  return uid !== undefined && uid !== '1000' && uid !== 'system' && uid !== senderUid && uid !== senderName;
});
const secrets = [/no_backup/, /\/jobs\//, /photo-[a-z]*\d+-\d+\.jpg/i, /RAMA1965/, ...tags.map((t) => new RegExp(t))];
const hits = lines.filter((l) => secrets.some((re) => re.test(l)));
writeFileSync(path.join(outDir, `privacy-log-hits-api${sdk}.txt`), `${hits.join('\n')}\n`);
r.logs = {
  linesSearched: lines.length,
  appLines: lines.filter((l) => /PrintSaathi|printsaathi/.test(l)).length,
  hits: hits.length,
  verdict: hits.length === 0 && lines.length > 0 ? 'PASS' : 'FAIL',
};

// 4. The release build: no INTERNET permission; backups refused.
// Release and debug builds are signed with different keys (Phase 12), so Android refuses one over the other: the debug
// build is removed first (test device only).
try {
  adb(serial, ['uninstall', PKG]);
} catch {
  // not installed
}
adb(serial, ['install', 'android/app/build/outputs/apk/release/app-release.apk']);
const pkg = sh('dumpsys', 'package', PKG);
r.release = {
  debuggable: /flags=\[[^\]]*DEBUGGABLE/.test(pkg),
  allowBackupFlag: /flags=\[[^\]]*ALLOW_BACKUP/.test(pkg),
  internet: /android\.permission\.INTERNET/.test(pkg),
};
const releaseBackup = backup();
r.release.backup = releaseBackup;
r.release.verdict =
  !r.release.debuggable && !r.release.allowBackupFlag && !r.release.internet && refused(releaseBackup)
    ? 'PASS'
    : 'FAIL';

writeFileSync(path.join(outDir, `privacy-api${sdk}.json`), `${JSON.stringify(r, null, 2)}\n`);
console.log(JSON.stringify(r, null, 2));
