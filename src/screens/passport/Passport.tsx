import { useEffect, useRef, useState } from 'preact/hooks';
import { panPhoto, zoomPhoto } from '../../core/layout/panZoom';
import { passportSize } from '../../core/layout/passport';
import { centredFrame, passportFrame } from '../../core/plan/plan';
import { MAX_PASSPORT_COUNT, PASSPORT_BORDERS } from '../../core/settings/settings';
import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ActionBar } from '../../ui/ActionBar';
import { Button } from '../../ui/Button';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { trackGesture } from '../../ui/gestures';
import { Panel } from '../../ui/Panel';
import { turnedStyle } from '../../ui/PaperPreview';
import { Stepper } from '../../ui/Stepper';
import { TopBar } from '../../ui/TopBar';
import { JobGone } from '../JobGone';
import type { ScreenProps } from '../types';
import { useJob } from '../useJob';
import { loadSettings, useSettings } from '../useSettings';
import { borderName, sizeName } from './names';

const t = en.passport;
type Rect = { x: number; y: number; w: number; h: number };

/** Which photo? (PLAN §I-10): several photos arrived; the one tapped becomes the passport photo. */
export function WhichPhoto({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, thumbs, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.which} />;
  const photos = job?.items.filter((i) => thumbs?.get(i.index)?.state === 'ok') ?? [];
  return (
    <main class="screen">
      <TopBar title={t.which} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.whichHint}</p>
      <div class="photo-grid">
        {photos.map((p) => {
          const n = (job?.items.findIndex((i) => i.index === p.index) ?? 0) + 1;
          return (
            <button
              key={p.index}
              type="button"
              class="photo-pick"
              disabled={busy}
              aria-label={fill(t.photoN, { n })}
              onClick={async () => {
                const { passport } = await loadSettings();
                const defaults = {
                  count: passport.count,
                  preset: passport.preset,
                  border: passport.border,
                  custom: passport.custom,
                };
                if (await change({ type: 'setPassport', item: p.index, defaults }))
                  go({ type: 'replace', screen: { name: 'passportcrop', params: { jobId } } });
              }}
            >
              <img src={srcOf(p.index)} alt="" />
              <span>{fill(t.photoN, { n })}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

/** One tap on Move moves the photo this much of the frame; Zoom in / out by this factor. */
const STEP = 0.05;
const ZOOM = 1.1;
/** The stage is 3 wide by 4 high; the frame takes this much of it (the rest shows the photo around, dimmed). */
const STAGE = 3 / 4;
const FILL = 0.76;

/**
 * Passport crop (PLAN §I-11), the WhatsApp way (owner, 2026-10-23): the frame (the passport shape, with a face oval)
 * stands still in the middle; the photo moves under it. One finger drags the photo, two fingers pinch to zoom; big
 * buttons do the same (Zoom in, Zoom out, Move photo, Turn, Start again; PLAN §H2.4). The photo always fills the frame.
 * Next saves the part of the photo inside the frame.
 */
export function PassportCrop({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, aspects, srcOf, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const [moved, setMoved] = useState<Rect | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef(trackGesture());
  if (gone) return <JobGone go={go} title={t.crop} />;
  const choice = job?.passport;
  const a = choice ? (aspects.get(choice.item) ?? 0) : 0;
  const turns = choice ? (job?.turns?.[choice.item] ?? 0) : 0;
  const shown = turns % 2 === 1 ? 1 / a : a;
  const preset = passportSize(choice ?? { preset: '35x45' });
  const frame = preset.wMm / preset.hMm;
  const start = job && choice && a > 0 ? passportFrame(job, a) : null;
  const r = moved ?? start;
  // The frame on the stage (fractions of its width and height), the passport shape, centred.
  const fw = frame <= STAGE ? (FILL * frame) / STAGE : FILL;
  const fh = frame <= STAGE ? FILL : (FILL * STAGE) / frame;
  const fx = (1 - fw) / 2;
  const fy = (1 - fh) / 2;
  const pan = (dx: number, dy: number) => r && shown > 0 && setMoved(panPhoto(r, dx, dy, shown, frame));
  const zoom = (factor: number) => r && shown > 0 && setMoved(zoomPhoto(r, factor, shown, frame));
  // Fingers on the stage: screen px turned into frame widths and heights.
  const onDown = (e: PointerEvent) => {
    if (!gesture.current.down(e.pointerId, e.clientX, e.clientY)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const box = stage.current?.getBoundingClientRect();
    const step = gesture.current.move(e.pointerId, e.clientX, e.clientY);
    if (!box || !step || !r || !(shown > 0)) return;
    const w = fw * box.width;
    const h = fh * box.height;
    let next = panPhoto(r, step.dx / w, step.dy / h, shown, frame);
    if (step.kind === 'pinch')
      next = zoomPhoto(next, step.factor, shown, frame, {
        x: (step.cx - box.left - fx * box.width) / w,
        y: (step.cy - box.top - fy * box.height) / h,
      });
    setMoved(next);
  };
  const onUp = (e: PointerEvent) => gesture.current.up(e.pointerId);
  const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;
  return (
    <main class="screen">
      <TopBar title={t.crop} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{t.cropHint}</p>
      {choice && r && shown > 0 && (
        <div
          ref={stage}
          class="face-stage"
          role="img"
          aria-label={t.stageLabel}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
        >
          {/* The whole photo, placed so that the part chosen fills the frame exactly. */}
          <span
            class="paper-photo paper-turned face-photo"
            style={{
              left: pct(fx - (r.x * fw) / r.w),
              top: pct(fy - (r.y * fh) / r.h),
              width: pct(fw / r.w),
              height: pct(fh / r.h),
            }}
          >
            <img src={srcOf(choice.item)} alt="" draggable={false} style={turnedStyle(turns, shown, 1)} />
          </span>
          <span
            class="passport-frame"
            style={{ left: pct(fx), top: pct(fy), width: pct(fw), height: pct(fh) }}
            aria-hidden="true"
          >
            <span class="passport-oval" />
          </span>
        </div>
      )}
      <div class="nudge-grid">
        {/* Zoom out on the left, zoom in on the right (owner, 2026-10-24). */}
        <Button variant="secondary" icon="minus" onClick={() => zoom(1 / ZOOM)}>
          {t.zoomOut}
        </Button>
        <Button variant="secondary" icon="plus" onClick={() => zoom(ZOOM)}>
          {t.zoomIn}
        </Button>
        <Button variant="secondary" icon="up" onClick={() => pan(0, -STEP)}>
          {t.photoUp}
        </Button>
        <Button variant="secondary" icon="down" onClick={() => pan(0, STEP)}>
          {t.photoDown}
        </Button>
        <Button variant="secondary" icon="left" onClick={() => pan(-STEP, 0)}>
          {t.photoLeft}
        </Button>
        <Button variant="secondary" icon="right" onClick={() => pan(STEP, 0)}>
          {t.photoRight}
        </Button>
      </div>
      <div class="nudge-grid">
        <Button
          variant="secondary"
          icon="turn"
          disabled={busy}
          onClick={async () => {
            // A sideways customer photo: turn it here (gate m6); the frame starts again, centred, in its shape.
            if (choice && (await change({ type: 'turnItem', index: choice.item }))) setMoved(null);
          }}
        >
          {t.turn}
        </Button>
        <Button
          variant="secondary"
          icon="undo"
          onClick={() => {
            setMoved(shown > 0 ? centredFrame(shown, frame) : null);
          }}
        >
          {t.startAgain}
        </Button>
      </div>
      <ActionBar>
        <Button
          icon="next"
          busy={busy}
          onClick={async () => {
            if (!r) return;
            if (!(await change({ type: 'setPassportCrop', crop: r }))) return;
            // From Change, Ready is already open below: go back to it, never stack a second one (gate m1).
            if (params?.from === 'change') go({ type: 'backTo', name: 'ready' });
            else go({ type: 'replace', screen: { name: 'ready', params: { jobId } } });
          }}
        >
          {t.next}
        </Button>
      </ActionBar>
    </main>
  );
}

const QUICK = [4, 5, 6, 8];

/** A typed count: digits only (spaces around are fine), 1 to [MAX_PASSPORT_COUNT]; anything else is null. */
export function typedCount(s: string): number | null {
  const v = s.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_PASSPORT_COUNT ? n : null;
}

/** How many passport photos? (PLAN §J4): quick choices 4 · 5 · 6 · 8, then big − / +. */
export function PassportCount({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  // Or type how many (owner, round 3): saved a moment after a good number is typed, at once on Enter or on leaving the
  // box; anything else says what to type, only then (not while typing).
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(false);
  const later = useRef<ReturnType<typeof setTimeout>>();
  // The text last saved: leaving the box never saves it again over a count changed since (review M2).
  const saved = useRef('');
  useEffect(() => () => clearTimeout(later.current), []);
  const take = (s: string, now: boolean) => {
    clearTimeout(later.current);
    const count = typedCount(s);
    if (count === null) {
      if (now) setWrong(true);
      return;
    }
    setWrong(false);
    if (now && s === saved.current) return;
    const save = () => {
      saved.current = s;
      void change({ type: 'setPassportCount', count });
    };
    if (now) save();
    else later.current = setTimeout(save, 600);
  };
  // 4 · 5 · 6 · 8 and − / +: the count they show wins; the box empties.
  const pick = (count: number) => {
    clearTimeout(later.current);
    setTyped('');
    setWrong(false);
    saved.current = '';
    void change({ type: 'setPassportCount', count });
  };
  if (gone) return <JobGone go={go} title={t.count} />;
  const n = job?.passport?.count ?? 5;
  return (
    <main class="screen">
      <TopBar title={t.count} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <div class="quick-counts">
        {QUICK.map((q) => (
          <Button key={q} variant={q === n ? 'primary' : 'secondary'} disabled={busy} onClick={() => pick(q)}>
            {String(q)}
          </Button>
        ))}
      </div>
      <Stepper
        label={t.countTitle}
        fewerLabel={t.fewer}
        moreLabel={t.more}
        value={n}
        min={1}
        max={MAX_PASSPORT_COUNT}
        disabled={busy}
        onChange={pick}
      />
      <label class="field">
        <span>{t.typeCount}</span>
        <input
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={6}
          value={typed}
          aria-invalid={wrong}
          aria-describedby={wrong ? 'count-wrong' : undefined}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setTyped(v);
            setWrong(false);
            take(v, false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') take((e.target as HTMLInputElement).value, true);
          }}
          onBlur={(e) => {
            if ((e.target as HTMLInputElement).value !== '') take((e.target as HTMLInputElement).value, true);
          }}
        />
      </label>
      {wrong && (
        <p id="count-wrong" class="field-wrong" role="alert">
          {t.typeCountError}
        </p>
      )}
      <ActionBar>
        <Button icon="check" onClick={() => go({ type: 'backTo', name: 'ready' })}>
          {en.change.done}
        </Button>
      </ActionBar>
    </main>
  );
}

/** Passport size (owner, 2026-10-23): the standard sizes and the shop's own; a size changed on Adjust is offered too. */
export function PassportSizeChoice({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  const { settings } = useSettings();
  if (gone) return <JobGone go={go} title={t.size} />;
  const p = job?.passport;
  const shop = settings.passport.custom
    ? { w: settings.passport.custom.wMm, h: settings.passport.custom.hMm }
    : undefined;
  const same = (a?: { w: number; h: number }, b?: { w: number; h: number }) => !!a && !!b && a.w === b.w && a.h === b.h;
  const options: { key: string; preset: NonNullable<typeof p>['preset']; sizeMm?: { w: number; h: number } }[] = [
    ...(['35x45', '20x25', '2x2in'] as const).map((preset) => ({ key: preset, preset })),
    ...(shop ? [{ key: 'shop', preset: 'custom' as const, sizeMm: shop }] : []),
    ...(p?.preset === 'custom' && p.sizeMm && !same(p.sizeMm, shop)
      ? [{ key: 'job', preset: 'custom' as const, sizeMm: p.sizeMm }]
      : []),
  ];
  return (
    <main class="screen">
      <TopBar title={t.size} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <h2>{t.sizeTitle}</h2>
      <div class="stack rise">
        {options.map((o) => (
          <ChoiceCard
            key={o.key}
            title={sizeName(o.preset, o.sizeMm)}
            selected={!!p && p.preset === o.preset && (o.preset !== 'custom' || same(p.sizeMm, o.sizeMm))}
            disabled={busy}
            onClick={async () => {
              if (await change({ type: 'setPassportSize', preset: o.preset, sizeMm: o.sizeMm }))
                go({ type: 'backTo', name: 'ready' });
            }}
          />
        ))}
      </div>
    </main>
  );
}

/** Passport border (owner, 2026-10-23): a black line inside each photo, ½ to 3 pt, or none. */
export function PassportBorderChoice({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const { job, gone, failed, retry, change, busy, saveFailed } = useJob(jobId);
  if (gone) return <JobGone go={go} title={t.border} />;
  const now = job?.passport?.border ?? 0;
  return (
    <main class="screen">
      <TopBar title={t.border} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && (
        <Panel kind="error" title={en.ready.loadFailed} action={{ label: en.ready.tryAgain, onClick: retry }} />
      )}
      {saveFailed && <Panel kind="error" title={en.change.saveFailed} />}
      <h2>{t.borderTitle}</h2>
      <div class="stack rise">
        {PASSPORT_BORDERS.map((b) => (
          <ChoiceCard
            key={b}
            title={borderName(b)}
            selected={now === b}
            disabled={busy}
            onClick={async () => {
              if (now === b || (await change({ type: 'setPassportBorder', border: b })))
                go({ type: 'backTo', name: 'ready' });
            }}
          />
        ))}
      </div>
    </main>
  );
}
