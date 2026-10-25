// Browser/Playwright stand-in for the native plugin. Fixed values only; never used on a phone.
import { WebPlugin } from '@capacitor/core';
import type { StyleId } from '../core/job/job';
import type { PrintPlan } from '../core/plan/plan';
import type {
  DeviceFacts,
  DocFactsItem,
  Intake,
  PrintEnginePlugin,
  PrintKind,
  PrintState,
  RenderResult,
  ThumbResult,
} from './printEngine';

/** A photo as an SVG data URL (CSP allows data: images), so screens can be tested without files. */
/** Tests: what the phone was told about the start-up splash, in order. */
const splashStep = (step: string) => {
  const g = globalThis as { __splashSteps?: string[] };
  g.__splashSteps = [...(g.__splashSteps ?? []), step];
};
const samplePhoto = (n: number, w: number, h: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='hsl(${(n * 57) % 360} 60% 70%)'/><text x='50%' y='55%' font-size='${Math.round(h / 3)}' text-anchor='middle' font-family='sans-serif'>${n}</text></svg>`)}`;

/**
 * Tests only: `?mockIntake=<n>` (browser) makes one pending intake of n photos (every 3rd landscape, the 4th a
 * duplicate of the 1st). The mock is never used on a phone.
 */
function sampleIntake(
  n = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockIntake') ?? 0),
  intakeId = 'mock-intake',
): Intake | null {
  if (!n) return null;
  // Tests only: `?mockStorageFull=1`: the phone was full, nothing could be received.
  if (new URLSearchParams(globalThis.location?.search ?? '').has('mockStorageFull'))
    return {
      intakeId,
      state: 'done',
      rejected: 0,
      refusedByPolicy: 0,
      problems: Array.from({ length: n }, (_, i) => ({ index: i + 1, reason: 'storageFull' as const })),
      files: [],
    };
  const whole: Intake = {
    intakeId,
    state: 'done',
    rejected: 0,
    refusedByPolicy: 0,
    problems: [],
    files: Array.from({ length: n }, (_, i) => ({
      index: i + 1,
      // A locked PDF on a phone with no built-in unlock: the app fetches the file itself (served by the e2e test).
      path:
        Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockPdfAt')) === i + 1 &&
        new URLSearchParams(globalThis.location?.search ?? '').has('mockPdfLocked')
          ? '/mock-locked.pdf'
          : i % 3 === 2
            ? samplePhoto(i + 1, 1600, 1200)
            : samplePhoto(i + 1, 1200, 1600),
      // Tests only: `?mockPdfAt=<index>` makes that file a PDF (not shown among the photos);
      // `?mockOfficeAt=<index>` makes it a Word/Excel/PowerPoint file; `?mockHeifAt=<index>` an iPhone photo.
      sniffedType:
        Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockPdfAt')) === i + 1
          ? ('pdf' as const)
          : Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockOfficeAt')) === i + 1
            ? ('office' as const)
            : Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockHeifAt')) === i + 1
              ? ('heif' as const)
              : ('jpeg' as const),
      bytes: 1000,
      sha256: i === 3 ? 'h1' : `h${i + 1}`,
    })),
  };
  // Tests only: `?mockStorageFullAt=<k>`: the phone filled up at file k; the files before it arrived.
  const fullAt = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockStorageFullAt') ?? 0);
  if (fullAt > 0)
    return {
      ...whole,
      files: whole.files.filter((f) => f.index < fullAt),
      problems: whole.files.filter((f) => f.index >= fullAt).map((f) => ({ index: f.index, reason: 'storageFull' })),
    };
  return whole;
}

export class PrintEngineMock extends WebPlugin implements PrintEnginePlugin {
  async getDeviceFacts(): Promise<DeviceFacts> {
    return {
      androidRelease: 'web-mock',
      sdkInt: 0,
      sExtensionLevel: null,
      totalRamMb: 4096,
      isLowRamDevice: false,
      memoryClassMb: 256,
      largeMemoryClassMb: 512,
      webViewPackage: 'browser',
      webViewVersion: navigator.userAgent,
      // Tests only: `?mockTier=NONE|PRE_V|NATIVE_35` (default NATIVE_35: locked PDFs open in the engine).
      pdfUnlockTier: (new URLSearchParams(globalThis.location?.search ?? '').get('mockTier') ??
        'NATIVE_35') as DeviceFacts['pdfUnlockTier'],
      manufacturer: 'mock',
      model: 'browser',
      fontScale: 1,
    };
  }

  private acked = new Set<string>();
  private jobs = new Map<string, { rev: number } & Record<string, unknown>>();

  async getPendingIntake(): Promise<{ intake: Intake | null }> {
    return { intake: null };
  }

  private repeatSent = false;

  /** Shares made later by `__mockShare(n)` (tests only: a WhatsApp share while a job is open). */
  private later: Intake[] = [];

  async listIntakes(): Promise<{ intakes: Intake[] }> {
    const g = globalThis as { __mockShare?: (n: number) => void };
    g.__mockShare ??= (n: number) => {
      const next = sampleIntake(n, `mock-intake-${this.later.length + 2}`);
      if (!next) return;
      this.later.push(next);
      this.notifyListeners('intakeReady', { intakeId: next.intakeId, repeat: false });
    };
    // Tests: a share copied one file every [ms] (progress events; Cancel stops it after the current file).
    const slow = globalThis as { __mockShareSlow?: (n: number, ms: number) => void };
    slow.__mockShareSlow ??= (n: number, ms: number) => {
      const next = sampleIntake(n, `mock-intake-${this.later.length + 2}`);
      if (!next) return;
      const intakeId = next.intakeId;
      void (async () => {
        let done = 0;
        this.notifyListeners('intakeProgress', { intakeId, done, total: n });
        while (done < n && !this.receivingCancelled.has(intakeId)) {
          await new Promise((r) => setTimeout(r, ms));
          done++;
          this.notifyListeners('intakeProgress', { intakeId, done, total: n });
        }
        const cancelled = done < n;
        this.later.push({
          ...next,
          files: next.files.slice(0, done),
          ...(cancelled ? { cancelled: true, expected: n } : {}),
        });
        this.notifyListeners('intakeReady', { intakeId, repeat: false });
      })();
    };
    const fresh = this.later.filter((x) => !this.acked.has(x.intakeId));
    if (fresh.length) return { intakes: fresh };
    const i = sampleIntake();
    // Tests only: `?mockRepeat=1` shares the same files again a moment later (PLAN §D2b repeat within 60 s).
    if (i && !this.repeatSent && new URLSearchParams(globalThis.location?.search ?? '').has('mockRepeat')) {
      this.repeatSent = true;
      setTimeout(() => this.notifyListeners('intakeReady', { intakeId: i.intakeId, repeat: true }), 1500);
    }
    return { intakes: i && !this.acked.has(i.intakeId) ? [i] : [] };
  }

  async ackIntake({ intakeId }: { intakeId: string }): Promise<void> {
    this.acked.add(intakeId);
  }

  /**
   * Tests only: `?mockOneQueue=1`: like the phone's engine, one thing at a time: reading or saving a job waits for a
   * print file or pictures being made (review C2: Back must never wait on that).
   */
  private line: Promise<unknown> = Promise.resolve();
  private inLine<T>(f: () => Promise<T>): Promise<T> {
    if (!new URLSearchParams(globalThis.location?.search ?? '').has('mockOneQueue')) return f();
    const run = this.line.then(f, f);
    this.line = run.catch(() => undefined);
    return run;
  }

  saveJob(o: { job: object }): Promise<{ saved: boolean }> {
    return this.inLine(() => this.saveJobNow(o));
  }
  private async saveJobNow({ job }: { job: object }): Promise<{ saved: boolean }> {
    const j = job as { id: string; rev: number; quads?: Record<number, number[]> };
    // Tests only: `?mockQuad=1`: photo 1 of a new job has a straightened frame, as a job saved by 1.0.224 could (round 3
    // straightens by hand no more; such frames still open, move by their sides and print).
    if (j.rev === 1 && !j.quads && new URLSearchParams(globalThis.location?.search ?? '').has('mockQuad'))
      j.quads = { 1: [0.05, 0.05, 0.95, 0.1, 0.95, 0.95, 0.05, 0.95] };
    // Tests only: `?mockSaveFail=1` makes every change after the first save fail (e.g. the phone is full).
    if (j.rev > 1 && new URLSearchParams(globalThis.location?.search ?? '').has('mockSaveFail'))
      throw new Error('job not saved');
    // Tests only: `?mockSlowSave=<ms>`: saving takes this long, like a slow phone (quick-tap races).
    const slow = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockSlowSave') ?? 0);
    if (slow > 0) await new Promise((r) => setTimeout(r, slow));
    const cur = this.jobs.get(j.id);
    if (cur && cur.rev >= j.rev) return { saved: false };
    this.jobs.set(j.id, { ...(job as Record<string, unknown>), rev: j.rev });
    return { saved: true };
  }

  loadJob({ id }: { id: string }): Promise<{ job: object | null }> {
    return this.inLine(async () => ({ job: this.jobs.get(id) ?? null }));
  }

  listJobs(): Promise<{ jobs: object[] }> {
    return this.inLine(async () => ({ jobs: [...this.jobs.values()] }));
  }

  deleteJob({ id }: { id: string }): Promise<void> {
    return this.inLine(async () => {
      if (deleteFails()) throw new Error('not deleted');
      this.jobs.delete(id);
    });
  }

  /** The browser has no job folders: the files stay where they are. */
  async mergeJobFiles({ from }: { from: string; into: string }): Promise<{ files: { from: string; to: string }[] }> {
    const items = (this.jobs.get(from)?.items ?? []) as { path: string }[];
    return { files: items.map((i) => ({ from: i.path, to: i.path })) };
  }

  private thumbCalls = 0;

  makeThumbnails(o: { jobId: string }): Promise<{ items: ThumbResult[] }> {
    return this.inLine(() => this.makeThumbnailsNow(o));
  }
  private async makeThumbnailsNow({ jobId }: { jobId: string }): Promise<{ items: ThumbResult[] }> {
    this.thumbCalls++;
    // Tests only: `?mockSlowThumbs=<ms>`: the photos take this long to get ready (a slow phone).
    const slow = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockSlowThumbs') ?? 0);
    const job = this.jobs.get(jobId) as { items?: { index: number; path: string; type: string }[] } | undefined;
    const total = job?.items?.length ?? 0;
    // Progress as the phone sends it, one photo at a time, over the slow time.
    for (let done = 1; slow > 0 && done <= total; done++) {
      await new Promise((r) => setTimeout(r, slow / Math.max(1, total)));
      this.notifyListeners('thumbnailProgress', { jobId, done, total });
    }
    // Mock photos encode their size in the SVG (width='…' height='…').
    return {
      items: (job?.items ?? []).map((it) => {
        const svg = decodeURIComponent(it.path);
        const w = Number(svg.match(/width='(\d+)'/)?.[1] ?? 1200);
        const h = Number(svg.match(/height='(\d+)'/)?.[1] ?? 1600);
        // Tests only: `?mockDamaged=<index>` makes that photo unreadable.
        // Like the phone: only photos get thumbnails (PDFs, Office files, videos are 'notPhoto').
        if (['pdf', 'office', 'video', 'other'].includes(it.type))
          return { index: it.index, state: 'notPhoto' as const };
        if (it.type === 'heif') return { index: it.index, state: 'unsupported' as const };
        const damaged = new URLSearchParams(globalThis.location?.search ?? '').get('mockDamaged');
        if (damaged && Number(damaged) === it.index) return { index: it.index, state: 'damaged' as const };
        // `?mockRetry=<index>`: the engine could not do that photo the first time only.
        const retry = new URLSearchParams(globalThis.location?.search ?? '').get('mockRetry');
        if (retry && Number(retry) === it.index && this.thumbCalls === 1)
          return { index: it.index, state: 'retry' as const };
        return { index: it.index, state: 'ok' as const, thumb: it.path, width: w, height: h };
      }),
    };
  }

  /** Pretends to make the print file: progress per page, then done (no file exists in the browser). */
  renderPlan(o: { jobId: string; planHash: string; plan: PrintPlan }): Promise<RenderResult> {
    return this.inLine(() => this.renderPlanNow(o));
  }
  private async renderPlanNow({
    jobId,
    planHash,
    plan,
  }: {
    jobId: string;
    planHash: string;
    plan: PrintPlan;
  }): Promise<RenderResult> {
    this.planColour.set(planHash, plan.colour);
    (globalThis as { __lastPlan?: PrintPlan }).__lastPlan = plan; // tests: what was asked to print
    const total = plan.pages.length + 1;
    for (let done = 1; done <= total; done++) this.notifyListeners('renderProgress', { jobId, planHash, done, total });
    // Tests only: `?mockSlowRender=<ms>`: the print file takes this long (big jobs, slow phones).
    const slowRender = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockSlowRender') ?? 0);
    if (slowRender > 0) await new Promise((r) => setTimeout(r, slowRender));
    // Tests only: `?mockNoSpace=1`: the phone is full until old jobs are deleted.
    if (new URLSearchParams(globalThis.location?.search ?? '').has('mockNoSpace') && !this.roomMade)
      return { planHash, state: 'noSpace' };
    // Tests only: `?mockRenderDamaged=<index>`: that photo cannot be printed.
    const damagedAt = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockRenderDamaged'));
    if (damagedAt && plan.pages.some((p) => p.placements.some((x) => x.itemIndex === damagedAt)))
      return { planHash, state: 'damaged', itemIndex: damagedAt };
    // Tests only: `?mockLowRes=1`: every photo reached less than 200 dpi.
    const low = new URLSearchParams(globalThis.location?.search ?? '').has('mockLowRes');
    return {
      planHash,
      state: 'done',
      pdfPath: `mock/${jobId}/${planHash}/print.pdf`,
      pages: plan.pages.length * plan.copies,
      lowRes: low ? [...new Set(plan.pages.flatMap((p) => p.placements.map((x) => x.itemIndex)))] : [],
      // Tests only: `?mockDpi=2:90,3:110`: those photos reached that many dots per inch (others 300).
      dpi: Object.fromEntries(
        (new URLSearchParams(globalThis.location?.search ?? '').get('mockDpi') ?? '')
          .split(',')
          .filter(Boolean)
          .map((p) => p.split(':').map(Number) as [number, number]),
      ),
    };
  }

  async cancelRender(): Promise<void> {}

  private receivingCancelled = new Set<string>();

  async cancelIntake({ intakeId }: { intakeId: string }): Promise<void> {
    this.receivingCancelled.add(intakeId);
    const g = globalThis as { __cancelledIntakes?: string[] };
    g.__cancelledIntakes = [...(g.__cancelledIntakes ?? []), intakeId]; // tests: which share was stopped
  }

  async cancelThumbnails(_: { jobId: string }): Promise<void> {
    const g = globalThis as { __thumbCancels?: number };
    g.__thumbCancels = (g.__thumbCancels ?? 0) + 1; // tests: Cancel reached the phone
  }

  /** Items unlocked by the app itself (ADR-002 option i) and how many bytes arrived. */
  private unlocked = new Set<number>();

  /**
   * Tests only: `?mockPdfPages=<n>` (default 3), `?mockPdfLocked=1` (password RAMA1965), `?mockPdfDamaged=1`,
   * `?mockPdfForms=1`. Every PDF of the mock job.
   */
  async documentFacts({ jobId, passwords }: { jobId: string; passwords?: Record<number, string> }) {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const job = this.jobs.get(jobId) as { items?: { index: number; type: string }[] } | undefined;
    const pages = Number(q.get('mockPdfPages') ?? 3);
    const items: DocFactsItem[] = (job?.items ?? [])
      .filter((i) => i.type === 'pdf')
      .map((i) => {
        if (q.has('mockPdfDamaged')) return { index: i.index, state: 'damaged' as const };
        if (q.has('mockPdfLocked') && passwords?.[i.index] !== 'RAMA1965' && !this.unlocked.has(i.index))
          return { index: i.index, state: 'password' as const };
        return {
          index: i.index,
          state: 'ok' as const,
          pages,
          // Like the engine: sizes of the first 500 pages only.
          sizes: Array.from({ length: Math.min(pages, 500) }, () => [595, 841] as [number, number]),
          forms: q.has('mockPdfForms'),
          ...(q.has('mockPdfLocked') ? { unlocked: true } : {}),
        };
      });
    return { items };
  }

  /** Labelled style samples ("Vibrant" …); `?mockSamplesFail=1`: none could be made. */
  async styleSamples(_: { jobId: string; item: number; page?: number; password?: string; turns?: number }) {
    const fail = new URLSearchParams(globalThis.location?.search ?? '').has('mockSamplesFail');
    const fills: Record<StyleId, string> = {
      original: '#c66',
      vibrant: '#f22',
      soft: '#d99',
      bw: '#888',
      sharp: '#333',
      ocv: '#000',
    };
    return {
      samples: (Object.keys(fills) as StyleId[]).map((style) => ({
        style,
        path: fail
          ? null
          : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='360' height='270'><rect width='100%' height='100%' fill='${fills[style]}'/><text x='50%' y='55%' font-size='40' fill='#fff' text-anchor='middle'>${style}</text></svg>`)}`,
      })),
    };
  }

  /**
   * Tests only: `?mockBars=1`: every photo's analysis file is /mock-bars.grey (served by the e2e test); `?mockBars=doc`:
   * only while the job prints as a document; `?mockSlowAnalysis=<ms>`: the phone takes that long.
   */
  /** Like the phone: one analysis thread, one photo at a time, stopped by cancelAnalysis (tests: mockSlowAnalysisEach). */
  private analysisQueue: Promise<unknown> = Promise.resolve();
  private analysed = new Map<string, Set<number>>();
  private analysisCancelled = new Set<string>();

  async analysisBytes({ jobId, budgetMs, existingOnly }: { jobId: string; budgetMs?: number; existingOnly?: boolean }) {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const job = this.jobs.get(jobId) as { items?: { index: number; type: string }[]; layout?: string } | undefined;
    const bars = q.has('mockBars') && (q.get('mockBars') !== 'doc' || job?.layout === 'document');
    const slow = Number(q.get('mockSlowAnalysis') ?? 0);
    const each = Number(q.get('mockSlowAnalysisEach') ?? 0);
    const g = globalThis as { __analysisCalls?: number };
    g.__analysisCalls = (g.__analysisCalls ?? 0) + 1; // tests: when the analysis was asked for
    const photos = (job?.items ?? []).filter((i) => i.type !== 'pdf');
    const done = this.analysed.get(jobId) ?? new Set<number>();
    this.analysed.set(jobId, done);
    const reply = () => ({
      items: photos.map((i) => ({ index: i.index, path: bars && done.has(i.index) ? '/mock-bars.grey' : null })),
    });
    if (existingOnly) return reply();
    if (each <= 0) {
      if (slow > 0) await new Promise((r) => setTimeout(r, slow));
      for (const i of photos) done.add(i.index);
      return reply();
    }
    const run = this.analysisQueue.then(async () => {
      this.analysisCancelled.delete(jobId);
      const until = Date.now() + (budgetMs ?? 6000);
      for (const i of photos) {
        if (this.analysisCancelled.has(jobId) || Date.now() >= until) break;
        if (done.has(i.index)) continue;
        await new Promise((r) => setTimeout(r, each));
        done.add(i.index);
      }
      return reply();
    });
    this.analysisQueue = run.catch(() => {});
    return run;
  }

  async cancelAnalysis({ jobId }: { jobId: string }): Promise<void> {
    const g = globalThis as { __analysisCancels?: number };
    g.__analysisCancels = (g.__analysisCancels ?? 0) + 1;
    this.analysisCancelled.add(jobId);
  }

  /** A small labelled page image ("PDF page n"). */
  async pdfPageThumb({ page }: { jobId: string; item: number; page: number; password?: string }) {
    const g = globalThis as { __pageImages?: number };
    g.__pageImages = (g.__pageImages ?? 0) + 1; // tests: how many page images were asked for
    const label = `PDF page ${page + 1}`;
    return {
      path: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='595' height='841'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' font-size='60' text-anchor='middle'>${label}</text></svg>`)}`,
    };
  }

  async writeUnlocked({
    item,
    data,
    last,
  }: {
    jobId: string;
    item: number;
    offset: number;
    data: string;
    last: boolean;
  }) {
    const g = globalThis as { __unlockedBytes?: number };
    g.__unlockedBytes = (g.__unlockedBytes ?? 0) + atob(data).length;
    if (last) this.unlocked.add(item);
    return { ok: true };
  }

  /** The colour of each plan the mock made a file for, so preview pages can say which plan they show. */
  private planColour = new Map<string, string>();

  /**
   * Stands in for the engine's page images: an A4 sheet labelled with its page, colour and plan. Tests only:
   * `?mockNoPreview=1` none; `?mockNoPreviewAt=<page>` none for that page; `?mockSlowPreview=<ms>` each page takes
   * that long. `window.__previewCalls` counts the requests.
   */
  async previewPage({ planHash, index }: { jobId: string; planHash: string; index: number }) {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const g = globalThis as { __previewCalls?: number };
    g.__previewCalls = (g.__previewCalls ?? 0) + 1;
    if (q.has('mockNoPreview')) return { planHash, index, path: null };
    await new Promise((r) => setTimeout(r, Number(q.get('mockSlowPreview') ?? 30)));
    if (Number(q.get('mockNoPreviewAt')) === index + 1) return { planHash, index, path: null };
    const label = `file ${index + 1} ${this.planColour.get(planHash) ?? ''} ${planHash}`;
    const path = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='595' height='842'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' font-size='50' text-anchor='middle'>${label}</text></svg>`)}`;
    return { planHash, index, path };
  }

  private print: {
    jobId: string;
    planHash: string;
    closed: boolean;
    kind: PrintKind;
    part?: number;
    parts?: number;
    partOf?: string;
  } | null = null;
  private statusCalls = 0;

  /**
   * Tests only: `?mockPrint=<state>` is what the print screen "did" (default: sent). It closes after 50 ms, or after
   * `?mockDialogMs=<ms>`.
   */
  async printFile({
    jobId,
    planHash,
    part,
    parts,
    contentType,
  }: {
    jobId: string;
    planHash: string;
    part?: number;
    parts?: number;
    contentType?: 'photo' | 'document';
  }): Promise<{ result: 'started' }> {
    (globalThis as { __lastContentType?: string }).__lastContentType = contentType; // tests: how the printer is told
    const g = globalThis as { __printCalls?: number };
    g.__printCalls = (g.__printCalls ?? 0) + 1; // tests: how many prints reached the phone
    this.print = { jobId, planHash, closed: false, kind: 'job', part: part ?? 0, parts: parts ?? 1 };
    this.statusCalls = 0;
    setTimeout(
      () => {
        if (this.print) this.print.closed = true;
        this.notifyListeners('printClosed', { jobId, planHash });
      },
      Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockDialogMs') ?? 50),
    );
    return { result: 'started' };
  }

  /** Tests only: `?mockPendingTest=1` starts with a test page that was sent while the app was closed. */
  private pendingTestUsed = false;

  async printTestPage({ paper }: { paper: 'A4' | 'PHOTO_4x6' }): Promise<{ result: 'started' }> {
    const kind: PrintKind = paper === 'A4' ? 'testA4' : 'testPhoto';
    this.print = { jobId: 'test', planHash: '0000000000000000', closed: false, kind };
    this.statusCalls = 0;
    setTimeout(
      () => {
        if (this.print) this.print.closed = true;
        this.notifyListeners('printClosed', { kind });
      },
      Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockDialogMs') ?? 50),
    );
    return { result: 'started' };
  }

  /** Tests only: `?mockPhotoPaper=1` a test page printed on the shop printer with 4×6 photo paper. */
  async paperSetup() {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    if (q.has('mockPhotoPaper'))
      return { printer: 'Shop printer', photoPaper: { wMils: 3937, hMils: 5906, edgeMm: 4 } };
    return {};
  }

  async printStatus(): Promise<{
    state: PrintState;
    jobId?: string;
    planHash?: string;
    kind?: PrintKind;
    part?: number;
    parts?: number;
    partOf?: string;
    paperSaved?: boolean;
    remeasure?: boolean;
  }> {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    if (!this.pendingTestUsed && q.has('mockPendingTest')) {
      this.pendingTestUsed = true;
      this.print = { jobId: 'test', planHash: '0000000000000000', closed: true, kind: 'testA4' };
    }
    // Tests only: `?mockPendingPart=1` starts with part 1 of 2 of a big job sent while the app was closed.
    if (!this.pendingTestUsed && q.has('mockPendingPart')) {
      this.pendingTestUsed = true;
      this.print = {
        jobId: 'j-big',
        planHash: '0123456789abcdef',
        closed: true,
        kind: 'job',
        part: 0,
        parts: 2,
        partOf: 'fedcba9876543210',
      };
    }
    if (!this.print) return { state: 'none' };
    // `?mockPrint=checking,printing,sent`: each status call after the screen closed gives the next state.
    const asked = (new URLSearchParams(globalThis.location?.search ?? '').get('mockPrint') ?? 'sent').split(',');
    if (!this.print.closed) return { state: 'inDialog', ...this.print };
    const state = (asked[Math.min(this.statusCalls++, asked.length - 1)] ?? 'sent') as PrintState;
    const { jobId, planHash, kind, part, parts, partOf } = this.print;
    // Tests only: `?mockPhotoPaper=1` the 4×6 test saved the photo paper; `&mockRemeasure=1` at another size.
    const test =
      kind === 'testPhoto' && (state === 'sent' || state === 'printing') && q.has('mockPhotoPaper')
        ? { paperSaved: true, remeasure: q.has('mockRemeasure') }
        : {};
    return { state, jobId, planHash, kind, part, parts, partOf, ...test };
  }

  async clearPrint(): Promise<void> {
    this.print = null;
  }

  /** Tests only: `?mockSafeStart=1` simulates two crashes in a row; `?mockStartFail=1` makes the check fail. */
  async getStartInfo(): Promise<{ safeStart: boolean }> {
    if (new URLSearchParams(globalThis.location?.search ?? '').has('mockStartFail')) throw new Error('unavailable');
    return { safeStart: new URLSearchParams(globalThis.location?.search ?? '').has('mockSafeStart') };
  }

  async ackSafeStart(): Promise<void> {}

  /** Kept in the browser's storage, so a reload (like an app restart) reads them back. */
  async getSettings(): Promise<{ settings: object | null }> {
    let saved: Record<string, unknown> | null = null;
    try {
      saved = JSON.parse(localStorage.getItem('mock-settings') ?? 'null');
    } catch {
      saved = null;
    }
    // Tests run on a phone already set up (first-start steps seen), unless `?mockFirstRun=1`.
    if (new URLSearchParams(globalThis.location?.search ?? '').has('mockFirstRun')) return { settings: saved };
    return { settings: { welcomed: true, ...(saved ?? {}) } };
  }

  async saveSettings({ settings }: { settings: object }): Promise<{ saved: boolean }> {
    if (new URLSearchParams(globalThis.location?.search ?? '').has('mockSettingsFail')) return { saved: false };
    localStorage.setItem('mock-settings', JSON.stringify(settings));
    return { saved: true };
  }

  async setActiveJobs({ jobIds }: { jobIds: string[] }): Promise<void> {
    this.active = jobIds;
  }

  /** Tests only: `?mockKeptOnDelete=1` one job (being printed) is kept by Delete all. */
  private active: string[] = [];
  private roomMade = false;

  async deleteAllJobs(o?: { keepOpen?: boolean }): Promise<{ deleted: number; kept: number }> {
    if (deleteFails()) throw new Error('not deleted');
    (globalThis as { __deleteKeepOpen?: boolean }).__deleteKeepOpen = o?.keepOpen === true;
    this.roomMade = true;
    const keep = o?.keepOpen ? new Set(this.active) : new Set<string>();
    const n = [...this.jobs.keys()].filter((id) => !keep.has(id)).length;
    for (const id of [...this.jobs.keys()]) if (!keep.has(id)) this.jobs.delete(id);
    return { deleted: n, kept: new URLSearchParams(globalThis.location?.search ?? '').has('mockKeptOnDelete') ? 1 : 0 };
  }

  async printSpike(): Promise<{ result: 'started' | 'busy' }> {
    return { result: 'started' };
  }

  async lastPrintReport(): Promise<Record<string, unknown>> {
    return { scenario: null };
  }

  async shareText({ text }: { text: string }): Promise<void> {
    (globalThis as { __sharedText?: string }).__sharedText = text; // tests: what went to the share sheet
  }

  /** Tests: `?mockPick=0` closes the picker without files, `?mockPick=fail` cannot open it; else 4 photos, 1 photo
   * (passport) or 1 PDF (documents) arrive like a share. */
  async pickFiles({
    kind,
    from,
    max,
  }: {
    kind: 'photos' | 'passport' | 'documents' | 'cards';
    from?: 'gallery' | 'files';
    max?: number;
  }): Promise<{ picked: number }> {
    (globalThis as { __pickFrom?: string }).__pickFrom = from; // tests: which picker was asked for
    (globalThis as { __pickMax?: number }).__pickMax = max;
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('mockPick');
    if (q === 'fail') throw new Error('no picker');
    if (q === '0') return { picked: 0 };
    // ID cards: two photos (front and back), or with `?mockPdfAt=1` one e-Aadhaar PDF.
    const pdfCard =
      kind === 'cards' && from !== 'gallery' && new URLSearchParams(globalThis.location?.search ?? '').has('mockPdfAt');
    // Tests: `?mockPickN=<n>` chooses that many photos (Add photos); the gallery never gives PDFs.
    const asked = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockPickN') ?? 0);
    // The file manager (Android's document picker) cannot be told a most, as on a phone.
    const n = Math.min(
      from === 'files' ? Number.POSITIVE_INFINITY : (max ?? Number.POSITIVE_INFINITY),
      asked > 0 ? asked : kind === 'photos' ? 4 : kind === 'cards' && !pdfCard ? 2 : 1,
    );
    const intake = sampleIntake(n, `mock-pick-${this.later.length + 2}`) as Intake;
    if (kind === 'documents' && from !== 'gallery')
      intake.files = intake.files.map((f) => ({ ...f, sniffedType: 'pdf' as const }));
    intake.pick = kind;
    this.later.push(intake);
    setTimeout(() => this.notifyListeners('intakeReady', { intakeId: intake.intakeId, repeat: false }), 50);
    return { picked: n };
  }

  /**
   * Tests: every photo shows one card (the first with a face); with `?mockAadhaar=1` a PDF's first page shows two
   * panels (other PDFs none, like a normal document). `?mockCards=none` finds
   * nothing, `?mockCards=low` finds cards below the auto-accept level, `?mockCards=both` finds two in the first photo.
   */
  private cardCalls = 0;

  findCards(o: { jobId: string; passwords?: Record<number, string> }) {
    return this.inLine(() => this.findCardsNow(o));
  }
  private async findCardsNow({ jobId, passwords }: { jobId: string; passwords?: Record<number, string> }) {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const mode = q.get('mockCards');
    // Tests: `?mockSlowCards=<ms>` looks slowly; `?mockCardsFail=1` fails the first time only.
    this.cardCalls++;
    if (q.has('mockSlowCards')) await new Promise((r) => setTimeout(r, Number(q.get('mockSlowCards'))));
    if (q.has('mockCardsFail') && this.cardCalls === 1) throw new Error('engine busy');
    const items = (this.jobs.get(jobId)?.items ?? []) as { index: number; type: string }[];
    const card = (k: number, face: boolean) => ({
      quad: k === 0 ? [0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43] : [0.15, 0.52, 0.85, 0.52, 0.85, 0.92, 0.15, 0.92],
      confidence: mode === 'low' ? 0.6 : 0.95,
      face,
    });
    return {
      items: items.map((it, n) => {
        if (it.type === 'pdf') {
          if (q.has('mockPdfLocked') && passwords?.[it.index] !== 'RAMA1965')
            return { index: it.index, page: 0, state: 'locked' as const, cards: [] };
          if (!q.has('mockAadhaar')) return { index: it.index, page: 0, state: 'ok' as const, cards: [] };
          return { index: it.index, page: 0, state: 'ok' as const, cards: [card(0, true), card(1, false)] };
        }
        if (mode === 'none') return { index: it.index, state: 'ok' as const, cards: [] };
        // `mixed`: the first photo's card is sure, the second's is not.
        if (mode === 'mixed')
          return {
            index: it.index,
            state: 'ok' as const,
            cards: [{ ...card(0, n === 0), confidence: n === 0 ? 0.95 : 0.6 }],
          };
        if (mode === 'both' && n === 0)
          return { index: it.index, state: 'ok' as const, cards: [card(0, false), card(1, true)] };
        return { index: it.index, state: 'ok' as const, cards: [card(0, n === 0)] };
      }),
    };
  }

  /** Tests: `?mockFaceTurn=<index>:<turn>,…` puts faces on those photos at that turn only; others have none. */
  async faceTurns({ jobId }: { jobId: string; budgetMs?: number }) {
    // Tests: `?mockSlowFaces=<ms>`: the faces take this long (a slow phone).
    const slow = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockSlowFaces') ?? 0);
    if (slow > 0) await new Promise((r) => setTimeout(r, slow));
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('mockFaceTurn') ?? '';
    const at = new Map(
      q
        .split(',')
        .filter(Boolean)
        .map((p) => p.split(':').map(Number) as [number, number]),
    );
    const items = (this.jobs.get(jobId)?.items ?? []) as { index: number; type: string }[];
    return {
      items: items
        .filter((i) => i.type !== 'pdf')
        .map((i) => ({ index: i.index, faces: [0, 1, 2, 3].map((k) => (at.get(i.index) === k ? 1 : 0)) })),
    };
  }

  async cancelFaceTurns(_o: { jobId: string }): Promise<void> {}

  /** A labelled card image ("Card", and its corners' first value so a moved corner shows a new image). */
  async cardImage({ quad, item }: { jobId: string; item: number; page?: number; quad: number[]; width?: number }) {
    const g = globalThis as { __cardImages?: number };
    g.__cardImages = (g.__cardImages ?? 0) + 1;
    const label = `Card ${item} ${Math.round((quad[0] ?? 0) * 100)}`;
    return {
      path: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='856' height='540'><rect width='100%' height='100%' fill='#eef' stroke='#334' stroke-width='8'/><text x='50%' y='55%' font-size='70' text-anchor='middle'>${label}</text></svg>`)}`,
    };
  }

  async jobCovers({ jobIds }: { jobIds: string[] }): Promise<{ covers: Record<string, string | null> }> {
    const covers: Record<string, string | null> = {};
    for (const id of jobIds) {
      const items = (this.jobs.get(id)?.items ?? []) as { type: string; path: string }[];
      covers[id] = items.find((i) => i.type !== 'pdf')?.path ?? null;
    }
    return { covers };
  }

  /** Tests: `?mockNoPrintService=1`: a phone with no printing app (Android 7 without the Brother plugin). */
  async printServices() {
    const none = new URLSearchParams(globalThis.location?.search ?? '').has('mockNoPrintService');
    return { any: !none, builtIn: !none, brother: false, mopria: false };
  }

  async problemReport(): Promise<{ text: string }> {
    return { text: 'PrintSaathi problem report\nApp: mock\nAndroid web-mock\n\nLast events:\n{"e":"start"}' };
  }

  async getFontScale(): Promise<{ fontScale: number }> {
    return { fontScale: 1 };
  }

  async splashGone(): Promise<void> {
    (globalThis as { __splashGone?: boolean }).__splashGone = true; // tests: the phone was told
    splashStep('gone');
  }

  async splashShown(): Promise<void> {
    splashStep(document.getElementById('splash')?.isConnected ? 'shown with the splash' : 'shown without it');
  }

  async setCustomerContentShown({ shown }: { shown: boolean }): Promise<{ secure: boolean }> {
    (globalThis as { __customerShown?: boolean }).__customerShown = shown; // tests: screenshot protection asked
    return { secure: false };
  }
}

/** Tests only: `__mockDeleteFails` makes deleting a job fail (Recent jobs says so). */
const deleteFails = () => (globalThis as { __mockDeleteFails?: boolean }).__mockDeleteFails === true;
