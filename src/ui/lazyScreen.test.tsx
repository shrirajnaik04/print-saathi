import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ScreenProps } from '../screens/types';
import { lazyScreen } from './lazyScreen';

const props = (jobId: string): ScreenProps => ({ go: () => {}, params: { jobId } });

describe('lazyScreen (startup budget, PLAN §C)', () => {
  it('renders the placeholder, then the screen with its props', async () => {
    let resolve: ((s: (p: ScreenProps) => preact.JSX.Element) => void) | undefined;
    const Lazy = lazyScreen(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    expect(render(<Lazy {...props('j1')} />)).toBe('<main class="screen" aria-busy="true"></main>');
    const loaded = Lazy.preload();
    resolve?.(({ params }) => <main class="screen">job {String(params?.jobId)}</main>);
    await loaded;
    expect(render(<Lazy {...props('j7')} />)).toBe('<main class="screen">job j7</main>');
  });

  it('loads once, however often it is opened', async () => {
    let calls = 0;
    const Lazy = lazyScreen(async () => {
      calls++;
      return () => <main class="screen">ok</main>;
    });
    await Promise.all([Lazy.preload(), Lazy.preload()]);
    render(<Lazy {...props('a')} />);
    expect(calls).toBe(1);
  });

  it('a failed load can be tried again', async () => {
    let fail = true;
    const Lazy = lazyScreen(async () => {
      if (fail) throw new Error('chunk missing');
      return () => <main class="screen">back</main>;
    });
    await expect(Lazy.preload()).rejects.toThrow('chunk missing');
    fail = false;
    await Lazy.preload();
    expect(render(<Lazy {...props('a')} />)).toBe('<main class="screen">back</main>');
  });
});
