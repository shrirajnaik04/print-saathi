import assert from 'node:assert/strict';
import { test } from 'node:test';
import { debugBuildProblem, testDeviceProblem } from './adb.mjs';

test('destructive scripts run only on emulators (review I2)', () => {
  assert.equal(testDeviceProblem({ qemu: '1', bootQemu: '' }), null);
  assert.equal(testDeviceProblem({ qemu: '', bootQemu: '1' }), null);
  assert.match(testDeviceProblem({ qemu: '', bootQemu: '' }), /emulator/);
});

test('private-file checks need the debug build, else they would pass without looking (review I1)', () => {
  assert.equal(debugBuildProblem('pkgFlags=[ DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA ]'), null);
  assert.match(debugBuildProblem('pkgFlags=[ HAS_CODE ]'), /debug build/);
  assert.match(debugBuildProblem('Unable to find package: in.printsaathi.app'), /debug build/);
});
