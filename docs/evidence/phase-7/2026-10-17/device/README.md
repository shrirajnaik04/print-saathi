# Phase 7 device runs — API 35 (Medium_Tablet emulator, my own instance on port 5580) — 2026-10-17

Synthetic fixtures only (tests/fixtures/pdf). The test sender app's new debug-only `pushed` mode shares a pushed file
the way WhatsApp does.

| Check | Result |
|---|---|
| Share three.pdf → Ready | "1 PDF · 3 pages · A4 · Black & white · 1 copy"; the preview is the real print file, in grey (`api35-ready-shared-pdf-bw.png`) |
| B&W print file read back (pdf.js) | 3 pages, 595.2756 × 841.8898 pt; each page one image in a 6 mm-edge box; every image `/DeviceGray` `/FlateDecode` (lossless) |
| Change → Colour (all pages, 1 copy) | The print file's SHA-256 equals the received file's and the fixture's: 6a42ade6…823759 (untouched path, byte for byte) |
| PRINT → Android print screen | Save as PDF, ISO A4, 3 pages (`api35-print-dialog-colour-untouched.png`) |
| Save as PDF | Our result screen: "This was saved as a file, not printed…" (`api35-result-saved-as-file.png`). Android rewrote the saved file (2,505 bytes, page box rounded to 595 × 841 pt). This is Android's own behaviour, proven intentional in Phase 2 and Phase 5; our print file is byte-identical |
| Share user-aes256.pdf (locked) | "This PDF is locked. Type its password to open it." + Unlock |
| Helper: "rama" + 1966 | Shown as RAMA; "That password didn't work. Check the letters and the year…" |
| Helper: RAMA + 1965 | Ready: "1 PDF · 1 page · A4 · Black & white · 1 copy" (`api35-locked-unlocked-ready.png`) |
| Password leak check | `RAMA1965`: 0 hits in 2,942 logcat lines; 0 files in the app's data folder (`run-as … grep -r`) |
| Re-review I5/I6 on device, before the fix | After HOME → back, the sweep deleted `work/`, marker included (reproduced) |
| …after the fix | Unlocked: `decrypted` marker, `out/<hash>`, `work/page-thumbs`. HOME → back: all kept. Home in the app: `out/` and `work/` emptied, marker gone; `src/` and `thumbs/` kept |
| Full instrumentation, API 35 | 50 passed, 0 failed, 0 skipped (after each fix round) |

Found on device and fixed: an empty year in the helper said "That password didn't work"; it now asks for the year
(e2e "the e-Aadhaar helper asks for a missing year…").

**Observation, not a Phase 7 change.** On this 2560 × 1600 landscape tablet the PRINT bar sits after the preview, so
The shopkeeper has to scroll to reach it. This is ActionBar's rule from Phase 1: the bar is pinned only while it takes ≤ 25 % of
the screen. It was already visible in the Phase 4 API 35 screenshots, and the shopkeeper's phone is used upright.

## Performance and resources (API 35, same emulator)

| Measure | Result | PLAN §P |
|---|---|---|
| 20 repeated jobs, three.pdf, share → Ready summary | ≈2.2 s each, steady (UI polled; coarse) (`repeat-20-three-api35.json`, `scripts/device/pdf-repeat.mjs`) | — |
| App memory (PSS) after job 1 → after job 20 | 144,478 KB → 133,689 KB (no growth) | ≤ idle + 10 % ✓ |
| Engine process after each job | Not running when sampled: it lets go after each render | — |
| Job folders after 20 jobs | 1.4 → 1.8 MB (≈20 KB per kept job: customer file + thumbnails), until the 1-day retention | — |
| 120-page B&W PDF: file received → part 1 print file (40 pages) | 9.4 s (file timestamps); first real-page preview +0.3 s; all 40 previews +2.2 s | 10-page B&W ≤ 8 s (mid): ≈2.4 s per 10 pages ✓ |
| Part 1 print file size | 562,539 bytes for 40 pages (≈14 KB a page, lossless grey) | grey text ≤ 1.5 MB/page ✓ |

Re-sharing the same file within 60 s opened the existing job instead of a new one (PLAN §D2b), as designed.
Coverage limits: an emulator, not a real mid-range phone (the shopkeeper's phone: PENDING REAL-WORLD VALIDATION); no API 24
low-end run of these flows (the old WebView there shows the update screen; the engine side is covered by instrumentation).
