/** One screen on the stack, with the parameters it needs to redraw itself after Back or a restore. */
export type Screen = { name: string; params: Record<string, unknown> };
export type NavAction =
  | { type: 'push'; screen: Screen }
  /** Swaps the top screen (Home stays): a step that must not be returned to with Back, e.g. Ready -> Result. */
  | { type: 'replace'; screen: Screen }
  /** [sure]: the shopkeeper already chose to leave (a Cancel that stops work): no "Leave this job?" question. */
  | { type: 'back'; sure?: boolean }
  /** Back to the nearest screen called [name] (one Back if there is none), e.g. a choice on Pages → Ready. */
  | { type: 'backTo'; name: string }
  /** Home, or Home with [andOpen] on it (one step: e.g. a merged job's Received with nothing stale under it). */
  | { type: 'home'; andOpen?: Screen; sure?: boolean };
/** Side effect the shell must perform: on Home, Android Back minimises the app (PLAN §D5). */
export type NavEffect = 'minimise';

/** A new Home entry each time: a stack entry is identified by the object itself (app.tsx). */
const home = (): Screen => ({ name: 'home', params: {} });

export const initialStack = (): Screen[] => [home()];

/** Pure navigation reducer: Home is always at the bottom and the stack is never empty. */
export function navigate(stack: Screen[], action: NavAction): { stack: Screen[]; effect?: NavEffect } {
  switch (action.type) {
    case 'push':
      return { stack: [...stack, action.screen] };
    case 'replace':
      return { stack: stack.length <= 1 ? [home(), action.screen] : [...stack.slice(0, -1), action.screen] };
    case 'backTo': {
      const at = stack.map((sc) => sc.name).lastIndexOf(action.name);
      if (at < 0) return navigate(stack, { type: 'back' });
      return { stack: stack.slice(0, at + 1) };
    }
    case 'home':
      return { stack: action.andOpen ? [home(), action.andOpen] : [home()] };
    case 'back':
      return stack.length <= 1 ? { stack: [home()], effect: 'minimise' } : { stack: stack.slice(0, -1) };
  }
}
