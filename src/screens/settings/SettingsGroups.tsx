import { useEffect, useRef, useState } from 'preact/hooks';
import { customSize, MAX_PASSPORT_COUNT } from '../../core/settings/settings';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { PrintEngine } from '../../native/printEngine';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChangeRow } from '../../ui/ChangeRow';
import { Panel } from '../../ui/Panel';
import { Stepper } from '../../ui/Stepper';
import { TopBar } from '../../ui/TopBar';
import { borderName, cmOf, sizeName } from '../passport/names';
import { push, type ScreenProps } from '../types';
import { settingsStore, useSettings } from '../useSettings';

const t = en.settings;

/** Passport photos and prices (PLAN §I-15, §K4): size, how many, prices — each its own decision. */
export function PassportSettings({ go }: ScreenProps) {
  const { settings: s } = useSettings();
  const prices = Object.entries(s.passport.prices)
    .map(([n, p]) => `${n}: ₹${p}`)
    .join(' · ');
  return (
    <main class="screen">
      <TopBar title={t.passport} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <div class="rows">
        <ChangeRow
          label={t.passportSize}
          value={sizeName(
            s.passport.preset,
            s.passport.custom && { w: s.passport.custom.wMm, h: s.passport.custom.hMm },
          )}
          onClick={() => go(push('setting', { key: 'passportSize' }))}
        />
        <ChangeRow
          label={t.customSize}
          value={
            s.passport.custom
              ? sizeName('custom', { w: s.passport.custom.wMm, h: s.passport.custom.hMm })
              : t.customNone
          }
          onClick={() => go(push('passportcustom'))}
        />
        <ChangeRow
          label={t.passportBorder}
          value={borderName(s.passport.border)}
          onClick={() => go(push('setting', { key: 'passportBorder' }))}
        />
        <ChangeRow
          label={t.passportCount}
          value={String(s.passport.count)}
          onClick={() => go(push('passportcountsetting'))}
        />
        <ChangeRow label={t.prices} value={prices || t.pricesNone} onClick={() => go(push('prices'))} />
      </div>
    </main>
  );
}

/** How many passport photos a new passport job starts with: big − / +, then Done. */
export function PassportCountSetting({ go }: ScreenProps) {
  const { settings, ready } = useSettings();
  const [n, setN] = useState(settings.passport.count);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const touched = useRef(false); // filled in once read, unless already changed here
  useEffect(() => {
    if (ready && !touched.current) setN(settings.passport.count);
  }, [ready]);
  const done = async () => {
    setBusy(true);
    const saved = await settingsStore.update((s) => ({ ...s, passport: { ...s.passport, count: n } }));
    setBusy(false);
    if (saved) go({ type: 'back' });
    else setFailed(true);
  };
  return (
    <main class="screen">
      <TopBar title={t.passportCount} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.countHelp}</p>
      <Stepper
        label={t.passportCount}
        fewerLabel={en.passport.fewer}
        moreLabel={en.passport.more}
        value={n}
        min={1}
        max={MAX_PASSPORT_COUNT}
        onChange={(v) => {
          touched.current = true;
          setN(v);
        }}
        disabled={busy}
      />
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void done()}>
          {t.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Passport prices (PLAN §K4): a price per number of photos; an empty price means none. */
export function Prices({ go }: ScreenProps) {
  const { settings, ready } = useSettings();
  const toRows = () =>
    Object.entries(settings.passport.prices).map(([count, price]) => ({ count: Number(count), price: String(price) }));
  const [rows, setRows] = useState(toRows);
  const [addFor, setAddFor] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const touched = useRef(false); // filled in once read, unless already changed here
  useEffect(() => {
    if (ready && !touched.current) setRows(toRows());
  }, [ready]);
  const edit = (next: typeof rows) => {
    touched.current = true;
    setRows(next);
  };
  const add = () => {
    if (!rows.some((r) => r.count === addFor))
      edit([...rows, { count: addFor, price: '' }].sort((a, b) => a.count - b.count));
  };
  const save = async () => {
    setBusy(true);
    const prices: Record<number, number> = {};
    for (const r of rows) if (Number(r.price) > 0) prices[r.count] = Number(r.price);
    const saved = await settingsStore.update((s) => ({ ...s, passport: { ...s.passport, prices } }));
    setBusy(false);
    if (saved) go({ type: 'back' });
    else setFailed(true);
  };
  return (
    <main class="screen">
      <TopBar title={t.prices} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.pricesHelp}</p>
      <div class="stack">
        {rows.map((r) => (
          <div class="stack" key={r.count}>
            <label class="field">
              <span>{fill(t.priceOf, { n: r.count })}</span>
              <input
                type="text"
                inputMode="numeric"
                value={r.price}
                autoComplete="off"
                onInput={(e) => {
                  const price = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 5);
                  edit(rows.map((x) => (x.count === r.count ? { ...x, price } : x)));
                }}
              />
            </label>
            <Button variant="secondary" onClick={() => edit(rows.filter((x) => x.count !== r.count))}>
              {`${t.remove}: ${fill(t.priceOf, { n: r.count })}`}
            </Button>
          </div>
        ))}
      </div>
      {/* Adding a price is its own small group, apart from the prices already set. */}
      <section class="hint-card stack" aria-labelledby="add-price">
        <h2 id="add-price" class="panel-title">
          {t.addPrice}
        </h2>
        <Stepper
          label={t.addFor}
          fewerLabel={en.passport.fewer}
          moreLabel={en.passport.more}
          value={addFor}
          min={1}
          max={MAX_PASSPORT_COUNT}
          onChange={setAddFor}
        />
        <Button variant="secondary" icon="plus" onClick={add}>
          {t.addPrice}
        </Button>
      </section>
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void save()}>
          {t.save}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Send problem report (PLAN §K10): made by the phone (no customer data), sent through Android's share sheet. */
