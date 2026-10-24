import { useState } from 'preact/hooks';
import type { Job } from '../core/job/job';
import { en } from '../i18n/en';
import { fill } from '../i18n/fill';
import { Panel } from '../ui/Panel';

const t = en.rotate;

/**
 * Phase 15 (spec Part 3): "Turned 2 photos upright." with Undo, while the app's own turns are in place. [onUndo]
 * takes them back (the shopkeeper's own turns are never touched).
 */
export function AutoTurnNote({
  job,
  onUndo,
  busy,
}: {
  job: Job | null;
  /** false when the change could not be saved. */
  onUndo: () => Promise<boolean>;
  busy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Only the job's own photos (a removed one no longer counts, review M3).
  const n = Object.keys(job?.autoTurned ?? {}).filter((k) => job?.items.some((i) => i.index === Number(k))).length;
  // Not where Undo would show nothing (ID cards) or move a frame the shopkeeper set (a framed passport photo), review M2.
  if (!job || n === 0 || job.layout === 'idCard' || (job.layout === 'passport' && job.passport?.crop)) return null;
  return (
    <>
      <Panel
        kind="info"
        title={n === 1 ? t.one : fill(t.many, { n })}
        action={{
          label: t.undo,
          onClick: async () => {
            if (busy) return;
            setFailed(!(await onUndo()));
          },
        }}
      />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
    </>
  );
}
