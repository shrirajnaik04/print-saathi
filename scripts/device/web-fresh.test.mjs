import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { staleWebInputs } from './web-fresh.mjs';

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'webfresh-'));
  mkdirSync(join(root, 'src/screens'), { recursive: true });
  mkdirSync(join(root, 'android/app/src/main/assets/public'), { recursive: true });
  writeFileSync(join(root, 'src/screens/a.tsx'), 'x');
  writeFileSync(join(root, 'index.html'), 'x');
  writeFileSync(join(root, 'android/app/src/main/assets/public/index.html'), 'x');
  return root;
}
const at = (p, s) => utimesSync(p, s, s);

test('a web source newer than the bundle in the app is named (device runs would test an old web app)', () => {
  const r = tree();
  at(join(r, 'android/app/src/main/assets/public/index.html'), 1000);
  at(join(r, 'index.html'), 900);
  at(join(r, 'src/screens/a.tsx'), 2000);
  assert.deepEqual(staleWebInputs(r), ['src/screens/a.tsx']);
});

test('a bundle built after every source is fresh', () => {
  const r = tree();
  at(join(r, 'src/screens/a.tsx'), 900);
  at(join(r, 'index.html'), 900);
  at(join(r, 'android/app/src/main/assets/public/index.html'), 1000);
  assert.deepEqual(staleWebInputs(r), []);
});

test('no bundle at all is stale', () => {
  const r = mkdtempSync(join(tmpdir(), 'webfresh-'));
  assert.deepEqual(staleWebInputs(r), ['(no web bundle in the Android app)']);
});

test('test files are not part of the web app and never make it stale', () => {
  const r = tree();
  writeFileSync(join(r, 'src/screens/a.test.ts'), 'x');
  at(join(r, 'src/screens/a.tsx'), 900);
  at(join(r, 'index.html'), 900);
  at(join(r, 'android/app/src/main/assets/public/index.html'), 1000);
  at(join(r, 'src/screens/a.test.ts'), 2000);
  assert.deepEqual(staleWebInputs(r), []);
});
