import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Job, normalizeJob } from '../../core/job/job';
import { unprintableNotes } from '../../core/job/unprintable';
import { overlaps } from '../../core/layout/free';
import { smallestSideMm, WARN_MM } from '../../core/layout/layouts';
import { blurryItems } from '../../core/plan/blurry';
import { MAX_SHEETS_PER_PART, splitParts } from '../../core/plan/parts';
import { buildPlan, type PhotoPaper, planHash } from '../../core/plan/plan';
import { documentLine, idCardLine, passportLine, summaryLine } from '../../core/plan/summary';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { passwords } from '../../native/passwords';
import { PrintEngine, type RenderResult, type ThumbResult } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ColourSwitch } from '../../ui/ColourSwitch';
import { Panel } from '../../ui/Panel';
import { FilePage, PaperPreview } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { usePinWhileSmall } from '../../ui/usePinWhileSmall';
import { AutoTurnNote } from '../AutoTurnNote';
import { pickAt, toPagePoints } from '../adjust/place';
import { Duplicates } from '../Duplicates';
import { JobGone } from '../JobGone';
import { saveJobChange } from '../received/Received';
import { push, type ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useSettings } from '../useSettings';

const t = en.ready;

/** Jobs whose long PDF already asked which pages to print (Ready mounts again after Back: ask once, review I3). */
const askedPagesFor = new Set<string>();
/** Page images asked for on Ready: the first sheets; later sheets show the print file's own pages once made. */
const READY_PAGE_IMAGES = 12;

/** Jobs whose owner chose to keep very small photos (gate review #9): not asked again during this run. */
const keptSmall = new Set<string>();

type View = { state: 'preparing'; done: number; total: number } | RenderResult;

/**
 * Ready to print (PLAN §I-5): every sheet drawn from the plan, the summary line and one PRINT button. The print
 * file is made in the background as soon as the plan is known; a result for a plan no longer shown is ignored.
 */
