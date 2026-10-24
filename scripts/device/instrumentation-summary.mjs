// Honest counts from raw `am instrument -r` output: passed / failed / skipped (assumption or ignored) per test,
// and whether the run finished. "OK (n tests)" from the runner counts skipped tests as passing (Gate 3 #6).
// Usage: node scripts/device/instrumentation-summary.mjs <raw-output.txt> [...more]
import { readFileSync } from 'node:fs';

export function summarise(raw) {
  const state = new Map(); // "class#test" -> last status code
  let cls = '';
  let name = '';
  for (const line of raw.split(/\r?\n/)) {
    const c = line.match(/^INSTRUMENTATION_STATUS: class=(.*)$/);
    if (c) cls = c[1];
    const t = line.match(/^INSTRUMENTATION_STATUS: test=(.*)$/);
    if (t) name = t[1];
    const code = line.match(/^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/);
    if (code && name) state.set(`${cls}#${name}`, Number(code[1]));
  }
  const pick = (f) => [...state].filter(([, v]) => f(v)).map(([k]) => k);
  const passedTests = pick((v) => v === 0);
  const failedTests = pick((v) => v === -2 || v === -1);
  const skippedTests = pick((v) => v === -3 || v === -4);
  const unfinishedTests = pick((v) => v === 1);
  return {
    passed: passedTests.length,
    failed: failedTests.length,
    skipped: skippedTests.length,
    failedTests,
    skippedTests,
    unfinishedTests,
    incomplete: unfinishedTests.length > 0 || !/^(OK \(|FAILURES!!!|Tests run:)/m.test(raw),
  };
}

if (process.argv[1]?.endsWith('instrumentation-summary.mjs')) {
  for (const f of process.argv.slice(2)) {
    const s = summarise(readFileSync(f, 'utf8'));
    const extra = [
      s.skipped ? `skipped: ${s.skippedTests.join(', ')}` : '',
      s.failed ? `FAILED: ${s.failedTests.join(', ')}` : '',
      s.incomplete ? `INCOMPLETE: ${s.unfinishedTests.join(', ') || 'no final result line'}` : '',
    ].filter(Boolean);
    console.log(
      `${f}: ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped${extra.length ? ` (${extra.join('; ')})` : ''}`,
    );
  }
}
