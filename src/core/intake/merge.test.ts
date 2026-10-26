import { describe, expect, it } from 'vitest';
import { type Job, jobFromIntake } from '../job/job';
import { addToJob } from './merge';

const intake = (id: string, n: number) =>
  ({
    intakeId: id,
    rejected: 0,
    refusedByPolicy: 0,
    files: Array.from({ length: n }, (_, k) => ({
      index: k + 1,
      path: `/jobs/${id}/src/000${k + 1}.jpg`,
      sniffedType: 'jpeg',
      bytes: 10,
      sha256: `${id}${k}`,
    })),
  }) as never;

function fakeEngine(saveOk = true) {
  const jobs = new Map<string, Job>([
    ['open', jobFromIntake('open', intake('open', 2), 1000)],
    ['new', jobFromIntake('new', intake('new', 2), 2000)],
  ]);
  const calls: string[] = [];
  return {
    jobs,
    calls,
    async mergeJobFiles({ from, into }: { from: string; into: string }) {
      calls.push(`merge ${from}>${into}`);
      return {
        // Files 0003–0006 of the open job were removed earlier (their files stay in src): the new ones are 0007, 0008.
        files: [1, 2].map((k) => ({ from: `/jobs/${from}/src/000${k}.jpg`, to: `/jobs/${into}/src/000${k + 6}.jpg` })),
      };
    },
    async loadJob({ id }: { id: string }) {
      return { job: jobs.get(id) ?? null };
    },
    async saveJob({ job }: { job: object }) {
      calls.push('save');
      if (saveOk) jobs.set((job as Job).id, job as Job);
      return { saved: saveOk };
    },
    async deleteJob({ id }: { id: string }) {
      calls.push(`delete ${id}`);
      jobs.delete(id);
    },
  };
}

describe('New files arrived → Add to this job (PLAN §I-17)', () => {
  it('a text message made again at another size keeps its number (review I1, round 8)', async () => {
    const e = fakeEngine();
    e.mergeJobFiles = async ({ from, into }) => ({
      files: [1, 2].map((k) => ({
        from: `/jobs/${from}/src/000${k}.jpg`,
        to: `/jobs/${into}/src/000${k + 6}-18-1730.jpg`,
      })),
    });
    const r = await addToJob(e, 'open', 'new', 3000);
    expect(r?.added).toEqual([7, 8]);
  });

  it('the new files join the open job at their new place, then the new job goes', async () => {
    const e = fakeEngine();
    const r = await addToJob(e, 'open', 'new', 3000);
    if (!r) throw new Error('not merged');
    const merged = r.job;
    expect(r.added).toEqual([7, 8]);
    expect(r.dropped).toBe(0);
    expect(merged.items.map((i) => i.path)).toEqual([
      '/jobs/open/src/0001.jpg',
      '/jobs/open/src/0002.jpg',
      '/jobs/open/src/0007.jpg',
      '/jobs/open/src/0008.jpg',
    ]);
    // Numbered like their files: a removed item's leftovers (its unlocked copy, page images and password are kept
    // under its number) can never be taken for a new file (Phase 10 review I1).
    expect(merged.items.map((i) => i.index)).toEqual([1, 2, 7, 8]);
    expect(e.calls).toEqual(['merge new>open', 'save', 'delete new']);
    expect(e.jobs.has('new')).toBe(false);
    expect(e.jobs.get('open')?.intakeIds).toEqual(['open', 'new']);
  });

  it('if the merged job cannot be saved, the new job is kept (nothing is lost)', async () => {
    const e = fakeEngine(false);
    await expect(addToJob(e, 'open', 'new', 3000)).rejects.toThrow();
    expect(e.jobs.has('new')).toBe(true);
    expect(e.calls).not.toContain('delete new');
  });

  it('a new job that is gone already (added before) is nothing to add, not a failure', async () => {
    const e = fakeEngine();
    e.jobs.delete('new');
    expect(await addToJob(e, 'open', 'new', 3000)).toBeNull();
    expect(e.calls).toEqual([]);
  });

  it('two Adds at once run one after the other on the newest open job', async () => {
    const e = fakeEngine();
    e.jobs.set('new2', jobFromIntake('new2', intake('new2', 2), 2500));
    await Promise.all([addToJob(e, 'open', 'new', 3000), addToJob(e, 'open', 'new2', 3000)]);
    expect(e.jobs.get('open')?.rev).toBe(3);
    expect(e.jobs.has('new') || e.jobs.has('new2')).toBe(false);
  });

  // Add photos (owner, 2026-10-24): a job holds at most 100 files, as a share does.
  it('room caps the files added and reports the rest; the new job goes', async () => {
    const e = fakeEngine();
    const r = await addToJob(e, 'open', 'new', 3000, 1);
    expect(r?.added).toEqual([7]);
    expect(r?.dropped).toBe(1);
    expect(e.jobs.get('open')?.items.map((i) => i.index)).toEqual([1, 2, 7]);
    expect(e.jobs.has('new')).toBe(false);
  });

  it('no room adds nothing and keeps the new job (it waits in Recent jobs)', async () => {
    const e = fakeEngine();
    const r = await addToJob(e, 'open', 'new', 3000, 0);
    expect(r?.added).toEqual([]);
    expect(r?.dropped).toBe(2);
    expect(e.calls).toEqual([]);
    expect(e.jobs.has('new')).toBe(true);
  });
});
