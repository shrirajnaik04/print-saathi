import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Job, type JobAction, jobFromIntake, jobReducer, normalizeJob } from './job';

const intake = {
  intakeId: 'in1',
  rejected: 0,
  refusedByPolicy: 0,
  files: [
    { index: 1, path: '/p/0001.jpg', sniffedType: 'jpeg', bytes: 10, sha256: 'a' },
    { index: 2, path: '/p/0002.pdf', sniffedType: 'pdf', bytes: 20, sha256: 'b' },
    { index: 3, path: '/p/0003.png', sniffedType: 'png', bytes: 30, sha256: 'a' },
  ],
} as never;

describe('jobFromIntake', () => {
  it('starts at rev 1 with every received file in order, photos marked printable', () => {
    const j = jobFromIntake('job1', intake, 1000);
    expect(j.rev).toBe(1);
    expect(j.items.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(j.intakeIds).toEqual(['in1']);
    expect(j.copies).toBe(1);
  });

  it('files chosen on Home are marked picked (shown as they are, never turned by the app); shares are not', () => {
    expect(jobFromIntake('job1', { ...(intake as object), pick: 'photos' } as never, 1000).picked).toBe(true);
    expect(jobFromIntake('job1', intake, 1000).picked).toBeUndefined();
    const kept = normalizeJob(
      JSON.parse(JSON.stringify(jobFromIntake('job1', { ...(intake as object), pick: 'cards' } as never, 1000))),
    );
    expect(kept?.picked).toBe(true);
  });

  it('flags the same photo twice (same content hash), keeping both by default (PLAN §D2b)', () => {
    const j = jobFromIntake('job1', intake, 1000);
    expect(j.duplicates).toEqual([[1, 3]]);
    expect(j.items).toHaveLength(3);
  });
});

describe('jobReducer (single writer, PLAN §D2c)', () => {
  const base = jobFromIntake('job1', intake, 1000);

  it('every change raises rev by exactly one', () => {
    const j = jobReducer(base, { type: 'setCopies', copies: 3 }, 2000);
    expect(j.rev).toBe(2);
    expect(j.copies).toBe(3);
    expect(j.updatedAt).toBe(2000);
  });

  it('a no-op change keeps the same object and rev', () => {
    expect(jobReducer(base, { type: 'setCopies', copies: 1 }, 2000)).toBe(base);
  });

  it('copies stay within 1..99', () => {
    expect(jobReducer(base, { type: 'setCopies', copies: 0 }, 2).copies).toBe(1);
    expect(jobReducer(base, { type: 'setCopies', copies: 500 }, 2).copies).toBe(99);
  });

  it('removing an item keeps the others in order', () => {
    expect(jobReducer(base, { type: 'removeItem', index: 2 }, 2).items.map((i) => i.index)).toEqual([1, 3]);
  });

  it('property: rev never goes backwards and grows by one per real change', () => {
    const action = fc.oneof(
      fc.integer({ min: -5, max: 120 }).map((c): JobAction => ({ type: 'setCopies', copies: c })),
      fc.constantFrom<JobAction>({ type: 'setColour', colour: 'bw' }, { type: 'setColour', colour: 'colour' }),
      fc.integer({ min: 1, max: 4 }).map((i): JobAction => ({ type: 'removeItem', index: i })),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        let j: Job = base;
        for (const a of actions) {
          const next = jobReducer(j, a, 5);
          if (next !== j && next.rev !== j.rev + 1) return false;
          if (next === j && next.rev !== j.rev) return false;
          j = next;
        }
        return j.copies >= 1 && j.copies <= 99;
      }),
      { numRuns: 1000 },
    );
  });
});

describe('printed (PLAN §D4: a job counts as sent once the printer has it)', () => {
  const job = jobFromIntake('j', { intakeId: 'i', rejected: 0, refusedByPolicy: 0, files: [] } as never, 1);
  it('markPrinted records when, once, and raises the revision', () => {
    const p = jobReducer(job, { type: 'markPrinted' }, 50);
    expect(p.printedAt).toBe(50);
    expect(p.rev).toBe(job.rev + 1);
    expect(jobReducer(p, { type: 'markPrinted' }, 60)).toBe(p);
  });
  it('a new job is not printed', () => {
    expect(job.printedAt).toBeUndefined();
  });
});

