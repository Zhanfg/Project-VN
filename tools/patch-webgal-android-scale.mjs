import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.android';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}
function replaceOnce(content, before, after, label) {
  const index = content.indexOf(before);
  if (index < 0) throw new Error('Android scale patch target not found: ' + label);
  if (content.indexOf(before, index + before.length) >= 0) {
    throw new Error('Android scale patch target is ambiguous: ' + label);
  }
  return content.slice(0, index) + after + content.slice(index + before.length);
}

{
  const file = 'app/src/main/java/com/openwebgal/demo/MainActivity.kt';
  let source = read(file);
  source = replaceOnce(
    source,
    'import android.webkit.*\nimport android.widget.Toast',
    'import android.webkit.*\nimport android.widget.Toast\nimport java.io.ByteArrayInputStream\nimport java.io.File\nimport java.io.FileInputStream\nimport java.io.FileNotFoundException',
    'java.io imports',
  );
  source = replaceOnce(
    source,
    '            ): WebResourceResponse? {\n                val interceptedRequest = assetLoader.shouldInterceptRequest(',
    '            ): WebResourceResponse? {\n                externalGameDataResponse(request)?.let { return it }\n                val interceptedRequest = assetLoader.shouldInterceptRequest(',
    'external overlay intercept',
  );

  const anchor = '\n    //获取 blob 数据\n';
  const helper = `
    /**
     * Large-content overlay.
     *
     * Runtime lookup order for /assets/webgal/game/<logical-path>:
     *   1. filesDir/game-data/<logical-path>
     *   2. APK assets via WebViewAssetLoader
     */
    private fun externalGameDataResponse(request: WebResourceRequest): WebResourceResponse? {
        if (!"https".equals(request.url.scheme, ignoreCase = true) ||
            !WebViewAssetLoader.DEFAULT_DOMAIN.equals(request.url.host, ignoreCase = true) ||
            (request.url.port != -1 && request.url.port != 443)) return null
        val head = request.method == "HEAD"
        if (!head && request.method != "GET") return null

        val prefix = "/assets/webgal/game/"
        val requestPath = request.url.path ?: return null
        if (!requestPath.startsWith(prefix)) return null

        val relativePath = requestPath.removePrefix(prefix)
        if (relativePath.isBlank()) return null

        val root = File(filesDir, "game-data").canonicalFile
        val target = File(root, relativePath).canonicalFile
        val rootPrefix = root.path + File.separator
        if (!target.path.startsWith(rootPrefix) || !target.isFile) return null

        val extension = target.extension.lowercase()
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
            ?: when (extension) {
                "js", "mjs" -> "text/javascript"
                "json" -> "application/json"
                "css" -> "text/css"
                "svg" -> "image/svg+xml"
                "woff2" -> "font/woff2"
                "wasm" -> "application/wasm"
                else -> "application/octet-stream"
            }

        val input = try {
            FileInputStream(target)
        } catch (_: FileNotFoundException) {
            return null
        }
        try {
            // Read size and bytes from the same descriptor, including across a rename.
            val size = input.channel.size()
            val headers = linkedMapOf(
                "Accept-Ranges" to "bytes",
                "Cache-Control" to "no-store",
                "X-After-School-Asset-Source" to "external-game-data"
            )
            fun header(name: String): String? =
                request.requestHeaders.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

            val reply = planOverlayReply(head, header("Range"), header("If-Range"), size)
            headers["Content-Length"] = reply.contentLength.toString()
            reply.contentRange?.let { headers["Content-Range"] = it }
            val body = if (reply.sendBody) {
                input.channel.position(reply.offset)
                OverlayBody(input, reply.contentLength)
            } else {
                input.close()
                ByteArrayInputStream(ByteArray(0))
            }
            return WebResourceResponse(mime, null, reply.status, reply.reason, headers, body)
        } catch (error: Exception) {
            runCatching { input.close() }
            throw error
        }
    }
`;
  source = replaceOnce(source, anchor, '\n' + helper + anchor, 'external overlay helper');
  write(file, source);
}

