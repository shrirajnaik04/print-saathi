// AIDL package cannot start with "in" (an AIDL keyword), so the interface lives under app.printsaathi.
package app.printsaathi.engine;

/** The isolated engine only ever sees file descriptors handed to it; it cannot open files itself. */
interface IEngine {
    /**
     * Returns {outWidth, outHeight, decodePath(0=ImageDecoder,1=BitmapFactory,2=RegionStrips), decodeMs,
     * enginePssKb, enginePeakRssKb}, or {-code} on failure (EngineErrors: 1 unreadable, 2 out of memory, 3 not allowed).
     */
    int[] decodeToJpeg(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality);
    /**
     * Black & white (PLAN §G2): like decodeToJpeg, but the photo is written as Rec.601 grey with neutral chroma, so the
     * JPEG decodes to R = G = B exactly. Same reply.
     */
    int[] decodeToGreyJpeg(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality);
    /** Debug only: like decodeToJpeg but keeps an intermediate >= oversample x target (quality/memory experiment). */
    int[] decodeOversampled(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality, int oversample);
    /**
     * Opens a PDF with this phone's built-in engine (tiers: PLAN §G5). Returns {pageCount, firstPageInk(1/0)}
     * or {code}: -101 password required or wrong, -102 unsupported security, -103 damaged; {-1..-3} are engine
     * failures (EngineErrors), reported to the app as damaged. Password stays in memory.
     */
    int[] openPdf(in ParcelFileDescriptor pdf, String password);
    /**
     * Preview (PLAN §G7.3): renders page [page] of the app's own print file onto white, long side [maxLongSidePx],
     * as a JPEG. Returns {width, height} or {-code} (EngineErrors).
     */
    int[] renderPdfPage(in ParcelFileDescriptor pdf, int page, in ParcelFileDescriptor dst, int maxLongSidePx);
    /** Engine-process PSS in KB. */
    int pssKb();
    /** Debug builds only: proves crash containment. */
    void crashForTest();
    /** Debug builds only: proves the engine cannot open app-private paths by itself. */
    boolean canReadPath(String path);
    /**
     * Like decodeToJpeg (or decodeToGreyJpeg when [grey]), but only the area {x, y, w, h} (fractions of the upright
     * photo) is decoded and printed (PLAN §F1 crop): its long side becomes at most [maxLongSidePx]. Same reply.
     */
    int[] decodeCropToJpeg(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality, boolean grey, double x, double y, double w, double h);
    /**
     * A customer's PDF (PLAN §G4): {pages, flags (1 = forms or stamps seen), w1, h1, w2, h2, …} in points as shown,
     * for at most 500 pages; or {code}: -101 password required or wrong, -102 unsupported, -103 damaged, or an
     * EngineErrors code (negative). [password] is used in memory for this call only ("" = none).
     */
    int[] pdfFacts(in ParcelFileDescriptor pdf, String password);
    /**
     * Page [page] of a customer's PDF onto white for printing (RENDER_MODE_FOR_PRINT), long side [maxLongSidePx].
     * [mode]: 0 colour JPEG [quality]; 1 grey JPEG (Rec.601, R = G = B); 2 raw 8-bit Rec.601 grey rows (w x h bytes).
     * Returns {width, height} or {code} as pdfFacts.
     */
    int[] renderCustomerPage(in ParcelFileDescriptor pdf, String password, int page, in ParcelFileDescriptor dst, int maxLongSidePx, int quality, int mode);

    /**
     * Phase 8 print styles (PLAN §F4): [style] 0 Original, 1 Vibrant, 2 Soft Tone, 3 Black & White, 4 Sharp Black,
     * 5 OCV Black. Area {x, y, w, h} of the upright photo ({0, 0, 1, 1} = whole). OCV Black writes raw 1-bit rows.
     */
    int[] decodeStyled(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality, int style, double x, double y, double w, double h);

    /** renderCustomerPage in a print style; [mode] 3 = raw 1-bit rows (OCV Black). */
    /** Phase 9 (PLAN §F3): the photo upright at ≤ [maxLongSidePx] as raw 8-bit grey rows; {w, h, …} like decodes. */
    int[] analysisGrey(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx);

    int[] renderCustomerPageStyled(in ParcelFileDescriptor pdf, String password, int page, in ParcelFileDescriptor dst, int maxLongSidePx, int quality, int mode, int style);

    /**
     * Phase 14: ID cards in a photo, looked for on a copy of long side <= [maxLongSidePx]. {n, then per card: 8 corner
     * values (fractions of the upright photo x 10000, TL TR BR BL), confidence x 1000, face on it (1/0)}, or {-code}.
     */
    int[] detectCards(in ParcelFileDescriptor src, int maxLongSidePx);
    /** Faces Android's built-in finder sees in the upright photo (copy of long side <= [maxLongSidePx]); -code on failure. */
    int faceCount(in ParcelFileDescriptor src, int maxLongSidePx);
    /**
     * The card at [quad] (8 fractions of the upright photo, TL TR BR BL) straightened to [outW] x [outH] in print
     * [style] (not OCV Black), JPEG [quality]. {outW, outH, path, ms, pssKb, peakKb, card width in the photo's pixels}.
     */
    int[] decodeWarped(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int outW, int outH, int quality, int style, in double[] quad);
    /** Card panels printed on PDF page [page] (e-Aadhaar): the reply of detectCards, or pdfFacts' codes. */
    int[] detectCardsInPage(in ParcelFileDescriptor pdf, String password, int page);
    /** Phase 15: faces seen in the upright photo turned 0, 1, 2, 3 quarter turns clockwise: {4 counts} or {-code}. */
    int[] faceTurns(in ParcelFileDescriptor src, int maxLongSidePx);
    /** decodeWarped for a card on PDF page [page]: only its box is drawn, at the scale the output needs. */
    int[] renderPageWarped(in ParcelFileDescriptor pdf, String password, int page, in ParcelFileDescriptor dst, int outW, int outH, int quality, int style, in double[] quad);
}
