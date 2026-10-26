// Typed bridge to the in-app Kotlin plugin "PrintEngine". Only small JSON crosses the bridge:
// ids, paths and facts — never image or PDF bytes (PLAN §B).
import { Capacitor, type PluginListenerHandle, registerPlugin } from '@capacitor/core';
import type { StyleId } from '../core/job/job';
import type { PrintPlan } from '../core/plan/plan';

export type PdfUnlockTier = 'NATIVE_35' | 'PRE_V' | 'NONE';

export interface DeviceFacts {
  androidRelease: string;
  sdkInt: number;
  sExtensionLevel: number | null;
  totalRamMb: number;
  isLowRamDevice: boolean;
  memoryClassMb: number;
  largeMemoryClassMb: number;
  webViewPackage: string;
  webViewVersion: string;
  pdfUnlockTier: PdfUnlockTier;
  manufacturer: string;
  model: string;
  fontScale: number;
}

/** Decodable picture types (the engine prints them as photos). */
export const PHOTO_TYPES: ReadonlySet<SniffedType> = new Set(['jpeg', 'png', 'webp', 'heif', 'gif', 'bmp']);

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'heif' | 'gif' | 'bmp' | 'pdf' | 'office' | 'video' | 'other';

export interface IntakeFile {
  index: number;
  /** Absolute path in private storage; display with Capacitor.convertFileSrc(path). */
  path: string;
  sniffedType: SniffedType;
  bytes: number;
  sha256: string;
  /** Owner, round 8: this PDF is a customer's text message the engine printed, at this text size (pt). */
  text?: { size: TextSize };
}

/** Owner, round 8: the text sizes a text message prints at (points). */
export type TextSize = 10 | 12 | 14 | 18;

/** Why one shared item could not be received (journal codes from the native CopyOutcome). */
export type IntakeProblemReason =
  | 'refused'
  | 'empty'
  | 'tooBig'
  | 'jobTooBig'
  | 'storageFull'
  | 'stalled'
  | 'timedOut'
  | 'permission'
  | 'failed'
  /** Owner, round 8: a shared or pasted text message with nothing in it, or too long to print here. */
  | 'emptyText'
  | 'textTooLong'
  /** Owner, round 8: the camera gave something that is not a photo. */
  | 'notPhoto';

export interface Intake {
  intakeId: string;
  /** 'done', or 'interrupted' when the app was closed while copying (some files may be missing). */
  state?: 'done' | 'interrupted';
  /** Files that were being shared (also known for interrupted intakes). */
  expected?: number;
  problems?: { index: number; reason: IntakeProblemReason }[];
  /** More than 100 files were shared: nothing was taken (PLAN §F6). */
  tooMany?: boolean;
  /** Chosen on Home with Choose from phone (and what for); absent for a share (PLAN §J0). */
  pick?: 'photos' | 'passport' | 'documents' | 'cards' | 'text' | 'scan';
  /** Owner, round 8: a page photographed to join scan job [into], in place of its page [retake]. */
  scan?: { into?: string; retake?: number };
  /** Receiving was cancelled: [files] are what arrived of [expected] (PLAN §D2). */
  cancelled?: boolean;
  rejected: number;
  /** How many of `rejected` the URI policy refused (hostile or own-app URIs), as opposed to copies that failed. */
  refusedByPolicy: number;
  files: IntakeFile[];
}

/** retry: the engine could not do it just now (not started, or stopped once); Try again may work. */
/** tooBig: a photo larger than this phone can open safely (sent as a document). */
export type ThumbState = 'ok' | 'damaged' | 'unsupported' | 'notPhoto' | 'retry' | 'tooBig';
/** width/height: the photo's upright shape (after EXIF), measured by the engine; the layout uses it. */
export type ThumbResult = { index: number; state: ThumbState; thumb?: string; width?: number; height?: number };

