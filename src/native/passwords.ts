/**
 * Locked PDFs' passwords (PLAN §G5, §J5): in this page's memory only — never saved, never logged, never sent
 * anywhere but the engine call that needs them. Gone when the job is printed or left, and when the app restarts.
 */
const held = new Map<string, string>();

export const passwords = {
  set(jobId: string, item: number, password: string) {
    held.set(`${jobId}:${item}`, password);
  },
  /** {item: password} for one job, for the engine calls that open its locked PDFs. */
  forJob(jobId: string): Record<number, string> {
    const out: Record<number, string> = {};
    for (const [k, v] of held) if (k.startsWith(`${jobId}:`)) out[Number(k.slice(jobId.length + 1))] = v;
    return out;
  },
  clearJob(jobId: string) {
    for (const k of [...held.keys()]) if (k.startsWith(`${jobId}:`)) held.delete(k);
  },
  /** Leaving a job forgets its passwords: only jobs still on the screens keep theirs (review I5). */
  keepOnly(jobIds: readonly string[]) {
    const keep = new Set(jobIds);
    for (const k of [...held.keys()]) if (!keep.has(k.slice(0, k.lastIndexOf(':')))) held.delete(k);
  },
  clearAll() {
    held.clear();
  },
};
