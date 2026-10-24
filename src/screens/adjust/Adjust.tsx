import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DocPage, Job } from '../../core/job/job';
import { freezeSizes, MIN_LONG_MM } from '../../core/layout/flow';
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
import { useCardImages } from '../cards/Cards';
import { JobGone } from '../JobGone';
import { borderName, cmOf } from '../passport/names';
import { forgetRemoved, rememberRemoved, removedFor } from '../photos/undo';
import { push, type ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';
import { cmText, findItem, itemsInPlan, longMm, pageSize } from './place';

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
  const [chosen, setChosen] = useState<number | null>(first === undefined ? null : Number(first));
  // Photo sizes while a corner is being dragged (saved when the finger lifts).
  const [draft, setDraftState] = useState<Record<number, number> | null>(null);
  // The same draft for the end of a drag that the handle did not see (its finger lifted elsewhere).
  const draftNow = useRef<Record<number, number> | null>(null);
  const setDraft = (d: Record<number, number> | null) => {
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
    base: Record<number, number>;
    long: number;
    w: number;
    h: number;
    perPt: number;
  } | null>(null);
  const figure = useRef<HTMLDivElement>(null);
  const cardImage = useCardImages(jobId, kind === 'cards' ? job?.idCard?.cards : undefined, 480);
  const plan = useMemo(
    () =>
      job && paper.ready(job) && (kind !== 'passport' || paper.photoPaper !== undefined)
        ? paper.draw(draft ? { ...job, sizes: draft } : job, aspects, docs.facts)
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
    return itemsInPlan(plan).flatMap((item) => {
      const w = findItem(plan, item);
      return w ? [{ key: item, page: w.page, placement: w.placement }] : [];
    });
  }, [plan, job, kind]);
  const keys = targets.map((x) => x.key);
  const sel = chosen !== null && keys.includes(chosen) ? chosen : (keys[0] ?? null);
  const at = sel === null ? -1 : keys.indexOf(sel);
  const where = at >= 0 ? targets[at] : undefined;
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
  const resizePhoto = (factor: number) => {
    if (!job || !plan || !where || sel === null) return;
    const sizes = { ...(job.sizes ?? freezeSizes(plan)), [sel]: longMm(where.placement.box) * factor };
    void change({ type: 'setSizes', sizes });
  };
  const removePhoto = async () => {
    if (!job || sel === null) return;
    const item = job.items.find((i) => i.index === sel);
    if (!item) return;
    const place = job.order.indexOf(sel);
    const pages = job.pages;
    const size = job.sizes?.[sel];
    if (!(await change({ type: 'removeItem', index: sel }))) return;
    rememberRemoved(jobId, item, place, pages, size);
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
  // The round corner (photos): drag it out to grow the photo, in to shrink it (an extra: the buttons do the same). A
  // drag ends when its finger lifts, wherever that is, and one whose handle is gone never blocks the next (review I1).
  const finishDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const sizes = draftNow.current;
    setDraft(null);
    if (sizes) void change({ type: 'setSizes', sizes });
  };
  finishNow.current = finishDrag;
  const startDrag = (e: PointerEvent) => {
    if (drag.current && !drag.current.el.isConnected) finishDrag();
    const rect = figure.current?.querySelector('figure')?.getBoundingClientRect();
    if (!job || !plan || !where || !rect || drag.current) return;
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
      base: job.sizes ?? freezeSizes(plan),
      long: longMm(b),
      w: b.w,
      h: b.h,
      perPt: rect.width / pageSize(plan, where.page).w,
    };
  };
  const moveDrag = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || sel === null) return;
    const s = Math.max((d.w + (e.clientX - d.x) / d.perPt) / d.w, (d.h + (e.clientY - d.y) / d.perPt) / d.h);
    setDraft({ ...d.base, [sel]: Math.max(MIN_LONG_MM, d.long * s) });
  };
  const endDrag = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) finishDrag();
  };

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const page = where && plan ? (plan as PrintPlan).pages[where.page] : undefined;
  const size = where && plan ? pageSize(plan, where.page) : undefined;
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  const keyOf = (p: Placement): number | null => {
    if (kind === 'photos') return p.itemIndex;
    if (kind === 'passport') return 0;
    if (kind === 'pages') return where?.page ?? null;
    const k = job?.idCard?.cards.findIndex((c) => c.item === p.itemIndex && sameQuad(c.quad, p.quad)) ?? -1;
    return k >= 0 ? k : null;
  };
  const cardSrc = (p: Placement) => {
    const c = job?.idCard?.cards.find((x) => x.item === p.itemIndex && sameQuad(x.quad, p.quad));
    return (c && cardImage(c)) || undefined;
  };
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
            <div ref={figure} class="adjust-paper">
              <PaperPreview
                wPt={size.w}
                hPt={size.h}
                placements={page.placements}
                srcOf={(item, pdfPage) => (pdfPage !== undefined ? docs.srcOfPage(item, pdfPage) : srcOf(item))}
                {...(kind === 'cards' ? { srcOfPlacement: cardSrc } : {})}
                label={fill(en.ready.pageLabel, { n: where.page + 1, total: plan.pages.length })}
                grey={plan.colour === 'bw'}
              >
                {page.placements.map((p, i) => {
                  const k = keyOf(p);
                  const selected = k !== null && k === sel;
                  return (
                    <span
                      key={kind === 'photos' && k !== null ? `pick-${k}` : `pick-at${i}`}
                      class={`adjust-pick${selected ? ' adjust-selected' : ''}`}
                      style={{
                        left: pct(p.box.x, size.w),
                        top: pct(p.box.y, size.h),
                        width: pct(p.box.w, size.w),
                        height: pct(p.box.h, size.h),
                      }}
                      aria-hidden="true"
                      onClick={() => k !== null && setChosen(k)}
                    >
                      {kind === 'photos' && selected && p === where.placement && (
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
                onClick={() => sel !== null && void change({ type: 'turnItem', index: sel })}
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
                disabled={busy || !job?.sizes}
                onClick={() => void change({ type: 'setSizes', sizes: null })}
              >
                {t.automatic}
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