describe('Phase 3 choices: pages, order, turns, Undo (PLAN §I-7, §I-8)', () => {
  const base = jobFromIntake('job1', intake, 1000);

  it('a new job prints Best, in received order, nothing turned', () => {
    expect(base.pages).toBe('best');
    expect(base.order).toEqual([1, 2, 3]);
    expect(base.turns).toEqual({});
  });

  it('pages: Best or a count from 1 to the number of items', () => {
    expect(jobReducer(base, { type: 'setPages', pages: 2 }, 2).pages).toBe(2);
    expect(jobReducer(base, { type: 'setPages', pages: 99 }, 2).pages).toBe(3);
    expect(jobReducer(base, { type: 'setPages', pages: 0 }, 2).pages).toBe(1);
    expect(
      jobReducer(jobReducer(base, { type: 'setPages', pages: 2 }, 2), { type: 'setPages', pages: 'best' }, 3).pages,
    ).toBe('best');
  });

  it('move earlier / later swaps neighbours; at the ends nothing changes', () => {
    expect(jobReducer(base, { type: 'moveItem', index: 3, by: -1 }, 2).order).toEqual([1, 3, 2]);
    expect(jobReducer(base, { type: 'moveItem', index: 1, by: 1 }, 2).order).toEqual([2, 1, 3]);
    expect(jobReducer(base, { type: 'moveItem', index: 1, by: -1 }, 2)).toBe(base);
    expect(jobReducer(base, { type: 'moveItem', index: 3, by: 1 }, 2)).toBe(base);
  });

  it('turn adds a quarter turn clockwise, four turns come back to 0', () => {
    let j = base;
    for (let k = 1; k <= 4; k++) {
      j = jobReducer(j, { type: 'turnItem', index: 2 }, k);
      expect(j.turns[2] ?? 0).toBe(k % 4);
    }
  });

  it('remove then Undo puts the photo back where it was, turned as before', () => {
    const turned = jobReducer(
      jobReducer(base, { type: 'moveItem', index: 3, by: -1 }, 2),
      { type: 'turnItem', index: 3 },
      3,
    );
    const item = turned.items.find((i) => i.index === 3)!;
    const at = turned.order.indexOf(3);
    const removed = jobReducer(turned, { type: 'removeItem', index: 3 }, 4);
    expect(removed.order).toEqual([1, 2]);
    const back = jobReducer(removed, { type: 'restoreItem', item, at }, 5);
    expect(back.order).toEqual(turned.order);
    expect(back.items.map((i) => i.index).sort()).toEqual([1, 2, 3]);
    expect(back.turns[3]).toBe(1);
  });

  it('Undo of Remove brings back the size chosen on Adjust (review, 2026-10-24)', () => {
    const sized = jobReducer(base, { type: 'setSizes', sizes: { 1: 80, 2: 60, 3: 45 } }, 2);
    const item = sized.items.find((i) => i.index === 3)!;
    const removed = jobReducer(sized, { type: 'removeItem', index: 3 }, 3);
    expect(removed.sizes).toEqual({ 1: 80, 2: 60 });
    const back = jobReducer(removed, { type: 'restoreItem', item, at: 2, size: 45 }, 4);
    expect(back.sizes).toEqual({ 1: 80, 2: 60, 3: 45 });
    // Automatic sizes stay automatic: a size never makes a job "arranged" by itself.
    const auto = jobReducer(
      jobReducer(base, { type: 'removeItem', index: 3 }, 2),
      { type: 'restoreItem', item, at: 2, size: 45 },
      3,
    );
    expect(auto.sizes).toBeUndefined();
  });

  it('property: order is always exactly the items, in some order; pages stay in range', () => {
    const action = fc.oneof(
      fc
        .record({ index: fc.integer({ min: 1, max: 3 }), by: fc.constantFrom<-1 | 1>(-1, 1) })
        .map((a): JobAction => ({ type: 'moveItem', ...a })),
      fc.integer({ min: 1, max: 3 }).map((i): JobAction => ({ type: 'turnItem', index: i })),
      fc.integer({ min: 1, max: 3 }).map((i): JobAction => ({ type: 'removeItem', index: i })),
      fc
        .oneof(fc.constant<'best'>('best'), fc.integer({ min: -3, max: 9 }))
        .map((p): JobAction => ({ type: 'setPages', pages: p })),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), (actions) => {
        let j = base;
        for (const a of actions) j = jobReducer(j, a, 5);
        const items = j.items.map((i) => i.index).sort();
        const ok = [...j.order].sort().join() === items.join();
        const pagesOk = j.pages === 'best' || (j.pages >= 1 && j.pages <= Math.max(1, j.items.length));
        return ok && pagesOk;
      }),
      { numRuns: 2000 },
    );
  });

  it('a job saved before these choices existed is read with safe defaults', () => {
    const { pages: _p, order: _o, turns: _t, ...old } = base;
    const j = normalizeJob(old);
    expect(j?.pages).toBe('best');
    expect(j?.order).toEqual([1, 2, 3]);
    expect(j?.turns).toEqual({});
    expect(normalizeJob({ junk: 1 })).toBeNull();
  });
});

