import { Capacitor } from '@capacitor/core';
import type { CropBox, Kind } from '../core/crop/detect';
import type { Job } from '../core/job/job';
import { PrintEngine } from '../native/printEngine';

/** How long the black-edge check may take before the shopkeeper goes on without the question (big jobs, slow phones). */
const LIMIT_MS = 8000;
/** Time the phone may spend making analysis files ahead of the choice (on its preview thread: never holding up saves). */
const AHEAD_MS = 20000;

type Files = { items: { index: number; path: string | null }[] };
/** Analysis files being made while Received is on screen, by job (one at a time per job). */
const ahead = new Map<string, Promise<Files>>();

/**
 * Starts making the job's analysis files while the shopkeeper reads the choices (Phase 10: the choice then waits for nothing;
 * 20 photos of 12 MP took 6 s at the tap). Safe to call more than once.
 */
export function prepareBlackEdges(jobId: string): void {
  if (ahead.has(jobId)) return;
  const p = PrintEngine.analysisBytes({ jobId, budgetMs: AHEAD_MS }).catch(() => ({ items: [] }) as Files);
  ahead.set(jobId, p);
  void p.then(() => setTimeout(() => ahead.delete(jobId), 60_000));
}

/** The analysis files being made ahead for [jobId], if any (Phase 15 reads them too: one set for both). */
export function analysisAhead(jobId: string): Promise<Files> | undefined {
  return ahead.get(jobId);
}

/**
 * Smart auto-crop (PLAN §F5): the engine makes each photo's analysis bytes; the worker suggests a crop for the ones
 * with uniform black (or, for documents and screenshots, blank) edges. Suggestions only: nothing changes until the shopkeeper
 * answers "Black edges?". Any failure or a slow phone means no suggestions, never a stuck screen.
 */
export async function findBlackEdges(job: Job): Promise<Record<number, CropBox>> {
  const found: Record<number, CropBox> = {};
  let worker: Worker | null = null;
  const until = Date.now() + LIMIT_MS;
  const late = new Promise<void>((done) => setTimeout(done, LIMIT_MS));
  try {
    // The phone makes analysis files for at most 3/4 of the time (the rest is for the worker); photos left over are
    // simply not looked at (gate I-1: never holding up the app's other work for long).
    performance.mark?.('ps-edges-start');
    // Files made ahead (while Received was shown): wait for them for 3/4 of the time at most, then stop that run (the
    // phone's preview thread is needed for Ready) and look at the photos done so far (review I5: a second call used
    // to queue behind the early run, so big jobs lost the question). Without an early run, make them now.
    const early = ahead.get(job.id);
    const reply = early
      ? await (async () => {
          await Promise.race([early, new Promise((r) => setTimeout(r, Math.round(LIMIT_MS * 0.75)))]);
          await PrintEngine.cancelAnalysis({ jobId: job.id }).catch(() => {});
          return PrintEngine.analysisBytes({ jobId: job.id, existingOnly: true });
        })()
      : await Promise.race([
          PrintEngine.analysisBytes({ jobId: job.id, budgetMs: Math.max(500, Math.round(LIMIT_MS * 0.75)) }),
          late.then(() => ({ items: [] as { index: number; path: string | null }[] })),
        ]);
    const { items } = reply;
    performance.mark?.('ps-edges-files');
    const files = items.filter((i): i is { index: number; path: string } => !!i.path);
    if (files.length === 0) return found;
    worker = new Worker(new URL('../workers/crop.worker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    const kindOf = (index: number): Kind =>
      job.layout === 'document'
        ? 'document'
        : job.items.find((i) => i.index === index)?.type === 'png'
          ? 'screenshot'
          : 'photo';
    await Promise.race([
      new Promise<void>((done) => {
        let left = files.length;
        w.onmessage = (e: MessageEvent<{ id: number; result: { crop: CropBox } | null }>) => {
          if (e.data.result) found[e.data.id] = e.data.result.crop;
          if (--left === 0) done();
        };
        w.onerror = () => done();
        for (const f of files) {
          const url =
            f.path.startsWith('/') && !Capacitor.isNativePlatform() ? f.path : Capacitor.convertFileSrc(f.path);
          w.postMessage({ id: f.index, url, kind: kindOf(f.index) });
        }
      }),
      new Promise<void>((done) => setTimeout(done, Math.max(0, until - Date.now()))),
    ]);
  } catch {
    // No suggestions: The shopkeeper prints without the question.
  } finally {
    worker?.terminate();
    performance.mark?.('ps-edges-done');
  }
  return found;
}
