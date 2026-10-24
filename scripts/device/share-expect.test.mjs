import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPECT, shareVerdict } from './share-expect.mjs';

test('every share mode has an expectation', () => {
  for (const m of [
    'single-photo',
    'six-photos',
    'mixed',
    'pdf',
    'pdf-octet',
    'office',
    'own-authority',
    'own-authority-user',
    'file-uri',
  ])
    assert.ok(EXPECT[m], m);
});

test('a share that never arrived is a FAIL, not a blank row', () => {
  assert.equal(shareVerdict('pdf-octet', { receivedMs: null, files: 0, types: '', rejected: null }), 'FAIL');
});

test('accepted shares need the right count and types', () => {
  assert.equal(
    shareVerdict('six-photos', {
      receivedMs: 700,
      files: 6,
      types: 'jpeg,jpeg,jpeg,jpeg,jpeg,jpeg',
      rejected: 0,
      distinct: 6,
    }),
    'PASS',
  );
  assert.equal(
    shareVerdict('six-photos', { receivedMs: 700, files: 5, types: 'jpeg,jpeg,jpeg,jpeg,jpeg', rejected: 0 }),
    'FAIL',
  );
  assert.equal(shareVerdict('pdf-octet', { receivedMs: 400, files: 1, types: 'jpeg', rejected: 0 }), 'FAIL');
});

test('hostile shares must import nothing and be refused by the URI policy itself', () => {
  assert.equal(
    shareVerdict('own-authority-user', { receivedMs: 300, files: 0, types: '', rejected: 1, refusedByPolicy: 1 }),
    'PASS',
  );
  assert.equal(
    shareVerdict('own-authority-user', { receivedMs: 300, files: 1, types: 'other', rejected: 0, refusedByPolicy: 0 }),
    'FAIL',
  );
});

// Gate 3 minor 7: with the policy deleted, the copy would still fail (rejected: 1), and that must not pass.
test('a hostile share that only failed to copy is a FAIL (the policy did not catch it)', () => {
  assert.equal(
    shareVerdict('own-authority', { receivedMs: 300, files: 0, types: '', rejected: 1, refusedByPolicy: 0 }),
    'FAIL',
  );
  assert.equal(shareVerdict('file-uri', { receivedMs: 300, files: 0, types: '', rejected: 1 }), 'FAIL');
});

// Phase 2 hostile streams (HostileProvider): the declared length is ignored; broken streams end with a reason.
test('a stream that lies about or hides its length still imports the photo', () => {
  for (const m of ['lying-length', 'unknown-length'])
    assert.equal(shareVerdict(m, { receivedMs: 400, files: 1, types: 'jpeg', rejected: 0, problems: '' }), 'PASS', m);
});

test('broken streams import nothing and report the right reason', () => {
  const cases = { stall: 'stalled', 'midstream-error': 'failed', 'zero-bytes': 'empty', endless: 'tooBig' };
  for (const [mode, reason] of Object.entries(cases)) {
    assert.equal(
      shareVerdict(mode, { receivedMs: 400, files: 0, types: '', rejected: 1, problems: reason }),
      'PASS',
      mode,
    );
    assert.equal(
      shareVerdict(mode, { receivedMs: 400, files: 0, types: '', rejected: 1, problems: 'failed-other' }),
      'FAIL',
      mode,
    );
    assert.equal(
      shareVerdict(mode, { receivedMs: 400, files: 1, types: 'jpeg', rejected: 0, problems: '' }),
      'FAIL',
      mode,
    );
  }
});

test('six copies of one photo are not six photos: the sender must send distinct files', () => {
  const row = { receivedMs: 700, files: 6, types: 'jpeg,jpeg,jpeg,jpeg,jpeg,jpeg', rejected: 0 };
  assert.equal(shareVerdict('six-photos', { ...row, distinct: 1 }), 'FAIL');
  assert.equal(shareVerdict('six-photos', { ...row, distinct: 6 }), 'PASS');
});
