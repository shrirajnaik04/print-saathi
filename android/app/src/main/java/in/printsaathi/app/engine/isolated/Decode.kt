package `in`.printsaathi.app.engine.isolated

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.os.Build
import android.os.Debug
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.annotation.RequiresApi
import androidx.exifinterface.media.ExifInterface
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.channels.Channels
import java.nio.channels.FileChannel

/** A progressive photo too large for this phone's memory budget (EngineErrors.TOO_BIG). */
class TooBigForThisPhone : Exception("too big")

/**
 * Runs INSIDE the isolated engine process. Decodes straight to the needed size so a 108 MP photo never
 * allocates full resolution (PLAN §F2). Rules: software bitmaps (hardware ones can't be read), sRGB
 * output, EXIF applied exactly once.
 */
object Decode {
    const val PATH_IMAGE_DECODER = 0
    const val PATH_BITMAP_FACTORY = 1
    const val PATH_STRIPS = 2
    const val PATH_CROP = 3

    /** The photo's own bytes, untouched (JpegAsIs): result[6] = its camera turn (quarter turns clockwise). */
    const val PATH_AS_IS = 4

    /**
     * Only print files (JPEG 92) take a photo as it is; previews and the Print style examples (JPEG 85) are always drawn,
     * upright: the copied picture has no turn note of its own any more (review, 2026-10-24).
     */
    const val AS_IS_MIN_QUALITY = 90

    /** Strips keep an intermediate of at least this many times the target: measured to avoid detail loss (spike e). */
    const val STRIP_OVERSAMPLE = 2

    /** Pass as `quality` to get lossless raw RGBA (test measurements only). */
    const val RAW_RGBA = -1

    /** Raw 8-bit Rec.601 grey rows (the smart-crop detector's analysis bytes, PLAN §F3). */
    const val RAW_GREY = -2

