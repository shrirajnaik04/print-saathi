import { useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import { push, type ScreenProps } from '../types';
import { takeAddedChoice, useAddNotice } from '../useAddNotice';
import { useJob } from '../useJob';
import { forgetRemoved, rememberRemoved, removedFor } from './undo';

const t = en.photos;

/**
 * Photos (PLAN §I-8): every photo in print order, numbered and shown the way it will print (turned); tap one for
 * Photo tools. A photo just removed can be brought back with Undo, at the place it had.
 */
export function Photos({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, srcOf, gone, failed, retry, change, saveFailed } = useJob(jobId);
  const [undo, setUndo] = useState(() => removedFor(jobId));
  const added = useAddNotice(jobId);
  // Added here, not on Adjust: a later Adjust opens on the photo tapped, not on the first one added (review).
  useState(() => takeAddedChoice(jobId));
  if (gone) return <JobGone go={go} title={t.title} />;
  const photos = job ? job.order.filter((i) => srcOf(i)) : [];
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {undo && (
        <Panel
          kind="info"
          title={t.removed}
          action={{
            label: t.undo,
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
              retry(); // the thumbnails were listed without this photo: list them again
            },
          }}
        />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {added && <Panel kind="warn" title={added} />}
      {job && photos.length === 0 && <Panel kind="warn" title={t.none} />}
      {/* More photos from the phone (owner, 2026-10-24): they join this job at its end. */}
      {job && (
        <div class="stack section-gap">
          <Button variant="secondary" icon="plus" onClick={() => go(push('addsource', { jobId, kind: 'photos' }))}>
            {en.add.photos}
          </Button>
        </div>
      )}
      {job && photos.length > 0 && (
        <>
          <p>{t.hint}</p>
          <ul class="thumb-grid">
            {photos.map((index, n) => (
              <li key={index} class="thumb">
                <button
                  type="button"
                  class="thumb-button"
                  aria-label={fill(t.tools, { n: n + 1 })}
                  onClick={() => go(push('phototools', { jobId, index }))}
                >
                  <img src={srcOf(index)} alt="" class={`turn-${job.turns[index] ?? 0}`} />
                </button>
                <span class="thumb-number" aria-hidden="true">
                  {n + 1}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'back' })}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Photo tools (PLAN §I-8): Turn, Move earlier, Move later, Remove (with Undo on the Photos screen). */
export function PhotoTools({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const index = Number(params?.index ?? 0);
  const { job, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.title} />;
  // The photos the Photos screen shows: moves pass over anything else (gate review #5).
  const shown = job ? job.order.filter((i) => srcOf(i)) : [];
  const at = shown.indexOf(index);
  const count = shown.length;
  const title = fill(t.tools, { n: Math.max(1, at + 1) });
  const item = job?.items.find((i) => i.index === index);
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {job && item && (
        <>
          <div class="thumb tool-preview">
            <img src={srcOf(index)} alt="" class={`turn-${job.turns[index] ?? 0}`} />
          </div>
          <div class="stack">
            {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
            <Button
              variant="secondary"
              icon="turn"
              disabled={busy}
              onClick={() => void change({ type: 'turnItem', index })}
            >
              {t.turn}
            </Button>
            <Button variant="secondary" icon="crop" onClick={() => go(push('cropphoto', { jobId, index }))}>
              {t.crop}
              {job.crops?.[index] ? ` · ${t.cropped}` : ''}
            </Button>
            <Button
              variant="secondary"
              icon="earlier"
              disabled={busy || at <= 0}
              onClick={() => void change({ type: 'moveItem', index, by: -1, among: shown })}
            >
              {t.earlier}
            </Button>
            <Button
              variant="secondary"
              icon="later"
              disabled={busy || at < 0 || at >= count - 1}
              onClick={() => void change({ type: 'moveItem', index, by: 1, among: shown })}
            >
              {t.later}
            </Button>
            <Button
              variant="secondary"
              icon="remove"
              disabled={busy}
              onClick={async () => {
                const place = job.order.indexOf(index);
                const pages = job.pages;
                const size = job.sizes?.[index];
                const spot = job.spots?.[index];
                if (!(await change({ type: 'removeItem', index }))) return;
                rememberRemoved(jobId, item, place, pages, size, spot);
                go({ type: 'back' });
              }}
            >
              {t.remove}
            </Button>
          </div>
        </>
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'back' })}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}
