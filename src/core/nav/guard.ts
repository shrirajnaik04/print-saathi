import { type NavAction, navigate, type Screen } from './stack';

/**
 * The job whose screens [action] leaves altogether, or null (owner, round 4: "ask confirmation whether really want to
 * leave the job"). Only the shopkeeper's own Back and Home count; Home that opens another screen (Start a new job) is a
 * choice already made. A printed job's Result never asks, nor does a screen without a job.
 */
export function leftJob(stack: Screen[], action: NavAction): string | null {
  if (action.type !== 'back' && !(action.type === 'home' && !action.andOpen)) return null;
  if (action.sure) return null;
  const top = stack[stack.length - 1];
  const jobId = top?.params.jobId;
  // Result: printed. New files arrived: about the new files, though it carries the open job (review M3: its Delete
  // would delete the previous customer's job).
  if (!top || top.name === 'result' || top.name === 'newfiles' || typeof jobId !== 'string' || jobId === '')
    return null;
  const after = navigate(stack, action).stack;
  return after.some((s) => s.params.jobId === jobId) ? null : jobId;
}

/** Back on Home: it would close the app (owner, round 4: "ask user stay on app or exit app"). */
export function exitsApp(stack: Screen[], action: NavAction): boolean {
  return action.type === 'back' && stack.length <= 1;
}
