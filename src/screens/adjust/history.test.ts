import { describe, expect, it } from 'vitest';
import type { Job, JobEdits } from '../../core/job/job';
import {
  dropStep,
  forgetSteps,
  forgetStepsExcept,
  leaveFor,
  recordStep,
  returned,
  settle,
  stepsFor,
  takeRedo,
  takeUndo,
} from './history';

// Owner, round 6: Undo / Redo for every change on Adjust, kept per job while nothing else changed the job.
const e = (n: number): JobEdits => ({ turns: { 1: (n % 4) as 0 | 1 | 2 | 3 }, pages: n });

describe('Undo / Redo steps (round 6)', () => {
  it('a change can be undone; the undone one can be redone', () => {
    forgetStepsExcept([]);
    expect(stepsFor('j', 1)).toEqual({ canUndo: false, canRedo: false });
    recordStep('j', e(1), 1, 2);
    expect(stepsFor('j', 2)).toEqual({ canUndo: true, canRedo: false });
    expect(takeUndo('j', 2, e(2))).toEqual(e(1));
    settle('j', 3);
    expect(stepsFor('j', 3)).toEqual({ canUndo: false, canRedo: true });
    expect(takeRedo('j', 3, e(1))).toEqual(e(2));
    settle('j', 4);
    expect(stepsFor('j', 4)).toEqual({ canUndo: true, canRedo: false });
  });
  it('a new change after an Undo clears Redo', () => {
    forgetStepsExcept([]);
    recordStep('j', e(1), 1, 2);
    recordStep('j', e(2), 2, 3);
    takeUndo('j', 3, e(3));
    settle('j', 4);
    recordStep('j', e(2), 4, 5);
    expect(stepsFor('j', 5)).toEqual({ canUndo: true, canRedo: false });
  });
  it('the job changed somewhere else (another revision): no steps, and the next change starts afresh', () => {
    forgetStepsExcept([]);
    recordStep('j', e(1), 1, 2);
    expect(stepsFor('j', 3)).toEqual({ canUndo: false, canRedo: false });
    expect(takeUndo('j', 3, e(9))).toBeNull();
    recordStep('j', e(3), 3, 4);
    expect(takeUndo('j', 4, e(4))).toEqual(e(3));
    settle('j', 5);
    expect(stepsFor('j', 5).canUndo).toBe(false);
  });
  it('keeps the newest 50 steps', () => {
    forgetStepsExcept([]);
    for (let i = 0; i < 51; i++) recordStep('j', e(i), i + 1, i + 2);
    let n = 0;
    let rev = 52;
    let last: JobEdits | null = null;
    for (let step = takeUndo('j', rev, e(99)); step; step = takeUndo('j', rev, e(99))) {
      n += 1;
      last = step;
      rev += 1;
      settle('j', rev);
    }
    expect(n).toBe(50);
    expect(last).toEqual(e(1)); // the oldest of the 51 (e(0)) was dropped, not the newest
  });
  it('a step whose save failed is put back', () => {
    forgetStepsExcept([]);
    recordStep('j', e(1), 1, 2);
    const back = takeUndo('j', 2, e(2));
    dropStep('j', 'undo', back as JobEdits);
    expect(stepsFor('j', 2)).toEqual({ canUndo: true, canRedo: false });
    expect(takeUndo('j', 2, e(2))).toEqual(e(1));
  });
  it("only the job being adjusted keeps steps: a change on another job forgets the first job's", () => {
    forgetStepsExcept([]);
    recordStep('a', e(1), 1, 2);
    expect(stepsFor('a', 2).canUndo).toBe(true);
    recordStep('b', e(1), 1, 2);
    expect(stepsFor('a', 2).canUndo).toBe(false);
    expect(stepsFor('b', 2).canUndo).toBe(true);
  });
  it('forgetSteps forgets one job (a change reached the phone from somewhere else)', () => {
    forgetStepsExcept([]);
    recordStep('j', e(1), 1, 2);
    forgetSteps('j');
    expect(stepsFor('j', 2).canUndo).toBe(false);
  });
});

describe('what the other screens of Adjust change is one step (round 6 review I2)', () => {
  const job = (rev: number, pages: number) =>
    ({ id: 'j', rev, items: [], order: [], turns: {}, pages }) as unknown as Job;
  it('back from a screen that changed the job: one step, joined to the steps before', () => {
    forgetStepsExcept([]);
    recordStep('j', e(1), 1, 2);
    leaveFor(job(2, 5));
    expect(returned(job(3, 7))).toBe(true);
    expect(stepsFor('j', 3)).toEqual({ canUndo: true, canRedo: false });
    expect(takeUndo('j', 3, e(9))).toEqual(expect.objectContaining({ pages: 5 }));
    settle('j', 4);
    expect(takeUndo('j', 4, e(9))).toEqual(e(1));
  });
  it('back with nothing changed, or only what Change chose: no step; it is asked once only', () => {
    forgetStepsExcept([]);
    leaveFor(job(2, 5));
    expect(returned(job(2, 5))).toBe(false);
    leaveFor(job(2, 5));
    expect(returned(job(3, 5))).toBe(false); // the revision moved but no adjustable choice differs
    expect(returned(job(4, 9))).toBe(false); // nothing was asked: another job's later change is never joined
    expect(stepsFor('j', 4).canUndo).toBe(false);
  });
});
