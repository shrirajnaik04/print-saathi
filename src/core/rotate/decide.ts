import type { TextTurn } from './textTurn';

/** Photos chosen from the phone show exactly as the phone shows them: the app never turns them (owner, 2026-10-23). */
export function mayTurn(job: { picked?: true }): boolean {
  return job.picked !== true;
}

/**
 * Which photos to turn upright (Phase 15, spec Part 3), from the two signals: faces first — a photo whose faces show
 * at exactly one quarter turn (and none at the others) gets that turn; a photo with faces at several turns, or upright
 * faces, gets none. A photo with no face takes the text direction, only when that is sure. Anything else: no turn.
 */
export function decideTurns(
  photos: readonly number[],
  text: ReadonlyMap<number, TextTurn>,
  faces: ReadonlyMap<number, readonly number[]>,
): Record<number, 1 | 2 | 3> {
  const out: Record<number, 1 | 2 | 3> = {};
  for (const index of photos) {
    const f = faces.get(index);
    if (f && f.length === 4 && f.some((n) => n > 0)) {
      const at = [0, 1, 2, 3].filter((k) => (f[k] ?? 0) > 0);
      if (at.length === 1 && at[0] !== 0) out[index] = at[0] as 1 | 2 | 3;
      continue; // faces decide (upright, or unclear): the text is not asked
    }
    // Text alone only ever turns a photo a quarter: margins can't tell right-aligned text (or a chat screenshot)
    // from text upside down (review I3).
    const t = text.get(index);
    if (t?.sure && (t.turn === 1 || t.turn === 3)) out[index] = t.turn;
  }
  return out;
}
