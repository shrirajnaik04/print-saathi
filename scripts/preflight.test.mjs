import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGitDir, checkGitEnv, checkInstalled, checkRepoRoot, repoRootOf } from './preflight.mjs';

test('preflight accepts the expected top level', () => {
  assert.equal(checkRepoRoot('D:/Projects/PrintSaathi', 'D:/Projects/PrintSaathi').ok, true);
  assert.equal(checkRepoRoot(String.raw`d:\projects\printsaathi`, 'D:/Projects/PrintSaathi').ok, true);
});

test('preflight rejects a different top level', () => {
  const r = checkRepoRoot('E:/', 'D:/Projects/PrintSaathi');
  assert.equal(r.ok, false);
  assert.match(r.message, /D:\\.git/);
});

test('preflight rejects a parent directory', () => {
  assert.equal(checkRepoRoot('D:/Projects', 'D:/Projects/PrintSaathi').ok, false);
});

test('preflight rejects an empty top level (git not resolving)', () => {
  assert.equal(checkRepoRoot('', 'D:/Projects/PrintSaathi').ok, false);
});

test('preflight refuses git environment overrides that can redirect git to another repository', () => {
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) {
    const r = checkGitEnv({ [name]: 'D:/.git' });
    assert.equal(r.ok, false, name);
    assert.match(r.message, new RegExp(name));
  }
  assert.equal(checkGitEnv({ PATH: 'x', GIT_AUTHOR_NAME: 'a' }).ok, true);
});

test('preflight requires the git directory to be the repo root .git', () => {
  assert.equal(checkGitDir('D:/Projects/PrintSaathi/.git', 'D:/Projects/PrintSaathi').ok, true);
  assert.equal(checkGitDir('D:/.git', 'D:/Projects/PrintSaathi').ok, false);
  assert.equal(checkGitDir('', 'D:/Projects/PrintSaathi').ok, false);
});

test('preflight fails when installed packages do not match the lockfile', () => {
  assert.equal(checkInstalled(0).ok, true);
  const r = checkInstalled(1);
  assert.equal(r.ok, false);
  assert.match(r.message, /npm ci/);
});

test('the expected root is the checkout this script lives in (any folder), never a repository above it', () => {
  assert.equal(repoRootOf('file:///D:/Projects/PrintSaathi/scripts/preflight.mjs'), 'D:/Projects/PrintSaathi');
  assert.equal(repoRootOf('file:///home/ana/code/print-saathi/scripts/preflight.mjs'), '/home/ana/code/print-saathi');
  // On this machine the guard still refuses the unrelated repository at D:\.git.
  assert.equal(checkRepoRoot('D:/', repoRootOf('file:///D:/Projects/PrintSaathi/scripts/preflight.mjs')).ok, false);
});
