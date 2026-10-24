# Owner decisions — 2026-10-17

Recorded from the owner's message of 2026-10-17. They apply from Phase 7 on.

| Topic | Decision | Effect |
|---|---|---|
| Photo pages over 3 MB (Phase 4 N1, USER-CHECKLIST §H4) | **Keep full print quality.** 3 MB per colour photo page is a normal-case target, not a limit that overrides quality | The 3.25 MB very busy synthetic page is an **evidenced exception**. JPEG quality, dpi and dimensions are never lowered to meet the target. Encoding may be optimised only with no measurable or visible quality loss. Real camera photos (§H4) are still to be measured |
| ADR-001 (PDF writer) | Proceed | Self-check below |
| ADR-002 (locked PDFs) | Proceed | Self-check below |
| ADR-003 (HEIC) | Proceed only if it doesn't weaken security, privacy or licensing | Option C (ask for a photo) stays. A and B need owner approval (see below) |
| Customer-file retention | **1 day** default, configurable | No change |
| Language | English is the V1 string source | The shopkeeper's comprehension check is still pending. Marathi or Hindi would come in through the string catalogue |

## ADR self-checks (security/privacy, offline/₹0, print and image quality, locked-PDF guarantees, APK/runtime cost, maintenance, licensing, hardware)

- **ADR-001 — MiniPdfWriter: consistent with R2. No hard stop.**
  - Own code, no new dependency.
  - Exact page size and grey-only data (the R2 guarantees).
  - Images written once and reused, so spool size stays small.
  - In production since Phase 2.
- **ADR-002 — built-in engine first; `@cantoo/pdf-lib` fallback for phones without native unlock: consistent with R2 §G5. No hard stop.**
  - The bridge exception is the one R2 already approved (≤ 20 MB, 256 KB chunks, NONE-tier phones only).
  - The library is MIT, lazy-loaded (~222 KB gzip, Unlock screen only), offline, free.
  - The password stays in memory.
  - Built in Phase 7, because the shopkeeper's phone tier is still unknown (ADR-002 build rule).
  - Option (ii), a bundled PDFium, is not used (no APK or licence change).
- **ADR-003 — HEIC: option C is the only choice that changes nothing.**
  - **Option A** (a non-isolated `:heif` process) would let an exploited HEIF parser read or alter job files: it weakens the isolation guarantee. That is a **hard stop**; the owner must approve it.
  - **Option B** (a bundled libheif/libde265) adds 2–4 MB APK, the LGPL licence and native update duty: a **hard stop**.
  - **So option C stays:** "This is an iPhone photo saved as a file. Ask the customer to send it as a photo." No R2 guarantee is weakened.
  - **Open for the owner:** A or B, only if iPhone documents turn out to matter in the shop.
