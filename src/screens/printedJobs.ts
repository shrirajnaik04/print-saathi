import type { Job } from '../core/job/job';

/**
 * Whether each job this run has seen is printed (review C2, round 4). Back and Home decide at once whether to ask
 * "Leave this job?", never waiting for the engine: its one queue may be busy for many seconds making a print file or
 * pictures.
 */
const printed = new Map<string, boolean>();

/** Notes a job as it was loaded or saved. */
export function noteJob(job: Job | null | undefined): void {
  if (job) printed.set(job.id, job.printedAt !== undefined);
}

/** true / false as last seen; undefined when this run has not seen the job yet. */
export function seenPrinted(jobId: string): boolean | undefined {
  return printed.get(jobId);
}
