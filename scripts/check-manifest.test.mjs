import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkManifest, isStale, isSyncedAsset, parseXmlTree } from './check-manifest.mjs';

// A real `aapt2 dump xmltree` of the release APK's binary manifest (no comments or entities can exist there).
const good = readFileSync(new URL('./fixtures/apk-manifest-release.txt', import.meta.url), 'utf8').replaceAll(
  '\r\n',
  '\n',
);
const NS = 'http://schemas.android.com/apk/res/android';
const has = (violations, text) => violations.some((v) => v.includes(text));

/** Inserts attribute/element lines right after the first line matching `anchor`, at that line's child indent. */
function insertAfter(dump, anchor, lines) {
  const all = dump.split('\n');
  const i = all.findIndex((l) => l.includes(anchor));
  assert.ok(i >= 0, `anchor not found: ${anchor}`);
  const indent = all[i].match(/^ */)[0].length + 2;
  all.splice(i + 1, 0, ...lines.map((l) => ' '.repeat(indent) + l));
  return all.join('\n');
}
const permission = (name) => ['E: uses-permission (line=1)', `  A: ${NS}:name(0x01010003)="${name}" (Raw: "${name}")`];
const component = (kind, name, extra = []) => [
  `E: ${kind} (line=1)`,
  `  A: ${NS}:name(0x01010003)="${name}" (Raw: "${name}")`,
  ...extra.map((a) => `  A: ${NS}:${a}`),
];

test('parser nests elements by indentation and attaches attributes to the right element', () => {
  const root = parseXmlTree(good);
  const app = root.children.find((e) => e.name === 'manifest').children.find((e) => e.name === 'application');
  const main = app.children.find((e) => e.attrs.name === 'in.printsaathi.app.MainActivity');
  assert.equal(main.attrs.exported, 'true');
  assert.equal(main.children.filter((e) => e.name === 'intent-filter').length, 2);
  assert.equal(app.attrs.allowBackup, 'false');
});

test('the real release manifest passes', () => {
  assert.deepEqual(checkManifest(good, 'release'), []);
});

test('INTERNET is rejected in release and allowed in debug', () => {
  const m = insertAfter(good, 'E: manifest', permission('android.permission.INTERNET'));
  assert.ok(has(checkManifest(m, 'release'), 'INTERNET'));
  assert.deepEqual(checkManifest(m, 'debug'), []);
});

test('any other permission is rejected in both variants', () => {
  const m = insertAfter(good, 'E: manifest', permission('android.permission.READ_EXTERNAL_STORAGE'));
  assert.ok(has(checkManifest(m, 'release'), 'READ_EXTERNAL_STORAGE'));
  assert.ok(has(checkManifest(m, 'debug'), 'READ_EXTERNAL_STORAGE'));
});

test('backup and transfer settings are required', () => {
  const noBackupFalse = good.replace('allowBackup(0x01010280)=false', 'allowBackup(0x01010280)=true');
  assert.ok(has(checkManifest(noBackupFalse, 'release'), 'allowBackup'));
  const noRules = good.replace(/^.*dataExtractionRules.*\n/m, '');
  assert.ok(has(checkManifest(noRules, 'release'), 'dataExtractionRules'));
  const noFull = good.replace(/^.*fullBackupContent.*\n/m, '');
  assert.ok(has(checkManifest(noFull, 'release'), 'fullBackupContent'));
});

test('debuggable and cleartext traffic are rejected in release', () => {
  const m = insertAfter(good, 'E: application', [
    `A: ${NS}:debuggable(0x0101000f)=true`,
    `A: ${NS}:usesCleartextTraffic(0x010104ec)=true`,
  ]);
  const v = checkManifest(m, 'release');
  assert.ok(has(v, 'debuggable'));
  assert.ok(has(v, 'usesCleartextTraffic'));
});

test('only the exact MainActivity may be exported', () => {
  const other = good.replace(
    /("in\.printsaathi\.app\.WebViewGateActivity"[^\n]*\n[^\n]*exported\(0x01010010\)=)false/,
    '$1true',
  );
  assert.ok(has(checkManifest(other, 'release'), 'WebViewGateActivity'));
  const lookalike = insertAfter(
    good,
    'E: application',
    component('activity', 'evil.MainActivity', ['exported(0x01010010)=true']),
  );
  assert.ok(has(checkManifest(lookalike, 'release'), 'evil.MainActivity'));
});

