import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureReleaseKey, parseSigningProperties, signingPropertiesPath } from './release-key.mjs';

const deps = (over = {}) => ({
  propsPath: 'C:\\k\\signing.properties',
  exists: () => false,
  pinned: false,
  allowNewKey: false,
  runKeytool: () => {},
  write: () => {},
  remove: () => {},
  mkdir: () => {},
  randomPassword: () => 'S3cret-pass',
  ...over,
});

test('the signing details live outside the repo: PRINTSAATHI_SIGNING (absolute), else the user folder', () => {
  assert.equal(signingPropertiesPath({ PRINTSAATHI_SIGNING: 'E:\\keys\\s.properties' }), 'E:\\keys\\s.properties');
  assert.equal(
    signingPropertiesPath({ USERPROFILE: 'C:\\Users\\Shop' }),
    'C:\\Users\\Shop\\.printsaathi\\signing.properties',
  );
  assert.throws(() => signingPropertiesPath({}), /USERPROFILE/);
  assert.throws(() => signingPropertiesPath({ PRINTSAATHI_SIGNING: 'keys\\s.properties' }), /full path/);
});

test("an existing key is never replaced (updates on the shopkeeper's phone need the same key)", () => {
  const r = ensureReleaseKey(deps({ exists: () => true, runKeytool: () => assert.fail('no new key') }));
  assert.equal(r.created, false);
});

test('a keystore without its properties file is not overwritten either', () => {
  const r = ensureReleaseKey(
    deps({
      exists: (p) => p.endsWith('.jks'),
      runKeytool: () => assert.fail('no new key'),
      write: () => assert.fail(),
    }),
  );
  assert.equal(r.created, false);
  assert.match(r.message, /restore/i);
});

test('once the app has a released key, a new PC must restore it: no second key without the flag (review C1)', () => {
  const r = ensureReleaseKey(deps({ pinned: true, runKeytool: () => assert.fail('no new key') }));
  assert.equal(r.created, false);
  assert.match(r.message, /restore/i);
  const forced = ensureReleaseKey(deps({ pinned: true, allowNewKey: true }));
  assert.equal(forced.created, true);
});

test('a new key: the properties first (password safe even if keytool fails), keystore next to them', () => {
  const order = [];
  let written = '';
  const r = ensureReleaseKey(
    deps({
      runKeytool: (args, env) => {
        order.push('keytool');
        assert.ok(args.includes('-genkeypair') && args.includes('4096'));
        assert.ok(!args.includes('S3cret-pass'), 'the password is never on the command line (review M2)');
        assert.equal(env.PRINTSAATHI_KEY_PASS, 'S3cret-pass');
      },
      write: (_p, text) => {
        order.push('write');
        written = text;
      },
    }),
  );
  assert.equal(r.created, true);
  assert.deepEqual(order, ['write', 'keytool']);
  const p = parseSigningProperties(written);
  assert.equal(p.storeFile, 'printsaathi-release.jks', 'next to the properties: works on any PC (review I6)');
  assert.equal(p.storePassword, 'S3cret-pass');
  assert.equal(p.keyAlias, 'printsaathi');
});

test('keytool failing removes the half-made properties (review M3)', () => {
  let removed = '';
  assert.throws(() =>
    ensureReleaseKey(
      deps({
        runKeytool: () => {
          throw new Error('keytool failed');
        },
        remove: (p) => {
          removed = p;
        },
      }),
    ),
  );
  assert.equal(removed, 'C:\\k\\signing.properties');
});

test('parseSigningProperties reads key=value lines and ignores comments', () => {
  assert.deepEqual(parseSigningProperties('# c\nstoreFile=a.jks\nkeyAlias = b\n'), {
    storeFile: 'a.jks',
    keyAlias: 'b',
  });
});
