import { useEffect, useMemo } from 'preact/hooks';
import { hasPageColours, type JobLayout } from '../../core/job/job';
import type { PrintPlan } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { PaperPreview } from '../../ui/PaperPreview';
import { Stepper } from '../../ui/Stepper';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';
import { LAYOUT_NAME } from './Change';

const t = en.change;

/** Page 1 of [plan], small, from the same geometry the print file uses. */
function MiniPage({ plan, srcOf }: { plan: PrintPlan; srcOf: (i: number, pdfPage?: number) => string | undefined }) {
  const p = plan.pages[0];
  if (!p) return null;
  const wide = p.orientation === 'landscape';
  return (
    <PaperPreview
      mini
      wPt={wide ? plan.paper.hPt : plan.paper.wPt}
      hPt={wide ? plan.paper.wPt : plan.paper.hPt}
      placements={p.placements}
      srcOf={srcOf}
      label=""
      grey={plan.colour === 'bw'}
    />
  );
}

const pagesText = (n: number) => (n === 1 ? t.onePage : fill(t.nPages, { n }));

function Frame({
  go,
  title,
  children,
  failed,
  retry,
  saveFailed,
}: ScreenProps & {
  title: string;
  children: preact.ComponentChildren;
  failed: boolean;
  retry: () => void;
  saveFailed?: boolean;
}) {
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={t.saveFailed} />}
      {children}
    </main>
  );
}

/** Layout (PLAN §I-7): how the photos go on the paper, each choice shown as its real first page. */
export function Layout({ go, params }: ScreenProps) {
  const paper = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  // One plan per choice, made once per job change (re-review #7: slow phones redraw often).
  const plans = useMemo(
    () =>
      new Map(
        job && paper.ready(job)
          ? (['allOnOne', 'morePages', 'onePerPage'] as const).map((l) => [
              l,
              paper.draw({ ...job, layout: l }, aspects),
            ])
          : [],
      ),
    [job, aspects, paper.key],
  );
  if (gone) return <JobGone go={go} title={t.layout} />;
  const choose = async (layout: JobLayout) => {
    if (busy) return;
    if (job?.layout === layout || (await change({ type: 'setLayout', layout }))) go({ type: 'backTo', name: 'ready' });
  };
  return (
    <Frame go={go} title={t.layout} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.layoutTitle}</h2>
      {job && (
        <div class="stack rise">
          {(['allOnOne', 'morePages', 'onePerPage'] as const).map((layout) => {
            const plan = plans.get(layout) as PrintPlan;
            return (
              <ChoiceCard
                key={layout}
                title={LAYOUT_NAME[layout]}
                helper={pagesText(plan.pages.length)}
                selected={job.layout === layout}
                preview={<MiniPage plan={plan} srcOf={srcOf} />}
                onClick={() => void choose(layout)}
                disabled={busy}
              />
            );
          })}
        </div>
      )}
    </Frame>
  );
}

/** Pages (PLAN §J2): Best, or exactly 1, 2, 3 … pages, each shown as its real first page. */
export function Pages({ go, params }: ScreenProps) {
  const paper = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.pages} />;
  const choose = async (pages: 'best' | number) => {
    if (busy) return;
    if (job?.layout !== 'morePages' && !(await change({ type: 'setLayout', layout: 'morePages' }))) return;
    if (job?.pages === pages && job.layout === 'morePages') return go({ type: 'backTo', name: 'ready' });
    if (await change({ type: 'setPages', pages })) go({ type: 'backTo', name: 'ready' });
  };
  const plans = useMemo(() => {
    if (!job || !paper.ready(job)) return new Map<'best' | number, PrintPlan>();
    const photoCount = paper.draw({ ...job, layout: 'onePerPage' }, aspects).pages.length;
    const choices: ('best' | number)[] = ['best', ...Array.from({ length: Math.min(photoCount, 12) }, (_, i) => i + 1)];
    return new Map(choices.map((pages) => [pages, paper.draw({ ...job, layout: 'morePages', pages }, aspects)]));
  }, [job, aspects, paper.key]);
  return (
    <Frame go={go} title={t.pages} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.pagesTitle}</h2>
      {job && (
        <div class="stack rise">
          {[...plans.entries()].map(([pages, plan]) => {
            return (
              <ChoiceCard
                key={String(pages)}
                title={pages === 'best' ? t.best : pagesText(pages)}
                helper={pages === 'best' ? `${t.bestHelper} · ${pagesText(plan.pages.length)}` : undefined}
                selected={job.layout === 'morePages' && job.pages === pages}
                preview={<MiniPage plan={plan} srcOf={srcOf} />}
                onClick={() => void choose(pages)}
                disabled={busy}
              />
            );
          })}
        </div>
      )}
    </Frame>
  );
}

