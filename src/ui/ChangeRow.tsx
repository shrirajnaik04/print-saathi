import { en } from '../i18n/en';

/** "Paper — A4 — Change": one row per setting; opens one decision screen. "Change" wraps below on narrow screens. */
export function ChangeRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" class="change-row" onClick={onClick}>
      <span class="change-text">
        <span class="change-label">{label}</span>
        <span class="change-value">{value}</span>
      </span>
      <span class="change-action">{en.ui.change}</span>
    </button>
  );
}
