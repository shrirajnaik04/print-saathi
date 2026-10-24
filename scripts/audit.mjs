// Dependency audit (PLAN §Q supply chain): `npm audit` of what ships, and osv-scanner over the npm lockfile and the
// Android release runtime classpath. Fails only on a known vulnerability in something the app ships; the full report
// (build tools, test tools, dev packages included) is written to the file given, for review.
// Usage: node scripts/audit.mjs [report.txt]   (needs the network: run on the PC, never in the app)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Only the lines of a Gradle lockfile that end up in the release APK (`releaseRuntimeClasspath`). */
export function releaseLock(text) {
  const lines = text.split(/\r?\n/).filter((l) => /^[^#=]+=.*\breleaseRuntimeClasspath\b/.test(l));
  return `${lines.join('\n')}\nempty=\n`;
}

/** Packages with known vulnerabilities in an osv-scanner JSON report, as "name@version (ids)". */
export function vulnerable(report) {
  const out = [];
  for (const r of report.results ?? [])
    for (const p of r.packages ?? [])
      if ((p.vulnerabilities ?? []).length > 0)
        out.push(`${p.package.name}@${p.package.version} (${p.vulnerabilities.map((v) => v.id).join(', ')})`);
  return out;
}

/** True when every copy of [name]@[version] in an npm lockfile is a dev dependency (unknown: false, so it fails). */
export function devOnly(lock, name, version) {
  const copies = Object.entries(lock.packages ?? {}).filter(
    ([key, p]) => (key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`)) && p.version === version,
  );
  return copies.length > 0 && copies.every(([, p]) => p.dev === true);
}

function osvBinary() {
  // winget installs it under its package folder and may not link it anywhere.
  const packages = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
    : '';
  const dir =
    packages && existsSync(packages) ? readdirSync(packages).find((d) => d.startsWith('Google.OSVScanner')) : '';
  const exe = dir ? path.join(packages, dir, 'osv-scanner.exe') : '';
  return exe && existsSync(exe) ? exe : 'osv-scanner'; // else on PATH
}

function osv(args) {
  const r = spawnSync(osvBinary(), ['scan', 'source', '--format', 'json', ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (r.error)
    throw new Error(`osv-scanner did not run (${r.error.message}): install it (winget install Google.OSVScanner)`);
  return osvReport(r.status, r.stdout);
}

/** osv-scanner's JSON, or an error when it did not really scan (exit 0 = clean, 1 = advisories found). */
export function osvReport(status, stdout) {
  let report = null;
  try {
    report = JSON.parse(stdout);
  } catch {
    // not JSON: a failed run
  }
  if ((status !== 0 && status !== 1) || !report || !Array.isArray(report.results))
    throw new Error(`osv-scanner failed (exit ${status}): no report — the audit is not a pass`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportFile = process.argv[2];
  const lines = [];
  let failed = false;

  // 1. npm: what ships (dependencies only).
  const npm = spawnSync('npm', ['audit', '--omit=dev'], { encoding: 'utf8', shell: process.platform === 'win32' });
  lines.push('## npm audit --omit=dev', npm.stdout.trim());
  if (npm.status !== 0) failed = true;

  // 2. osv-scanner over the npm lockfile: dev packages are reported but do not fail.
  const npmOsv = osv(['-L', 'package-lock.json']);
  const npmLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const npmHits = vulnerable(npmOsv);
  const npmShipped = npmHits.filter((h) => {
    const [, name, version] = h.match(/^(.+)@([^@ ]+) \(/) ?? [];
    return !devOnly(npmLock, name, version);
  });
  lines.push('## osv-scanner package-lock.json', npmHits.length ? npmHits.join('\n') : 'No issues found');
  if (npmShipped.length) failed = true;

  // 3. osv-scanner over the release runtime classpath (what is inside the APK).
  const dir = mkdtempSync(path.join(tmpdir(), 'ps-osv-'));
  const lock = path.join(dir, 'gradle.lockfile');
  writeFileSync(lock, releaseLock(readFileSync('android/app/gradle.lockfile', 'utf8')));
  const apkHits = vulnerable(osv(['-L', lock]));
  const count = readFileSync(lock, 'utf8').split('\n').length - 2;
  if (count <= 0) throw new Error('no release runtime packages in android/app/gradle.lockfile: nothing was audited');
  lines.push(
    `## osv-scanner release runtime classpath (${count} packages)`,
    apkHits.length ? apkHits.join('\n') : 'No issues found',
  );
  if (apkHits.length) failed = true;

  // 4. For review only: everything else Gradle resolves (build tools, lint, test runners on the PC).
  const all = vulnerable(osv(['-L', 'android/app/gradle.lockfile', '-L', 'android/buildscript-gradle.lockfile']));
  lines.push(
    `## for review: build/test tool classpaths (not in the APK): ${all.length} packages with advisories`,
    ...all,
  );

  const text = `${lines.join('\n\n')}\n\nVERDICT: ${failed ? 'FAIL — a shipped dependency has a known vulnerability' : 'PASS — nothing shipped has a known vulnerability'}\n`;
  if (reportFile) writeFileSync(reportFile, text);
  console.log(text.split('## for review')[0] + (failed ? 'VERDICT: FAIL' : 'VERDICT: PASS'));
  process.exit(failed ? 1 : 0);
}
