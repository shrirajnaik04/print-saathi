import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'preact/hooks';
import type { Job } from '../../core/job/job';
import { recentJobs } from '../../core/job/recent';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine } from '../../native/printEngine';
import { Button } from '../../ui/Button';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import { push, type ScreenProps } from '../types';
import { useSettings } from '../useSettings';
import { jobText } from './jobText';

const t = en.recent;

/** Recent jobs (PLAN §I-14): every kept job, newest first; tap to open it again. */
export function Recent({ go }: ScreenProps) {
  const { settings } = useSettings();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  // Delete one job or all of them (owner, round 5), each asked once.
  const [ask, setAsk] = useState<{ kind: 'one'; job: Job } | { kind: 'all' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // What a delete did when it was not simply done (review M6): it failed, or a job printing right now was kept.
  const [note, setNote] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  // The covers are customer photos: hidden from screenshots and Recents on Android ≤ 12 (PLAN §D6, review I7).
  useEffect(() => {
    void PrintEngine.setCustomerContentShown({ shown: true });
    return () => void PrintEngine.setCustomerContentShown({ shown: false });
  }, []);
  useEffect(() => {
    void PrintEngine.listJobs().then(({ jobs: stored }) => {
      const list = recentJobs(stored);
      setJobs(list);
      // Each job's first photo, as the shopkeeper saw it (thumbnails already made; nothing is decoded here).
      void PrintEngine.jobCovers({ jobIds: list.map((j) => j.id) }).then(
        ({ covers: c }) => setCovers(c),
        () => {},
      );
    });
  }, [attempt]);
  const deleteOne = async (job: Job) => {
    setAsk(null);
    setNote(null);
    await PrintEngine.deleteJob({ id: job.id }).catch(() => setNote({ kind: 'error', text: t.deleteFailed }));
    setAttempt((n) => n + 1);
  };
  const deleteAll = async () => {
    setAsk(null);
    // A job open on another screen stays (as Settings' Delete all).
    setNote(null);
    const r = await PrintEngine.deleteAllJobs({ keepOpen: true }).catch(() => null);
    if (!r) setNote({ kind: 'error', text: t.deleteFailed });
    else if ((r.kept ?? 0) > 0) setNote({ kind: 'info', text: en.deleteAll.doneKept });
    setAttempt((n) => n + 1);
  };
  const now = Date.now();
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {note && <Panel kind={note.kind} title={note.text} />}
      {jobs !== null && jobs.length === 0 && <Panel kind="info" title={t.empty} />}
      <div class="stack">
        {jobs?.map((j) => {
          const cover = covers[j.id];
          return (
            <div key={j.id} class="stack">
              <Tile
                icon={j.items.some((i) => i.type === 'pdf') ? 'document' : 'photos'}
                image={cover ? (cover.startsWith('/') ? Capacitor.convertFileSrc(cover) : cover) : undefined}
                {...jobText(j, now)}
                // A printed job opens on its pages, PRINT there (owner, round 7: "how to view printed pages?").
                onClick={() => go(push(j.printedAt ? 'ready' : 'received', { jobId: j.id }))}
              />
              {/* ...and Choose again goes back to what the customer asked (passport photos, an ID card, round 7 I2). */}
              {j.printedAt && (
                <Button variant="secondary" icon="undo" onClick={() => go(push('received', { jobId: j.id }))}>
                  {t.chooseAgain}
                </Button>
              )}
              <Button
                variant="secondary"
                icon="remove"
                label={`${t.delete} (${jobText(j, now).title} · ${jobText(j, now).helper})`}
                onClick={() => setAsk({ kind: 'one', job: j })}
              >
                {t.delete}
              </Button>
            </div>
          );
        })}
      </div>
      {jobs && jobs.length > 0 && (
        <Button variant="danger" icon="remove" onClick={() => setAsk({ kind: 'all' })}>
          {t.deleteAll}
        </Button>
      )}
      <p class="muted">{fill(t.kept, { period: en.settings.retention[settings.retention] })}</p>
      {ask?.kind === 'one' && (
        <ConfirmSheet
          title={t.deleteOne}
          line={t.deleteOneLine}
          onDismiss={() => setAsk(null)}
          choices={[
            { label: t.keep, kind: 'primary', onChoose: () => setAsk(null) },
            { label: t.delete, kind: 'danger', onChoose: () => void deleteOne(ask.job) },
          ]}
        />
      )}
      {ask?.kind === 'all' && (
        <ConfirmSheet
          title={t.deleteAllQ}
          line={t.deleteAllLine}
          onDismiss={() => setAsk(null)}
          choices={[
            { label: t.keep, kind: 'primary', onChoose: () => setAsk(null) },
            { label: t.deleteAllYes, kind: 'danger', onChoose: () => void deleteAll() },
          ]}
        />
      )}
    </main>
  );
}
