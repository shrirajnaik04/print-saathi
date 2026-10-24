/**
 * Add photos / Add files (owner, 2026-10-24): files chosen from the phone to add to the job on screen join it at once,
 * without the "New files arrived" question. The wish is kept for 10 minutes (the picker may be slow, or Android may
 * restart the app behind it); only the job's id is kept, never a file name.
 */
/** The most files one job holds (as a share: PLAN §F6). */
export const MAX_JOB_FILES = 100;

const KEY = 'ps.addInto';
const KEEP_MS = 10 * 60_000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function rememberAddInto(store: Store, jobId: string, nowMs: number): void {
  store.setItem(KEY, JSON.stringify({ jobId, at: nowMs }));
}

/** The job the chosen files are for, once; null when none, too old or damaged. */
export function takeAddInto(store: Store, nowMs: number): string | null {
  const raw = store.getItem(KEY);
  store.removeItem(KEY);
  try {
    const v = JSON.parse(raw ?? 'null') as { jobId?: unknown; at?: unknown } | null;
    if (!v || typeof v.jobId !== 'string' || typeof v.at !== 'number') return null;
    return nowMs >= v.at && nowMs - v.at <= KEEP_MS ? v.jobId : null;
  } catch {
    return null;
  }
}

/** The picker was closed with nothing chosen: a later share must not join the job. */
export function forgetAddInto(store: Store): void {
  store.removeItem(KEY);
}