export function Report({ go }: ScreenProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { text } = await PrintEngine.problemReport();
      await PrintEngine.shareText({ text });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="screen">
      <TopBar title={t.report} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={t.reportFailed} />}
      <p>{t.reportBody}</p>
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void send()}>
          {t.report}
        </Button>
      </ActionBar>
    </main>
  );
}

/** "Allow screenshots for 15 minutes" (PLAN §D6): for helping the shopkeeper on Android 12 and older phones. */
export function Screenshots({ go }: ScreenProps) {
  const { settings } = useSettings();
  const [now, setNow] = useState(Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  // Never more than 15 minutes ahead (a clock set back counts as over, review M1).
  const left =
    settings.screenshotsUntil - now > 15 * 60_000 ? 0 : Math.ceil((settings.screenshotsUntil - now) / 60_000);
  const set = async (until: number) => {
    if (busy) return;
    setBusy(true);
    setFailed(!(await settingsStore.update((s) => ({ ...s, screenshotsUntil: until }))));
    setBusy(false);
    setNow(Date.now());
  };
  return (
    <main class="screen">
      <TopBar title={t.screenshots} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.screenshotsHelp}</p>
      {left > 0 && <Panel kind="info" title={fill(t.screenshotsOn, { min: left })} />}
      <ActionBar>
        {left > 0 ? (
          <Button variant="secondary" busy={busy} onClick={() => void set(0)}>
            {t.screenshotsStop}
          </Button>
        ) : (
          <Button icon="check" busy={busy} onClick={() => void set(Date.now() + 15 * 60_000)}>
            {t.screenshotsStart}
          </Button>
        )}
      </ActionBar>
    </main>
  );
}

/**
 * The shop's own passport size (owner, 2026-10-23), in cm: each side 1.5 to 10 (a comma works as the decimal point).
 * Offered beside the standard sizes, in Settings and on each passport job.
 */
export function PassportCustom({ go }: ScreenProps) {
  const { settings, ready } = useSettings();
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const [failed, setFailed] = useState(false);
  // Filled in once the saved settings are read, unless the owner already typed (never overwrite typing).
  const touched = useRef(false);
  useEffect(() => {
    const c = settings.passport.custom;
    if (ready && !touched.current && c) {
      setW(cmOf(c.wMm));
      setH(cmOf(c.hMm));
    }
  }, [ready]);
  const save = async () => {
    const mm = (v: string) => Number(v.trim().replace(',', '.')) * 10;
    const size = customSize({ wMm: mm(w), hMm: mm(h) });
    setBad(!size);
    if (!size) return;
    setBusy(true);
    // The size typed here is the shop's passport size from now on (review, 2026-10-24: it was saved but not used).
    const saved = await settingsStore.update((s) => ({
      ...s,
      passport: { ...s.passport, custom: size, preset: 'custom' as const },
    }));
    setBusy(false);
    if (saved) go({ type: 'back' });
    else setFailed(true);
  };
  const field = (label: string, value: string, set: (v: string) => void) => (
    <label class="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        maxLength={5}
        autoComplete="off"
        onInput={(e) => {
          touched.current = true;
          set((e.target as HTMLInputElement).value);
        }}
      />
    </label>
  );
  return (
    <main class="screen">
      <TopBar title={t.customSize} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.customHelp}</p>
      {field(t.customWidth, w, setW)}
      {field(t.customHeight, h, setH)}
      {bad && <Panel kind="error" title={t.customBad} />}
      <ActionBar>
        <Button icon="check" busy={busy} onClick={() => void save()}>
          {t.save}
        </Button>
      </ActionBar>
    </main>
  );
}
