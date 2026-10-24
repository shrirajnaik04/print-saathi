# Phase 2 Task 1: hardened intake (API 35 emulator, 2026-10-03)

| Check | Result |
|---|---|
| Share matrix: 9 normal and hostile-URI modes + 6 hostile-stream modes (`share-hostile-matrix-api35.json`) | **15/15 PASS** |
| Lying length (claims 10 B) and unknown length | Photo imported; declared length ignored |
| Stall (provider stops sending) | Stopped at **20.35 s** (stall limit 20 s): `stalled`, nothing kept |
| Endless stream | Stopped at the 200 MB cap in 1.5 s: `tooBig`, nothing kept |
| Mid-stream error / zero bytes | `failed` / `empty`, nothing kept |
| Disk after the matrix | 0 `.part` files; all jobs total 2.4 MB (the 200 MB endless copy was removed); one journal record per share (no overwrite) |
| **Process death mid-copy** (stall share, `am force-stop` while copying, restart) | The `.part` existed during the copy; after restart there are **0 `.part` files**, and the record shows `"state":"interrupted","expected":1` |

**JVM tests:** `CopyLimitsTest` 7, `IntakeJournalTest` 5.
- Each limit was RED first.
- One real defect was found by the storage test: the free-space check ran after the write and ignored the chunk size.