describe('Phase 3 gate fixes (job)', () => {
  const base = jobFromIntake('job1', intake, 1000); // items 1 (jpeg), 2 (pdf), 3 (png)

  /** #5: the Photos screen only shows photos; a move must pass over files it does not show. */
  it('move earlier / later skips items that are not among the photos on screen', () => {
    const j = jobReducer(base, { type: 'moveItem', index: 3, by: -1, among: [1, 3] }, 2);
    expect(j.order).toEqual([3, 2, 1]);
    expect(jobReducer(base, { type: 'moveItem', index: 1, by: -1, among: [1, 3] }, 2)).toBe(base);
  });

  /** #7: Undo also puts back the page count that removing the photo had lowered. */
  it('Undo restores the page count the removal lowered', () => {
    const three = jobReducer(base, { type: 'setPages', pages: 3 }, 2);
    const item = three.items.find((i) => i.index === 2)!;
    const removed = jobReducer(three, { type: 'removeItem', index: 2 }, 3);
    expect(removed.pages).toBe(2);
    const back = jobReducer(removed, { type: 'restoreItem', item, at: 1, pages: 3 }, 4);
    expect(back.pages).toBe(3);
  });

  /** #10: corrupt stored values never break a screen; they read as safe defaults. */
  it('normalizeJob repairs bad pages, turns and items', () => {
    const j = normalizeJob({ ...base, pages: 'x', turns: { 1: 7, 3: 2 }, items: [...base.items, null, { junk: 1 }] });
    expect(j?.pages).toBe('best');
    expect(j?.turns).toEqual({ 3: 2 });
    expect(j?.items.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(normalizeJob({ ...base, pages: -4 })?.pages).toBe('best');
  });
});

describe('Phase 3 re-review fixes (job)', () => {
  const base = jobFromIntake('job1', intake, 1000);
  it('normalizeJob also repairs fractional pages, text order entries, copies and duplicates', () => {
    const j = normalizeJob({ ...base, pages: 2.5, order: ['1', '2', '3'], copies: 0.4, duplicates: 'x' });
    expect(j?.pages).toBe(3);
    expect(j?.order).toEqual([1, 2, 3]);
    expect(j?.copies).toBe(1);
    expect(j?.duplicates).toEqual([[1, 3]]);
    expect(normalizeJob({ ...base, copies: 500 })?.copies).toBe(99);
  });
});

describe('big jobs in parts remember how far they printed (Phase 5 gate M1)', () => {
  const job = jobFromIntake('j', intake, 1);
  it('a part counts only once the printer took it, and only for the plan it was cut from', () => {
    const started = jobReducer(job, { type: 'partStarted', planHash: 'aaaa', part: 0 }, 2);
    expect(started.partsDone).toBeUndefined();
    const done = jobReducer(started, { type: 'partPrinted' }, 3);
    expect(done.partsDone).toEqual({ planHash: 'aaaa', done: 1 });
    expect(done.partPrinting).toBeUndefined();
    // Part 2 of the same plan.
    const two = jobReducer(
      jobReducer(done, { type: 'partStarted', planHash: 'aaaa', part: 1 }, 4),
      { type: 'partPrinted' },
      5,
    );
    expect(two.partsDone).toEqual({ planHash: 'aaaa', done: 2 });
  });
  it('printing part 1 again never moves the progress backwards', () => {
    const two = { ...job, partsDone: { planHash: 'aaaa', done: 2 } } as Job;
    const again = jobReducer(
      jobReducer(two, { type: 'partStarted', planHash: 'aaaa', part: 0 }, 2),
      { type: 'partPrinted' },
      3,
    );
    expect(again.partsDone).toEqual({ planHash: 'aaaa', done: 2 });
  });
  it('a part of a changed plan starts the count again', () => {
    const one = { ...job, partsDone: { planHash: 'aaaa', done: 1 } } as Job;
    const other = jobReducer(
      jobReducer(one, { type: 'partStarted', planHash: 'bbbb', part: 0 }, 2),
      { type: 'partPrinted' },
      3,
    );
    expect(other.partsDone).toEqual({ planHash: 'bbbb', done: 1 });
  });
  it('partPrinted without a part being printed changes nothing', () => {
    expect(jobReducer(job, { type: 'partPrinted' }, 2)).toBe(job);
  });
  it('a damaged stored progress reads as none', () => {
    expect(normalizeJob({ ...job, partsDone: { planHash: 3, done: 'x' } })?.partsDone).toBeUndefined();
    expect(normalizeJob({ ...job, partPrinting: 'x' })?.partPrinting).toBeUndefined();
  });
});

describe('a fully printed big job starts again from part 1 next time (Phase 5 gate M1)', () => {
  it('markPrinted forgets the part progress', () => {
    const job = { ...jobFromIntake('j', intake, 1), partsDone: { planHash: 'aaaa', done: 2 } } as Job;
    expect(jobReducer(job, { type: 'markPrinted' }, 5).partsDone).toBeUndefined();
  });
});

describe('passport choice (Phase 6 gate m7, M3, m2)', () => {
  const job = jobFromIntake('j', intake, 1);
  it('setPassport picks the photo with 5 photos at 35 × 45 mm, a 1½ pt border and the passport layout', () => {
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    expect(p.layout).toBe('passport');
    expect(p.passport).toEqual({ item: 1, count: 5, preset: '35x45', border: 1.5 });
  });
  it('a photo that is not in the job changes nothing', () => {
    expect(jobReducer(job, { type: 'setPassport', item: 99 }, 2)).toBe(job);
  });
  it('the count stays 1–60', () => {
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    expect(jobReducer(p, { type: 'setPassportCount', count: 0 }, 3).passport?.count).toBe(1);
    expect(jobReducer(p, { type: 'setPassportCount', count: 500 }, 3).passport?.count).toBe(60);
  });
  it('a frame is remembered with the turn and size it was made for; a broken frame is dropped', () => {
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    const c = jobReducer(p, { type: 'setPassportCrop', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 } }, 3);
    expect(c.passport?.crop).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.6, turns: 0, preset: '35x45', shape: 35 / 45 });
    expect(
      jobReducer(c, { type: 'setPassportCrop', crop: { x: 0.8, y: 0, w: 0.5, h: 1 } }, 4).passport?.crop,
    ).toBeUndefined();
  });
  it('another photo starts with its own centred frame', () => {
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    const c = jobReducer(p, { type: 'setPassportCrop', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 } }, 3);
    expect(jobReducer(c, { type: 'setPassport', item: 3 }, 4).passport?.crop).toBeUndefined();
  });
  it('removing the passport photo ends the passport choice (never a broken passport job)', () => {
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    const r = jobReducer(p, { type: 'removeItem', index: 1 }, 3);
    expect(r.passport).toBeUndefined();
    expect(r.layout).toBe('onePerPage');
  });
});

