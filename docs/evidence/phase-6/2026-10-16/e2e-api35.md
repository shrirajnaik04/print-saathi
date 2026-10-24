# Phase 6 on the API 35 emulator (2026-10-17, build 34fe399)

Driven through the real app: web buttons via the WebView DevTools socket; Android's print screen and file picker via UiAutomator.

## Passport photos (J4), one shared photo, no 4×6 paper saved (emulator: Save as PDF only)

**On screen**
1. **Passport photos** opened **Fit the face in the frame** (`api35-passport-frame.png`), with:
   - the photo as shown;
   - a centred 35:45 frame and face oval;
   - the outside dimmed;
   - Move ↑ ↓ ← → buttons.
2. **Next** opened Ready:
   - summary: "5 passport photos · A4 · Colour · 1 sheet · Charge ₹50";
   - note: "Printing on A4 paper: this printer's 4×6 photo paper isn't set up yet (Help → Print a test page)." (`api35-passport-ready.png`)
3. **PRINT**: Android's print screen showed ISO A4. Saved as PDF.

**Saved file, read back with pdf.js (`scripts/validate-pdf.mjs`)**
- 5 images, each **99.2126 × 127.5591 pt = 35.00 × 45.00 mm**, in reading order, none turned or mirrored.
- 4 cut lines, each 45.00 mm.

**Our own print.pdf on the device**
- **one** image object of **414 × 532 px**, about 300 dpi for 35 × 45 mm, drawn 5 times;
- 4 cut lines;
- 197 KB.

## Not proven here
- 4×6 photo paper: the emulator has no printer that offers it (Save as PDF never saves the paper size). The 4×6 plan is covered by vitest, the JVM contract and e2e. USER-CHECKLIST §J measures it on the shop printer with a ruler.
- The shopkeeper doing J4 alone (USER-CHECKLIST §J).
