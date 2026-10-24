import { useEffect, useState } from 'preact/hooks';
import type { Job } from '../core/job/job';
import { buildPlan, type PdfFacts, type PhotoPaper, type PrintPlan } from '../core/plan/plan';
import { PrintEngine } from '../native/printEngine';
import { useExtraEdgeMm } from './useSettings';

type Setup = { photoPaper: PhotoPaper | null | undefined; a4EdgeMm?: number };
/** The last paper setup read: the next screen starts with it instead of drawing on A4 for a moment. */
let last: Setup = { photoPaper: undefined };

/**
 * The paper every plan on a screen is drawn on (gate review I5): the shop printer's 4×6 photo paper (undefined until
 * read, null = not set up) and A4 edges, plus the owner's extra edge. Change, its choices, Print style and Ready draw
 * with the same, so a preview or a page count never differs from the print.
 */
export function usePlanPaper() {
  const edge = useExtraEdgeMm();
  const [setup, setSetup] = useState<Setup>(last);
  useEffect(() => {
    void PrintEngine.paperSetup().then(
      (s) => {
        last = { photoPaper: s.photoPaper ?? null, a4EdgeMm: s.a4EdgeMm };
        setSetup(last);
      },
      () => setSetup({ photoPaper: null }),
    );
  }, []);
  return {
    photoPaper: setup.photoPaper,
    /** Changes whenever a plan drawn with [draw] would (memo dependency). */
    key: `${edge}|${setup.photoPaper ? `${setup.photoPaper.wMils}x${setup.photoPaper.hMils}@${setup.photoPaper.edgeMm}` : String(setup.photoPaper)}|${setup.a4EdgeMm}`,
    /** A job on 4×6 paper waits for the printer's paper: never drawn on A4 first. */
    ready: (job: Job) => job.paper !== 'PHOTO_4x6' || setup.photoPaper !== undefined,
    draw: (job: Job, aspects: ReadonlyMap<number, number>, docs?: ReadonlyMap<number, PdfFacts>): PrintPlan =>
      buildPlan(job, aspects, setup.photoPaper ?? undefined, setup.a4EdgeMm, docs, edge),
  };
}
