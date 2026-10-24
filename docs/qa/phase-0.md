# Phase 0 — closure report (foundation and go/no-go spikes)

**Phase:** 0 of the approved R2 plan (`docs/PLAN.md` §T1). **Branch:** `phase-0/foundation-spikes`. **Closed:** 2026-10-03.

## Verdict: GO for Phase 1, with three owner decisions pending

- **No spike disproved the R2 architecture.**
- **One bounded R2 amendment is proposed:** HEIC (ADR-003).
- **Two requirements were added to later phases:**
  - Phase 2: refuse very large progressive JPEGs before decoding;
  - Phase 5: treat a print job left in the `created` state as "nothing printed".
- **Not yet started (needs your devices):** everything that requires a real phone, the Brother printer or the shopkeeper (`docs/spikes/USER-CHECKLIST.md` §A–F). This blocks **Milestone A (real printing)**, not Phase 1.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | `docs/PLAN.md`; `docs/superpowers/plans/2026-10-02-phase-0-foundation-and-spikes.md` (Tasks 1–11) |
| Implementation | Commits `359b188` … HEAD on `phase-0/foundation-spikes` |
| Automated verification | `docs/evidence/phase-0/2026-10-03/full-regression-harness.txt` (all green) |
| Real-device test | Emulators on 5 Android levels: `final-regression/`. Real phones and printer: **not run** (user checklist) |
| Evidence | `docs/evidence/phase-0/2026-10-02/`, `…/2026-10-03/` |
| Adversarial challenge | 3 independent reviewer gates, plus self-challenge on each spike (`docs/spikes.md`, "weakest point") |
| Fix findings → focused re-test → regression | `gate-findings-closure.md`: every finding is Fixed + verified / Proven intentional / Scheduled (one, inside the plan) |
| Self-audit | This report: the coverage statement and the "not proven" list below |

## Spike results

The full matrix is in `docs/spikes.md`.

| Spike | Result |
|---|---|
| (a) Share intake | PASS (emulator, 5 levels; 9/9 modes including hostile) |
| (b) Print path | Guard PASS on the API 35 and 36 dialogs; Brother checks BLOCKED (user) |
| (c) Release without network | PASS (API 36) |
| (d) Locked PDFs | PASS (emulator). Unlock on 35/36; fallback proven on 24/28/30 |
| (e) 108 MP decode | PASS; quality 50.8–54.3 dB at 2048 px, 86–89 dB or identical at 3508 px. Limitation: progressive 108 MP |
| (f) Isolated engine | PASS except HEIC (needs ADR-003) |
| (g) PDF writer | PASS → custom writer (ADR-001) |
| (h) Language check | BLOCKED (user); mock-ups ready |
| (i) the shopkeeper's phone facts | BLOCKED (user); screen and installer ready |

## Findings

- **Gate 1:** 5 Important + minors.
- **Gate 2:** 5 Important + 9 Minor.
- **Gate 3:** 6 Important + 6 Minor.
- **Self-found defects (examples):**
  - Android 9 ImageDecoder crash (SIGFPE);
  - an odd-size scale error (35 → 52 dB);
  - transparency printed black at 1:1;
  - Devanagari digits in file names;
  - a broken jargon-lint regex;
  - three slipped commits, which led to the pre-commit hook.

All closed (`docs/evidence/phase-0/2026-10-03/gate-findings-closure.md`, ledger). **Only one item is not closed as fixed:** Gate 2 #7 (single-slot pending intake), scheduled as the planned Phase 2 intake journal. It is spike-only code, and the work is already in the plan.

## Coverage statement

**Proven:** on emulators at API 24 (2 GB), 28 (2 GB), 30, 35 and 36, by automated instrumentation plus scripted device runs. The final regression had 0 failures. Skips are honest:
- HEIF fixtures can't be made without an HEVC encoder (API 24/28/30).
- The wrong-password test doesn't apply on tier NONE.

**Not proven (explicitly):**
- Any **real phone**, including the shopkeeper's (Android version, RAM, WebView, print service).
- **Real WhatsApp and Dual-WhatsApp** shares, and what the system logs for real WhatsApp URIs.
- The **Brother printer:** preselected paper, margins, **ruler sizes** (PHOTO vs DOCUMENT, 1 vs 2 sheets), monochrome, and the panel's paper-mismatch behaviour.
- A **real e-Aadhaar**, and the PRE_V unlock tier (API 30–34 with S-extension ≥ 13).
- **The shopkeeper's language comfort.**
- **HEIC** on API 28/30 (no encoder for fixtures).
- **Performance on real hardware:** all times above are emulator times.
- **Truncated-file detection** (Phase 2 rule).

## Plan amendments required before or during later phases

1. **ADR-003 (owner choice):** HEIC decoding cannot run in `isolatedProcess`.
   - Option **A** (recommended) applies R2's own fallback ("a normal separate process") to HEIF only.
   - Until you decide, release builds use **C** (ask the customer to resend as a photo).
2. **Phase 2 (§F2 budgets):** check the progressive flag × megapixels before decoding, and refuse above the phone's budget. Measured: 108 MP progressive needs 427–484 MB and 14–23 s.
3. **Phase 5 (§D4 result screen):** a cancelled dialog leaves the job in `created`, which must read as "nothing printed". On Android 16 the dialog starts with **"Select a printer"**, so the setup test page must pick the printer once.
4. **Engine rule kept:** ImageDecoder only on API 29+ (Android 9 crash).

## Owner decisions requested

| Decision | Recommendation |
|---|---|
| ADR-001 custom PDF writer | Approve |
| ADR-002 locked PDFs | Approve; build the fallback only if the shopkeeper's phone says "No" in §C |
| ADR-003 HEIC | A |
| Language (§E) | After the shopkeeper sees the mock-ups |

## Under the overnight instruction

You asked me to continue without stopping. **Phase 1 (design system and shell) has started** on the same branch (`docs/superpowers/plans/2026-10-03-phase-1-design-system-and-shell.md`). None of the pending decisions above affect it.
