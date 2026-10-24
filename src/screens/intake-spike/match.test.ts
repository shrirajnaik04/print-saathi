import { describe, expect, it } from 'vitest';
import { intakeForEvent } from './match';

const intake = (id: string) => ({ intakeId: id, files: [], rejected: 0 }) as never;

describe('intakeForEvent (Gate 3 #5)', () => {
  it('shows the pending intake when it is the one the event names', () => {
    expect(intakeForEvent('a', intake('a'))).toEqual({ kind: 'show', intake: intake('a') });
  });

  it('never shows a different (older) intake: the named one did not arrive', () => {
    expect(intakeForEvent('b', intake('a'))).toEqual({ kind: 'failed' });
    expect(intakeForEvent('b', null)).toEqual({ kind: 'failed' });
  });
});
