# Phase 15 — closure report (auto-rotation)

**Spec:** `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md` Part 3.
**Plan:** `docs/superpowers/plans/2026-10-23-phase-15-auto-rotation.md`.
**Commits:** dfac4c2 (and the engine `faceTurns` call and job actions carried in 9aecbe2), plus the gate-review fix commit.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION** (faces on real photos, real document photos:
USER-CHECKLIST §T).

## What Phase 15 delivers
- A photo sent sideways or upside down is turned upright by itself, once per job, while the shopkeeper reads the choices;
  Received and Ready say "Turned N photos upright." with **Undo**.
- **Faces first:** Android's built-in face finder (offline) at the four turns, in the isolated engine; a photo whose
  faces show at exactly one turn gets that turn; upright or unclear faces mean no turn.
- **Otherwise text direction:** on the analysis bytes the black-edge check already makes (no second decode), the
  paper only: which way the text lines run (projection profiles) and where they start (the straight margin). It
  abstains when unsure.
- **Never:** a photo the shopkeeper turned by hand (that turn wins, also after), an ID card job, a passport photo already framed,
  PDFs, jobs of more than 30 photos.

## Acceptance (spec Part 3)

| Criterion | Result | Evidence |
|---|---|---|
| Precision ≥ 98 % of applied turns on a labelled generated set (≥ 400) | **1.000** (396 applied of 400, 4 abstained) | `phase-15/2026-10-23/text-direction-metrics.txt` |
| Abstains rather than guessing; abstain rate reported | 1 % on the set; centred pages abstain | same |
| No turn without enough signal (blank, abstract) | 0 of 240 | textTurn.test |
| No turn for upright photos | 30 / 30 left alone | textTurn.test |
| e2e: the note and Undo; the turn reaches the print file | PASS (3) | `tests/e2e/cards.spec.ts` |
| Real photos | PENDING (owner) | §T |

**Known limitation (measured):** whole pages set right-aligned read upside down (indistinguishable by margins
alone); Undo is on screen.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | textTurn.test 6, decide.test 5, job rules 4, e2e 5 |
| Device | CardEngineDeviceTest (faces at four turns, junk contained) on API 35; rotate-smoke API 35: a sideways typed page arrives upright |
| Adversarial | Phase 15 gate review (fresh reviewer) — results and fixes below |
| Final regression | phase-15/2026-10-23/regression |

## Gate review (fresh reviewer)
0 Critical. Turn direction verified consistent end to end. 4 Important, all fixed (tests seen failing first):
- **I1** a check finishing after the shopkeeper's choice was dropped (and could be applied later): the choice now waits for it
  beside the black-edge check and saves the turns before Ready; once per job from the first choice.
- **I2** the face check could not be stopped: a 6 s budget and a stop at the choice (timing on a 2 GB phone not measured).
- **I3** text alone could turn upright right-aligned text or chat screenshots upside down: text only applies quarter
  turns; screenshots never use text.
- **I4** blinds and fences could look like text: a line must have words (0 of 320 such photos turned).
- Minors: 4 fixed (Undo while printing, failed Undo said, no note for ID cards / framed passport, removed photos not
  counted), 3 deferred (ledger).

What the app applies on the generated set after these rules: left-aligned pages 198 / 400 turned, **0 wrong**
(upside-down pages are left for faces or the shopkeeper); right-aligned pages photographed sideways: 60 / 60 turned the wrong
quarter (known limitation; Undo).

## Final regression and release (Phases 13–15 together, `docs/evidence/phase-15/2026-10-23/regression/`, `release/`)
- **Device, debug build:** API 24 (2 GB) instrumentation 65 passed / 0 failed / 6 skipped (by design on that image),
  API 35 71 / 0 / 0, API 36 at 2.0× text 71 / 0 / 0; share matrix 15/15 on each; pdf.js render check PASS; privacy
  hits 0; no PrintSaathi crash in the crash buffers. (API 35/36 ran at c5559ac; the Phase 15 review fixes after it
  were re-checked by the card/face device test on API 24, the card and rotation smokes on API 35 and the release run.)
- **PC:** lint (0 errors), typecheck, vitest 354, script tests, build, size (JS 60.7 KB gzip of a 60 KB budget:
  under 1 KB to spare), Android lint + JVM, full e2e on the final code 1273 passed / 0 failed (earlier runs found 28
  failures, all fixed: see the ledger).
- **Release:** `apk/PrintSaathi-1.0.176-8bcaf35.apk` (1.5 MB, the pinned PrintSaathi key, no INTERNET, not
  debuggable, no backup): release-smoke on API 35 PASS; the card flow and auto-rotation on the release build PASS.

## Coverage statement
Proven: the text-direction rule on 400+ generated document photos (with a visible table, headings and dates), the
job rules, the flow on the PC, the whole pipeline on Android 15 with a generated sideways page. **Not proven:** faces on
real photos (none can be generated), real document photos (handwriting, forms, Hindi/Marathi text, colour pages),
right-aligned pages (known limitation), speed on a 2 GB phone with many photos.
