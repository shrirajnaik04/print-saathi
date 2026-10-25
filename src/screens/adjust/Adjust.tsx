import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type DocPage, type Job, type JobAction, jobReducer, nextItemIndex } from '../../core/job/job';
import { isFull, uprightOf } from '../../core/layout/crop';
import { freezeSizes, MIN_LONG_MM } from '../../core/layout/flow';
import { overlaps, type Side, sideCrop, sideCropQuad, spotsFromPlan, storedPage } from '../../core/layout/free';
import type { Box } from '../../core/layout/onePerPage';
import { passportSize } from '../../core/layout/passport';
import { angleOf, ownBox, shownDegrees, snap } from '../../core/layout/tilt';
import { allDocPages, drawnCardScale, type Placement, type PrintPlan } from '../../core/plan/plan';
import { CUSTOM_MAX_MM, CUSTOM_MIN_MM } from '../../core/settings/settings';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Panel } from '../../ui/Panel';
import { PaperPreview } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { useMatches, WIDE_SIDEWAYS } from '../../ui/useMatches';
import { JobGone } from '../JobGone';
import { borderName, cmOf } from '../passport/names';
import { forgetRemoved, rememberRemoved, removedFor } from '../photos/undo';
import { push, type ScreenProps } from '../types';
import { takeAddedChoice, useAddNotice } from '../useAddNotice';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';
import { useStraightImages } from '../useStraightImages';
import { type Clip, clipFor, keepClip } from './clipboard';
import {
  dropStep,
  editsOf,
  forgetSteps,
  leaveFor,
  recordStep,
  returned,
  settle,
  stepsFor,
  takeRedo,
  takeUndo,
} from './history';
import { layerState, stackedSpots } from './layers';
import { cmText, findItem, itemsInPlan, longMm, ownLongMm, pageSize } from './place';
import { usePlaceByHand } from './usePlaceByHand';
import { nextZoom, ZOOM_MAX, ZOOM_MIN } from './zoom';

const t = en.adjust;
const MM = 72 / 25.4;
/** Bigger / Smaller for photos: one tap changes the size by this factor. */
const STEP = 1.1;

/** What this job's Adjust works on (owner, 2026-10-23: "adjustments must be there for all previews"). */
export type AdjustKind = 'photos' | 'pages' | 'passport' | 'cards';
export const adjustKind = (job: Pick<Job, 'layout'>): AdjustKind =>
  job.layout === 'document'
    ? 'pages'
    : job.layout === 'passport'
      ? 'passport'
      : job.layout === 'idCard'
        ? 'cards'
        : 'photos';

/** One thing to adjust: a photo, a page, a card, or the passport photo; where it is drawn. */
type Target = { key: number; page: number; placement: Placement };

const sameQuad = (a?: number[], b?: number[]) => !!a && !!b && a.join(',') === b.join(',');

/**
 * Adjust (owner, 2026-10-23: "photo adjustments must be there for all previews, so the shopkeeper can adjust as the
 * customer asks"): the page of the chosen photo, page or card, drawn from the plan, outlined; for photos a round corner
 * to drag. Photos: Smaller / Bigger, Turn, Crop, Move earlier / later, Remove (with Undo), Previous / Next, Automatic
 * sizes; the others keep their sizes and flow on (Square wrap), what no longer fits starts a new page. Pages: their
 * size on the sheet (50–100 %), Turn, Crop (photo pages), Move, Remove. Passport photos: the size 1 mm at a time, the
 * face, Turn, Size, Border, How many. ID cards: both 70–200 %, Turn, Fix corners, Swap. Every change is saved at once.
 */
