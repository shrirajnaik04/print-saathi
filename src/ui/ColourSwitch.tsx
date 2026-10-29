import { en } from '../i18n/en';
import { Icon } from './Icon';

const t = en.ready;

/**
 * Colour | Black & white on Ready to print (owner, round 3: "a toggle for easy switching, extremely user friendly"): two
 * halves, the chosen one filled and ticked (never colour alone), a named group of two pressed buttons for screen
 * readers. One tap changes the job; tapping the chosen half again does nothing. [compact]: beside the title (owner,
 * round 4), "Colour | B&W" on screen, the full names for screen readers.
 */
export function ColourSwitch({
  value,
  onChange,
  disabled,
  compact,
  label,
}: {
  /** null: neither half is chosen (pages of both colours, round 10). */
  value: 'colour' | 'bw' | null;
  onChange: (colour: 'colour' | 'bw') => void;
  disabled?: boolean;
  compact?: boolean;
  /** The group's name for screen readers when it is not the job's (a page's own switch, round 10). */
  label?: string;
}) {
  return (
    <fieldset class={compact ? 'colour-switch colour-switch-compact' : 'colour-switch'} aria-label={label ?? t.printIn}>
      {(['colour', 'bw'] as const).map((c) => (
        <button
          key={c}
          type="button"
          class={value === c ? 'colour-half colour-on' : 'colour-half'}
          aria-pressed={value === c}
          aria-label={compact ? (c === 'colour' ? t.colour : t.bw) : undefined}
          disabled={disabled}
          onClick={() => value !== c && onChange(c)}
        >
          {value === c && <Icon name="check" size={compact ? 'sm' : 'md'} />}
          <span>{c === 'colour' ? t.colour : compact ? t.bwShort : t.bw}</span>
        </button>
      ))}
    </fieldset>
  );
}
