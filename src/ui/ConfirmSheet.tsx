import { useEffect, useRef } from 'preact/hooks';
import { onBack } from './backClose';

export type SheetChoice = {
  label: string;
  kind: 'primary' | 'secondary' | 'danger';
  onChoose: () => void;
  /** In a grid of choices: this one takes the whole row (Cancel under a list of pages). */
  wide?: boolean;
  /** What a screen reader says when the written label is shorter or has a line break in it ("Page 2, 3 photos"). */
  name?: string;
};

/**
 * A question that needs an answer before anything else (owner, round 4: leaving a job, closing the app): a sheet at the
 * bottom of the screen over a dimmed page, named by its title for screen readers, holding the keyboard focus until it
 * is answered (a modal <dialog>). Escape and Android Back mean the first, safe answer ([onDismiss]).
 */
export function ConfirmSheet({
  title,
  line,
  choices,
  onDismiss,
  grid,
}: {
  title: string;
  line?: string;
  choices: SheetChoice[];
  onDismiss: () => void;
  /** Many short choices (pages to move a photo to): side by side, as many to a row as fit. */
  grid?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Android Back answers the question as Escape does, and never leaves the screen under it (review I3).
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => onBack(() => dismiss.current()), []);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // A long list of choices opens on its question, so a screen reader reads that first and Enter answers nothing
    // (review M4); the other sheets open on their first, safe answer as before.
    if (grid) heading.current?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <h2 id="sheet-title" class="sheet-title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {line && <p class="sheet-line">{line}</p>}
      <div class={grid ? 'sheet-choices sheet-grid' : 'sheet-choices'}>
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            class={`btn btn-${c.kind}${c.wide ? ' sheet-wide' : ''}`}
            onClick={c.onChoose}
            {...(c.name ? { 'aria-label': c.name } : {})}
          >
            {c.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
