import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateBudgets } from './size.mjs';

test('budgets pass when gzip sizes are under the limits', () => {
  const r = evaluateBudgets({ js: 59_000, css: 14_000 }, { js: 60 * 1024, css: 15 * 1024 });
  assert.equal(r.ok, true);
});

test('budgets fail and name the offender when JS is over', () => {
  const r = evaluateBudgets({ js: 70_000, css: 1_000 }, { js: 60 * 1024, css: 15 * 1024 });
  assert.equal(r.ok, false);
  assert.match(r.lines.join('\n'), /FAIL js/);
});
