import { useEffect, useRef, useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';
import { settingsStore, useSettings } from '../useSettings';

const t = en.settings;

/** Shop name (PLAN §I-15): shown on problem reports and test pages only. */
export function ShopName({ go }: ScreenProps) {
  const { settings, ready } = useSettings();
  const [name, setName] = useState(settings.shopName);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Filled in once the saved settings are read, unless the owner already typed (never overwrite typing).
  const touched = useRef(false);
  useEffect(() => {
    if (ready && !touched.current) setName(settings.shopName);
  }, [ready]);
  const save = async () => {
    setBusy(true);
    const saved = await settingsStore.update((s) => ({ ...s, shopName: name }));
    setBusy(false);
    if (saved) go({ type: 'back' });
    else setFailed(true);
  };
  return (
    <main class="screen">
      <TopBar title={t.shop} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <label class="field">
        <span>{t.shop}</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          autoComplete="off"
          onInput={(e) => {
            touched.current = true;
            setName((e.target as HTMLInputElement).value);
          }}
        />
      </label>
      <p class="muted">{t.shopHelp}</p>
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void save()}>
          {t.save}
        </Button>
      </ActionBar>
    </main>
  );
}
