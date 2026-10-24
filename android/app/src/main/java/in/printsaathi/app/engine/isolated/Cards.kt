package `in`.printsaathi.app.engine.isolated

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.media.FaceDetector
import android.os.ParcelFileDescriptor
import `in`.printsaathi.app.engine.card.CardDetect
import `in`.printsaathi.app.engine.card.CardQuad
import `in`.printsaathi.app.engine.card.Panels
import `in`.printsaathi.app.engine.card.Warp
import java.io.FileOutputStream
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Runs INSIDE the isolated engine (Phase 14): finds ID cards in a customer's photo or on a PDF page, tells whether a
 * face is on each, and straightens a card to its print size. Corners are fractions of the upright photo (or page).
 */
object Cards {
    /** Detection works on a copy this size (the detector halves it again). */
    const val DETECT_PX = 1024
    /** A straightened card is looked at for a face at this width (Android's face finder wants modest sizes). */
    private const val FACE_W = 480
    /** A PDF page is searched for card panels rendered at this long side. */
    private const val PAGE_PX = 1600

    /**
     * {n, then per card: 8 corner values × 10 000, confidence × 1000, face}; best first, at most 2. Face: 0 none, 1 a
     * face reads upright on the straightened card, 2 a face reads only with the card turned over (it lies upside down).
     */
    fun detect(src: ParcelFileDescriptor, maxLongSide: Int): IntArray {
        val (bmp, _) = Decode.upright(src, maxLongSide.coerceIn(256, DETECT_PX))
        try {
            val w = bmp.width
            val h = bmp.height
            val pixels = IntArray(w * h)
            bmp.getPixels(pixels, 0, w, 0, 0, w, h)
            val grey = ByteArray(w * h) { Grey.luma(pixels[it]).toByte() }
            val found = CardDetect.find(grey, w, h, 2)
            return encode(found) { q -> faceOn(pixels, w, h, q) }
        } finally {
            bmp.recycle()
        }
    }

