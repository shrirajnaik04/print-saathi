import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialStack, type NavAction, navigate, type Screen } from './stack';

const s = (name: string, params: Record<string, unknown> = {}): Screen => ({ name, params });

describe('screen stack (PLAN §D5: Back never loses work)', () => {
  it('push then back returns to the previous screen with its stored params', () => {
    const a = navigate(initialStack(), { type: 'push', screen: s('received', { intakeId: 'x' }) });
    const b = navigate(a.stack, { type: 'push', screen: s('ready') });
    const back = navigate(b.stack, { type: 'back' });
    expect(back.stack[back.stack.length - 1]).toEqual(s('received', { intakeId: 'x' }));
    expect(back.effect).toBeUndefined();
  });

  it('replace swaps the top screen, so Ready -> Result -> Print again never stacks two Ready screens', () => {
    const a = navigate(initialStack(), { type: 'push', screen: s('received') });
    const ready = navigate(a.stack, { type: 'push', screen: s('ready', { jobId: 'j' }) });
    const result = navigate(ready.stack, { type: 'replace', screen: s('result', { state: 'sent' }) });
    expect(result.stack.map((x) => x.name)).toEqual(['home', 'received', 'result']);
    const again = navigate(result.stack, { type: 'replace', screen: s('ready', { jobId: 'j' }) });
    expect(again.stack.map((x) => x.name)).toEqual(['home', 'received', 'ready']);
  });

  it('replace on Home keeps Home at the bottom', () => {
    expect(navigate(initialStack(), { type: 'replace', screen: s('result') }).stack.map((x) => x.name)).toEqual([
      'home',
      'result',
    ]);
  });

  it('backTo returns to the nearest screen of that name (a choice made two screens deep lands on Ready)', () => {
    let st = initialStack();
    for (const n of ['received', 'ready', 'change', 'pages']) st = navigate(st, { type: 'push', screen: s(n) }).stack;
    expect(navigate(st, { type: 'backTo', name: 'ready' }).stack.map((x) => x.name)).toEqual([
      'home',
      'received',
      'ready',
    ]);
    // Not on the stack: behaves like one Back.
    expect(navigate(st, { type: 'backTo', name: 'nowhere' }).stack.map((x) => x.name)).toEqual([
      'home',
      'received',
      'ready',
      'change',
    ]);
  });

  it('Home clears to Home', () => {
    const a = navigate(navigate(initialStack(), { type: 'push', screen: s('a') }).stack, {
      type: 'push',
      screen: s('b'),
    });
    expect(navigate(a.stack, { type: 'home' }).stack).toEqual([s('home')]);
  });

  it('Home then one screen, in one step (a screen that is no longer on top cannot navigate again)', () => {
    const a = navigate(initialStack(), { type: 'push', screen: s('a') });
    expect(navigate(a.stack, { type: 'home', andOpen: s('b') }).stack).toEqual([s('home'), s('b')]);
  });

  it('Back on Home asks Android to minimise the app instead of closing or doing nothing', () => {
    const r = navigate(initialStack(), { type: 'back' });
    expect(r.effect).toBe('minimise');
    expect(r.stack).toEqual([s('home')]);
  });

  it('property: any sequence keeps Home at the bottom and never empties the stack', () => {
    const action = fc.oneof(
      fc.constantFrom<NavAction>({ type: 'back' }, { type: 'home' }),
      fc.string({ minLength: 1, maxLength: 8 }).map((n): NavAction => ({ type: 'push', screen: s(n) })),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        let st = initialStack();
        for (const a of actions) st = navigate(st, a).stack;
        return st.length >= 1 && st[0]?.name === 'home';
      }),
      { numRuns: 2000 },
    );
  });
});
