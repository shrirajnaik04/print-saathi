import type { NavAction } from '../core/nav/stack';

/** Every screen gets one way to move: dispatch a navigation action to the shell. */
export type ScreenProps = { go: (action: NavAction) => void; params?: Record<string, unknown> };

export const push = (name: string, params: Record<string, unknown> = {}): NavAction => ({
  type: 'push',
  screen: { name, params },
});
