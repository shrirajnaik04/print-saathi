import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeRelease, signerDigest } from './check-release.mjs';

const PINNED = '7fbe90457a397b43778391618ff7515dc9fe30f880e1fb7d5be39dab69b6971c';
const out = (digest) => `Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
V2 Signer: certificate DN: CN=PrintSaathi, O=PrintSaathi shop
V2 Signer: certificate SHA-256 digest: ${digest}
`;
const good = { apksigner: out(PINNED), pinned: PINNED, bytes: 1_500_000, dexHasInfoLogs: false };

test('signed with the pinned PrintSaathi key, small, logs stripped: passes', () => {
  assert.deepEqual(judgeRelease(good), []);
});

test('a new key with the same name is refused, with "do not uninstall" (review C1)', () => {
  const r = judgeRelease({ ...good, apksigner: out('0'.repeat(64)) }).join();
  assert.match(r, /not the PrintSaathi release key/);
  assert.match(r, /restore/i);
  assert.match(r, /not uninstall/i);
});

test('an unsigned APK says to restore the key folder first', () => {
  const r = judgeRelease({ ...good, apksigner: 'DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF' }).join();
  assert.match(r, /restore/i);
});

test('an APK over 10 MB fails the size budget (PLAN §C)', () => {
  assert.match(judgeRelease({ ...good, bytes: 10_500_000 }).join(), /10 MB/);
});

test('info logs left in the code fail (PLAN §Q: release builds strip debug logs)', () => {
  assert.match(judgeRelease({ ...good, dexHasInfoLogs: true }).join(), /info/i);
});

test('signerDigest reads the first signer certificate digest', () => {
  assert.equal(signerDigest(out(PINNED)), PINNED);
  assert.equal(signerDigest('nothing'), null);
});