/**
 * Outcome of making the print file. Always names the plan it was for: a result for a plan the screen no longer
 * shows is ignored (PLAN §D2c). `damaged` names the photo the engine could not read.
 */
export type RenderResult =
  | {
      planHash: string;
      state: 'done';
      pdfPath: string;
      pages: number /** Photos under 200 dpi at their box. */;
      lowRes?: number[];
      /** Each photo's dots per inch at its box (item index → dpi), for PLAN §F6's blurry thresholds. */
      dpi?: Record<string, number>;
    }
  | { planHash: string; state: 'damaged'; itemIndex: number }
  | { planHash: string; state: 'cancelled' | 'noSpace' | 'failed' };

/** What a print is: a customer job or a test page (never shown as a customer job). */
export type PrintKind = 'job' | 'testA4' | 'testPhoto';

/** A customer PDF as the engine read it (PLAN §G4, §J8): sizes in points as shown; never a password. */
export type DocFactsItem = {
  index: number;
  state: 'ok' | 'password' | 'unsupported' | 'damaged' | 'tooBig' | 'retry';
  pages?: number;
  sizes?: [number, number][];
  forms?: boolean;
  /** Opened with a password or as the app's unlocked copy (never the untouched path). */
  unlocked?: boolean;
};

/** After Android's print screen closes (PLAN §J8). `printing` counts as sent: the printer has the job. */
export type PrintState =
  | 'none'
  | 'inDialog'
  /** The print screen just closed and Android has not settled the job yet: ask again in a moment. */
  | 'checking'
  | 'sent'
  | 'printing'
  | 'blocked'
  | 'savedAsFile'
  | 'nothingPrinted'
  | 'wrongPaper'
  | 'interrupted'
  | 'failed'
  | 'unknown'
  /** Owner, round 5: Android's print screen closed before the print button was pressed: nothing was sent. */
  | 'notSent';

/** [upsideDown]: the face on it reads only with the card turned over: it prints with a half turn (spec Part 2). */
export type FoundCard = { quad: number[]; confidence: number; face: boolean; upsideDown?: boolean };
export type CardsInItem = { index: number; page?: number; state: 'ok' | 'damaged' | 'locked'; cards: FoundCard[] };

