# CLAUDE.md — rules for working in PrintSaathi

Read [docs/PLAN.md](docs/PLAN.md) (the approved spec) and [HARNESS.md](HARNESS.md) before changing anything.

## 1. Repository safety (non-negotiable)
- This repo's root is the checkout folder (`scripts/preflight.mjs` checks git resolves to it). On the maintainer's PC it is exactly `D:/Projects/PrintSaathi`, and an **unrelated** repository exists at `D:\.git` (worktree `E:/`): never run git from `D:\` or `D:\Projects`, never `git -C D:\`, never touch `D:\.git`.
- Run `npm run preflight` first in every session; every npm script also runs it automatically. If it fails, stop.
- Never use `--no-verify`, never skip or weaken tests or assertions to get a green result.

## 2. How work is done (closure discipline)
Every task and every phase: requirement → plan → implement → automated verification → real-device test (N/A only with a written reason) → evidence → adversarial challenge → fix findings → focused re-test → full regression → self-audit → explicit closure.
- Evidence goes in `docs/evidence/<phase>/<date>/`. No PASS without evidence.
- Every finding ends as **Fixed + verified**, **Proven intentional** (evidence), **Blocked** (evidence) or **Deferred** (only with the owner's explicit approval). Nothing silently disappears.
- Never claim "all scenarios tested". State the coverage method and list what could not be proven.
- Keep `docs/qa/traceability.md` current.

## 3. Dependencies
- Exact versions only (no `^`/`~`). `package-lock.json` is committed; use `npm ci`. Gradle uses dependency locking.
- Any new dependency or upgrade needs a short review note in `docs/decisions/` and a full regression.
- No servers, databases, accounts, analytics, crash SaaS, Google Play services or ML Kit.

## 4. Customer data
- Customer files are hostile input: parse them only inside the isolated engine process.
- Customer files live only under `noBackupFilesDir/jobs/`. Never write them to shared storage, never log file names, paths, contents or passwords, and never put real customer files in the repo or in evidence.
- Release builds have no `INTERNET` permission; backups and device transfer are disabled.

## 5. Product rules that are easy to break
- No image/page bytes over the JS↔native bridge (only the documented exception in PLAN §G5).
- Never lower print resolution, use thumbnails as print sources, re-encode lossy images repeatedly, or change physical page size to hit a performance target.
- User-facing text: plain English, no jargon (PLAN §H2.12); errors say what happened and what to do.