export function Ready({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const [job, setJob] = useState<Job | null>(null);
  const [gone, setGone] = useState(false);
  const [thumbs, setThumbs] = useState<Map<number, ThumbResult> | null>(null);
  const [view, setView] = useState<View>({ state: 'preparing', done: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  // The owner's prices, reminder and edge space must be known before printing (review M10).
  const { settings, ready: settingsReady } = useSettings();
  // Previous / Next page: which sheet is shown (the list still scrolls freely).
  const [at, setAt] = useState(0);
  const sheetsRef = useRef<HTMLOListElement>(null);
  // The page buttons stay at the top while paging, if they are small enough not to hide the sheets (gate review I8:
  // with the PRINT bar, at most about 40 % of the screen is ever covered).
  const [pagerRef, pagerPinned] = usePinWhileSmall(0.15, 'top');
  // While Previous / Next scroll the list, the scrolling itself must not move the page number (a second quick tap
  // would step from a page passed on the way).
  const pagedAt = useRef(0);
  const showPage = (n: number) => {
    pagedAt.current = Date.now();
    setAt(n);
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    sheetsRef.current?.children[n]?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  };
  // The label follows the shopkeeper scrolling by hand: the sheet nearest the middle of the screen (gate review I8).
  useEffect(() => {
    let settled = 0;
    // Once the scrolling stops: The shopkeeper's own scrolling moves the page number; the buttons' scrolling has set it already.
    const onScroll = () => {
      clearTimeout(settled);
      settled = window.setTimeout(() => {
        if (pagedAt.current) {
          // The first stop after a tap is the buttons' own scrolling (unless that tap needed no scrolling at all).
          const fresh = Date.now() - pagedAt.current < 1500;
          pagedAt.current = 0;
          if (fresh) return;
        }
        const sheets = Array.from(sheetsRef.current?.children ?? []);
        if (!sheets.length) return;
        if (window.scrollY <= 0) return setAt(0);
        const middle = window.innerHeight / 2;
        const distance = (el: Element) => {
          const r = el.getBoundingClientRect();
          return Math.abs((r.top + r.bottom) / 2 - middle);
        };
        setAt(sheets.reduce((best, el, i) => (distance(el) < distance(sheets[best] as Element) ? i : best), 0));
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(settled);
    };
  }, []);
  const openingNow = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  // The real file's pages, for the plan hash they belong to (a newer plan never shows an older file).
  const [filePages, setFilePages] = useState<{ hash: string; pages: string[] } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [keepSmall, setKeepSmall] = useState(false);
  const [reload, setReload] = useState(0);
  // The shop printer's 4×6 photo paper (passport sheets, PLAN §D4); undefined until known, null = none saved.
  const [photoPaper, setPhotoPaper] = useState<PhotoPaper | null | undefined>(undefined);
  const [a4EdgeMm, setA4EdgeMm] = useState<number | undefined>(undefined);
  useEffect(() => {
    void PrintEngine.paperSetup().then(
      (s) => {
        setA4EdgeMm(s.a4EdgeMm);
        setPhotoPaper(s.photoPaper ?? null);
      },
      () => setPhotoPaper(null),
    );
  }, []);
  const current = useRef('');
  const printing = useRef(false);
  const checking = useRef(false);
  // Which part the print in flight is, for the Result screen ({} for a job printed in one go).
  const partOf = useRef<{ part?: number; parts?: number; partOf?: string }>({});

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
        setJob(normalizeJob(loaded));
        const { items } = await PrintEngine.makeThumbnails({ jobId });
        if (live) setThumbs(new Map(items.map((i) => [i.index, i])));
      } catch {
        // Never a spinner for ever (gate review #9): say so and offer Try again.
        if (live) setLoadFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [jobId, reload]);

  // A job's PDFs as the engine reads them (documents, PLAN §G4).
  const docs = useDocs(jobId, job);
  // One PDF that turns out (once unlocked) to show two card panels — an e-Aadhaar: offer ID card copy (review I1).
  const [cardOffer, setCardOffer] = useState(false);
  const lonePdf = job?.layout === 'document' && job.items.length === 1 && job.items[0]?.type === 'pdf';
  const readable = !!docs.items && !docs.anyLocked;
  useEffect(() => {
    if (!lonePdf || !readable) return;
    let live = true;
    void PrintEngine.findCards({ jobId, passwords: passwords.forJob(jobId) }).then(
      ({ items }) => live && setCardOffer(items.some((i) => i.cards.filter((c) => c.confidence >= 0.75).length >= 2)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [jobId, lonePdf, readable]);
  const fullPlan = useMemo(() => {
    // A passport plan waits for the printer's paper, a document for its PDFs, so each is made once, right.
    // Passport sheets and photos chosen for 4×6 photo paper wait for the printer's paper to be known (never planned,
    // let alone printed, on A4 first).
    if (!job || !thumbs || ((job.layout === 'passport' || job.paper === 'PHOTO_4x6') && photoPaper === undefined))
      return null;
    if (job.layout === 'document' && docs.items === null) return null;
    const aspects = new Map<number, number>();
    for (const th of thumbs.values())
      if (th.state === 'ok' && th.width && th.height) aspects.set(th.index, th.width / th.height);
    // Settings → Space at paper edges: More keeps 3 mm more clear at every edge; Settings → Margins (photos on A4).
    return buildPlan(
      job,
      aspects,
      photoPaper ?? undefined,
      a4EdgeMm,
      docs.facts,
      settings.edges === 'more' ? 3 : 0,
      settings.margins,
    );
  }, [job, thumbs, photoPaper, a4EdgeMm, docs.items, docs.facts, settings.edges, settings.margins]);
  // A big job goes to the printer in parts of at most 40 sheets (PLAN §D4); this screen makes and prints one part.
  const parts = useMemo(() => (fullPlan ? splitParts(fullPlan) : []), [fullPlan]);
  const fullHash = fullPlan ? planHash(fullPlan) : '';
  // Where this job's parts got to: an explicit part (Print again, next part), else the next part not yet printed of
  // this very plan. A plan that changed after a part printed starts again from part 1, and says so (gate M1).
  const progress = job?.partsDone;
  const resumeAt = progress && progress.planHash === fullHash ? progress.done : 0;
  const changedAfter = progress && progress.planHash !== fullHash && progress.done > 0 ? progress.done : 0;
  const partIndex = Math.min(
    // A part number on the screen counts only for the plan it was cut from (re-review N1): after a change it is
    // ignored, so a changed job never continues mid-way through its new sheets.
    Math.max(0, params?.part !== undefined && params?.partOf === fullHash ? Number(params.part) || 0 : resumeAt),
    Math.max(0, parts.length - 1),
  );
  const plan = fullPlan ? (parts[partIndex] ?? fullPlan) : null;
  const hash = plan ? planHash(plan) : '';

  // Timing marks for the performance check (PLAN §P): names only, no data.
  useEffect(() => {
    performance.mark?.('ps-ready');
  }, []);
  useEffect(() => {
    if (view.state === 'done') performance.mark?.('ps-ready-file');
  }, [view.state]);

  // Make the print file for exactly this plan; a newer plan cancels it.
  useEffect(() => {
    if (!plan || plan.pages.length === 0) return;
    current.current = hash;
    setView({ state: 'preparing', done: 0, total: 0 });
    const progress = PrintEngine.addListener('renderProgress', (e) => {
      if (e.planHash === current.current) setView({ state: 'preparing', done: e.done, total: e.total });
    });
    void PrintEngine.renderPlan({ jobId, planHash: hash, plan, passwords: passwords.forJob(jobId) }).then(
      (r) => {
        if (r.planHash === current.current) setView(r);
      },
      () => {
        if (current.current === hash) setView({ planHash: hash, state: 'failed' });
      },
    );
    return () => {
      void progress.then((h) => h.remove());
      void PrintEngine.cancelRender();
    };
  }, [hash, attempt]);

  // Documents: the drawn sheets show each PDF page's small image until the file's own pages are ready.
  useEffect(() => {
    if (!plan || job?.layout !== 'document') return;
    docs.want(
      plan.pages
        .slice(0, READY_PAGE_IMAGES)
        .flatMap((p) =>
          p.placements
            .filter((x) => x.pdfPage !== undefined)
            .map((x) => ({ item: x.itemIndex, page: x.pdfPage as number })),
        ),
    );
  }, [plan]);

  // A very long PDF (over 300 pages) first asks which pages to print (PLAN §F6), once per job, and only when every
  // PDF can be read (a locked one's pages are not known yet, review I2).
  useEffect(() => {
    if (askedPagesFor.has(jobId) || job?.layout !== 'document' || job.docPages || !docs.items || docs.anyLocked) return;
    const total = [...docs.items.values()].reduce((s, d) => s + (d.state === 'ok' ? (d.pages ?? 0) : 0), 0);
    if (total > 300) {
      askedPagesFor.add(jobId);
      go(push('docpages', { jobId }));
    }
  }, [job, docs.items]);

  // Once the print file exists, show its real pages (PLAN §G7.3) one by one as the engine makes them; the plan
  // drawing stays for a page until its image is ready, and a page the engine couldn't show stays drawn while the
  // later ones still come. A newer plan, leaving Ready or tapping PRINT (the engine is left free for printing) stops
  // the requests; pages already made come back from the phone's storage at once.
  useEffect(() => {
    if (view.state !== 'done' || !plan || opening) return;
    const forHash = view.planHash;
    let live = true;
    setFilePages((fp) => (fp?.hash === forHash ? fp : { hash: forHash, pages: [] }));
    void (async () => {
      for (let index = 0; index < plan.pages.length; index++) {
        const r = await PrintEngine.previewPage({ jobId, planHash: forHash, index }).catch(() => null);
        if (!live || current.current !== forHash || (r && r.planHash !== forHash)) return;
        if (!r?.path) continue;
        if (index === 0) performance.mark?.('ps-ready-shown');
        const path = r.path;
        setFilePages((fp) =>
          fp && fp.hash === forHash ? { hash: forHash, pages: Object.assign([...fp.pages], { [index]: path }) } : fp,
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [view, plan, opening]);

  // After Android's print screen closes (or the app comes back to the front), show what happened.
  useEffect(() => {
    let onScreen = true;
    // Android may settle the job a moment after its screen closed: keep asking while it says "checking".
    const check = async () => {
      if (!printing.current || checking.current) return;
      checking.current = true;
      try {
        for (;;) {
          const s = await PrintEngine.printStatus();
          // Ready was left meanwhile (Home, a new share): never replace another screen (gate re-review N5).
          if (!onScreen || s.state === 'inDialog') return;
          if (s.state !== 'checking') {
            printing.current = false;
            go({
              type: 'replace',
              screen: {
                name: 'result',
                params: { jobId, state: s.state === 'none' ? 'unknown' : s.state, ...partOf.current },
              },
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch {
        // Status unavailable: the Result screen says it couldn't check.
        if (!onScreen) return;
        printing.current = false;
        go({ type: 'replace', screen: { name: 'result', params: { jobId, state: 'unknown', ...partOf.current } } });
      } finally {
        checking.current = false;
      }
    };
    const closed = PrintEngine.addListener('printClosed', () => void check());
    const resumed = Capacitor.isNativePlatform() ? NativeApp.addListener('resume', () => void check()) : null;
    return () => {
      onScreen = false;
      void closed.then((h) => h.remove());
      void resumed?.then((h) => h.remove());
    };
  }, [jobId]);

  const print = async () => {
    // A ref, not only state: taps that come before the next render must not open the print screen twice (§D2c).
    if (view.state !== 'done' || !settingsReady || opening || openingNow.current) return;
    openingNow.current = true;
    setOpening(true);
    setNote(null);
    const partParams = parts.length > 1 ? { part: partIndex, parts: parts.length } : {};
    // The part counts as printed only once the printer took it (Result); here it is only remembered as started.
    // Without it the part could not count as printed afterwards: then the print screen does not open (re-review N2).
    if (parts.length > 1 && job) {
      const saved = await saveJobChange(job, { type: 'partStarted', planHash: fullHash, part: partIndex }).then(
        (j) => {
          setJob(j);
          return true;
        },
        () => false,
      );
      if (!saved) {
        setOpening(false);
        openingNow.current = false;
        setNote(en.change.saveFailed);
        return;
      }
    }
    const result = await PrintEngine.printFile({
      jobId,
      planHash: hash,
      pages: view.pages,
      contentType: plan?.contentType ?? 'document',
      ...(plan?.paper.id === 'PHOTO_4x6'
        ? {
            photoPaper: {
              wMils: Math.round((plan.paper.wPt * 1000) / 72),
              hMils: Math.round((plan.paper.hPt * 1000) / 72),
            },
          }
        : {}),
      colour: plan?.colour ?? 'colour',
      ...partParams,
      ...(parts.length > 1 ? { partOf: fullHash } : {}),
    }).then(
      (r) => r.result,
      () => 'failed' as const,
    );
    if (result === 'started') {
      partOf.current = parts.length > 1 ? { ...partParams, partOf: fullHash } : {};
      printing.current = true;
      return; // the button stays busy until the result screen replaces this one
    }
    setOpening(false);
    openingNow.current = false;
    if (result === 'busy') setNote(t.busy);
    else if (result === 'failed') setNote(t.printFailed);
    else setAttempt((a) => a + 1); // the file is gone: make it again
  };

  const pdfItems = new Set(job?.items.filter((i) => i.type === 'pdf').map((i) => i.index) ?? []);
  const number = (itemIndex: number) => (job ? job.items.findIndex((i) => i.index === itemIndex) + 1 : 0);
  const srcOf = (itemIndex: number, pdfPage?: number) => {
    if (pdfPage !== undefined) return docs.srcOfPage(itemIndex, pdfPage);
    const th = thumbs?.get(itemIndex);
    return th?.state === 'ok' && th.thumb ? Capacitor.convertFileSrc(th.thumb) : undefined;
  };

  // Photos that can't be placed (damaged, iPhone files) are named, never silently dropped (gate review #11).
  const placed = new Set(fullPlan?.pages.flatMap((p) => p.placements.map((x) => x.itemIndex)) ?? []);
  // Only photos still in the job (an extra copy just removed is not "left out", review I3), and not the files the
  // can't-be-printed notes already name (iPhone photos, review M3).
  const inJob = new Set(job?.items.map((i) => i.index) ?? []);
  const named = new Set(
    job && job.layout !== 'passport'
      ? job.items.filter((i) => unprintableNotes([i]).length > 0).map((i) => i.index)
      : [],
  );
  const leftOut = thumbs
    ? [...thumbs.values()].filter(
        (th) =>
          inJob.has(th.index) &&
          !named.has(th.index) &&
          th.state !== 'notPhoto' &&
          th.state !== 'retry' &&
          !placed.has(th.index),
      ).length
    : 0;
  const retry = [...(thumbs?.values() ?? [])].some((th) => th.state === 'retry');

  // Every preview can be adjusted (owner, 2026-10-23): photos, pages, the passport photo, ID cards. Not the whole
  // e-Aadhaar page, nor many copies (real-size cards by definition: a bigger card would be one set, review 2026-10-24).
  const adjustable =
    !!job && !(job.layout === 'idCard' && (job.idCard?.size === 'page' || job.idCard?.size === 'sets'));
  const adjustLabel = !job
    ? ''
    : job.layout === 'document'
      ? en.adjust.pages
      : job.layout === 'passport'
        ? en.adjust.passport
        : job.layout === 'idCard'
          ? en.adjust.cards
          : en.adjust.photos;
  // A tap on a drawn page opens Adjust with what is under the finger chosen.
  const adjustAt = (i: number, clientX: number, clientY: number, rect: DOMRect) => {
    if (!job || !plan) return;
    const pt = toPagePoints(plan, i, rect, clientX, clientY);
    const hit = pickAt(plan, i, pt.x, pt.y);
    if (!hit) return;
    if (job.layout === 'document') go(push('adjust', { jobId, page: i }));
    else if (job.layout === 'passport') go(push('adjust', { jobId }));
    else if (job.layout === 'idCard') {
      const card = job.idCard?.cards.findIndex((c) => c.item === hit.itemIndex && c.quad.join() === hit.quad?.join());
      go(push('adjust', { jobId, ...(card !== undefined && card >= 0 ? { card } : {}) }));
    } else go(push('adjust', { jobId, item: hit.itemIndex }));
  };
  if (gone) return <JobGone go={go} title={t.title} />;
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {job?.layout === 'document' &&
        [...(docs.items?.values() ?? [])].map((d) =>
          d.state === 'ok' ? null : (
            <Panel
              key={d.index}
              kind={d.state === 'password' ? 'warn' : 'error'}
              title={en.docs[d.state === 'password' ? 'locked' : d.state]}
              action={
                d.state === 'password'
                  ? { label: en.docs.unlock, onClick: () => go(push('unlock', { jobId, item: d.index })) }
                  : d.state === 'retry'
                    ? { label: en.docs.tryAgain, onClick: docs.refresh }
                    : undefined
              }
            >
              {/* No password from the customer (PLAN §J8): leave this file out, the others still print. */}
              {d.state === 'password' && job && (
                <Button
                  variant="secondary"
                  onClick={async () => setJob(await saveJobChange(job, { type: 'removeItem', index: d.index }))}
                >
                  {t.printWithoutFile}
                </Button>
              )}
            </Panel>
          ),
        )}
      {job?.layout === 'document' &&
        [...(docs.items?.values() ?? [])]
          .filter((d) => d.state === 'ok' && d.pages && d.sizes && d.pages > d.sizes.length)
          .map((d) => (
            <Panel
              key={`long-${d.index}`}
              kind="warn"
              title={fill(en.docs.over500, { n: d.pages ?? 0, max: d.sizes?.length ?? 0 })}
            />
          ))}
      {job?.layout === 'document' &&
        docs.tier === 'NONE' &&
        [...(docs.items?.values() ?? [])].some((d) => d.state === 'ok' && d.forms) && (
          <Panel kind="warn" title={en.docs.forms} />
        )}
      {loadFailed && (
        <Panel
          kind="error"
          title={t.loadFailed}
          action={{ label: t.tryAgain, onClick: () => setReload((n) => n + 1) }}
        />
      )}
      {!plan && !loadFailed && <p role="status">{en.received.preparing}</p>}
      {plan && plan.pages.length === 0 && <Panel kind="warn" title={en.received.nothing} />}
      {plan && fullPlan && plan.pages.length > 0 && job && (
        <>
          <p class="summary">
            {job.layout === 'passport'
              ? passportLine(fullPlan, settings.passport.prices)
              : job.layout === 'idCard' && job.idCard
                ? idCardLine(fullPlan, job.idCard.size, job.idCard.scale)
                : job.layout === 'document'
                  ? documentLine(fullPlan, pdfItems)
                  : summaryLine(fullPlan)}
          </p>
          {/* Phase 15: the photos the app turned upright, with Undo (here too: The shopkeeper looks at the print here). */}
          {cardOffer && (
            <Panel
              kind="info"
              title={en.cards.offer}
              action={{ label: en.cards.title, onClick: () => go(push('cards', { jobId })) }}
            />
          )}
          <AutoTurnNote
            job={job}
            busy={opening}
            onUndo={async () => {
              const next = await saveJobChange(job, { type: 'undoAutoTurn' }).catch(() => null);
              if (next) setJob(next);
              return !!next;
            }}
          />
          {/* Document and mixed jobs skip Received: the same photo twice is offered here (PLAN §J8). */}
          {job.layout === 'document' && <Duplicates job={job} onChange={setJob} />}
          {/* ...and what went wrong while receiving, which Received shows for photo jobs (review M5). */}
          {job.layout === 'document' && job.notices.map((n) => <Panel key={n} kind="warn" title={n} />)}
          {/* Files that cannot be printed are named, never silently left out (PLAN §J8). */}
          {job.layout !== 'passport' &&
            unprintableNotes(job.items).map((note) => <Panel key={note} kind="warn" title={note} />)}
          {job.layout !== 'passport' &&
            view.state === 'done' &&
            (() => {
              // PLAN §F6: photos under 100 dpi, photos in a document under 120 dpi may print blurry.
              const blurry = blurryItems(job.layout, view.dpi ?? {})
                .map(number)
                .filter((n) => n > 0);
              if (blurry.length === 0) return null;
              return (
                <Panel
                  kind="warn"
                  title={
                    blurry.length === 1
                      ? fill(en.change.blurryOne, { n: blurry[0] as number })
                      : fill(en.change.blurryMany, { list: blurry.join(', ') })
                  }
                />
              );
            })()}
          {job.layout === 'passport' &&
            view.state === 'done' &&
            job.passport &&
            view.lowRes?.includes(job.passport.item) && <Panel kind="warn" title={en.passport.small} />}
          {job.layout === 'passport' &&
            (fullPlan.paper.id === 'PHOTO_4x6' ? (
              // The owner can turn the photo-paper reminder off in Settings (PLAN §I-15).
              settings.photoPaperReminder && <Panel kind="warn" title={en.passport.loadPaper} />
            ) : (
              // A4: the printer's 4×6 paper is not set up yet, or this size does not fit it (owner, 2026-10-23).
              <Panel kind="info" title={photoPaper ? en.passport.tooBigFor4x6 : en.passport.onA4} />
            ))}
          {job.layout !== 'passport' && fullPlan.paper.id === 'PHOTO_4x6' && settings.photoPaperReminder && (
            <Panel kind="warn" title={en.passport.loadPaper} />
          )}
          {/* 4×6 chosen, but this printer's 4×6 paper is not known: it prints on A4 and says so (gate review I6). */}
          {job.paper === 'PHOTO_4x6' &&
            job.layout !== 'passport' &&
            job.layout !== 'document' &&
            photoPaper === null && <Panel kind="info" title={t.photoPaperMissing} />}
          {/* Photos placed by hand may cover each other (owner, 2026-10-24): said, so it is never a surprise. */}
          {fullPlan && job.spots && overlaps(fullPlan).length > 0 && <Panel kind="warn" title={t.covers} />}
          {changedAfter > 0 && <Panel kind="warn" title={fill(t.partsChanged, { k: changedAfter })} />}
          {parts.length > 1 && (
            <Panel kind="info" title={fill(t.parts, { n: parts.length, max: MAX_SHEETS_PER_PART, k: partIndex + 1 })} />
          )}
          <Button variant="secondary" onClick={() => go(push('change', { jobId }))}>
            {en.ui.change}
          </Button>
          {/* Adjust on every preview (owner, 2026-10-23); a tap on a photo below opens it with that photo chosen. */}
          {adjustable && (
            <Button variant="secondary" icon="crop" onClick={() => go(push('adjust', { jobId }))}>
              {adjustLabel}
            </Button>
          )}
          {/* Sizes chosen on Adjust are deliberate: never offered to be thrown away here (review, 2026-10-24). */}
          {(job.layout === 'allOnOne' || (job.layout === 'morePages' && job.pages !== 'best')) &&
            !job.sizes &&
            !keepSmall &&
            !keptSmall.has(`${jobId}:${job.layout}:${job.pages}`) &&
            smallestSideMm(fullPlan.pages) < WARN_MM && (
              <Panel
                kind="warn"
                title={fill(en.change.small, { cm: (smallestSideMm(fullPlan.pages) / 10).toFixed(1) })}
              >
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const j = await saveJobChange(job, { type: 'setLayout', layout: 'morePages' });
                      setJob(await saveJobChange(j, { type: 'setPages', pages: 'best' }));
                    } catch {
                      setNote(en.change.saveFailed);
                    }
                  }}
                >
                  {en.change.useMore}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Remembered for this job and this arrangement only (re-review #5).
                    keptSmall.add(`${jobId}:${job.layout}:${job.pages}`);
                    setKeepSmall(true);
                  }}
                >
                  {job.layout === 'allOnOne' ? en.change.keepOne : en.change.keepAsIs}
                </Button>
              </Panel>
            )}
          {view.state === 'damaged' &&
            (job.layout === 'passport' ? (
              // The passport photo itself cannot print: choose another one, never full pages of the others (N2).
              <Panel
                kind="warn"
                title={en.passport.damaged}
                action={{
                  label: en.passport.chooseAnother,
                  // Several photos: Which photo?; one photo: back to Received below (never a second one, re-review nit).
                  onClick: () =>
                    job.items.length > 1
                      ? go({ type: 'replace', screen: { name: 'whichphoto', params: { jobId } } })
                      : go({ type: 'backTo', name: 'received' }),
                }}
              />
            ) : (
              <Panel
                kind="warn"
                title={
                  job.items.find((i) => i.index === view.itemIndex)?.type === 'pdf'
                    ? job.items.filter((i) => i.type === 'pdf').length > 1 || job.items.length > 1
                      ? fill(en.docs.fileDamaged, { n: number(view.itemIndex) })
                      : en.docs.damaged
                    : fill(t.damaged, { n: number(view.itemIndex) })
                }
                action={{
                  label: t.printWithout,
                  onClick: async () => setJob(await saveJobChange(job, { type: 'removeItem', index: view.itemIndex })),
                }}
              />
            ))}
          {view.state === 'noSpace' && (
            <Panel
              kind="error"
              title={t.noSpace}
              action={{ label: t.tryAgain, onClick: () => setAttempt((a) => a + 1) }}
            >
              <Button
                variant="secondary"
                onClick={() => go({ type: 'push', screen: { name: 'deleteall', params: { keepOpen: true } } })}
              >
                {en.deleteAll.makeRoom}
              </Button>
            </Panel>
          )}
          {(view.state === 'failed' || view.state === 'cancelled') && (
            <Panel
              kind="error"
              title={t.failed}
              action={{ label: t.tryAgain, onClick: () => setAttempt((a) => a + 1) }}
            />
          )}
          {note && <Panel kind="info" title={note} />}
          {retry && (
            <Panel
              kind="warn"
              title={en.received.retryAll}
              action={{ label: t.tryAgain, onClick: () => setReload((n) => n + 1) }}
            />
          )}
          {leftOut > 0 && (
            <Panel kind="warn" title={leftOut === 1 ? t.leftOutOne : fill(t.leftOutMany, { n: leftOut })} />
          )}
          {plan.pages.length > 1 && (
            // Big buttons step through the pages (PLAN §I-5, §H2.4: never swipe-only paging).
            // Sticky: paging never scrolls the buttons away (gate review I8); a plan with fewer pages starts at its
            // last page (review M9).
            <div ref={pagerRef} class={pagerPinned ? 'pager pager-pinned' : 'pager'}>
              <Button
                variant="secondary"
                icon="back"
                disabled={Math.min(at, plan.pages.length - 1) === 0}
                onClick={() => showPage(Math.min(at, plan.pages.length - 1) - 1)}
                label={t.prevPage}
              >
                {t.prevShort}
              </Button>
              <p role="status" class="pager-status">
                {fill(t.pageLabel, { n: Math.min(at, plan.pages.length - 1) + 1, total: plan.pages.length })}
              </p>
              <Button
                variant="secondary"
                icon="next"
                disabled={at >= plan.pages.length - 1}
                onClick={() => showPage(Math.min(at, plan.pages.length - 1) + 1)}
                label={t.nextPage}
              >
                {t.nextShort}
              </Button>
            </div>
          )}
          <ol class="sheets" ref={sheetsRef}>
            {plan.pages.map((p, i) => {
              const wide = p.orientation === 'landscape';
              const label = fill(t.pageLabel, { n: i + 1, total: plan.pages.length });
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: an extra; Adjust photos above is the way for keys and screen readers
                <li
                  key={`${i}-${p.placements[0]?.itemIndex}`}
                  onClick={(e) => {
                    const fig = (e.currentTarget as HTMLElement).querySelector('figure');
                    if (adjustable && fig) adjustAt(i, e.clientX, e.clientY, fig.getBoundingClientRect());
                  }}
                >
                  <span class="sheet-label" aria-hidden="true">
                    {label}
                    {wide && <span class="sheet-badge">{t.sideways}</span>}
                  </span>
                  {filePages?.hash === hash && filePages.pages[i] ? (
                    <FilePage
                      src={Capacitor.convertFileSrc(filePages.pages[i] as string)}
                      paper={plan.paper}
                      wide={wide}
                      label={wide ? `${label}, ${t.sideways}` : label}
                    />
                  ) : (
                    <PaperPreview
                      wPt={wide ? plan.paper.hPt : plan.paper.wPt}
                      hPt={wide ? plan.paper.wPt : plan.paper.hPt}
                      placements={p.placements}
                      srcOf={srcOf}
                      label={wide ? `${label}, ${t.sideways}` : label}
                      grey={plan.colour === 'bw'}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {/* Owner, round 3: every print starts in colour; one tap here prints this job in black & white (and back). */}
          <ColourSwitch
            value={job.colour}
            disabled={opening}
            onChange={async (colour) => {
              const next = await saveJobChange(job, { type: 'setColour', colour }).catch(() => null);
              // Not saved: it says so (review M1); the switch stays on what will print.
              if (next) setJob(next);
              else setNote(en.change.saveFailed);
            }}
          />
          <ActionBar>
            {view.state === 'preparing' && (
              <>
                <p role="status">
                  {t.preparing} {view.total > 0 && fill(t.progress, { done: view.done, total: view.total })}
                </p>
                <progress class="progress" max={view.total || 1} value={view.done} aria-label={t.preparing} />
                {/* Stops making the file and goes back (leaving Ready cancels the render, PLAN §H2.7). */}
                <Button variant="secondary" onClick={() => go({ type: 'back' })}>
                  {en.received.cancel}
                </Button>
              </>
            )}
            {view.state === 'done' && <p class="muted">{t.hint}</p>}
            <Button
              variant="print"
              icon="print"
              onClick={() => void print()}
              disabled={view.state !== 'done' || !settingsReady}
              busy={opening}
              busyLabel={t.opening}
            >
              {parts.length > 1
                ? fill(t.printPart, { k: partIndex + 1, n: parts.length })
                : fullPlan.paper.id === 'PHOTO_4x6' && settings.photoPaperReminder
                  ? en.passport.paperLoaded
                  : t.print}
            </Button>
          </ActionBar>
        </>
      )}
    </main>
  );
}
