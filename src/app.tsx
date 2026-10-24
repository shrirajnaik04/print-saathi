import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { MAX_JOB_FILES, takeAddInto } from './core/intake/addInto';
import { takeNewIntakesDetailed } from './core/intake/flow';
import { addToJob } from './core/intake/merge';
import { problemMessages } from './core/intake/messages';
import { receivingDone, receivingNow, setReceiving } from './core/intake/receiving';
import { intakeRunner } from './core/intake/runner';
import { normalizeJob } from './core/job/job';
import { exitsApp, leftJob } from './core/nav/guard';
import { restoreStack, saveStack } from './core/nav/persist';
import { initialStack, type NavAction, navigate } from './core/nav/stack';
import { en } from './i18n/en';
import { passwords } from './native/passwords';
import { PrintEngine } from './native/printEngine';
import { Help } from './screens/help/Help';
import { Welcome } from './screens/help/Welcome';
import { Home } from './screens/home/Home';
import { Photos, PhotoTools } from './screens/photos/Photos';
import { forgetRemoved } from './screens/photos/undo';
import { seenPrinted } from './screens/printedJobs';
import { Problem } from './screens/problem/Problem';
import { Ready } from './screens/ready/Ready';
import { Received } from './screens/received/Received';
import { Receiving } from './screens/received/Receiving';
import { Recent } from './screens/recent/Recent';
import { Result } from './screens/result/Result';
import type { ScreenProps } from './screens/types';
import { loadSettings } from './screens/useSettings';
import { ConfirmSheet } from './ui/ConfirmSheet';
import { lazyScreen } from './ui/lazyScreen';

