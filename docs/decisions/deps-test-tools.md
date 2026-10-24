# Dependency notes — test and fixture tools (not shipped)

These tools never enter the APK. Each was checked for licence, cost and privacy; none sends data anywhere.

| Tool | Where | Why | Licence / cost | Version |
|---|---|---|---|---|
| `pdfjs-dist` | npm devDependency | Independent PDF validation (`scripts/validate-pdf.mjs`) | Apache-2.0, free | 6.3.289 (exact) |
| `jpeg-js` | npm devDependency | 108 MP fixture generation, desktop JPEG decode | BSD-3-Clause, free | 0.4.4 (exact) |
| Pillow (Python) | Build PC only, already installed | Fixture variants (4:2:0, progressive, odd sizes, PNG) and a second full-resolution decoder for references (`tests/generate/make-variants.py`). Its BOX resize is **not** used as a reference: it samples weights instead of integrating partial pixel coverage (36.8 dB off exact on edges) | HPND (MIT-like), free | 9.5.0 (machine-installed; not pinned by the repo) |
| `androidx.heifwriter:heifwriter` | `androidTestImplementation` only | Writes HEIC fixtures with the device's own encoder, so HEIC decoding inside the isolated engine is tested on each API level (Gate 2 #4) | Apache-2.0, free | 1.1.0 (stable, Oct 2025), Gradle-locked |

Rule: any of these moving into `implementation` (shipped) needs its own ADR.