test('an activity with an intent filter and no exported attribute counts as exported', () => {
  const m = insertAfter(good, 'E: application', [
    ...component('activity', 'in.printsaathi.app.Sneaky'),
    '  E: intent-filter (line=1)',
  ]);
  assert.ok(has(checkManifest(m, 'release'), 'Sneaky'));
});

test('MainActivity must exist and be exported', () => {
  const m = good.replace(
    '"in.printsaathi.app.MainActivity" (Raw: "in.printsaathi.app.MainActivity")',
    '"x.Y" (Raw: "x.Y")',
  );
  assert.ok(has(checkManifest(m, 'release'), 'MainActivity'));
});

test('EngineService must exist, be isolated and not exported', () => {
  const missing = good.replace(/EngineService/g, 'OtherService');
  assert.ok(has(checkManifest(missing, 'release'), 'EngineService'));
  const notIsolated = good.replace('isolatedProcess(0x010103a9)=true', 'isolatedProcess(0x010103a9)=false');
  assert.ok(has(checkManifest(notIsolated, 'release'), 'isolatedProcess'));
});

test('any exported service, provider or receiver is rejected', () => {
  for (const kind of ['service', 'provider', 'receiver']) {
    const m = insertAfter(
      good,
      'E: application',
      component(kind, `lib.Exported${kind}`, ['exported(0x01010010)=true']),
    );
    assert.ok(has(checkManifest(m, 'release'), `lib.Exported${kind}`), kind);
  }
});

test('text that merely looks like an attribute inside a string value is ignored', () => {
  const m = insertAfter(good, 'E: application', [
    'E: meta-data (line=1)',
    `  A: ${NS}:name(0x01010003)="note" (Raw: "note")`,
    `  A: ${NS}:value(0x01010024)="android:exported=true allowBackup=true" (Raw: "x")`,
  ]);
  assert.deepEqual(checkManifest(m, 'release'), []);
});

test('an APK older than any source file is stale', () => {
  assert.equal(isStale(100, [50, 99]), false);
  assert.equal(isStale(100, [50, 101]), true);
});

// Gate 3 finding 1: four ways a library merge could slip past the check.
test('uses-permission-sdk-23 INTERNET is rejected in release', () => {
  const m = insertAfter(good, 'E: manifest', [
    'E: uses-permission-sdk-23 (line=1)',
    `  A: ${NS}:name(0x01010003)="android.permission.INTERNET" (Raw: "android.permission.INTERNET")`,
  ]);
  assert.ok(has(checkManifest(m, 'release'), 'INTERNET'));
});

test('an exported activity-alias is rejected', () => {
  const m = insertAfter(
    good,
    'E: application',
    component('activity-alias', 'in.printsaathi.app.Alias', ['exported(0x01010010)=true']),
  );
  assert.ok(has(checkManifest(m, 'release'), 'Alias'));
});

test('security attributes given as resource references are rejected (cannot be proven statically)', () => {
  const m = insertAfter(
    good,
    'E: application',
    component('service', 'lib.RefService', ['exported(0x01010010)=@0x7f050001']),
  );
  assert.ok(has(checkManifest(m, 'release'), 'lib.RefService'));
  const backup = good.replace('allowBackup(0x01010280)=false', 'allowBackup(0x01010280)=@0x7f050002');
  assert.ok(has(checkManifest(backup, 'release'), 'allowBackup'));
});

test('a non-android attribute with the same local name cannot override android:exported', () => {
  const m = insertAfter(good, 'E: application', [
    ...component('receiver', 'lib.Sneaky', ['exported(0x01010010)=true']),
    '  A: http://schemas.android.com/apk/res-auto:exported=false',
  ]);
  assert.ok(has(checkManifest(m, 'release'), 'lib.Sneaky'));
});

test('files cap sync regenerates are not treated as APK sources (Gradle tracks their content)', () => {
  assert.equal(isSyncedAsset(String.raw`D:\p\android\app\src\main\assets\public\index.html`), true);
  assert.equal(isSyncedAsset('android/app/src/main/assets/capacitor.config.json'), true);
  assert.equal(isSyncedAsset('android/app/src/main/assets/capacitor.plugins.json'), true);
  assert.equal(isSyncedAsset('android/app/src/main/res/xml/config.xml'), true); // Cordova config, rewritten by cap sync
  assert.equal(isSyncedAsset('android/app/src/main/res/xml/backup_rules.xml'), false);
  assert.equal(isSyncedAsset('android/app/src/main/AndroidManifest.xml'), false);
  assert.equal(isSyncedAsset('android/app/src/main/java/x/Decode.kt'), false);
});
