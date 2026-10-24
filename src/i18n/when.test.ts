import { describe, expect, it } from 'vitest';
import { whenText } from './when';

describe('when a job arrived, in counter words', () => {
  const now = new Date(2026, 9, 3, 15, 40).getTime();
  it('today and yesterday by name, older by date', () => {
    expect(whenText(new Date(2026, 9, 3, 9, 5).getTime(), now)).toBe('Today 9:05 am');
    expect(whenText(new Date(2026, 9, 2, 18, 30).getTime(), now)).toBe('Yesterday 6:30 pm');
    expect(whenText(new Date(2026, 8, 28, 12, 0).getTime(), now)).toBe('28 Sep');
  });
});
