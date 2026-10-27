import { describe, expect, it } from 'vitest';
import type { Intake } from '../../native/printEngine';
import { buildPlan } from '../plan/plan';
import { documentLine } from '../plan/summary';
import { jobFromIntake, jobReducer, normalizeJob } from './job';
import { unprintableNotes, unprintableText } from './unprintable';

// Round 9 (owner: "when doc file is shared … we get this error"): Office files are named by their kind, print through
// WPS Office (Phase 44), and those the engine made into pages print as documents named "Word file" (Phases 45–47).
const intake = (files: Intake['files']) => ({ intakeId: 'o1', rejected: 0, refusedByPolicy: 0, files }) as Intake;
const office = intake([
  {
    index: 1,
    path: '/j/o1/src/0001.pdf',
    sniffedType: 'pdf',
    bytes: 9,
    sha256: 'a',
    office: { kind: 'word', format: 'ooxml', missed: true },
  },
  {
    index: 2,
    path: '/j/o1/src/0002.office',
    sniffedType: 'office',
    bytes: 9,
    sha256: 'b',
    office: { kind: 'powerpoint', format: 'ole' },
  },
]);

describe('Office files (round 9)', () => {
  const job = jobFromIntake('o1', office, 1);

  it('jobFromIntake keeps the kind, format and missed parts', () => {
    expect(job.items[0]?.office).toEqual({ kind: 'word', format: 'ooxml', missed: true });
    expect(job.items[1]?.office).toEqual({ kind: 'powerpoint', format: 'ole' });
    expect(normalizeJob(JSON.parse(JSON.stringify(job)))?.items[0]?.office).toEqual({
      kind: 'word',
      format: 'ooxml',
      missed: true,
    });
  });

  it('a stray kind reads as an Office file; a broken one is dropped', () => {
    const odd = normalizeJob({ ...job, items: [{ ...job.items[1], office: { kind: 'zzz', format: 'nope' } }] });
    expect(odd?.items[0]?.office).toEqual({ kind: 'office' });
    const broken = normalizeJob({ ...job, items: [{ ...job.items[1], office: 'word' }] });
    expect(broken?.items[0]?.office).toBeUndefined();
  });

  it('Office files are no longer "can\'t be printed yet": the Office card speaks for them', () => {
    expect(unprintableNotes(job.items)).toEqual([]);
    expect(unprintableText('office', 'word')).toBe('Word file');
    expect(unprintableText('office', 'excel')).toBe('Excel file');
    expect(unprintableText('office')).toBe('Office file');
  });

  it('Ready names a Word file made into pages', () => {
    const doc = jobReducer(
      jobFromIntake('o2', intake([office.files[0] as Intake['files'][0]]), 1),
      { type: 'setDocument' },
      2,
    );
    const facts = new Map([
      [
        1,
        {
          pages: 3,
          sizes: [
            [595, 842],
            [595, 842],
            [595, 842],
          ] as [number, number][],
          forms: false,
          locked: false,
        },
      ],
    ]);
    const line = documentLine(
      buildPlan(doc, new Map(), undefined, undefined, facts),
      new Set([1]),
      new Set(),
      false,
      new Map([[1, 'word']]),
    );
    expect(line).toBe('Word file · 3 pages · A4 · Colour · 1 copy');
    const two = documentLine(
      buildPlan(
        jobReducer(
          jobFromIntake(
            'o3',
            intake([
              office.files[0] as Intake['files'][0],
              { ...(office.files[0] as Intake['files'][0]), index: 2, sha256: 'c' },
            ]),
            1,
          ),
          { type: 'setDocument' },
          2,
        ),
        new Map(),
        undefined,
        undefined,
        new Map([...facts, [2, facts.get(1) as never]]),
      ),
      new Set([1, 2]),
      new Set(),
      false,
      new Map([
        [1, 'word'],
        [2, 'word'],
      ]),
    );
    expect(two.startsWith('2 Word files · 6 pages')).toBe(true);
  });
});
