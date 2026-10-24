import { describe, expect, it } from 'vitest';
import { intakeRunner } from './runner';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('intake runner (gate review #2: no share is dropped, nothing opens over a safe start)', () => {
  it('a share that arrives while one is being taken is taken right after it', async () => {
    const calls: boolean[] = [];
    let release: () => void = () => {};
    const r = intakeRunner(async (open) => {
      calls.push(open);
      if (calls.length === 1) await new Promise<void>((res) => (release = res));
    });
    const first = r.start(true);
    await tick();
    void r.request(); // second share during the first take
    void r.request(); // and a third: one extra pass covers both
    release();
    await first;
    await tick();
    expect(calls).toEqual([true, true]);
  });

  it('shares before start-up decides are not taken early, and are covered by the first take', async () => {
    const calls: boolean[] = [];
    const r = intakeRunner(async (open) => void calls.push(open));
    await r.request();
    expect(calls).toEqual([]);
    await r.start(false); // safe start: take, but open nothing
    expect(calls).toEqual([false]);
    await r.request(); // later shares open normally
    expect(calls).toEqual([false, true]);
  });

  it('a failing take does not stop later ones', async () => {
    let n = 0;
    const r = intakeRunner(async () => {
      n++;
      if (n === 1) throw new Error('x');
    });
    await r.start(true).catch(() => {});
    await r.request();
    expect(n).toBe(2);
  });
});