    /** Returns {width, height, path, decodeMs, enginePssKbAfterDecode, enginePeakRssKb (VmHWM)}. */
    fun toJpeg(
        src: ParcelFileDescriptor,
        dst: ParcelFileDescriptor,
        maxLongSide: Int,
        quality: Int,
        oversample: Int = 1,
        useStrips: Boolean = true,
        /** Print style (Styles): colour styles and grey ones as JPEG, OCV Black as raw 1-bit rows. */
        style: Int = Styles.ORIGINAL,
        /** Only this area {x, y, w, h} of the upright photo (fractions), decoded on its own (PLAN §F1, §F2). */
        crop: DoubleArray? = null,
        /** The whole photo, Original style: a plain JPEG the print does not need smaller goes in as it is (JpegAsIs). */
        asIs: Boolean = false,
    ): IntArray {
        val t0 = SystemClock.elapsedRealtime()
        if (asIs && crop == null && quality in AS_IS_MIN_QUALITY..100) copyAsIs(src, dst, maxLongSide)?.let { return it }
        run {
            val (bmp, path) = upright(src, maxLongSide, crop, oversample, useStrips)
            try {
                val (outW, outH) = bmp.width to bmp.height // before OCV Black recycles the bitmap
                val decodeMs = (SystemClock.elapsedRealtime() - t0).toInt()
                val pss = Debug.getPss().toInt()
                FileOutputStream(dst.fileDescriptor).use { out ->
                    if (quality == RAW_GREY) {
                        val row = IntArray(bmp.width)
                        val bytes = ByteArray(bmp.width)
                        for (y in 0 until bmp.height) {
                            bmp.getPixels(row, 0, bmp.width, 0, y, bmp.width, 1)
                            for (x in row.indices) bytes[x] = Grey.luma(row[x]).toByte()
                            out.write(bytes)
                        }
                    } else if (quality == RAW_RGBA) {
                        // Lossless raw pixels: lets tests measure decode quality without encode loss.
                        val row = IntArray(bmp.width)
                        val bytes = ByteArray(bmp.width * 4)
                        for (y in 0 until bmp.height) {
                            bmp.getPixels(row, 0, bmp.width, 0, y, bmp.width, 1)
                            for (x in row.indices) {
                                val p = row[x]
                                bytes[x * 4] = (p shr 16).toByte()
                                bytes[x * 4 + 1] = (p shr 8).toByte()
                                bytes[x * 4 + 2] = p.toByte()
                                bytes[x * 4 + 3] = (p ushr 24).toByte()
                            }
                            out.write(bytes)
                        }
                    } else if (style == Styles.OCV) {
                        StyleOutput.oneBit(bmp, out)
                    } else if (style != Styles.ORIGINAL) {
                        // A print style (Black & White: exact Rec.601 grey, R = G = B kept by the normal encoder).
                        val g = if (bmp.isMutable) bmp else bmp.copy(Bitmap.Config.ARGB_8888, true)
                        StyleOutput.apply(g, style)
                        check(g.compress(Bitmap.CompressFormat.JPEG, quality, out)) { "encode failed" }
                        if (g !== bmp) g.recycle()
                    } else {
                        check(bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)) { "encode failed" }
                    }
                    out.flush()
                }
                return intArrayOf(outW, outH, path, decodeMs, pss, peakRssKb())
            } finally {
                bmp.recycle()
            }
        }
    }

    /**
     * The photo (or [crop] of it) upright, long side at most [maxLongSide] (never enlarged), as a software ARGB bitmap
     * the caller recycles; with the path that decoded it.
     */
    fun upright(src: ParcelFileDescriptor, maxLongSide: Int, crop: DoubleArray? = null, oversample: Int = 1, useStrips: Boolean = true): Pair<Bitmap, Int> =
        FileInputStream(src.fileDescriptor).channel.use { ch ->
            checkJpeg(ch)
            ch.position(0)
            // Preferred: tiled region decode at >= 2x the target, then exact area averaging — best quality with the
            // lowest memory. Formats the region decoder cannot read fall back to the whole-image paths.
            val cut = crop?.let { decodeCrop(src, ch, it, maxLongSide) }
            val strips = if (cut == null && useStrips) orNullOnException { decodeStrips(src, ch, maxLongSide, STRIP_OVERSAMPLE) } else null
            when {
                cut != null -> cut to PATH_CROP
                strips != null -> strips to PATH_STRIPS
                // Not on Android 9: its ImageDecoder divides by zero (SIGFPE in SkSampledCodec) when a sample size
                // meets a transposed EXIF orientation 5-8; reproduced by EngineOrientationTest on API 28.
                Build.VERSION.SDK_INT >= 29 -> decodeModern(ch.also { it.position(0) }, maxLongSide, oversample)
                else -> decodeLegacy(src, ch.also { it.position(0) }, maxLongSide, oversample)
            }
        }

    /** The photo's upright size in pixels (EXIF turn applied), from its header only. */
    fun uprightSize(src: ParcelFileDescriptor): Pair<Int, Int> {
        FileInputStream(src.fileDescriptor).channel.use { ch ->
            val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ch.position(0)
            BitmapFactory.decodeFileDescriptor(src.fileDescriptor, null, b)
            ch.position(0)
            val turn = readOrientation(src).first
            ch.position(0)
            require(b.outWidth > 0 && b.outHeight > 0) { "unreadable header" }
            return if (turn == 90 || turn == 270) b.outHeight to b.outWidth else b.outWidth to b.outHeight
        }
    }

    /**
     * Phase 0 carry-over (spikes.md (e)): a cut-off JPEG is a damaged file (decoders would print its missing part
     * grey), and a progressive JPEG over this phone's budget is refused before any decoding (it is decoded whole).
     */
    private fun checkJpeg(ch: FileChannel) {
        ch.position(0)
        val facts = JpegScan.scan(Channels.newInputStream(ch))
        if (facts == null) {
            // PNG and WebP cut off in transfer are damaged too (Phase 10 fuzz finding).
            ch.position(0)
            if (ImageScan.complete(Channels.newInputStream(ch)) == false) throw IllegalStateException("truncated")
            return
        }
        if (!facts.complete) throw IllegalStateException("truncated")
        if (facts.progressive && facts.width.toLong() * facts.height > JpegScan.progressiveBudgetPixels(memTotalBytes())) {
            throw TooBigForThisPhone()
        }
    }

    /** MemTotal from /proc/meminfo (readable in the isolated process); -1 if unknown. */
    private fun memTotalBytes(): Long = runCatching {
        java.io.File("/proc/meminfo").useLines { lines ->
            lines.first { it.startsWith("MemTotal:") }.filter(Char::isDigit).toLong() * 1024
        }
    }.getOrDefault(-1)

    @Suppress("DEPRECATION")
    private fun decodeStrips(
        src: ParcelFileDescriptor,
        ch: FileChannel,
        maxLongSide: Int,
        oversample: Int,
        crop: DoubleArray? = null,
    ): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ch.position(0)
        BitmapFactory.decodeFileDescriptor(src.fileDescriptor, null, bounds)
        ch.position(0)
        val orient = readOrientation(src)
        val rotation = orient.first
        ch.position(0)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "unreadable header" }
        // A crop is read from the matching stored rectangle only (PLAN §F1, §F2): same strips, same memory bound.
        val area = crop?.let { cropPixels(storedCrop(it, orient.first, orient.second), bounds.outWidth, bounds.outHeight) }
            ?: intArrayOf(0, 0, bounds.outWidth, bounds.outHeight)
        val left = area[0]
        val top0 = area[1]
        val rawW = area[2] - area[0]
        val rawH = area[3] - area[1]
        val bottom = area[3]
        val swap = rotation == 90 || rotation == 270
        val target = targetSize(if (swap) rawH else rawW, if (swap) rawW else rawH, maxLongSide)
        val rawTarget = if (swap) Size(target.height, target.width) else target
        // JPEG sample sizes scale in the DCT (a proper low-pass). Other formats' sampling just skips pixels and
        // aliases fine detail, so they are read at full resolution; strips keep the memory bounded either way.
        val s = if (bounds.outMimeType == "image/jpeg") {
            sampleSizeFor(rawW, rawH, Size(rawTarget.width * oversample, rawTarget.height * oversample))
        } else {
            1
        }
        val opts = BitmapFactory.Options().apply {
            inSampleSize = s
            inPreferredConfig = Bitmap.Config.ARGB_8888
            if (Build.VERSION.SDK_INT >= 26) inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
        }
        val stripRows = stripRowsFor((rawW + s - 1) / s)
        val decoder = android.graphics.BitmapRegionDecoder.newInstance(src.fileDescriptor, false)
            ?: error("region decoder unavailable")
        var out: Bitmap? = null
        var strip: Bitmap? = null
        var stripFirst = 0
        try {
            // Decoders round a sampled edge differently (JPEG up, PNG/WebP down), so the real sampled size is
            // measured on the last strip instead of assumed. Full strips are exact multiples of s rows.
            val stripSrcRows = s * stripRows
            val lastTop = ((rawH - 1) / stripSrcRows) * stripSrcRows
            val probe = requireNotNull(
                decoder.decodeRegion(android.graphics.Rect(left, top0 + lastTop, left + rawW, bottom), opts),
            ) { "strip decode failed" }
            val sampledW = probe.width
            val sampledH = (lastTop / s) + probe.height
            probe.recycle()
            val target = Bitmap.createBitmap(rawTarget.width, rawTarget.height, Bitmap.Config.ARGB_8888)
            out = target
            areaDownscaleRows(
                sampledW, sampledH, rawTarget.width, rawTarget.height,
                extentFor(rawW, s, sampledW), extentFor(rawH, s, sampledH),
                readRow = { y, buf ->
                var current = strip
                if (current == null || y >= stripFirst + current.height) {
                    current?.recycle()
                    val top = top0 + y * s
                    current = requireNotNull(
                        decoder.decodeRegion(android.graphics.Rect(left, top, left + rawW, minOf(bottom, top + s * stripRows)), opts),
                    ) { "strip decode failed" }
                    check(current.width == sampledW) { "strip width ${current.width} != $sampledW" }
                    strip = current
                    stripFirst = y
                }
                current.getPixels(buf, 0, sampledW, 0, y - stripFirst, sampledW, 1)
            }) { y, row -> target.setPixels(row, 0, rawTarget.width, 0, y, rawTarget.width, 1) }
        } catch (t: Throwable) {
            out?.recycle()
            throw t
        } finally {
            strip?.recycle()
            decoder.recycle()
        }
        return requireNotNull(out).oriented(orient)
    }

    /**
     * Only the cropped area (PLAN §F1): the strip decoder reads just the matching stored rectangle (memory bounded by
     * the strips, as for whole photos, so a large crop of a 108 MP photo still prints at full size on a 2 GB phone).
     * A format the region decoder cannot read is decoded whole at the size the area needs, then cut.
     */
    private fun decodeCrop(src: ParcelFileDescriptor, ch: FileChannel, crop: DoubleArray, maxLongSide: Int): Bitmap {
        orNullOnException { decodeStrips(src, ch, maxLongSide, STRIP_OVERSAMPLE, crop) }?.let { return it }
        // Formats without a region decoder: whole photo at the size the area needs (never upscaled), then the cut.
        ch.position(0)
        val needed = Math.ceil(maxLongSide / minOf(crop[2], crop[3])).toInt().coerceAtMost(MAX_SIDE)
        // Decoded whole in one piece: refuse what this phone's memory cannot hold (gate m3, PLAN §F2 budgets).
        val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFileDescriptor(src.fileDescriptor, null, b)
        ch.position(0)
        val long = maxOf(b.outWidth, b.outHeight).takeIf { it > 0 } ?: needed
        val short = minOf(b.outWidth, b.outHeight).takeIf { it > 0 } ?: needed
        val fits = wholeDecodeFits(
            needed, long, short, JpegScan.progressiveBudgetPixels(memTotalBytes()), Runtime.getRuntime().maxMemory(), Build.VERSION.SDK_INT,
        )
        if (!fits) throw TooBigForThisPhone()
        val whole = if (Build.VERSION.SDK_INT >= 29) decodeModern(ch, needed, 1).first else decodeLegacy(src, ch, needed, 1).first
        val c = cropPixels(crop, whole.width, whole.height)
        val cut = Bitmap.createBitmap(whole, c[0], c[1], c[2] - c[0], c[3] - c[1])
        if (cut !== whole) whole.recycle()
        return cut.areaScaledTo(targetSize(cut.width, cut.height, maxLongSide))
    }

    private const val MAX_SIDE = 30_000

    /** EXIF (rotation clockwise, mirrored). Mirrored orientations 2/4/5/7 are a horizontal flip followed by a rotation. */
    private fun readOrientation(src: ParcelFileDescriptor): Pair<Int, Boolean> =
        orNullOnException { ExifInterface(src.fileDescriptor).let { it.rotationDegrees to it.isFlipped } } ?: (0 to false)

    /** Applies the EXIF transform exactly once; recycles the receiver if a new bitmap was made. */
    private fun Bitmap.oriented(orient: Pair<Int, Boolean>): Bitmap {
        val (rotation, flipped) = orient
        if (rotation == 0 && !flipped) return this
        // AndroidX ExifInterface reports TRANSPOSE as 270 + flip and TRANSVERSE as 90 + flip: flip first, then rotate.
        val m = Matrix().apply {
            if (flipped) postScale(-1f, 1f)
            postRotate(rotation.toFloat())
        }
        val turned = Bitmap.createBitmap(this, 0, 0, width, height, m, true)
        if (turned !== this) recycle()
        return turned
    }


    @RequiresApi(29)
    private fun decodeModern(ch: FileChannel, maxLongSide: Int, oversample: Int): Pair<Bitmap, Int> {
        // Memory-mapped: the compressed file is not copied onto the Java heap.
        val buf = ch.map(FileChannel.MapMode.READ_ONLY, 0, ch.size())
        var target = Size(0, 0)
        var full = Size(0, 0)
        var sample = 1
        val sampled = ImageDecoder.decodeBitmap(ImageDecoder.createSource(buf)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
            // info.size is already EXIF-rotated; ImageDecoder applies the rotation itself.
            target = targetSize(info.size.width, info.size.height, maxLongSide)
            // Let the JPEG decoder do the cheap power-of-two reduction (DCT scaling, no full-res buffer);
            // the exact final step is done by area averaging, which does not alias fine texture.
            full = Size(info.size.width, info.size.height)
            sample = sampleSizeFor(info.size.width, info.size.height, Size(target.width * oversample, target.height * oversample))
            decoder.setTargetSampleSize(sample)
        }
        return sampled.areaScaledTo(target, extentFor(full.width, sample, sampled.width), extentFor(full.height, sample, sampled.height)) to PATH_IMAGE_DECODER
    }

    private fun decodeLegacy(src: ParcelFileDescriptor, ch: FileChannel, maxLongSide: Int, oversample: Int): Pair<Bitmap, Int> {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ch.position(0)
        BitmapFactory.decodeFileDescriptor(src.fileDescriptor, null, bounds)
        ch.position(0)
        val orient = readOrientation(src)
        ch.position(0)
        val swap = orient.first == 90 || orient.first == 270
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "unreadable header" }
        val upright = if (swap) Size(bounds.outHeight, bounds.outWidth) else Size(bounds.outWidth, bounds.outHeight)
        val target = targetSize(upright.width, upright.height, maxLongSide)
        val rawTarget = if (swap) Size(target.height, target.width) else target
        val sample = sampleSizeFor(bounds.outWidth, bounds.outHeight, Size(rawTarget.width * oversample, rawTarget.height * oversample))
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val sampled = requireNotNull(BitmapFactory.decodeFileDescriptor(src.fileDescriptor, null, opts)) { "decode failed" }
        val ext = extentFor(bounds.outWidth, sample, sampled.width) to extentFor(bounds.outHeight, sample, sampled.height)
        return sampled.areaScaledTo(rawTarget, ext.first, ext.second).oriented(orient) to PATH_BITMAP_FACTORY
    }

    /**
     * True extent, in sampled pixels, of [raw] source pixels at sample size [s] (e.g. 8999 / 2 = 4499.5), whether
     * the decoder rounded the sampled count up (4500) or down (4499); see areaDownscaleRows.
     */
    private fun extentFor(raw: Int, s: Int, sampled: Int): Double =
        (raw.toDouble() / s).coerceIn(sampled - 1 + 1e-6, sampled + 1 - 1e-6)

    /**
     * Original photos untouched (owner, 2026-10-23): when the header qualifies (JpegAsIs), the file's own picture is
     * copied to [dst] byte for byte, without its notes (EXIF place and time etc., JpegAsIs.pictureOnly), and its stored
     * size and camera turn are returned; otherwise null (decode as before).
     */
    private fun copyAsIs(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxLongSide: Int): IntArray? {
        val input = FileInputStream(src.fileDescriptor).channel
        val head = java.nio.ByteBuffer.allocate(JpegAsIs.HEAD_BYTES)
        input.position(0)
        while (head.hasRemaining() && input.read(head) > 0) Unit
        input.position(0)
        val facts = JpegAsIs.facts(head.array().copyOf(head.position())) ?: return null
        if (!JpegAsIs.qualifies(facts, maxLongSide)) return null
        // The camera turn as every other path reads it (AndroidX ExifInterface; review, 2026-10-24); never a mirror.
        val (rotation, flipped) = readOrientation(src)
        if (flipped || rotation % 90 != 0) return null
        input.position(0)
        // A photo's file is far smaller than its pixels; one that is not is decoded as before, never held whole.
        val size = input.size()
        if (size > facts.width.toLong() * facts.height * 3 + (1 shl 20)) return null
        val whole = java.nio.ByteBuffer.allocate(size.toInt())
        while (whole.hasRemaining() && input.read(whole) > 0) Unit
        input.position(0)
        val picture = JpegAsIs.pictureOnly(whole.array().copyOf(whole.position())) ?: return null
        // A plain write (no sendfile or sync: the isolated process keeps to ordinary reads and writes).
        val out = FileOutputStream(dst.fileDescriptor).channel
        val buf = java.nio.ByteBuffer.wrap(picture)
        while (buf.hasRemaining()) out.write(buf)
        return intArrayOf(facts.width, facts.height, PATH_AS_IS, 0, Debug.getPss().toInt(), peakRssKb(), (rotation / 90) % 4)
    }

    /** Kernel high-water mark of this process's resident memory: the true peak, not a sample. */
    private fun peakRssKb(): Int = runCatching {
        java.io.File("/proc/self/status").readLines().first { it.startsWith("VmHWM:") }.filter(Char::isDigit).toInt()
    }.getOrDefault(-1)

    /**
     * Exact area-average resize to [target], streamed row by row; recycles the receiver if replaced.
     * Images with alpha always pass through, so transparency is composited onto white even at 1:1.
     */
    private fun Bitmap.areaScaledTo(target: Size, extentW: Double = width.toDouble(), extentH: Double = height.toDouble()): Bitmap {
        if (width == target.width && height == target.height && !hasAlpha()) return this
        val out = Bitmap.createBitmap(target.width, target.height, Bitmap.Config.ARGB_8888)
        areaDownscaleRows(width, height, target.width, target.height, extentW, extentH, readRow = { y, row ->
            getPixels(row, 0, width, 0, y, width, 1)
        }) { y, row -> out.setPixels(row, 0, target.width, 0, y, target.width, 1) }
        recycle()
        return out
    }
}
