// Installs PrintSaathi on a phone over USB (PLAN Risk 11: ADB install, ₹0) and prints the phone's Android
// version and the APK path used. Usage:
//   node scripts/device/install.mjs --release [--serial <id>]      (the shopkeeper's phone: the checked release APK)
//   node scripts/device/install.mjs [--test-copy] [--serial <id>]  (debug test copy: emulators, or --test-copy)
// Debug builds are for testing; --release installs the no-INTERNET release build, signed with the PrintSaathi
// release key (scripts/release-key.mjs). Updates keep the shopkeeper's settings and jobs because the key stays the same.
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { adb } from './adb.mjs';

/** What to do when `adb install` fails, in plain words (the owner reads this). [variant]: what was being installed. */
export function installHelp(output, variant) {
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/.test(output))
    return variant === 'release'
      ? // The release APK was checked against the pinned key, so the phone holds a test copy, not the real app.
        'This phone has an earlier test copy of PrintSaathi (made for testing, not the real app). Uninstall PrintSaathi on the phone (its test jobs and settings go), then run this again. This is needed only once.'
      : "This phone has the real PrintSaathi. Never put a test copy on the shopkeeper's phone: install with --release.";
  if (/USER_RESTRICTED/.test(output))
    return 'The phone blocks installs over USB. On Xiaomi/Redmi/POCO: Developer options → turn on "Install via USB" (it needs a SIM and a Mi account), then run this again.';
  if (/ABORTED|User rejected/.test(output))
    return 'The phone asked whether to allow the install and nobody answered. Run this again and tap Install on the phone straight away.';
  if (/VERSION_DOWNGRADE/.test(output))
    return 'The phone has a newer PrintSaathi than this one: get the latest project, run npm run android:release, and try again.';
  if (/INSUFFICIENT_STORAGE/.test(output))
    return 'The phone does not have enough free space: delete some old videos, then run this again.';
  return `The install did not work: ${output.trim()}`;
}

/** True when a debug test copy would go on a real phone (only with --test-copy: never on the shopkeeper's phone by accident). */
export function debugOnRealPhone({ variant, emulator, testCopy }) {
  return variant === 'debug' && !emulator && !testCopy;
}

/** Chooses the target from `adb devices` output; never guesses between several phones. */
export function pickDevice(devicesOutput, requested) {
  const rows = devicesOutput
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((r) => r.length >= 2);
  const ready = rows.filter(([, state]) => state === 'device').map(([s]) => s);
  if (requested) {
    return ready.includes(requested)
      ? { ok: true, serial: requested }
      : { ok: false, message: `Phone ${requested} is not connected and ready.` };
  }
  if (rows.some(([, state]) => state === 'unauthorized'))
    return {
      ok: false,
      message: 'The phone is asking a question: tap "Allow USB debugging" on its screen, then run this again.',
    };
  if (ready.length === 0)
    return { ok: false, message: 'No phone found. Connect it with a USB cable and turn on USB debugging.' };
  if (ready.length > 1)
    return { ok: false, message: `More than one phone is connected (${ready.join(', ')}). Add --serial <id>.` };
  return { ok: true, serial: ready[0] };
}

if (process.argv[1]?.endsWith('install.mjs')) {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const serialArg = args.includes('--serial') ? args[args.indexOf('--serial') + 1] : undefined;
  const pick = pickDevice(adb(null, ['devices']), serialArg);
  if (!pick.ok) {
    console.error(pick.message);
    process.exit(1);
  }
  const variant = release ? 'release' : 'debug';
  const emulator = adb(pick.serial, ['shell', 'getprop', 'ro.kernel.qemu']).trim() === '1';
  if (debugOnRealPhone({ variant, emulator, testCopy: args.includes('--test-copy') })) {
    console.error(
      'This is a real phone: install the real app with --release. (A test copy has the debug key and needs --test-copy.)',
    );
    process.exit(1);
  }
  // The release APK is the one scripts/check-release.mjs checked (pinned key, size): the newest in release/.
  const checked = existsSync('release')
    ? readdirSync('release')
        .filter((f) => /^PrintSaathi-.*\.apk$/.test(f))
        .map((f) => path.resolve('release', f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    : undefined;
  const apk = release ? checked : path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  if (!apk || !existsSync(apk)) {
    console.error(`Build it first: npm run android:${release ? 'release' : 'build'}`);
    process.exit(1);
  }
  const androidVersion = adb(pick.serial, ['shell', 'getprop', 'ro.build.version.release']).trim();
  const sdk = adb(pick.serial, ['shell', 'getprop', 'ro.build.version.sdk']).trim();
  const model = adb(pick.serial, ['shell', 'getprop', 'ro.product.model']).trim();
  console.log(`Phone: ${model}, Android ${androidVersion} (API ${sdk})`);
  try {
    console.log(adb(pick.serial, ['install', '-r', apk]).trim());
  } catch (e) {
    console.error(installHelp(`${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`, variant));
    process.exit(1);
  }
  console.log(`Installed ${variant} build: ${path.relative(process.cwd(), apk)}`);
}
