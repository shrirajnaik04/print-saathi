# Whole-branch review fixes — engine memory (review #6), API 24

Device: `ps_api24_2gb` (Android 7.0, API 24, 2 GB), emulator-5560. The image's own per-app memory cap is 512 MB, far
above a real 2 GB Android 7 phone, so the cap was set to a realistic 128 MB for this run
(`setprop dalvik.vm.heapgrowthlimit 128m`, then a framework restart; not persistent, the emulator was shut down after).

Test: `PlanRenderDeviceTest#aWholeA4PageStraightenedFromABigPhotoRendersInColourAndOcvBlack`: one A4 page (Narrow
margins) straightened from a synthetic 3000 × 4000 photo, in colour (JPEG 2181 × 3208, 300 dpi of its box) and in
OCV Black (1-bit).

| Run | Engine code | Result |
|---|---|---|
| `a4-old-api24-128m.txt` | before the fix (HEAD c378283 `Cards.kt`) | FAIL: `Damaged(itemIndex=1)`; logcat `Throwing OutOfMemoryError "Failed to allocate a 27986604 byte allocation"` |
| `a4-new-api24-128m.txt` | after the fix | OK (1 test), no OutOfMemoryError in logcat |
| `planrender-api24-128m.txt` | after the fix | `PlanRenderDeviceTest` OK (12 tests) |
| `cards-docs-api24-128m.txt` | after the fix | `CardEngineDeviceTest` + `DocumentRenderDeviceTest` OK (11 tests) |

With the default 512 MB cap the old code passed the same test (it is not a failure on that image), which is why the
cap was lowered. Synthetic pictures only; no customer files.
