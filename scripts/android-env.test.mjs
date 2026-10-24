import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolveAndroidEnv, STUDIO_JBR } from './android-env.mjs';

const exists = (set) => (p) => set.has(p);

test('uses JAVA_HOME and ANDROID_HOME from the environment when they exist', () => {
  const r = resolveAndroidEnv({ JAVA_HOME: 'J', ANDROID_HOME: 'S', LOCALAPPDATA: 'L' }, exists(new Set(['J', 'S'])));
  assert.deepEqual(r, { JAVA_HOME: 'J', ANDROID_HOME: 'S', ANDROID_SDK_ROOT: 'S' });
});

test('falls back to Android Studio JBR and the default SDK path', () => {
  const jbr = String.raw`C:\Program Files\Android\Android Studio\jbr`;
  const sdk = String.raw`L\Android\Sdk`;
  const r = resolveAndroidEnv({ LOCALAPPDATA: 'L' }, exists(new Set([jbr, sdk])));
  assert.equal(r.JAVA_HOME, jbr);
  assert.equal(r.ANDROID_HOME, sdk);
});

test('throws a clear error when no JDK can be found', () => {
  assert.throws(() => resolveAndroidEnv({ LOCALAPPDATA: 'L' }, () => false), /JDK/);
});

test('the default JBR constant is a real Windows path on this machine', { skip: process.platform !== 'win32' }, () => {
  assert.ok(STUDIO_JBR.includes('\\Android Studio\\'));
  assert.ok(existsSync(STUDIO_JBR), `expected Android Studio JBR at ${STUDIO_JBR}`);
});
