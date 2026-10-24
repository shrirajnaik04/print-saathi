// Phase 12: the shrunk, signed release build works (R8 must not break the bridge, the plugin or the isolated engine).
// On a test emulator: replaces the app with the release APK, then
//   1. six shared photos → Received → All on one page → Ready → PRINT → Android's print screen;
//   2. a shared PDF → Ready;
//   3. a locked PDF unlocks; a saved setting survives an update in place (install -r); the daily cleanup runs cold;
//   4. no verbose/debug/info lines from the app's processes (stripped), no app crash, no WebView devtools socket.
// Old images (WebView gate): the app starts on the "update WebView" screen without crashing.
// Synthetic files only (the test sender). Test devices only: it uninstalls the app (its data goes too).
// Usage: node scripts/device/release-smoke.mjs <serial> <out.json>
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, assertTestDevice, sleep } from './adb.mjs';

const [serial, outFile] = process.argv.slice(2);
if (!serial || !outFile) throw new Error('usage: release-smoke.mjs <serial> <out.json>');
assertTestDevice(serial);
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const APK = path.resolve('android/app/build/outputs/apk/release/app-release.apk');
if (!existsSync(APK)) throw new Error('build it first: npm run android:release');
const sh = (...a) => adb(serial, ['shell', ...a]);

