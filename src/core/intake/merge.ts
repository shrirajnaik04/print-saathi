import type { PrintEnginePlugin } from '../../native/printEngine';
import { type Job, jobReducer, normalizeJob } from '../job/job';

type Engine = Pick<PrintEnginePlugin, 'mergeJobFiles' | 'loadJob' | 'saveJob' | 'deleteJob'>;

/** The open job with the files added: the numbers they got, and how many did not fit ([room]). */
export type Added = { job: Job; added: number[]; dropped: number };

/**
 * New files arrived → Add to this job (PLAN §I-17), and Add photos (owner, 2026-10-24): the new job's files are placed
 * in the open job's folder, the open job is saved with them, and only then is the new job deleted, so a failure
 * half-way loses nothing (the new job stays in Recent jobs). At most [room] files join (a job holds 100); with no room
 * nothing changes and the new job stays. Throws when the merged job could not be saved.
 */
export function addToJob(
  engine: Engine,
  intoId: string,
  fromId: string,
  nowMs: number,
  room = Number.POSITIVE_INFINITY,
): Promise<Added | null> {
  // One at a time, app-wide: two Adds (a share landing while one runs) would otherwise both build on the same
  // revision of the open job, and the second save would be refused (review I2).
  const run = queue.then(() => merge(engine, intoId, fromId, nowMs, room));
  queue = run.catch(() => {});
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

/** null when the new job is gone already (added by an earlier Add, or deleted): nothing to add. */
async function merge(
  engine: Engine,
  intoId: string,
  fromId: string,
  nowMs: number,
  room: number,
): Promise<Added | null> {
  const from = normalizeJob((await engine.loadJob({ id: fromId })).job);
  if (!from) return null;
  if (room <= 0) {
    const into = normalizeJob((await engine.loadJob({ id: intoId })).job);
    if (!into) throw new Error('no such job');
    return { job: into, added: [], dropped: from.items.length };
  }
  const { files } = await engine.mergeJobFiles({ from: fromId, into: intoId });
  const placed = new Map(files.map((f) => [f.from, f.to]));
  const items = [...from.order, ...from.items.map((i) => i.index)]
    .filter((index, k, all) => all.indexOf(index) === k)
    .map((index) => from.items.find((i) => i.index === index))
    .flatMap((i) => {
      const to = i && placed.get(i.path);
      if (!i || !to) return [];
      // Numbered like the file it now is (0007.jpg → 7): higher than any file the open job ever had, so nothing
      // kept under a removed item's number (unlocked copy, page images, password) is mistaken for it.
      // A text message's PDF made again at another size is 0007-18-….pdf: its number is the name's first part.
      const n = Number(/(?:^|[\\/])(\d+)(?:-\d+)*\.[^./\\]+$/.exec(to)?.[1]);
      return [{ ...i, path: to, index: Number.isInteger(n) && n > 0 ? n : i.index }];
    });
  // Every file must have its place before the new job is deleted (review M8).
  if (items.length !== from.items.length) throw new Error('not every file was placed');
  const into = normalizeJob((await engine.loadJob({ id: intoId })).job);
  if (!into) throw new Error('no such job');
  // Files past the room are not added (their copies go with the job's folder when it is deleted).
  const joining = items.slice(0, room);
  const merged = jobReducer(into, { type: 'addItems', items: joining, intakeId: fromId, notices: from.notices }, nowMs);
  if (!(await engine.saveJob({ job: merged })).saved) throw new Error('job not saved');
  await engine.deleteJob({ id: fromId });
  return {
    job: merged,
    added: merged.order.slice(merged.order.length - joining.length),
    dropped: items.length - joining.length,
  };
}
