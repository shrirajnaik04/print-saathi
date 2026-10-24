import { useEffect, useState } from 'preact/hooks';
import { addToJob } from '../../core/intake/merge';
import { normalizeJob } from '../../core/job/job';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.newFiles;

/**
 * New files arrived (PLAN §I-17, §J8): shares came in while a job is open (every share since the question opened,
 * review I4). Start a new job with them, add them to the open job (not after it was printed: everything would print
 * again, review I3), or keep working (they wait in Recent jobs). Nothing is lost whichever is chosen.
 */
export function NewFiles({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const newJobIds = Array.isArray(params?.newJobIds) ? (params.newJobIds as string[]).map(String) : [];
  const [found, setFound] = useState<{ ids: string[]; files: number; printed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = newJobIds.join(',');
  useEffect(() => {
    let live = true;
    void (async () => {
      const ids: string[] = [];
      let files = 0;
      for (const id of newJobIds) {
        const job = normalizeJob((await PrintEngine.loadJob({ id }).catch(() => ({ job: null }))).job);
        if (job) {
          ids.push(id);
          files += job.items.length;
        }
      }
      const open = normalizeJob((await PrintEngine.loadJob({ id: jobId }).catch(() => ({ job: null }))).job);
      if (!live) return;
      // Restored after the new files were already added or deleted: nothing to ask any more (review M7).
      if (ids.length === 0) return go({ type: 'back' });
      setFound({ ids, files, printed: params?.printed === true || open?.printedAt !== undefined });
    })();
    return () => {
      live = false;
    };
  }, [jobId, key]);

  /** Merges every new job into [into] (one by one, so a failure leaves the rest where they were). */
  const mergeAll = async (into: string, ids: string[]) => {
    for (const id of ids) await addToJob(PrintEngine, into, id, Date.now());
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    run(async () => {
      await mergeAll(jobId, found?.ids ?? []);
      // Every file is on Received again: The shopkeeper says once more what the customer asked, for all of them.
      go({ type: 'home', andOpen: { name: 'received', params: { jobId } } });
    });
  const start = () =>
    run(async () => {
      const [first, ...rest] = found?.ids ?? [];
      if (!first) return;
      await mergeAll(first, rest); // several shares in a row: one new job for the customer
      go({ type: 'replace', screen: { name: 'received', params: { jobId: first } } });
    });

  const n = found?.files ?? 0;
  return (
    <main class="screen">
      <TopBar
        title={t.title}
        onBack={() => !busy && go({ type: 'back' })}
        onHome={() => !busy && go({ type: 'home' })}
      />
      {failed && <Panel kind="error" title={t.addFailed} />}
      {n > 0 && <h2>{n === 1 ? t.one : fill(t.many, { n })}</h2>}
      {found?.printed && <Panel kind="info" title={t.printed} />}
      <p>{t.keepNote}</p>
      <ActionBar>
        <Button icon="check" busy={busy} disabled={!found} onClick={() => void start()}>
          {t.start}
        </Button>
        {found && !found.printed && (
          <Button variant="secondary" disabled={busy} onClick={() => void add()}>
            {t.add}
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => go({ type: 'back' })}>
          {t.keep}
        </Button>
      </ActionBar>
    </main>
  );
}
