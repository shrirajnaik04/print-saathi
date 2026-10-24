// Phase 10 kill matrix (PLAN §U Recovery, §R level 12): on each screen, HOME → `am kill` (process gone) → reopen
// from the launcher → the same screen comes back (the stack is restored within 30 minutes), and nothing was imported
// twice. With `--dont-keep` the activity is also destroyed when HOME is pressed ("Don't keep activities").
// Synthetic files only (the test sender's photos and pushed fixtures). Test devices only: it clears the app's data.
// Usage: node scripts/device/kill-matrix.mjs <serial> <out.json> [--dont-keep] [--only=screen,screen]
import { writeFileSync } from 'node:fs';
import { adb, assertDebugBuild, assertTestDevice, sleep } from './adb.mjs';

const [serial, outFile, ...flags] = process.argv.slice(2);
const flag = flags.find((f) => f === '--dont-keep');
const only = flags
  .find((f) => f.startsWith('--only='))
  ?.slice(7)
  .split(',');
if (!serial || !outFile) throw new Error('usage: kill-matrix.mjs <serial> <out.json> [--dont-keep]');
assertTestDevice(serial);
assertDebugBuild(serial);
const PKG = 'in.printsaathi.app';
const SENDER = 'in.printsaathi.sharesender';
const sh = (...a) => adb(serial, ['shell', ...a]);
const xml = () => {
  try {
    sh('uiautomator', 'dump', '/sdcard/ps-ui.xml');
  } catch {
    // uiautomator is sometimes killed while busy; read the last dump
  }
  try {
    return sh('cat', '/sdcard/ps-ui.xml');
  } catch {
    return '';
  }
};
const texts = () => [...xml().matchAll(/text="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
/**
 * The screen's title: the text after Back in the top bar, or the first text on Home. Some WebViews also list the
 * page itself first, under the document title ("PrintSaathi"), so Back is looked for anywhere.
 */
const title = () => {
  const t = texts();
  const back = t.indexOf('Back');
  return back >= 0 ? (t[back + 1] ?? '') : (t[0] ?? '');
};
const screenH = Number(sh('wm', 'size').match(/(\d+)x(\d+)/)?.[2] ?? 2000);
/** Labels of the screen: visible text and accessibility names (photo and page buttons are named that way). */
const labels = () =>
  [...xml().matchAll(/(?:text|content-desc)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter(Boolean);
/** Taps the first element whose text or name starts with [prefix], scrolling it into view first. */
const tap = async (prefix) => {
  // Big text makes Home long: up to 10 swipes down, then up.
  for (let tries = 0; tries < 14; tries++) {
    const line = xml()
      .split('>')
      .find((l) => {
        const m = l.match(/(?:text|content-desc)="([^"]+)"/g) ?? [];
        return (
          m.some((a) =>
            a
              .replace(/^[^"]*"|"$/g, '')
              .replace(/&amp;/g, '&')
              .startsWith(prefix),
          ) && /bounds=/.test(l)
        );
      });
    const m = line?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!m) throw new Error(`no "${prefix}" on screen (title "${title()}")`);
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    // Off-screen WebView elements report empty bounds ([0,0][0,0]): scroll for those too.
    if (x2 > x1 && y2 > y1 && y2 <= screenH * 0.85 && y1 >= screenH * 0.08) {
      sh('input', 'tap', String((x1 + x2) >> 1), String((y1 + y2) >> 1));
      return;
    }
    // Empty bounds say only "off screen" (API 35 reports [0,0][0,0], API 36 the bottom edge): scroll down first,
    // then back up. A real box near the top (under the top bar) means up; otherwise down.
    const empty = x2 <= x1 || y2 <= y1;
    const up = empty ? tries >= 10 : y1 < screenH * 0.3;
    const [from, to] = up ? [0.35, 0.75] : [0.8, 0.3];
    sh('input', 'swipe', '640', String(Math.round(screenH * from)), '640', String(Math.round(screenH * to)), '300');
    await sleep(600);
  }
  throw new Error(`"${prefix}" never came into view`);
};
const waitFor = async (what, test, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (test()) return true;
    await sleep(400);
  }
  throw new Error(`${what}: not within ${ms} ms (title "${title()}")`);
};
const jobs = () => {
  try {
    return sh('run-as', PKG, 'ls', 'no_backup/jobs').split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
};
const push = (local, name) => {
  adb(serial, ['push', local, `/data/local/tmp/${name}`]);
  sh(`run-as ${SENDER} sh -c 'mkdir -p cache/out && cp /data/local/tmp/${name} cache/out/'`);
};

// Synthetic fixtures for the PDF and locked-PDF screens.
push('tests/fixtures/pdf/docs/three.pdf', 'three.pdf');
push('tests/fixtures/pdf/user-aes256.pdf', 'user-aes256.pdf');

/** How to reach each screen from a fresh share (or from Home), and its title. */
const SCREENS = [
  { name: 'received', share: ['six-photos'], taps: [], title: 'Files received' },
  { name: 'ready', share: ['six-photos'], taps: ['One on each page'], title: 'Ready to print' },
  { name: 'change', share: ['six-photos'], taps: ['One on each page', 'Change'], title: 'Change' },
  { name: 'layout', share: ['six-photos'], taps: ['One on each page', 'Change', 'Layout'], title: 'Layout' },
  { name: 'pages', share: ['six-photos'], taps: ['Use more pages', 'Change', 'Pages'], title: 'Pages' },
  { name: 'colour', share: ['six-photos'], taps: ['One on each page', 'Change', 'Colour'], title: 'Colour' },
  {
    name: 'printstyle',
    share: ['six-photos'],
    taps: ['One on each page', 'Change', 'Print style'],
    title: 'Print style',
  },
  { name: 'copies', share: ['six-photos'], taps: ['One on each page', 'Change', 'Copies'], title: 'Copies' },
  { name: 'photos', share: ['six-photos'], taps: ['One on each page', 'Change', 'Photos'], title: 'Photos' },
  {
    name: 'phototools',
    share: ['six-photos'],
    taps: ['One on each page', 'Change', 'Photos', 'Photo 1'],
    title: 'Photo 1',
  },
  {
    name: 'crop',
    share: ['six-photos'],
    taps: ['One on each page', 'Change', 'Photos', 'Photo 1', 'Crop'],
    title: 'Crop photo 1',
  },
  { name: 'whichphoto', share: ['six-photos'], taps: ['Passport photos'], title: 'Which photo?' },
  { name: 'passportframe', share: ['single-photo'], taps: ['Passport photos'], title: 'Fit the face in the frame' },
  { name: 'document', share: ['pushed', 'three.pdf'], taps: [], title: 'Ready to print' },
  { name: 'docpages', share: ['pushed', 'three.pdf'], taps: ['Change', 'Pages to print'], title: 'Pages to print' },
  { name: 'docorder', share: ['pushed', 'three.pdf'], taps: ['Change', 'Page order'], title: 'Page order' },
  { name: 'doctools', share: ['pushed', 'three.pdf'], taps: ['Change', 'Page order', 'Page 2'], title: 'Page 2' },
  { name: 'unlock', share: ['pushed', 'user-aes256.pdf'], taps: ['Unlock'], title: 'Unlock PDF' },
  { name: 'settings', share: null, taps: ['Settings'], title: 'Settings' },
  { name: 'help', share: null, taps: ['Help'], title: 'Help' },
];

const dontKeep = flag === '--dont-keep';
sh('settings', 'put', 'global', 'always_finish_activities', dontKeep ? '1' : '0');
const results = [];
try {
  for (const s of SCREENS.filter((x) => !only || only.includes(x.name))) {
    const row = { screen: s.name, expected: s.title };
    try {
      sh('pm', 'clear', PKG);
      sh('am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
      await waitFor('Home', () => texts().includes('PrintSaathi'));
      if (s.share) {
        const [mode, name] = s.share;
        const extras = ['--es', 'mode', mode, '--es', 'tag', `k${Date.now()}`];
        if (name) extras.push('--es', 'name', name);
        sh('am', 'start', '-n', `${SENDER}/.SendActivity`, ...extras);
        await waitFor('the share', () => ['Files received', 'Ready to print'].includes(title()));
      }
      for (const t of s.taps) {
        await waitFor(`"${t}"`, () => labels().some((x) => x.startsWith(t)));
        await tap(t);
        await sleep(800);
      }
      await waitFor(`the ${s.name} screen`, () => title() === s.title);
      const before = jobs();
      sh('input', 'keyevent', 'KEYCODE_HOME');
      await sleep(1200);
      // `am kill` only kills a process Android already treats as in the background: try a few times.
      let pid = 'unknown';
      for (let tries = 0; tries < 5 && pid !== ''; tries++) {
        sh('am', 'kill', PKG);
        await sleep(800);
        try {
          pid = sh('pidof', PKG).trim();
        } catch {
          pid = ''; // pidof fails when there is no such process: killed
        }
      }
      row.killed = pid === '' || 'still running';
      sh('am', 'start', '-n', `${PKG}/.MainActivity`);
      // The screen settles first (WebView start, restore): judged once it shows the expected title, or after 20 s.
      await waitFor('reopened', () => title() !== '', 20_000);
      const t0 = Date.now();
      while (title() !== s.title && Date.now() - t0 < 10_000) await sleep(500);
      row.reopenedOn = title();
      row.jobsBefore = before;
      row.jobsAfter = jobs();
      row.verdict = row.killed === true && row.reopenedOn === s.title && row.jobsAfter === before ? 'PASS' : 'FAIL';
    } catch (e) {
      row.verdict = 'ERROR';
      row.error = String(e.message ?? e);
    }
    results.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  sh('settings', 'put', 'global', 'always_finish_activities', '0');
}
writeFileSync(outFile, `${JSON.stringify({ serial, dontKeep, results }, null, 2)}\n`);
