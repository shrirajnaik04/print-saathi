import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';

const t = en.edges;

/**
 * Black edges? (PLAN §I-3, §F5): asked once per job, only when black or blank edges were found. One example shows the
 * photo as it is and as it would print; nothing changes unless the shopkeeper taps Remove black edges.
 */
export function BlackEdges({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.title} />;
  const ids = Object.keys(job?.suggested ?? {}).map(Number);
  const example = ids[0];
  const crop = example !== undefined ? job?.suggested?.[example] : undefined;
  const src = example !== undefined ? srcOf(example) : undefined;
  // The cut part's own shape: the photo's (width / height) times the crop's.
  const aspect = example !== undefined ? (aspects.get(example) ?? 1) : 1;
  // White edges are looked for only in documents and screenshots (PNG): then the words say "black or white".
  const white = job?.layout === 'document' || ids.some((i) => job?.items.find((x) => x.index === i)?.type === 'png');
  const answer = async (remove: boolean) => {
    if (await change({ type: 'answerEdges', remove }))
      go({ type: 'replace', screen: { name: 'ready', params: { jobId } } });
  };
  return (
    <main class="screen">
      <TopBar
        title={white ? t.titleAny : t.title}
        onBack={() => go({ type: 'back' })}
        onHome={() => go({ type: 'home' })}
      />
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <h2>{ids.length === 1 ? (white ? t.oneAny : t.one) : fill(white ? t.manyAny : t.many, { n: ids.length })}</h2>
      {src && crop && (
        <div class="edges-example" aria-hidden="true">
          <figure>
            <img src={src} alt="" />
            <figcaption>{t.now}</figcaption>
          </figure>
          <figure>
            <span class="edges-cut" style={{ aspectRatio: `${aspect * crop.w} / ${crop.h}` }}>
              <img
                src={src}
                alt=""
                style={{
                  left: `${(-100 * crop.x) / crop.w}%`,
                  top: `${(-100 * crop.y) / crop.h}%`,
                  width: `${100 / crop.w}%`,
                  height: `${100 / crop.h}%`,
                }}
              />
            </span>
            <figcaption>{t.after}</figcaption>
          </figure>
        </div>
      )}
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void answer(true)}>
          {white ? t.removeAny : t.remove}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>
          {t.keep}
        </Button>
      </ActionBar>
    </main>
  );
}
