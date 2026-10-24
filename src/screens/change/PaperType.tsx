import { en } from '../../i18n/en';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';

const t = en.paperType;

/**
 * Paper type (owner, round 4: "where is the paper type selection? normal paper / glossy paper"): which paper is in the
 * printer. Android lets no app set the printer's paper type, so glossy is a reminder only (the owner's choice): Ready
 * says to put it in and PRINT says PAPER LOADED; the job is sent the same way.
 */
export function PaperType({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.row} />;
  const choose = async (paperType: 'plain' | 'glossy') => {
    if (busy) return;
    const now = job?.paperType === 'glossy' ? 'glossy' : 'plain';
    if (now === paperType || (await change({ type: 'setPaperType', paperType }))) go({ type: 'backTo', name: 'ready' });
  };
  return (
    <main class="screen">
      <TopBar title={t.row} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <h2>{t.title}</h2>
      {job && (
        <div class="stack rise">
          <ChoiceCard
            title={t.plain}
            helper={t.plainHelp}
            selected={job.paperType !== 'glossy'}
            onClick={() => void choose('plain')}
            disabled={busy}
          />
          <ChoiceCard
            title={t.glossy}
            helper={t.glossyHelp}
            selected={job.paperType === 'glossy'}
            onClick={() => void choose('glossy')}
            disabled={busy}
          />
        </div>
      )}
    </main>
  );
}
