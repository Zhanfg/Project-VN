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
    'import android.webkit.*\nimport android.widget.Toast\nimport java.io.File\nimport java.io.FileInputStream',
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
     *   1. filesDir/game-data/*
     *   2. APK assets via WebViewAssetLoader
     */
    private fun externalGameDataResponse(request: WebResourceRequest): WebResourceResponse? {
        val prefix = "/assets/webgal/game/"
        val requestPath = Uri.decode(request.url.path ?: return null)
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

        return WebResourceResponse(mime, null, FileInputStream(target)).apply {
            responseHeaders = mapOf(
                "Cache-Control" to "public, max-age=31536000, immutable",
                "X-After-School-Asset-Source" to "external-game-data"
            )
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
    'https\\://mirrors.aliyun.com/gradle/distributions/',
    'https\\://services.gradle.org/distributions/',
    'official Gradle distribution',
  );
  write(file, source);
}

console.log('Applied large-content Android overlay and packaging policy.');
