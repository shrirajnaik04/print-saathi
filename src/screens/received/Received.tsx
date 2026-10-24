import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { isStorageFull } from '../../core/intake/messages';
import { type Job, type JobAction, type JobLayout, normalizeJob } from '../../core/job/job';
import { saveChange } from '../../core/job/save';
import { unprintableText } from '../../core/job/unprintable';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine, type ThumbResult } from '../../native/printEngine';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import { AutoTurnNote } from '../AutoTurnNote';
import { findBlackEdges, prepareBlackEdges } from '../blackEdges';
import { Duplicates } from '../Duplicates';
import { JobGone } from '../JobGone';
import { stopTurns, turnsFor } from '../rotate';
import { push, type ScreenProps } from '../types';
import { loadSettings } from '../useSettings';

const t = en.received;

/** Saves one change through the single writer (core/job/save.ts); throws if it could not be saved. */
export const saveJobChange = (job: Job, action: JobAction): Promise<Job> =>
  saveChange(PrintEngine, job, action, Date.now());

const STATE_TEXT: Partial<Record<ThumbResult['state'], string>> = {
  damaged: t.damaged,
  unsupported: t.iphone,
  retry: t.retry,
  tooBig: t.tooBig,
  notPhoto: t.notPhoto,
};

/**
 * Received — "What did the customer ask?" (PLAN §I-2, J0–J3). The question and its choices come first, so with
 * 30 photos the shopkeeper never has to scroll past every thumbnail to reach the next step; the photos follow below.
 */
/** Jobs chosen on Home for passport photos that already went on to the frame (this run of the app). */
const passportStarted = new Set<string>();
/** Jobs chosen on Home for ID cards that already went on to the cards (this run of the app). */
const cardsStarted = new Set<string>();

