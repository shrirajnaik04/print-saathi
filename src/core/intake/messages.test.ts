import { describe, expect, it } from 'vitest';
import { isStorageFull, problemMessages, STORAGE_FULL } from './messages';

const intake = (over: object) =>
  ({ intakeId: 'i', rejected: 0, refusedByPolicy: 0, files: [], problems: [], ...over }) as never;

describe('problemMessages (PLAN §J8: what happened + what to do, plain words)', () => {
  it('a stopped share says how many arrived and how to get the rest (review M5)', () => {
    const f = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i + 1 }));
    expect(problemMessages(intake({ cancelled: true, expected: 8, files: f(3) }))).toEqual([
      'Receiving was stopped: 3 of 8 files arrived. To print the rest, share them again from WhatsApp.',
    ]);
    expect(problemMessages(intake({ cancelled: true, expected: 2, files: f(1) }))).toEqual([
      'Receiving was stopped: 1 of 2 files arrived. To print the other one, share it again from WhatsApp.',
    ]);
  });

  it('says nothing when everything arrived', () => {
    expect(problemMessages(intake({}))).toEqual([]);
  });

  it('groups the same reason and counts files correctly', () => {
    const m = problemMessages(
      intake({
        problems: [
          { index: 1, reason: 'stalled' },
          { index: 2, reason: 'failed' },
        ],
      }),
    );
    expect(m).toEqual(["Couldn't receive 2 files. Please share them again from WhatsApp."]);
    const one = problemMessages(intake({ problems: [{ index: 1, reason: 'permission' }] }));
    expect(one).toEqual(["Couldn't receive 1 file. Please share it again from WhatsApp."]);
  });

  it('gives each kind of problem its own next step', () => {
    const m = problemMessages(
      intake({
        problems: [
          { index: 1, reason: 'tooBig' },
          { index: 2, reason: 'storageFull' },
          { index: 3, reason: 'empty' },
        ],
      }),
    );
    expect(m).toContain('1 file is too big to print.');
    expect(m).toContain('Phone storage is full. Delete old WhatsApp videos, then share again.');
    expect(m).toContain('1 file was empty. Ask the customer to send it again.');
  });

  it('explains an interrupted share with how many files are missing', () => {
    const m = problemMessages(intake({ state: 'interrupted', expected: 3, files: [{ index: 1 }] }));
    expect(m).toEqual(["Couldn't finish receiving 2 files. Please share them again."]);
  });

  it('refuses more than 100 files as a whole, with the count', () => {
    expect(problemMessages(intake({ tooMany: true, expected: 120 }))).toEqual([
      'Too many files at once (120). Please share up to 100 at a time.',
    ]);
  });
});

describe('files chosen on Home say "choose again", not "share again" (Phase 10b review M5)', () => {
  const picked = (o: object) =>
    ({ intakeId: 'p', rejected: 1, refusedByPolicy: 0, files: [], pick: 'photos', ...o }) as never;
  it('a copy that broke, too many, a full phone', () => {
    expect(problemMessages(picked({ problems: [{ index: 1, reason: 'failed' }] }))).toEqual([
      "Couldn't receive 1 file. Please choose it again.",
    ]);
    expect(problemMessages(picked({ tooMany: true, expected: 120 }))).toEqual([
      'Too many files at once (120). Please choose up to 100 at a time.',
    ]);
    const full = problemMessages(picked({ problems: [{ index: 1, reason: 'storageFull' }] }));
    expect(full).toEqual(['Phone storage is full. Delete old WhatsApp videos, then choose them again.']);
    expect(isStorageFull(full[0] as string)).toBe(true);
    expect(isStorageFull(STORAGE_FULL)).toBe(true);
  });
});
