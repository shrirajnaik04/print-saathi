import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarise } from './instrumentation-summary.mjs';

// Shape of `am instrument -r` output: each test starts (CODE 1) and ends with 0 (pass), -2 (failure),
// -4 (assumption failure = skipped) or -3 (ignored).
const block = (cls, name, code) => `INSTRUMENTATION_STATUS: class=${cls}
INSTRUMENTATION_STATUS: test=${name}
INSTRUMENTATION_STATUS_CODE: 1
INSTRUMENTATION_STATUS: class=${cls}
INSTRUMENTATION_STATUS: test=${name}
INSTRUMENTATION_STATUS_CODE: ${code}
`;

test('counts passed, failed and skipped tests separately (OK (n tests) hides skips)', () => {
  const out = block('a.B', 't1', 0) + block('a.B', 't2', -4) + block('a.C', 't3', -2) + block('a.C', 't4', -3);
  const s = summarise(out);
  assert.deepEqual([s.passed, s.failed, s.skipped], [1, 1, 2]);
  assert.deepEqual(s.skippedTests, ['a.B#t2', 'a.C#t4']);
  assert.deepEqual(s.failedTests, ['a.C#t3']);
});

test('a run that crashed before finishing is reported as incomplete', () => {
  const out = `${block('a.B', 't1', 0)}INSTRUMENTATION_STATUS: class=a.B\nINSTRUMENTATION_STATUS: test=t2\nINSTRUMENTATION_STATUS_CODE: 1\nINSTRUMENTATION_RESULT: shortMsg=Process crashed.\n`;
  const s = summarise(out);
  assert.equal(s.incomplete, true);
  assert.deepEqual(s.unfinishedTests, ['a.B#t2']);
});
