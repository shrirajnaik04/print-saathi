import { Icon } from './Icon';

type Props = {
  label: string;
  /** Spoken names of the buttons, e.g. "Fewer copies" / "More copies" (from the catalogue; not built from label,
   * which would break in Marathi or Hindi). */
  fewerLabel: string;
  moreLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** While a change is being saved (quick taps are not lost or doubled). */
  disabled?: boolean;
};

/** Big − / + around a large number (copies, passport count). Never needs typing or precise taps. */
export function Stepper({ label, fewerLabel, moreLabel, value, min, max, onChange, disabled }: Props) {
  return (
    <fieldset class="stepper">
      <legend>{label}</legend>
      <button
        type="button"
        class="stepper-btn"
        aria-label={fewerLabel}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="minus" size="lg" />
      </button>
      <output class="stepper-value">{value}</output>
      <button
        type="button"
        class="stepper-btn"
        aria-label={moreLabel}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="plus" size="lg" />
      </button>
    </fieldset>
  );
}
