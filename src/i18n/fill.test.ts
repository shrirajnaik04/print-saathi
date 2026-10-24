import { describe, expect, it } from 'vitest';
import { fill } from './fill';

describe('fill', () => {
  it('replaces every named place and leaves unknown ones visible', () => {
    expect(fill('Page {n} of {total}', { n: 1, total: 3 })).toBe('Page 1 of 3');
    expect(fill('Photo {n} {x}', { n: 2 })).toBe('Photo 2 {x}');
  });
});