export function Received({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const [job, setJob] = useState<Job | null>(null);
  const [gone, setGone] = useState(false);
  const [thumbs, setThumbs] = useState<Map<number, ThumbResult> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Chosen on Home for passport photos (PLAN §J0): go on to the passport photo by itself once the photos are ready.
  // Once per job: Back from the frame lands here and stays (review I1).
  const [passportWaiting, setPassportWaiting] = useState(
    () => params?.passport === true && !passportStarted.has(jobId),
  );
  // Chosen on Home for Aadhaar & ID cards (Phase 14): straight on to the cards once the files are ready.
  const cardsWaiting = useRef(params?.cards === true && !cardsStarted.has(jobId));
  // A shared PDF that looks like an e-Aadhaar (two card panels): offer ID card copy instead of going straight on.
  const [aadhaar, setAadhaar] = useState(false);
  const [saving, setSaving] = useState(false);
  // For the late auto-turn save: never while a choice is being saved, always onto the newest job.
  const savingRef = useRef(false);
  savingRef.current = saving;
  const latestRef = useRef<Job | null>(null);
  latestRef.current = job;
  const [saveFailed, setSaveFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [made, setMade] = useState<{ done: number; total: number } | null>(null);

  // Customer photos on screen: keep them out of screenshots on Android 12 and older (PLAN §D6).
  useEffect(() => {
    void PrintEngine.setCustomerContentShown({ shown: true });
    return () => void PrintEngine.setCustomerContentShown({ shown: false });
  }, []);

  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    void (async () => {
      try {
        const { job: loaded } = await PrintEngine.loadJob({ id: jobId });
        if (!live) return;
        if (!loaded) return setGone(true);
        const n = normalizeJob(loaded);
        // Aadhaar & ID cards from Home with an e-Aadhaar PDF: the cards screen unlocks and finds it (Phase 14).
        if (cardsWaiting.current && n?.items.some((i) => i.type === 'pdf')) {
          cardsWaiting.current = false;
          cardsStarted.add(jobId);
          go({ type: 'replace', screen: { name: 'cards', params: { jobId } } });
          return;
        }
        // One PDF alone that shows card panels (an e-Aadhaar): asked, ID card copy or the whole document (Phase 14).
        if (
          n &&
          n.items.length === 1 &&
          n.items[0]?.type === 'pdf' &&
          n.layout !== 'document' &&
          n.layout !== 'idCard'
        ) {
          const found = await PrintEngine.findCards({ jobId }).catch(() => ({ items: [] }));
          if (!live) return;
          // Two card-sized panels: an e-Aadhaar. (A locked one goes on to Ready, which offers card copy once it is
          // unlocked: other locked PDFs keep their usual taps.)
          if (found.items.some((i) => i.cards.filter((c) => c.confidence >= 0.75).length >= 2)) {
            setJob(n);
            setThumbs(new Map());
            setAadhaar(true);
            return;
          }
        }
        // A PDF, or PDFs with photos: printed as a document, straight to Ready (PLAN §I-2: this screen is skipped).
        if (n?.items.some((i) => i.type === 'pdf')) {
          await saveJobChange(n, { type: 'setDocument' });
          if (live) go({ type: 'replace', screen: { name: 'ready', params: { jobId } } });
          return;
        }
        setJob(n);
        const progress = PrintEngine.addListener('thumbnailProgress', (e) => {
          if (live && e.jobId === jobId) setMade({ done: e.done, total: e.total });
        });
        const { items } = await PrintEngine.makeThumbnails({ jobId }).finally(
          () => void progress.then((h) => h.remove()),
        );
        if (live) setThumbs(new Map(items.map((i) => [i.index, i])));
        // Look for black edges now, while the shopkeeper reads the choices (the question then needs no wait).
        if (live && n?.edges === undefined) prepareBlackEdges(jobId);
        // Phase 15: photos sent sideways or upside down are turned upright (once per job; Undo is on screen). Not
        // while going on to the cards (they have their own way up).
        if (live && n && !n.autoTurnDone && !cardsWaiting.current && n.layout !== 'idCard') {
          const turns = await turnsFor(n);
          if (live && mounted.current && !savingRef.current) {
            const now = latestRef.current ?? n;
            const next = await saveJobChange(now, { type: 'autoTurn', turns }).catch(() => null);
            if (next && live) setJob(next);
          }
        }
      } catch {
        // Never a blank screen or an endless "Getting the photos ready…" (gate re-review #9).
        if (live) setLoadFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [jobId, reload]);

  // Timing mark: the choices are on screen (device performance runs, PLAN §P).
  const shown = job !== null;
  useEffect(() => {
    if (shown) performance.mark?.('ps-received');
  }, [shown]);
  const tryAgain = { label: en.ready.tryAgain, onClick: () => setReload((n) => n + 1) };
  const passportRef = useRef<() => Promise<void>>(async () => {});
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      // Leaving Received: the faces still being looked at are not needed (the phone's previews come first).
      stopTurns(jobId);
    },
    [],
  );
  useEffect(() => {
    if (cardsWaiting.current && thumbs !== null) {
      cardsWaiting.current = false;
      cardsStarted.add(jobId);
      go(push('cards', { jobId }));
    }
  }, [thumbs]);
  useEffect(() => {
    if (passportWaiting && thumbs !== null) {
      setPassportWaiting(false);
      passportStarted.add(jobId);
      void passportRef.current();
    }
  }, [passportWaiting, thumbs]);
  if (gone) return <JobGone go={go} title={t.title} />;
  if (!job)
    return (
      <main class="screen">
        <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
        {loadFailed && <Panel kind="error" title={en.ready.loadFailed} action={tryAgain} />}
      </main>
    );
  const retry = [...(thumbs?.values() ?? [])].some((th) => th.state === 'retry');
  const printable = job.items.filter((i) => thumbs?.get(i.index)?.state === 'ok');
  // The customer's request sets the job's layout (or prints the photos as a document, PLAN §J6), then, once per job,
  // "Black edges?" when the photos have some (PLAN §F5), then Ready (PLAN §J1–J3).
  const ask = async (layout: JobLayout) => {
    if (saving) return; // a second tap while saving must not open Ready twice (gate review #4)
    performance.mark?.('ps-choice');
    setSaving(true);
    setSaveFailed(false);
    try {
      let next = await saveJobChange(
        job,
        layout === 'document' ? { type: 'setDocument' } : { type: 'setLayout', layout },
      );
      // Not answered yet: what this choice finds replaces any earlier suggestion (another choice may have allowed
      // white edges, gate I-2); asked only when something was found. Meanwhile the way-up check (Phase 15) ends
      // too: its turns are saved before Ready, never later behind the shopkeeper (review I1).
      const turning = next.autoTurnDone ? Promise.resolve({}) : turnsFor(next);
      // The turns are a help, never a hurdle: if they can't be saved (a full phone), the choice goes on without them.
      const turned = async (j: Job, turns: Record<number, 1 | 2 | 3>) =>
        saveJobChange(j, { type: 'autoTurn', turns }).catch(() => j);
      let found = 0;
      if (next.edges === undefined) {
        const [crops, turns] = await Promise.all([findBlackEdges(next), turning]);
        next = await saveJobChange(next, { type: 'setSuggestions', crops });
        next = await turned(next, turns);
        found = Object.keys(next.suggested ?? {}).length;
      } else next = await turned(next, await turning);
      // The shopkeeper may have left meanwhile (Back, Home, a new share): never open a screen behind them (gate I-1).
      if (!mounted.current) return;
      setJob(next);
      go(push(found > 0 ? 'blackedges' : 'ready', { jobId }));
    } catch {
      setSaveFailed(true); // gate review #3: say so, never a dead tap
    } finally {
      setSaving(false);
    }
  };
  // Passport photos (PLAN §J4): one photo goes straight to the frame; several ask which one first.
  const passport = async () => {
    if (saving) return;
    // Tapped before the photos are ready: say so, and go on by itself once they are (gate M4).
    if (thumbs === null) return setPassportWaiting(true);
    if (printable.length === 0) return;
    if (printable.length > 1) return go(push('whichphoto', { jobId }));
    setSaving(true);
    setSaveFailed(false);
    try {
      const { passport } = await loadSettings();
      // A sideways portrait is turned upright before it is framed (review I1).
      const base = job.autoTurnDone
        ? job
        : await saveJobChange(job, { type: 'autoTurn', turns: await turnsFor(job) }).catch(() => job);
      setJob(
        await saveJobChange(base, {
          type: 'setPassport',
          item: (printable[0] as { index: number }).index,
          defaults: {
            count: passport.count,
            preset: passport.preset,
            border: passport.border,
            custom: passport.custom,
          },
        }),
      );
      go(push('passportcrop', { jobId }));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };
  passportRef.current = passport;
  const choice = (
    key: string,
    title: string,
    icon: 'photos' | 'files' | 'passport' | 'document',
    layout: JobLayout,
  ) => <Tile key={key} icon={icon} title={title} onClick={() => void ask(layout)} />;

  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <h2>{`${job.items.length} ${job.items.length === 1 ? 'file' : 'files'}`}</h2>
      {(retry || (loadFailed && thumbs === null)) && <Panel kind="warn" title={t.retryAll} action={tryAgain} />}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {job.notices.map((n) =>
        // Some files met a full phone (PLAN §J8, review M9): the way to make room is offered here too.
        isStorageFull(n) ? (
          <Panel
            key={n}
            kind="warn"
            title={n}
            action={{ label: en.deleteAll.makeRoom, onClick: () => go(push('deleteall', { keepOpen: true })) }}
          />
        ) : (
          <Panel key={n} kind="warn" title={n} />
        ),
      )}
      {aadhaar ? (
        <>
          <h2>{t.ask}</h2>
          <div class="stack rise">
            <Tile icon="card" tone="cards" title={t.idCard} onClick={() => go(push('cards', { jobId }))} />
            {choice('asDocument', t.wholeDocument, 'document', 'document')}
            {saving && <p role="status">{en.edges.looking}</p>}
          </div>
        </>
      ) : thumbs !== null && printable.length === 0 ? (
        <Panel kind="warn" title={t.nothing} />
      ) : (
        <>
          <h2>{t.ask}</h2>
          <div class="stack rise">
            {choice('allOnOne', t.allOnOne, 'photos', 'allOnOne')}
            {choice('onePerPage', t.onePerPage, 'files', 'onePerPage')}
            {choice('morePages', t.morePages, 'photos', 'morePages')}
            <Tile icon="passport" title={t.passport} onClick={() => void passport()} />
            {/* ID card copy (Phase 14): for one or two photos (a card's front and back). */}
            {printable.length >= 1 && printable.length <= 2 && (
              <Tile icon="card" title={t.idCard} onClick={() => go(push('cards', { jobId }))} />
            )}
            {passportWaiting && <p role="status">{en.received.preparing}</p>}
            {choice('asDocument', t.asDocument, 'document', 'document')}
            {saving && <p role="status">{en.edges.looking}</p>}
          </div>
        </>
      )}
      <AutoTurnNote
        job={job}
        busy={saving}
        onUndo={async () => {
          const next = await saveJobChange(job, { type: 'undoAutoTurn' }).catch(() => null);
          if (next) setJob(next);
          return !!next;
        }}
      />
      <Duplicates job={job} onChange={setJob} />
      <h2>{t.photosHeading}</h2>
      {thumbs === null ? (
        // Big shares take a while (PLAN §F6, §H2.7): words, a bar and Cancel (the job is kept; Recent has it).
        <div class="stack">
          <p role="status">{made ? fill(t.preparingOf, { done: made.done, total: made.total }) : t.preparing}</p>
          {made && <progress class="progress" max={made.total} value={made.done} aria-label={t.preparing} />}
          <Button
            variant="secondary"
            onClick={() => {
              void PrintEngine.cancelThumbnails({ jobId });
              go({ type: 'home' });
            }}
          >
            {t.cancel}
          </Button>
        </div>
      ) : (
        <ul class="thumb-grid">
          {job.items.map((it, i) => {
            const th = thumbs.get(it.index);
            return (
              <li key={it.index} class="thumb">
                {th?.state === 'ok' && th.thumb ? (
                  <img
                    src={Capacitor.convertFileSrc(th.thumb)}
                    alt={`${i + 1} of ${job.items.length}`}
                    class={`turn-${job.turns[it.index] ?? 0}`}
                  />
                ) : (
                  <span class="thumb-note">
                    {th?.state === 'notPhoto'
                      ? unprintableText(it.type)
                      : (STATE_TEXT[th?.state ?? 'damaged'] ?? t.damaged)}
                  </span>
                )}
                <span class="thumb-number" aria-hidden="true">
                  {i + 1}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
