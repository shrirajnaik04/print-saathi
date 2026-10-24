import type { ComponentChildren } from 'preact';
import { Button } from './Button';
import { Icon } from './Icon';

const ICON = { info: 'info', warn: 'warning', error: 'error' } as const;

type Props = {
  kind: 'info' | 'warn' | 'error';
  title: string;
  children?: ComponentChildren;
  /** Optional next step, e.g. "Try again". */
  action?: { label: string; onClick: () => void };
};

/**
 * In-place message (never a toast): icon + what happened + what to do (PLAN §H2.6). Warnings and errors are
 * alerts; info is a polite status, so screen readers still hear it.
 */
export function Panel({ kind, title, children, action }: Props) {
  return (
    <div class={`panel panel-${kind}`} role={kind === 'info' ? 'status' : 'alert'}>
      <Icon name={ICON[kind]} />
      <div class="panel-body">
        <p class="panel-title">{title}</p>
        {children}
        {action && (
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
