// Preflight guard: every harness command runs this first.
// It refuses to run unless git resolves to THIS checkout (the folder holding scripts/), never a repository above it:
// on the maintainer's PC an unrelated repository lives at D:\.git (worktree E:/) and must never be touched.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The checkout this script belongs to (scripts/ sits in its root): the only repository the harness may use. */
export function repoRootOf(scriptUrl) {
  let p = decodeURIComponent(new URL(scriptUrl).pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // a Windows drive: /D:/... → D:/...
  return path.posix.dirname(path.posix.dirname(p));
}

// On the maintainer's PC this is D:/Projects/PrintSaathi; in any other clone, that clone.
export const DEFAULT_ROOT = repoRootOf(import.meta.url);
const MIN_NODE = [22, 12];

const normalise = (p) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function checkRepoRoot(actualTopLevel, expected) {
  const actual = normalise(actualTopLevel ?? '');
  if (actual !== '' && actual === normalise(expected)) {
    return { ok: true, message: `repo root OK: ${expected}` };
  }
  return {
    ok: false,
    message:
      `Refusing to run: git top level is "${(actualTopLevel || '').trim() || '(none)'}" but must be "${expected}". ` +
      'A repository above this checkout (like D:\\.git) must never be used. Run this from inside the PrintSaathi checkout.',
  };
}

// These variables make git ignore the working directory and use another repository (e.g. D:\.git).
const GIT_REDIRECT_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY'];

export function checkGitEnv(env) {
  const set = GIT_REDIRECT_VARS.filter((n) => env[n] !== undefined);
  return set.length === 0
    ? { ok: true, message: 'no git redirect variables set' }
    : { ok: false, message: `Refusing to run: ${set.join(', ')} set; unset them so git uses this repository only.` };
}

export function checkGitDir(absoluteGitDir, expectedRoot) {
  const ok = (absoluteGitDir ?? '').trim() !== '' && normalise(absoluteGitDir) === `${normalise(expectedRoot)}/.git`;
  return {
    ok,
    message: ok
      ? 'git dir OK'
      : `Refusing to run: git dir is "${(absoluteGitDir || '').trim() || '(none)'}", expected "${expectedRoot}/.git".`,
  };
}

/** `npm ls` exit status: non-zero means node_modules differs from package.json/lockfile (missing, extra, wrong). */
export function checkInstalled(npmLsStatus) {
  return npmLsStatus === 0
    ? { ok: true, message: 'installed packages match the lockfile' }
    : { ok: false, message: 'installed packages do not match package.json/lockfile; run npm ci' };
}

export function checkNodeVersion(version) {
  const [maj, min] = version.replace(/^v/, '').split('.').map(Number);
  const ok = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
  return { ok, message: ok ? `node ${version} OK` : `node ${version} is too old; need >= ${MIN_NODE.join('.')}` };
}

function main() {
  const expected = process.env.PS_REPO_ROOT || DEFAULT_ROOT;
  const git = (...args) => {
    try {
      return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return '';
    }
  };
  const envCheck = checkGitEnv(process.env);
  const top = envCheck.ok ? git('rev-parse', '--show-toplevel') : '';
  const checks = [
    envCheck,
    checkRepoRoot(top, expected),
    checkGitDir(envCheck.ok ? git('rev-parse', '--absolute-git-dir') : '', expected),
    checkNodeVersion(process.version),
  ];
  const root = top.trim();
  if (root && existsSync(path.join(root, 'package.json')) && !existsSync(path.join(root, 'package-lock.json'))) {
    checks.push({ ok: false, message: 'package-lock.json is missing; run npm install once, then use npm ci' });
  }
  // Only when launched through npm (npm_execpath points at npm's CLI script), so `node scripts/preflight.mjs` stays fast.
  const npmCli = process.env.npm_execpath;
  if (root && npmCli?.endsWith('.js')) {
    const r = spawnSync(process.execPath, [npmCli, 'ls', '--depth=0'], { cwd: root, stdio: 'ignore' });
    checks.push(checkInstalled(r.status));
  }
  for (const c of checks) (c.ok ? console.log : console.error)(`${c.ok ? 'ok  ' : 'FAIL'} ${c.message}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
