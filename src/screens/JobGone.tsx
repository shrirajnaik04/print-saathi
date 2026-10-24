import { en } from '../i18n/en';
import { fill } from '../i18n/fill';
import { Panel } from '../ui/Panel';
import { TopBar } from '../ui/TopBar';
import type { ScreenProps } from './types';
import { useSettings } from './useSettings';

/** Shown instead of a blank screen when a job opened from Recent or a restore was already deleted (PLAN §E). */
export function JobGone({ go, title }: Pick<ScreenProps, 'go'> & { title: string }) {
  const { settings } = useSettings();
  return (
    <main class="screen">
      <TopBar title={title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <Panel
        kind="warn"
        title={fill(en.recent.gone, { period: en.settings.retention[settings.retention] })}
        action={{ label: en.problem.goHome, onClick: () => go({ type: 'home' }) }}
      />
    </main>
  );
}
