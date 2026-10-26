import { describe, expect, it } from 'vitest';
import type { Intake } from '../../native/printEngine';
import { problemMessages } from '../intake/messages';
import { buildPlan } from '../plan/plan';
import { documentLine } from '../plan/summary';
import { COLOUR_STYLES, jobFromIntake, jobReducer, normalizeJob, styleOf } from './job';

// Owner, round 8: "what if someone wants to scan documents? … like the doc scanner app". Pages photographed with the
// phone's own camera become a document job of photos, in Clean colour, each straightened by its four corners.
const scanIntake = (id: string, n: number) =>
  ({
    intakeId: id,
    pick: 'scan',
    rejected: 0,
    refusedByPolicy: 0,
    files: Array.from({ length: n }, (_, i) => ({
      index: i + 1,
      path: `/j/${id}/src/000${i + 1}.jpg`,
      sniffedType: 'jpeg',
      bytes: 1000,
      sha256: `s${i + 1}`,
    })),
  }) as Intake;

describe('a scan job (owner, round 8)', () => {
  const job = jobFromIntake('s1', scanIntake('s1', 3), 1);

  it('starts as a document in colour, in Clean colour, marked as scanned', () => {
    expect(job.layout).toBe('document');
    expect(job.colour).toBe('colour');
    expect(job.scan).toBe(true);
    expect(styleOf(job)).toBe('clean');
    expect(COLOUR_STYLES).toContain('clean');
    const back = normalizeJob(JSON.parse(JSON.stringify(job)));
    expect(back?.scan).toBe(true);
    expect(back && styleOf(back)).toBe('clean');
  });

  it('a photo job is not a scan job', () => {
    const photos = jobFromIntake('p', { ...scanIntake('p', 2), pick: 'photos' }, 1);
    expect(photos.scan).toBeUndefined();
    expect(photos.layout).toBe('onePerPage');
  });

  it('retakeItem puts the new photo in the old one’s place and forgets the old corners and turns', () => {
    const quad = [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9];
    let j = jobReducer(job, { type: 'setQuad', item: 2, quad }, 2);
    j = jobReducer(j, { type: 'turnItem', index: 2 }, 3);
    j = jobReducer(
      j,
      {
        type: 'addItems',
        items: [{ index: 4, path: '/j/s1/src/0004.jpg', type: 'jpeg', bytes: 900, sha256: 's4' }],
        intakeId: 'r1',
        notices: [],
      },
      4,
    );
    const r = jobReducer(j, { type: 'retakeItem', old: 2, new: 4 }, 5);
    expect(r.order).toEqual([1, 4, 3]);
    expect(r.items.map((i) => i.index)).toEqual([1, 3, 4]);
    expect(r.quads?.[2]).toBeUndefined();
    expect(r.turns[2]).toBeUndefined();
    expect(r.rev).toBe(j.rev + 1);
    // Pages to print, in the order the app meets them (review I6): chosen first; the new photo then joins (which
    // resets them); the retake then puts them back with the new photo where the old one was.
    const chosen = jobReducer(
      job,
      {
        type: 'setDocPages',
        pages: [
          { item: 2, page: 0 },
          { item: 1, page: 0 },
        ],
      },
      2,
    );
    const joined = jobReducer(
      chosen,
      {
        type: 'addItems',
        items: [{ index: 4, path: '/j/s1/src/0004.jpg', type: 'jpeg', bytes: 900, sha256: 's4' }],
        intakeId: 'r2',
        notices: [],
      },
      3,
    );
    expect(joined.docPages).toBeUndefined();
    expect(jobReducer(joined, { type: 'retakeItem', old: 2, new: 4, pages: chosen.docPages }, 4).docPages).toEqual([
      { item: 4, page: 0 },
      { item: 1, page: 0 },
    ]);
    // Nothing to take the place of, or the same photo: no change.
    expect(jobReducer(j, { type: 'retakeItem', old: 9, new: 4 }, 6)).toBe(j);
    expect(jobReducer(j, { type: 'retakeItem', old: 2, new: 2 }, 6)).toBe(j);
  });

  it('the Colour switch keeps Clean colour for a scan job (review I3)', () => {
    const bw = jobReducer(job, { type: 'setColour', colour: 'bw' }, 2);
    expect(styleOf(bw)).toBe('bw');
    expect(styleOf(jobReducer(bw, { type: 'setColour', colour: 'colour' }, 3))).toBe('clean');
    // Other jobs come back to their plain colour, as before.
    const photos = jobFromIntake('p', { ...scanIntake('p', 2), pick: 'photos' }, 1);
    const grey = jobReducer(photos, { type: 'setColour', colour: 'bw' }, 2);
    expect(styleOf(jobReducer(grey, { type: 'setColour', colour: 'colour' }, 3))).toBe('original');
  });

  it('Ready says "Scanned pages", with the look', () => {
    const plan = buildPlan(job, new Map([1, 2, 3].map((i) => [i, 0.75])));
    expect(documentLine(plan, new Set(), new Set(), true)).toBe(
      'Scanned pages · 3 pages · A4 · Colour · Clean colour · 1 copy',
    );
  });

  it('the camera giving something that is not a photo says what to do', () => {
    expect(
      problemMessages({
        intakeId: 'x',
        pick: 'scan',
        rejected: 1,
        refusedByPolicy: 0,
        files: [],
        problems: [{ index: 1, reason: 'notPhoto' }],
      } as never),
    ).toEqual(["The camera didn't give a photo. Please try again."]);
  });
});
