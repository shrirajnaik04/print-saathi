// Shared adb helpers for device scripts. Resolves adb from ANDROID_HOME / the default SDK path.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function adbPath() {
  const sdk = process.env.ANDROID_HOME || path.win32.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const exe = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (!existsSync(exe)) throw new Error(`adb not found at ${exe}`);
  return exe;
}

export function adb(serial, args, opts = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  return execFileSync(adbPath(), full, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads a file from the debug app's private storage (run-as only works for debuggable builds). */
export function runAsCat(serial, pkg, rel) {
  try {
    return adb(serial, ['exec-out', 'run-as', pkg, 'cat', rel]);
  } catch {
    return null;
  }
}

/** Why [serial]'s phone must not run a destructive test (it uninstalls or clears the app): null for an emulator. */
export function testDeviceProblem({ qemu, bootQemu }) {
  return qemu.trim() === '1' || bootQemu.trim() === '1'
    ? null
    : 'This script deletes PrintSaathi and its data: it runs on test emulators only, never on a real phone.';
}

/** Stops unless [serial] is an emulator (Phase 12 review I2: The shopkeeper's phone may be the one connected). */
export function assertTestDevice(serial) {
  const prop = (p) => {
    try {
      return adb(serial, ['shell', 'getprop', p]);
    } catch {
      return '';
    }
  };
  const problem = testDeviceProblem({ qemu: prop('ro.kernel.qemu'), bootQemu: prop('ro.boot.qemu') });
  if (problem) throw new Error(problem);
}

/** Why checks that read the app's private files cannot run: null when the debug build is installed. */
export function debugBuildProblem(dumpsysPackage) {
  return /(?:pkgF|f)lags=\[[^\]]*DEBUGGABLE/.test(dumpsysPackage)
    ? null
    : "The PrintSaathi debug build is not installed: these checks read the app's private files, which only the debug build allows (otherwise they would pass without looking).";
}

/** Stops unless the debug build is installed (Phase 12 review I1: run-as fails on a release build). */
export function assertDebugBuild(serial, pkg = 'in.printsaathi.app') {
  const problem = debugBuildProblem(adb(serial, ['shell', 'dumpsys', 'package', pkg]));
  if (problem) throw new Error(problem);
}
