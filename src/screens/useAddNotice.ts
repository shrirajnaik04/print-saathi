import { useEffect, useState } from 'preact/hooks';
import { en } from '../i18n/en';
import { fill } from '../i18n/fill';

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
