import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './icons';

type Props = {
  children: ComponentChildren;
  onClick: () => void;
  variant?: 'primary' | 'print' | 'secondary' | 'danger';
  icon?: IconName;
  /** While true the button is disabled and shows [busyLabel] instead, so a second tap can't start a second job. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  /** A fuller name for screen readers; it must contain the visible words (WCAG 2.5.3). */
  label?: string;
};

export function Button({ children, onClick, variant = 'primary', icon, busy, busyLabel, disabled, label }: Props) {
  return (
    <button
      type="button"
      class={`btn btn-${variant}`}
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy ? 'true' : undefined}
      aria-label={busy ? undefined : label}
    >
      {busy ? <span class="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      <span>{busy ? busyLabel : children}</span>
    </button>
  );
}
