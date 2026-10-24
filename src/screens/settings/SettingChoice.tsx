import { useState } from 'preact/hooks';
import { PASSPORT_BORDERS, type Settings } from '../../core/settings/settings';
import { en } from '../../i18n/en';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Panel } from '../../ui/Panel';
import { TopBar } from '../../ui/TopBar';
import { borderName } from '../passport/names';
import type { ScreenProps } from '../types';
import { usePlanPaper } from '../usePlanPaper';
import { settingsStore, useSettings } from '../useSettings';

const t = en.settings;

type Choice = {
  title: string;
  selected: (s: Settings) => boolean;
  apply: (s: Settings) => Settings;
  /** Offered only once the shop printer's 4×6 photo paper is set up by its test page (gate review I6). */
  needsPhotoPaper?: boolean;
  /** Offered only once the shop's own passport size is set (Settings → Custom size). */
  needsCustom?: boolean;
};
type Question = { title: string; help: string; choices: Choice[] };

const colour = (key: 'photos' | 'documents'): Choice[] =>
  (['colour', 'bw'] as const).map((c) => ({
    title: c === 'bw' ? en.ready.bw : en.ready.colour,
    selected: (s) => s.defaults[key].colour === c,
    apply: (s) => ({ ...s, defaults: { ...s.defaults, [key]: { ...s.defaults[key], colour: c } } }),
  }));

/** Every one-choice setting (PLAN §I-15, one decision per screen): its question, help line and choices. */
const QUESTIONS: Record<string, Question> = {
  retention: {
    title: t.deleteAfter,
    help: t.retentionHelp,
    choices: (['1h', '1d', '7d'] as const).map((r) => ({
      title: t.retention[r],
      selected: (s) => s.retention === r,
      apply: (s) => ({ ...s, retention: r }),
    })),
  },
  reminder: {
    title: t.reminder,
    help: t.reminderHelp,
    choices: [true, false].map((on) => ({
      title: on ? t.on : t.off,
      selected: (s) => s.photoPaperReminder === on,
      apply: (s) => ({ ...s, photoPaperReminder: on }),
    })),
  },
  edges: {
    title: t.edges,
    help: t.edgesHelp,
    choices: (['normal', 'more'] as const).map((e) => ({
      title: e === 'more' ? t.edgesMore : t.edgesNormal,
      selected: (s) => s.edges === e,
      apply: (s) => ({ ...s, edges: e }),
    })),
  },
  margins: {
    title: t.margins,
    help: t.marginsHelp,
    choices: (['narrow', 'normal', 'small'] as const).map((m) => ({
      title: t.marginNames[m],
      selected: (s) => s.margins === m,
      apply: (s) => ({ ...s, margins: m }),
    })),
  },
  photosColour: { title: t.photosColour, help: t.colourHelp, choices: colour('photos') },
  photosPaper: {
    title: t.photosPaper,
    help: t.photosPaperHelp,
    choices: (['A4', 'PHOTO_4x6'] as const).map((paper) => ({
      title: paper === 'A4' ? en.change.paperA4 : en.change.paperPhoto,
      selected: (s) => s.defaults.photos.paper === paper,
      apply: (s) => ({ ...s, defaults: { ...s.defaults, photos: { ...s.defaults.photos, paper } } }),
      needsPhotoPaper: paper === 'PHOTO_4x6',
    })),
  },
  documentsColour: { title: t.documentsColour, help: t.colourHelp, choices: colour('documents') },
  passportSize: {
    title: t.passportSize,
    help: t.sizeHelp,
    choices: (['35x45', '20x25', '2x2in', 'custom'] as const).map((p) => ({
      title: p === 'custom' ? t.customSize : t.sizes[p],
      selected: (s) => s.passport.preset === p,
      apply: (s) => ({ ...s, passport: { ...s.passport, preset: p } }),
      ...(p === 'custom' ? { needsCustom: true } : {}),
    })),
  },
  passportBorder: {
    title: t.passportBorder,
    help: t.borderHelp,
    choices: PASSPORT_BORDERS.map((b) => ({
      title: borderName(b),
      selected: (s) => s.passport.border === b,
      apply: (s) => ({ ...s, passport: { ...s.passport, border: b } }),
    })),
  },
};

/** One setting, one question: tap a choice and it is saved (Back to Settings); a failed save says so. */
export function SettingChoice({ go, params }: ScreenProps) {
  const q = QUESTIONS[String(params?.key ?? '')];
  const { settings } = useSettings();
  const { photoPaper } = usePlanPaper();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!q) return <main class="screen" />;
  const choose = async (c: Choice) => {
    if (busy) return;
    if (c.selected(settings)) return go({ type: 'back' });
    setBusy(true);
    const saved = await settingsStore.update(c.apply);
    setBusy(false);
    if (saved) go({ type: 'back' });
    else setFailed(true);
  };
  return (
    <main class="screen">
      <TopBar title={q.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      {failed && <Panel kind="error" title={en.change.saveFailed} />}
      <p>{q.help}</p>
      {photoPaper === null && q.choices.some((c) => c.needsPhotoPaper) && (
        <Panel kind="info" title={en.change.paperNotSetUp} />
      )}
      <div class="stack rise">
        {q.choices
          .filter((c) => (!c.needsPhotoPaper || photoPaper) && (!c.needsCustom || settings.passport.custom))
          .map((c) => (
            <ChoiceCard
              key={c.title}
              title={c.title}
              selected={c.selected(settings)}
              onClick={() => void choose(c)}
              disabled={busy}
            />
          ))}
      </div>
    </main>
  );
}
