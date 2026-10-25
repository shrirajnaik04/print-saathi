import type { Job } from '../../core/job/job';
import { en } from '../../i18n/en';
import { whenText } from '../../i18n/when';

const t = en.recent;

/** "6 files" / "Today 3:40 pm · Not printed yet": what a job is, and when and whether it printed. */
export function jobText(job: Job, nowMs: number): { title: string; helper: string } {
  // Files received (review M7): a copy made on Adjust is not another file; it counts once only when its original
  // was removed.
  // A copy whose original is still here adds nothing; copies of a removed original stand for that file, once.
  const here = new Set(job.items.map((i) => i.index));
  const files = new Set(
    job.items.filter((i) => i.copyOf === undefined || !here.has(i.copyOf)).map((i) => i.copyOf ?? i.index),
  );
  const n = files.size;
  return {
    title: `${n} ${n === 1 ? t.file : t.files}`,
    helper: `${whenText(job.updatedAt, nowMs)} · ${job.printedAt ? t.printed : t.notPrinted}`,
  };
}
