import { describe, expect, it } from 'vitest';
import { forgetAddInto, rememberAddInto, takeAddInto } from './addInto';

/** A plain in-memory Storage. */
function store() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

// Add photos (owner, 2026-10-24): the files chosen join the open job, without the "New files arrived" question.
describe('add into the open job', () => {
  it('kept 10 minutes, then forgotten', () => {
    const s = store();
    rememberAddInto(s, 'job-1', 1_000);
    expect(takeAddInto(s, 1_000 + 10 * 60_000)).toBe('job-1');
    rememberAddInto(s, 'job-1', 1_000);
    expect(takeAddInto(s, 1_000 + 10 * 60_000 + 1)).toBeNull();
  });

  it('taken once; a picker closed with nothing chosen forgets it', () => {
    const s = store();
    rememberAddInto(s, 'job-1', 5);
    expect(takeAddInto(s, 6)).toBe('job-1');
    expect(takeAddInto(s, 7)).toBeNull();
    rememberAddInto(s, 'job-2', 5);
    forgetAddInto(s);
    expect(takeAddInto(s, 6)).toBeNull();
  });

  it('a damaged or odd value is nothing (and only the job id is kept: no file names)', () => {
    const s = store();
    s.setItem('ps.addInto', '{not json');
    expect(takeAddInto(s, 1)).toBeNull();
    s.setItem('ps.addInto', JSON.stringify({ jobId: 7, at: 1 }));
    expect(takeAddInto(s, 1)).toBeNull();
    rememberAddInto(s, 'job-3', 9);
    expect(s.getItem('ps.addInto')).toBe(JSON.stringify({ jobId: 'job-3', at: 9 }));
    // A clock that went back: not trusted.
    expect(takeAddInto(s, 2)).toBeNull();
  });
});