    /**
     * Phase 15 (spec Part 3): faces Android's finder sees in the photo turned 0, 1, 2 and 3 quarter turns clockwise
     * (it reads upright faces only, so the turn that shows faces is the one that makes the photo upright).
     */
    fun faceTurns(src: ParcelFileDescriptor, maxLongSide: Int): IntArray {
        val (bmp, _) = Decode.upright(src, maxLongSide.coerceIn(64, 640))
        try {
            return IntArray(4) { k ->
                if (k == 0) {
                    faceCount(bmp)
                } else {
                    val turned = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(90f * k) }, false)
                    try {
                        faceCount(turned)
                    } finally {
                        if (turned !== bmp) turned.recycle()
                    }
                }
            }
        } finally {
            bmp.recycle()
        }
    }

    /** How many faces Android's built-in finder sees in the photo (Phase 15 uses it too). */
    fun faces(src: ParcelFileDescriptor, maxLongSide: Int): Int {
        val (bmp, _) = Decode.upright(src, maxLongSide.coerceIn(64, DETECT_PX))
        try {
            return faceCount(bmp)
        } finally {
            bmp.recycle()
        }
    }

    /**
     * The card at [quad] straightened to [outW] × [outH] in print [style], as JPEG [quality]. Only the card's part of
     * the photo is decoded, at the resolution the output needs (never more than the photo has). Returns the decode
     * reply {outW, outH, path, ms, pssKb, peakKb} plus the card's width in the photo's own pixels (for "may print
     * blurry").
     */
    fun warped(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, outW: Int, outH: Int, quality: Int, style: Int, quad: DoubleArray): IntArray {
        val t0 = android.os.SystemClock.elapsedRealtime()
        val (pw, ph) = Decode.uprightSize(src)
        val box = boxOf(quad)
        val px = DoubleArray(8) { quad[it] * if (it % 2 == 0) pw else ph }
        val cardW = min(hypot(px[2] - px[0], px[3] - px[1]), hypot(px[4] - px[6], px[5] - px[7]))
        val cardH = min(hypot(px[6] - px[0], px[7] - px[1]), hypot(px[4] - px[2], px[5] - px[3]))
        // Enough photo pixels for the output, never more than the photo has.
        val scale = min(1.0, max(outW / cardW, outH / cardH) * 1.05)
        val cropLong = max(box[2] * pw, box[3] * ph)
        val (bmp, path) = Decode.upright(src, ceil(cropLong * scale).toInt().coerceAtLeast(16), crop = box)
        try {
            val w = bmp.width
            val h = bmp.height
            val pixels = IntArray(w * h)
            bmp.getPixels(pixels, 0, w, 0, 0, w, h)
            val inCrop = DoubleArray(8) { i ->
                if (i % 2 == 0) (quad[i] - box[0]) / box[2] * w else (quad[i] - box[1]) / box[3] * h
            }
            write(Warp.warp(pixels, w, h, inCrop, outW, outH), outW, outH, dst, quality, style)
            val ms = (android.os.SystemClock.elapsedRealtime() - t0).toInt()
            return intArrayOf(outW, outH, path, ms, android.os.Debug.getPss().toInt(), -1, (cardW * scale).roundToInt().coerceAtMost((cardW).roundToInt()))
        } finally {
            bmp.recycle()
        }
    }

    /** Card panels on PDF page [page] (an e-Aadhaar): the same reply as [detect], or a PdfOpen code. */
    fun detectInPage(pdf: ParcelFileDescriptor, password: String, page: Int): IntArray = CustomerPdf.withPage(pdf, password, page) { pw, ph, draw ->
        val scale = PAGE_PX.toDouble() / max(pw, ph)
        val w = max(1, (pw * scale).roundToInt())
        val h = max(1, (ph * scale).roundToInt())
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
        try {
            draw(bmp, null)
            val pixels = IntArray(w * h)
            bmp.getPixels(pixels, 0, w, 0, 0, w, h)
            val grey = ByteArray(w * h) { Grey.luma(pixels[it]).toByte() }
            // The page's own scale: a panel must be card-sized (85.6 mm), not only card-shaped.
            encode(Panels.find(grey, w, h, 2, pxPerMm = scale * 72 / 25.4)) { q -> faceOn(pixels, w, h, q) }
        } finally {
            bmp.recycle()
        }
    }

    /** The card at [quad] on PDF page [page], drawn at just the scale the output needs, then straightened. */
    fun pageWarped(
        pdf: ParcelFileDescriptor,
        password: String,
        page: Int,
        dst: ParcelFileDescriptor,
        outW: Int,
        outH: Int,
        quality: Int,
        style: Int,
        quad: DoubleArray,
    ): IntArray = CustomerPdf.withPage(pdf, password, page) { pw, ph, draw ->
        val box = boxOf(quad)
        // Points of the page per output pixel along the card: draw the box so the card has at least outW pixels.
        val cardPt = max(hypot((quad[2] - quad[0]) * pw, (quad[3] - quad[1]) * ph), hypot((quad[4] - quad[6]) * pw, (quad[5] - quad[7]) * ph))
        val scale = outW / cardPt * 1.05
        val w = max(1, ceil(box[2] * pw * scale).toInt())
        val h = max(1, ceil(box[3] * ph * scale).toInt())
        if (w.toLong() * h > 40_000_000L) throw BadRequest("box too large")
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
        try {
            draw(bmp, Matrix().apply { setScale(scale.toFloat(), scale.toFloat()); postTranslate((-box[0] * pw * scale).toFloat(), (-box[1] * ph * scale).toFloat()) })
            val pixels = IntArray(w * h)
            bmp.getPixels(pixels, 0, w, 0, 0, w, h)
            val inBox = DoubleArray(8) { i -> if (i % 2 == 0) (quad[i] - box[0]) * pw * scale else (quad[i] - box[1]) * ph * scale }
            write(Warp.warp(pixels, w, h, inBox, outW, outH), outW, outH, dst, quality, style)
            intArrayOf(outW, outH, Decode.PATH_CROP, 0, android.os.Debug.getPss().toInt(), -1, outW)
        } finally {
            bmp.recycle()
        }
    }

    /** A quad's bounding box {x, y, w, h} in fractions, a little larger, inside the image. */
    private fun boxOf(q: DoubleArray): DoubleArray {
        val xs = doubleArrayOf(q[0], q[2], q[4], q[6])
        val ys = doubleArrayOf(q[1], q[3], q[5], q[7])
        val x0 = (xs.min() - 0.01).coerceIn(0.0, 1.0)
        val y0 = (ys.min() - 0.01).coerceIn(0.0, 1.0)
        val x1 = (xs.max() + 0.01).coerceIn(0.0, 1.0)
        val y1 = (ys.max() + 0.01).coerceIn(0.0, 1.0)
        if (x1 - x0 <= 0 || y1 - y0 <= 0) throw BadRequest("empty card")
        return doubleArrayOf(x0, y0, x1 - x0, y1 - y0)
    }

    private fun write(out: IntArray, w: Int, h: Int, dst: ParcelFileDescriptor, quality: Int, style: Int) {
        val bmp = Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888).copy(Bitmap.Config.ARGB_8888, true)
        try {
            if (style != Styles.ORIGINAL) StyleOutput.apply(bmp, style)
            FileOutputStream(dst.fileDescriptor).use { o ->
                check(bmp.compress(Bitmap.CompressFormat.JPEG, quality, o)) { "encode failed" }
                o.flush()
            }
        } finally {
            bmp.recycle()
        }
    }

    private fun encode(found: List<CardQuad>, face: (DoubleArray) -> Int): IntArray {
        val out = IntArray(1 + found.size * 10)
        out[0] = found.size
        for ((n, c) in found.withIndex()) {
            for (i in 0 until 8) out[1 + n * 10 + i] = (c.corners[i] * 10_000).roundToInt()
            out[1 + n * 10 + 8] = (c.confidence * 1000).roundToInt()
            out[1 + n * 10 + 9] = face(c.corners)
        }
        return out
    }

    /**
     * A face on the card at [q] (fractions of the [w] × [h] image), the card straightened first: 1 upright, 2 only with
     * the card turned over (Android's finder reads upright faces only), 0 none.
     */
    private fun faceOn(pixels: IntArray, w: Int, h: Int, q: DoubleArray): Int = runCatching {
        val px = DoubleArray(8) { q[it] * if (it % 2 == 0) w else h }
        val outH = (FACE_W / CardDetect.ASPECT).roundToInt()
        val card = Warp.warp(pixels, w, h, px, FACE_W, outH)
        val bmp = Bitmap.createBitmap(card, FACE_W, outH, Bitmap.Config.ARGB_8888)
        try {
            when {
                faceCount(bmp) > 0 -> 1
                faceCount(Bitmap.createBitmap(bmp, 0, 0, FACE_W, outH, Matrix().apply { postRotate(180f) }, false)) > 0 -> 2
                else -> 0
            }
        } finally {
            bmp.recycle()
        }
    }.getOrDefault(0)

    /** Android's built-in face finder (offline, no Play services) wants RGB 565 at an even width. */
    private fun faceCount(src: Bitmap): Int {
        val w = src.width and 1.inv()
        if (w < 32 || src.height < 32) return 0
        val rgb = Bitmap.createBitmap(w, src.height, Bitmap.Config.RGB_565)
        try {
            android.graphics.Canvas(rgb).drawBitmap(src, 0f, 0f, null)
            val found = arrayOfNulls<FaceDetector.Face>(4)
            val n = FaceDetector(w, src.height, found.size).findFaces(rgb, found)
            // Only faces it is fairly sure of (spec Part 3: confidence ≥ 0.4).
            return (0 until n).count { (found[it]?.confidence() ?: 0f) >= FaceDetector.Face.CONFIDENCE_THRESHOLD }
        } finally {
            rgb.recycle()
        }
    }
}