/** Copies (PLAN §I-7): big − / + (1 to 99); copies are built into the print file, collated. */
export function Copies({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.copies} />;
  return (
    <Frame go={go} title={t.copies} failed={failed} retry={retry} saveFailed={saveFailed}>
      {job && (
        <Stepper
          label={t.copiesTitle}
          fewerLabel={t.fewerCopies}
          moreLabel={t.moreCopies}
          value={job.copies}
          min={1}
          max={99}
          disabled={busy}
          onChange={(copies) => void change({ type: 'setCopies', copies })}
        />
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {t.done}
        </Button>
      </ActionBar>
    </Frame>
  );
}

/** Colour (PLAN §I-7): Colour or Black & white, each shown as its real first page. B&W prints grey data only. */
export function Colour({ go, params }: ScreenProps) {
  const paper = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const plans = useMemo(
    () =>
      new Map(
        job && paper.ready(job)
          ? (['colour', 'bw'] as const).map((colour) => [
              colour,
              paper.draw({ ...job, colour, pageColour: undefined }, aspects),
            ])
          : [],
      ),
    [job, aspects, paper.key],
  );
  if (gone) return <JobGone go={go} title={t.colour} />;
  const choose = async (colour: 'colour' | 'bw') => {
    if (busy) return;
    if ((job?.colour === colour && !(job && hasPageColours(job))) || (await change({ type: 'setColour', colour })))
      go({ type: 'backTo', name: 'ready' });
  };
  return (
    <Frame go={go} title={t.colour} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.colourTitle}</h2>
      {job && (
        <div class="stack rise">
          {[...plans.entries()].map(([colour, plan]) => (
            <ChoiceCard
              key={colour}
              title={colour === 'bw' ? en.ready.bw : en.ready.colour}
              selected={!hasPageColours(job) && job.colour === colour}
              preview={<MiniPage plan={plan} srcOf={srcOf} />}
              onClick={() => void choose(colour)}
              disabled={busy}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/** Paper (PLAN §K3, §I-7): A4, or the shop printer's 4×6 photo paper once its test page has printed. */
export function PaperChoice({ go, params }: ScreenProps) {
  const sheet = usePlanPaper();
  const photoPaper = sheet.photoPaper;
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const plans = useMemo(
    () =>
      new Map(
        job && photoPaper !== undefined
          ? (photoPaper ? (['A4', 'PHOTO_4x6'] as const) : (['A4'] as const)).map((paper) => [
              paper,
              sheet.draw({ ...job, paper }, aspects),
            ])
          : [],
      ),
    [job, aspects, sheet.key],
  );
  if (gone) return <JobGone go={go} title={t.paper} />;
  const choose = async (paper: 'A4' | 'PHOTO_4x6') => {
    if (busy) return;
    if (job?.paper === paper || (await change({ type: 'setPaper', paper }))) go({ type: 'backTo', name: 'ready' });
  };
  return (
    <Frame go={go} title={t.paper} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.paperTitle}</h2>
      {photoPaper === null && <Panel kind="info" title={t.paperNotSetUp} />}
      {job && (
        <div class="stack rise">
          {[...plans.entries()].map(([paper, plan]) => (
            <ChoiceCard
              key={paper}
              title={paper === 'A4' ? t.paperA4 : t.paperPhoto}
              helper={paper === 'A4' ? undefined : t.paperPhotoHelp}
              selected={(job.paper === 'PHOTO_4x6' && photoPaper ? 'PHOTO_4x6' : 'A4') === paper}
              preview={<MiniPage plan={plan} srcOf={srcOf} />}
              onClick={() => void choose(paper)}
              disabled={busy}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/**
 * Paper direction (owner, 2026-10-23): Portrait (standing up) or Landscape (lying sideways), each with its picture. The
 * app never turns the paper by itself: every job is Portrait until Landscape is chosen here (spec Part 4).
 */
export function Direction({ go, params }: ScreenProps) {
  const paper = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  // A document's pictures show its own first page (review, 2026-10-24: the PDF's cards were empty).
  const docs = useDocs(jobId, job?.layout === 'document' ? job : null);
  const plans = useMemo(
    () =>
      new Map(
        job && paper.ready(job)
          ? (['portrait', 'landscape'] as const).map((direction) => [
              direction,
              paper.draw({ ...job, direction }, aspects, docs.facts),
            ])
          : [],
      ),
    [job, aspects, paper.key, docs.facts],
  );
  const first = plans.get('portrait')?.pages[0]?.placements[0];
  useEffect(() => {
    if (first?.pdfPage !== undefined) docs.want([{ item: first.itemIndex, page: first.pdfPage }]);
  }, [first?.itemIndex, first?.pdfPage]);
  const pageSrc = (item: number, pdfPage?: number) =>
    pdfPage !== undefined ? docs.srcOfPage(item, pdfPage) : srcOf(item);
  if (gone) return <JobGone go={go} title={t.direction} />;
  const choose = async (direction: 'portrait' | 'landscape') => {
    if (busy) return;
    if (job?.direction === direction || (await change({ type: 'setDirection', direction })))
      go({ type: 'backTo', name: 'ready' });
  };
  const now = job?.direction ?? 'portrait';
  return (
    <Frame go={go} title={t.direction} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.directionTitle}</h2>
      {job && (
        <div class="stack rise">
          {[...plans.entries()].map(([direction, plan]) => (
            <ChoiceCard
              key={direction}
              title={direction === 'portrait' ? t.portrait : t.landscape}
              helper={direction === 'portrait' ? t.portraitHelp : t.landscapeHelp}
              selected={now === direction}
              preview={<MiniPage plan={plan} srcOf={pageSrc} />}
              onClick={() => void choose(direction)}
              disabled={busy}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}

/**
 * Print quality (owner, 2026-10-23, "delayed print when printing photos"): Normal sends the photos as a document (the
 * printer's normal-speed mode; the photos keep all their detail); Best photo quality lets the printer use its slower
 * photo mode.
 */
export function Quality({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.quality} />;
  const choose = async (quality: 'normal' | 'photo') => {
    if (busy) return;
    const now = job?.quality === 'photo' ? 'photo' : 'normal';
    if (now === quality || (await change({ type: 'setQuality', quality }))) go({ type: 'backTo', name: 'ready' });
  };
  return (
    <Frame go={go} title={t.quality} failed={failed} retry={retry} saveFailed={saveFailed}>
      <h2>{t.qualityTitle}</h2>
      {job && (
        <div class="stack rise">
          <ChoiceCard
            title={t.qualityNormal}
            helper={t.qualityNormalHelp}
            selected={job.quality !== 'photo'}
            onClick={() => void choose('normal')}
            disabled={busy}
          />
          <ChoiceCard
            title={t.qualityPhoto}
            helper={t.qualityPhotoHelp}
            selected={job.quality === 'photo'}
            onClick={() => void choose('photo')}
            disabled={busy}
          />
        </div>
      )}
    </Frame>
  );
}