const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-rel.xml');
  } catch {
    // busy: read the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-rel.xml');
  } catch {
    return '';
  }
};
const labels = () => [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const has = (t) => labels().some((l) => l.startsWith(t));
const until = async (what, test, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what} (screen: ${labels().slice(0, 12).join(' / ')})`);
};
const tap = (t, exact = false) => {
  const line = xml()
    .split('<node ')
    .find(
      (n) =>
        new RegExp(`(?:text|content-desc)="${t}${exact ? '"' : ''}`).test(n) &&
        /bounds="\[\d+,\d+\]\[\d+,\d+\]"/.test(n),
    );
  const b = line
    ?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    ?.slice(1)
    .map(Number);
  if (!b || b[2] <= b[0] || b[3] <= b[1]) throw new Error(`"${t}" not on screen`);
  sh('input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
};
const scrollDown = () => {
  const [w, h] = (
    sh('wm', 'size')
      .match(/(\d+)x(\d+)/)
      ?.slice(1) ?? ['1080', '2000']
  ).map(Number);
  sh('input', 'swipe', String(w >> 1), String(Math.round(h * 0.8)), String(w >> 1), String(Math.round(h * 0.3)), '300');
};
/** Taps [t], scrolling down (then up) until it can be tapped. */
const tapScrolling = async (t, exact = false) => {
  for (let i = 0; ; i++) {
    try {
      tap(t, exact);
      return;
    } catch (e) {
      if (i >= 8) throw e;
      if (i < 5) scrollDown();
      else {
        const [w, h] = (
          sh('wm', 'size')
            .match(/(\d+)x(\d+)/)
            ?.slice(1) ?? ['1080', '2000']
        ).map(Number);
        sh(
          'input',
          'swipe',
          String(w >> 1),
          String(Math.round(h * 0.3)),
          String(w >> 1),
          String(Math.round(h * 0.8)),
          '300',
        );
      }
      await sleep(1200);
    }
  }
};
/** Types [text] into the [n]-th text field on screen. */
/** Types [text] into the first empty text field, scrolling down until one is on screen (big text pushes fields down). */
const typeIntoEmpty = async (text) => {
  for (let tries = 0; tries < 8; tries++) {
    const f = xml()
      .split('<node ')
      .filter((x) => /class="android.widget.EditText"/.test(x) && /\btext=""/.test(x))
      .map((x) =>
        x
          .match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
          ?.slice(1)
          .map(Number),
      )
      .find((b) => b && b[2] > b[0] && b[3] > b[1]);
    if (f) {
      sh('input', 'tap', String((f[0] + f[2]) >> 1), String((f[1] + f[3]) >> 1));
      await sleep(800);
      sh('input', 'text', text);
      await sleep(500);
      return;
    }
    scrollDown();
    await sleep(1200);
  }
  throw new Error('no empty text field on screen');
};
const goHome = async () => {
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  // Until Home really shows: a print result screen (an earlier print) may come back first; answer it.
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    if (has('Recent jobs') && has('Photos')) return;
    if (has('Done')) tap('Done', true);
    else if (has('Home')) tap('Home', true);
  }
  throw new Error(`Home did not show (screen: ${labels().slice(0, 8).join(' / ')})`);
};
const top = () => sh('dumpsys', 'activity', 'activities').match(/topResumedActivity=.*? ([\w.]+)\//)?.[1] ?? '';

const result = { device: `API ${sh('getprop', 'ro.build.version.sdk').trim()}`, steps: [] };
try {
  try {
    adb(serial, ['uninstall', PKG]);
  } catch {
    // not installed
  }
  adb(serial, ['install', APK]);
  result.steps.push('release APK installed');
  adb(serial, ['logcat', '-c']);
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await sleep(6000);
  if (has('PrintSaathi needs an update on this phone')) {
    result.webViewGate = true;
    result.steps.push('old WebView: the update screen shows (no web app on this image)');
  } else {
    sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'six-photos', '--es', 'tag', `rel${Date.now()}`);
    await until('Received', () => has('All on one page'));
    tap('All on one page');
    // The real page is drawn by the engine: Ready with nothing still preparing and no error panel.
    await until(
      'Ready with the real page',
      () => has('Ready to print') && !has('Preparing') && !labels().some((l) => /couldn.t|can.t be/i.test(l)),
    );
    await sleep(3000);
    // PRINT may sit after the page on a short screen: scroll until it can be tapped.
    for (let i = 0; ; i++) {
      try {
        tap('PRINT');
        break;
      } catch (e) {
        if (i >= 6) throw e;
        scrollDown();
        await sleep(1200);
      }
    }
    await until("Android's print screen", () => top().includes('printspooler'), 30_000);
    result.steps.push('photos → All on one page → Ready → PRINT → print screen');
    sh('input', 'keyevent', 'KEYCODE_BACK');
    await sleep(3000);
    if (has('Did it print') || has('Printing')) result.steps.push('back from the print screen: the result screen');
    sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'pdf', '--es', 'tag', `rel${Date.now()}`);
    await until('the PDF', () => has('Start a new job') || (has('Ready to print') && has('1 PDF')));
    if (has('Start a new job')) await tapScrolling('Start a new job');
    await until('Ready for the PDF', () => has('Ready to print') && labels().some((l) => l.startsWith('1 PDF')));
    result.steps.push('PDF → Ready');

    // A locked PDF (synthetic, password RAMA1965) opens with the e-Aadhaar helper (review I5: release-only path).
    adb(serial, ['push', 'tests/fixtures/pdf/user-aes256.pdf', '/data/local/tmp/ps-locked.pdf']);
    sh(`run-as ${SENDER} sh -c 'mkdir -p cache/out && cp /data/local/tmp/ps-locked.pdf cache/out/'`);
    sh('am', 'start', '-n', `${SENDER}/.SendActivity`, '--es', 'mode', 'pushed', '--es', 'name', 'ps-locked.pdf');
    await until('the locked PDF', () => has('Start a new job') || has('Unlock'));
    if (has('Start a new job')) await tapScrolling('Start a new job');
    await until('Unlock', () => has('Unlock'));
    await tapScrolling('Unlock', true);
    await until('the Unlock screen', () => has('Unlock PDF'));
    await typeIntoEmpty('RAMA');
    sh('input', 'keyevent', 'KEYCODE_BACK'); // hide the keyboard
    await sleep(800);
    await typeIntoEmpty('1965');
    sh('input', 'keyevent', 'KEYCODE_BACK'); // hide the keyboard
    await sleep(800);
    await tapScrolling('Unlock', true);
    await until('Ready with the unlocked PDF', () => has('Ready to print') && !has('Unlock PDF') && !has('Preparing'));
    result.steps.push('locked PDF → Unlock (RAMA + 1965) → Ready');

    // An update in place keeps the shopkeeper's settings (review I5): save a shop name, install over, it is still there.
    await goHome();
    await tapScrolling('Settings');
    await until('Settings', () => has('Shop name'));
    await tapScrolling('Shop name');
    await typeIntoEmpty('SmokeShop');
    sh('input', 'keyevent', 'KEYCODE_BACK');
    await sleep(800);
    await tapScrolling('Save');
    await sleep(1500);
    adb(serial, ['install', '-r', APK]);
    await goHome();
    await tapScrolling('Settings');
    await until('the shop name kept after the update', () => labels().some((l) => l.includes('SmokeShop')), 20_000);
    result.steps.push('update in place (install -r): the shop name is still there');

    // The daily cleanup in its own cold process (review I5): kill the app, force the job, no crash.
    sh('input', 'keyevent', 'KEYCODE_HOME');
    await sleep(1500);
    sh('am', 'kill', PKG);
    await sleep(1500);
    sh('cmd', 'jobscheduler', 'run', '-f', PKG, '4201');
    await sleep(6000);
    result.steps.push('daily cleanup job run in a cold process');
    // WebView debugging is off in the release build (review M8): no devtools socket for the app's process.
    const pidNow = sh('pidof', PKG).trim();
    if (pidNow)
      result.webViewDevtoolsSocket = sh('cat', '/proc/net/unix').includes(`webview_devtools_remote_${pidNow}`);
  }
  sh('am', 'start', '-n', `${PKG}/.MainActivity`);
  await sleep(3000);
  const pid = sh('pidof', PKG).trim();
  // The app's processes' log (by its uid: appId on newer Android, userId on older). Its own tags (PrintSaathi, the
  // Capacitor bridge) must show no verbose/debug/info line; scripts/check-release.mjs proves the messages are gone
  // from the code itself. An empty log fails: the filter must have seen the app (review: no pass without looking).
  const uid = sh('dumpsys', 'package', PKG).match(/(?:appId|userId)=(\d+)/)?.[1];
  if (!uid) throw new Error("the app's user id was not found");
  // Older logcat has no --uid: the whole log with its uid column, filtered here (numeric, or u0_aNN before API 30).
  const names = new Set([uid, `u0_a${Number(uid) - 10000}`]);
  const log = adb(serial, ['logcat', '-d', '-v', 'uid'])
    .split('\n')
    .filter((l) => names.has(l.trim().split(/\s+/)[2] ?? ''));
  result.appLogLines = log.length;
  result.infoOrDebugLines = log.filter((l) => /\s[VDI]\s+(?:PrintSaathi|Capacitor\S*)\s*:/.test(l)).length;
  const crash = adb(serial, ['logcat', '-d', '-b', 'crash']);
  result.appCrash =
    /FATAL EXCEPTION[\s\S]{0,300}Process: in\.printsaathi\.app[,\s]/.test(crash) ||
    />>> in\.printsaathi\.app <<</.test(crash);
  result.appRunning = pid !== '';
  result.pass =
    result.appLogLines > 0 &&
    result.infoOrDebugLines === 0 &&
    !result.appCrash &&
    result.appRunning &&
    result.webViewDevtoolsSocket !== true;
} catch (e) {
  result.error = String(e.message ?? e);
  result.pass = false;
}
writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
