import type { Job, JobAction } from '../core/job/job';
import { PrintEngine } from '../native/printEngine';

/** Photo types the engine can look at (a PDF has its own pages; text and Office files are not photos). */
const PHOTO = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp']);
/** Looking at every photo for its paper may take this long (a slow phone, many photos): after that nothing more is cut. */
const LIMIT_MS = 8000;
/** Big jobs are left as they are: looking at every photo would hold up the phone's previews. */
const MAX_PHOTOS = 12;
/** A paper page is a real part of the photo, but not already all of it. */
const MIN_AREA = 0.3;
const MAX_AREA = 0.985;
/** What is inside looks like paper (a pale sheet with print on it, not a photograph or a picture): see the engine's paperShare. */
const MIN_PAPER = 0.55;

/** The share of the photo a four-cornered shape covers (8 fractions, shoelace). */
export function paperArea(q: number[]): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    sum += (q[2 * k] as number) * (q[2 * j + 1] as number) - (q[2 * j] as number) * (q[2 * k + 1] as number);
  }
  return Math.abs(sum) / 2;
}

/**
 * Corners worth cutting to: eight numbers on the photo, covering from 30 % up to nearly all of it, with paper inside
 * ([paper]: the engine's measure, 0..1; none means the engine could not say, which is not paper).
 */
export function acceptPaper(q: number[] | undefined, paper?: number): q is number[] {
  if (!q || q.length !== 8 || q.some((v) => !Number.isFinite(v) || v < -0.001 || v > 1.001)) return false;
  if (!(typeof paper === 'number' && paper >= MIN_PAPER)) return false;
  const a = paperArea(q);
  return a >= MIN_AREA && a <= MAX_AREA;
}

/** The photos to ask about, in print order. [only]: just those with a picture (a damaged photo cannot be cut). */
export function cropQueue(job: Pick<Job, 'order' | 'items'>, only?: ReadonlySet<number>): number[] {
  const photos = new Set(job.items.filter((i) => PHOTO.has(i.type)).map((i) => i.index));
  return job.order.filter((i) => photos.has(i) && (!only || only.has(i)));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Round 12: looks at each photo for a sheet of paper (a scanner app's "find the page") and gives the actions that cut
 * to it: its corners for each photo that is paper, "saves ink" when every photo of the job is, and that the photos were
 * looked at (once: a photo the shopkeeper un-cuts is not cut again). A photo already cut is left alone; real photos
 * (nothing paper-like inside the corners) are never touched. A job with a PDF in it, too many photos, or looked at
 * already gives nothing. Never holds the choice up for long, even when the engine does not answer.
 */
export async function paperActions(job: Job): Promise<JobAction[]> {
  const photos = cropQueue(job);
  if (job.looked || photos.length === 0 || photos.length > MAX_PHOTOS || photos.length !== job.items.length) return [];
  const end = Date.now() + LIMIT_MS;
  const found: JobAction[] = [];
  for (const index of photos) {
    if (job.quads?.[index] || job.crops?.[index]) continue;
    const left = end - Date.now();
    if (left <= 0) break;
    const r = await Promise.race([
      PrintEngine.findPage({ jobId: job.id, index, auto: true }).catch(() => null),
      new Promise<null>((done) => setTimeout(() => done(null), left)),
    ]);
    if (r?.found && acceptPaper(r.corners, r.paper))
      found.push({ type: 'setQuad', item: index, quad: r.corners.map(clamp01) });
  }
  // Ink only when every photo is a paper page now cut to its corners (a hand crop does not say it is paper).
  const every = photos.every((i) => job.quads?.[i] || found.some((a) => (a as { item?: number }).item === i));
  return [...found, ...(found.length > 0 && every ? ([{ type: 'setInk' }] as JobAction[]) : []), { type: 'setLooked' }];
}

/** The first screen of the corners chain for a job, or null when it has none (see [cropChain]). */
export type Chain = {
  name: 'scanpage';
  params: { jobId: string; index: number; queue: number[]; total: number; n: number; after: string };
};

/**
 * Round 12 (owner: "one on each page: ask crop mode for each image before sending to the page, like the scanner app"):
 * when a job's layout is one on each page, each photo's corners are asked about, one after another, before Ready.
 * [only]: the photos that have a picture. Browser tests leave it off unless the page is opened with `cropFirst`.
 */
export function cropChain(job: Job, after: 'ready', only?: ReadonlySet<number>): Chain | null {
  if (job.layout !== 'onePerPage' || job.scan) return null;
  if (import.meta.env.MODE === 'e2e' && !globalThis.location?.search.includes('cropFirst')) return null;
  const queue = cropQueue(job, only);
  const [first, ...rest] = queue;
  return first === undefined
    ? null
    : { name: 'scanpage', params: { jobId: job.id, index: first, queue: rest, total: queue.length, n: 1, after } };
}
