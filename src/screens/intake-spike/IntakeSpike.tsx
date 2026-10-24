import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'preact/hooks';
import { type Intake, PHOTO_TYPES, PrintEngine } from '../../native/printEngine';
import { intakeForEvent } from './match';
import { summariseIntake } from './summary';

// Phase 0 spike (a): proves shared files arrive and are shown by path (no bytes over the bridge).
// Shows originals directly; Phase 2 replaces these with engine-made thumbnails.
export function IntakeSpike() {
  const [intake, setIntake] = useState<Intake | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () =>
      PrintEngine.getPendingIntake().then(
        (r) => {
          setFailed(false);
          setIntake(r.intake);
        },
        () => setFailed(true),
      );
    load();
    // The event names the intake it is about; show it only if that exact intake is the pending one (Gate 3 #5).
    const ready = PrintEngine.addListener('intakeReady', (e) =>
      PrintEngine.getPendingIntake().then(
        (r) => {
          const view = intakeForEvent(e.intakeId, r.intake);
          setFailed(view.kind === 'failed');
          if (view.kind === 'show') setIntake(view.intake);
        },
        () => setFailed(true),
      ),
    );
    const failure = PrintEngine.addListener('intakeFailed', () => setFailed(true));
    return () => {
      ready.then((h) => h.remove());
      failure.then((h) => h.remove());
    };
  }, []);

  if (failed)
    return (
      <p role="alert" class="panel-error">
        Couldn't receive these files. Please share them again from WhatsApp.
      </p>
    );

  if (!intake) return <p>No files yet. In WhatsApp, select the files → tap Share → choose PrintSaathi.</p>;

  return (
    <section aria-labelledby="intake-title">
      <h2 id="intake-title" data-testid="intake-summary">
        {summariseIntake(intake.files, intake.rejected)}
      </h2>
      <ul class="thumbs">
        {intake.files.map((f) => (
          <li key={f.index}>
            {PHOTO_TYPES.has(f.sniffedType) ? (
              <img
                src={Capacitor.convertFileSrc(f.path)}
                alt={`Customer file ${f.index} of ${intake.files.length}`}
                loading="lazy"
              />
            ) : (
              <span class="file-row">{f.sniffedType === 'pdf' ? `PDF document ${f.index}` : `File ${f.index}`}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