{
  const file = 'app/build.gradle';
  let source = read(file);
  source = replaceOnce(
    source,
    "    aaptOptions {\n        noCompress['.keep_gz']\n    }",
    "    aaptOptions {\n        // Media is already compressed. Re-compressing it wastes build time and install-time CPU.\n        noCompress '.keep_gz', 'mp3', 'ogg', 'opus', 'wav', 'flac', 'mp4', 'webm', 'webp', 'avif', 'woff2'\n    }",
    'aapt noCompress media',
  );
  write(file, source);
}


{
  const file = 'gradle/wrapper/gradle-wrapper.properties';
  let source = read(file);
  source = replaceOnce(
    source,
    'distributionUrl=https\\://mirrors.aliyun.com/gradle/distributions/v8.11.1/gradle-8.11.1-bin.zip',
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.11.1-bin.zip',
    'official Gradle distribution',
  );
  write(file, source);
}

const overlayJvm = `package com.openwebgal.demo

import java.io.FileInputStream
import java.io.InputStream
import java.math.BigInteger

private val overlayRangePattern = Regex("bytes=([0-9]*)-([0-9]*)", RegexOption.IGNORE_CASE)

internal sealed class OverlayRange {
    data class Partial(val start: Long, val endInclusive: Long) : OverlayRange()
    object Unsatisfiable : OverlayRange()
}

// A malformed or unsupported (including multipart) Range is ignored.
internal fun parseOverlayRange(value: String?, size: Long): OverlayRange? {
    if (value == null || value.length > 256) return null
    val match = overlayRangePattern.matchEntire(value.trim()) ?: return null
    val (first, last) = match.destructured
    if (first.isEmpty() && last.isEmpty()) return null

    val length = BigInteger.valueOf(size)
    if (first.isEmpty()) {
        val suffix = BigInteger(last)
        if (size == 0L || suffix.signum() == 0) return OverlayRange.Unsatisfiable
        return OverlayRange.Partial(size - suffix.min(length).toLong(), size - 1)
    }
    val start = BigInteger(first)
    val end = if (last.isEmpty()) null else BigInteger(last)
    if (end != null && end < start) return null
    if (start >= length) return OverlayRange.Unsatisfiable
    val finalByte = BigInteger.valueOf(size - 1)
    return OverlayRange.Partial(start.toLong(), (end?.min(finalByte) ?: finalByte).toLong())
}


internal data class OverlayReply(
    val status: Int,
    val reason: String,
    val offset: Long,
    val contentLength: Long,
    val contentRange: String?,
    val sendBody: Boolean
)

internal fun planOverlayReply(head: Boolean, rangeHeader: String?, ifRangeHeader: String?, size: Long): OverlayReply {
    // No strong validator is published for mutable overlays, so do not apply If-Range.
    return when (val range = if (head || ifRangeHeader != null) null else parseOverlayRange(rangeHeader, size)) {
        OverlayRange.Unsatisfiable -> OverlayReply(416, "Range Not Satisfiable", 0, 0, "bytes */" + size, false)
        is OverlayRange.Partial -> OverlayReply(
            206, "Partial Content", range.start, range.endInclusive - range.start + 1,
            "bytes " + range.start + "-" + range.endInclusive + "/" + size, true
        )
        null -> OverlayReply(200, "OK", 0, size, null, !head)
    }
}

internal class OverlayBody(private val file: FileInputStream, private var remaining: Long) : InputStream() {
    override fun read(): Int {
        if (remaining == 0L) return -1
        val value = file.read()
        if (value >= 0) remaining--
        return value
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (offset < 0 || length < 0 || offset > buffer.size - length) throw IndexOutOfBoundsException()
        if (length == 0) return 0
        if (remaining == 0L) return -1
        val count = file.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
        if (count > 0) remaining -= count.toLong()
        return count
    }

    override fun available(): Int = minOf(file.available().toLong(), remaining).toInt()

    override fun close() = file.close()
}
`;
const overlayJvmTest = `package com.openwebgal.demo

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile

class OverlayHttpTest {
    @Test fun resolveClosedOpenAndSuffixRanges() {
        assertEquals(OverlayRange.Partial(4, 7), parseOverlayRange("bytes=4-7", 16))
        assertEquals(OverlayRange.Partial(4, 15), parseOverlayRange("bytes=4-", 16))
        assertEquals(OverlayRange.Partial(13, 15), parseOverlayRange("BYTES=-3", 16))
        assertEquals(OverlayRange.Partial(0, 15), parseOverlayRange("bytes=-9999999999999999999999", 16))
        assertEquals(OverlayRange.Partial(14, 15), parseOverlayRange("bytes=14-9999999999999999999999", 16))
        assertEquals(OverlayRange.Partial(14, 15), parseOverlayRange("bytes=014-015", 16))
    }

    @Test fun distinguishMalformedFromUnsatisfiable() {
        for (header in listOf(null, "bytes=-", "bytes=5-4", "bytes=+1-2", "bytes=١-٢",
            "bytes=1-2,4-5", "items=0-1", "bytes=1 -2")) {
            assertNull(header, parseOverlayRange(header, 16))
        }
        assertEquals(OverlayRange.Unsatisfiable, parseOverlayRange("bytes=16-", 16))
        assertEquals(OverlayRange.Unsatisfiable, parseOverlayRange("bytes=9999999999999999999999-", 16))
        assertEquals(OverlayRange.Unsatisfiable, parseOverlayRange("bytes=-0", 16))
        assertEquals(OverlayRange.Unsatisfiable, parseOverlayRange("bytes=0-", 0))
    }

    @Test fun planHttpStatusHeadersAndBody() {
        assertEquals(OverlayReply(206, "Partial Content", 4, 4, "bytes 4-7/16", true),
            planOverlayReply(false, "bytes=4-7", null, 16))
        assertEquals(OverlayReply(416, "Range Not Satisfiable", 0, 0, "bytes */16", false),
            planOverlayReply(false, "bytes=16-", null, 16))
        assertEquals(OverlayReply(200, "OK", 0, 16, null, false),
            planOverlayReply(true, "bytes=4-7", null, 16))
        assertEquals(OverlayReply(200, "OK", 0, 16, null, true),
            planOverlayReply(false, "bytes=4-7", "old-validator", 16))
        assertEquals(OverlayReply(200, "OK", 0, 16, null, true),
            planOverlayReply(false, "bytes=5-4", null, 16))
    }

    @Test fun boundReadsAndReopenAfterSamePathUpdate() {
        val file = File.createTempFile("webgal-overlay", ".dat")
        try {
            file.writeBytes(ByteArray(16) { it.toByte() })
            FileInputStream(file).let { stream ->
                stream.channel.position(4)
                OverlayBody(stream, 4).use { body ->
                    val bytes = ByteArray(8)
                    assertEquals(4, body.available())
                    assertEquals(4, body.read(bytes, 2, 6))
                    assertArrayEquals(byteArrayOf(0, 0, 4, 5, 6, 7, 0, 0), bytes)
                    assertEquals(0, body.read(bytes, 0, 0))
                    assertEquals(-1, body.read())
                }
            }
            file.writeBytes(byteArrayOf(91, 92))
            OverlayBody(FileInputStream(file), 2).use { body ->
                assertArrayEquals(byteArrayOf(91, 92), body.readBytes())
            }
        } finally {
            file.delete()
        }
    }

    @Test fun byteOffsetBeyondIntMaxUsesLongWithoutAllocatingEntireFile() {
        val file = File.createTempFile("webgal-overlay", ".dat")
        try {
            val offset = Int.MAX_VALUE.toLong() + 10
            RandomAccessFile(file, "rw").use {
                it.seek(offset)
                it.write(byteArrayOf(55, 56, 57))
            }
            assertEquals(OverlayRange.Partial(offset, offset + 1), parseOverlayRange("bytes=" + offset + "-" + (offset + 1), file.length()))
            FileInputStream(file).let { stream ->
                stream.channel.position(offset)
                OverlayBody(stream, 2).use { body -> assertArrayEquals(byteArrayOf(55, 56), body.readBytes()) }
            }
        } finally {
            file.delete()
        }
    }
}
`;
const kotlinSource = 'app/src/main/java/com/openwebgal/demo/OverlayHttp.kt';
const testSource = 'app/src/test/java/com/openwebgal/demo/OverlayHttpTest.kt';
fs.mkdirSync(path.join(root, path.dirname(testSource)), { recursive: true });
write(kotlinSource, overlayJvm);
write(testSource, overlayJvmTest);

console.log('Applied large-content Android overlay and packaging policy.');