describe('removing a photo once chosen for passport, in another layout (Phase 6 re-review N1)', () => {
  it('drops the old passport choice but keeps the layout the shopkeeper chose', () => {
    const job = jobFromIntake('j', intake, 1);
    const p = jobReducer(job, { type: 'setPassport', item: 1 }, 2);
    const all = jobReducer(p, { type: 'setLayout', layout: 'allOnOne' }, 3);
    const r = jobReducer(all, { type: 'removeItem', index: 1 }, 4);
    expect(r.passport).toBeUndefined();
    expect(r.layout).toBe('allOnOne');
  });
});

describe('stored document choices are repaired, never trusted (Phase 7)', () => {
  it('drops pages that are not whole numbers or not in the job, and turns that are not 0–3', () => {
    const job = jobFromIntake('j', intake, 1);
    const bad = normalizeJob({
      ...job,
      docPages: [{ item: 2, page: 0 }, { item: 2, page: -1 }, { item: 99, page: 0 }, { item: 2, page: 1.5 }, 'x'],
      docTurns: { '2:0': 1, '2:1': 7, x: 'y' },
    });
    expect(bad?.docPages).toEqual([{ item: 2, page: 0 }]);
    expect(bad?.docTurns).toEqual({ '2:0': 1 });
  });
});

