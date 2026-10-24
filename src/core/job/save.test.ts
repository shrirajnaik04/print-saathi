import { describe, expect, it } from 'vitest';
import { jobFromIntake } from './job';
import { saveChange } from './save';

const intake = {
  intakeId: 'j',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/p/1.jpg', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
} as never;

/** A store like the native one: refuses a revision that is not newer than the stored one. */
function store(initial: object) {
  let stored = initial as { rev: number };
  return {
    get: () => stored,
    saveJob: async ({ job }: { job: object }) => {
      const j = job as { rev: number };
      if (j.rev <= stored.rev) return { saved: false };
      stored = j;
      return { saved: true };
    },
    loadJob: async () => ({ job: stored as object }),
  };
}

describe('saveChange (PLAN §D2c single writer; gate review #4)', () => {
  const job = jobFromIntake('j', intake, 1);

  it('saves the change and returns the new job', async () => {
    const s = store(job);
    const next = await saveChange(s, job, { type: 'setCopies', copies: 3 }, 2);
    expect(next.copies).toBe(3);
    expect(s.get()).toEqual(next);
  });

  it('when a newer revision is already stored, the change is applied to it instead of being lost', async () => {
    const s = store(job);
    const other = await saveChange(s, job, { type: 'setCopies', copies: 3 }, 2); // another tap already saved
    const next = await saveChange(s, job, { type: 'turnItem', index: 1 }, 3); // built from the older job
    expect(next.copies).toBe(3);
    expect(next.turns[1]).toBe(1);
    expect(next.rev).toBe(other.rev + 1);
  });

  it('a failed save is reported, never swallowed', async () => {
    const failing = {
      saveJob: async () => Promise.reject(new Error('job not saved')),
      loadJob: async () => ({ job: null }),
    };
    await expect(saveChange(failing, job, { type: 'setCopies', copies: 2 }, 2)).rejects.toThrow();
  });
});
