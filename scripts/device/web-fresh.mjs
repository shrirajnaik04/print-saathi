// Device runs install the web app that `npm run android:sync` last copied into the Android project. If a web source
// is newer than that copy, the phone would run an old web app (Phase 4: Ready called a removed native method and
// quietly kept its drawings). Usage: node scripts/device/web-fresh.mjs → exit 1 and the stale files when out of date.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUNDLE = 'android/app/src/main/assets/public/index.html';
const INPUTS = ['src', 'public', 'index.html', 'vite.config.ts', 'package-lock.json'];

function files(p) {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => files(join(p, n)));
}

/** Web inputs (relative paths) modified after the bundle was copied into the app; empty when fresh. */
export function staleWebInputs(root) {
  const bundle = join(root, BUNDLE);
  if (!existsSync(bundle)) return ['(no web bundle in the Android app)'];
  const built = statSync(bundle).mtimeMs;
  return INPUTS.flatMap((i) => files(join(root, i)))
    .filter((f) => !/\.test\.[jt]sx?$/.test(f) && statSync(f).mtimeMs > built)
    .map((f) => relative(root, f).replaceAll('\\', '/'))
    .sort();
}

if (process.argv[1]?.endsWith('web-fresh.mjs')) {
  const stale = staleWebInputs(process.cwd());
  if (stale.length) {
    console.error(`The web app inside the Android build is older than: ${stale.slice(0, 5).join(', ')}`);
    console.error('Run `npm run android:sync` first.');
    process.exitCode = 1;
  }
}
