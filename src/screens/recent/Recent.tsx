import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'preact/hooks';
import type { Job } from '../../core/job/job';
import { recentJobs } from '../../core/job/recent';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { whenText } from '../../i18n/when';
import { PrintEngine } from '../../native/printEngine';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import { push, type ScreenProps } from '../types';
import { useSettings } from '../useSettings';

const t = en.recent;

/** "6 files" / "Today 3:40 pm · Not printed yet": what a job is, and when and whether it printed. */
export function jobText(job: Job, nowMs: number): { title: string; helper: string } {
  const n = job.items.length;
  return {
    title: `${n} ${n === 1 ? t.file : t.files}`,
    helper: `${whenText(job.updatedAt, nowMs)} · ${job.printedAt ? t.printed : t.notPrinted}`,
  };
}

/** Recent jobs (PLAN §I-14): every kept job, newest first; tap to open it again. */
export function Recent({ go }: ScreenProps) {
  const { settings } = useSettings();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
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
  }, []);
  const now = Date.now();
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
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
                onClick={() => go(push('received', { jobId: j.id }))}
              />
              {/* A printed job prints again with the same choices, straight from Ready (PLAN §I-14). */}
              {j.printedAt && (
                <Button variant="secondary" icon="print" onClick={() => go(push('ready', { jobId: j.id }))}>
                  {t.printAgain}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p class="muted">{fill(t.kept, { period: en.settings.retention[settings.retention] })}</p>
    </main>
  );
}
