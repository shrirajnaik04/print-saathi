import { useRef, useState } from 'preact/hooks';
import { forgetAddInto, MAX_JOB_FILES, rememberAddInto } from '../../core/intake/addInto';
import { normalizeJob } from '../../core/job/job';
import { en } from '../../i18n/en';
import { PrintEngine } from '../../native/printEngine';
import { Panel } from '../../ui/Panel';
import { Tile } from '../../ui/Tile';
import { TopBar } from '../../ui/TopBar';
import type { ScreenProps } from '../types';

const t = en.add;

/**
 * "Where are the photos?" (owner, 2026-10-24: "Add more images option needed"): the gallery (Android's photo picker) or
 * the file manager; for a document job the file manager also offers PDFs. The files chosen then join the job (app.tsx:
 * no "New files arrived" question) and this screen gives way to the one Add was pressed on. At most what still fits.
 */
export function AddSource({ go, params }: ScreenProps) {
  const jobId = String(params?.jobId ?? '');
  const docs = params?.kind === 'documents';
  // An ID card's back side (owner, 2026-10-24), or a new photo for one side (Change photo, round 4): one photo, which
  // the cards screen then looks at.
  const side = params?.kind === 'side';
  const back = params?.kind === 'back' || side;
  const [note, setNote] = useState<string | null>(null);
  // One picker at a time: a second quick tap must not open a second one (as on Home).
  const picking = useRef(false);
  const pick = async (from: 'gallery' | 'files') => {
    if (picking.current) return;
    picking.current = true;
    setNote(null);
    try {
      const job = normalizeJob((await PrintEngine.loadJob({ id: jobId })).job);
      const room = Math.min(back ? 1 : MAX_JOB_FILES, Math.max(0, MAX_JOB_FILES - (job?.items.length ?? 0)));
      if (room === 0) return setNote(t.full);
      rememberAddInto(localStorage, jobId, Date.now());
      const { picked } = await PrintEngine.pickFiles({ kind: docs ? 'documents' : 'photos', from, max: room });
      // Closed with nothing chosen: a share arriving later must not join this job by itself.
      if (picked === 0) forgetAddInto(localStorage);
    } catch {
      forgetAddInto(localStorage);
      setNote(en.home.pickFailed);
    } finally {
      picking.current = false;
    }
  };
  return (
    <main class="screen">
      <TopBar
        title={side ? en.cards.changeTitle : back ? en.cards.backTitle : docs ? t.titleFiles : t.titlePhotos}
        onBack={() => go({ type: 'back' })}
        onHome={() => go({ type: 'home' })}
      />
      <div class="stack rise">
        <Tile
          icon="photos"
          tone="photos"
          title={t.gallery}
          helper={t.galleryHelp}
          onClick={() => void pick('gallery')}
        />
        <Tile
          icon="files"
          tone="documents"
          title={t.fileManager}
          helper={docs ? t.fileManagerFiles : t.fileManagerPhotos}
          onClick={() => void pick('files')}
        />
      </div>
      {note && <Panel kind={note === t.full ? 'warn' : 'error'} title={note} />}
    </main>
  );
}
