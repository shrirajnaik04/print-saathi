import type { JobItem } from '../../core/job/job';

/**
 * The last photo removed in Photo tools, so the Photos screen can offer Undo (PLAN §H2.9). In memory only: an Undo
 * belongs to this visit, not to the next start.
 */
let last: { jobId: string; item: JobItem; at: number; pages: 'best' | number; size?: number } | null = null;

/** [size]: the photo's size from Adjust, if it had one (it comes back with Undo). */
export const rememberRemoved = (jobId: string, item: JobItem, at: number, pages: 'best' | number, size?: number) => {
  last = { jobId, item, at, pages, ...(size !== undefined ? { size } : {}) };
};

export const removedFor = (jobId: string) => (last?.jobId === jobId ? last : null);

export const forgetRemoved = () => {
  last = null;
};
