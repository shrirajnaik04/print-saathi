import { type Job, normalizeJob } from './job';

/** Every stored job, newest first (anything unreadable is skipped). */
export function recentJobs(stored: readonly unknown[]): Job[] {
  return stored
    .map(normalizeJob)
    .filter((j): j is Job => j !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The job the "Continue" card offers: the newest one not yet printed that still has files (PLAN §H3). */
export function continueJob(stored: readonly unknown[]): Job | null {
  return recentJobs(stored).find((j) => j.printedAt === undefined && j.items.length > 0) ?? null;
}
