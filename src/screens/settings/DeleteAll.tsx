import { useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.deleteAll;

/**
 * Delete all customer files now (PLAN §E, §I-15). Destructive, so it is its own screen with a plain question and
 * Cancel (PLAN §H2.8). A job being printed and shares still arriving are kept until they finish (native).
 */
export function DeleteAll({ go, params }: ScreenProps) {
  // Opened from "Phone storage is full": the jobs on screen (the one being prepared) are kept (PLAN §J8).
  const old = params?.keepOpen === true;
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'failed'>('ask');
  const [kept, setKept] = useState(0);

  const remove = async () => {
    setState('busy');
    try {
      const r = await PrintEngine.deleteAllJobs(old ? { keepOpen: true } : undefined);
      setKept(r.kept ?? 0);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <main class="screen">
      <TopBar
        title={old ? t.oldTitle : t.title}
        onBack={() => go({ type: 'back' })}
        onHome={() => go({ type: 'home' })}
      />
      {state === 'done' ? (
        <>
          <Panel kind="info" title={old ? t.oldDone : kept > 0 ? t.doneKept : t.done} />
          <ActionBar>
            <Button icon="check" onClick={() => go({ type: 'back' })}>
              {en.result.done}
            </Button>
          </ActionBar>
        </>
      ) : (
        <>
          <p>{old ? t.oldBody : t.body}</p>
          {state === 'failed' && <Panel kind="error" title={t.failed} />}
          <ActionBar>
            <Button variant="danger" onClick={() => void remove()} busy={state === 'busy'} busyLabel={t.deleting}>
              {old ? t.oldConfirm : t.confirm}
            </Button>
            <Button variant="secondary" onClick={() => go({ type: 'back' })}>
              {t.cancel}
            </Button>
          </ActionBar>
        </>
      )}
    </main>
  );
}
