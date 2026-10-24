import { describe, expect, it } from 'vitest';
import { RESTORE_MS, restoreStack, saveStack } from './persist';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const known = new Set(['home', 'received', 'ready', 'result']);
const stack = [
  { name: 'home', params: {} },
  { name: 'received', params: { jobId: 'j1' } },
  { name: 'ready', params: { jobId: 'j1' } },
];

describe('restore after Android closed the app (PLAN §D5: same screen within 30 min)', () => {
  it('returns the same screens and their job within 30 minutes', () => {
    const s = mem();
    saveStack(s, stack, 1000);
    expect(restoreStack(s, 1000 + RESTORE_MS - 1, known)).toEqual(stack);
  });

  it('after 30 minutes the app opens on Home (the Continue card offers the job)', () => {
    const s = mem();
    saveStack(s, stack, 1000);
    expect(restoreStack(s, 1000 + RESTORE_MS + 1, known)).toBeNull();
  });

  it('a result screen is never restored: what happened to a print is asked again from the print record', () => {
    const s = mem();
    saveStack(s, [...stack.slice(0, 2), { name: 'result', params: { jobId: 'j1', state: 'sent' } }], 1000);
    expect(restoreStack(s, 2000, known)?.map((x) => x.name)).toEqual(['home', 'received']);
  });

  it('unknown screens, broken or missing data restore nothing', () => {
    const s = mem();
    expect(restoreStack(s, 0, known)).toBeNull();
    s.setItem('ps.nav', '{oops');
    expect(restoreStack(s, 0, known)).toBeNull();
    saveStack(
      s,
      [
        { name: 'home', params: {} },
        { name: 'gone', params: {} },
      ],
      0,
    );
    expect(restoreStack(s, 1, known)).toBeNull();
  });

  it('a stack that is only Home is not worth restoring', () => {
    const s = mem();
    saveStack(s, [{ name: 'home', params: {} }], 0);
    expect(restoreStack(s, 1, known)).toBeNull();
  });

  it('storage that throws (private mode, quota) never breaks the app', () => {
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {},
    };
    expect(() => saveStack(broken, stack, 0)).not.toThrow();
    expect(restoreStack(broken, 0, known)).toBeNull();
  });
});
