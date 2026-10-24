# Spike (a) — share intake on emulator (API 35, Medium_Tablet) — 2026-10-02

Sender: debug-only `in.printsaathi.sharesender` (separate package, own FileProvider, SEND/SEND_MULTIPLE + ClipData + read grants — same shape as WhatsApp). Driver: `scripts/device/share.mjs`.

| Scenario | Result | Evidence |
|---|---|---|
| One photo (cold start) | 1 jpeg, received in 2.3 s incl. app launch | task5-share-matrix-api35.json |
| Six photos (warm) | 6 jpeg, 0.75 s | same |
| Photo + PDF mixed (`*/*`) | jpeg + pdf | same |
| PDF as `application/pdf` | pdf | same |
| PDF as `application/octet-stream` (distinct file) | sniffed as pdf, 0.34 s | console run (t5-extra) |
| Word file | received, sniffed `office` (shown as "can't be printed yet") | same json |
| Hostile: our own authority URI | refused (0 files, 1 refused), nothing copied | same json |
| Hostile: `file://` URI | refused | same json |
| Same share delivered twice within 1 s | exactly 1 new job | console run |
| Identical content re-shared after 62 s | new job (intentional reprint allowed) | console run |
| Rotate after receipt | no new job, same process | console run |
| HOME → `am kill` → reopen from Recents | process restarted, `share skipped: activity restore`, still 10 jobs | task5-logcat-api35.txt, task5-recents.png, task5-after-restore.png |
| Share-sheet matching | `*/*`, `image/*`, `application/pdf` list PrintSaathi; `video/mp4`, `text/plain`, `multipart/mixed` do not | task5-share-sheet-matching.txt |
| Bytes over the bridge | paths only (`getPendingIntake` JSON); images loaded via `convertFileSrc` | code + logcat |

Adversarial findings
- **Fixed + verified:** Capacitor's own debug logging printed plugin results (intake JSON) and every local file request path to logcat. Set `loggingBehavior: 'none'`; full-logcat rescan after a six-photo share: 0 job paths, 0 `_capacitor_file_`, 0 intake JSON. Customer file names never appeared (files are stored as `0001.jpg`…).
- **Test artefact (recorded so it is not repeated):** `adb shell cmd package query-activities -t */*` unquoted is glob-expanded by the device shell and reports no handlers; quote it for the remote shell.
- **Known, planned (Phase 1):** the Android Recents thumbnail shows customer photos (task5-recents.png) — `setRecentsScreenshotEnabled(false)` / `FLAG_SECURE` per PLAN §D6.

What this spike does NOT prove (Phase 2 / user)
- Real WhatsApp on a real phone (USER-CHECKLIST §A).
- Byte caps, stall timeout, unknown-length handling, resumable journal, process death *during* a copy — Phase 2 hardened intake.
- Engine-made thumbnails (spike shows originals; large photos are subject to WebView decode limits).
