/**
 * Android Back closes the question on top first (review I3, round 11): a sheet that is open (a leave question, the page
 * list) registers what closing it means; [closeTopOnBack] runs the newest one, so Back never leaves the screen under a
 * question that is still open.
 */
const closers: (() => void)[] = [];

/** Registers [close] as the answer to Back while its sheet is open; returns the call that takes it away. */
export function onBack(close: () => void): () => void {
  closers.push(close);
  return () => {
    const at = closers.lastIndexOf(close);
    if (at >= 0) closers.splice(at, 1);
  };
}

/** Runs the newest registered answer; false when no question is open (Back is the usual Back). */
export function closeTopOnBack(): boolean {
  const close = closers[closers.length - 1];
  if (!close) return false;
  close();
  return true;
}
