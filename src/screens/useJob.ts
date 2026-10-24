import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Job, type JobAction, normalizeJob } from '../core/job/job';
import { PrintEngine, type ThumbResult } from '../native/printEngine';
import { saveJobChange } from './received/Received';

/**
 * One job and its engine thumbnails for a screen that shows or changes it (Change, Layout, Pages, Copies, Photos).
 * Customer photos are on screen while it is mounted (screenshots blocked on Android 12 and older, PLAN §D6).
 */
export function useJob(jobId: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [thumbs, setThumbs] = useState<Map<number, ThumbResult> | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The newest saved job: two changes in a row (Pages: layout, then count) must chain, never reuse a stale one.
  const latest = useRef<Job | null>(null);
  latest.current = latest.current && job && latest.current.rev > job.rev ? latest.current : job;

  useEffect(() => {
    void PrintEngine.setCustomerContentShown({ shown: true });
    return () => void PrintEngine.setCustomerContentShown({ shown: false });
  }, []);

  // Files added to this job from the phone (Add photos, owner 2026-10-24): read it and its pictures again.
  useEffect(() => {
    const changed = (e: Event) => {
      if ((e as CustomEvent<{ jobId: string }>).detail?.jobId === jobId) setAttempt((n) => n + 1);
    };
    window.addEventListener('ps-job-changed', changed);
    return () => window.removeEventListener('ps-job-changed', changed);
  }, [jobId]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const loaded = normalizeJob((await PrintEngine.loadJob({ id: jobId })).job);
        if (!live) return;
        if (!loaded) return setGone(true);
        setJob(loaded);
        const { items } = await PrintEngine.makeThumbnails({ jobId });
        if (live) setThumbs(new Map(items.map((i) => [i.index, i])));
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [jobId, attempt]);

  /** Upright shape (width / height) of every photo the engine could open. */
  const aspects = useMemo(() => {
    const m = new Map<number, number>();
    for (const th of thumbs?.values() ?? [])
      if (th.state === 'ok' && th.width && th.height) m.set(th.index, th.width / th.height);
    return m;
  }, [thumbs]);

  const srcOf = (itemIndex: number) => {
    const th = thumbs?.get(itemIndex);
    return th?.state === 'ok' && th.thumb ? Capacitor.convertFileSrc(th.thumb) : undefined;
  };

  /** Applies one change through the single writer (stale revisions refused, PLAN §D2c). */
  // One save at a time: controls are disabled meanwhile, so quick taps are neither lost nor doubled (gate review
  // #4); a failed save is said on screen (gate review #3).
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busyRef = useRef(false);
  const change = async (action: JobAction): Promise<Job | null> => {
    const from = latest.current;
    if (!from || busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setSaveFailed(false);
    try {
      const next = await saveJobChange(from, action);
      latest.current = next;
      setJob(next);
      return next;
    } catch {
      setSaveFailed(true);
      // The save may have reached the phone before failing: read the job again before any next change
      // (re-review #2), so a second tap can never apply the same turn or move twice.
      setAttempt((n) => n + 1);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { job, thumbs, aspects, srcOf, gone, failed, retry: () => setAttempt((n) => n + 1), change, busy, saveFailed };
}
