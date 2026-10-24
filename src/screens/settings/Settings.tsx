import { en } from '../../i18n/en';
import { fill } from '../../i18n/fill';
import { ChangeRow } from '../../ui/ChangeRow';
import { TopBar } from '../../ui/TopBar';
import { sizeName } from '../passport/names';
import { push, type ScreenProps } from '../types';
import { useSettings } from '../useSettings';

const t = en.settings;

/** Settings for the shop owner (PLAN §I-15): every row shows its value now and opens one decision. */
export function Settings({ go }: ScreenProps) {
  const { settings: s } = useSettings();
  const colourOf = (c: 'colour' | 'bw') => (c === 'bw' ? en.ready.bw : en.ready.colour);
  const rows: { label: string; value: string; open: () => void }[] = [
    { label: t.shop, value: s.shopName || en.ui.notSet, open: () => go(push('shopname')) },
    {
      label: t.passport,
      value: fill(t.passportValue, {
        size: sizeName(s.passport.preset, s.passport.custom && { w: s.passport.custom.wMm, h: s.passport.custom.hMm }),
        n: s.passport.count,
      }),
      open: () => go(push('passportsettings')),
    },
    {
      label: t.paper,
      value: `${t.photosColour}: ${colourOf(s.defaults.photos.colour)} · ${t.documentsColour}: ${colourOf(s.defaults.documents.colour)}`,
      open: () => go(push('papersettings')),
    },
    {
      label: t.reminder,
      value: s.photoPaperReminder ? t.on : t.off,
      open: () => go(push('setting', { key: 'reminder' })),
    },
    { label: t.deleteAfter, value: t.retention[s.retention], open: () => go(push('setting', { key: 'retention' })) },
    { label: t.deleteAll, value: en.deleteAll.rowValue, open: () => go(push('deleteall')) },
    { label: t.testPage, value: en.testPage.a4Or4x6, open: () => go(push('testpage')) },
    {
      label: t.screenshots,
      value: s.screenshotsUntil > Date.now() ? t.on : t.off,
      open: () => go(push('screenshots')),
    },
    {
      label: t.edges,
      value: s.edges === 'more' ? t.edgesMore : t.edgesNormal,
      open: () => go(push('setting', { key: 'edges' })),
    },
    { label: t.report, value: t.reportValue, open: () => go(push('report')) },
  ];
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <div class="rows">
        {rows.map((r) => (
          <ChangeRow key={r.label} label={r.label} value={r.value} onClick={r.open} />
        ))}
      </div>
    </main>
  );
}
