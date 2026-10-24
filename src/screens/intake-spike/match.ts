import type { Intake } from '../../native/printEngine';

export type IntakeView = { kind: 'show'; intake: Intake } | { kind: 'failed' };

/**
 * After an `intakeReady` event, the pending intake must be exactly the one the event names. Anything else means
 * the named share never arrived, and showing the older intake would show the previous customer's files.
 */
export function intakeForEvent(eventIntakeId: string, pending: Intake | null): IntakeView {
  return pending && pending.intakeId === eventIntakeId ? { kind: 'show', intake: pending } : { kind: 'failed' };
}
