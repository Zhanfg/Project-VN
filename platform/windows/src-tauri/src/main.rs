#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};
use tauri::{
    http::{header, Request, Response, StatusCode},
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
    let raw_path = request.uri().path().trim_start_matches('/');
    let decoded = percent_decode_str(raw_path).decode_utf8_lossy();
    let relative = Path::new(decoded.as_ref());

    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return response(StatusCode::FORBIDDEN, "text/plain", b"forbidden".to_vec());
    }

    let target = root.join(relative);
    let metadata = match fs::metadata(&target) {
        Ok(value) if value.is_file() => value,
        _ => return response(StatusCode::NOT_FOUND, "text/plain", b"not found".to_vec()),
    };

    let file_size = metadata.len();
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, file_size));

    if range.is_none() && file_size > MAX_NON_RANGE_READ {
        return Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes */{}", file_size))
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(Vec::new())
            .unwrap();
    }

    let (start, requested_end, status) = match range {
        Some((start, end)) => (start, end, StatusCode::PARTIAL_CONTENT),
        None => (0, file_size.saturating_sub(1), StatusCode::OK),
    };
    // Custom-protocol responses use an in-memory body. Clamp each ranged response
    // so a client asking for a huge span cannot force a multi-GB allocation.
    let end = if status == StatusCode::PARTIAL_CONTENT {
        requested_end.min(start.saturating_add(MAX_RANGE_CHUNK - 1))
    } else {
        requested_end
    };

    let length = if file_size == 0 { 0 } else { end - start + 1 };
    let mut file = match File::open(&target) {
        Ok(file) => file,
        Err(_) => return response(StatusCode::NOT_FOUND, "text/plain", b"not found".to_vec()),
    };

    if start > 0 && file.seek(SeekFrom::Start(start)).is_err() {
        return response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "text/plain",
            b"seek failed".to_vec(),
        );
    }

    let mut body = vec![0u8; length as usize];
    if length > 0 && file.read_exact(&mut body).is_err() {
        return response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "text/plain",
            b"read failed".to_vec(),
        );
    }

    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_for(&target))
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cache-Control", "public, max-age=31536000, immutable");

    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, end, file_size),
        );
    }

    builder.body(body).unwrap()
}

fn parse_range(value: &str, file_size: u64) -> Option<(u64, u64)> {
    if file_size == 0 {
        return None;
    }

    let bytes = value.strip_prefix("bytes=")?;
    let first = bytes.split(',').next()?.trim();
    let (start_raw, end_raw) = first.split_once('-')?;

    if start_raw.is_empty() {
        let suffix = end_raw.parse::<u64>().ok()?.min(file_size);
        if suffix == 0 {
            return None;
        }
        return Some((file_size - suffix, file_size - 1));
    }

    let start = start_raw.parse::<u64>().ok()?;
    if start >= file_size {
        return None;
    }

    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw.parse::<u64>().ok()?.min(file_size - 1)
    };

    if end < start {
        return None;
    }
    Some((start, end))
}

fn response(status: StatusCode, mime: &'static str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, body.len().to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body)
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
