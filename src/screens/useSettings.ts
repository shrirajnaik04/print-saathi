import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../core/settings/settings';
import { createSettingsStore } from '../core/settings/store';
import { PrintEngine } from '../native/printEngine';

/** The app's one settings store (PLAN §I-15): loaded once, every screen showing settings follows its changes. */
export const settingsStore = createSettingsStore(PrintEngine);
/** The settings now: read from the phone once (again if that failed), then the store's own. */
export async function loadSettings(): Promise<Settings> {
  return settingsStore.load();
}

/** The current settings ([ready] once read from the phone) and their changes. */
export function useSettings(): { settings: Settings; ready: boolean } {
  const [settings, setSettings] = useState(settingsStore.current());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stop = settingsStore.listen(setSettings);
    // The store's settings now, not the first load's result: a later change must not be undone by it.
    void loadSettings().then(() => {
      setSettings(settingsStore.current());
      setReady(true);
    });
    return stop;
  }, []);
  return { settings, ready };
}

/** Settings → Space at paper edges: More keeps 3 mm more clear at every edge (every plan drawn, not only Ready). */
export function useExtraEdgeMm(): number {
  return useSettings().settings.edges === 'more' ? 3 : 0;
}
