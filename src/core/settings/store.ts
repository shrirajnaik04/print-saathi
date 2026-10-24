import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';

type Engine = {
  getSettings(): Promise<{ settings: object | null }>;
  saveSettings(o: { settings: object }): Promise<{ saved: boolean }>;
};

/**
 * The settings as the phone holds them, with the screens that show them told of every saved change. A change waits
 * for the settings to be read and never saves over them when they could not be read; changes run one at a time;
 * fields a newer version wrote are kept (Phase 10b review I5).
 */
export function createSettingsStore(engine: Engine) {
  let now: Settings = DEFAULT_SETTINGS;
  /** The file as read: unknown fields are written back unchanged. */
  let raw: Record<string, unknown> = {};
  let reading: Promise<boolean> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(s: Settings) => void>();
  const tell = () => {
    for (const l of listeners) l(now);
  };

  const read = async (): Promise<boolean> => {
    try {
      const { settings } = await engine.getSettings();
      raw = settings && typeof settings === 'object' ? { ...(settings as Record<string, unknown>) } : {};
      now = normalizeSettings(settings);
      tell();
      return true;
    } catch {
      return false;
    }
  };
  /** Read once; a failed read is tried again next time. */
  const ensureRead = async (): Promise<boolean> => {
    reading ??= read();
    const ok = await reading;
    if (!ok) reading = null;
    return ok;
  };

  return {
    current: () => now,
    async load(): Promise<Settings> {
      await ensureRead();
      return now;
    },
    /** Saves [change] of the current settings; false (and nothing shown as changed) when it could not be saved. */
    update(change: (s: Settings) => Settings): Promise<boolean> {
      const run = queue.then(async () => {
        if (!(await ensureRead())) return false;
        const next = normalizeSettings(change(now));
        const file = { ...raw, ...next };
        const { saved } = await engine.saveSettings({ settings: file }).catch(() => ({ saved: false }));
        if (!saved) return false;
        raw = file;
        now = next;
        tell();
        return true;
      });
      queue = run.catch(() => false);
      return run;
    },
    listen(l: (s: Settings) => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
