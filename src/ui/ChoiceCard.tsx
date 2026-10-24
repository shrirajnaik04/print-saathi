import type { ComponentChildren } from 'preact';
import { en } from '../i18n/en';
import { Icon } from './Icon';

/**
 * One choice with a small picture of the result (PLAN §I-7): the whole card is one button; the current choice has
 * a thick border, a tick and the word "Selected" (never colour alone, PLAN §H2.11).
 */
export function ChoiceCard({
  title,
  helper,
  selected,
  preview,
  onClick,
  disabled,
  wide,
}: {
  title: string;
  helper?: string;
  selected: boolean;
  preview?: ComponentChildren;
  onClick: () => void;
  /** While a change is being saved. */
  disabled?: boolean;
  /** A bigger picture (print style examples, where the difference is in the colours). */
  wide?: boolean;
}) {
  return (
    <button type="button" class="choice" aria-pressed={selected} onClick={onClick} disabled={disabled}>
      {preview && (
        <span class={wide ? 'choice-preview choice-preview-wide' : 'choice-preview'} aria-hidden="true">
          {preview}
        </span>
      )}
      <span class="choice-text">
        <span class="choice-title">{title}</span>
        {helper && <span class="muted">{helper}</span>}
        {selected && (
          <span class="choice-selected">
            <Icon name="check" />
            {en.ui.selected}
          </span>
        )}
      </span>
    </button>
  );
}
