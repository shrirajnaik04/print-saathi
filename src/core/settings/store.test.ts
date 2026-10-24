import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { createSettingsStore } from './store';

function fakeEngine(stored: object | null = null, saveOk = true) {
  let saved: object | null = stored;
  return {
    get saved() {
      return saved;
    },
    async getSettings() {
      return { settings: saved };
    },
    async saveSettings({ settings }: { settings: object }) {
      if (saveOk) saved = settings;
      return { saved: saveOk };
    },
  };
}

describe('settings store', () => {
  it('reads the saved settings, normalised; nothing saved means the defaults', async () => {
    expect(await createSettingsStore(fakeEngine()).load()).toEqual(DEFAULT_SETTINGS);
    const s = await createSettingsStore(fakeEngine({ retention: '7d', shopName: 'Star' })).load();
    expect(s.retention).toBe('7d');
    expect(s.shopName).toBe('Star');
  });

  it('a change is saved normalised and told to every screen listening', async () => {
    const e = fakeEngine();
    const store = createSettingsStore(e);
    const heard: string[] = [];
    store.listen((s) => heard.push(s.retention));
    expect(await store.update((s) => ({ ...s, retention: '1h' }))).toBe(true);
    expect((e.saved as { retention: string }).retention).toBe('1h');
    expect(store.current().retention).toBe('1h');
    expect(heard).toEqual(['1d', '1h']); // the first read, then the change
  });

  it('a change that cannot be saved is not shown as made', async () => {
    const store = createSettingsStore(fakeEngine(null, false));
    await store.load();
    expect(await store.update((s) => ({ ...s, retention: '7d' }))).toBe(false);
    expect(store.current().retention).toBe('1d');
  });
});

describe('settings store safety (Phase 10b review I5)', () => {
  it("a change made before the settings were read waits for them and keeps the owner's other choices", async () => {
    const e = fakeEngine({
      retention: '7d',
      shopName: 'Star',
      passport: { preset: '35x45', count: 5, prices: { 8: 80 } },
    });
    const store = createSettingsStore(e);
    expect(await store.update((s) => ({ ...s, photoPaperReminder: false }))).toBe(true);
    expect(e.saved).toMatchObject({ retention: '7d', shopName: 'Star', photoPaperReminder: false });
  });

  it('when the settings cannot be read, nothing is saved over them', async () => {
    let saves = 0;
    const store = createSettingsStore({
      getSettings: async () => {
        throw new Error('unreadable');
      },
      saveSettings: async () => {
        saves++;
        return { saved: true };
      },
    });
    expect(await store.update((s) => ({ ...s, retention: '1h' }))).toBe(false);
    expect(saves).toBe(0);
  });

  it('fields this version does not know are kept', async () => {
    const e = fakeEngine({ retention: '7d', futureField: { a: 1 } });
    const store = createSettingsStore(e);
    await store.update((s) => ({ ...s, retention: '1h' }));
    expect(e.saved).toMatchObject({ retention: '1h', futureField: { a: 1 } });
  });

  it('two changes at once both stay', async () => {
    const e = fakeEngine();
    const store = createSettingsStore(e);
    await Promise.all([
      store.update((s) => ({ ...s, retention: '7d' })),
      store.update((s) => ({ ...s, shopName: 'Star' })),
    ]);
    expect(e.saved).toMatchObject({ retention: '7d', shopName: 'Star' });
  });
});
