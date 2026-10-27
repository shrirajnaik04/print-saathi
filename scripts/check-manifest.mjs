// Release-manifest guard (PLAN §D7, §Q): proves the privacy/security promises are in the BUILT APK.
// It reads the APK's binary manifest through `aapt2 dump xmltree`, so library merges are included and
// comments, quoting tricks or a stale intermediate file cannot produce a false PASS.
// Usage: node scripts/check-manifest.mjs [release|debug]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = 'in.printsaathi.app';
const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
// Security attributes whose value must be a literal: a resource reference (@0x7f…) cannot be proven statically.
const LITERAL_ONLY = ['exported', 'allowBackup', 'isolatedProcess', 'debuggable', 'usesCleartextTraffic'];
const MAIN = `${PKG}.MainActivity`;
const ENGINE = `${PKG}.engine.isolated.EngineService`;
// androidx.core adds this signature-level permission for its non-exported dynamic receivers.
const ALLOWED_PERMISSIONS = new Set([`${PKG}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`]);
// Round 9: every kind of file the engine names (PDF, photos, Word, PowerPoint, Excel, OpenDocument, RTF, CSV, text)
// must reach PrintSaathi from the share sheet.
export const SHARE_TYPES = [
  'image/*',
  'application/pdf',
  'application/octet-stream',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'text/rtf',
  'text/csv',
  'text/comma-separated-values',
];

/** Parses `aapt2 dump xmltree` output into {name, attrs, children}; nesting comes from indentation. */
export function parseXmlTree(dump) {
  const root = { name: '#root', attrs: {}, children: [], indent: -1 };
  const stack = [root];
  for (const line of dump.split(/\r?\n/)) {
    const m = line.match(/^( *)([EA]): (.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] === 'E') {
      while (stack.at(-1).indent >= indent) stack.pop();
      const el = { name: m[3].replace(/ \(line=\d+\)$/, ''), attrs: {}, children: [], indent };
      stack.at(-1).children.push(el);
      stack.push(el);
    } else {
      while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
      // "<ns>:name(0x..)=value" or "name=value"; a quoted value is taken up to its closing quote only.
      // Only android-namespace (and namespace-less) attributes are keyed by their bare name, so another
      // namespace's "exported" can never overwrite android:exported.
      const a = m[3].match(/^(?:([^=]*):)?([A-Za-z]+)(?:\(0x[0-9a-f]+\))?=(?:"((?:[^"\\]|\\.)*)"|(\S+))/);
      if (a) {
        const key = a[1] === undefined || a[1] === ANDROID_NS ? a[2] : `${a[1]}:${a[2]}`;
        stack.at(-1).attrs[key] = a[3] ?? a[4];
      }
    }
  }
  return root;
}

/** Descendants whose element name matches [match] (a name, or a predicate on the name). */
const all = (el, match) => {
  const ok = typeof match === 'function' ? match : (n) => n === match;
  return el.children.flatMap((c) => [...(ok(c.name) ? [c] : []), ...all(c, ok)]);
};
const isExported = (el) =>
  el.attrs.exported === 'true' ||
  (el.attrs.exported === undefined && el.children.some((c) => c.name === 'intent-filter'));