// Off the start path (startup JS budget, PLAN §C): these load the first time they open, or in the background soon
// after start (preloadScreens).
const cards = () => import('./screens/cards/Cards');
const passport = () => import('./screens/passport/Passport');
const docs = () => import('./screens/docs/Docs');
const groups = () => import('./screens/settings/SettingsGroups');
const CardsFound = lazyScreen(() => cards().then((m) => m.CardsFound));
const FixCorners = lazyScreen(() => cards().then((m) => m.FixCorners));
const CardSize = lazyScreen(() => cards().then((m) => m.CardSize));
const CardSource = lazyScreen(() => import('./screens/cards/CardSource').then((m) => m.CardSource));
const PrintStyle = lazyScreen(() => import('./screens/change/PrintStyle').then((m) => m.PrintStyle));
const Unlock = lazyScreen(() => docs().then((m) => m.Unlock));
const DocPages = lazyScreen(() => docs().then((m) => m.DocPages));
const DocOrder = lazyScreen(() => docs().then((m) => m.DocOrder));
const DocTools = lazyScreen(() => docs().then((m) => m.DocTools));
const WhichPhoto = lazyScreen(() => passport().then((m) => m.WhichPhoto));
const PassportCrop = lazyScreen(() => passport().then((m) => m.PassportCrop));
const PassportCount = lazyScreen(() => passport().then((m) => m.PassportCount));
const PassportSizeChoice = lazyScreen(() => passport().then((m) => m.PassportSizeChoice));
const PassportBorderChoice = lazyScreen(() => passport().then((m) => m.PassportBorderChoice));
const PassportCustom = lazyScreen(() => groups().then((m) => m.PassportCustom));
const CropPhoto = lazyScreen(() => import('./screens/photos/CropPhoto').then((m) => m.CropPhoto));
const AddSource = lazyScreen(() => import('./screens/add/AddSource').then((m) => m.AddSource));
const Adjust = lazyScreen(() => import('./screens/adjust/Adjust').then((m) => m.Adjust));
const PaperType = lazyScreen(() => import('./screens/change/PaperType').then((m) => m.PaperType));
// Change and its one-question screens follow Ready: loaded when first opened (startup JS budget, PLAN §C).
const choices = () => import('./screens/change/Choices');
const Change = lazyScreen(() => import('./screens/change/Change').then((m) => m.Change));
const Colour = lazyScreen(() => choices().then((m) => m.Colour));
const Copies = lazyScreen(() => choices().then((m) => m.Copies));
const Direction = lazyScreen(() => choices().then((m) => m.Direction));
const Layout = lazyScreen(() => choices().then((m) => m.Layout));
const Pages = lazyScreen(() => choices().then((m) => m.Pages));
const PaperChoice = lazyScreen(() => choices().then((m) => m.PaperChoice));
const Quality = lazyScreen(() => choices().then((m) => m.Quality));
// Screens that only follow another one (black edges found; files arriving during a job): loaded when needed, so the
// first screen stays within the startup budget (PLAN §C, 60 KB).
const BlackEdges = lazyScreen(() => import('./screens/edges/BlackEdges').then((m) => m.BlackEdges));
const NewFiles = lazyScreen(() => import('./screens/newfiles/NewFiles').then((m) => m.NewFiles));
const DeleteAll = lazyScreen(() => import('./screens/settings/DeleteAll').then((m) => m.DeleteAll));
const SettingChoice = lazyScreen(() => import('./screens/settings/SettingChoice').then((m) => m.SettingChoice));
const Settings = lazyScreen(() => import('./screens/settings/Settings').then((m) => m.Settings));
const ShopName = lazyScreen(() => import('./screens/settings/ShopName').then((m) => m.ShopName));
const PassportCountSetting = lazyScreen(() => groups().then((m) => m.PassportCountSetting));
const PassportSettings = lazyScreen(() => groups().then((m) => m.PassportSettings));
const Prices = lazyScreen(() => groups().then((m) => m.Prices));
const Report = lazyScreen(() => groups().then((m) => m.Report));
const Screenshots = lazyScreen(() => groups().then((m) => m.Screenshots));
const TestPage = lazyScreen(() => import('./screens/testpage/TestPage').then((m) => m.TestPage));
const Tests = lazyScreen(() => import('./screens/tests/Tests').then((m) => m.Tests));
const LAZY = [
  CardsFound,
  FixCorners,
  CardSize,
  CardSource,
  PrintStyle,
  Unlock,
  DocPages,
  DocOrder,
  DocTools,
  WhichPhoto,
  PassportCrop,
  PassportCount,
  PassportSizeChoice,
  PassportBorderChoice,
  PassportCustom,
  CropPhoto,
  Adjust,
  DeleteAll,
  SettingChoice,
  Settings,
  ShopName,
  PassportCountSetting,
  PassportSettings,
  Prices,
  Report,
  Screenshots,
  TestPage,
  Tests,
];

/** After start, when the phone is idle: every lazy screen's code, so none opens empty later (failures retry on open). */
/**
 * The screens off the start path load in the background once the first screen is up and the splash has gone (main.tsx
 * calls this), never in its way (release cold starts, 2026-10-24). Test builds load each screen only when it opens: the
 * slower case, and 1,400 test pages never fetch every screen.
 */
export function preloadScreensSoon(): void {
  if (import.meta.env.MODE === 'e2e') return;
  setTimeout(preloadScreens, 300);
}

function preloadScreens(): void {
  for (const s of LAZY) s.preload().catch(() => {});
}

