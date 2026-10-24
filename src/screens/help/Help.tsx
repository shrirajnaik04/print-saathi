import { en } from '../../i18n/en';
import { Button } from '../../ui/Button';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.help;

/** Help (PLAN §I-16): how to share from WhatsApp, pinning, the printer rule. */
export function Help({ go }: ScreenProps) {
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <h2>{t.shareTitle}</h2>
      <ol>
        {t.shareSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h2>{t.pinTitle}</h2>
      <p>{t.pinBody}</p>
      <h2>{t.setupTitle}</h2>
      <ol>
        {t.setupSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button
        variant="secondary"
        icon="print"
        onClick={() => go({ type: 'push', screen: { name: 'testpage', params: {} } })}
      >
        {t.testPage}
      </Button>
      <h2>{t.printerTitle}</h2>
      <p>{t.printerBody}</p>
      <h2>{t.serviceTitle}</h2>
      <ol>
        {t.serviceSteps.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <h2>{t.whatsappTitle}</h2>
      <p>{t.whatsappBody}</p>
    </main>
  );
}
