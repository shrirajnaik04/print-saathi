import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptPaper, cropChain, cropQueue, paperActions, paperArea } from './papers';

vi.mock('../native/printEngine', () => ({ PrintEngine: { findPage: vi.fn() } }));
const engine = async () =>
  (await import('../native/printEngine')).PrintEngine.findPage as unknown as ReturnType<typeof vi.fn>;

// Round 12 (owner, 2026-11-20): a photo of a paper document is cut to the paper's edges, as a scanner app does, and the
// shopkeeper checks each photo's corners before it goes onto its page ("one on each page").
const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];

describe('a paper page found in a photo', () => {
  it('its area is its share of the photo', () => {
    expect(paperArea(box(0, 0, 1, 1))).toBeCloseTo(1, 9);
    expect(paperArea(box(0.1, 0.1, 0.9, 0.9))).toBeCloseTo(0.64, 9);
    expect(paperArea([0.1, 0.1, 0.9, 0.2, 0.8, 0.9, 0.2, 0.8])).toBeGreaterThan(0.3);
  });

  it('is taken when it is a real part of the photo: from 30 % up to nearly all of it', () => {
    expect(acceptPaper(box(0.1, 0.08, 0.9, 0.92), 0.9)).toBe(true);
    expect(acceptPaper(box(0.4, 0.4, 0.6, 0.6))).toBe(false); // a small thing in the photo
    expect(acceptPaper(box(0.003, 0.003, 0.997, 0.997))).toBe(false); // the whole photo already
  });

  it('is refused unless what is inside looks like paper (a printed photo or a framed picture is not a document)', () => {
    expect(acceptPaper(box(0.1, 0.08, 0.9, 0.92), 0.3)).toBe(false);
    expect(acceptPaper(box(0.1, 0.08, 0.9, 0.92), undefined)).toBe(false);
    expect(acceptPaper(box(0.1, 0.08, 0.9, 0.92), 0.55)).toBe(true);
  });

  it('is refused when the corners are missing or not numbers', () => {
    expect(acceptPaper(undefined)).toBe(false);
    expect(acceptPaper([0.1, 0.1])).toBe(false);
    expect(acceptPaper(box(0.1, 0.1, 0.9, 0.9).map((v, i) => (i === 3 ? Number.NaN : v)))).toBe(false);
  });
});

describe('the photos asked about one by one', () => {
  const item = (index: number, type: string) => ({ index, type, path: `/p/${index}`, sha256: `s${index}` });
  it('are the photos in print order, and nothing else (a PDF has its own pages)', () => {
    const job = {
      order: [3, 1, 2, 4],
      items: [item(1, 'jpeg'), item(2, 'pdf'), item(3, 'png'), item(4, 'webp')],
    } as never;
    expect(cropQueue(job)).toEqual([3, 1, 4]);
  });
});

const photo = (index: number, type = 'jpeg') => ({ index, type, path: `/p/${index}`, sha256: `s${index}` });
const jobOf = (n: number, extra: Record<string, unknown> = {}) =>
  ({
    id: 'job1',
    order: Array.from({ length: n }, (_, k) => k + 1),
    items: Array.from({ length: n }, (_, k) => photo(k + 1)),
    layout: 'onePerPage',
    ...extra,
  }) as never;
const page = { state: 'ok', found: true, corners: box(0.1, 0.08, 0.9, 0.92), confidence: 0.9, paper: 0.9 };

describe('looking for paper when a layout is chosen (review of round 12)', () => {
  let find: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    find = await engine();
    find.mockReset();
  });

  it('cuts each photo that is paper, saves ink when they all are, and records that it looked', async () => {
    find.mockResolvedValue(page);
    const a = await paperActions(jobOf(2));
    expect(a.map((x) => x.type)).toEqual(['setQuad', 'setQuad', 'setInk', 'setLooked']);
    expect(find).toHaveBeenCalledWith({ jobId: 'job1', index: 1, auto: true });
  });

  it('a photo that is not paper is left as it is, and then nothing saves ink', async () => {
    find.mockResolvedValueOnce(page).mockResolvedValueOnce({ ...page, paper: 0.2 });
    expect((await paperActions(jobOf(2))).map((x) => x.type)).toEqual(['setQuad', 'setLooked']);
    find.mockReset();
    find.mockResolvedValue({ state: 'ok', found: false });
    expect((await paperActions(jobOf(2))).map((x) => x.type)).toEqual(['setLooked']);
  });

  it('looks once: a job already looked at, a PDF in the job, or too many photos are left alone', async () => {
    find.mockResolvedValue(page);
    expect(await paperActions(jobOf(2, { looked: true }))).toEqual([]);
    expect(
      await paperActions({ ...(jobOf(1) as object), items: [photo(1), photo(2, 'pdf')], order: [1, 2] } as never),
    ).toEqual([]);
    expect(await paperActions(jobOf(13))).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('a photo already cut is not looked at again, and a job all cut saves ink', async () => {
    find.mockResolvedValue(page);
    const cut = jobOf(2, { quads: { 1: box(0.2, 0.2, 0.8, 0.8) }, crops: { 2: { x: 0, y: 0, w: 0.5, h: 0.5 } } });
    expect((await paperActions(cut)).map((x) => x.type)).toEqual(['setLooked']);
    expect(find).not.toHaveBeenCalled();
  });

  it('corners a hair outside the photo are brought onto it', async () => {
    find.mockResolvedValue({ ...page, corners: [-0.0004, 0.1, 1.0004, 0.1, 1.0004, 0.9, -0.0004, 0.9], paper: 0.9 });
    const a = await paperActions(jobOf(1));
    const q = (a[0] as { quad: number[] }).quad;
    expect(Math.min(...q)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...q)).toBeLessThanOrEqual(1);
  });

  it('a look that never answers does not hold the choice up for long', async () => {
    vi.useFakeTimers();
    find.mockReturnValue(new Promise(() => {}));
    const p = paperActions(jobOf(2));
    await vi.advanceTimersByTimeAsync(9000);
    expect((await p).map((x) => x.type)).toEqual(['setLooked']);
    vi.useRealTimers();
  });
});

describe('the corners chain (review of round 12)', () => {
  it('is asked for one on each page, photo by photo, only for photos that have a picture', () => {
    const c = cropChain(jobOf(3), 'ready', new Set([1, 3]));
    expect(c?.params).toMatchObject({ index: 1, queue: [3], total: 2, n: 1, after: 'ready' });
  });

  it('is not asked for other layouts, scan jobs, or when no photo has a picture', () => {
    expect(cropChain(jobOf(3, { layout: 'allOnOne' }), 'ready')).toBeNull();
    expect(cropChain(jobOf(3, { scan: true }), 'ready')).toBeNull();
    expect(cropChain(jobOf(3), 'ready', new Set())).toBeNull();
  });

  it('is asked even when the job once held passport or card data', () => {
    expect(cropChain(jobOf(2, { passport: { item: 1 }, idCard: { cards: [] } }), 'ready')).not.toBeNull();
  });
});
