# Phase 41: closure report (photos 1 cm apart)

**Spec:** `docs/superpowers/specs/2026-10-26-round-8-photo-gap-text-scan-design.md`, part 41.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, row 52 ("About 1 cm all round").
**Rulings and open findings:** `docs/qa/phase-41-43-rulings.md`.
**Evidence:** `docs/evidence/phase-41-43/2026-10-27/` (SUMMARY.md lists every run).
**Commit:** 21db145.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's printer: USER-CHECKLIST §AE1.

## What Phase 41 delivers
- **Photos 10 mm apart (row 52).** All on one page, More pages and One on each page lay photos out with a 10 mm gap (it was 3 mm), as in the owner's hand-spaced sample.
- **Unchanged:** passport photos (2 mm cut gap; their own preset) and ID cards (their own gaps). Photos placed by hand keep their places.
- **Where a page holds fewer photos now:** three 6 cm photos no longer fit side by side on A4 (two do); this follows from the owner's choice.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Every two photos on a page at least 10 mm apart in every photo layout (property test) | PASS | gap.test (RED at 3 mm, GREEN at 10 mm) |
| Passport and ID cards unchanged | PASS | gap.test passport guard; idcard tests unchanged |
| The shared plan fixtures follow (Android reads the same files) | PASS | plan-v1-photo4x6 / plan-v1-turned regenerated; JVM contract tests pass |
| Device: six photos on one page, smallest gap 10.00 mm, read from the print file | PASS | round8-smoke API 35 `photosAtLeast10mmApart` |
| The owner's printer, by the ruler | PENDING (owner) | USER-CHECKLIST §AE1 |

## Coverage statement
**Proven:** the gap in every photo layout by property tests; on an API 35 emulator from the print file.
**Not proven:** the gap on paper from the owner's printer.