const SCREENS: Record<string, (p: ScreenProps) => preact.JSX.Element> = {
  home: Home,
  help: Help,
  settings: Settings,
  problem: Problem,
  tests: Tests,
  received: Received,
  ready: Ready,
  change: Change,
  layout: Layout,
  pages: Pages,
  copies: Copies,
  colour: Colour,
  photos: Photos,
  phototools: PhotoTools,
  recent: Recent,
  result: Result,
  testpage: TestPage,
  deleteall: DeleteAll,
  whichphoto: WhichPhoto,
  passportcrop: PassportCrop,
  passportcount: PassportCount,
  passportsize: PassportSizeChoice,
  passportborder: PassportBorderChoice,
  passportcustom: PassportCustom,
  unlock: Unlock,
  docpages: DocPages,
  docorder: DocOrder,
  doctools: DocTools,
  printstyle: PrintStyle,
  blackedges: BlackEdges,
  newfiles: NewFiles,
  setting: SettingChoice,
  shopname: ShopName,
  passportsettings: PassportSettings,
  passportcountsetting: PassportCountSetting,
  prices: Prices,
  screenshots: Screenshots,
  report: Report,
  paperchoice: PaperChoice,
  direction: Direction,
  quality: Quality,
  papertype: PaperType,
  welcome: Welcome,
  receiving: Receiving,
  cropphoto: CropPhoto,
  addsource: AddSource,
  adjust: Adjust,
  cards: CardsFound,
  fixcorners: FixCorners,
  cardsize: CardSize,
  cardsource: CardSource,
};

/**
 * Test builds only (`vite build --mode e2e`): `?screen=<name>` opens that screen on top of Home so the layout
 * matrix covers screens with no button yet. In the app build this branch is constant-false and removed.
 */
function startStack() {
  const base = initialStack();
  if (import.meta.env.MODE === 'e2e') {
    const name = new URLSearchParams(location.search).get('screen');
    if (name && name !== 'home' && name in SCREENS) return [...base, { name, params: {} }];
  }
  // Android closed the app in the background: within 30 minutes the shopkeeper comes back to the same screen (PLAN §D5).
  // The first-start steps are never brought back (Home shows them again if they were not finished), and neither is
  // Receiving: the copy it showed ended with the app (gate review M1).
  const restorable = new Set(Object.keys(SCREENS).filter((n) => n !== 'welcome' && n !== 'receiving'));
  return restoreStack(localStorage, Date.now(), restorable) ?? base;
}

/** Screens showing one job: a repeat share of that job while one of them is on top changes nothing. */
const JOB_SCREEN_NAMES = new Set([
  'received',
  'ready',
  'result',
  'whichphoto',
  'passportcrop',
  'passportcount',
  'passportsize',
  'passportborder',
  'unlock',
  'docpages',
  'docorder',
  'doctools',
  'printstyle',
  'blackedges',
  'cropphoto',
  'addsource',
  'adjust',
  'cards',
  'fixcorners',
  'cardsize',
]);

/**
 * Each stack entry is its own screen, identified by the entry object itself: push and replace always make a new one,
 * back keeps the earlier ones. So "Back, then the same screen again" is a new screen (Phase 9 re-review).
 */
const entryIds = new WeakMap<object, number>();
let nextEntryId = 0;
function entryId(entry: object): number {
  let id = entryIds.get(entry);
  if (id === undefined) {
    id = ++nextEntryId;
    entryIds.set(entry, id);
  }
  return id;
}

