#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};
use tauri::{
    http::{header, Method, Request, Response, StatusCode},
    WebviewUrl, WebviewWindowBuilder,
};

const GAME_PROTOCOL_HOST: &str = "http://after-school-game.localhost/";
const MAX_NON_RANGE_READ: u64 = 128 * 1024 * 1024;
const MAX_RANGE_CHUNK: u64 = 16 * 1024 * 1024;

fn main() {
    let game_data_root = game_data_root();

    tauri::Builder::default()
        .register_uri_scheme_protocol("after-school-game", move |_ctx, request| {
            serve_game_data(&game_data_root, request)
        })
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("放学后")
                .inner_size(1280.0, 720.0)
                .min_inner_size(960.0, 540.0)
                .resizable(true)
                .initialization_script(
                    "window.__AFTER_SCHOOL_GAME_BASE__ = 'http://after-school-game.localhost/';",
                )
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run After School");
}

fn game_data_root() -> PathBuf {
    let exe = std::env::current_exe().expect("cannot resolve executable path");
    exe.parent()
        .expect("executable has no parent directory")
        .join("game-data")
}

fn serve_game_data(root: &Path, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let head = request.method() == Method::HEAD;
    if !head && request.method() != Method::GET {
        return Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header(header::ALLOW, "GET, HEAD")
            .header(header::CONTENT_LENGTH, "0")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::CACHE_CONTROL, "no-store")
            .body(Vec::new())
            .unwrap();
    }

    let raw_path = request.uri().path().trim_start_matches('/');
    let decoded = match percent_decode_str(raw_path).decode_utf8() {
        Ok(value) => value,
        Err(_) => return error_response(StatusCode::BAD_REQUEST, b"invalid path", head),
    };
    let relative = Path::new(decoded.as_ref());
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return error_response(StatusCode::FORBIDDEN, b"forbidden", head);
    }

    let root = match fs::canonicalize(root) {
        Ok(value) => value,
        Err(_) => return error_response(StatusCode::NOT_FOUND, b"not found", head),
    };
    let target = match fs::canonicalize(root.join(relative)) {
        Ok(value) if value.starts_with(&root) => value,
        Ok(_) => return error_response(StatusCode::FORBIDDEN, b"forbidden", head),
        Err(_) => return error_response(StatusCode::NOT_FOUND, b"not found", head),
    };
    let mut file = match File::open(&target) {
        Ok(value) => value,
        Err(_) => return error_response(StatusCode::NOT_FOUND, b"not found", head),
    };
    // Metadata belongs to the same handle used for data, including after a
    // same-path pack replacement.
    let file_size = match file.metadata() {
        Ok(value) if value.is_file() => value.len(),
        _ => return error_response(StatusCode::NOT_FOUND, b"not found", head),
    };

    if head {
        return game_response(StatusCode::OK, relative, file_size, None, Vec::new());
    }

    // No validator is emitted for live pack files, so If-Range cannot match.
    // Multiple Range field lines, like a comma-separated multi-range, are
    // deliberately unsupported rather than silently taking the first range.
    let range = if request.headers().contains_key(header::IF_RANGE)
        || request.headers().get_all(header::RANGE).iter().count() > 1
    {
        ByteRange::Ignored
    } else {
        request
            .headers()
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
            .map_or(ByteRange::Ignored, |value| parse_range(value, file_size))
    };

    let (start, length, status, content_range) = match range {
        ByteRange::Unsatisfiable => return unsatisfiable(file_size),
        ByteRange::Ignored if file_size > MAX_NON_RANGE_READ => return unsatisfiable(file_size),
        ByteRange::Ignored => (0, file_size, StatusCode::OK, None),
        ByteRange::Satisfiable { start, end } => {
            let end = end.min(start.saturating_add(MAX_RANGE_CHUNK - 1));
            (
                start,
                end - start + 1,
                StatusCode::PARTIAL_CONTENT,
                Some(format!("bytes {}-{}/{}", start, end, file_size)),
            )
        }
    };

    if start > 0 && file.seek(SeekFrom::Start(start)).is_err() {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, b"seek failed", false);
    }

    // The full and partial paths are capped at 128 MiB and 16 MiB respectively.
    let mut body = vec![0u8; length as usize];
    if file.read_exact(&mut body).is_err() {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, b"read failed", false);
    }

    game_response(status, relative, length, content_range, body)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ByteRange {
    Ignored,
    Unsatisfiable,
    Satisfiable { start: u64, end: u64 },
}

