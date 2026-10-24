# PrintSaathi brand masters (v3, the PS printer)

Copied unchanged from the owner's brand pack `PrintSaathi-v3/` (2026-10-23). Every logo in the app comes from these:

| Master | Used for |
|---|---|
| `android-foreground.svg` | `res/drawable/ic_launcher_foreground.xml` (hand-converted vector, same paths and transform) |
| `android-monochrome.svg` | `res/mipmap-*/ic_launcher_monochrome.png` (Android 13 themed icon; rendered by `scripts/brand/render.mjs`) |
| `app-icon.svg` | `res/mipmap-*/ic_launcher.png` and `ic_launcher_round.png` (Android 7 icons; rendered) |
| `mark.svg` | `res/drawable/splash_mark.xml` (the printer without its paper), `src/ui/BrandMark.tsx`, the splash in `index.html` |
| `favicon.ico` | `public/favicon.ico` |
| `logo-horizontal.svg`, `mark-monochrome.svg`, `splash.svg` | reference (lockup, tiny uses, the splash composition) |

Rules from the pack: brand cobalt #304BEE, tangerine #FF854A, ink #111B35 only in the logo (the app keeps its own
colours); light backgrounds; the mark beside the visible name is decorative (`aria-hidden`); clear space 32/512 of the
mark's width. Re-render the PNGs with `node scripts/brand/render.mjs` after changing a master.
