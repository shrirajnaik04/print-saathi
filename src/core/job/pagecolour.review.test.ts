import { describe, expect, it } from 'vitest';
import { hasPageColours, type Job, jobFromIntake, jobReducer, normalizeJob, styleOfPage } from './job';

// Round 10, the whole-round review: the first guess is made once and never overwrites a choice; marks follow their
// pages through copies, retakes and new text; a mixed job keeps its colour style and its black & white style apart.
const intake = (types: string[]) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: types.map((t, i) => ({ index: i + 1, path: `/p/${i + 1}`, sniffedType: t, bytes: 1, sha256: `h${i}` })),
  }) as never;
const doc = () => jobReducer(jobFromIntake('d', intake(['pdf']), 1), { type: 'setDocument' }, 2);
const photos = (n: number) => jobFromIntake('p', intake(Array(n).fill('jpeg')), 1);

describe('the first guess (review I2, I3)', () => {
  it('never overwrites what the shopkeeper chose meanwhile', () => {
    const marked = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);
    expect(jobReducer(marked, { type: 'someColour', marks: { '1:0': 'bw', '1:2': 'bw' } }, 4)).toBe(marked);
    const grey = jobReducer(doc(), { type: 'setColour', colour: 'bw' }, 3);
    expect(jobReducer(grey, { type: 'someColour', marks: { '1:0': 'bw' } }, 4)).toBe(grey);
  });

  it('is made once per job: after All colour it does not come back', () => {
    const guessed = jobReducer(doc(), { type: 'someColour', marks: { '1:0': 'bw' } }, 3);
    expect(guessed.pagesMarked).toBe(true);
    const all = jobReducer(guessed, { type: 'setColour', colour: 'colour' }, 4);
    expect(all.pageColour).toBeUndefined();
    expect(all.pagesMarked).toBe(true);
    expect(jobReducer(all, { type: 'someColour', marks: { '1:0': 'bw' } }, 5)).toBe(all);
    // Marking by hand counts too, and it is kept through saving.
    const byHand = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);
    expect(normalizeJob(JSON.parse(JSON.stringify(byHand)))?.pagesMarked).toBe(true);
  });
});

describe('marks follow their pages (review I6, M1)', () => {
  it('a pasted copy of a photo takes the photo’s colour', () => {
    const job = jobReducer(photos(2), { type: 'setPageColours', marks: { '1:0': 'bw' } }, 2);
    const item = job.items[0] as Job['items'][number];
    const next = jobReducer(job, { type: 'copyItem', copy: { item } as never, page: 0, x: 50, y: 50 }, 3);
    const copy = next.items[next.items.length - 1]?.index as number;
    expect(next.pageColour?.[`${copy}:0`]).toBe('bw');
    expect(next.pageColour?.['1:0']).toBe('bw');
  });

  it('a retaken scan page keeps its colour', () => {
    const job = jobReducer(photos(2), { type: 'setPageColours', marks: { '1:0': 'bw' } }, 2);
    const next = jobReducer(job, { type: 'retakeItem', old: 1, new: 2 }, 3);
    expect(next.pageColour).toEqual({ '2:0': 'bw' });
  });

  it('a text message made again starts its pages’ colours again', () => {
    const job = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw', '1:2': 'bw' } }, 3);
    const next = jobReducer(
      job,
      { type: 'setTextPdf', index: 1, path: '/p/new.pdf', bytes: 2, sha256: 'z', size: 12 },
      4,
    );
    expect(next.pageColour).toBeUndefined();
  });
});

describe('a mixed job’s print styles (review I5, M2, M5)', () => {
  const mixed = () => jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);

  it('the colour style and the black & white style are kept apart', () => {
    let job = jobReducer(mixed(), { type: 'setStyle', style: 'vibrant' }, 4);
    job = jobReducer(job, { type: 'setStyle', style: 'sharp' }, 5);
    expect(job.style).toBe('vibrant');
    expect(job.bwStyle).toBe('sharp');
    expect(styleOfPage(job, '1:0')).toBe('vibrant');
    expect(styleOfPage(job, '1:1')).toBe('sharp');
    expect(normalizeJob(JSON.parse(JSON.stringify(job)))?.bwStyle).toBe('sharp');
    // The top switch sets every page again: the grey style goes with the marks.
    expect(jobReducer(job, { type: 'setColour', colour: 'colour' }, 6).bwStyle).toBeUndefined();
  });

  it('a style on a job without marks is as before', () => {
    const job = jobReducer(doc(), { type: 'setStyle', style: 'sharp' }, 3);
    expect(job.colour).toBe('bw');
    expect(job.style).toBe('sharp');
    expect(job.bwStyle).toBeUndefined();
  });

  it('marks on a passport job are not marks', () => {
    const pass = {
      ...jobReducer(photos(1), { type: 'setPassport', item: 1 }, 2),
      pageColour: { '1:0': 'bw' as const },
    };
    expect(hasPageColours(pass)).toBe(false);
    expect(hasPageColours(mixed())).toBe(true);
    expect(hasPageColours(doc())).toBe(false);
  });

  it('a scan page set to colour in a black & white scan job gets Clean colour', () => {
    const scan = { ...doc(), colour: 'bw' as const, style: 'bw' as const, scan: true as const };
    const job = { ...scan, pageColour: { '1:0': 'colour' as const } };
    expect(styleOfPage(job, '1:0')).toBe('clean');
    expect(styleOfPage(job, '1:1')).toBe('bw');
  });
});
