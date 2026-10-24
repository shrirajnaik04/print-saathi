import { useEffect, useRef } from 'preact/hooks';

export type SheetChoice = { label: string; kind: 'primary' | 'secondary' | 'danger'; onChoose: () => void };

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
}: {
  title: string;
  line?: string;
  choices: SheetChoice[];
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
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
      <h2 id="sheet-title" class="sheet-title">
        {title}
      </h2>
      {line && <p class="sheet-line">{line}</p>}
      <div class="sheet-choices">
        {choices.map((c) => (
          <button key={c.label} type="button" class={`btn btn-${c.kind}`} onClick={c.onChoose}>
            {c.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
