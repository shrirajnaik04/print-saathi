import type { Screen } from './stack';

/** PLAN §D5: coming back within 30 minutes reopens the same screen with all choices; later, Home + Continue card. */
export const RESTORE_MS = 30 * 60 * 1000;
const KEY = 'ps.nav';

/** The part of Web Storage used here (localStorage in the app: screen names and job ids only, no customer data). */
export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveStack(store: KeyValue, stack: Screen[], nowMs: number): void {
  try {
    store.setItem(KEY, JSON.stringify({ at: nowMs, stack }));
  } catch {
    // Storage full or blocked: restoring is a convenience; the job itself is saved natively.
  }
}

/**
 * The saved screens if they are recent and all still exist; otherwise null. A Result screen is dropped: after a
 * restart the print record decides what to say about the print.
 */
export function restoreStack(store: KeyValue, nowMs: number, known: ReadonlySet<string>): Screen[] | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const { at, stack } = JSON.parse(raw) as { at: number; stack: Screen[] };
    if (typeof at !== 'number' || nowMs - at > RESTORE_MS || !Array.isArray(stack)) return null;
    const kept = stack.filter((s) => s.name !== 'result');
    if (kept.length < 2 || kept[0]?.name !== 'home' || !kept.every((s) => known.has(s.name))) return null;
    return kept;
  } catch {
    return null;
  }
}
