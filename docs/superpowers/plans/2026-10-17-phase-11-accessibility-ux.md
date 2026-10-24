# Phase 11 — Accessibility & UX validation (automatable part) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove, with checks that run, the parts of PLAN §U "Accessibility" and "UX" that do not need a person:
- contrast;
- accessible names and reading order;
- screen-reader operation;
- tap counts;
- plain wording.

Then prepare the the shopkeeper / senior sessions so they can run in one visit.

**Spec:** docs/PLAN.md §H1–§H4, §T1 Phase 11, §U Accessibility and UX, §A success 2, §R level 11.

## Global Constraints
- **No new dependency.** axe and Playwright are already pinned.
- **Wording changes stay plain English** (§H2.12) and pass the jargon lint.
- **A wording change keeps the meaning,** and the tests that quote it change with it.
- **Real people's results are never invented.** The shopkeeper's sessions are prepared here and stay PENDING.

## Tasks

### Task 1: Contrast audit, AAA
- **vitest `tokens.test.ts`:** parse `src/styles/tokens.css` and compute WCAG contrast for every pair in the PLAN §H1 table. Each must meet the table:
  - text ≥ 7:1 on `--bg` and on `--surface`;
  - `--border` ≥ 3:1;
  - white on `--primary` / `--print` ≥ 7:1;
  - warning and error text on their own backgrounds ≥ 7:1.
- **No raw colours in components:** every colour in `ui.css` and in screen styles is a token, apart from white/black and the paper previews. The test lists any offenders.
- **e2e:** the screen matrix's axe run adds `color-contrast-enhanced` (WCAG AAA 7:1) at 100 % and 200 % text. Any failure is fixed in the tokens or styles, never by excluding the rule.

### Task 2: Tap counts as one table (§A2 rule, §U UX)
- **e2e `tap counts`:** count every tap from the first tap after Share up to and including PRINT (the print request reaching the mock):
  - J1 = 2;
  - J2 "Use more pages" = 2;
  - J3 = 2;
  - J4 = 3;
  - J5 = 1;
  - J0 from Home: Photos 4, Passport 4, Documents 3 (PLAN §J0; picker taps count as in the plan).
- **The count is enforced by the test,** never asserted by hand.

### Task 3: Screen-reader semantics on every screen
For every screen in the matrix:
- exactly one `h1`, which is the first focusable-or-heading item read;
- every button and link has a name;
- images either have alt text or are hidden;
- Tab order runs top to bottom (each focus lower or to the right of the last, within the action bar's own order);
- focus is always visible (outline width ≥ 2 px);
- panels: errors and warnings use `role="alert"`, progress and info use `role="status"`.

Fix whatever fails.

### Task 4: TalkBack on the API 35 emulator (§U "TalkBack completes J1 and J5")
- **Script `scripts/device/talkback.mjs`:**
  1. Turn TalkBack 15 on.
  2. Share photos (J1) or a PDF (J5) with the test sender.
  3. Walk each step the way a TalkBack user does: one tap focuses (TalkBack's focus box), a double tap activates. Each step's next screen is checked from the accessibility tree.
  4. Record screenshots with the focus box, and every focused node's spoken text (text / content description).
  5. Turn TalkBack off at the end, and on any failure.
- **Evidence:** `docs/evidence/phase-11/<date>/talkback/`.
- **Scope note:** emulator TalkBack. A sighted senior is the real user; a real TalkBack user is not in scope (stated in the coverage).

### Task 5: Plain wording check (§H2.12 reading age 8–9)
- **vitest `wording.test.ts`** over the whole `en` catalogue:
  - no sentence over 20 words;
  - no word over 4 syllables apart from an allow-list of shop words (e.g. "photographs" is not used, "PrintSaathi" is allowed);
  - every error panel text has a "what to do" sentence (a second sentence or a button).
- **Report:** the 20 longest strings go to evidence, for a human read. Fix what fails.

### Task 6: Session kit for the shopkeeper + 2 seniors (§T1 Phase 11 exit, §R11)
`docs/qa/shopkeeper-session.md`, a printable script:
- the 6 core tasks with the exact customer request to read out;
- the files to have on the phone (synthetic);
- what to note: alone yes/no, taps, hesitations, words not understood;
- the pass rule (≥ 5/6 alone, tap counts);
- an empty results table.

USER-CHECKLIST §Q points to it.

## Closure
- **Status:** TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION (the sessions with the shopkeeper and the seniors).
- **Regression:** PC suites + the emulator TalkBack run. There is no native change, so no instrumentation rerun unless a native file changes.
