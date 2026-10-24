import { useEffect, useState } from 'preact/hooks';
import { en } from '../i18n/en';
import { fill } from '../i18n/fill';

/**
 * The first photo just added to [jobId], kept until [forgetAddedChoice] (ID cards: the back photo is looked at again if
 * the screen closed before its card was saved, review I1, round 3); else null.
 */
export function peekAddedChoice(jobId: string): number | null {
  try {
    const v = JSON.parse(sessionStorage.getItem('ps.addChoose') ?? 'null') as { jobId?: string; item?: number } | null;
    return v?.jobId === jobId && typeof v.item === 'number' ? v.item : null;
  } catch {
    return null;
  }
}

export const forgetAddedChoice = () => sessionStorage.removeItem('ps.addChoose');

/** Change photo on an ID card side (owner, round 4): the side the next photo added to [jobId] replaces. */
export const noteCardSide = (jobId: string, at: number) =>
  sessionStorage.setItem('ps.cardSide', JSON.stringify({ jobId, at }));
export function peekCardSide(jobId: string): number | null {
  try {
    const v = JSON.parse(sessionStorage.getItem('ps.cardSide') ?? 'null') as { jobId?: string; at?: number } | null;
    return v?.jobId === jobId && (v.at === 0 || v.at === 1) ? v.at : null;
  } catch {
    return null;
  }
}
export const forgetCardSide = () => sessionStorage.removeItem('ps.cardSide');

/** The first photo just added to [jobId], once (Adjust chooses it when it comes back on screen); else null. */
export function takeAddedChoice(jobId: string): number | null {
  const raw = sessionStorage.getItem('ps.addChoose');
  try {
    const v = JSON.parse(raw ?? 'null') as { jobId?: string; item?: number } | null;
    if (v?.jobId !== jobId || typeof v.item !== 'number') return null;
    sessionStorage.removeItem('ps.addChoose');
    return v.item;
  } catch {
    sessionStorage.removeItem('ps.addChoose');
    return null;
  }
}

/**
 * Add photos (owner, 2026-10-24): said once, on the screen Add was pressed on, when not every file chosen joined the
 * job (it holds 100) or adding failed (the files then wait in Recent jobs). Nothing to say: null.
 */
export function useAddNotice(jobId: string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const raw = sessionStorage.getItem('ps.addNotice');
      if (!raw) return;
      try {
        const n = JSON.parse(raw) as { jobId?: string; added?: number; dropped?: number; failed?: boolean };
        if (n.jobId !== jobId) return;
        sessionStorage.removeItem('ps.addNotice');
        const added = n.added ?? 0;
        setText(n.failed ? en.add.failed : fill(en.add.some, { added, n: added + (n.dropped ?? 0) }));
      } catch {
        sessionStorage.removeItem('ps.addNotice');
      }
    };
    read();
    window.addEventListener('ps-job-changed', read);
    return () => window.removeEventListener('ps-job-changed', read);
  }, [jobId]);
  return text;
}