export interface PrintEnginePlugin {
  /** Every received intake not yet taken into a job, oldest first. */
  listIntakes(): Promise<{ intakes: Intake[] }>;
  ackIntake(o: { intakeId: string }): Promise<void>;
  /** Saves a job; `saved` is false when a newer revision is already stored (stale write refused). */
  saveJob(o: { job: object }): Promise<{ saved: boolean }>;
  loadJob(o: { id: string }): Promise<{ job: object | null }>;
  listJobs(): Promise<{ jobs: object[] }>;
  deleteJob(o: { id: string }): Promise<void>;
  /** New files arrived → Add to this job (PLAN §I-17): job [from]'s files placed in job [into]'s own folder. */
  mergeJobFiles(o: { from: string; into: string }): Promise<{ files: { from: string; to: string }[] }>;
  /** Engine-made thumbnails (hash-named, reused); photos only. */
  makeThumbnails(o: { jobId: string }): Promise<{ items: ThumbResult[] }>;
  /** Stops making this job's thumbnails after the photo being made (Cancel on Received, PLAN §F6). */
  cancelThumbnails(o: { jobId: string }): Promise<void>;
  /**
   * Makes jobs/<id>/out/<planHash>/print.pdf from the plan (one at a time; a new call cancels the previous one).
   * [passwords]: locked PDFs' passwords by item, used in memory for this render only.
   */
  renderPlan(o: {
    jobId: string;
    planHash: string;
    plan: PrintPlan;
    passwords?: Record<number, string>;
  }): Promise<RenderResult>;
  /** Every PDF of the job read by the isolated engine; [passwords] by item, in memory for this call only. */
  documentFacts(o: { jobId: string; passwords?: Record<number, string> }): Promise<{ items: DocFactsItem[] }>;
  /**
   * Print style samples (PLAN §I-7): photo [item] (or [page] of that PDF) in all six styles, ≤ 360 px, by the print's
   * own code. A path per style, or null when one could not be made.
   */
  styleSamples(o: {
    jobId: string;
    item: number;
    page?: number;
    password?: string;
    /** The first placement's crop (on the photo as shown) and quarter turns, as the print has them. */
    cropX?: number;
    cropY?: number;
    cropW?: number;
    cropH?: number;
    turns?: number;
  }): Promise<{ samples: { style: StyleId; path: string | null }[] }>;
  /** Smart-crop analysis files (PLAN §F3): each photo upright at ≤ 512 px as grey, by path (null: not made). */
  /** [existingOnly]: only the files made already, at once (never queued behind the analysis thread). */
  analysisBytes(o: {
    jobId: string;
    budgetMs?: number;
    existingOnly?: boolean;
  }): Promise<{ items: { index: number; path: string | null }[] }>;
  /** Stops this job's analysis after the photo being looked at (the choice was made: previews come first). */
  cancelAnalysis(o: { jobId: string }): Promise<void>;
  /** A small image of a PDF page for choosing pages (a path, or null). */
  pdfPageThumb(o: { jobId: string; item: number; page: number; password?: string }): Promise<{ path: string | null }>;
  /** ADR-002 option (i): one ≤ 256 KB chunk (base64) of a PDF the app unlocked itself, in order, ≤ 20 MB. */
  writeUnlocked(o: {
    jobId: string;
    item: number;
    offset: number;
    data: string;
    last: boolean;
  }): Promise<{ ok: boolean }>;
  cancelRender(): Promise<void>;
  /**
   * The real-file preview: page [index] of that plan's print file, rendered by the engine (a path; null if the file
   * is gone or the page could not be made). One page per call on its own thread, so previews never hold up saving,
   * making the file or printing; a newer plan stops them (gate review F1).
   */
  previewPage(o: {
    jobId: string;
    planHash: string;
    index: number;
  }): Promise<{ planHash: string; index: number; path: string | null }>;
  /** Opens Android's print screen for the finished print file of that plan. One print at a time. */
  printFile(o: {
    jobId: string;
    planHash: string;
    pages: number;
    contentType: 'photo' | 'document';
    /** bw asks the printer for monochrome (the file is grey data already). */
    colour: 'colour' | 'bw';
    /** A big job's part (from 0) of how many, kept with the print so it survives the app being closed. */
    part?: number;
    parts?: number;
    /** The full plan's hash the part was cut from (re-review N5). */
    partOf?: string;
    /** The plan is on the shop printer's 4×6 photo paper (passport): ask Android for exactly that size. */
    photoPaper?: { wMils: number; hMils: number };
  }): Promise<{ result: 'started' | 'busy' | 'noFile' | 'failed' }>;
  /** The print in flight, also after the app was killed; `kind` says whether it is a customer job or a test page. */
  printStatus(): Promise<{
    state: PrintState;
    jobId?: string;
    planHash?: string;
    kind?: PrintKind;
    /** Big jobs print in parts (PLAN §D4): which part (from 0) of how many, cut from which full plan. */
    part?: number;
    parts?: number;
    partOf?: string;
    /** Test pages: this run saved the printer's 4×6 photo paper; [remeasure]: print it once more to measure. */
    paperSaved?: boolean;
    remeasure?: boolean;
  }>;
  /** The shop test page (PLAN §D4) on A4 or 4×6 photo paper; its paper is remembered for the printer. */
  printTestPage(o: { paper: 'A4' | 'PHOTO_4x6' }): Promise<{ result: 'started' | 'busy' | 'failed' }>;
  /** What the test pages learnt: the printer, and its 4×6 photo paper (null: it has none). Empty before any. */
  paperSetup(): Promise<{
    printer?: string;
    photoPaper?: { wMils: number; hMils: number; edgeMm: number } | null;
    /** The edge to keep clear on A4 (the printer's largest A4 margin, at least 3 mm), once measured. */
    a4EdgeMm?: number;
  }>;
  /** The Result screen is done: forget the print and delete its print file. */
  clearPrint(): Promise<void>;
  getDeviceFacts(): Promise<DeviceFacts>;
  /** safeStart: the app crashed twice within a minute; open on Home and explain (PLAN §D5). */
  getStartInfo(): Promise<{ safeStart: boolean }>;
  ackSafeStart(): Promise<void>;
  /** Every job on the screen stack: old-file deletion never touches them (the first call runs the first sweep). */
  setActiveJobs(o: { jobIds: string[] }): Promise<void>;
  /** Settings: delete every customer job now (a job being printed is kept). */
  /** [keepOpen]: "Delete old PrintSaathi jobs" when the phone is full: the jobs on screen are kept too. */
  deleteAllJobs(o?: { keepOpen?: boolean }): Promise<{ deleted: number; kept?: number }>;
  getPendingIntake(): Promise<{ intake: Intake | null }>;
  printSpike(o: {
    paper: 'A4' | '4x6';
    sheets: 1 | 2;
    contentType: 'photo' | 'document';
    monochrome?: boolean;
  }): Promise<{
    result: 'started' | 'busy';
  }>;
  lastPrintReport(): Promise<Record<string, unknown>>;
  /** The phone's font-size setting (1.0 = normal). */
  getFontScale(): Promise<{ fontScale: number }>;
  /** The start-up splash is gone (the page has drawn): the phone stops drawing the splash picture under the page. */
  splashGone(): Promise<void>;
  /** The page's own start-up splash is on screen: the phone's splash, held until now, goes at once (Android 12+). */
  splashShown(): Promise<void>;
  /** The shop owner's settings (PLAN §I-15) as saved, or null before the first save (src/core/settings). */
  getSettings(): Promise<{ settings: object | null }>;
  saveSettings(o: { settings: object }): Promise<{ saved: boolean }>;
  /** Send problem report (PLAN §K10): versions, phone, shop and recent events; no customer data. */
  problemReport(): Promise<{ text: string }>;
  /**
   * Choose from phone (PLAN §D3, §J0): the phone's photo picker (one photo for passport) or document picker. The
   * files arrive like a share (intakeReady); [picked] is how many were chosen, 0 when the picker was closed.
   */
  /**
   * [from]: 'gallery' = the photo picker (photos only; ID cards at most 2), 'files' = the file manager; none = the kind's
   * own (photos and passport: gallery; documents and cards: file manager). [max]: at most this many (Add photos: what
   * still fits the job).
   */
  pickFiles(o: {
    kind: 'photos' | 'passport' | 'documents' | 'cards';
    from?: 'gallery' | 'files';
    max?: number;
  }): Promise<{ picked: number }>;
  /**
   * Aadhaar & ID cards (Phase 14): the cards the engine finds in each photo of a job, and the card panels on its PDFs'
   * first pages. Corners are fractions of the upright photo or page (TL, TR, BR, BL); [face]: a face is on the card.
   */
  findCards(o: { jobId: string; passwords?: Record<number, string> }): Promise<{ items: CardsInItem[] }>;
  /**
   * Phase 15 (spec Part 3): for every photo of a job, the faces Android's finder sees turned 0, 1, 2 and 3 quarter
   * turns clockwise. Photos it cannot read are left out.
   */
  faceTurns(o: { jobId: string; budgetMs?: number }): Promise<{ items: { index: number; faces: number[] }[] }>;
  /** Stops this job's face check after the photo being looked at (the shopkeeper made a choice). */
  cancelFaceTurns(o: { jobId: string }): Promise<void>;
  /** One card straightened for the screens ([width] px wide), as a file; null when it can't be made. */
  cardImage(o: {
    jobId: string;
    item: number;
    page?: number;
    quad: number[];
    width?: number;
    password?: string;
  }): Promise<{ path: string | null }>;
  /** The phone's print services: none means only "Save as PDF" (PLAN §D4, §K12). */
  printServices(): Promise<{ any: boolean; builtIn: boolean; brother: boolean; mopria: boolean }>;
  /** Each job's first photo thumbnail already made (job id → path), for Recent jobs; none are made here. */
  jobCovers(o: { jobIds: string[] }): Promise<{ covers: Record<string, string | null> }>;
  /** Tell the app a screen with customer files is (not) showing; Android 12 and older block screenshots meanwhile. */
  setCustomerContentShown(o: { shown: boolean }): Promise<{ secure: boolean }>;
  shareText(o: { text: string }): Promise<void>;
  /** Owner, round 8: Home → Text message → Done: the text becomes a new job (intakeReady follows). */
  textJob(o: { text: string }): Promise<void>;
  /**
   * Owner, round 8: Edit text ([text]) or Text size ([size] pt) of a text job's file [index]: a new PDF of it, to save
   * in the job with setTextPdf.
   */
  textToPdf(o: {
    jobId: string;
    index: number;
    size: TextSize;
    text?: string;
  }): Promise<{ path: string; bytes: number; sha256: string; pages: number }>;
  /** Owner, round 8: the text kept for a text job's file (Edit text). */
  readText(o: { jobId: string; index: number }): Promise<{ text: string }>;
  /** Owner, round 8: Paste: the text on the phone's clipboard ("" when nothing is copied). */
  readClipboard(): Promise<{ text: string }>;
  /**
   * Owner, round 8 (scan pages): the phone's own camera app takes a page's photo, [into] a scan job, in place of its
   * page [retake]. {taken: 1}: it arrives like a share (a "scan" intake); {taken: 0}: closed without one; noCamera:
   * this phone has no camera app; empty: the camera said it took one but gave none (review M5). A second request while
   * the camera is open is answered {taken: 0} at once (review I4).
   */
  scanPhoto(o: { into?: string; retake?: number }): Promise<{ taken: 0 | 1; noCamera?: boolean; empty?: boolean }>;
  /** Owner, round 8: the paper page in photo [index]: its corners (8 fractions of the upright photo, TL first). */
  findPage(o: {
    jobId: string;
    index: number;
  }): Promise<{ state: 'ok' | 'damaged'; found?: boolean; corners?: number[]; confidence?: number }>;
  addListener(
    event: 'intakeReady',
    cb: (e: { intakeId: string; repeat: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  /** The phone's text size changed while the app was open. */
  addListener(event: 'fontScaleChanged', cb: (e: { fontScale: number }) => void): Promise<PluginListenerHandle>;
  /** Android's print screen closed; ask printStatus() what happened. */
  addListener(
    event: 'printClosed',
    cb: (e: { jobId: string; planHash: string }) => void,
  ): Promise<PluginListenerHandle>;
  /** Stops this share being copied after its current file; what arrived is kept (PLAN §D2). */
  cancelIntake(o: { intakeId: string }): Promise<void>;
  /** A share being copied: files done of files shared ("Receiving files… 12 of 60"). */
  addListener(
    event: 'intakeProgress',
    cb: (e: { intakeId: string; done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
  /** One more photo of the job is ready (Received says "12 of 60"). */
  addListener(
    event: 'thumbnailProgress',
    cb: (e: { jobId: string; done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'renderProgress',
    cb: (e: { jobId: string; planHash: string; done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
  /** The copy failed (e.g. storage full); `error` is an exception class name, never a path. */
  addListener(
    event: 'intakeFailed',
    cb: (e: { intakeId: string; error: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const PrintEngine = registerPlugin<PrintEnginePlugin>('PrintEngine', {
  web: () => import('./printEngine.mock').then((m) => new m.PrintEngineMock()),
});

export const isNative = (): boolean => Capacitor.isNativePlatform();
