import { en } from '../i18n/en';
import { Icon } from './Icon';

const t = en.ready;

/**
 * Colour | Black & white on Ready to print (owner, round 3: "a toggle for easy switching, extremely user friendly"): two
 * big halves, the chosen one filled and ticked (never colour alone), a named group of two pressed buttons for screen
 * readers. One tap changes the job; tapping the chosen half again does nothing.
 */
export function ColourSwitch({
  value,
  onChange,
  disabled,
}: {
  value: 'colour' | 'bw';
  onChange: (colour: 'colour' | 'bw') => void;
  disabled?: boolean;
}) {
  return (
    <fieldset class="colour-switch" aria-label={t.printIn}>
      {(['colour', 'bw'] as const).map((c) => (
        <button
          key={c}
          type="button"
          class={value === c ? 'colour-half colour-on' : 'colour-half'}
          aria-pressed={value === c}
          disabled={disabled}
          onClick={() => value !== c && onChange(c)}
        >
          {value === c && <Icon name="check" />}
          <span>{c === 'colour' ? t.colour : t.bw}</span>
        </button>
      ))}
    </fieldset>
  );
}
