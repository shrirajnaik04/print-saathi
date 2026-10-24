import { type Job, type JobAction, jobReducer, normalizeJob } from './job';

type Store = {
  saveJob(o: { job: object }): Promise<{ saved: boolean }>;
  loadJob(o: { id: string }): Promise<{ job: object | null }>;
};

/**
 * Applies one change through the single writer (PLAN §D2c). The store refuses a revision that is not newer; then
 * another change won the race (a quick second tap), so this change is applied again to the stored job instead of
 * being lost (gate review #4). A failed save is thrown, for the screen to say so (gate review #3).
 */
export async function saveChange(store: Store, job: Job, action: JobAction, nowMs: number): Promise<Job> {
  const next = jobReducer(job, action, nowMs);
  if (next === job) return job;
  if ((await store.saveJob({ job: next })).saved) return next;
  const stored = normalizeJob((await store.loadJob({ id: job.id })).job);
  if (!stored) throw new Error('job missing');
  const again = jobReducer(stored, action, nowMs);
  if (again === stored) return stored;
  if ((await store.saveJob({ job: again })).saved) return again;
  throw new Error('job not saved');
}
