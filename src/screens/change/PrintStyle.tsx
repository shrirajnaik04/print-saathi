import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { BW_STYLES, COLOUR_STYLES, type StyleId, styleOf } from '../../core/job/job';
import { en } from '../../i18n/en';
import { passwords } from '../../native/passwords';
import { PrintEngine } from '../../native/printEngine';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useDocs } from '../useDocs';
import { useJob } from '../useJob';
import { usePlanPaper } from '../usePlanPaper';

const s = en.style;

/**
 * Print style (PLAN §I-7, §J7): six big examples made by the real print code from the job's first photo or page, in
 * two groups (Colour, Black & white). The style applies to the whole job; a tap chooses it and goes back to Ready.
 */
export function PrintStyle({ go, params }: ScreenProps) {
  const paper = usePlanPaper();
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const docs = useDocs(jobId, job?.layout === 'document' ? job : null);
  // The first photo or page the print starts with.
  const first = useMemo(() => {
    if (!job || !paper.ready(job) || (job.layout === 'document' && docs.items === null)) return null;
    const p = paper.draw(job, aspects, docs.facts).pages[0]?.placements[0];
    return p ? { item: p.itemIndex, page: p.pdfPage, crop: p.crop, turns: p.turns } : null;
  }, [job, aspects, docs.items, docs.facts, paper.key]);
  const [samples, setSamples] = useState<Map<StyleId, string> | null>(null);
  useEffect(() => {
    if (!first) return;
    setSamples(null); // a different first photo or turn: "Making the examples…" again
    let live = true;
    void PrintEngine.styleSamples({
      jobId,
      item: first.item,
      page: first.page,
      password: passwords.forJob(jobId)[first.item],
      cropX: first.crop.x,
      cropY: first.crop.y,
      cropW: first.crop.w,
      cropH: first.crop.h,
      turns: first.turns,
    })
      .then(
        (r) => r.samples,
        () => [],
      )
      .then((list) => {
        if (!live) return;
        const m = new Map<StyleId, string>();
        for (const x of list)
          if (x.path) m.set(x.style, x.path.startsWith('data:') ? x.path : Capacitor.convertFileSrc(x.path));
        setSamples(m);
      });
    return () => {
      live = false;
    };
  }, [first?.item, first?.page, first?.turns, first?.crop.x, first?.crop.y, first?.crop.w, first?.crop.h]);
  if (gone) return <JobGone go={go} title={s.title} />;
  const current = job ? styleOf(job) : null;
  const choose = async (style: StyleId) => {
    if (busy) return;
    if (current === style || (await change({ type: 'setStyle', style }))) go({ type: 'backTo', name: 'ready' });
  };
  const group = (title: string, ids: readonly StyleId[]) => (
    <section class="stack" aria-label={title}>
      <h2>{title}</h2>
      {ids.map((id) => (
        <ChoiceCard
          key={id}
          title={s.names[id]}
          helper={s.helpers[id]}
          selected={current === id}
          preview={
            samples?.get(id) ? (
              // Turned like the print; a square frame keeps a turned example inside its card.
              <span class="style-frame">
                <img class={`style-sample turn-${first?.turns ?? 0}`} src={samples.get(id)} alt="" />
              </span>
            ) : (
              <span class="page-blank" />
            )
          }
          onClick={() => void choose(id)}
          disabled={busy || !job}
          wide
        />
      ))}
    </section>
  );
  return (
    <main class="screen">
      <TopBar title={s.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      {first && !samples && <p class="muted">{s.making}</p>}
      {samples && samples.size === 0 && <Panel kind="info" title={s.noSamples} />}
      {group(s.colourGroup, COLOUR_STYLES)}
      {group(s.bwGroup, BW_STYLES)}
    </main>
  );
}
