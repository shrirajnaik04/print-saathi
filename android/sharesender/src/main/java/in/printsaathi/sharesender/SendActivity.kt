package `in`.printsaathi.sharesender

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.os.StrictMode
import androidx.core.content.FileProvider
import java.io.File

/**
 * Debug-only stand-in for WhatsApp: serves files from ITS OWN content provider and shares them to
 * PrintSaathi with read grants (SEND / SEND_MULTIPLE + ClipData), exactly the shape WhatsApp uses.
 * Modes: single-photo, six-photos, six-slow, mixed, pdf, pdf-octet, office, own-authority, own-authority-user, file-uri;
 * card-photos (Phase 14: an ID card's front and back, each photographed at a slant on a table), eaadhaar (a letter
 * page with two outlined card panels), sideways-doc (Phase 15: a photo of a typed page, taken sideways);
 * pushed (extra "name": a synthetic test file pushed into this app's cache/out folder; extra "type", default PDF);
 * pushed-many (extra "names": several such files, comma-separated; extra "type", default image/jpeg);
 * hostile streams (HostileProvider): lying-length, unknown-length, stall, midstream-error, zero-bytes, endless.
 * Round 10: colour-pdf (four pages, pages 2 and 4 with colour in them).
 * Owner, round 8: text (a WhatsApp text message: EXTRA_TEXT, English and Devanagari with WhatsApp's marks, 80 lines;
 * extra "text" sends that instead; text-blank: a message with nothing in it);
 * Round 9: docx, pptx, xlsx, doc, odt, txt (OfficeSamples: synthetic Office and text files, shared as files). camera-ok / camera-cancel / camera-hold (FakeCameraActivity takes a photo, closes
 * without one, or takes it and stays open until Back; nothing is shared).
 * Optional extra "tag" changes file contents so a later re-share can carry different URIs.
 */
class SendActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mode = intent.getStringExtra("mode") ?: "six-photos"
        val tag = intent.getStringExtra("tag") ?: "a"
        val out = File(cacheDir, "out").apply { mkdirs() }
        if (mode == "camera-ok" || mode == "camera-cancel" || mode == "camera-hold") {
            getSharedPreferences("camera", MODE_PRIVATE).edit()
                .putBoolean("cancel", mode == "camera-cancel").putBoolean("hold", mode == "camera-hold").commit()
            finish()
            return
        }
        if (mode == "text" || mode == "text-blank") {
            val text = if (mode == "text-blank") "  \n  " else intent.getStringExtra("text")
                ?: (1..80).joinToString("\n") { "*Line $it* of the notice: नमस्ते, कृपया यह पत्र पढ़ें। _thank you_ $tag" }
            startActivity(
                Intent(Intent.ACTION_SEND).apply {
                    setPackage("in.printsaathi.app")
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
            finish()
            return
        }

        fun share(file: File) = FileProvider.getUriForFile(this, "in.printsaathi.sharesender.files", file)
        val (uris, type) = when (mode) {
            "single-photo" -> listOf(share(photo(out, 1, tag))) to "image/jpeg"
            "six-photos" -> (1..6).map { share(photo(out, it, tag)) } to "image/jpeg"
            // Six photos from a slow app (about 2 s each), for acting on PrintSaathi while it is still receiving.
            "six-slow" -> (1..6).map { Uri.parse("content://in.printsaathi.sharesender.hostile/slow-$it") } to "image/jpeg"
            "mixed" -> listOf(share(photo(out, 1, tag)), share(pdf(out, tag))) to "*/*"
            "pdf" -> listOf(share(pdf(out, tag))) to (intent.getStringExtra("type") ?: "application/pdf")
            "pdf-octet" -> listOf(share(pdf(out, tag))) to "application/octet-stream"
            "pushed" -> listOf(share(File(out, (intent.getStringExtra("name") ?: "pushed.pdf").substringAfterLast('/')))) to (intent.getStringExtra("type") ?: "application/pdf")
            // Several pushed files at once (extra "names", comma-separated), e.g. 20 synthetic 12 MP photos.
            "pushed-many" -> (intent.getStringExtra("names") ?: "").split(',').filter { it.isNotBlank() }
                .map { share(File(out, it.substringAfterLast('/'))) } to (intent.getStringExtra("type") ?: "image/jpeg")
            "card-photos" -> listOf(share(cardPhoto(out, 1, tag)), share(cardPhoto(out, 2, tag))) to "image/jpeg"
            "eaadhaar" -> listOf(share(eaadhaar(out, tag))) to "application/pdf"
            // Round 10: a four-page PDF of black lines; pages 2 and 4 also carry a red and a blue block (colour in them).
            "colour-pdf" -> listOf(share(colourPdf(out, tag))) to "application/pdf"
            "sideways-doc" -> listOf(share(sidewaysDoc(out, tag))) to "image/jpeg"
            "office" -> listOf(share(docx(out, tag))) to "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            // Round 9: real Office files (OfficeSamples), each with the type WhatsApp gives it.
            "docx" -> listOf(share(OfficeSamples.docx(out, tag))) to "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "pptx" -> listOf(share(OfficeSamples.pptx(out, tag))) to "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            "xlsx" -> listOf(share(OfficeSamples.xlsx(out, tag))) to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "doc" -> listOf(share(OfficeSamples.doc(out, tag))) to "application/msword"
            "odt" -> listOf(share(OfficeSamples.odt(out, tag))) to "application/vnd.oasis.opendocument.text"
            "txt" -> listOf(share(OfficeSamples.txt(out, tag))) to "text/plain"
            "own-authority" -> listOf(Uri.parse("content://in.printsaathi.app.fileprovider/private/jobs/x")) to "image/jpeg"
            // "userId@" prefix: ContentResolver strips it, so a naive equality check would let this through.
            "own-authority-user" -> listOf(Uri.parse("content://0@in.printsaathi.app.androidx-startup/x")) to "image/jpeg"
            "lying-length", "unknown-length", "stall", "midstream-error", "zero-bytes", "endless" ->
                listOf(Uri.parse("content://in.printsaathi.sharesender.hostile/$mode")) to "image/jpeg"
            "file-uri" -> {
                // Old-style file:// share; StrictMode would block it, so relax it for this hostile test only.
                StrictMode.setVmPolicy(StrictMode.VmPolicy.Builder().build())
                listOf(Uri.fromFile(photo(out, 1, tag))) to "image/jpeg"
            }
            else -> error("unknown mode $mode")
        }

        val send = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
            setPackage("in.printsaathi.app")
            this.type = type
            if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            // A sender cannot grant URIs it does not own; hostile modes therefore arrive without grants,
            // which is exactly what a malicious app would send.
            if (!mode.startsWith("own-authority") && mode != "file-uri") {
                clipData = ClipData.newRawUri("", uris[0]).also { c -> uris.drop(1).forEach { c.addItem(ClipData.Item(it)) } }
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        startActivity(send)
        finish()
    }

    private fun photo(dir: File, n: Int, tag: String): File {
        val bmp = Bitmap.createBitmap(1200, 900, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply {
            // Small integers only: a float sum with the tag's large hash lost the n * 55 part, and a long label pushed
            // the number off the photo, so all six photos came out byte-identical.
            drawColor(Color.HSVToColor(floatArrayOf(((n * 55 + (tag.hashCode() and 0xFFFF)) % 360).toFloat(), 0.5f, 0.9f)))
            drawText("$n", 450f, 600f, Paint().apply { textSize = 400f; color = Color.BLACK })
            drawText(tag, 40f, 860f, Paint().apply { textSize = 40f; color = Color.BLACK })
        }
        return File(dir, "photo-$tag-$n.jpg").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) } }
    }

    /** A light card (a band, a photo block, lines of text) on a brown table, seen at a slant: synthetic, never a real card. */
    private fun cardPhoto(dir: File, n: Int, tag: String): File {
        val bmp = Bitmap.createBitmap(1600, 1200, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(120, 82, 52))
        val corners = if (n == 1) floatArrayOf(380f, 280f, 1180f, 360f, 1130f, 880f, 330f, 790f) else floatArrayOf(300f, 380f, 1080f, 260f, 1160f, 760f, 380f, 900f)
        val cw = 856f
        val ch = 540f
        c.save()
        c.concat(android.graphics.Matrix().apply { setPolyToPoly(floatArrayOf(0f, 0f, cw, 0f, cw, ch, 0f, ch), 0, corners, 0, 4) })
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = Color.rgb(240, 240, 234)
        c.drawRoundRect(android.graphics.RectF(0f, 0f, cw, ch), 32f, 32f, p)
        p.color = if (n == 1) Color.rgb(235, 130, 40) else Color.rgb(60, 120, 200)
        c.drawRect(0f, 0f, cw, 86f, p)
        p.color = Color.rgb(70, 70, 70)
        if (n == 1) c.drawRect(43f, 130f, 240f, 430f, p)
        for (k in 0 until 5) c.drawRect(if (n == 1) 290f else 60f, 150f + k * 60f, 790f, 170f + k * 60f, p)
        p.textSize = 40f
        c.drawText(tag.take(12), 300f, 500f, p)
        c.restore()
        return File(dir, "card-$tag-$n.jpg").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) } }
    }

    /** A page of left-aligned typed lines, photographed with the phone turned (the page lies sideways). */
    private fun sidewaysDoc(dir: File, tag: String): File {
        val w = 900
        val h = 1200
        val page = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(page)
        c.drawColor(Color.rgb(240, 238, 232))
        val p = Paint().apply { color = Color.rgb(40, 40, 40) }
        val r = java.util.Random(tag.hashCode().toLong())
        var y = 90f
        while (y < h - 120) {
            val lines = 2 + r.nextInt(5)
            for (k in 0 until lines) {
                if (y >= h - 120) break
                var x = 80f + if (k == 0) 40f else 0f
                val end = if (k == lines - 1) 200f + r.nextInt(400) else 700f + r.nextInt(120)
                while (x < end) {
                    val word = 20f + r.nextInt(90)
                    c.drawRect(x, y, minOf(x + word, end), y + 16f, p)
                    x += word + 14f
                }
                y += 34f
            }
            y += 30f
        }
        // Turned a quarter clockwise: the lines now run down the photo.
        val turned = Bitmap.createBitmap(page, 0, 0, w, h, android.graphics.Matrix().apply { postRotate(90f) }, true)
        return File(dir, "sideways-$tag.jpg").apply { outputStream().use { turned.compress(Bitmap.CompressFormat.JPEG, 90, it) } }
    }

    /** A letter page with two outlined card panels in its bottom half (the synthetic e-Aadhaar layout). */
    private fun eaadhaar(dir: File, tag: String): File {
        val doc = android.graphics.pdf.PdfDocument()
        val page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val c = page.canvas
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(30, 30, 30) }
        for (k in 0 until 14) c.drawRect(60f, 80f + k * 22f, 535f, 88f + k * 22f, p)
        p.textSize = 10f
        c.drawText(tag.take(12), 60f, 420f, p)
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.2f; color = Color.BLACK }
        for ((n, x) in listOf(40f, 312f).withIndex()) {
            c.drawRoundRect(android.graphics.RectF(x, 560f, x + 242.65f, 560f + 153.07f), 9f, 9f, stroke)
            if (n == 0) c.drawRect(x + 12f, 590f, x + 70f, 660f, p)
            for (k in 0 until 4) c.drawRect(x + 85f, 595f + k * 18f, x + 220f, 600f + k * 18f, p)
        }
        doc.finishPage(page)
        val f = File(dir, "eaadhaar-$tag.pdf")
        f.outputStream().use { doc.writeTo(it) }
        doc.close()
        return f
    }

    private fun colourPdf(dir: File, tag: String): File {
        val doc = android.graphics.pdf.PdfDocument()
        for (n in 1..4) {
            val page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(595, 842, n).create())
            val c = page.canvas
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(30, 30, 30) }
            for (k in 0 until 14) c.drawRect(60f, 100f + k * 22f, 535f, 108f + k * 22f, p)
            p.textSize = 16f
            c.drawText("Page $n ${tag.take(12)}", 60f, 70f, p)
            if (n % 2 == 0) {
                p.color = Color.rgb(200, 30, 30)
                c.drawRect(60f, 450f, 300f, 620f, p)
                p.color = Color.rgb(30, 90, 200)
                c.drawRect(320f, 450f, 535f, 620f, p)
            }
            doc.finishPage(page)
        }
        val f = File(dir, "colour-$tag.pdf")
        f.outputStream().use { doc.writeTo(it) }
        doc.close()
        return f
    }

    private fun pdf(dir: File, tag: String): File = File(dir, "doc-$tag.pdf").apply {
        writeText(
            "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
                "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
        )
    }

    private fun docx(dir: File, tag: String): File = File(dir, "letter-$tag.docx").apply {
        writeBytes(byteArrayOf(0x50, 0x4B, 0x03, 0x04) + "....[Content_Types].xml...word/document.xml".toByteArray())
    }
}
