// Spike (a) share matrix: drives the debug-only sender app (a WhatsApp stand-in with its own provider)
// and reads PrintSaathi's pending intake. Usage: node scripts/device/share.mjs <serial> [mode ...]
import { writeFileSync } from 'node:fs';
import { adb, assertDebugBuild, runAsCat, sleep } from './adb.mjs';
import { shareVerdict } from './share-expect.mjs';

const PKG = 'in.printsaathi.app';
const serial = process.argv[2];
assertDebugBuild(serial);
const ALL = [
  'single-photo',
  'six-photos',
  'mixed',
  'pdf',
  'pdf-octet',
  'office',
  'own-authority',
  'own-authority-user',
  'file-uri',
  'lying-length',
  'unknown-length',
  'stall',
  'midstream-error',
  'zero-bytes',
  'endless',
];
const modes = process.argv.length > 3 ? process.argv.slice(3) : ALL;

const pending = () => {
  const t = runAsCat(serial, PKG, 'no_backup/inbox/pending.json');
  try {
    return t ? JSON.parse(t) : null; // run-as prints "No such file" to stdout when absent
  } catch {
    return null;
  }
};
const jobCount = () => {
  try {
    return adb(serial, ['shell', 'run-as', PKG, 'ls', 'no_backup/jobs']).split(/\s+/).filter(Boolean).length;
  } catch {
    return 0;
  }
};

// 60 s: the stall case needs the 20 s stall limit to pass, and the endless case copies up to 200 MB first.
export async function shareAndWait(mode, tag = 'a', timeoutMs = 60000) {
  const before = pending()?.intakeId;
  const jobsBefore = jobCount();
  adb(serial, [
    'shell',
    'am',
    'start',
    '-n',
    'in.printsaathi.sharesender/.SendActivity',
    '-e',
    'mode',
    mode,
    '-e',
    'tag',
    tag,
  ]);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(300);
    const p = pending();
    if (p && p.intakeId !== before) return { mode, ms: Date.now() - t0, newJobs: jobCount() - jobsBefore, intake: p };
  }
  return { mode, ms: null, newJobs: jobCount() - jobsBefore, intake: null };
}

if (process.argv[1]?.endsWith('share.mjs')) {
  const rows = [];
  for (const m of modes) {
    // A fresh tag per run gives fresh URIs, so the 60 s duplicate window cannot swallow a mode.
    const r = await shareAndWait(m, `${m}-${Date.now()}`);
    const files = r.intake?.files ?? [];
    rows.push({
      mode: m,
      receivedMs: r.ms,
      newJobDirs: r.newJobs,
      files: files.length,
      types: files.map((f) => f.sniffedType).join(','),
      distinct: new Set(files.map((f) => f.sha256)).size,
      rejected: r.intake?.rejected ?? null,
      refusedByPolicy: r.intake?.refusedByPolicy ?? null,
      problems: (r.intake?.problems ?? []).map((p) => p.reason).join(','),
      bytesCrossBridge: 'paths only',
    });
    rows.at(-1).verdict = shareVerdict(m, rows.at(-1));
    console.log(JSON.stringify(rows.at(-1)));
    await sleep(800);
  }
  if (process.env.EVIDENCE) writeFileSync(process.env.EVIDENCE, `${JSON.stringify(rows, null, 2)}\n`);
  process.exitCode = rows.every((r) => r.verdict === 'PASS') ? 0 : 1;
}
