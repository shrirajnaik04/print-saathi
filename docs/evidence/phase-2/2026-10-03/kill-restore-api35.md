# Phase 2: kill and restore (API 35 emulator, 2026-10-03, build 44459b7)

Procedure (PLAN §U Recovery): on the screen, press HOME → `adb shell am kill in.printsaathi.app` (process gone,
`pidof` empty) → open Recents → tap PrintSaathi's card. The task was started by a share (test sender, 6 photos),
so Recents replays that share intent each time.

| Screen when killed | Recents card | Reopened on | Jobs stored | Notes |
|---|---|---|---|---|
| Received | blank (Recents privacy, PLAN §D6) | Received, "6 files" | 1 | log: `share skipped: activity restore` |
| Ready | blank | Ready, "6 photos · 6 pages · A4 · Colour · 1 copy" (file made again) | 1 | — |
| Result (Save as PDF) | blank | Received (Result is never restored, by design: the print record was cleared when Result showed) | 1 | `state/` empty |

Zero duplicate imports across all three. **Not proven here:** "Don't keep activities"; API 24/28/30/36 (the
renderer-crash and retention device tests run on every level in the regression); a real WhatsApp share.
