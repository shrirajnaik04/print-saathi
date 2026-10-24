import { isStorageFull } from '../../core/intake/messages';
import { en } from '../../i18n/en';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import type { ScreenProps } from '../types';

const t = en.problem;

/** Full-screen explanation when something fails outside a job (PLAN §I-18). Always offers the way Home. */
export function Problem({ go, params }: ScreenProps) {
  // Specific lines (e.g. why a share brought no files) replace the generic text when given.
  const lines = Array.isArray(params?.lines) ? (params.lines as string[]) : null;
  return (
    <main class="screen">
      <h1>{t.title}</h1>
      {lines ? (
        lines.map((l) => <Panel key={l} kind="warn" title={l} />)
      ) : (
        <Panel kind="error" title={t.generic}>
          <p>{t.whatToDo}</p>
        </Panel>
      )}
      <ActionBar>
        <Button icon="home" onClick={() => go({ type: 'home' })}>
          {t.goHome}
        </Button>
        {lines?.some(isStorageFull) && (
          <Button
            variant="secondary"
            onClick={() => go({ type: 'replace', screen: { name: 'deleteall', params: { keepOpen: true } } })}
          >
            {en.deleteAll.makeRoom}
          </Button>
        )}
      </ActionBar>
    </main>
  );
}
