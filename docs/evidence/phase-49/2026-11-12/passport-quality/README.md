# Passport photos "as is" (round 11): device numbers

`PassportQualityDeviceTest` (3 tests, API 35 emulator, real engine) renders a sheet of 35 x 45 mm passport photos
through the app's own `PlanRenderer` + `EngineRenderer`, from synthetic photos (generated in the test, never a
customer's). `device-api35-numbers.txt` has its log lines.

| Case | Image made (px) | print.pdf | Render time |
|---|---|---|---|
| 12 photos, 2400 x 3200 source, 600 dpi (new) | 797 x 1063, stored once | 329,317 bytes | 1,318 ms |
| the same at 300 dpi (before) | 399 x 532, stored once | 16,941 bytes | 274 ms |
| 30 photos, 2400 x 3200 source, 600 dpi | 797 x 1063, stored once | 331,289 bytes | 1,524 ms |
| 600 x 800 source (a WhatsApp-sized face), 600 dpi | 600 x 800: its own pixels, not shrunk, not enlarged | 121,608 bytes | - |
| the same at 300 dpi (before) | 399 x 532: detail thrown away | 51,915 bytes | - |

The printer's own speed was not measured (no printer here). What the numbers show: the file the printer receives is
still one small image (a third of a megabyte), made in about a second on an emulator.
