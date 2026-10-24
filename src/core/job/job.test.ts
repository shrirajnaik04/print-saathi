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
    // Up to 100 (owner, round 3: "custom number … if it is big"; was 60).
    expect(jobReducer(p, { type: 'setPassportCount', count: 500 }, 3).passport?.count).toBe(100);
    expect(jobReducer(p, { type: 'setPassportCount', count: 100 }, 3).passport?.count).toBe(100);
    expect(jobReducer(p, { type: 'setPassportCount', count: 61 }, 3).passport?.count).toBe(61);
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

  it('a document starts in colour (owner, round 3); a colour given with it is still taken', () => {
    const base = jobFromIntake('j', intake, 1);
    expect(jobReducer(base, { type: 'setDocument' }, 2).colour).toBe('colour');
    expect(jobReducer(base, { type: 'setDocument', colour: 'bw' }, 2).colour).toBe('bw');
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

// Owner, 2026-10-24: the scanner app's crop, each corner free; a photo has a crop or a straightened frame, never both.
describe('straightened frames (spec 2026-10-24 Part 4)', () => {
  const job = jobFromIntake('job1', intake, 1000);
  const quad = [0.1, 0.12, 0.85, 0.05, 0.9, 0.8, 0.15, 0.92];

  it('setQuad keeps the frame and clears the crop; setCrop clears the frame; null clears it', () => {
    const cropped = jobReducer(job, { type: 'setCrop', item: 1, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, 2);
    const straight = jobReducer(cropped, { type: 'setQuad', item: 1, quad }, 3);
    expect(straight.quads).toEqual({ 1: quad });
    expect(straight.crops).toBeUndefined();
    const back = jobReducer(straight, { type: 'setCrop', item: 1, crop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } }, 4);
    expect(back.quads).toBeUndefined();
    expect(back.crops).toEqual({ 1: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } });
    expect(jobReducer(straight, { type: 'setQuad', item: 1, quad: null }, 4).quads).toBeUndefined();
  });

  it('a crossed frame, a frame outside the photo or one for a file not in the job is not taken', () => {
    expect(jobReducer(job, { type: 'setQuad', item: 1, quad: [0.9, 0.9, 0.1, 0.1, 0.9, 0.1, 0.1, 0.9] }, 2)).toBe(job);
    expect(jobReducer(job, { type: 'setQuad', item: 1, quad: [0, 0, 1.5, 0, 1, 1, 0, 1] }, 2)).toBe(job);
    expect(jobReducer(job, { type: 'setQuad', item: 9, quad }, 2)).toBe(job);
  });

  it('a saved job keeps only real frames of its photos', () => {
    const saved = JSON.parse(JSON.stringify({ ...job, quads: { 1: quad, 3: [1, 2, 3], 7: quad } }));
    expect(normalizeJob(saved)?.quads).toEqual({ 1: quad });
  });

  it('Remove black edges never adds a crop to a straightened photo', () => {
    let j = jobReducer(job, { type: 'setQuad', item: 1, quad }, 2);
    j = jobReducer(j, { type: 'setSuggestions', crops: { 1: { x: 0, y: 0.1, w: 1, h: 0.8 } } }, 3);
    j = jobReducer(j, { type: 'answerEdges', remove: true }, 4);
    expect(j.crops?.[1]).toBeUndefined();
    expect(j.quads?.[1]).toEqual(quad);
  });

  it('a removed straightened photo keeps its frame for Undo, and new files never take its number', () => {
    let j = jobReducer(job, { type: 'setQuad', item: 3, quad }, 2);
    j = jobReducer(j, { type: 'removeItem', index: 3 }, 3);
    expect(j.quads?.[3]).toEqual(quad);
    const added = jobReducer(
      j,
      {
        type: 'addItems',
        items: [{ index: 3, path: '/p/x.jpg', type: 'jpeg', bytes: 1, sha256: 'z' }],
        intakeId: 'in2',
        notices: [],
      },
      4,
    );
    expect(added.items.map((i) => i.index)).not.toContain(3);
  });
});

describe('Turn left (the scanner-style crop, owner 2026-10-24)', () => {
  it('turns a quarter anticlockwise; Turn right stays clockwise', () => {
    const job = jobFromIntake('job1', intake, 1000);
    expect(jobReducer(job, { type: 'turnItem', index: 1, by: 3 }, 2).turns[1]).toBe(3);
    expect(jobReducer(job, { type: 'turnItem', index: 1 }, 2).turns[1]).toBe(1);
    const twice = jobReducer(
      jobReducer(job, { type: 'turnItem', index: 1, by: 3 }, 2),
      { type: 'turnItem', index: 1 },
      3,
    );
    expect(twice.turns[1]).toBe(0);
  });
});

// Press and hold to place a photo anywhere (owner, 2026-10-24): spots are each photo's centre on its page.
describe('photos placed by hand (spec 2026-10-24 Part 5)', () => {
  const job = jobFromIntake('job1', intake, 1000);
  const spots = { 1: { page: 0, x: 50, y: 60, z: 1 }, 3: { page: 0, x: 120, y: 60, z: 2 } };
  const placed = jobReducer(job, { type: 'setSpots', spots, sizes: { 1: 60, 3: 70 } }, 2);

  it('the first drop fixes every photo where it is, with its size', () => {
    expect(placed.spots).toEqual(spots);
    expect(placed.sizes).toEqual({ 1: 60, 3: 70 });
  });

  it('placeItem moves one photo, puts it on top, and may set its size', () => {
    const j = jobReducer(placed, { type: 'placeItem', item: 1, page: 1, x: 30, y: 40, size: 80 }, 3);
    expect(j.spots?.[1]).toEqual({ page: 1, x: 30, y: 40, z: 3 });
    expect(j.sizes?.[1]).toBe(80);
    expect(j.spots?.[3]).toEqual(spots[3]);
    // Not a photo of the job, or not a real place: not taken.
    expect(jobReducer(placed, { type: 'placeItem', item: 9, page: 0, x: 1, y: 1 }, 3)).toBe(placed);
    expect(jobReducer(placed, { type: 'placeItem', item: 1, page: -1, x: 1, y: 1 }, 3)).toBe(placed);
    expect(jobReducer(placed, { type: 'placeItem', item: 1, page: 0, x: Number.NaN, y: 1 }, 3)).toBe(placed);
  });

  it('all: several changes as one, with one new revision', () => {
    const j = jobReducer(
      placed,
      {
        type: 'all',
        actions: [
          { type: 'turnItem', index: 1 },
          { type: 'placeItem', item: 1, page: 0, x: 55, y: 65 },
        ],
      },
      3,
    );
    expect(j.rev).toBe(placed.rev + 1);
    expect(j.turns[1]).toBe(1);
    expect(j.spots?.[1]?.x).toBe(55);
    expect(jobReducer(placed, { type: 'all', actions: [] }, 3)).toBe(placed);
  });

  it('Automatic, another paper, direction or layout put every photo back in rows (Review Focus 5)', () => {
    expect(jobReducer(placed, { type: 'setSizes', sizes: null }, 3).spots).toBeUndefined();
    expect(jobReducer(placed, { type: 'setSizes', sizes: null }, 3).sizes).toBeUndefined();
    expect(jobReducer(placed, { type: 'setPaper', paper: 'PHOTO_4x6' }, 3).spots).toBeUndefined();
    expect(jobReducer(placed, { type: 'setDirection', direction: 'landscape' }, 3).spots).toBeUndefined();
    expect(jobReducer(placed, { type: 'setLayout', layout: 'morePages' }, 3).spots).toBeUndefined();
    // Turning or cropping keeps them.
    expect(jobReducer(placed, { type: 'turnItem', index: 1 }, 3).spots).toEqual(spots);
  });

  it('a saved job keeps only real spots of its photos; new files never take a placed photo’s number', () => {
    const saved = JSON.parse(
      JSON.stringify({ ...placed, spots: { ...spots, 2: { page: 0, x: 'a', y: 1, z: 1 }, 8: spots[1] } }),
    );
    expect(normalizeJob(saved)?.spots).toEqual(spots);
    const removed = jobReducer(placed, { type: 'removeItem', index: 3 }, 3);
    const added = jobReducer(
      removed,
      {
        type: 'addItems',
        items: [{ index: 3, path: '/p/y.jpg', type: 'jpeg', bytes: 1, sha256: 'y' }],
        intakeId: 'in3',
        notices: [],
      },
      4,
    );
    expect(added.items.map((i) => i.index)).not.toContain(3);
  });

  it('Undo of Remove puts the photo back on its spot', () => {
    const removed = jobReducer(placed, { type: 'removeItem', index: 3 }, 3);
    const item = placed.items.find((i) => i.index === 3);
    if (!item) throw new Error('no item');
    const back = jobReducer(removed, { type: 'restoreItem', item, at: 1, pages: 'best', size: 70, spot: spots[3] }, 4);
    expect(back.spots?.[3]).toEqual(spots[3]);
  });
});

describe('a photo turned to any angle (owner, round 3: the rotate handle)', () => {
  it('rotateItem sets the quarter turns and the tilt; straight leaves no tilt', () => {
    const job = jobFromIntake('job1', intake, 1000);
    const r = jobReducer(job, { type: 'rotateItem', index: 1, angle: 100 }, 2);
    expect(r.turns[1]).toBe(1);
    expect(r.tilts?.[1]).toBe(10);
    const straight = jobReducer(r, { type: 'rotateItem', index: 1, angle: 180 }, 3);
    expect(straight.turns[1]).toBe(2);
    expect(straight.tilts).toBeUndefined();
    // Not a photo of the job: nothing changes.
    expect(jobReducer(job, { type: 'rotateItem', index: 99, angle: 10 }, 2)).toBe(job);
  });
  it('Turn keeps the tilt', () => {
    const job = jobReducer(jobFromIntake('job1', intake, 1000), { type: 'rotateItem', index: 1, angle: 10 }, 2);
    const t = jobReducer(job, { type: 'turnItem', index: 1 }, 3);
    expect([t.turns[1], t.tilts?.[1]]).toEqual([1, 10]);
  });
  it('a saved job keeps only good tilts', () => {
    const job = jobFromIntake('job1', intake, 1000);
    const read = normalizeJob({ ...job, tilts: { 1: 12.5, 2: 80, 3: 'x', 99: 5 } });
    expect(read?.tilts).toEqual({ 1: 12.5 });
  });
});

describe('colour by default (owner, round 3: "all print output must be colour")', () => {
  it('a job made a document starts in colour', () => {
    const job = jobFromIntake('job1', intake, 1000);
    expect(jobReducer(job, { type: 'setDocument' }, 2).colour).toBe('colour');
  });
});

describe('Print front only (review, 2026-10-24)', () => {
  it('keeps the cards’ own size', () => {
    const job = jobFromIntake('job1', intake, 1000);
    const two = jobReducer(
      job,
      {
        type: 'setIdCards',
        cards: [
          { item: 1, quad: [0.1, 0.1, 0.9, 0.1, 0.9, 0.5, 0.1, 0.5], turns: 0 },
          { item: 3, quad: [0.1, 0.5, 0.9, 0.5, 0.9, 0.9, 0.1, 0.9], turns: 0 },
        ],
        size: 'custom',
      },
      2,
    );
    const sized = jobReducer(two, { type: 'setIdCardScale', scale: 1.5 }, 3);
    const front = sized.idCard?.cards[0];
    if (!front) throw new Error('no card');
    expect(jobReducer(sized, { type: 'setIdCards', cards: [front] }, 4).idCard?.scale).toBe(1.5);
  });
});

// Owner, round 4: "where is the paper type selection? normal paper / glossy paper". A reminder only (Android lets no app
// set it): the job keeps the choice; anything else in an old or broken file reads as plain paper.
describe('paper type', () => {
  it('glossy is kept, plain clears it, anything else reads as plain', () => {
    const j = jobFromIntake('job1', intake, 1000);
    expect(j.paperType).toBeUndefined();
    const g = jobReducer(j, { type: 'setPaperType', paperType: 'glossy' }, 2000);
    expect(g.paperType).toBe('glossy');
    expect(g.rev).toBe(j.rev + 1);
    expect(jobReducer(g, { type: 'setPaperType', paperType: 'glossy' }, 3000)).toBe(g);
    expect(jobReducer(g, { type: 'setPaperType', paperType: 'plain' }, 3000).paperType).toBeUndefined();
    expect(normalizeJob({ ...g, paperType: 'matte' })?.paperType).toBeUndefined();
    expect(normalizeJob(g)?.paperType).toBe('glossy');
  });
});

// Owner, round 4: ID card sides turn a quarter at a time (Turn left / Turn right).
describe('ID card quarter turns', () => {
  const q = [0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43];
  const card = () =>
    jobReducer(jobFromIntake('job1', intake, 1000), { type: 'setIdCards', cards: [{ item: 1, quad: q, turns: 0 }] }, 2);
  it('Turn right four times brings a card back; Turn left is three right', () => {
    let j = card();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      j = jobReducer(j, { type: 'turnIdCard', at: 0, by: 1 }, 3 + i);
      seen.push(j.idCard?.cards[0]?.turns ?? -1);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
    expect(jobReducer(card(), { type: 'turnIdCard', at: 0, by: 3 }, 9).idCard?.cards[0]?.turns).toBe(3);
  });
  it('quarter turns are kept (saved and loaded); anything else reads as 0; an old half turn stays', () => {
    const j = jobReducer(card(), { type: 'setIdCards', cards: [{ item: 1, quad: q, turns: 1 }] }, 3);
    expect(j.idCard?.cards[0]?.turns).toBe(1);
    expect(normalizeJob(j)?.idCard?.cards[0]?.turns).toBe(1);
    const bad = { ...j, idCard: { ...j.idCard, cards: [{ item: 1, quad: q, turns: 7 }] } };
    expect(normalizeJob(bad)?.idCard?.cards[0]?.turns).toBe(0);
    const half = { ...j, idCard: { ...j.idCard, cards: [{ item: 1, quad: q, turns: 2 }] } };
    expect(normalizeJob(half)?.idCard?.cards[0]?.turns).toBe(2);
  });
});
