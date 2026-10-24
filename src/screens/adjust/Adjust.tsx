import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type DocPage, type Job, type JobAction, jobReducer } from '../../core/job/job';
import { isFull, uprightOf } from '../../core/layout/crop';
import { freezeSizes, MIN_LONG_MM } from '../../core/layout/flow';
import { overlaps, type Side, sideCrop, sideCropQuad } from '../../core/layout/free';
import type { Box } from '../../core/layout/onePerPage';
import { passportSize } from '../../core/layout/passport';
import { allDocPages, CARD_W_MM, type Placement, type PrintPlan } from '../../core/plan/plan';
import { CUSTOM_MAX_MM, CUSTOM_MIN_MM } from '../../core/settings/settings';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { PaperPreview } from '../../ui/PaperPreview';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { borderName, cmOf } from '../passport/names';
import { forgetRemoved, rememberRemoved, removedFor } from '../photos/undo';
import { push, type ScreenProps } from '../types';
import { takeAddedChoice, useAddNotice } from '../useAddNotice';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';
import { useStraightImages } from '../useStraightImages';
import { cmText, findItem, itemsInPlan, longMm, pageSize } from './place';
import { usePlaceByHand } from './usePlaceByHand';

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
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
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
  } | null>(null);
  const figure = useRef<HTMLDivElement>(null);
  // A side of the chosen photo being dragged to crop it (Word's crop, owner 2026-10-24), and what it would make.
  const sideDrag = useRef<{
    id: number;
    side: Side;
    x: number;
    y: number;
    pxPerPt: number;
    placement: Placement;
  } | null>(null);
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
    const el = figure.current?.querySelector('figure');
    if (!el) return;
    const measure = () => setPaperPx(el.getBoundingClientRect().width);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [!!plan, where?.page, kind]);
  // Press and hold to place a photo anywhere on its page (owner, 2026-10-24); the Move buttons do the same.
  const byHand = usePlaceByHand({
    enabled: kind === 'photos',
    plan,
    job,
    figure,
    edgeMm: job ? paper.photoEdgeMm(job) : 6,
    onChoose: (item) => setChosen(item),
    save: (actions) => change({ type: 'all', actions }),
  });
  const covering = useMemo(() => (kind === 'photos' && plan ? overlaps(plan) : []), [plan, kind]);
  // The one shown first stays the chosen one: moving it never swaps the screen to another.
  useEffect(() => {
    if (chosen === null && sel !== null) setChosen(sel);
  }, [chosen, sel]);
  // Photos: what one more Bigger would do (nothing when the photo is already as big as fits).
  const canGrow = useMemo(() => {
    if (kind !== 'photos' || !job || !plan || !where || sel === null) return false;
    const now = longMm(where.placement.box);
    const sizes = { ...(job.sizes ?? freezeSizes(plan)), [sel]: now * STEP };
    const bigger = findItem(paper.draw({ ...job, sizes }, aspects, docs.facts), sel);
    return !!bigger && longMm(bigger.placement.box) > now + 0.05;
  }, [kind, job, plan, sel, paper.key]);
  // A finger that lifts anywhere ends the corner drag (its handle may have been redrawn on another page).
  const finishNow = useRef<() => void>(() => {});
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) finishNow.current();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
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
  const cardScale =
    job?.idCard?.size === 'custom'
      ? (job.idCard.scale ?? 1)
      : job?.idCard?.size === 'big' && where
        ? where.placement.box.w / (CARD_W_MM * MM)
        : 1;
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
    const sizes = { ...(job.sizes ?? freezeSizes(plan)), [sel]: longMm(where.placement.box) * factor };
    void onTop({ type: 'setSizes', sizes });
  };
  const removePhoto = async () => {
    if (!job || sel === null) return;
    const item = job.items.find((i) => i.index === sel);
    if (!item) return;
    const place = job.order.indexOf(sel);
    const pages = job.pages;
    const size = job.sizes?.[sel];
    const spot = job.spots?.[sel];
    if (!(await change({ type: 'removeItem', index: sel }))) return;
    rememberRemoved(jobId, item, place, pages, size, spot);
    setUndo(removedFor(jobId));
    setChosen(keys[at + 1] ?? keys[at - 1] ?? null);
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
      const long = longMm(p.box);
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
    const rect = figure.current?.querySelector('figure')?.getBoundingClientRect();
    const scaled = where ? scaledBy(where.placement) : null;
    if (!job || !plan || !where || !rect || drag.current || !scaled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const b = where.placement.box;
    drag.current = {
      id: e.pointerId,
      el,
      x: e.clientX,
      y: e.clientY,
      scaled,
      w: b.w,
      h: b.h,
      perPt: rect.width / pageSize(plan, where.page).w,
    };
  };
  const moveDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const s = Math.max((d.w + (e.clientX - d.x) / d.perPt) / d.w, (d.h + (e.clientY - d.y) / d.perPt) / d.h);
    setDraft(d.scaled(s));
  };
  const endDrag = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) finishDrag();
  };

  // Sides to crop (owner, 2026-10-24: "use the same frame to crop"): dragging a side in cuts that side off, out brings
  // it back; what is left keeps its print size. On release the cut and the new size (and place, if placed by hand) are
  // saved as one change.
  const startSide = (side: Side, placement: Placement) => (e: PointerEvent) => {
    const rect = figure.current?.querySelector('figure')?.getBoundingClientRect();
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
  const liftedPlacement = lifted ? page?.placements.find((p) => p.itemIndex === lifted.item) : undefined;
  // A side being dragged: the photo drawn cut as it would be.
  const withCut = (p: Placement): Placement =>
    cut && p.itemIndex === cut.item
      ? { ...p, box: cut.box, crop: cut.crop, ...(cut.quad ? { quad: cut.quad } : {}) }
      : p;
  const drawn = (
    page && lifted && liftedPlacement
      ? [...page.placements.filter((p) => p !== liftedPlacement), { ...liftedPlacement, box: lifted.box }]
      : (page?.placements ?? [])
  ).map(withCut);
  // The places to touch keep their order (moving the held one in the page would end its drag); the lifted one is
  // only drawn on top (its class).
  const touchable = (page?.placements ?? []).map((p) =>
    lifted && p === liftedPlacement ? { ...p, box: lifted.box } : withCut(p),
  );
  // Side handles only where the photo is big enough on screen to hold them apart (96 px along that side).
  const pxPerPt = paperPx && plan && where ? paperPx / pageSize(plan, where.page).w : 0;
  const numberOf = (item: number) => keys.indexOf(item) + 1;
  const cover = covering[0];
  const size = where && plan ? pageSize(plan, where.page) : undefined;
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  const keyOf = (p: Placement): number | null => {
    if (kind === 'photos') return p.itemIndex;
    if (kind === 'passport') return 0;
    if (kind === 'pages') return where?.page ?? null;
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
          : cmText(where.placement.box);
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
      <p>{kind === 'photos' ? t.hint : t.hintOther}</p>
      {/* Side by side on a wide screen held sideways (tablets, a phone in landscape): the page and its tools together. */}
      <div class="adjust-body">
        {plan && where && page && size && (
          <div class="adjust-stage">
            <p class="adjust-page">{fill(en.ready.pageLabel, { n: where.page + 1, total: plan.pages.length })}</p>
            {lifted && (
              <p role="status" class="adjust-moving">
                {fill(t.moving, { n: numberOf(lifted.item) })}
              </p>
            )}
            <div ref={figure} class="adjust-paper">
              <PaperPreview
                wPt={size.w}
                hPt={size.h}
                placements={drawn}
                srcOf={(item, pdfPage) => (pdfPage !== undefined ? docs.srcOfPage(item, pdfPage) : srcOf(item))}
                srcOfPlacement={srcOfPlacement}
                label={fill(en.ready.pageLabel, { n: where.page + 1, total: plan.pages.length })}
                grey={plan.colour === 'bw'}
              >
                {touchable.map((p, i) => {
                  const k = keyOf(p);
                  const selected = k !== null && k === sel;
                  return (
                    <span
                      key={kind === 'photos' && k !== null ? `pick-${k}` : `pick-at${i}`}
                      class={`adjust-pick${selected ? ' adjust-selected' : ''}${lifted && lifted.item === k ? ' adjust-lifted' : ''}`}
                      {...(kind === 'photos' && k !== null
                        ? { 'data-item': k, ...byHand.handlers(k, where.page) }
                        : {})}
                      style={{
                        left: pct(p.box.x, size.w),
                        top: pct(p.box.y, size.h),
                        width: pct(p.box.w, size.w),
                        height: pct(p.box.h, size.h),
                      }}
                      aria-hidden="true"
                      onClick={() => k !== null && setChosen(k)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {kind === 'photos' &&
                        selected &&
                        !lifted &&
                        k !== null &&
                        (['l', 'r', 't', 'b'] as const)
                          .filter((s) => (s === 'l' || s === 'r' ? p.box.h : p.box.w) * pxPerPt >= 96)
                          .map((s) => (
                            <span
                              key={s}
                              class={`adjust-side adjust-side-${s}`}
                              onPointerDown={startSide(s, where.placement)}
                              onPointerMove={moveSide}
                              onPointerUp={endSide}
                              onPointerCancel={endSide}
                              onLostPointerCapture={endSide}
                            />
                          ))}
                      {resizable && selected && (p === where.placement || (kind === 'photos' && cut?.item === k)) && (
                        <span
                          class="adjust-handle"
                          onPointerDown={startDrag}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onLostPointerCapture={endDrag}
                        />
                      )}
                    </span>
                  );
                })}
                {/* Word-like guides while a photo is moved: the line it snapped to. */}
                {lifted?.guides.map((g) => (
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
            <p class="adjust-size">{sizeText}</p>
          </div>
        )}
        {/* Office-style tools: icon above its word; as many to a row as the text size allows. */}
        <div class="tool-grid">
          {kind === 'photos' && (
            <>
              <Button
                variant="secondary"
                icon="minus"
                disabled={busy || !where || longMm(where.placement.box) <= MIN_LONG_MM + 0.05}
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
              <Button
                variant="secondary"
                icon="crop"
                disabled={sel === null}
                onClick={() => sel !== null && go(push('cropphoto', { jobId, index: sel }))}
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
              {prevNext([t.previous, t.next])}
              <Button
                variant="secondary"
                icon="remove"
                disabled={busy || sel === null || keys.length < 2}
                onClick={() => void removePhoto()}
              >
                {t.remove}
              </Button>
              <Button
                variant="secondary"
                icon="undo"
                disabled={busy || (!job?.sizes && !job?.spots)}
                onClick={() => void change({ type: 'setSizes', sizes: null })}
              >
                {t.automatic}
              </Button>
              <Button
                variant="secondary"
                icon="photos"
                onClick={() => go(push('addsource', { jobId, kind: 'photos' }))}
              >
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
                onClick={() =>
                  void change({ type: 'setDocScale', ...docPage(where.placement), scale: pageScale - 0.05 })
                }
              >
                {t.smaller}
              </Button>
              <Button
                variant="secondary"
                icon="plus"
                disabled={busy || pageScale >= 1}
                onClick={() =>
                  void change({ type: 'setDocScale', ...docPage(where.placement), scale: pageScale + 0.05 })
                }
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
                  onClick={() => go(push('cropphoto', { jobId, index: where.placement.itemIndex }))}
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
                onClick={() => go(push('addsource', { jobId, kind: 'documents' }))}
              >
                {en.add.files}
              </Button>
            </>
          )}
          {kind === 'passport' && passport && (
            <>
              <Button
                variant="secondary"
                icon="minus"
                disabled={busy || !passportCan(-1)}
                onClick={() => passportBy(-1)}
              >
                {t.smaller}
              </Button>
              <Button variant="secondary" icon="plus" disabled={busy || !passportCan(1)} onClick={() => passportBy(1)}>
                {t.bigger}
              </Button>
              <Button
                variant="secondary"
                icon="passport"
                onClick={() => go(push('passportcrop', { jobId, from: 'change' }))}
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
              <Button variant="secondary" icon="photos" onClick={() => go(push('passportsize', { jobId }))}>
                {en.passport.size}
              </Button>
              <Button variant="secondary" icon="crop" onClick={() => go(push('passportborder', { jobId }))}>
                {en.passport.border}
              </Button>
              <Button variant="secondary" icon="files" onClick={() => go(push('passportcount', { jobId }))}>
                {t.howMany}
              </Button>
            </>
          )}
          {kind === 'cards' &&
            job?.idCard &&
            job.idCard.size !== 'sets' &&
            job.idCard.size !== 'page' &&
            sel !== null && (
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
                  disabled={busy || cardScale >= 2 - 1e-9}
                  onClick={() => void change({ type: 'setIdCardScale', scale: cardScale + 0.1 })}
                >
                  {t.bigger}
                </Button>
                <Button
                  variant="secondary"
                  icon="turn"
                  disabled={busy}
                  onClick={() => void change({ type: 'turnIdCard', at: sel })}
                >
                  {t.turn}
                </Button>
                <Button variant="secondary" icon="crop" onClick={() => go(push('fixcorners', { jobId, at: sel }))}>
                  {en.cards.fix}
                </Button>
                {job.idCard.cards.length > 1 && (
                  <Button
                    variant="secondary"
                    icon="undo"
                    disabled={busy}
                    onClick={() => void change({ type: 'swapIdCards' })}
                  >
                    {en.cards.swap}
                  </Button>
                )}
                {prevNext([t.previousCard, t.nextCard])}
              </>
            )}
        </div>
      </div>
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}
