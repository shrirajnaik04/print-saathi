# ADR-001 — PDF writer: our MiniPdfWriter, not the platform PdfDocument

- **Status:** Accepted (Phase 0, 2026-10-02; owner, 2026-10-17, self-check in `owner-decisions-2026-10-17.md`).
- **Spike:** (g). Evidence:
  - `docs/evidence/phase-0/2026-10-02/task7-print-summary.md`
  - `task7-adr001-pdfjs.jsonl`
  - `docs/evidence/phase-0/2026-10-03/adr001-raw-evidence.txt` (colour spaces, `/N 3`, image reuse, timings from the committed run)

## Context

PLAN §G3 says: prefer the platform writer (`android.graphics.pdf.PdfDocument`) unless it misses a hard requirement. The three hard requirements are:

- exact physical page size;
- grey-only data for black-and-white jobs;
- spool size within budget (PLAN §P: colour photo page ≤ 3 MB, grey text page ≤ 1.5 MB).

## Measurement

Both writers took the same inputs on the API 35 emulator, in the instrumentation test `PdfWriterComparisonTest`:

- **6 photos on A4.** Six 1600×1200 photo-like JPEGs, quality 92, 2.98 MB in total.
- **10-page document.** A 10-page 300 dpi text-like grey document.

Every output was then parsed independently by pdf.js 6.3.289.

| Measure | Platform `PdfDocument` | `MiniPdfWriter` |
|---|---|---|
| 6 photos on A4: file size | **27,495,107 B** (lossless re-encode, 9.2× the input) | 2,986,778 B (JPEG passed through, +2 KB) |
| Same page × 2 copies | 27,495,627 B (images reused) | 2,987,401 B (images reused) |
| Write time, 6-photo page | 1,249 ms | 23 ms (committed run; an earlier uncommitted run gave 1,139 / 24) |
| A4 page size | `0 0 595 842` → 209.90 × 297.04 mm (integer points) | `595.2756 841.8898` → 210.00 × 297.00 mm |
| 10-page grey document | 10,960,457 B (1.10 MB/page) | 6,533,829 B (0.65 MB/page, no PNG predictors yet) |
| Colour space of the grey pages | `ICCBased` with **N 3** (RGB): grey-only not guaranteed | `DeviceGray`, 8-bit |
| Deterministic bytes | Yes | Yes |
| pdf.js parse | All pages, all images drawn | All pages, all images drawn |

## Decision

**Use `MiniPdfWriter`.** The platform writer fails two hard requirements:

1. **Spool size.** One A4 page of six WhatsApp photos is 27.5 MB, about 9× the 3 MB budget. On a 2 GB phone and a Wi-Fi printer this means slow spooling and possible service failures.
2. **Grey-only data.** Grey pages come out as 3-component ICC RGB, so PLAN §U's "every pixel R=G=B / DeviceGray" cannot be guaranteed from the file.

The integer-point page size is **not** a deciding factor. The error is 0.10 mm, well inside the ±0.5 mm passport tolerance.

## Consequences

- **We own about 140 lines of PDF code.** Mitigations:
  - JVM structure tests (7).
  - Independent pdf.js validation on every generated sample.
  - Android's own print pipeline parses it: Save as PDF accepted it, giving a 4×6 page of 288 × 432 pt with all 7 images drawn.
  - Phase 4 adds `qpdf --check` and PDFium (PdfRenderer) re-open checks plus fuzzed plans (PLAN §G3).
- **Grey document pages need PNG predictors** (PLAN §G2) to stay comfortably under 1.5 MB/page on real scans. 0.65 MB/page without predictors already meets the budget on synthetic text.
- **The writer only frames image streams the engine has already encoded.** It never parses customer content, so it can run in the app process.
- **Weakest evidence:** the comparison ran on one emulator (API 35) with synthetic images. Print-service acceptance on a real printer (the Brother via its plugin or Mopria) is still a user-checklist item.