export function checkManifest(dump, variant) {
  const v = [];
  const root = parseXmlTree(dump);
  const allowed = new Set(ALLOWED_PERMISSIONS);
  if (variant === 'debug') allowed.add('android.permission.INTERNET');
  // uses-permission, uses-permission-sdk-23 and any future variant all grant permissions.
  for (const p of all(root, (n) => n.startsWith('uses-permission'))) {
    if (!allowed.has(p.attrs.name)) v.push(`${variant} APK requests ${p.attrs.name} (not on the allowlist)`);
  }

  const app = all(root, 'application')[0];
  if (!app) return [...v, 'no <application> element'];
  for (const el of [app, ...all(app, () => true)]) {
    for (const k of LITERAL_ONLY) {
      if (el.attrs[k]?.startsWith('@'))
        v.push(`${el.name} ${el.attrs.name ?? ''} sets ${k} through a resource reference`);
    }
  }
  if (app.attrs.allowBackup !== 'false') v.push('application must set android:allowBackup="false"');
  if (!app.attrs.dataExtractionRules) v.push('application must set android:dataExtractionRules (Android 12+)');
  if (!app.attrs.fullBackupContent) v.push('application must set android:fullBackupContent (Android 6-11)');
  if (variant === 'release' && app.attrs.debuggable === 'true') v.push('release APK must not be debuggable');
  if (app.attrs.usesCleartextTraffic === 'true') v.push('application must not set usesCleartextTraffic="true"');

  const activities = all(app, (n) => n === 'activity' || n === 'activity-alias');
  if (!activities.some((a) => a.attrs.name === MAIN && isExported(a))) v.push(`${MAIN} must exist and be exported`);
  for (const a of activities) {
    if (isExported(a) && a.attrs.name !== MAIN) v.push(`activity ${a.attrs.name} must not be exported`);
  }

  const main = activities.find((a) => a.attrs.name === MAIN);
  const shared = new Set(
    (main ? all(main, 'intent-filter') : [])
      .filter((f) => all(f, 'action').some((a) => a.attrs.name === 'android.intent.action.SEND'))
      .flatMap((f) => all(f, 'data').map((d) => d.attrs.mimeType)),
  );
  for (const t of SHARE_TYPES) if (!shared.has(t)) v.push(`the share sheet does not offer PrintSaathi for ${t}`);

  const services = all(app, 'service');
  const engine = services.find((s) => s.attrs.name === ENGINE);
  if (!engine) v.push(`${ENGINE} is missing`);
  else if (engine.attrs.isolatedProcess !== 'true') v.push(`${ENGINE} must set android:isolatedProcess="true"`);
  for (const c of [...services, ...all(app, 'provider'), ...all(app, 'receiver')]) {
    if (isExported(c)) v.push(`${c.name} ${c.attrs.name} must not be exported`);
  }
  return v;
}

/** True when the APK predates any input file, i.e. it was not rebuilt after the last change. */
export const isStale = (apkMtimeMs, sourceMtimesMs) => sourceMtimesMs.some((t) => t > apkMtimeMs);

/**
 * `cap sync` rewrites these on every build even when unchanged, and Gradle (correctly) skips the APK then.
 * Their content is tracked by Gradle's own up-to-date check, so they are not compared by time.
 */
export const isSyncedAsset = (p) =>
  /[\\/]assets[\\/](public[\\/]|capacitor\.config\.json$|capacitor\.plugins\.json$)|[\\/]res[\\/]xml[\\/]config\.xml$/.test(
    p,
  );

function mtimes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return mtimes(p);
    return isSyncedAsset(p) ? [] : [statSync(p).mtimeMs];
  });
}

function aapt2() {
  const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  const bt = path.join(sdk, 'build-tools');
  const versions = existsSync(bt)
    ? readdirSync(bt).filter((d) => existsSync(path.join(bt, d, 'aapt2.exe')) || existsSync(path.join(bt, d, 'aapt2')))
    : [];
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const dir = versions.at(-1);
  if (!dir) throw new Error(`no aapt2 under ${bt}`);
  const exe = path.join(bt, dir, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
  return exe;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const variant = process.argv[2] === 'debug' ? 'debug' : 'release';
  const apk = path.resolve(`android/app/build/outputs/apk/${variant}/app-${variant}.apk`);
  if (!existsSync(apk)) {
    console.error(
      `FAIL ${apk} not found; build it first (npm run android:${variant === 'debug' ? 'build' : 'release'})`,
    );
    process.exit(1);
  }
  const sources = [
    ...mtimes(path.resolve('android/app/src/main')),
    ...mtimes(path.resolve(`android/app/src/${variant}`)),
    statSync(path.resolve('android/app/build.gradle')).mtimeMs,
  ];
  if (isStale(statSync(apk).mtimeMs, sources)) {
    console.error(
      `FAIL ${path.relative(process.cwd(), apk)} is older than android/app sources; rebuild before checking`,
    );
    process.exit(1);
  }
  const r = spawnSync(aapt2(), ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`FAIL aapt2 exited ${r.status}: ${r.stderr}`);
    process.exit(1);
  }
  const violations = checkManifest(r.stdout, variant);
  console.log(
    `${violations.length ? 'FAIL' : 'ok  '} ${path.relative(process.cwd(), apk)} (binary manifest via aapt2)`,
  );
  for (const x of violations) console.log(`     - ${x}`);
  process.exit(violations.length ? 1 : 0);
}
