import { describe, expect, it } from 'vitest';
import { PageQueue } from './pageQueue';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('page images are asked for one at a time, once, and never after the screen closed (re-review I3)', () => {
  it('one request at a time, in order, never twice', async () => {
    const asked: string[] = [];
    let running = 0;
    let most = 0;
    const q = new PageQueue(
      async (k) => {
        running++;
        most = Math.max(most, running);
        asked.push(k);
        await tick();
        running--;
        return `img-${k}`;
      },
      () => {},
    );
    q.want(['1:0', '1:1']);
    q.want(['1:1', '1:2']);
    for (let i = 0; i < 10; i++) await tick();
    expect(asked).toEqual(['1:0', '1:1', '1:2']);
    expect(most).toBe(1);
  });

  it('closing the screen drops what was not asked yet', async () => {
    const asked: string[] = [];
    let finish: (v: string | null) => void = () => {};
    const q = new PageQueue(
      (k) => {
        asked.push(k);
        return new Promise((r) => {
          finish = r;
        });
      },
      () => {},
    );
    q.want(['1:0', '1:1', '1:2', '1:3']);
    q.stop(); // while page 1 is being made
    finish('img');
    for (let i = 0; i < 10; i++) await tick();
    expect(asked).toEqual(['1:0']);
  });

  it('a page that failed is asked once more, then left (re-review m4)', async () => {
    const asked: string[] = [];
    const got: string[] = [];
    const q = new PageQueue(
      async (k) => {
        asked.push(k);
        return k === '1:1' && asked.filter((a) => a === k).length === 2 ? 'img' : null;
      },
      (k) => got.push(k),
    );
    q.want(['1:0', '1:1']);
    for (let i = 0; i < 20; i++) await tick();
    expect(asked).toEqual(['1:0', '1:1', '1:0', '1:1']);
    expect(got).toEqual(['1:1']);
  });
});