describe('New files arrived → Add to this job (PLAN §I-17, §K9)', () => {
  const more = [
    { index: 1, path: '/q/0004.jpg', type: 'jpeg', bytes: 40, sha256: 'a' },
    { index: 2, path: '/q/0005.jpg', type: 'jpeg', bytes: 50, sha256: 'c' },
  ] as Job['items'];

  it('the new files come after the job’s own, numbered on, printed last; same photos are flagged', () => {
    // Photo 3 was turned, then removed: its turn is kept for Undo, so a new file must never take its number.
    const turned = jobReducer(jobFromIntake('job1', intake, 1000), { type: 'turnItem', index: 3 }, 1400);
    const base = jobReducer(turned, { type: 'removeItem', index: 3 }, 1500);
    const j = jobReducer(
      base,
      { type: 'addItems', items: more, intakeId: 'in2', notices: ['1 file did not arrive.'] },
      2000,
    );
    expect(j.items.map((i) => [i.index, i.path])).toEqual([
      [1, '/p/0001.jpg'],
      [2, '/p/0002.pdf'],
      [4, '/q/0004.jpg'], // after every index the job still mentions
      [5, '/q/0005.jpg'],
    ]);
    expect(j.order).toEqual([1, 2, 4, 5]);
    expect(j.turns[4]).toBeUndefined();
    expect(j.duplicates).toEqual([[1, 4]]);
    expect(j.intakeIds).toEqual(['in1', 'in2']);
    expect(j.notices).toContain('1 file did not arrive.');
    expect(j.rev).toBe(base.rev + 1);
  });

  it('what was chosen for the old files only starts again: pages to print, black edges, printed', () => {
    let j = jobFromIntake('job1', intake, 1000);
    j = jobReducer(j, { type: 'setDocument' }, 1100);
    j = jobReducer(j, { type: 'setDocPages', pages: [{ item: 1, page: 0 }] }, 1200);
    j = jobReducer(j, { type: 'answerEdges', remove: false }, 1300);
    j = jobReducer(j, { type: 'markPrinted' }, 1400);
    j = jobReducer(j, { type: 'addItems', items: more, intakeId: 'in2', notices: [] }, 2000);
    expect(j.docPages).toBeUndefined(); // every page of every file, the new ones included
    expect(j.edges).toBeUndefined(); // asked again: the new photos may have black edges
    expect(j.printedAt).toBeUndefined(); // new files not printed yet: offered as Continue again
  });

  it('the new files keep the numbers they were given when free; a number in use is never taken', () => {
    const base = jobFromIntake('job1', intake, 1000);
    const given = more.map((m, k) => ({ ...m, index: 9 + k }));
    expect(jobReducer(base, { type: 'addItems', items: given, intakeId: 'in2', notices: [] }, 2000).order).toEqual([
      1, 2, 3, 9, 10,
    ]);
    const clash = more.map((m, k) => ({ ...m, index: 2 + k }));
    expect(jobReducer(base, { type: 'addItems', items: clash, intakeId: 'in2', notices: [] }, 2000).order).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('nothing to add changes nothing', () => {
    const base = jobFromIntake('job1', intake, 1000);
    expect(jobReducer(base, { type: 'addItems', items: [], intakeId: 'in2', notices: [] }, 2000)).toBe(base);
  });
});

describe("the owner's defaults (Settings, Phase 10b)", () => {
  it('a new job starts in the colour chosen for photos', () => {
    expect(jobFromIntake('j', intake, 1, 'bw').colour).toBe('bw');
    expect(jobFromIntake('j', intake, 1).colour).toBe('colour');
  });

  it("a document starts in the owner's document colour the first time only", () => {
    const base = jobFromIntake('j', intake, 1);
    expect(jobReducer(base, { type: 'setDocument', colour: 'colour' }, 2).colour).toBe('colour');
    expect(jobReducer(base, { type: 'setDocument' }, 2).colour).toBe('bw');
  });

  it("passport photos start with the owner's size and count, never replacing the shopkeeper's own choice", () => {
    const base = jobFromIntake('j', intake, 1);
    const d = { count: 8, preset: '20x25' as const };
    const first = jobReducer(base, { type: 'setPassport', item: 1, defaults: d }, 2);
    expect(first.passport).toMatchObject({ count: 8, preset: '20x25' });
    const changed = jobReducer(first, { type: 'setPassportCount', count: 6 }, 3);
    expect(jobReducer(changed, { type: 'setPassport', item: 3, defaults: d }, 4).passport).toMatchObject({ count: 6 });
  });
});

describe('passport photos start in colour (Phase 10b review I3)', () => {
  it('even when photos were set to start in black & white; a later choice of the shopkeeper stays', () => {
    const bw = jobFromIntake('j', intake, 1, 'bw');
    const pp = jobReducer(bw, { type: 'setPassport', item: 1 }, 2);
    expect(pp.colour).toBe('colour');
    const greyed = jobReducer(pp, { type: 'setColour', colour: 'bw' }, 3);
    expect(jobReducer(greyed, { type: 'setPassport', item: 3 }, 4).colour).toBe('bw');
  });
});

describe('paper (Phase 10c)', () => {
  it('photos can go on A4 or 4×6 photo paper; a new job starts on the paper given', () => {
    const j = jobFromIntake('j', intake, 1, 'colour', 'PHOTO_4x6');
    expect(j.paper).toBe('PHOTO_4x6');
    expect(jobReducer(j, { type: 'setPaper', paper: 'A4' }, 2).paper).toBe('A4');
  });
});
