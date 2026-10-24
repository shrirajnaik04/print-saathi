import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devOnly, osvReport, releaseLock, vulnerable } from './audit.mjs';

test('only release runtime classpath lines are kept', () => {
  const lock = [
    '# This is a Gradle generated file',
    'androidx.core:core:1.17.0=debugRuntimeClasspath,releaseCompileClasspath,releaseRuntimeClasspath',
    'io.netty:netty-codec:4.1.110.Final=_internal-unified-test-platform-core',
    'org.jetbrains.kotlin:kotlin-stdlib:2.2.20=releaseRuntimeClasspathCopy,lintClassPath',
    'empty=annotationProcessor',
  ].join('\n');
  assert.equal(
    releaseLock(lock),
    'androidx.core:core:1.17.0=debugRuntimeClasspath,releaseCompileClasspath,releaseRuntimeClasspath\nempty=\n',
  );
});

test('vulnerable packages are listed from an osv-scanner report', () => {
  const report = {
    results: [
      {
        packages: [
          { package: { name: 'a', version: '1' }, vulnerabilities: [{ id: 'GHSA-1' }, { id: 'GHSA-2' }] },
          { package: { name: 'b', version: '2' }, vulnerabilities: [] },
        ],
      },
    ],
  };
  assert.deepEqual(vulnerable(report), ['a@1 (GHSA-1, GHSA-2)']);
  assert.deepEqual(vulnerable({}), []);
});

test('a package counts as dev-only only when every copy of it in the lockfile is dev', () => {
  const lock = {
    packages: {
      'node_modules/uuid': { version: '11.1.1' },
      'node_modules/xcode/node_modules/uuid': { version: '7.0.3', dev: true },
      'node_modules/left/node_modules/pad': { version: '1.0.0', dev: true },
      'node_modules/pad': { version: '1.0.0' },
    },
  };
  assert.equal(devOnly(lock, 'uuid', '7.0.3'), true); // nested under a dev tool
  assert.equal(devOnly(lock, 'uuid', '11.1.1'), false); // ships
  assert.equal(devOnly(lock, 'pad', '1.0.0'), false); // one copy ships
  assert.equal(devOnly(lock, 'gone', '1.0.0'), false); // unknown: treat as shipped
});

test('an osv-scanner run that failed is an error, never "no issues" (review I6)', () => {
  assert.deepEqual(osvReport(0, '{"results":[]}'), { results: [] });
  assert.deepEqual(osvReport(1, '{"results":[{"packages":[]}]}'), { results: [{ packages: [] }] });
  assert.throws(() => osvReport(127, ''), /osv-scanner/);
  assert.throws(() => osvReport(0, ''), /osv-scanner/);
  assert.throws(() => osvReport(0, '{"no":"results"}'), /osv-scanner/);
});
