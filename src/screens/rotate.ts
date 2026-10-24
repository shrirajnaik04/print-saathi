import { Capacitor } from '@capacitor/core';
import type { Job } from '../core/job/job';
import { decideTurns, mayTurn } from '../core/rotate/decide';
import type { TextTurn } from '../core/rotate/textTurn';
import { PrintEngine } from '../native/printEngine';
import { analysisAhead } from './blackEdges';

/** How long finding the way up may take (a slow phone, many photos): after that nothing is turned. */
const LIMIT_MS = 8000;
const PHOTO = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp']);
/** Big jobs are left as they are: looking at every photo would hold up the phone's previews. */
const MAX_PHOTOS = 30;
/** The phone may spend this long on faces (then it stops, review I2). */
const FACES_MS = 6000;
/** Camera photos only: a screenshot is always upright on its own (review I3). */
const CAMERA = new Set(['jpeg']);

/** The check running for each job (one per job), so a choice tapped meanwhile can wait for it (review I1). */
const running = new Map<string, Promise<Record<number, 1 | 2 | 3>>>();

/** Starts (once) or joins the job's check. */
export function turnsFor(job: Job): Promise<Record<number, 1 | 2 | 3>> {
  let p = running.get(job.id);
  if (!p) {
    p = suggestTurns(job);
    running.set(job.id, p);
    void p.then(() => setTimeout(() => running.delete(job.id), 60_000));
  }
  return p;
}

/** The shopkeeper chose: the faces still being looked at are not needed any more (the phone's previews come first). */
export function stopTurns(jobId: string): void {
  void PrintEngine.cancelFaceTurns({ jobId }).catch(() => {});
}

type Files = { items: { index: number; path: string | null }[] };

/**
 * Phase 15 (spec Part 3): the quarter turns that make this job's photos upright, from faces (the engine) and text
 * direction (the analysis files the black-edge check makes anyway). Any failure, or a slow phone, means no turns.
 */
export async function suggestTurns(job: Job): Promise<Record<number, 1 | 2 | 3>> {
  const photos = job.items.filter((i) => PHOTO.has(i.type)).map((i) => i.index);
  if (!mayTurn(job) || photos.length === 0 || photos.length > MAX_PHOTOS) return {};
  const camera = new Set(job.items.filter((i) => CAMERA.has(i.type)).map((i) => i.index));
  const late = <T>(fallback: T) => new Promise<T>((done) => setTimeout(() => done(fallback), LIMIT_MS));
  const faces = Promise.race([
    PrintEngine.faceTurns({ jobId: job.id, budgetMs: FACES_MS }).catch(() => ({
      items: [] as { index: number; faces: number[] }[],
    })),
    late({ items: [] as { index: number; faces: number[] }[] }),
  ]);
  const text = Promise.race([textTurns(job.id, camera), late(new Map<number, TextTurn>())]);
  const [f, t] = await Promise.all([faces, text]);
  // Whatever the phone is still looking at is not waited for any more.
  void PrintEngine.cancelFaceTurns({ jobId: job.id }).catch(() => {});
  return decideTurns(photos, t, new Map(f.items.map((i) => [i.index, i.faces])));
}

async function textTurns(jobId: string, camera: ReadonlySet<number>): Promise<Map<number, TextTurn>> {
  const out = new Map<number, TextTurn>();
  let worker: Worker | null = null;
  try {
    // The files the black-edge check is making ahead; whatever is done after a while (never waiting long).
    const early = analysisAhead(jobId);
    if (early) await Promise.race([early, new Promise((r) => setTimeout(r, LIMIT_MS * 0.6))]);
    const { items } = early
      ? await PrintEngine.analysisBytes({ jobId, existingOnly: true })
      : ((await PrintEngine.analysisBytes({ jobId, budgetMs: Math.round(LIMIT_MS * 0.6) })) as Files);
    const files = items.filter((i): i is { index: number; path: string } => !!i.path && camera.has(i.index));
    if (files.length === 0) return out;
    worker = new Worker(new URL('../workers/rotate.worker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    await new Promise<void>((done) => {
      let left = files.length;
      w.onmessage = (e: MessageEvent<{ id: number; result: TextTurn | null }>) => {
        if (e.data.result) out.set(e.data.id, e.data.result);
        if (--left === 0) done();
      };
      w.onerror = () => done();
      for (const f of files) {
        const url = f.path.startsWith('/') && !Capacitor.isNativePlatform() ? f.path : Capacitor.convertFileSrc(f.path);
        w.postMessage({ id: f.index, url });
      }
    });
  } catch {
    // No text signal: faces alone decide.
  } finally {
    worker?.terminate();
  }
  return out;
}
