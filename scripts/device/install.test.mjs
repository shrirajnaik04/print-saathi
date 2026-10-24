import assert from 'node:assert/strict';
import { test } from 'node:test';
import { debugOnRealPhone, installHelp, pickDevice } from './install.mjs';

const out = (...lines) => `List of devices attached\n${lines.join('\n')}\n\n`;

test('picks the only connected device', () => {
  assert.deepEqual(pickDevice(out('R58M123ABC\tdevice')), { ok: true, serial: 'R58M123ABC' });
});

test('refuses to guess when several devices are connected', () => {
  const r = pickDevice(out('R58M123ABC\tdevice', 'emulator-5554\tdevice'));
  assert.equal(r.ok, false);
  assert.match(r.message, /more than one/i);
});

test('uses the requested serial only if it is connected and authorised', () => {
  const o = out('R58M123ABC\tdevice', 'emulator-5554\tdevice');
  assert.deepEqual(pickDevice(o, 'emulator-5554'), { ok: true, serial: 'emulator-5554' });
  assert.equal(pickDevice(o, 'XYZ').ok, false);
});

test('explains an unauthorised phone in plain words', () => {
  const r = pickDevice(out('R58M123ABC\tunauthorized'));
  assert.equal(r.ok, false);
  assert.match(r.message, /Allow USB debugging/);
});

test('explains when nothing is connected', () => {
  const r = pickDevice(out());
  assert.equal(r.ok, false);
  assert.match(r.message, /No phone/);
});

test('release over an earlier test copy: uninstall once, said plainly (the release itself was checked)', () => {
  const m = installHelp(
    'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package in.printsaathi.app signatures do not match]',
    'release',
  );
  assert.match(m, /test copy/i);
  assert.match(m, /uninstall/i);
  assert.match(m, /only once/i);
});

test("a test copy over the real app is refused: never uninstall the shopkeeper's real app (review I3)", () => {
  const m = installHelp('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]', 'debug');
  assert.match(m, /--release/);
  assert.doesNotMatch(m, /uninstall PrintSaathi/i);
});

test('brand-specific refusals in plain words (review I7)', () => {
  assert.match(
    installHelp('Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]', 'release'),
    /Install via USB/,
  );
  assert.match(installHelp('Failure [INSTALL_FAILED_ABORTED: User rejected permissions]', 'release'), /tap Install/i);
  assert.match(installHelp('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]', 'release'), /newer/i);
  assert.match(installHelp('Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]', 'release'), /space/i);
});

test('anything else passes the message through', () => {
  assert.match(installHelp('Failure [SOMETHING_ELSE]', 'release'), /SOMETHING_ELSE/);
});

test('a test copy never goes on a real phone by accident (review I3)', () => {
  assert.equal(debugOnRealPhone({ variant: 'debug', emulator: false, testCopy: false }), true);
  assert.equal(debugOnRealPhone({ variant: 'debug', emulator: false, testCopy: true }), false);
  assert.equal(debugOnRealPhone({ variant: 'debug', emulator: true, testCopy: false }), false);
  assert.equal(debugOnRealPhone({ variant: 'release', emulator: false, testCopy: false }), false);
});
