// Release APK check (Phase 12): signed with THE PrintSaathi release key — its certificate fingerprint is pinned in
// android/release-cert.sha256, because the shopkeeper's phone only accepts updates signed with it (review C1) — within the 10 MB
// budget (PLAN §C), and with every info/debug log message gone from the code (PLAN §Q). Then copies the APK and its R8
// mapping (to read crash frames) to release/PrintSaathi-<version>.apk / -mapping.txt.
// Usage: node scripts/check-release.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAndroidEnv } from './android-env.mjs';
import { PINNED_CERT } from './release-key.mjs';

const MAX_BYTES = 10 * 1000 * 1000;
const KEEP_KEY =
  "Restore the key folder from your backup (see docs/INSTALL.md) and build again. Do not uninstall the app on the shopkeeper's phone.";

/** The first signer's certificate SHA-256 from `apksigner verify --print-certs`; null when unsigned. */
export function signerDigest(apksigner) {
  return apksigner.match(/certificate SHA-256 digest: ([0-9a-f]{64})/)?.[1] ?? null;
}

/** Problems with the release APK; empty = good. */
export function judgeRelease({ apksigner, pinned, bytes, dexHasInfoLogs }) {
  const problems = [];
  const digest = /^Verifies/m.test(apksigner) ? signerDigest(apksigner) : null;
  if (!digest) problems.push(`The release APK is not signed: the key folder is missing on this PC. ${KEEP_KEY}`);
  else if (digest !== pinned)
    problems.push(
      `The APK is signed, but not the PrintSaathi release key that the shopkeeper's phone has. ${KEEP_KEY}`,
    );
  if (bytes > MAX_BYTES) problems.push(`The APK is ${(bytes / 1e6).toFixed(1)} MB: over the 10 MB budget.`);
  if (dexHasInfoLogs) problems.push('Info/debug log messages are still in the release code (PLAN §Q).');
  return problems;
}

/** The fixed start of every Log.v/d/i message in the app's own code (text before the first ${...}). */
function infoLogMessages() {
  const files = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.kt') ? [path.join(d, e.name)] : [],
    );
  return files('android/app/src/main/java').flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/Log\.[vdi]\([^,]+,\s*"([^"$]{6,})/g)].map((m) => m[1]),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = resolveAndroidEnv(process.env);
  const bin = (name) => path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? `${name}.exe` : name);
  const outDir = path.resolve('android/app/build/outputs/apk/release');
  const apk = path.join(outDir, 'app-release.apk');
  if (!existsSync(apk)) {
    console.error(`No signed release APK. ${KEEP_KEY}`);
    process.exit(1);
  }
  const tools = path.join(env.ANDROID_HOME, 'build-tools');
  const latest = readdirSync(tools)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  let signer = '';
  try {
    // No shell: apksigner's jar on the bundled JDK (review M7).
    signer = execFileSync(
      bin('java'),
      ['-jar', path.join(tools, latest, 'lib', 'apksigner.jar'), 'verify', '--verbose', '--print-certs', apk],
      { encoding: 'utf8' },
    );
  } catch (e) {
    signer = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  // The code inside the APK: no info/debug message may be left (review M6).
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ps-dex-'));
  execFileSync(bin('jar'), ['xf', apk], { cwd: tmp });
  const dex = readdirSync(tmp)
    .filter((f) => f.endsWith('.dex'))
    .map((f) => readFileSync(path.join(tmp, f)).toString('latin1'))
    .join('\n');
  rmSync(tmp, { recursive: true, force: true });
  const messages = infoLogMessages();
  const left = messages.filter((m) => dex.includes(m));
  if (!existsSync(PINNED_CERT)) {
    console.error(
      `No pinned release key yet. If this is the first release and the key folder is backed up, save this line to ${PINNED_CERT}:\n${signerDigest(signer)}`,
    );
    process.exit(1);
  }
  const problems = judgeRelease({
    apksigner: signer,
    pinned: readFileSync(PINNED_CERT, 'utf8').trim(),
    bytes: statSync(apk).size,
    dexHasInfoLogs: left.length > 0,
  });
  if (left.length) problems.push(`Left in the code: ${left.join(' | ')}`);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(path.join(outDir, 'output-metadata.json'), 'utf8'));
  const version = String(meta.elements?.[0]?.versionName ?? 'dev')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+$/, '');
  mkdirSync('release', { recursive: true });
  const out = path.join('release', `PrintSaathi-${version}.apk`);
  copyFileSync(apk, out);
  const mapping = path.resolve('android/app/build/outputs/mapping/release/mapping.txt');
  if (existsSync(mapping)) copyFileSync(mapping, path.join('release', `PrintSaathi-${version}-mapping.txt`));
  console.log(
    `Release APK OK: signed with the pinned PrintSaathi key, ${(statSync(apk).size / 1e6).toFixed(1)} MB, ${messages.length} info messages stripped → ${out} (+ mapping)`,
  );
}
