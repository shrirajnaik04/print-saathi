// Bundle budget check (PLAN §C): startup JS <= 60 KB gzip, CSS <= 15 KB gzip.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BUDGETS = { js: 60 * 1024, css: 15 * 1024 };

export function evaluateBudgets(sizes, budgets) {
  const lines = [];
  let ok = true;
  for (const kind of Object.keys(budgets)) {
    const pass = sizes[kind] <= budgets[kind];
    ok &&= pass;
    lines.push(`${pass ? 'ok  ' : 'FAIL'} ${kind}: ${sizes[kind]} B gzip (budget ${budgets[kind]} B)`);
  }
  return { ok, lines };
}

// Startup = files referenced by dist/index.html (lazy chunks are excluded by design).
function startupSizes(distDir) {
  const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/?([^"]+\.(js|css))"/g)];
  const sizes = { js: 0, css: 0 };
  for (const [, rel, kind] of refs) sizes[kind] += gzipSync(readFileSync(path.join(distDir, rel))).length;
  return sizes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.resolve('dist');
  readdirSync(dist);
  const { ok, lines } = evaluateBudgets(startupSizes(dist), BUDGETS);
  for (const l of lines) console.log(l);
  process.exit(ok ? 0 : 1);
}
