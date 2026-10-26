import { describe, expect, it } from 'vitest';
import type { Intake } from '../../native/printEngine';
import { problemMessages } from '../intake/messages';
import { buildPlan } from '../plan/plan';
import { documentLine } from '../plan/summary';
import { jobFromIntake, jobReducer, normalizeJob, textItemOf } from './job';

// Owner, round 8: a customer's WhatsApp text message printed. It arrives as a PDF the engine made of the text, carrying
// its text size; Edit text and Text size make a new PDF, saved in the job by setTextPdf.
const textIntake = {
  intakeId: 't1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [{ index: 1, path: '/j/t1/src/0001.pdf', sniffedType: 'pdf', bytes: 900, sha256: 'a', text: { size: 12 } }],
} as Intake;

describe('a text message job (owner, round 8)', () => {
  const job = jobFromIntake('t1', textIntake, 1);
  it('keeps the text size on its one PDF item, and is found as the text item', () => {
    expect(job.items[0]?.type).toBe('pdf');
    expect(job.items[0]?.text).toEqual({ size: 12 });
    expect(textItemOf(job)?.index).toBe(1);
    expect(
      textItemOf(
        jobFromIntake('p', { ...textIntake, files: [{ ...textIntake.files[0], text: undefined }] } as never, 1),
      ),
    ).toBeUndefined();
  });
  it('a stored size the app never offers is dropped; a good one is kept', () => {
    const bad = normalizeJob({ ...job, items: [{ ...job.items[0], text: { size: 13 } }] });
    expect(bad?.items[0]?.text).toBeUndefined();
    expect(normalizeJob(JSON.parse(JSON.stringify(job)))?.items[0]?.text).toEqual({ size: 12 });
  });
  it('setTextPdf puts the new PDF and size on the item (Edit text, Text size)', () => {
    const r = jobReducer(
      job,
      { type: 'setTextPdf', index: 1, path: '/j/t1/src/0001-18-9.pdf', bytes: 1200, sha256: 'b', size: 18 },
      2,
    );
    expect(r.items[0]).toMatchObject({ path: '/j/t1/src/0001-18-9.pdf', bytes: 1200, sha256: 'b', text: { size: 18 } });
    expect(r.rev).toBe(job.rev + 1);
    expect(jobReducer(job, { type: 'setTextPdf', index: 9, path: 'x', bytes: 1, sha256: 'c', size: 12 }, 2)).toBe(job);
    expect(
      jobReducer(job, { type: 'setTextPdf', index: 1, path: 'x', bytes: 1, sha256: 'c', size: 16 as never }, 2),
    ).toBe(job);
  });
  it('Ready says "Text message", not "1 PDF"', () => {
    const doc = jobReducer(job, { type: 'setDocument' }, 2);
    const plan = buildPlan(
      doc,
      new Map(),
      undefined,
      undefined,
      new Map([
        [
          1,
          {
            pages: 2,
            sizes: [
              [595, 842],
              [595, 842],
            ],
            forms: false,
            locked: false,
          },
        ],
      ]),
    );
    const line = documentLine(plan, new Set([1]), new Set([1]));
    expect(line.startsWith('Text message · 2 pages')).toBe(true);
  });
  it('a share of empty or too long text says what to do', () => {
    const one = (reason: string) =>
      problemMessages({
        intakeId: 'x',
        rejected: 1,
        refusedByPolicy: 0,
        files: [],
        problems: [{ index: 1, reason }],
      } as never);
    expect(one('emptyText')).toEqual(['There is no text to print.']);
    expect(one('textTooLong')).toEqual([
      'This message is too long to print here. Ask the customer to send it as a PDF.',
    ]);
  });
});
