import { useRef, useState } from 'preact/hooks';
import { en } from '../../i18n/en';
import { PrintEngine } from '../../native/printEngine';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.cards.source;

/**
 * Where is the card? (owner, 2026-10-23): photos of the card come from the gallery (the phone's photo picker, front and
 * back), an e-Aadhaar PDF from the file manager. The files then arrive like a share and go straight on to the cards.
 */
export function CardSource({ go }: ScreenProps) {
  const [failed, setFailed] = useState(false);
  // One picker at a time: a second quick tap must not open a second one (as on Home).
  const picking = useRef(false);
  const pick = async (from: 'gallery' | 'files') => {
    if (picking.current) return;
    picking.current = true;
    setFailed(false);
    try {
      await PrintEngine.pickFiles({ kind: 'cards', from });
    } catch {
      setFailed(true);
    } finally {
      picking.current = false;
    }
  };
  return (
    <main class="screen">
      <TopBar title={t.title} onBack={() => go({ type: 'back' })} onHome={() => go({ type: 'home' })} />
      <div class="stack rise">
        <Tile icon="photos" tone="photos" title={t.photos} helper={t.photosHelp} onClick={() => void pick('gallery')} />
        <Tile icon="document" tone="documents" title={t.file} helper={t.fileHelp} onClick={() => void pick('files')} />
      </div>
      {failed && <Panel kind="error" title={en.home.pickFailed} />}
    </main>
  );
}
