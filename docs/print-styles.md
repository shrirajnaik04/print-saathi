# Print styles: exact rules as built (PLAN §F4, Phase 8)

**Code:** `android/app/src/main/java/in/printsaathi/app/engine/isolated/Styles.kt` (pure functions) and `StyleOutput.kt`. They run inside the isolated engine at the output stage, so the examples on the Print style screen, the previews and the print file all come from this code.

**Golden values:** `StylesTest`, from an independent Python reference: `tests/generate/styles-reference.py`.

**Arithmetic:** full precision (double) until one final rounding (half up) and a clamp to 0–255. Luma is Rec.601: Y = 0.299 R + 0.587 G + 0.114 B. Grey pixels use the integer form `(299 R + 587 G + 114 B + 500) / 1000`, so R = G = B exactly.

| Style | Group | Steps, in this order |
|---|---|---|
| **Original** | Colour | No change |
| **Vibrant** | Colour | Saturation × 1.25 about the pixel's own luma (each channel = Y + (c − Y) × 1.25); then contrast × 1.08 about 128 |
| **Soft Tone** | Colour | Contrast × 0.90 about 128; brightness + 6; then saturation × 0.92 about the luma of the result |
| **Black & White** | B&W | Rec.601 grey (unchanged since Phase 4) |
| **Sharp Black** | B&W | See below |
| **OCV Black** | B&W | See below |

## Sharp Black
1. Histogram of the whole image's grey values.
2. Black level = the 5th percentile, but at most 90. White level = the 90th percentile, but at least 160. A percentile is the smallest value whose cumulative count reaches ⌈p % × pixels⌉.
3. Each grey value v → t = (v − black) / (white − black), clamped to 0–1 → 255 × t^(1/0.85).
   - "Gamma 0.85" is read as darkening mid-greys: 128 becomes 124 with levels 90/160.
   - The limits keep white − black ≥ 70, so there is never a divide by zero.
   - A white page stays white.

## OCV Black (1-bit)
1. **Background (paper brightness):**
   - The page at 1/8 scale, each cell holding the **brightest** value of its 8 × 8 block. That is paper, not ink.
   - Widened by 2 cells (maximum over 5 × 5 cells), so a heading stroke thicker than a cell is not taken for paper.
   - Blurred twice with a 5 × 5 box filter, then read back bilinearly at every pixel.
2. **Flattening:** f = 255 × v / background, clamped (uneven light and yellowed paper become white).
3. **Bradley–Roth threshold:** black if f < 80, or if f × count < 0.85 × (sum of f over the window), where the window is odd and about 1/16 of the shorter side (at least 15 px).
   - The sums come from a 64-bit sum table per strip of rows (256 by default) plus the window's overlap.
   - There is never a whole-page table and never an overflow.
   - The result is bit-identical for any strip height (tested with 37, 256 and the whole page).
4. **Output:**
   - rows packed MSB first, padded to whole bytes, 1 = white, 0 = black;
   - in the PDF: `/ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode`.

**Checked:** text strokes on paper that darkens from 235 to 145 come out ≥ 98 % black, with ≤ 1 % of the paper black. A smooth dark photo (60–140) is less than half black. A whole A4 page at 300 dpi takes 0.17 s on the JVM.

## Where the styles apply
- **The whole job, one style** (no per-photo styles, no sliders).
- **Coupling with Colour / Black & white:**
  - Choosing a style sets the matching colour.
  - Choosing Colour or Black & white sets that colour's plain style (Original or Black & White).
- **Passport photos:** never styled (PLAN §U: nothing changed except crop and size).
- **The untouched PDF path:** only with Original.
- **Output per style:**

  | Style | Photos | PDF pages |
  |---|---|---|
  | Colour styles | JPEG q92 | JPEG q92 |
  | Black & White, Sharp Black | Exact-grey JPEG | Lossless grey (Flate, PNG predictors) when ≤ 1.5 MB a page, else exact-grey JPEG |
  | OCV Black | 1-bit Flate | 1-bit Flate |

  Print resolution is never lowered for a style.
- **Examples:** ≤ 360 px, the job's first photo or page. A locked PDF's examples are kept with the job's decrypted data.
