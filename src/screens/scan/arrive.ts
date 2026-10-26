import { MAX_JOB_FILES } from '../../core/intake/addInto';
import { addToJob } from '../../core/intake/merge';
import { type Job, normalizeJob } from '../../core/job/job';
import type { NavAction, Screen } from '../../core/nav/stack';
import { type Intake, PrintEngine } from '../../native/printEngine';
import { saveJobChange } from '../received/Received';

/**
 * Owner, round 8 (scan pages): a page the camera took opens on its corners screen (Page n). A new scan job's first page
 * (Done then goes on to Scanned pages); a page for a job ([Intake.scan] into) joins it, in place of the page it retakes,
 * and Done comes back. The add screen, or the page being retaken, gives way to it. A job that is full or gone: the page
 * stays a scan job of its own (in Recent jobs) and opens as one.
 */
export async function scanArrived(
  jobs: Job[],
  scans: ReadonlyMap<string, NonNullable<Intake['scan']>>,
  top: () => Screen | undefined,
  goNow: (a: NavAction) => void,
): Promise<void> {
  for (const job of jobs) {
    const s = scans.get(job.id);
    const target = s?.into
      ? normalizeJob((await PrintEngine.loadJob({ id: s.into }).catch(() => ({ job: null }))).job)
      : null;
    let jobId = job.id;
    let index = job.items[0]?.index ?? 1;
    let next = 'pages';
    if (target) {
      const r = await addToJob(PrintEngine, target.id, job.id, Date.now(), MAX_JOB_FILES - target.items.length).catch(
        () => null,
      );
      const added = r?.added[0];
      if (r && added !== undefined) {
        let j = r.job;
        if (s?.retake !== undefined && j.items.some((i) => i.index === s.retake))
          // Pages to print as chosen before the photo joined (joining resets them; review I6).
          j = await saveJobChange(j, { type: 'retakeItem', old: s.retake, new: added, pages: target.docPages }).catch(
            () => j,
          );
        window.dispatchEvent(new CustomEvent('ps-job-changed', { detail: { jobId: j.id, added: [added] } }));
        jobId = j.id;
        index = added;
        next = 'back';
      }
    }
    const shown = top();
    const retaking = s?.retake !== undefined && shown?.name === 'scanpage';
    goNow({
      type: retaking || shown?.name === 'receiving' || shown?.name === 'addsource' ? 'replace' : 'push',
      screen: { name: 'scanpage', params: { jobId, index, next: retaking ? (shown?.params.next ?? next) : next } },
    });
  }
}
