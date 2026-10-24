import type { Job } from '../../core/job/job';
import { styleOf } from '../../core/job/job';
import { allDocPages, paperOf } from '../../core/plan/plan';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChangeRow } from '../../ui/ChangeRow';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { passportRows } from '../passport/rows';
import { push, type ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';

const t = en.change;

export const LAYOUT_NAME = {
  onePerPage: en.received.onePerPage,
  allOnOne: en.received.allOnOne,
  morePages: en.received.morePages,
} as const;

/**
 * Change (PLAN §I-6): every choice that shapes the print, each with its current value, each opening one decision.
 * Only rows that work today are shown (paper, colour and print style arrive in later phases).
 */
/** The paper direction as Change shows it: Portrait unless Landscape was chosen (spec Part 4). */
function directionValue(job: Job): string {
  return job.direction === 'landscape' ? t.landscape : t.portrait;
}

export function Change({ go, params }: ScreenProps) {
  const sheet = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, gone, failed, retry } = useJob(jobId);
  const docs = useDocs(jobId, job?.layout === 'document' ? job : null);
  if (gone) return <JobGone go={go} title={t.title} />;
  const plan = job && sheet.ready(job) ? sheet.draw(job, aspects) : null;
  const docTotal = job ? allDocPages(job, aspects, docs.facts).length : 0;
  const photos = plan ? new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex))).size : 0;
  const pagesValue = () => {
    const n = plan?.pages.length ?? 0;
    const count = n === 1 ? t.onePage : fill(t.nPages, { n });
    return job?.pages === 'best' ? fill(t.bestPages, { n: count }) : count;
  };
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {job?.layout === 'passport' && job.passport && (
        <div class="stack">
          {passportRows(jobId, job.passport).map((r) => (
            <ChangeRow key={r.label} label={r.label} value={r.value} onClick={() => go(r.to)} />
          ))}
          <ChangeRow label={t.direction} value={directionValue(job)} onClick={() => go(push('direction', { jobId }))} />
          <ChangeRow
            label={t.colour}
            value={job.colour === 'bw' ? en.ready.bw : en.ready.colour}
            onClick={() => go(push('colour', { jobId }))}
          />
        </div>
      )}
      {job?.layout === 'document' && (
        <div class="stack">
          {docs.anyLocked ? (
            <Panel kind="warn" title={en.docs.unlockFirst} />
          ) : (
            <>
              <ChangeRow
                label={en.docs.pagesToPrint}
                value={
                  !job.docPages
                    ? en.docs.allPages
                    : docs.items
                      ? fill(en.docs.pagesValue, { n: job.docPages.length, total: docTotal })
                      : fill(t.nPages, { n: job.docPages.length })
                }
                onClick={() => go(push('docpages', { jobId }))}
              />
              <ChangeRow
                label={en.docs.pageOrder}
                value={en.docs.pageOrderValue}
                onClick={() => go(push('docorder', { jobId }))}
              />
            </>
          )}
          <ChangeRow label={t.direction} value={directionValue(job)} onClick={() => go(push('direction', { jobId }))} />
          <ChangeRow
            label={t.colour}
            value={job.colour === 'bw' ? en.ready.bw : en.ready.colour}
            onClick={() => go(push('colour', { jobId }))}
          />
          <ChangeRow
            label={en.style.row}
            value={en.style.names[styleOf(job)]}
            onClick={() => go(push('printstyle', { jobId }))}
          />
          <ChangeRow
            label={t.copies}
            value={job.copies === 1 ? t.copy : fill(t.nCopies, { n: job.copies })}
            onClick={() => go(push('copies', { jobId }))}
          />
        </div>
      )}
      {job?.layout === 'idCard' && job.idCard && (
        <div class="stack">
          <ChangeRow
            label={en.cards.sizeRow}
            value={en.cards.sizeNames[job.idCard.size]}
            onClick={() => go(push('cardsize', { jobId, from: 'change' }))}
          />
          <ChangeRow
            label={en.cards.title}
            value={job.idCard.cards.length === 2 ? en.cards.found2 : en.cards.found1}
            onClick={() => go(push('cards', { jobId }))}
          />
          <ChangeRow
            label={t.colour}
            value={job.colour === 'bw' ? en.ready.bw : en.ready.colour}
            onClick={() => go(push('colour', { jobId }))}
          />
          <ChangeRow
            label={t.copies}
            value={job.copies === 1 ? t.copy : fill(t.nCopies, { n: job.copies })}
            onClick={() => go(push('copies', { jobId }))}
          />
        </div>
      )}
      {job && job.layout !== 'passport' && job.layout !== 'document' && job.layout !== 'idCard' && (
        <div class="stack">
          <ChangeRow
            label={t.paper}
            value={
              // What it really prints on (gate review I6): 4×6 chosen but not set up for this printer prints on A4.
              job.paper !== 'PHOTO_4x6' ? t.paperA4 : sheet.photoPaper === null ? t.paperA4NotSetUp : t.paperPhoto
            }
            onClick={() => go(push('paperchoice', { jobId }))}
          />
          <ChangeRow label={t.direction} value={directionValue(job)} onClick={() => go(push('direction', { jobId }))} />
          {/* On 4×6 photo paper the job always goes as a document (the print service would enlarge a photo): the
              choice could change nothing there, so it is not offered (review, 2026-10-24). */}
          {paperOf(job, sheet.photoPaper) !== 'PHOTO_4x6' && (
            <ChangeRow
              label={t.quality}
              value={job.quality === 'photo' ? t.qualityPhoto : t.qualityNormal}
              onClick={() => go(push('quality', { jobId }))}
            />
          )}
          <ChangeRow
            label={t.layout}
            value={LAYOUT_NAME[job.layout as keyof typeof LAYOUT_NAME] ?? en.received.onePerPage}
            onClick={() => go(push('layout', { jobId }))}
          />
          {job.layout === 'morePages' && (
            <ChangeRow label={t.pages} value={pagesValue()} onClick={() => go(push('pages', { jobId }))} />
          )}
          <ChangeRow
            label={t.colour}
            value={job.colour === 'bw' ? en.ready.bw : en.ready.colour}
            onClick={() => go(push('colour', { jobId }))}
          />
          <ChangeRow
            label={en.style.row}
            value={en.style.names[styleOf(job)]}
            onClick={() => go(push('printstyle', { jobId }))}
          />
          <ChangeRow
            label={t.copies}
            value={job.copies === 1 ? t.copy : fill(t.nCopies, { n: job.copies })}
            onClick={() => go(push('copies', { jobId }))}
          />
          <ChangeRow
            label={t.photos}
            value={photos === 1 ? t.photo : fill(t.nPhotos, { n: photos })}
            onClick={() => go(push('photos', { jobId }))}
          />
        </div>
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}
