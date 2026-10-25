import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Job } from '../../core/job/job';
import { continueJob } from '../../core/job/recent';
import { en } from '../../i18n/en';
import { PrintEngine } from '../../native/printEngine';
import { BrandMark } from '../../ui/BrandMark';
import { Button } from '../../ui/Button';
import type { IconName } from '../../ui/icons';
import { Panel } from '../../ui/Panel';
import { Tile, type TileTone } from '../../ui/Tile';
import { usePinWhileSmall } from '../../ui/usePinWhileSmall';
import { useRevealOnShow } from '../../ui/useRevealOnShow';
import { jobText } from '../recent/jobText';
import { push, type ScreenProps } from '../types';
import { useSettings } from '../useSettings';

const t = en.home;
type PickKind = 'photos' | 'passport' | 'documents' | 'cards';
const JOBS: { key: PickKind; icon: IconName; title: string; tone: TileTone }[] = [
  { key: 'photos', icon: 'photos', title: t.photos, tone: 'photos' },
  { key: 'passport', icon: 'passport', title: t.passport, tone: 'passport' },
  { key: 'documents', icon: 'document', title: t.documents, tone: 'documents' },
  { key: 'cards', icon: 'card', title: t.cards, tone: 'cards' },
];

/** Home (PLAN §H3): the big jobs, Recent jobs, then owner tools at the bottom (owner, round 4: no WhatsApp card). */
export function Home({ go }: ScreenProps) {
  // A job left unprinted (the app was closed, or the shopkeeper went back): one tap continues it (PLAN §H3).
  const [last, setLast] = useState<Job | null>(null);
  // A timing mark for the performance check (PLAN §P "cold start → Home usable"): a name only, no data.
  useEffect(() => {
    performance.mark?.('ps-home');
  }, []);
  // Its first photo, like Recent jobs (spec Part 1: the Continue card shows the job).
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    void PrintEngine.listJobs().then(({ jobs }) => {
      const job = continueJob(jobs);
      setLast(job);
      if (job)
        void PrintEngine.jobCovers({ jobIds: [job.id] }).then(
          ({ covers }) => setCover(covers[job.id] ?? null),
          () => {},
        );
    });
  }, []);
  // First start (PLAN §I-16): the four steps once; a share at first start opens straight on Received instead.
  const { settings, ready } = useSettings();
  const welcomed = useRef(false);
  useEffect(() => {
    if (ready && !settings.welcomed && !welcomed.current) {
      welcomed.current = true;
      go(push('welcome'));
    }
  }, [ready, settings.welcomed]);
  // No printing app at all (Android 7 has none built in): only "Save as PDF" would appear (PLAN §D4, §K12).
  const [canPrint, setCanPrint] = useState<boolean | null>(null);
  useEffect(() => {
    void PrintEngine.printServices().then(
      (s) => setCanPrint(s.any),
      () => setCanPrint(null),
    );
  }, []);
  // Choose from phone (PLAN §D3, §J0): the phone's own picker; the files then arrive like a share. A picker that
  // cannot open says so right where the shopkeeper tapped.
  const [failed, setFailed] = useState<string | null>(null);
  const noteRef = useRevealOnShow<HTMLDivElement>(failed);
  // The logo bar stays at the top while it is small (owner, 2026-10-24); a tall one (big text, phone sideways) scrolls.
  const [brandRef, brandPinned] = usePinWhileSmall(0.15, 'top');
  const note = (key: string) =>
    failed === key && (
      <div ref={noteRef}>
        <Panel kind="error" title={t.pickFailed} />
      </div>
    );
  // One picker at a time: a second quick tap must not open a second one (review M4).
  const picking = useRef(false);
  const choose = async (kind: PickKind) => {
    // ID cards: first "Where is the card?" (gallery or file manager, owner 2026-10-23).
    if (kind === 'cards') return go(push('cardsource'));
    if (picking.current) return;
    picking.current = true;
    setFailed(null);
    try {
      await PrintEngine.pickFiles({ kind });
    } catch {
      setFailed(kind);
    } finally {
      picking.current = false;
    }
  };
  return (
    <main class="screen">
      <h1 ref={brandRef} class={brandPinned ? 'brand-title brand-pinned' : 'brand-title'}>
        <BrandMark />
        {en.app.name}
      </h1>
      <p class="lead">{t.lead}</p>
      <div class="tile-grid rise">
        {JOBS.map((j) => (
          <Tile
            key={j.key}
            icon={j.icon}
            tone={j.tone}
            title={j.title}
            helper={t.chooseFromPhone}
            onClick={() => void choose(j.key)}
          />
        ))}
      </div>
      {/* Under the tiles, not between them: the grid never shifts (review M5). */}
      {failed && note(failed)}
      {/* Under the four jobs (owner, 2026-10-23): the jobs the shopkeeper starts most stay in the same place. */}
      {last && (
        <div class="stack section-gap">
          <Tile
            icon="next"
            image={cover ? Capacitor.convertFileSrc(cover) : undefined}
            title={t.continueTitle}
            helper={(({ title, helper }) => `${title} · ${helper}`)(jobText(last, Date.now()))}
            onClick={() => go(push('received', { jobId: last.id }))}
          />
        </div>
      )}
      <div class="stack section-gap">
        <Button variant="secondary" icon="recent" onClick={() => go(push('recent'))}>
          {t.recent}
        </Button>
      </div>
      <h2 class="section-title">{t.owner}</h2>
      {canPrint === false && (
        <Panel kind="warn" title={t.noPrintService} action={{ label: t.howToFix, onClick: () => go(push('help')) }} />
      )}
      <div class="stack">
        <Button variant="secondary" icon="settings" onClick={() => go(push('settings'))}>
          {t.settings}
        </Button>
        <Button variant="secondary" icon="help" onClick={() => go(push('help'))}>
          {t.help}
        </Button>
        <Button variant="secondary" icon="print" onClick={() => go(push('tests'))}>
          {t.tests}
        </Button>
      </div>
    </main>
  );
}
