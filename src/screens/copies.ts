import type { Job } from '../core/job/job';
import type { ThumbResult } from '../native/printEngine';

/**
 * A copy made on Adjust (owner, round 5) is the same file as its original: until the engine has made its own
 * picture (the next time the job's pictures are read), it shows and lays out with its original's.
 */
export function withCopies(thumbs: Map<number, ThumbResult> | null, job: Job | null): Map<number, ThumbResult> | null {
  if (!thumbs || !job) return thumbs;
  const missing = job.items.filter((i) => i.copyOf !== undefined && !thumbs.has(i.index));
  if (missing.length === 0) return thumbs;
  const out = new Map(thumbs);
  for (const c of missing) {
    // Its original, or (the original removed and Adjust opened again, review I1) any photo of the same file.
    const twin = job.items.find((i) => i.index !== c.index && i.sha256 === c.sha256 && thumbs.has(i.index));
    const from = thumbs.get(c.copyOf as number) ?? (twin && thumbs.get(twin.index));
    if (from) out.set(c.index, { ...from, index: c.index });
  }
  return out;
}
