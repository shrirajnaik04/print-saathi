import { useRef, useState } from 'preact/hooks';
import type { Job } from '../../core/job/job';
import { fill } from '../../i18n/fill';
import { officeWords } from '../../i18n/office';
import { PrintEngine } from '../../native/printEngine';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';

const w = officeWords;

/**
 * Round 9 (owner: "When doc file is shared … we get this error"): the job's Office files. One PrintSaathi could not make
 * into pages says it prints from WPS Office; one it did make says to check the preview (and when charts or diagrams
 * were left out). Each has Print with WPS Office, which opens the customer's own file there. One hand-off at a time.
 */
export function OfficeFiles({ job }: { job: Job }) {
  const items = job.items.filter((i) => i.office || i.type === 'office');
  const [note, setNote] = useState<string | null>(null);
  const opening = useRef(false);
  if (items.length === 0) return null;
  const open = async (index: number) => {
    if (opening.current) return;
    opening.current = true;
    setNote(null);
    try {
      const r = await PrintEngine.openInOffice({ jobId: job.id, index });
      if (r.noApp) setNote(w.noApp);
    } catch {
      setNote(w.failed);
    } finally {
      opening.current = false;
    }
  };
  return (
    <div class="stack office-files">
      {items.map((it) => {
        const kind = it.office?.kind ?? 'office';
        const made = it.type === 'pdf';
        const name = items.length > 1 ? `${fill(w.fileN, { n: job.items.indexOf(it) + 1 })}: ` : '';
        return (
          <Panel key={it.index} kind="info" title={name + (made ? w.made[kind] : w.prints[kind])}>
            {made && it.office?.missed && <p>{w.missed}</p>}
            <Button variant={made ? 'secondary' : 'primary'} icon="print" onClick={() => void open(it.index)}>
              {w.open}
            </Button>
          </Panel>
        );
      })}
      {note && <Panel kind="error" title={note} />}
    </div>
  );
}
