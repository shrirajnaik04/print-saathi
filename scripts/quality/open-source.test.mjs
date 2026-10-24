// The project is open source (owner, 2026-10-23): no family member, no surname or shop name of the owner, and no
// other private project may be named in any tracked file. The words are built from parts so this file passes too.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Case as written in prose (random bytes in crash logs, like "DaD", are not words).
const words = [
  ['D', 'ad'],
  ['d', 'ad'],
  ['D', 'ads'],
  ['F', 'ather'],
  ['f', 'ather'],
  ['P', 'apa'],
  ['p', 'apa'],
  ['N', 'aik'],
  ['Shri', 'raj'],
  ['Majestic', '-Escape'],
].map((p) => p.join(''));
const son = ['s', 'on'].join('');
const family = new RegExp(
  `\\b(${words.join('|')})\\b|\\b([Yy]our|[Tt]he|[Hh]is|[Hh]er|[Mm]y|[Oo]ur) ${son}\\b|\\w['’]s ${son}\\b`,
);
const TEXT = /\.(ts|tsx|mjs|js|json|md|txt|kt|kts|xml|html|css|svg|py|sh|yml|yaml|gradle|properties|tsv|csv)$/i;

test('no family word, surname or private project name in any tracked text file', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => TEXT.test(f) && f !== 'package-lock.json');
  const hits = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue; // listed but removed in the working copy
    }
    text.split('\n').forEach((line, i) => {
      if (family.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits.slice(0, 40), [], `${hits.length} lines`);
});
