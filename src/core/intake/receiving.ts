/** A share being copied right now (PLAN §D2, §H2.7): "Receiving files… 12 of 60". One at a time is enough to show. */
/** [making]: round 9, an Office file being made into pages ("word", "powerpoint", "excel", "office"). */
export type Receiving = { intakeId: string; done: number; total: number; making?: string };

let current: Receiving | null = null;
const listeners = new Set<(r: Receiving | null) => void>();

export const receivingNow = () => current;

export function setReceiving(r: Receiving): void {
  current = r;
  for (const l of listeners) l(current);
}

/** The share [intakeId] arrived (or failed): nothing is being received any more. */
export function receivingDone(intakeId: string): void {
  if (current?.intakeId !== intakeId) return;
  current = null;
  for (const l of listeners) l(current);
}

export function listenReceiving(l: (r: Receiving | null) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