fn decimal(value: &str) -> Option<&str> {
    if value.is_empty() || !value.bytes().all(|digit| digit.is_ascii_digit()) {
        return None;
    }
    let trimmed = value.trim_start_matches('0');
    Some(if trimmed.is_empty() { "0" } else { trimmed })
}

fn parse_range(value: &str, file_size: u64) -> ByteRange {
    let Some((unit, specifier)) = value.trim().split_once('=') else {
        return ByteRange::Ignored;
    };
    if !unit.eq_ignore_ascii_case("bytes") || specifier.contains(',') {
        return ByteRange::Ignored;
    }
    let Some((start_raw, end_raw)) = specifier.split_once('-') else {
        return ByteRange::Ignored;
    };

    if start_raw.is_empty() {
        let Some(suffix) = decimal(end_raw) else {
            return ByteRange::Ignored;
        };
        // Values overflowing u64 can still express a suffix covering the file.
        let suffix = suffix.parse::<u64>().unwrap_or(u64::MAX).min(file_size);
        if suffix == 0 {
            return ByteRange::Unsatisfiable;
        }
        return ByteRange::Satisfiable {
            start: file_size - suffix,
            end: file_size - 1,
        };
    }

    let Some(start) = decimal(start_raw) else {
        return ByteRange::Ignored;
    };
    let end = if end_raw.is_empty() {
        None
    } else {
        let Some(end) = decimal(end_raw) else {
            return ByteRange::Ignored;
        };
        // Compare decimal tokens without overflowing, before clamping to EOF.
        if (end.len(), end) < (start.len(), start) {
            return ByteRange::Ignored;
        }
        Some(end)
    };
    let Ok(start) = start.parse::<u64>() else {
        return ByteRange::Unsatisfiable;
    };
    if start >= file_size {
        return ByteRange::Unsatisfiable;
    }

    ByteRange::Satisfiable {
        start,
        end: end
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(u64::MAX)
            .min(file_size - 1),
    }
}

fn game_response(
    status: StatusCode,
    path: &Path,
    length: u64,
    content_range: Option<String>,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_for(path))
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        // A pack update may replace a file without changing its URL.
        .header(header::CACHE_CONTROL, "no-store");
    if let Some(value) = content_range {
        builder = builder.header(header::CONTENT_RANGE, value);
    }
    builder.body(body).unwrap()
}

fn unsatisfiable(file_size: u64) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_RANGE, format!("bytes */{}", file_size))
        .header(header::CONTENT_LENGTH, "0")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .unwrap()
}

