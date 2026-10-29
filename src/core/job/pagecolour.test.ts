import { describe, expect, it } from 'vitest';
import { effectiveColour, jobFromIntake, jobReducer, normalizeJob, styleOfPage } from './job';

// Round 10 (owner: "What if some pages need to be printed in colour and some in black and white"): a mark per page,
// keyed "item:page" like page turns, over the job's own colour.
const intake = (types: string[]) =>
  ({
    intakeId: 'in1',
    rejected: 0,
    refusedByPolicy: 0,
    files: types.map((t, i) => ({ index: i + 1, path: `/p/${i + 1}`, sniffedType: t, bytes: 1, sha256: `h${i}` })),
  }) as never;
const doc = () => jobReducer(jobFromIntake('d', intake(['pdf']), 1), { type: 'setDocument' }, 2);

describe('page colours', () => {
  it('a page takes the job colour until it has a mark of its own', () => {
    const job = doc();
    expect(effectiveColour(job, '1:0')).toBe('colour');
    const marked = jobReducer(job, { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);
    expect(marked.pageColour).toEqual({ '1:1': 'bw' });
    expect(effectiveColour(marked, '1:1')).toBe('bw');
    expect(effectiveColour(marked, '1:0')).toBe('colour');
  });

  it('a mark that says what the job already says is dropped; null removes a mark', () => {
    const marked = jobReducer(doc(), { type: 'setPageColours', marks: { '1:0': 'bw', '1:1': 'bw' } }, 3);
    const back = jobReducer(marked, { type: 'setPageColours', marks: { '1:0': 'colour', '1:1': null } }, 4);
    expect(back.pageColour).toBeUndefined();
    // Nothing changes → the same job (no new revision).
    expect(jobReducer(marked, { type: 'setPageColours', marks: { '1:0': 'bw' } }, 5)).toBe(marked);
  });

  it('the top switch sets every page again: marks are cleared, even when the colour does not change', () => {
    const marked = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw' } }, 3);
    const same = jobReducer(marked, { type: 'setColour', colour: 'colour' }, 4);
    expect(same.pageColour).toBeUndefined();
    expect(same.colour).toBe('colour');
    const grey = jobReducer(marked, { type: 'setColour', colour: 'bw' }, 4);
    expect(grey.pageColour).toBeUndefined();
    expect(grey.colour).toBe('bw');
  });

  it('the first guess marks the grey pages of a job in colour (a black & white job is never guessed)', () => {
    const some = jobReducer(doc(), { type: 'someColour', marks: { '1:0': 'colour', '1:1': 'bw', '1:2': 'colour' } }, 3);
    expect(some.colour).toBe('colour');
    expect(some.pageColour).toEqual({ '1:1': 'bw' });
    const grey = jobReducer(doc(), { type: 'setColour', colour: 'bw' }, 3);
    expect(jobReducer(grey, { type: 'someColour', marks: { '1:1': 'bw' } }, 4)).toBe(grey);
  });

  it('each page has the style of its own colour: the job style when it fits, else the plain one', () => {
    let job = jobReducer(doc(), { type: 'setStyle', style: 'vibrant' }, 3);
    job = jobReducer(job, { type: 'setPageColours', marks: { '1:1': 'bw' } }, 4);
    expect(styleOfPage(job, '1:0')).toBe('vibrant');
    expect(styleOfPage(job, '1:1')).toBe('bw');
    let sharp = jobReducer(doc(), { type: 'setStyle', style: 'sharp' }, 3); // sharp is black & white: the job is grey
    sharp = jobReducer(sharp, { type: 'setPageColours', marks: { '1:1': 'colour' } }, 4);
    expect(styleOfPage(sharp, '1:0')).toBe('sharp');
    expect(styleOfPage(sharp, '1:1')).toBe('original');
  });

  it('marks survive saving and reading; marks of files that are gone, and broken marks, do not', () => {
    const job = jobReducer(doc(), { type: 'setPageColours', marks: { '1:1': 'bw', '1:2': 'bw' } }, 3);
    const read = normalizeJob(JSON.parse(JSON.stringify(job)));
    expect(read?.pageColour).toEqual({ '1:1': 'bw', '1:2': 'bw' });
    const odd = normalizeJob({ ...job, pageColour: { '1:1': 'bw', '9:0': 'bw', 'x:y': 'bw', '1:2': 'purple' } });
    expect(odd?.pageColour).toEqual({ '1:1': 'bw' });
    expect(normalizeJob({ ...job, pageColour: 'bw' })?.pageColour).toBeUndefined();
  });

  it('passport photos and ID cards take no marks', () => {
    const photos = jobFromIntake('p', intake(['jpeg']), 1);
    const passport = jobReducer(photos, { type: 'setPassport', item: 1 }, 2);
    expect(jobReducer(passport, { type: 'setPageColours', marks: { '1:0': 'bw' } }, 3).pageColour).toBeUndefined();
  });
});