export function App() {
  const [stack, setStack] = useState(startStack);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  /**
   * The `go` a screen gets: it does nothing once that screen is no longer on top, so work finishing late (a save, a
   * check) never opens or replaces a screen behind the shopkeeper after Back, Home or a new share (Phase 9 re-reviews).
   */
  const goFrom = (entry: object) => (action: NavAction) => {
    if (stackRef.current[stackRef.current.length - 1] === entry) go(action);
  };
  // Which way the next screen moves in (Phase 13 motion): forward for a new screen, back for Back, a fade otherwise.
  const enterDir = useRef<'forward' | 'back' | 'fade'>('fade');
  // A question before leaving an unprinted job or closing the app (owner, round 4); any move closes it.
  const [ask, setAskState] = useState<{ kind: 'leave'; jobId: string; action: NavAction } | { kind: 'exit' } | null>(
    null,
  );
  const askNow = useRef<typeof ask>(null);
  const setAsk = (a: typeof ask) => {
    askNow.current = a;
    setAskState(a);
  };
  const goNow = (action: NavAction) => {
    if (askNow.current) setAsk(null);
    const dir =
      action.type === 'push' ? 'forward' : action.type === 'back' || action.type === 'backTo' ? 'back' : 'fade';
    const before = stackRef.current[stackRef.current.length - 1];
    const r = navigate(stackRef.current, action);
    // The same screen for the same job replacing itself (the page tools after a move) stays the same screen: updated
    // in place, never reloaded (final review). Its handlers rebind to the new entry on the next render.
    const after = r.stack[r.stack.length - 1];
    if (
      action.type === 'replace' &&
      before &&
      after &&
      after.name === before.name &&
      after.params.jobId === before.params.jobId &&
      // Another share is a new question with its own state (review I2), never the old one updated; the next ID card
      // side is its own crop screen, never the side before with its frame (review C1, round 4).
      after.name !== 'newfiles' &&
      after.name !== 'fixcorners'
    )
      entryIds.set(after, entryId(before));
    // Only a new screen gets an entrance: a screen updated in place keeps its class, so nothing replays (review I1).
    // Back on Home minimises the app: nothing slides (review M9).
    if (!before || !after || entryId(after) !== entryId(before))
      enterDir.current = r.effect === 'minimise' ? 'fade' : dir;
    if (r.effect === 'minimise') {
      if (Capacitor.isNativePlatform()) void NativeApp.minimizeApp();
      if (import.meta.env.MODE === 'e2e') {
        const g = globalThis as { __closedApp?: number };
        g.__closedApp = (g.__closedApp ?? 0) + 1;
      }
    }
    // At once, not at the next render: two steps in a row (safe start: Home, then Problem) build on each other.
    stackRef.current = r.stack;
    setStack(r.stack);
  };
  // The shopkeeper's own moves (screens, Android Back): Back while a question shows answers it safely; Back on Home asks
  // before closing the app; leaving an unprinted job's screens asks first (a printed or vanished job does not).
  const go = (action: NavAction) => {
    if (askNow.current) {
      // The question is modal: only Android Back reaches here from the shopkeeper, and answers Keep working. Any other
      // step is the screen's own, made when its work finished (a print sent → its result; a PDF looked at → Ready):
      // it goes on, and the question gives way (review I1).
      if (action.type === 'back') return setAsk(null);
      return goNow(action);
    }
    if (exitsApp(stackRef.current, action)) return setAsk({ kind: 'exit' });
    const jobId = leftJob(stackRef.current, action);
    if (!jobId) return goNow(action);
    // Decided at once, never waiting on the engine's one queue (review C2): a job seen printed just goes; any other is
    // asked about now. One this run has not seen yet is also read in the background: printed or gone, it just goes.
    const printed = seenPrinted(jobId);
    if (printed) return goNow(action);
    const question = { kind: 'leave' as const, jobId, action };
    setAsk(question);
    if (printed === undefined)
      void PrintEngine.loadJob({ id: jobId })
        .then(({ job }) => normalizeJob(job))
        .catch(() => null)
        .then((job) => {
          if (askNow.current !== question) return; // answered meanwhile
          if (!job || job.printedAt) goNow(action);
        });
  };

  // Android Back = in-app Back on every screen; on Home it minimises (PLAN §D5). Works with predictive back.
  useEffect(() => {
    if (import.meta.env.MODE === 'e2e')
      (globalThis as { __androidBack?: () => void }).__androidBack = () => go({ type: 'back' }); // tests: phone Back
    if (!Capacitor.isNativePlatform()) return;
    const handle = NativeApp.addListener('backButton', () => go({ type: 'back' }));
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  // Shares from WhatsApp become jobs as soon as the app can see them: at start, and on every new share.
  useEffect(() => {
    const runner = intakeRunner(async (open) => {
      const { defaults } = await loadSettings(); // new photo jobs start on the paper printed last; all in colour
      const { jobs, empty, picks, cancelled } = await takeNewIntakesDetailed(
        PrintEngine,
        Date.now(),
        defaults.photos.paper,
      );
      // Any batch from the phone's picker uses up an "Add photos" wish, even one cancelled, empty or not opened: a later
      // pick must never join an earlier customer's job (review I1).
      const wish = picks.size > 0 || empty.some((i) => !!i.pick) ? takeAddInto(localStorage, Date.now()) : null;
      const shown = stackRef.current[stackRef.current.length - 1];
      // After a crash loop new files are still kept as jobs, but nothing opens by itself (PLAN §D5).
      if (!open) {
        if (shown?.name === 'receiving') goNow({ type: 'back' });
        return;
      }
      const last = jobs[jobs.length - 1];
      // Cancelled while receiving: what arrived waits in Recent jobs; nothing opens by itself (PLAN §D2).
      if (last && cancelled.has(last.id) && jobs.every((j) => cancelled.has(j.id))) {
        if (shown?.name === 'receiving') goNow({ type: 'back' });
        return;
      }
      // Add photos / Add files (owner, 2026-10-24): files chosen to add to the job on screen join it at once, without
      // the "New files arrived" question, up to 100 files a job; the shopkeeper stays where Add was pressed. Only files
      // from the picker: a share never joins a job by itself. A job gone meanwhile: the files open as their own job.
      const into = wish && jobs.length > 0 && jobs.every((j) => picks.has(j.id)) ? wish : null;
      const target = into
        ? normalizeJob((await PrintEngine.loadJob({ id: into }).catch(() => ({ job: null }))).job)
        : null;
      if (target) {
        const added: number[] = [];
        let dropped = 0;
        let failedAdd = false;
        let size = target.items.length;
        for (const j of jobs) {
          const r = await addToJob(PrintEngine, target.id, j.id, Date.now(), MAX_JOB_FILES - size).catch(() => {
            failedAdd = true;
            return null;
          });
          if (!r) continue;
          added.push(...r.added);
          dropped += r.dropped;
          size = r.job.items.length;
        }
        // What the screen says once: how many joined when not all fitted, or that adding failed (they wait in Recent).
        if (dropped > 0 || failedAdd)
          sessionStorage.setItem(
            'ps.addNotice',
            JSON.stringify({ jobId: target.id, added: added.length, dropped, failed: failedAdd }),
          );
        if (added.length) sessionStorage.setItem('ps.addChoose', JSON.stringify({ jobId: target.id, item: added[0] }));
        window.dispatchEvent(new CustomEvent('ps-job-changed', { detail: { jobId: target.id, added } }));
        // Receiving and "Where are the photos?" give way to the screen Add was pressed on.
        if (stackRef.current[stackRef.current.length - 1]?.name === 'receiving') goNow({ type: 'back' });
        if (stackRef.current[stackRef.current.length - 1]?.name === 'addsource') goNow({ type: 'back' });
        return;
      }
      // The receiving screen gives way to what arrived (never stays under it).
      const step: 'push' | 'replace' = shown?.name === 'receiving' ? 'replace' : 'push';
      const pick = last ? picks.get(last.id) : undefined;
      // The job the shopkeeper had open is the screen under Receiving, if Receiving is showing (gate review I1).
      const under = (s: typeof stackRef.current) => s[s.length - (s[s.length - 1]?.name === 'receiving' ? 2 : 1)];
      const before = under(stackRef.current);
      const openId = String(before?.params.jobId ?? '');
      // A share while another job is open: ask what to do with it (PLAN §I-17); nothing is lost either way. Shares
      // arriving while the question is open join it (review I4), so Add takes every batch the customer sent.
      // Only while that job still exists (retention or Delete all may have removed it under the screen).
      const openExists =
        !!openId &&
        openId !== last?.id &&
        // A job that cannot be read just now counts as there: asking is safer than opening over it (review M11).
        !!(await PrintEngine.loadJob({ id: openId }).catch(() => ({ job: true }))).job;
      // The screen on top now (the shopkeeper may have moved while the job was looked up), looking under Receiving.
      const onTop = stackRef.current[stackRef.current.length - 1];
      const top = under(stackRef.current);
      if (last && openExists) {
        const asked =
          top?.name === 'newfiles' && Array.isArray(top.params.newJobIds) ? (top.params.newJobIds as string[]) : [];
        const newJobIds = [...new Set([...asked, ...jobs.map((j) => j.id)])].filter((id) => id !== openId);
        // Over Result the open job was just printed: adding would print its files again (review I3).
        const printed = top?.name === 'result' || top?.params.printed === true;
        // Receiving gives way to the question; an open question is replaced by the bigger one.
        if (onTop?.name === 'receiving' && top?.name === 'newfiles') goNow({ type: 'back' });
        goNow({
          type: top?.name === 'newfiles' || onTop?.name === 'receiving' ? 'replace' : 'push',
          screen: { name: 'newfiles', params: { jobId: openId, newJobIds, printed } },
        });
      } else if (last)
        // Chosen on Home for passport photos (PLAN §J0): Received goes straight on to the passport photo.
        goNow({
          type: step,
          screen: {
            name: 'received',
            params: {
              jobId: last.id,
              ...(pick === 'passport' ? { passport: true } : {}),
              // Chosen on Home for ID cards (Phase 14): Received goes straight on to the cards.
              ...(pick === 'cards' ? { cards: true } : {}),
            },
          },
        });
      else if (empty.length)
        goNow({ type: step, screen: { name: 'problem', params: { lines: empty.flatMap(problemMessages) } } });
    });
    void (async () => {
      let safeStart = false;
      try {
        safeStart = (await PrintEngine.getStartInfo()).safeStart;
        if (safeStart) {
          goNow({ type: 'home' });
          goNow({ type: 'push', screen: { name: 'problem', params: { lines: [en.problem.safeStart] } } });
          void PrintEngine.ackSafeStart();
        } else {
          // A print that was in flight when the app was closed: say what happened to it first (PLAN §D4).
          const s = await PrintEngine.printStatus();
          // A test page goes back to its own screen: it is never shown as a customer job.
          if (s.state !== 'none' && s.state !== 'inDialog' && s.kind && s.kind !== 'job')
            goNow({ type: 'push', screen: { name: 'testpage', params: { kind: s.kind, state: s.state } } });
          else if (s.state !== 'none' && s.state !== 'inDialog' && s.jobId)
            goNow({
              type: 'push',
              screen: {
                name: 'result',
                params: {
                  jobId: s.jobId,
                  state: s.state,
                  ...((s.parts ?? 1) > 1 ? { part: s.part, parts: s.parts, partOf: s.partOf } : {}),
                },
              },
            });
        }
      } finally {
        // Even if a start-up check failed, shares must still be taken (gate re-review N7).
        await runner.start(!safeStart).catch(() => {});
      }
    })();
    // A share still copying after a second shows "Receiving files… k of n" with Cancel (PLAN §D2, §H2.7);
    // small quick shares never flash that screen.
    const progress = PrintEngine.addListener('intakeProgress', (p) => {
      const first = receivingNow()?.intakeId !== p.intakeId;
      setReceiving(p);
      if (!first || p.done >= p.total) return;
      setTimeout(() => {
        const top = stackRef.current[stackRef.current.length - 1];
        if (receivingNow()?.intakeId === p.intakeId && top?.name !== 'receiving' && top?.name !== 'problem')
          goNow({ type: 'push', screen: { name: 'receiving', params: {} } });
      }, 1000);
    });
    const ready = PrintEngine.addListener('intakeReady', async ({ intakeId, repeat }) => {
      receivingDone(intakeId);
      // The same files shared again within a minute: open the job they already made (PLAN §D2b).
      if (repeat) {
        const { job } = await PrintEngine.loadJob({ id: intakeId });
        const top = stackRef.current[stackRef.current.length - 1];
        const showing =
          top &&
          ((top.params.jobId === intakeId && JOB_SCREEN_NAMES.has(top.name)) ||
            (top.name === 'newfiles' && (top.params.newJobIds as string[] | undefined)?.includes(intakeId)));
        if (job && !showing) goNow({ type: 'push', screen: { name: 'received', params: { jobId: intakeId } } });
        return;
      }
      void runner.request().catch(() => {});
    });
    // Receiving failed outright (gate review #3): say so instead of nothing happening.
    const failed = PrintEngine.addListener('intakeFailed', ({ intakeId }) => {
      receivingDone(intakeId);
      const top = stackRef.current[stackRef.current.length - 1];
      goNow({
        type: top?.name === 'receiving' ? 'replace' : 'push',
        screen: { name: 'problem', params: { lines: [en.problem.receiveFailed] } },
      });
    });
    return () => {
      void ready.then((h) => h.remove());
      void progress.then((h) => h.remove());
      void failed.then((h) => h.remove());
    };
  }, []);

  // Remember where the shopkeeper is (screen names and job ids only), and keep every job on the stack safe from deletion.
  useEffect(() => {
    saveStack(localStorage, stack, Date.now());
    // Undo of a removed photo belongs to one visit of Photos / Photo tools: leaving them forgets it (re-review #4).
    if (!['photos', 'phototools'].includes(stack[stack.length - 1]?.name ?? '')) forgetRemoved();
    const jobIds = [
      ...new Set(
        stack
          .flatMap((sc) => [sc.params.jobId, ...(Array.isArray(sc.params.newJobIds) ? sc.params.newJobIds : [])])
          .map((id) => String(id ?? ''))
          .filter(Boolean),
      ),
    ];
    // Leaving a job forgets its PDF passwords here and its decrypted data natively (PLAN §G5, review I5).
    passwords.keepOnly(jobIds);
    void PrintEngine.setActiveJobs({ jobIds });
  }, [stack]);

  // A new screen starts at the top, and screen readers land on its title (focus-on-route-change).
  const top = stack[stack.length - 1] ?? { name: 'home', params: {} };
  // Before the first paint of the new screen: the page never shows a frame at the old scroll (Phase 13 motion).
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }, [stack.length, entryId(top)]);

  const Screen = SCREENS[top.name] ?? Problem;
  return (
    <>
      {/* Keyed by its stack entry: another entry is another screen, never the old one's state or late work
          (Phase 9 reviews); a screen replacing itself for the same job keeps its key (see go). */}
      {/* The host is keyed with the screen, so its entrance plays once per new screen (never on an update). */}
      <div key={entryId(top)} class={`screen-host enter-${enterDir.current}`}>
        <Screen go={goFrom(top)} params={top.params} />
      </div>
      {ask?.kind === 'leave' && (
        <ConfirmSheet
          title={en.leave.title}
          line={en.leave.line}
          onDismiss={() => setAsk(null)}
          choices={[
            { label: en.leave.keep, kind: 'primary', onChoose: () => setAsk(null) },
            { label: en.leave.leave, kind: 'secondary', onChoose: () => goNow(ask.action) },
            {
              label: en.leave.delete,
              kind: 'danger',
              onChoose: () => {
                // Home first: the job's screens close at once (their engine work stops; a second tap lands on Home,
                // never on PRINT), then the job is deleted (review M1).
                const { jobId } = ask;
                goNow({ type: 'home' });
                void PrintEngine.deleteJob({ id: jobId }).catch(() => {});
              },
            },
          ]}
        />
      )}
      {ask?.kind === 'exit' && (
        <ConfirmSheet
          title={en.exit.title}
          onDismiss={() => setAsk(null)}
          choices={[
            { label: en.exit.stay, kind: 'primary', onChoose: () => setAsk(null) },
            { label: en.exit.close, kind: 'secondary', onChoose: () => goNow({ type: 'back' }) },
          ]}
        />
      )}
      {/* Black & white previews: Rec.601 grey, the same weights the print file uses (PLAN §F4, gate review F4). */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <filter id="rec601" color-interpolation-filters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"
          />
        </filter>
      </svg>
    </>
  );
}
