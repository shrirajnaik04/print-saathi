import { EDIT_KEYS, type Job, type JobEdits } from '../../core/job/job';

/** The adjustable choices of [job] (the job is never changed in place, so they are kept as they are). */
export const editsOf = (job: Job): JobEdits =>
  Object.fromEntries(EDIT_KEYS.filter((k) => job[k] !== undefined).map((k) => [k, job[k]])) as JobEdits;

/**
 * Undo / Redo on Adjust (owner, round 6): what a job's adjustable choices were before each change made on Adjust. Kept in
 * memory, per job, only while the job is as the last step left it ([rev]): a change made anywhere else (Change, Ready, a
 * print, files added) moves the revision, and an Undo must never take that back, so the steps are then forgotten.
 */
type Steps = { rev: number; undo: JobEdits[]; redo: JobEdits[] };

const MAX_STEPS = 50;
const steps = new Map<string, Steps>();

const live = (jobId: string, rev: number): Steps | null => {
  const s = steps.get(jobId);
  return s && s.rev === rev ? s : null;
};

/**
 * A change made on Adjust: the job went from revision [beforeRev], with these choices [before], to [afterRev]. Only the
 * job being adjusted keeps steps: another job's are forgotten here (this runs only on Adjust, which loads on demand,
 * so the app's start-up code does not carry it).
 */
export const recordStep = (jobId: string, before: JobEdits, beforeRev: number, afterRev: number) => {
  forgetStepsExcept([jobId]);
  const s = live(jobId, beforeRev) ?? { rev: afterRev, undo: [], redo: [] };
  s.undo.push(before);
  if (s.undo.length > MAX_STEPS) s.undo.shift();
  s.redo = [];
  s.rev = afterRev;
  steps.set(jobId, s);
};

export const stepsFor = (jobId: string, rev: number): { canUndo: boolean; canRedo: boolean } => {
  const s = live(jobId, rev);
  return { canUndo: (s?.undo.length ?? 0) > 0, canRedo: (s?.redo.length ?? 0) > 0 };
};

/** The choices to go back to; [current] (the job as it is now) becomes what Redo goes to. */
export const takeUndo = (jobId: string, rev: number, current: JobEdits): JobEdits | null => {
  const s = live(jobId, rev);
  const before = s?.undo.pop();
  if (!s || !before) return null;
  s.redo.push(current);
  return before;
};

export const takeRedo = (jobId: string, rev: number, current: JobEdits): JobEdits | null => {
  const s = live(jobId, rev);
  const after = s?.redo.pop();
  if (!s || !after) return null;
  s.undo.push(current);
  return after;
};

/** The Undo or Redo was saved: the job is now at revision [rev]. */
export const settle = (jobId: string, rev: number) => {
  const s = steps.get(jobId);
  if (s) s.rev = rev;
};

/** The save of an Undo or Redo failed: the step goes back where it was. */
export const dropStep = (jobId: string, kind: 'undo' | 'redo', edits: JobEdits) => {
  const s = steps.get(jobId);
  if (!s) return;
  if (kind === 'undo') {
    s.redo.pop();
    s.undo.push(edits);
  } else {
    s.undo.pop();
    s.redo.push(edits);
  }
};

/** One job's steps are forgotten: a change reached it from somewhere else, so they no longer join up with it. */
export const forgetSteps = (jobId: string) => {
  steps.delete(jobId);
};

/**
 * Adjust's other screens (Crop, Fix edges, Add photos, the passport tools) change the job and come back to Adjust, which
 * then starts afresh: [leaveFor] keeps how the job was when Adjust was left, [returned] makes what those screens did one
 * step (round 6 review I2). It answers whether a step was made; what Change chose alone makes none.
 */
const left = new Map<string, { before: JobEdits; rev: number }>();
export const leaveFor = (job: Job) => {
  left.set(job.id, { before: editsOf(job), rev: job.rev });
};
export const returned = (job: Job): boolean => {
  const l = left.get(job.id);
  left.delete(job.id);
  if (!l || job.rev <= l.rev || JSON.stringify(editsOf(job)) === JSON.stringify(l.before)) return false;
  recordStep(job.id, l.before, l.rev, job.rev);
  return true;
};

/** The jobs still open on the screens keep their steps; any other job's are forgotten. */
export const forgetStepsExcept = (jobIds: readonly string[]) => {
  for (const id of [...steps.keys()]) if (!jobIds.includes(id)) steps.delete(id);
};
