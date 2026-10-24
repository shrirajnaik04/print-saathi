import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Job } from '../core/job/job';
import type { PdfFacts } from '../core/plan/plan';
import { passwords } from '../native/passwords';
import { type DocFactsItem, PrintEngine } from '../native/printEngine';
import { PageQueue } from './pageQueue';

/**
 * A job's PDFs as the isolated engine reads them (PLAN §G4): their states (locked, damaged, …), the facts the plan
 * needs, the phone's unlock tier, and small page images on demand. Locked PDFs open with the passwords held in memory.
 */
export function useDocs(jobId: string, job: Job | null) {
  const [items, setItems] = useState<Map<number, DocFactsItem> | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const pdfCount = job ? job.items.filter((i) => i.type === 'pdf').length : -1;
  // Page images: one at a time, never twice, nothing more once this screen closes (re-review I3).
  const queue = useRef<PageQueue | null>(null);
  if (!queue.current)
    queue.current = new PageQueue(
      async (key) => {
        const [item, page] = key.split(':').map(Number) as [number, number];
        const r = await PrintEngine.pdfPageThumb({ jobId, item, page, password: passwords.forJob(jobId)[item] });
        return r.path ? Capacitor.convertFileSrc(r.path) : null;
      },
      (key, src) => setThumbs((m) => new Map(m).set(key, src)),
    );
  useEffect(() => () => queue.current?.stop(), []);

  useEffect(() => {
    void PrintEngine.getDeviceFacts().then(
      (f) => setTier(f.pdfUnlockTier),
      () => setTier('NONE'),
    );
  }, []);

  useEffect(() => {
    if (pdfCount < 0) return;
    if (pdfCount === 0) {
      setItems(new Map());
      return;
    }
    let live = true;
    void PrintEngine.documentFacts({ jobId, passwords: passwords.forJob(jobId) }).then(
      (r) => live && setItems(new Map(r.items.map((i) => [i.index, i]))),
      () => live && setItems(new Map()),
    );
    return () => {
      live = false;
    };
  }, [jobId, pdfCount, attempt]);

  const facts = useMemo(() => {
    const m = new Map<number, PdfFacts>();
    for (const [k, d] of items ?? [])
      if (d.state === 'ok' && d.pages && d.sizes)
        m.set(k, { pages: d.pages, sizes: d.sizes, forms: !!d.forms, locked: false, unlocked: !!d.unlocked });
    return m;
  }, [items]);

  /** Asks for page images; [srcOfPage] gives them once made. */
  const want = (pages: { item: number; page: number }[]) =>
    queue.current?.want(pages.map((p) => `${p.item}:${p.page}`));

  return {
    /** null until read. */
    items,
    facts,
    tier,
    want,
    srcOfPage: (item: number, page: number) => thumbs.get(`${item}:${page}`),
    /** A PDF of the job still needs its password: its pages are not known yet. */
    anyLocked: [...(items?.values() ?? [])].some((d) => d.state === 'password'),
    refresh: () => setAttempt((n) => n + 1),
  };
}
