# ADR-006 — Parts are cut by sheet count only (40), not also by file size (150 MB)

**Status:** accepted for Phase 5 (2026-10-16); to be re-checked in Phase 7 (documents).
**Context:** PLAN §D4 says big jobs print in parts of "≤ 40 pages or ≤ 150 MB". Phase 5 implements the 40-sheet
limit (`src/core/plan/parts.ts`). The gate review (m4) asked whether the 150 MB limit can be reached.

**Measured** (PlanRenderDeviceTest on API 24/28/30/35/36, `docs/evidence/phase-4/2026-10-16/regression-final-a89fc3e/`):

| Page | Bytes per page image |
|---|---|
| Full A4 page, realistic 12 MP synthetic photo, colour | 0.98 MB |
| Same photo, black & white | 0.91 MB |
| Very busy synthetic texture (worse than any camera photo we expect) | 3.25 MB |

A part holds at most 40 sheets, and a repeated page (copies) is stored once. So the worst photo part is
40 different busy pages: 40 × 3.25 MB = **130 MB**, under 150 MB. A part can only pass 150 MB if a single page image
passes 3.75 MB, which is above the per-page budget (PLAN §P: colour photo ≤ 3 MB). That budget is itself an open
item (USER-CHECKLIST §H4).

**Decision:** no separate byte limit for photo jobs. The 40-sheet cut keeps parts under 150 MB for every page within
the per-page budget.

**Cost if wrong:** a part of very detailed real photos could be 130–150 MB+. It would still print, but more slowly
on a small phone. Phase 7 (documents: up to 300 pages, grey text) must measure real scans and add a byte limit if a
page can go over 3.75 MB.
