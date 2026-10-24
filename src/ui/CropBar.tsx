import { ActionBar } from './ActionBar';
import { Button } from './Button';
import type { IconName } from './icons';

export type CropTool = { label: string; icon: IconName; onClick: () => void; disabled?: boolean };

/**
 * The scanner app's bottom bar (owner, 2026-10-24): Cancel, Whole photo, the turns, then Done, each an icon above its
 * word. One row while every button keeps 56 px; with big text Done takes its own row below.
 */
export function CropBar({ tools, done, busy }: { tools: CropTool[]; done: CropTool; busy?: boolean }) {
  return (
    <ActionBar>
      <div class="crop-bar">
        {tools.map((t) => (
          <Button key={t.label} variant="secondary" icon={t.icon} disabled={t.disabled} onClick={t.onClick}>
            {t.label}
          </Button>
        ))}
        <Button icon={done.icon} busy={busy} disabled={done.disabled} onClick={done.onClick}>
          {done.label}
        </Button>
      </div>
    </ActionBar>
  );
}
