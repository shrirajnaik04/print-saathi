# 10 black & white PDF pages on API 35 (Medium_Tablet emulator, swiftshader) — 2026-10-17

The first measurement (13,396 ms) was a cold first run straight after install. It did not repeat.

| Run | 10 B&W pages (pages-120.pdf, A4 at 300 dpi, lossless grey) | Print file |
|---|---|---|
| First run after install (earlier) | 13,396 ms | 140,787 bytes |
| Warm, before the change (×3) | 3,448 / 3,437 / 3,399 ms | 140,787 bytes |
| Warm, after the one-pass grey change (×2) | 2,632 / 2,642 ms | 140,787 bytes |

**Where the time went** (a throwaway probe, not committed, 10 pages):
- Drawing the PDF page: 12–15 ms in total.
- Per-row grey conversion with write-back into the bitmap: ≈1.75 s.
- Reading the rows again for the raw bytes: ≈1.0 s.
- Lossless Flate in the app: ≈0.4 s.
- Engine call per page: 290–480 ms before the change, 190–300 ms after.

**Change.** In raw-grey mode the engine now turns each row grey and writes its bytes in the same pass, without writing it back into the bitmap.
- The pixels and the maths are the same (Rec.601), so the output is identical: same file sizes, and the text-page check is still 414,623 bytes.
- Print resolution and quality are unchanged.
- Grey-JPEG mode keeps the write-back, because the JPEG encoder reads the bitmap.

**Tests after the change on API 35:** DocumentRenderDeviceTest OK (5 tests), CustomerPdfDeviceTest OK (6 tests).

**Target:** PLAN §P sets 10-page B&W PDF → Ready at ≤ 8 s (mid) and ≤ 15 s (low-end). This measures the print-file render only; the full Ready timing on a real phone is PENDING REAL-WORLD VALIDATION.
