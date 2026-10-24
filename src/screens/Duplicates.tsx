import { useState } from 'preact/hooks';
import type { Job } from '../core/job/job';
import { en } from '../i18n/en';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { saveJobChange } from './received/Received';

const t = en.received;

/**
 * The same photo sent twice (PLAN §D2b, §J8): Keep both (default) or Remove extra copy. On Received, and on Ready for
 * document and mixed jobs, which skip Received. "Keep both" lasts for this visit of the screen.
 */
export function Duplicates({ job, onChange }: { job: Job; onChange: (j: Job) => void }) {
  const [kept, setKept] = useState<Set<string>>(new Set());
  const number = (ix: number) => job.items.findIndex((i) => i.index === ix) + 1;
  return (
    <>
      {job.duplicates
        .filter((g) => !kept.has(g.join('-')))
        .map((group) => (
          <Panel key={group.join('-')} kind="info" title={`${t.sameTwice} ${group.map(number).join(' and ')}`}>
            <Button variant="secondary" onClick={() => setKept(new Set([...kept, group.join('-')]))}>
              {t.keepBoth}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                let j = job;
                for (const extra of group.slice(1)) j = await saveJobChange(j, { type: 'removeItem', index: extra });
                onChange(j);
              }}
            >
              {t.removeExtra}
            </Button>
          </Panel>
        ))}
    </>
  );
}