fn error_response(status: StatusCode, message: &'static [u8], head: bool) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_LENGTH, message.len().to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(if head { Vec::new() } else { message.to_vec() })
        .unwrap()
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" => "text/plain; charset=utf-8",
        "json" => "application/json",
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "html" => "text/html; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "mp3" => "audio/mpeg",
        "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static STAGE_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestGameData(PathBuf);

    impl TestGameData {
        fn new() -> Self {
            let base = std::env::temp_dir();
            loop {
                let id = STAGE_ID.fetch_add(1, Ordering::Relaxed);
                let path = base.join(format!("after-school-game-data-{}-{id}", std::process::id()));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("could not create test game data: {error}"),
                }
            }
        }

        fn request(&self, method: Method, asset: &str, range: Option<&str>) -> Response<Vec<u8>> {
            let mut builder = Request::builder()
                .method(method)
                .uri(format!("{GAME_PROTOCOL_HOST}{asset}"));
            if let Some(value) = range {
                builder = builder.header(header::RANGE, value);
            }
            serve_game_data(&self.0, builder.body(Vec::new()).unwrap())
        }
    }

    impl Drop for TestGameData {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn same_path_reads_current_pack_bytes_and_never_stores() {
        let game = TestGameData::new();
        let path = game.0.join("scene.mp4");
        fs::write(&path, b"first pack").unwrap();

        let first = game.request(Method::GET, "scene.mp4", None);
        assert_eq!(first.status(), StatusCode::OK);
        assert_eq!(first.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(first.headers()[header::CONTENT_TYPE], "video/mp4");
        assert_eq!(first.body().as_slice(), b"first pack");

        let replacement = game.0.join("replacement.mp4");
        fs::write(&replacement, b"second pack").unwrap();
        fs::remove_file(&path).unwrap();
        fs::rename(replacement, &path).unwrap();

        let second = game.request(Method::GET, "scene.mp4", None);
        assert_eq!(second.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(second.headers()[header::CONTENT_LENGTH], "11");
        assert_eq!(second.body().as_slice(), b"second pack");
    }

    #[test]
    fn single_ranges_read_the_right_bytes_and_eof() {
        let game = TestGameData::new();
        fs::write(game.0.join("voice.ogg"), b"0123456789").unwrap();
        for (range, content_range, body) in [
            ("bytes=3-6", "bytes 3-6/10", &b"3456"[..]),
            ("bytes=7-", "bytes 7-9/10", &b"789"[..]),
            ("bytes=-2", "bytes 8-9/10", &b"89"[..]),
            ("bytes=8-999", "bytes 8-9/10", &b"89"[..]),
        ] {
            let response = game.request(Method::GET, "voice.ogg", Some(range));
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.headers()[header::CONTENT_RANGE], content_range);
            assert_eq!(response.body().as_slice(), body);
            assert_eq!(response.headers()[header::CONTENT_LENGTH].to_str().unwrap(), body.len().to_string());
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        }
    }

    #[test]
    fn malformed_is_ignored_but_valid_unsatisfiable_is_416() {
        let game = TestGameData::new();
        fs::write(game.0.join("scene.mp4"), b"0123456789").unwrap();
        for range in ["bytes=abc-", "bytes=8-2", "bytes=1-3,8-9", "items=1-2"] {
            let response = game.request(Method::GET, "scene.mp4", Some(range));
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.body().as_slice(), b"0123456789");
            assert!(!response.headers().contains_key(header::CONTENT_RANGE));
        }
        for range in ["bytes=10-", "bytes=-0", "bytes=99999999999999999999999999-"] {
            let response = game.request(Method::GET, "scene.mp4", Some(range));
            assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
            assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */10");
            assert!(response.body().is_empty());
        }
        assert_eq!(
            parse_range("ByTeS=0008-99999999999999999999999999", 10),
            ByteRange::Satisfiable { start: 8, end: 9 }
        );
    }

    #[test]
    fn head_excludes_body_and_ignores_range() {
        let game = TestGameData::new();
        fs::write(game.0.join("scene.mp4"), b"0123456789").unwrap();
        let response = game.request(Method::HEAD, "scene.mp4", Some("bytes=1-3"));
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "10");
        assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
        assert!(!response.headers().contains_key(header::CONTENT_RANGE));
        assert!(response.body().is_empty());

        let missing = game.request(Method::HEAD, "not-here.mp4", None);
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        assert!(missing.body().is_empty());
    }

    #[test]
    fn large_file_is_never_materialized_as_a_full_get() {
        let game = TestGameData::new();
        let size = MAX_NON_RANGE_READ + 1;
        File::create(game.0.join("large.mp4")).unwrap().set_len(size).unwrap();
        let whole = game.request(Method::GET, "large.mp4", None);
        assert_eq!(whole.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert!(whole.body().is_empty());

        let head = game.request(Method::HEAD, "large.mp4", None);
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[header::CONTENT_LENGTH].to_str().unwrap(), size.to_string());
        assert!(head.body().is_empty());

        let partial = game.request(Method::GET, "large.mp4", Some("bytes=1-"));
        assert_eq!(partial.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(partial.body().len() as u64, MAX_RANGE_CHUNK);
        assert_eq!(
            partial.headers()[header::CONTENT_RANGE].to_str().unwrap(),
            format!("bytes 1-{MAX_RANGE_CHUNK}/{size}")
        );
    }
}
