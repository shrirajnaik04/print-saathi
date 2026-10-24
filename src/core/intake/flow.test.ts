import { describe, expect, it } from 'vitest';
import { takeNewIntakes } from './flow';

const intake = (id: string) => ({
  intakeId: id,
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/x', sniffedType: 'jpeg', bytes: 1, sha256: 'a' }],
});

function fakeEngine(intakes: object[], saveOk = true, stored: string[] = []) {
  const calls: string[] = [];
  return {
    calls,
    loadJob: async ({ id }: { id: string }) => ({ job: stored.includes(id) ? ({ id, items: [] } as object) : null }),
    listIntakes: async () => ({ intakes }) as never,
    saveJob: async ({ job }: { job: object }) => {
      calls.push(`save ${(job as { id: string }).id}`);
      return { saved: saveOk };
    },
    ackIntake: async ({ intakeId }: { intakeId: string }) => {
      calls.push(`ack ${intakeId}`);
    },
  };
}

describe('takeNewIntakes (PLAN §D2: a share is never lost before it is a job)', () => {
  it('turns each pending intake into a saved job, then acknowledges it, oldest first', async () => {
    const e = fakeEngine([intake('a'), intake('b')]);
    const jobs = await takeNewIntakes(e, 1000);
    expect(jobs.map((j) => j.id)).toEqual(['a', 'b']);
    expect(e.calls).toEqual(['save a', 'ack a', 'save b', 'ack b']);
  });

  it('never acknowledges an intake whose job could not be saved and does not exist (it stays pending)', async () => {
    const e = fakeEngine([intake('a')], false);
    expect(await takeNewIntakes(e, 1000)).toEqual([]);
    expect(e.calls).toEqual(['save a']);
  });

  it('an interrupted intake with nothing received becomes no job, but is acknowledged so it is shown once', async () => {
    const e = fakeEngine([{ ...intake('a'), state: 'interrupted', expected: 2, files: [] }]);
    const jobs = await takeNewIntakes(e, 1000);
    expect(jobs).toEqual([]);
    expect(e.calls).toEqual(['ack a']);
  });

  /** Gate review #7: the app died after saving the job but before acknowledging; the job is already there. */
  it('acknowledges an intake whose job already exists, so it is not listed on every start', async () => {
    const e = fakeEngine([intake('a')], false, ['a']);
    const jobs = await takeNewIntakes(e, 1000);
    expect(e.calls).toEqual(['save a', 'ack a']);
    expect(jobs.map((j) => j.id)).toEqual(['a']);
  });
});
