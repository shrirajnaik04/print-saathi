# Phase 4: Black & white end to end (API 35 emulator, 2026-10-03, build 989e5d5)

Share 6 photos → All on one page → Change → Colour (two cards, real first pages; B&W drawn grey,
`api35-colour-screen.png`) → Black & white → Ready shows the **real print file** rendered back by the engine, grey
(`api35-ready-bw-real-file.png`) → PRINT → Android's print screen shows **Color: Black & White** preselected
(`api35-print-dialog-bw.png`) → Save as PDF.

Saved file checked on the PC with Pillow: 6 images, 5 971 968 pixels, **0 pixels with R ≠ G or G ≠ B**.

Note: the emulator's own launcher showed "Pixel Launcher isn't responding" twice under load (system app, not
PrintSaathi); closed, then the run continued.

Not proven here: that the shop printer prints monochrome (the request is made; ink use is the printer's choice,
PLAN §R7).