export function Adjust({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change: save, busy, saveFailed } = useJob(jobId);
  // Every change made on Adjust is one step that Undo can take back (owner, round 6), kept while nothing else changes
  // the job (history.ts).
  const jobNow = useRef(job);
  jobNow.current = job;
  const [, stepped] = useState(0);
  const change = async (action: JobAction): Promise<Job | null> => {
    const from = jobNow.current;
    const next = await save(action);
    if (next && from && next.rev > from.rev) {
      // One revision on: this change. More: another change reached the phone in between, and the steps no longer join up.
      if (next.rev === from.rev + 1) recordStep(jobId, editsOf(from), from.rev, next.rev);
      else forgetSteps(jobId);
      stepped((n) => n + 1);
    }
    return next;
  };
  // Back from Adjust's other screens (Crop, Fix edges, Add photos, the passport tools): what they did is one step.
  const comeBack = useRef(false);
  useEffect(() => {
    if (!job || comeBack.current) return;
    comeBack.current = true;
    if (returned(job)) stepped((n) => n + 1);
  }, [job]);
  const goOut: typeof go = (to) => {
    if (job) leaveFor(job);
    go(to);
  };
  const docs = useDocs(jobId, job?.layout === 'document' ? job : null);
  const paper = usePlanPaper();
  const kind: AdjustKind = job ? adjustKind(job) : 'photos';
  const first = params?.item ?? params?.page ?? params?.card;
  // A photo just added from the phone is chosen; else the one Adjust was opened for.
  const [chosen, setChosen] = useState<number | null>(
    () => takeAddedChoice(jobId) ?? (first === undefined ? null : Number(first)),
  );
  // What the round corner being dragged would change (saved when the finger lifts): the same change Smaller / Bigger
  // make for this kind, so the screen shows exactly what will print.
  const [draft, setDraftState] = useState<JobAction | null>(null);
  // The same draft for the end of a drag that the handle did not see (its finger lifted elsewhere).
  const draftNow = useRef<JobAction | null>(null);
  const setDraft = (d: JobAction | null) => {
    draftNow.current = d;
    setDraftState(d);
  };
  const [undo, setUndo] = useState(() => removedFor(jobId));
  const [pagesBefore, setPagesBefore] = useState<DocPage[] | null>(null);
  const drag = useRef<{
    id: number;
    el: HTMLElement;
    x: number;
    y: number;
    scaled: (s: number) => JobAction;
    w: number;
    h: number;
    perPt: number;
    /** The photo's tilt (radians clockwise): its sides on screen. */
    tilt: number;
  } | null>(null);
  // The strip of pages (owner, round 4: every page side by side); a page's paper is its sheet's <figure>.
  const figure = useRef<HTMLDivElement>(null);
  const paperOf = (n: number) =>
    figure.current?.querySelector<HTMLElement>(`.adjust-sheet[data-page="${n}"] figure`) ?? null;
  // The page in the middle of the strip (the one "Page n of N" names), and moving the strip to a page.
  const [shown, setShown] = useState(0);
  // Only ‹ › move the pages (owner, round 5: "disable finger swipe between pages … as fast as possible"): at once, no
  // slide; a finger or the wheel never slides the strip (it does not scroll by hand at 100 %).
  const showPage = (n: number) => {
    const strip = figure.current;
    const sheet = strip?.querySelector<HTMLElement>(`.adjust-sheet[data-page="${n}"]`);
    if (!strip || !sheet) return;
    setShown(n);
    // Zoomed, only that page shows (and where the strip already is).
    if (zoomNow.current > 1) return;
    strip.scrollLeft = sheet.offsetLeft + sheet.offsetWidth / 2 - strip.clientWidth / 2;
  };
  // A side of the chosen photo being dragged to crop it (Word's crop, owner 2026-10-24), and what it would make.
  const sideDrag = useRef<{
    id: number;
    side: Side;
    x: number;
    y: number;
    pxPerPt: number;
    placement: Placement;
  } | null>(null);
  // The round handle above the chosen photo being turned (owner, round 3: WPS): where its centre is on screen, the
  // finger's last angle around it, how far it has turned, and the photo's angle when the press began.
  const turnDrag = useRef<{ id: number; cx: number; cy: number; last: number; turned: number; from: number } | null>(
    null,
  );
  // The photo being turned: drawn at [angle] about its own centre while the finger moves, nothing laid out again until it
  // lifts (it stays under the finger and keeps its size, review I2); still drawn so until the turn is saved ([lifted]),
  // so it never shows its old angle on the way (review M4).
  const [turning, setTurningState] = useState<{ item: number; angle: number; lifted?: boolean } | null>(null);
  const turningNow = useRef<typeof turning>(null);
  const setTurning = (t: typeof turning) => {
    turningNow.current = t;
    setTurningState(t);
  };
  const [cut, setCutState] = useState<{ item: number; box: Box; crop: Placement['crop']; quad?: number[] } | null>(
    null,
  );
  const cutNow = useRef<typeof cut>(null);
  const setCut = (c: typeof cut) => {
    cutNow.current = c;
    setCutState(c);
  };
  const plan = useMemo(
    () =>
      job && paper.ready(job) && (kind !== 'passport' || paper.photoPaper !== undefined)
        ? paper.draw(draft ? jobReducer(job, draft, job.updatedAt) : job, aspects, docs.facts)
        : null,
    [job, aspects, paper.key, docs.facts, draft],
  );
  const targets: Target[] = useMemo(() => {
    if (!plan || !job) return [];
    if (kind === 'pages')
      return plan.pages.flatMap((p, page) =>
        p.placements[0] ? [{ key: page, page, placement: p.placements[0] }] : [],
      );
    if (kind === 'passport')
      return plan.pages[0]?.placements[0] ? [{ key: 0, page: 0, placement: plan.pages[0].placements[0] }] : [];
    if (kind === 'cards') {
      const cards = job.idCard?.cards ?? [];
      return cards.flatMap((c, key) => {
        for (const [page, p] of plan.pages.entries()) {
          const placement = p.placements.find((x) => x.itemIndex === c.item && sameQuad(x.quad, c.quad));
          if (placement) return [{ key, page, placement }];
        }
        const any = plan.pages[0]?.placements[0];
        return key === 0 && any ? [{ key, page: 0, placement: any }] : [];
      });
    }
    // In print order (placed by hand the page draws them by layer; Photo n of N and Previous / Next keep this order).
    const order = job.order;
    const inPrintOrder = itemsInPlan(plan).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return inPrintOrder.flatMap((item) => {
      const w = findItem(plan, item);
      return w ? [{ key: item, page: w.page, placement: w.placement }] : [];
    });
  }, [plan, job, kind]);
  // Straightened parts (ID cards; photos straightened in the crop screen, owner 2026-10-24): the engine's pictures.
  const straightParts = useMemo(
    () =>
      plan?.pages.flatMap((pg) =>
        pg.placements.flatMap((p) =>
          p.quad ? [{ item: p.itemIndex, ...(p.pdfPage !== undefined ? { page: p.pdfPage } : {}), quad: p.quad }] : [],
        ),
      ),
    [plan],
  );
  const straight = useStraightImages(jobId, straightParts, 480);
  const keys = targets.map((x) => x.key);
  const sel = chosen !== null && keys.includes(chosen) ? chosen : (keys[0] ?? null);
  const at = sel === null ? -1 : keys.indexOf(sel);
  const where = at >= 0 ? targets[at] : undefined;
  // Photos added from the phone (Add photos, owner 2026-10-24): the first of them is chosen.
  const added = useAddNotice(jobId);
  useEffect(() => {
    const changed = (e: Event) => {
      const d = (e as CustomEvent<{ jobId: string; added?: number[] }>).detail;
      if (d?.jobId === jobId && kind === 'photos' && d.added?.length) setChosen(d.added[0] ?? null);
    };
    window.addEventListener('ps-job-changed', changed);
    return () => window.removeEventListener('ps-job-changed', changed);
  }, [jobId, kind]);
  // The drawn page's width on screen (px), measured once it is drawn and again when it changes (rotation, text size):
  // side handles show only where a photo is big enough on screen (review I5).
  const [paperPx, setPaperPx] = useState(0);
  useLayoutEffect(() => {
    const el = paperOf(where?.page ?? 0);
    if (!el) return;
    const measure = () => setPaperPx(el.getBoundingClientRect().width);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [!!plan, where?.page, kind]);
  // Press and hold to place a photo anywhere on its page (owner, 2026-10-24); the Move buttons do the same.
  // ID cards placed by hand (owner, round 5): in the sizes that are one pair on the page.
  const cardsByHand = kind === 'cards' && !!job?.idCard && ['real', 'big', 'custom'].includes(job.idCard.size);
  const byHand = usePlaceByHand({
    enabled: kind === 'photos' || cardsByHand,
    plan,
    job,
    figure,
    edgeMm: kind === 'cards' ? paper.cardEdgeMm() : job ? paper.photoEdgeMm(job) : 6,
    onChoose: (item) => setChosen(item),
    save: (actions) => change({ type: 'all', actions }),
    // ID cards (owner, round 5): each card by its place in the job's cards; it snaps to the other card.
    ...(kind === 'cards'
      ? {
          boxOf: (key: number) => targets.find((x) => x.key === key)?.placement.box,
          othersOf: (key: number) => targets.filter((x) => x.key !== key).map((x) => x.placement.box),
          place: (key: number, _page: number, box: Box) => [
            { type: 'placeIdCard' as const, at: key, x: (box.x + box.w / 2) / MM, y: (box.y + box.h / 2) / MM },
          ],
        }
      : {}),
  });
  const covering = useMemo(() => (kind === 'photos' && plan ? overlaps(plan) : []), [plan, kind]);
  // The chosen photo's page comes to the middle of the strip when the choice moves to another page.
  const placedOn = where?.page ?? 0;
  useLayoutEffect(() => {
    if (plan) showPage(placedOn);
  }, [placedOn, !!plan, plan?.pages.length]);
  // The screen changes size (turned, review M1): the page shown stays in the middle (the strip never snaps by itself).
  const shownNow = useRef(0);
  shownNow.current = shown;
  useLayoutEffect(() => {
    const strip = figure.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => showPage(shownNow.current));
    ro.observe(strip);
    return () => ro.disconnect();
    // The strip is drawn a moment after the plan: set up again once it is there.
  }, [!!plan, !!figure.current]);
  // ‹ › to a page without the chosen photo choose the first photo on it: the tools never change a photo out of sight.
  // Copies (passport photos, ID card sets) are changed all at once, so they keep their choice.
  const chooseOn = (n: number) => {
    const first = targets.find((x) => x.page === n)?.key;
    if (first !== undefined && where?.page !== n && !byHand.lifted && !drag.current) setChosen(first);
  };
  // Pages drawn with their pictures: the one in the middle, its neighbours and the chosen one's (a long job never holds
  // every page's pictures at once, PLAN §P). A document's pages ask the engine for theirs (one at a time, never twice).
  const drawnPage = (n: number) => Math.abs(n - shown) <= 1 || n === where?.page;
  useEffect(() => {
    if (!plan || job?.layout !== 'document') return;
    docs.want(
      plan.pages.flatMap((p, n) =>
        drawnPage(n)
          ? p.placements.flatMap((x) => (x.pdfPage !== undefined ? [{ item: x.itemIndex, page: x.pdfPage }] : []))
          : [],
      ),
    );
  }, [plan, shown, where?.page]);
  // Zoom (owner, round 4): the page in the middle drawn bigger (100 % to 400 %) to work on a small photo precisely; the
  // strip keeps its height and the page slides inside it both ways. Every drag reads the page's size on screen as it
  // starts, so it works in page points at any zoom (Review Focus 4). 100 % when Adjust opens and when the screen
  // changes size (the sizes measured at 100 % no longer hold).
  const [zoom, setZoom] = useState(1);
  const zoomNow = useRef(1);
  const zoomWas = useRef(1);
  const zoomBase = useRef<{ widths: number[]; height: number } | null>(null);
  const zoomAnchor = useRef<{ u: number; v: number; x: number; y: number } | null>(null);
  /** Zoom to [z], keeping the point [at] (the fingers; else the middle of the page in view) where it is. */
  const zoomTo = (z: number, at?: { x: number; y: number }) => {
    const strip = figure.current;
    const paperEl = paperOf(shown);
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
    if (!strip || !paperEl || next === zoomNow.current) return;
    if (zoomNow.current === 1)
      zoomBase.current = {
        widths: Array.from(
          strip.querySelectorAll<HTMLElement>('.adjust-sheet figure'),
          (f) => f.getBoundingClientRect().width,
        ),
        height: strip.getBoundingClientRect().height,
      };
    const r = paperEl.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const cs = getComputedStyle(strip);
    const top = s.top + Number.parseFloat(cs.paddingTop);
    const bottom = s.bottom - Number.parseFloat(cs.paddingBottom);
    const x = at?.x ?? (Math.max(r.left, s.left) + Math.min(r.right, s.right)) / 2;
    const y = at?.y ?? (Math.max(r.top, top) + Math.min(r.bottom, bottom)) / 2;
    zoomAnchor.current = { u: (x - r.left) / r.width, v: (y - r.top) / r.height, x, y };
    zoomNow.current = next;
    setZoom(next);
  };
  const zoomToNow = useRef(zoomTo);
  zoomToNow.current = zoomTo;
  useLayoutEffect(() => {
    const strip = figure.current;
    const a = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!strip || zoom === zoomWas.current) return;
    zoomWas.current = zoom;
    if (zoom === 1) {
      zoomBase.current = null;
      strip.scrollTop = 0;
      showPage(shown);
      return;
    }
    const r = paperOf(shown)?.getBoundingClientRect();
    if (!r || !a) return;
    strip.scrollLeft += r.left + a.u * r.width - a.x;
    strip.scrollTop += r.top + a.v * r.height - a.y;
  }, [zoom]);
  useEffect(() => {
    const reset = () => {
      if (zoomNow.current === 1) return;
      zoomNow.current = 1;
      setZoom(1);
    };
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  // Two fingers on the page zoom it about the point between them; they never place a photo.
  const byHandNow = useRef(byHand);
  byHandNow.current = byHand;
  useEffect(() => {
    const el = figure.current;
    if (!el) return;
    let start: { d: number; z: number } | null = null;
    const two = (t: TouchList) => {
      const a = t[0];
      const b = t[1];
      return a && b
        ? {
            d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            x: (a.clientX + b.clientX) / 2,
            y: (a.clientY + b.clientY) / 2,
          }
        : null;
    };
    const down = (e: TouchEvent) => {
      const f = e.touches.length === 2 ? two(e.touches) : null;
      if (!f || byHandNow.current.lifted) return;
      byHandNow.current.cancel();
      start = { d: f.d || 1, z: zoomNow.current };
    };
    const move = (e: TouchEvent) => {
      const f = start && e.touches.length === 2 ? two(e.touches) : null;
      if (!start || !f) return;
      if (e.cancelable) e.preventDefault();
      zoomToNow.current((start.z * f.d) / start.d, { x: f.x, y: f.y });
    };
    const up = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
    };
  }, [figure.current]);
  // A wide screen held sideways (tablets, a phone in landscape): the tools sit beside the page (the CSS breakpoint).
  const wide = useMatches(WIDE_SIDEWAYS);
  // The one shown first stays the chosen one: moving it never swaps the screen to another.
  useEffect(() => {
    if (chosen === null && sel !== null) setChosen(sel);
  }, [chosen, sel]);
  // Photos: what one more Bigger would do (nothing when the photo is already as big as fits).
  const canGrow = useMemo(() => {
    if (kind !== 'photos' || !job || !plan || !where || sel === null) return false;
    const now = ownLongMm(where.placement);
    const sizes = { ...(job.sizes ?? freezeSizes(plan)), [sel]: now * STEP };
    const bigger = findItem(paper.draw({ ...job, sizes }, aspects, docs.facts), sel);
    return !!bigger && ownLongMm(bigger.placement) > now + 0.05;
  }, [kind, job, plan, sel, paper.key]);
  // A finger that lifts anywhere ends the corner drag (its handle may have been redrawn on another page). The round
  // handle that turns a photo is followed here, wherever the finger goes: it moves onto the photo's turned frame as
  // soon as the photo tilts, a new element that never sees the rest of the drag.
  const finishNow = useRef<() => void>(() => {});
  const turnNow = useRef({ move: (_e: PointerEvent) => {}, end: (_e: PointerEvent) => {} });
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) finishNow.current();
      turnNow.current.end(e);
    };
    const move = (e: PointerEvent) => turnNow.current.move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  if (gone) return <JobGone go={go} title={t.title} />;

  // ---- what each kind does ----------------------------------------------------------------------------------------
  const docPage = (p: Placement): DocPage => ({ item: p.itemIndex, page: p.pdfPage ?? 0 });
  const shownPages = job && plan ? (job.docPages ?? allDocPages(job, aspects, docs.facts)) : [];
  const docAt = (p: DocPage) => shownPages.findIndex((q) => q.item === p.item && q.page === p.page);
  const pageScale =
    where && job ? (job.docScale?.[`${where.placement.itemIndex}:${where.placement.pdfPage ?? 0}`] ?? 1) : 1;
  const passport = job?.passport;
  const pSize = passport ? passportSize(passport) : undefined;
  // The cards' size as they print (a standing card's long side is its height; a chosen size held down to what fits is
  // what prints, review I2). Bigger cannot grow cards already as big as fits: Big size, or a chosen size held down.
  const cardScale = plan && (job?.idCard?.size === 'custom' || job?.idCard?.size === 'big') ? drawnCardScale(plan) : 1;
  const cardsAtMost =
    job?.idCard?.size === 'big' || (job?.idCard?.size === 'custom' && (job.idCard.scale ?? 1) > cardScale + 0.005);
  const passportBy = (mm: number) => {
    if (!passport || !pSize) return;
    const w = pSize.wMm + mm;
    void change({ type: 'setPassportSize', preset: 'custom', sizeMm: { w, h: (w * pSize.hMm) / pSize.wMm } });
  };
  const passportCan = (mm: number) => {
    if (!pSize) return false;
    const w = pSize.wMm + mm;
    const h = (w * pSize.hMm) / pSize.wMm;
    return [w, h].every((v) => v >= CUSTOM_MIN_MM && v <= CUSTOM_MAX_MM);
  };
  // Placed by hand: a change to a photo also puts it on top (the one changed last is drawn last).
  const spotOf = sel !== null ? job?.spots?.[sel] : undefined;
  const onTop = (action: JobAction) =>
    spotOf && sel !== null
      ? change({
          type: 'all',
          actions: [action, { type: 'placeItem', item: sel, page: spotOf.page, x: spotOf.x, y: spotOf.y }],
        })
      : change(action);
  const free = kind === 'photos' && !!job?.spots && Object.keys(job.spots).length > 0;
  // The pages placed by hand, in order (stored page numbers): To previous / To next page move between them. A removed
  // photo's place (kept for its Undo) is not a page (review, 2026-10-24).
  const placedPages = [
    ...new Set(
      Object.entries(job?.spots ?? {})
        .filter(([k]) => job?.items.some((i) => i.index === Number(k)))
        .map(([, s]) => s.page),
    ),
  ].sort((a, b) => a - b);
  const toPage = (by: -1 | 1) => {
    if (!spotOf || sel === null) return;
    const k = placedPages.indexOf(spotOf.page);
    const target = placedPages[k + by] ?? (by === 1 ? Math.max(...placedPages) + 1 : undefined);
    if (target === undefined) return;
    void change({ type: 'placeItem', item: sel, page: target, x: spotOf.x, y: spotOf.y });
  };
  const resizePhoto = (factor: number) => {
    if (!job || !plan || !where || sel === null) return;
    const sizes = { ...(job.sizes ?? freezeSizes(plan)), [sel]: ownLongMm(where.placement) * factor };
    void onTop({ type: 'setSizes', sizes });
  };
  // Turned to any angle (owner, round 3): its quarter turns and tilt as one angle; Tilt left / right add 1° a tap.
  const angleNow = (item: number) => (job ? angleOf(job.turns[item] ?? 0, job.tilts?.[item] ?? 0) : 0);
  // A turned photo keeps its own size, as in Word: automatic sizes are kept as they are now (as the first resize does),
  // so the others flow around its turned outline instead of it shrinking into its old place (review I2).
  const rotateTo = (item: number, angle: number) => {
    if (!job || !plan) return Promise.resolve(false);
    const turn: JobAction = { type: 'rotateItem', index: item, angle };
    return onTop(job.sizes ? turn : { type: 'all', actions: [{ type: 'setSizes', sizes: freezeSizes(plan) }, turn] });
  };
  const tiltBy = (deg: number) => {
    if (sel !== null) void rotateTo(sel, angleNow(sel) + deg);
  };
  // Undo / Redo (owner, round 6): the job's adjustable choices of the step before (or after), saved as one change.
  const stepBy = async (dir: 'undo' | 'redo') => {
    const cur = jobNow.current;
    // Not while a finger holds, resizes, crops or turns a photo: its drop would undo the Undo (review M1).
    if (!cur || busy || drag.current || sideDrag.current || turnDrag.current || byHand.lifted) return;
    const to = (dir === 'undo' ? takeUndo : takeRedo)(jobId, cur.rev, editsOf(cur));
    if (!to) return;
    const next = await save({ type: 'restoreEdits', edits: to, fromRev: cur.rev });
    if (!next || next.rev !== cur.rev + 1) {
      // Failed, or the job had moved on (a change from elsewhere): nothing was undone, and the steps are of no use now.
      if (next) forgetSteps(jobId);
      else dropStep(jobId, dir, to);
      stepped((n) => n + 1);
      if (next) retry();
      return;
    }
    settle(jobId, next.rev);
    // Round 5's own Undo panels and a cut photo's Paste follow what the job holds now.
    forgetRemoved();
    setUndo(null);
    setPagesBefore(null);
    const c = clipFor(jobId);
    if (c?.kind === 'cut' && next.items.some((i) => i.index === c.item.index)) {
      remember(null);
      setClipNote(null);
    }
    stepped((n) => n + 1);
    retry(); // the pictures were listed before this change: list them again
  };
  const stepKeys = useRef({ undo: () => {}, redo: () => {} });
  stepKeys.current = { undo: () => void stepBy('undo'), redo: () => void stepBy('redo') };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // Not behind a question ("Leave this job?"); the key's place counts too, for keyboards of other alphabets.
      if (document.querySelector('dialog[open]')) return;
      const z = e.key.toLowerCase() === 'z' || e.code === 'KeyZ';
      const y = e.key.toLowerCase() === 'y' || e.code === 'KeyY';
      if (z && !e.shiftKey) {
        e.preventDefault();
        stepKeys.current.undo();
      } else if (y || (z && e.shiftKey)) {
        e.preventDefault();
        stepKeys.current.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const steps = job ? stepsFor(jobId, job.rev) : { canUndo: false, canRedo: false };
  // Bring to front / Send to back (owner, round 6): for photos and for cards placed by hand; only where the chosen one
  // covers another, in the direction that changes something.
  const layers = (() => {
    if (!plan || !where || (kind !== 'photos' && !cardsByHand)) return { front: false, back: false };
    const list = plan.pages[where.page]?.placements ?? [];
    const me = kind === 'photos' ? list.findIndex((p) => p.itemIndex === sel) : list.indexOf(where.placement);
    return layerState(
      list.map((p) => p.box),
      me,
    );
  })();
  const stackPhoto = (to: 'front' | 'back') => {
    if (!job || !plan || sel === null) return;
    const fixed = spotsFromPlan(plan, job.spots);
    const spots = stackedSpots(fixed, sel, to);
    if (spots) void change({ type: 'setSpots', spots, sizes: { ...freezeSizes(plan), ...(job.sizes ?? {}) } });
  };
  // Cards: placing a card puts it on top, so the layer is made by placing them in the order they should be drawn.
  const stackCard = (to: 'front' | 'back') => {
    if (!plan || !where || sel === null) return;
    const centre = (t: Target) => ({
      x: (t.placement.box.x + t.placement.box.w / 2) / MM,
      y: (t.placement.box.y + t.placement.box.h / 2) / MM,
    });
    const others = targets.filter((x) => x.key !== sel && x.page === where.page);
    const place = (t: Target) => ({ type: 'placeIdCard' as const, at: t.key, ...centre(t) });
    void change({
      type: 'all',
      actions: to === 'front' ? [...others.map(place), place(where)] : [place(where), ...others.map(place)],
    });
  };
  const removePhoto = async (): Promise<boolean> => {
    if (!job || sel === null) return false;
    const item = job.items.find((i) => i.index === sel);
    if (!item) return false;
    const place = job.order.indexOf(sel);
    const pages = job.pages;
    const size = job.sizes?.[sel];
    const spot = job.spots?.[sel];
    if (!(await change({ type: 'removeItem', index: sel }))) return false;
    rememberRemoved(jobId, item, place, pages, size, spot);
    setUndo(removedFor(jobId));
    setChosen(keys[at + 1] ?? keys[at - 1] ?? null);
    return true;
  };
  // Copy, Cut and Paste (owner, round 5: "copy paste, cut paste"), within this job: Copy remembers the chosen photo as
  // it is now; Cut also takes it off (its Undo stays); Paste puts it on the page shown, at the + mark or the page's
  // middle, placed by hand and chosen. A copy is the same file printed again; a cut photo comes back once.
  const [clip, setClip] = useState<Clip | null>(() => clipFor(jobId));
  const [clipNote, setClipNote] = useState<string | null>(null);
  const remember = (c: Clip | null) => {
    keepClip(c);
    setClip(c);
  };
  const outline = () => {
    if (!where) return { w: 0, h: 0 };
    const b = withTurn(where.placement).box;
    return { w: b.w, h: b.h };
  };
  const copyPhoto = () => {
    if (!job || sel === null || !where) return;
    const item = job.items.find((i) => i.index === sel);
    if (!item) return;
    remember({
      jobId,
      kind: 'copy',
      copy: {
        item,
        ...(job.turns[sel] ? { turn: job.turns[sel] } : {}),
        ...(job.tilts?.[sel] !== undefined ? { tilt: job.tilts[sel] } : {}),
        ...(job.crops?.[sel] ? { crop: job.crops[sel] } : {}),
        ...(job.quads?.[sel] ? { quad: job.quads[sel] } : {}),
        size: job.sizes?.[sel] ?? ownLongMm(where.placement),
      },
      ...outline(),
    });
    setClipNote(fill(t.copied, { n: numberOf(sel) }));
  };
  const cutPhoto = async () => {
    if (!job || sel === null || !where) return;
    const item = job.items.find((i) => i.index === sel);
    if (!item) return;
    const cut: Clip = {
      jobId,
      kind: 'cut',
      item,
      at: job.order.indexOf(sel),
      pages: job.pages,
      size: job.sizes?.[sel] ?? ownLongMm(where.placement),
      ...outline(),
    };
    const n = numberOf(sel);
    if (!(await removePhoto())) return;
    remember(cut);
    setClipNote(fill(t.cutDone, { n }));
  };
  // The + mark (Word's cursor): where the next Paste goes, on the page shown; set by a tap on an empty spot.
  const [mark, setMark] = useState<{ page: number; x: number; y: number } | null>(null);
  // Another page in the middle: the mark was on the page left behind.
  useEffect(() => {
    setMark((m) => (m && m.page !== shown ? null : m));
  }, [shown]);
  const pastePhoto = async () => {
    const c = clipFor(jobId);
    if (!c || !job || !plan) return;
    const onPage = mark?.page ?? shown;
    const sz = pageSize(plan, onPage);
    const cx = mark ? mark.x : sz.w / 2;
    const cy = mark ? mark.y : sz.h / 2;
    const box = byHand.inside(onPage, { x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h });
    const x = (box.x + box.w / 2) / MM;
    const y = (box.y + box.h / 2) / MM;
    const fixed = spotsFromPlan(plan, job.spots);
    const fix: JobAction = { type: 'setSpots', spots: fixed, sizes: { ...freezeSizes(plan), ...(job.sizes ?? {}) } };
    // The page as stored, not its place on screen (review I2), and above every photo once they are fixed (review I3).
    const stored = storedPage(plan, fixed, onPage);
    const z = Math.max(0, ...Object.values(fixed).map((s) => s.z)) + 1;
    const newIndex = c.kind === 'copy' ? nextItemIndex(job) : c.item.index;
    const put: JobAction =
      c.kind === 'copy'
        ? { type: 'copyItem', copy: c.copy, page: stored, x, y }
        : {
            type: 'restoreItem',
            item: c.item,
            at: c.at,
            pages: c.pages,
            ...(c.size !== undefined ? { size: c.size } : {}),
            spot: { page: stored, x, y, z },
          };
    if (!(await change({ type: 'all', actions: [fix, put] }))) return;
    setMark(null);
    if (c.kind === 'cut') {
      remember(null);
      // Its own Undo goes; another photo's Remove keeps its Undo (review M3).
      if (undo?.item.index === c.item.index) {
        forgetRemoved();
        setUndo(null);
      }
    }
    setClipNote(null);
    setChosen(newIndex);
    retry(); // the pictures were listed without this photo when Adjust opened again (review I1): list them again
  };
  const removePage = async () => {
    if (!where) return;
    const p = docPage(where.placement);
    const before = shownPages;
    const pages = before.filter((q) => !(q.item === p.item && q.page === p.page));
    if (pages.length === 0 || !(await change({ type: 'setDocPages', pages }))) return;
    setPagesBefore(before);
    setChosen(Math.min(at, pages.length - 1));
  };
  // The round corner: drag it out to grow the chosen one, in to shrink it, on every preview (owner, 2026-10-24: "resizes
  // must be allowed for all sections that have photos"); the buttons do the same. A drag ends when its finger lifts,
  // wherever that is, and one whose handle is gone never blocks the next (review I1).
  const resizable =
    kind !== 'cards' || (!!job?.idCard && job.idCard.size !== 'sets' && job.idCard.size !== 'page' && sel !== null);
  /** The change that scales the chosen one by [s]: the change Smaller / Bigger make, within their limits. */
  const scaledBy = (p: Placement): ((s: number) => JobAction) | null => {
    if (!job || !plan) return null;
    if (kind === 'photos') {
      if (sel === null) return null;
      const base = job.sizes ?? freezeSizes(plan);
      const long = ownLongMm(p);
      return (s) => ({ type: 'setSizes', sizes: { ...base, [sel]: Math.max(MIN_LONG_MM, long * s) } });
    }
    if (kind === 'pages') {
      const at = docPage(p);
      return (s) => ({ type: 'setDocScale', ...at, scale: pageScale * s });
    }
    if (kind === 'cards') return (s) => ({ type: 'setIdCardScale', scale: cardScale * s });
    if (!pSize) return null;
    const { wMm, hMm } = pSize;
    const least = Math.max(CUSTOM_MIN_MM / wMm, CUSTOM_MIN_MM / hMm);
    const most = Math.min(CUSTOM_MAX_MM / wMm, CUSTOM_MAX_MM / hMm);
    return (s) => {
      const k = Math.min(most, Math.max(least, s));
      return { type: 'setPassportSize', preset: 'custom', sizeMm: { w: wMm * k, h: hMm * k } };
    };
  };
  const finishDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const action = draftNow.current;
    setDraft(null);
    if (action) void change(action);
  };
  finishNow.current = finishDrag;
  const startDrag = (e: PointerEvent) => {
    if (drag.current && !drag.current.el.isConnected) finishDrag();
    const rect = paperOf(where?.page ?? 0)?.getBoundingClientRect();
    const scaled = where ? scaledBy(where.placement) : null;
    if (!job || !plan || !where || !rect || drag.current || !scaled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    // A photo turned to any angle: its own size, and the finger's move measured along its turned sides.
    const b = ownBox(where.placement);
    drag.current = {
      id: e.pointerId,
      el,
      x: e.clientX,
      y: e.clientY,
      scaled,
      w: b.w,
      h: b.h,
      perPt: rect.width / pageSize(plan, where.page).w,
      tilt: ((where.placement.tilt?.deg ?? 0) * Math.PI) / 180,
    };
  };
  const moveDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const along = dx * Math.cos(d.tilt) + dy * Math.sin(d.tilt);
    const across = -dx * Math.sin(d.tilt) + dy * Math.cos(d.tilt);
    const s = Math.max((d.w + along / d.perPt) / d.w, (d.h + across / d.perPt) / d.h);
    setDraft(d.scaled(s));
  };
  const endDrag = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) finishDrag();
  };

  // The round handle above the chosen photo (owner, round 3: WPS's): move the finger around the photo's centre and it
  // turns to follow, clicking straight within 3°; lifting the finger saves (placed by hand: on top, as other changes).
  const startTurn = (e: PointerEvent) => {
    const rect = paperOf(where?.page ?? 0)?.getBoundingClientRect();
    // Not while a change is being saved (a turn started then would start from the old angle, review M4).
    if (!plan || !where || !rect || sel === null || turnDrag.current || busy || turningNow.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = rect.width / pageSize(plan, where.page).w;
    const b = where.placement.box;
    const cx = rect.left + (b.x + b.w / 2) * k;
    const cy = rect.top + (b.y + b.h / 2) * k;
    const last = Math.atan2(e.clientY - cy, e.clientX - cx);
    turnDrag.current = { id: e.pointerId, cx, cy, last, turned: 0, from: angleNow(sel) };
  };
  const moveTurn = (e: PointerEvent) => {
    const d = turnDrag.current;
    if (!d || d.id !== e.pointerId || sel === null) return;
    const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
    // The finger's turn since the last move, the short way round (across the left side's ±180° too).
    let step = a - d.last;
    if (step > Math.PI) step -= 2 * Math.PI;
    else if (step < -Math.PI) step += 2 * Math.PI;
    d.last = a;
    d.turned += (step * 180) / Math.PI;
    setTurning({ item: sel, angle: Math.round(snap(d.from + d.turned) * 10) / 10 });
  };
  const endTurn = (e: PointerEvent) => {
    const d = turnDrag.current;
    if (!d || d.id !== e.pointerId) return;
    turnDrag.current = null;
    const now = turningNow.current;
    if (!now || e.type !== 'pointerup') return setTurning(null);
    setTurning({ ...now, lifted: true });
    void rotateTo(now.item, now.angle).finally(() => setTurning(null));
  };
  turnNow.current = { move: moveTurn, end: endTurn };

  // Sides to crop (owner, 2026-10-24: "use the same frame to crop"): dragging a side in cuts that side off, out brings
  // it back; what is left keeps its print size. On release the cut and the new size (and place, if placed by hand) are
  // saved as one change.
  const startSide = (side: Side, placement: Placement) => (e: PointerEvent) => {
    const rect = paperOf(where?.page ?? 0)?.getBoundingClientRect();
    if (!plan || !where || !rect || sideDrag.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    sideDrag.current = {
      id: e.pointerId,
      side,
      x: e.clientX,
      y: e.clientY,
      pxPerPt: rect.width / pageSize(plan, where.page).w,
      placement,
    };
  };
  const moveSide = (e: PointerEvent) => {
    const d = sideDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) / d.pxPerPt;
    const dy = (e.clientY - d.y) / d.pxPerPt;
    const inward = d.side === 'l' ? dx : d.side === 'r' ? -dx : d.side === 't' ? dy : -dy;
    const p = d.placement;
    if (p.quad) {
      const r = sideCropQuad(p.quad, p.turns, p.box, d.side, inward);
      setCut({ item: p.itemIndex, box: r.box, crop: p.crop, quad: r.quad });
    } else {
      const r = sideCrop(p.crop, p.box, d.side, inward);
      setCut({ item: p.itemIndex, box: r.box, crop: r.crop });
    }
  };
  const endSide = (e: PointerEvent) => {
    const d = sideDrag.current;
    if (!d || d.id !== e.pointerId) return;
    sideDrag.current = null;
    const c = cutNow.current;
    setCut(null);
    if (!c || !job || !plan || !where || e.type !== 'pointerup') return;
    const item = c.item;
    const long = longMm(c.box);
    const cutAction: JobAction = c.quad
      ? { type: 'setQuad', item, quad: c.quad }
      : { type: 'setCrop', item, crop: isFull(c.crop) ? null : uprightOf(c.crop, d.placement.turns) };
    const spot = job.spots?.[item];
    const sized: JobAction = spot
      ? {
          type: 'placeItem',
          item,
          page: spot.page,
          x: (c.box.x + c.box.w / 2) / MM,
          y: (c.box.y + c.box.h / 2) / MM,
          size: long,
        }
      : { type: 'setSizes', sizes: { ...(job.sizes ?? freezeSizes(plan)), [item]: long } };
    void change({ type: 'all', actions: [cutAction, sized] });
  };

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const page = where && plan ? (plan as PrintPlan).pages[where.page] : undefined;
  // A photo being moved by hand is drawn where the finger has it, on top of the others.
  const lifted = byHand.lifted && where && byHand.lifted.page === where.page ? byHand.lifted : null;
  const liftedPlacement = lifted
    ? kind === 'cards'
      ? targets.find((x) => x.key === lifted.item)?.placement
      : page?.placements.find((p) => p.itemIndex === lifted.item)
    : undefined;
  // A side being dragged: the photo drawn cut as it would be.
  const withCut = (p: Placement): Placement =>
    cut && p.itemIndex === cut.item
      ? { ...p, box: cut.box, crop: cut.crop, ...(cut.quad ? { quad: cut.quad } : {}) }
      : p;
  // A photo being turned by the handle: drawn at the finger's angle about its own centre, at its own size.
  const withTurn = (p: Placement): Placement => {
    if (!turning || p.itemIndex !== turning.item) return p;
    const own = ownBox(p);
    const deg = (p.tilt?.deg ?? 0) + turning.angle - angleOf(p.turns, p.tilt?.deg ?? 0);
    return { ...p, tilt: { deg, w: own.w, h: own.h } };
  };
  // Page [n] as drawn: on the chosen photo's page, the photo held, cut or turned is drawn as the finger has it.
  const drawnOn = (n: number) => {
    const pg = plan?.pages[n];
    return (
      n === where?.page && page && lifted && liftedPlacement
        ? [...page.placements.filter((p) => p !== liftedPlacement), { ...liftedPlacement, box: lifted.box }]
        : (pg?.placements ?? [])
    ).map((p) => withTurn(withCut(p)));
  };
  // The places to touch keep their order (moving the held one in the page would end its drag); the lifted one is
  // only drawn on top (its class).
  const touchableOn = (n: number) =>
    (plan?.pages[n]?.placements ?? []).map((p) =>
      lifted && p === liftedPlacement ? { ...p, box: lifted.box } : withTurn(withCut(p)),
    );
  // Side handles only where the photo is big enough on screen to hold them apart (96 px along that side).
  const pxPerPt = paperPx && plan && where ? paperPx / pageSize(plan, where.page).w : 0;
  const numberOf = (item: number) => keys.indexOf(item) + 1;
  // Handles on a side that reaches the page's edge sit just inside it: drawn outside, their touch area would reach past
  // the screen's edge (a whole document page, a photo at the margin, the page across the screen since round 3).
  const remPx =
    typeof document === 'undefined' ? 16 : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const nearEdge = (p: Placement) => ({
    r: !!size && pxPerPt > 0 && (size.w - p.box.x - p.box.w) * pxPerPt < 2 * remPx,
    b: !!size && pxPerPt > 0 && (size.h - p.box.y - p.box.h) * pxPerPt < 2 * remPx,
    l: pxPerPt > 0 && p.box.x * pxPerPt < 2 * remPx,
    t: pxPerPt > 0 && p.box.y * pxPerPt < 2 * remPx,
  });
  const cover = covering[0];
  const size = where && plan ? pageSize(plan, where.page) : undefined;
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  const keyOf = (p: Placement, n: number): number | null => {
    if (kind === 'photos') return p.itemIndex;
    if (kind === 'passport') return 0;
    if (kind === 'pages') return n;
    const k = job?.idCard?.cards.findIndex((c) => c.item === p.itemIndex && sameQuad(c.quad, p.quad)) ?? -1;
    return k >= 0 ? k : null;
  };
  const srcOfPlacement = (p: Placement) =>
    p.quad
      ? straight({ item: p.itemIndex, ...(p.pdfPage !== undefined ? { page: p.pdfPage } : {}), quad: p.quad }) ||
        undefined
      : p.pdfPage !== undefined
        ? docs.srcOfPage(p.itemIndex, p.pdfPage)
        : srcOf(p.itemIndex);
  const titleText =
    sel === null
      ? t.title
      : kind === 'passport'
        ? t.passportTitle
        : fill(kind === 'pages' ? t.pageOf : kind === 'cards' ? t.cardOf : t.photoOf, {
            n: at + 1,
            total: keys.length,
          });
  const sizeText = !where
    ? ''
    : kind === 'pages'
      ? `${Math.round(pageScale * 100)} % · ${cmText(where.placement.box)}`
      : kind === 'cards'
        ? `${Math.round(cardScale * 100)} % · ${cmText(where.placement.box)}`
        : kind === 'passport' && pSize
          ? `${cmOf(pSize.wMm)} × ${cmOf(pSize.hMm)} cm · ${borderName(passport?.border)}`
          : (() => {
              // Its own size (a turned photo keeps it, as in Word) and how far it is turned, as the finger turns it.
              const p = withTurn(where.placement);
              return p.tilt
                ? `${cmText(ownBox(p))} · ${fill(t.degrees, { n: shownDegrees(angleOf(p.turns, p.tilt.deg)) })}`
                : cmText(p.box);
            })();
  const prevNext = (label: [string, string]) => (
    <>
      <Button variant="secondary" icon="back" disabled={at <= 0} onClick={() => setChosen(keys[at - 1] ?? null)}>
        {label[0]}
      </Button>
      <Button
        variant="secondary"
        icon="next"
        disabled={at < 0 || at >= keys.length - 1}
        onClick={() => setChosen(keys[at + 1] ?? null)}
      >
        {label[1]}
      </Button>
    </>
  );

  // A tool reached by the keyboard slides wholly into the row, its focus ring clear of the row's edges (Chromium scrolls
  // a focused element only just into view, whatever scroll-padding says).
  const slideIntoView = (e: FocusEvent) => {
    const row = e.currentTarget as HTMLElement;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const room = Number.parseFloat(getComputedStyle(row).paddingLeft) || 0;
    if (r.right > box.right - room) row.scrollLeft += r.right - (box.right - room);
    else if (r.left < box.left + room) row.scrollLeft -= box.left + room - r.left;
  };
  // Every tool for this kind, once: in the bottom row on a phone, beside the page when held sideways (round 3).
  const tools = (
    <>
      {/* Zoom first, on every kind (owner, round 4). */}
      <Button variant="secondary" icon="zoomOut" disabled={zoom <= ZOOM_MIN} onClick={() => zoomTo(nextZoom(zoom, -1))}>
        {t.zoomOut}
      </Button>
      <Button variant="secondary" icon="zoomIn" disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo(nextZoom(zoom, 1))}>
        {t.zoomIn}
      </Button>
      {/* Then Undo and Redo, on every kind (owner, round 6). */}
      <Button
        variant="secondary"
        icon="undo"
        label={t.undoStep}
        disabled={busy || !steps.canUndo}
        onClick={() => void stepBy('undo')}
      >
        {t.undo}
      </Button>
      <Button
        variant="secondary"
        icon="redo"
        label={t.redoStep}
        disabled={busy || !steps.canRedo}
        onClick={() => void stepBy('redo')}
      >
        {t.redo}
      </Button>
      {kind === 'photos' && (
        <>
          <Button
            variant="secondary"
            icon="minus"
            disabled={busy || !where || ownLongMm(where.placement) <= MIN_LONG_MM + 0.05}
            onClick={() => resizePhoto(1 / STEP)}
          >
            {t.smaller}
          </Button>
          <Button variant="secondary" icon="plus" disabled={busy || !canGrow} onClick={() => resizePhoto(STEP)}>
            {t.bigger}
          </Button>
          <Button
            variant="secondary"
            icon="turn"
            disabled={busy || sel === null}
            onClick={() => sel !== null && void onTop({ type: 'turnItem', index: sel })}
          >
            {t.turn}
          </Button>
          {/* Any angle without dragging (PLAN §H2.4): 1° a tap. */}
          <Button variant="secondary" icon="turnLeft" disabled={busy || sel === null} onClick={() => tiltBy(-1)}>
            {t.tiltLeft}
          </Button>
          <Button variant="secondary" icon="turn" disabled={busy || sel === null} onClick={() => tiltBy(1)}>
            {t.tiltRight}
          </Button>
          <Button
            variant="secondary"
            icon="crop"
            disabled={sel === null}
            onClick={() => sel !== null && goOut(push('cropphoto', { jobId, index: sel }))}
          >
            {t.crop}
          </Button>
          {/* Placed by hand: pages, not order (the photos stay where they were put). */}
          {free ? (
            <>
              <Button
                variant="secondary"
                icon="back"
                disabled={busy || !spotOf || placedPages.indexOf(spotOf.page) <= 0}
                onClick={() => toPage(-1)}
              >
                {t.toPrevious}
              </Button>
              <Button variant="secondary" icon="next" disabled={busy || !spotOf} onClick={() => toPage(1)}>
                {t.toNext}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                icon="earlier"
                disabled={busy || at <= 0}
                onClick={() => sel !== null && void change({ type: 'moveItem', index: sel, by: -1, among: keys })}
              >
                {t.earlier}
              </Button>
              <Button
                variant="secondary"
                icon="later"
                disabled={busy || at < 0 || at >= keys.length - 1}
                onClick={() => sel !== null && void change({ type: 'moveItem', index: sel, by: 1, among: keys })}
              >
                {t.later}
              </Button>
            </>
          )}
          {/* Moving without dragging (PLAN §H2.4): 2 mm a tap; the first move places every photo by hand. */}
          {(['up', 'down', 'left', 'right'] as const).map((d) => (
            <Button
              key={d}
              variant="secondary"
              icon={d}
              disabled={busy || sel === null || !where}
              onClick={() =>
                sel !== null &&
                where &&
                byHand.nudge(
                  sel,
                  where.page,
                  d === 'left' ? -2 : d === 'right' ? 2 : 0,
                  d === 'up' ? -2 : d === 'down' ? 2 : 0,
                )
              }
            >
              {d === 'up' ? t.moveUp : d === 'down' ? t.moveDown : d === 'left' ? t.moveLeft : t.moveRight}
            </Button>
          ))}
          <Button variant="secondary" icon="up" disabled={busy || !layers.front} onClick={() => stackPhoto('front')}>
            {t.front}
          </Button>
          <Button variant="secondary" icon="down" disabled={busy || !layers.back} onClick={() => stackPhoto('back')}>
            {t.sendBack}
          </Button>
          {prevNext([t.previous, t.next])}
          <Button
            variant="secondary"
            icon="remove"
            disabled={busy || sel === null || keys.length < 2}
            onClick={() => void removePhoto()}
          >
            {t.remove}
          </Button>
          <Button variant="secondary" icon="copy" disabled={busy || sel === null} onClick={copyPhoto}>
            {t.copy}
          </Button>
          <Button
            variant="secondary"
            icon="cut"
            disabled={busy || sel === null || keys.length < 2}
            onClick={() => void cutPhoto()}
          >
            {t.cut}
          </Button>
          <Button variant="secondary" icon="paste" disabled={busy || !clip} onClick={() => void pastePhoto()}>
            {t.paste}
          </Button>
          <Button
            variant="secondary"
            icon="undo"
            disabled={busy || (!job?.sizes && !job?.spots)}
            onClick={() => void change({ type: 'setSizes', sizes: null })}
          >
            {t.automatic}
          </Button>
          <Button variant="secondary" icon="photos" onClick={() => goOut(push('addsource', { jobId, kind: 'photos' }))}>
            {en.add.photos}
          </Button>
        </>
      )}
      {kind === 'pages' && where && (
        <>
          <Button
            variant="secondary"
            icon="minus"
            disabled={busy || pageScale <= 0.5}
            onClick={() => void change({ type: 'setDocScale', ...docPage(where.placement), scale: pageScale - 0.05 })}
          >
            {t.smaller}
          </Button>
          <Button
            variant="secondary"
            icon="plus"
            disabled={busy || pageScale >= 1}
            onClick={() => void change({ type: 'setDocScale', ...docPage(where.placement), scale: pageScale + 0.05 })}
          >
            {t.bigger}
          </Button>
          <Button
            variant="secondary"
            icon="turn"
            disabled={busy}
            onClick={() => void change({ type: 'turnDocPage', ...docPage(where.placement) })}
          >
            {t.turn}
          </Button>
          {where.placement.pdfPage === undefined && (
            <Button
              variant="secondary"
              icon="crop"
              onClick={() => goOut(push('cropphoto', { jobId, index: where.placement.itemIndex }))}
            >
              {t.crop}
            </Button>
          )}
          <Button
            variant="secondary"
            icon="earlier"
            disabled={busy || docAt(docPage(where.placement)) <= 0}
            onClick={async () => {
              const from = docAt(docPage(where.placement));
              if (await change({ type: 'moveDocPage', at: from, by: -1, shown: shownPages })) setChosen(at - 1);
            }}
          >
            {t.earlier}
          </Button>
          <Button
            variant="secondary"
            icon="later"
            disabled={busy || docAt(docPage(where.placement)) >= shownPages.length - 1}
            onClick={async () => {
              const from = docAt(docPage(where.placement));
              if (await change({ type: 'moveDocPage', at: from, by: 1, shown: shownPages })) setChosen(at + 1);
            }}
          >
            {t.later}
          </Button>
          {prevNext([t.previousPage, t.nextPage])}
          <Button
            variant="secondary"
            icon="remove"
            disabled={busy || keys.length < 2}
            onClick={() => void removePage()}
          >
            {t.removePage}
          </Button>
          <Button
            variant="secondary"
            icon="files"
            onClick={() => goOut(push('addsource', { jobId, kind: 'documents' }))}
          >
            {en.add.files}
          </Button>
        </>
      )}
      {kind === 'passport' && passport && (
        <>
          <Button variant="secondary" icon="minus" disabled={busy || !passportCan(-1)} onClick={() => passportBy(-1)}>
            {t.smaller}
          </Button>
          <Button variant="secondary" icon="plus" disabled={busy || !passportCan(1)} onClick={() => passportBy(1)}>
            {t.bigger}
          </Button>
          <Button
            variant="secondary"
            icon="passport"
            onClick={() => goOut(push('passportcrop', { jobId, from: 'change' }))}
          >
            {t.face}
          </Button>
          <Button
            variant="secondary"
            icon="turn"
            disabled={busy}
            onClick={() => void change({ type: 'turnItem', index: passport.item })}
          >
            {t.turn}
          </Button>
          <Button variant="secondary" icon="photos" onClick={() => goOut(push('passportsize', { jobId }))}>
            {en.passport.size}
          </Button>
          <Button variant="secondary" icon="crop" onClick={() => goOut(push('passportborder', { jobId }))}>
            {en.passport.border}
          </Button>
          <Button variant="secondary" icon="files" onClick={() => goOut(push('passportcount', { jobId }))}>
            {t.howMany}
          </Button>
        </>
      )}
      {kind === 'cards' && job?.idCard && job.idCard.size !== 'sets' && job.idCard.size !== 'page' && sel !== null && (
        <>
          <Button
            variant="secondary"
            icon="minus"
            disabled={busy || cardScale <= 0.7 + 1e-9}
            onClick={() => void change({ type: 'setIdCardScale', scale: cardScale - 0.1 })}
          >
            {t.smaller}
          </Button>
          <Button
            variant="secondary"
            icon="plus"
            disabled={busy || cardScale >= 2 - 1e-9 || cardsAtMost}
            onClick={() => void change({ type: 'setIdCardScale', scale: cardScale + 0.1 })}
          >
            {t.bigger}
          </Button>
          <Button
            variant="secondary"
            icon="turn"
            disabled={busy}
            onClick={() => void change({ type: 'turnIdCard', at: sel, by: 1 })}
          >
            {t.turn}
          </Button>
          <Button variant="secondary" icon="crop" onClick={() => goOut(push('fixcorners', { jobId, at: sel }))}>
            {en.cards.fix}
          </Button>
          {job.idCard.cards.length > 1 && (
            <Button
              variant="secondary"
              icon="undo"
              disabled={busy}
              onClick={() => void change({ type: 'swapIdCards' })}
            >
              {t.swapSides}
            </Button>
          )}
          {/* Placed by hand and side by side (owner, round 5): Move, Automatic, and the arrangement. */}
          {cardsByHand &&
            where &&
            (['up', 'down', 'left', 'right'] as const).map((d) => (
              <Button
                key={d}
                variant="secondary"
                icon={d}
                disabled={busy}
                onClick={() =>
                  byHand.nudge(
                    sel,
                    where.page,
                    d === 'left' ? -2 : d === 'right' ? 2 : 0,
                    d === 'up' ? -2 : d === 'down' ? 2 : 0,
                  )
                }
              >
                {d === 'up' ? t.moveUp : d === 'down' ? t.moveDown : d === 'left' ? t.moveLeft : t.moveRight}
              </Button>
            ))}
          {cardsByHand && (
            <>
              <Button variant="secondary" icon="up" disabled={busy || !layers.front} onClick={() => stackCard('front')}>
                {t.front}
              </Button>
              <Button variant="secondary" icon="down" disabled={busy || !layers.back} onClick={() => stackCard('back')}>
                {t.sendBack}
              </Button>
            </>
          )}
          {cardsByHand && (
            <Button
              variant="secondary"
              icon="undo"
              disabled={busy || !job.idCard.spots}
              onClick={() => void change({ type: 'clearIdCardSpots' })}
            >
              {t.automatic}
            </Button>
          )}
          {cardsByHand && job.idCard.cards.length > 1 && (
            <>
              <Button
                variant="secondary"
                icon="down"
                pressed={job.idCard.arrange !== 'row'}
                disabled={busy}
                onClick={() => void change({ type: 'setIdCardArrange', arrange: 'stack' })}
              >
                {t.stacked}
              </Button>
              <Button
                variant="secondary"
                icon="right"
                pressed={job.idCard.arrange === 'row'}
                disabled={busy}
                onClick={() => void change({ type: 'setIdCardArrange', arrange: 'row' })}
              >
                {t.sideBySide}
              </Button>
            </>
          )}
          {prevNext([t.previousCard, t.nextCard])}
        </>
      )}
    </>
  );
  return (
    <main class="screen">
      <TopBar title={titleText} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {added && <Panel kind="warn" title={added} />}
      {cover && <Panel kind="info" title={fill(t.covers, { a: numberOf(cover[1]), b: numberOf(cover[0]) })} />}
      {kind === 'photos' && undo && (
        <Panel
          kind="info"
          title={en.photos.removed}
          action={{
            label: en.photos.undo,
            onClick: async () => {
              if (
                !(await change({
                  type: 'restoreItem',
                  item: undo.item,
                  at: undo.at,
                  pages: undo.pages,
                  size: undo.size,
                  ...(undo.spot ? { spot: undo.spot } : {}),
                }))
              )
                return;
              forgetRemoved();
              setUndo(null);
              setChosen(undo.item.index);
              // Cut, then Undo (review M2): the photo is back, so Paste has nothing to put back.
              if (clip?.kind === 'cut' && clip.item.index === undo.item.index) {
                remember(null);
                setClipNote(null);
              }
              retry(); // the thumbnails were listed without this photo: list them again
            },
          }}
        />
      )}
      {kind === 'pages' && pagesBefore && (
        <Panel
          kind="info"
          title={t.pageRemoved}
          action={{
            label: en.photos.undo,
            onClick: async () => {
              if (await change({ type: 'setDocPages', pages: pagesBefore })) setPagesBefore(null);
            },
          }}
        />
      )}
      {/* Side by side on a wide screen held sideways (tablets, a phone in landscape): the page and its tools together. */}
      <div class="adjust-body">
        {plan && where && page && size && (
          <div class="adjust-stage">
            <div class="adjust-pagebar">
              {plan.pages.length > 1 && (
                <button
                  type="button"
                  class="adjust-pagebtn"
                  aria-label={t.showPrevious}
                  disabled={shown <= 0}
                  onClick={() => {
                    showPage(shown - 1);
                    chooseOn(shown - 1);
                  }}
                >
                  <Icon name="back" />
                </button>
              )}
              <p class="adjust-page" aria-live="polite">
                {zoom > 1
                  ? fill(t.zoomShown, { n: shown + 1, total: plan.pages.length, z: Math.round(zoom * 100) })
                  : fill(en.ready.pageLabel, { n: shown + 1, total: plan.pages.length })}
              </p>
              {plan.pages.length > 1 && (
                <button
                  type="button"
                  class="adjust-pagebtn"
                  aria-label={t.showNext}
                  disabled={shown >= plan.pages.length - 1}
                  onClick={() => {
                    showPage(shown + 1);
                    chooseOn(shown + 1);
                  }}
                >
                  <Icon name="next" />
                </button>
              )}
            </div>
            {lifted && (
              <p role="status" class="adjust-moving">
                {fill(kind === 'cards' ? t.movingCard : t.moving, { n: numberOf(lifted.item) })}
              </p>
            )}
            {/* Every page side by side (owner, round 4): the chosen photo's page in the middle, the next and previous
                showing at the sides; a sideways swipe or ‹ › moves one page. The keyboard stops on the page in the
                middle (arrow keys slide them). */}
            <div
              ref={figure}
              class={`adjust-strip${plan.pages.length > 1 ? '' : ' adjust-strip-one'}${zoom > 1 ? ' adjust-zoomed' : ''}`}
              style={zoom > 1 && zoomBase.current ? { height: `${zoomBase.current.height}px` } : undefined}
            >
              {plan.pages.map((_, n) => {
                const sz = pageSize(plan, n);
                const onWhere = n === where.page;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the + mark is an extra; Paste without it goes to the page's middle
                  // biome-ignore lint/a11y/noStaticElementInteractions: the same tap, on the page itself
                  <div
                    key={n}
                    class={`adjust-sheet${onWhere ? ' adjust-paper' : ''}${n === shown ? ' adjust-shown' : ''}`}
                    data-page={n}
                    onClick={(e) => {
                      // A tap on an empty spot of the page shown sets the + mark (photos; a photo or a handle is not
                      // empty).
                      if (kind !== 'photos' || n !== shown || !plan) return;
                      const target = e.target as HTMLElement;
                      if (target.closest('.adjust-pick, .adjust-handle, .adjust-side, .adjust-rotate')) return;
                      const r = paperOf(n)?.getBoundingClientRect();
                      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                        return;
                      setMark({
                        page: n,
                        x: ((e.clientX - r.left) / r.width) * sz.w,
                        y: ((e.clientY - r.top) / r.height) * sz.h,
                      });
                    }}
                    style={{
                      '--paper-aspect': `${sz.w / sz.h}`,
                      ...(zoom > 1 && n === shown && zoomBase.current
                        ? {
                            width: `${(zoomBase.current.widths[n] ?? Math.max(...zoomBase.current.widths)) * zoom}px`,
                          }
                        : {}),
                    }}
                  >
                    <PaperPreview
                      wPt={sz.w}
                      hPt={sz.h}
                      placements={drawnPage(n) ? drawnOn(n) : []}
                      srcOf={(item, pdfPage) => (pdfPage !== undefined ? docs.srcOfPage(item, pdfPage) : srcOf(item))}
                      srcOfPlacement={srcOfPlacement}
                      label={fill(en.ready.pageLabel, { n: n + 1, total: plan.pages.length })}
                      grey={plan.colour === 'bw'}
                    >
                      {(drawnPage(n) ? touchableOn(n) : []).map((p, i) => {
                        const k = keyOf(p, n);
                        const selected = k !== null && k === sel;
                        // A photo turned to any angle: its handles on its own frame, turned with it (WPS), over the others.
                        const own = p.tilt ? ownBox(p) : null;
                        const handles = (
                          <>
                            {kind === 'photos' &&
                              selected &&
                              !lifted &&
                              !p.tilt &&
                              k !== null &&
                              (['l', 'r', 't', 'b'] as const)
                                .filter((s) => (s === 'l' || s === 'r' ? p.box.h : p.box.w) * pxPerPt >= 96)
                                .map((s) => (
                                  <span
                                    key={s}
                                    class={`adjust-side adjust-side-${s}${nearEdge(p)[s] ? ' adjust-in' : ''}`}
                                    onPointerDown={startSide(s, where.placement)}
                                    onPointerMove={moveSide}
                                    onPointerUp={endSide}
                                    onPointerCancel={endSide}
                                    onLostPointerCapture={endSide}
                                  />
                                ))}
                            {resizable &&
                              selected &&
                              (p === where.placement ||
                                (kind === 'photos' && (cut?.item === k || turning?.item === k))) && (
                                <span
                                  class={`adjust-handle${nearEdge(p).r || nearEdge(p).b ? ' adjust-in' : ''}`}
                                  onPointerDown={startDrag}
                                  onPointerMove={moveDrag}
                                  onPointerUp={endDrag}
                                  onPointerCancel={endDrag}
                                  onLostPointerCapture={endDrag}
                                />
                              )}
                            {kind === 'photos' &&
                              selected &&
                              !lifted &&
                              !cut &&
                              (p === where.placement || turning?.item === k) && (
                                <span class="adjust-rotate" onPointerDown={startTurn} />
                              )}
                          </>
                        );
                        return (
                          <span
                            key={kind === 'photos' && k !== null ? `pick-${k}` : `pick-at${i}`}
                            class={`adjust-pick${selected && !own ? ' adjust-selected' : ''}${lifted && lifted.item === k ? ' adjust-lifted' : ''}`}
                            {...((kind === 'photos' || cardsByHand) && k !== null
                              ? { 'data-item': k, ...byHand.handlers(k, n) }
                              : {})}
                            style={{
                              left: pct(p.box.x, sz.w),
                              top: pct(p.box.y, sz.h),
                              width: pct(p.box.w, sz.w),
                              height: pct(p.box.h, sz.h),
                            }}
                            aria-hidden="true"
                            onClick={() => k !== null && setChosen(k)}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            {own && p.tilt && selected ? (
                              <span
                                class={`adjust-tilt${lifted ? '' : ' adjust-selected'}`}
                                style={{
                                  left: pct(own.x - p.box.x, p.box.w),
                                  top: pct(own.y - p.box.y, p.box.h),
                                  width: pct(own.w, p.box.w),
                                  height: pct(own.h, p.box.h),
                                  transform: `rotate(${p.tilt.deg}deg)`,
                                }}
                              >
                                {handles}
                              </span>
                            ) : (
                              handles
                            )}
                          </span>
                        );
                      })}
                      {mark && mark.page === n && (
                        <span
                          class="adjust-mark"
                          aria-hidden="true"
                          style={{ left: pct(mark.x, sz.w), top: pct(mark.y, sz.h) }}
                        />
                      )}
                      {/* The angle while the round handle turns the photo: on its centre, clear of the finger. */}
                      {onWhere && turning && !turning.lifted && (
                        <span
                          class="adjust-degrees"
                          role="status"
                          style={{
                            left: pct(where.placement.box.x + where.placement.box.w / 2, size.w),
                            top: pct(where.placement.box.y + where.placement.box.h / 2, size.h),
                          }}
                        >
                          {fill(t.degrees, { n: shownDegrees(turning.angle) })}
                        </span>
                      )}
                      {/* Word-like guides while a photo is moved: the line it snapped to. */}
                      {onWhere &&
                        lifted?.guides.map((g) => (
                          <span
                            key={`${g.x1},${g.y1},${g.x2},${g.y2}`}
                            class="adjust-guide"
                            style={{
                              left: pct(g.x1, size.w),
                              top: pct(g.y1, size.h),
                              width: g.x1 === g.x2 ? '1px' : pct(g.x2 - g.x1, size.w),
                              height: g.y1 === g.y2 ? '1px' : pct(g.y2 - g.y1, size.h),
                            }}
                            aria-hidden="true"
                          />
                        ))}
                    </PaperPreview>
                  </div>
                );
              })}
            </div>
            <p class="adjust-size">{sizeText}</p>
            {/* Under the page, so the page never moves when it shows (Copy, Cut, the + mark). */}
            {!lifted && (mark || clipNote) && (
              <p role="status" class="adjust-note">
                {mark ? t.markShown : clipNote}
              </p>
            )}
          </div>
        )}
        {/* Office-style tools: icon above its word; as many to a row as the text size allows. */}
        {/* Held sideways on a wide screen: the tools beside the page (equal halves). */}
        {wide && <div class="tool-grid">{tools}</div>}
      </div>
      <ActionBar>
        {/* On a phone: one row of tools above Done that slides sideways (owner, round 3: Doc Scanner's editor). */}
        {!wide && (
          <div class="tool-row" onFocusIn={slideIntoView}>
            {tools}
          </div>
        )}
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}
