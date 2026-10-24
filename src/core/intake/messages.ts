import type { Intake, IntakeProblemReason } from '../../native/printEngine';

/** The phone was full while receiving; the Problem screen offers "Delete old PrintSaathi jobs" with it (PLAN §J8). */
export const STORAGE_FULL = 'Phone storage is full. Delete old WhatsApp videos, then share again.';
const STORAGE_FULL_PICKED = 'Phone storage is full. Delete old WhatsApp videos, then choose them again.';

/** The full-phone line, for a share or for files chosen on Home (both offer "Delete old PrintSaathi jobs"). */
export const isStorageFull = (line: string) => line === STORAGE_FULL || line === STORAGE_FULL_PICKED;

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;
const itThem = (n: number) => (n === 1 ? 'it' : 'them');

/** Reasons that all mean "the copy broke; share again" (PLAN §J8: hostile/broken app, expired permission). */
const RESHARE: IntakeProblemReason[] = ['stalled', 'timedOut', 'failed', 'permission', 'refused'];

/** Plain-English lines for what went wrong while receiving, each with what to do (PLAN §J8). */
export function problemMessages(intake: Intake): string[] {
  // Files chosen on Home are chosen again, not shared again (Phase 10b review M5).
  const picked = !!intake.pick;
  const again = picked ? 'choose' : 'share';
  if (intake.tooMany)
    return [`Too many files at once (${intake.expected ?? 'over 100'}). Please ${again} up to 100 at a time.`];
  const out: string[] = [];
  if (intake.cancelled) {
    // What arrived, and how to get the rest (review M5: every problem says what to do).
    const expected = intake.expected ?? intake.files.length;
    const rest = expected - intake.files.length;
    out.push(
      `Receiving was stopped: ${intake.files.length} of ${expected} files arrived.` +
        (rest > 0
          ? ` To print ${rest === 1 ? 'the other one' : 'the rest'}, ${again} ${itThem(rest)} again${picked ? '' : ' from WhatsApp'}.`
          : ''),
    );
  }
  if (intake.state === 'interrupted') {
    const missing = Math.max(0, (intake.expected ?? 0) - intake.files.length);
    if (missing > 0) out.push(`Couldn't finish receiving ${files(missing)}. Please ${again} ${itThem(missing)} again.`);
  }
  const count = (reasons: IntakeProblemReason[]) =>
    (intake.problems ?? []).filter((p) => reasons.includes(p.reason)).length;
  const reshare = count(RESHARE);
  if (reshare)
    out.push(
      picked
        ? `Couldn't receive ${files(reshare)}. Please choose ${itThem(reshare)} again.`
        : `Couldn't receive ${files(reshare)}. Please share ${itThem(reshare)} again from WhatsApp.`,
    );
  const big = count(['tooBig', 'jobTooBig']);
  if (big) out.push(`${files(big)} ${big === 1 ? 'is' : 'are'} too big to print.`);
  if (count(['storageFull'])) out.push(picked ? STORAGE_FULL_PICKED : STORAGE_FULL);
  const empty = count(['empty']);
  if (empty)
    out.push(`${files(empty)} ${empty === 1 ? 'was' : 'were'} empty. Ask the customer to send ${itThem(empty)} again.`);
  return out;
}
