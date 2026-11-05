/**
 * Master-Display — Tauri 2 uygulama giriş noktası
 *
 * Arayüz (ui/index.html + bundle.js) WebView içinde çalışır.
 *
 * Rust'ın devraldığı işler:
 *  - Loop video klasörünü bulup asset protocol ile servis etmek
 *  - LED (display) penceresini gerçek bir WebviewWindow olarak açmak
 *    (window.open WebView2'de çalışmaz)
 *  - Master <-> Display arasındaki state senkronunu event rölesi ile
 *    yapmak (BroadcastChannel ayrı WebView'lar arasında çalışmaz)
 *  - Medya dosyalarını parça parça diske yazmak (Base64 şişmesi olmadan)
 */

use std::io::{Seek, SeekFrom, Write};
use std::path::PathBuf;

use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Loop video klasörünü bulur.
///
/// Arama sırası:
/// 1. `MASTER_DISPLAY_LOOP_DIR` ortam değişkeni (açık geçersiz kılma)
/// 2. Exe'nin yanındaki `loop/` veya `ui/loop/` (kurulum: dosyalar exe yanında)
/// 3. Dev modunda exe dizininden yukarı doğru yürüyerek `ui/loop/` arar
fn resolve_loop_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("MASTER_DISPLAY_LOOP_DIR") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Some(p);
        }
    }

    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;

    for cand in ["loop", "ui/loop"] {
        let p = exe_dir.join(cand);
        if p.is_dir() {
            return Some(p);
        }
    }

    for anc in exe_dir.ancestors().skip(1).take(8) {
        for cand in ["ui/loop", "loop"] {
            let p = anc.join(cand);
            if p.is_dir() {
                return Some(p);
            }
        }
    }

    None
}

/// Loop video klasörünün mutlak yolunu arayüze döndürür.
/// Arayüz bu yolu `convertFileSrc` ile asset protocol URL'sine çevirir.
#[tauri::command]
fn get_loop_dir() -> Option<String> {
    resolve_loop_dir().map(|p| p.to_string_lossy().to_string())
}

/// Proje kök klasörünü bulur (içinde `loop/` bulunan dizin).
fn resolve_project_root() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("MASTER_DISPLAY_ROOT") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Some(p);
        }
    }

    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;

    // Exe yanında veya üst dizinlerde `loop` klasörünü ara
    for anc in exe_dir.ancestors().take(9) {
        for cand in ["", "ui"] {
            let base = if cand.is_empty() { anc.to_path_buf() } else { anc.join(cand) };
            if let Some(loop_dir) = base.join("loop").to_str() {
                if std::path::Path::new(loop_dir).is_dir() {
                    return Some(base);
                }
            }
        }
    }
    None
}

fn media_ext_ok(ext: &str) -> bool {
    matches!(
        ext,
        "mp4" | "webm" | "mov" | "mkv" | "avi" | "m4v"
            | "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac"
            | "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg"
    )
}

/// Bir klasördeki (alt klasörler dahil) tüm medya dosyalarını listeler.
///
/// `dir_name`: kök klasördeki ad, örn. "loop" veya "Beat".
/// Dönen her kayıt: `{ rel, name, folder, size }`
///  - `rel`    : kök klasöre göre göreli yol ("alt klasör/video.mp4")
///  - `name`   : dosya adı
///  - `folder` : ilk alt klasör adı (kök dosyalar için boş)
///  - `size`   : bayt
///
/// Böylece loop listesi ön tanımlı değildir: klasöre ne eklersen arayüzde görünür.
#[tauri::command]
fn list_media_dir(dir_name: String) -> Result<Vec<Value>, String> {
    // Yol geçişini engelle: yalnızca sade bir klasör adı kabul et
    if dir_name.is_empty()
        || dir_name.contains("..")
        || dir_name.contains('/')
        || dir_name.contains('\\')
        || dir_name.contains(':')
    {
        return Err("Geçersiz klasör adı".into());
    }

    let root = resolve_project_root().ok_or_else(|| "Proje kök klasörü bulunamadı".to_string())?;
    let base = root.join(&dir_name);
    if !base.is_dir() {
        return Ok(Vec::new());
    }

    let mut out: Vec<Value> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![base.clone()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !media_ext_ok(&ext) {
                continue;
            }
            let rel = match path.strip_prefix(&base) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => continue,
            };
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let folder = rel.split('/').next().unwrap_or("").to_string();
            let folder = if rel.contains('/') { folder } else { String::new() };
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

            out.push(serde_json::json!({
                "rel": rel,
                "name": name,
                "folder": folder,
                "size": size,
                "abs": path.to_string_lossy().to_string()
            }));
        }
    }

    // Doğal sıralama: klasör, sonra dosya adı
    out.sort_by(|a, b| {
        let fa = a.get("folder").and_then(|v| v.as_str()).unwrap_or("");
        let fb = b.get("folder").and_then(|v| v.as_str()).unwrap_or("");
        let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        fa.to_lowercase().cmp(&fb.to_lowercase()).then(na.to_lowercase().cmp(&nb.to_lowercase()))
    });

    Ok(out)
}

/// Dışa aktarılan dosya adı için güvenli ama okunaklı ad üretir.
///
/// Yalnızca Windows'ta yasak karakterleri değiştirir; Türkçe harfler korunur
/// (NTFS UTF-8 dosya adlarını destekler). `sanitize_media_name` ASCII'ye
/// indirgediği için dışa aktarmada kullanılmaz.
fn safe_display_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => out.push('_'),
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    let trimmed = out.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "cikti.pdf".to_string()
    } else {
        trimmed
    }
}

/// Bir medya/PDF dosyasını Masaüstü'ne kopyalar.
///
/// `source` bir disk yolu ya da asset URL'si olabilir. `save_name` verilmezse
/// kaynak dosyanın adı kullanılır. Dönen değer: yazılan dosyanın tam yolu.
///
/// (Dosya seçme penceresi yerine Masaüstü kullanılıyor: ek bağımlılık yok ve
///  operatör dosyayı hemen bulur.)
#[tauri::command]
fn export_media_to_desktop(
    app: tauri::AppHandle,
    source: String,
    save_name: Option<String>,
) -> Result<String, String> {
    let mut src = source.trim().to_string();
    if let Some(rest) = src
        .strip_prefix("http://asset.localhost/")
        .or_else(|| src.strip_prefix("https://asset.localhost/"))
        .or_else(|| src.strip_prefix("asset://localhost/"))
    {
        src = percent_decode(rest);
    }
    if let Some(i) = src.find(['?', '#']) {
        src.truncate(i);
    }
    let src_path = std::path::Path::new(&src);
    if !src_path.is_file() {
        return Err("Kaynak dosya bulunamadı".into());
    }

    let desktop = app
        .path()
        .desktop_dir()
        .map_err(|e| format!("Masaüstü klasörü bulunamadı: {e}"))?;

    let fallback_name = src_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "cikti.pdf".to_string());
    let mut name = safe_display_name(
        save_name.as_deref().unwrap_or(&fallback_name),
    );
    // Uzantı yoksa kaynaktan al
    if std::path::Path::new(&name).extension().is_none() {
        if let Some(ext) = src_path.extension() {
            name.push('.');
            name.push_str(&ext.to_string_lossy());
        }
    }

    // Aynı ad varsa " (2)", " (3)" ... ekle (üzerine yazma)
    let mut dest = desktop.join(&name);
    let stem = std::path::Path::new(&name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "cikti".to_string());
    let ext = std::path::Path::new(&name)
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut n = 2;
    while dest.exists() {
        let candidate = if ext.is_empty() {
            format!("{stem} ({n})")
        } else {
            format!("{stem} ({n}).{ext}")
        };
        dest = desktop.join(candidate);
        n += 1;
        if n > 999 {
            return Err("Hedef dosya adı üretilemedi".into());
        }
    }

    std::fs::copy(src_path, &dest).map_err(|e| format!("Kopyalanamadı: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// LED / sahne çıkış penceresini açar.
///
/// Küçük ve normal çerçeveli açılır: kullanıcı pencereyi istediği monitöre
/// sürükler, sonra çift tıklayarak / F11 ile tam ekran yapar.
/// (Laptoptaki testlerde zorla tam ekran açmak kullanışsızdı.)
#[tauri::command]
async fn open_display_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("display") {
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "display",
        WebviewUrl::App("index.html?screen=1".into()),
    )
    .title("LED Ekran Çıkışı — çift tık veya F11 ile tam ekran")
    .inner_size(960.0, 540.0)
    .min_inner_size(480.0, 270.0)
    .decorations(true)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let _ = window.set_focus();

    // Master hemen "bağlı" görsün (ilk heartbeati beklemeden) ve güncel state'i yollasın
    let _ = app.emit("md-display-status", serde_json::json!({ "connected": true }));

    Ok(())
}

/// LED penceresinin tam ekran durumunu değiştirir.
/// HTML tam ekranı yerine pencere tam ekranı kullanılır: daha güvenilir ve
/// Esc/F11 ile simetrik çalışır. Dönen değer: yeni tam ekran durumu.
#[tauri::command]
fn toggle_display_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("display") {
        let is_fs = w.is_fullscreen().unwrap_or(false);
        let next = !is_fs;
        w.set_fullscreen(next).map_err(|e| e.to_string())?;
        return Ok(next);
    }
    Ok(false)
}

/// LED penceresini tam ekrandan çıkarır (Esc).
#[tauri::command]
fn exit_display_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("display") {
        if w.is_fullscreen().unwrap_or(false) {
            w.set_fullscreen(false).map_err(|e| e.to_string())?;
        }
    }
    Ok(false)
}

/// Display penceresini kapatır.
#[tauri::command]
fn close_display_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("display") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// LED penceresinin "Daima Üstte" (Always on Top) durumunu değiştirir (toggle).
#[tauri::command]
fn toggle_display_always_on_top(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("display") {
        let is_top = w.is_always_on_top().unwrap_or(false);
        let next = !is_top;
        w.set_always_on_top(next).map_err(|e| e.to_string())?;
        return Ok(next);
    }
    Ok(false)
}

/// LED penceresinin "Daima Üstte" (Always on Top) durumunu doğrudan belirler.
#[tauri::command]
fn set_display_always_on_top(app: tauri::AppHandle, always_on_top: bool) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("display") {
        w.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
        return Ok(always_on_top);
    }
    Ok(false)
}

/// Master'dan gelen state paketini tüm pencerelere yayar.
/// (BroadcastChannel'ın ayrı WebView'lar arasında çalışmaması nedeniyle)
#[tauri::command]
fn sync_broadcast(app: tauri::AppHandle, payload: Value) {
    let _ = app.emit("md-sync", payload);
}

/// Display penceresinden gelen canlılık sinyali (heartbeat).
#[tauri::command]
fn display_heartbeat(app: tauri::AppHandle) {
    let _ = app.emit("md-display-status", serde_json::json!({ "connected": true }));
}

// ---------------------------------------------------------------------------
// MEDYA İÇE AKTARMA (Blob/Base64 yerine disk + asset protocol)
// ---------------------------------------------------------------------------
//
// Kullanıcı arayüzden dosya seçtiğinde dosya JS tarafında metne (Base64)
// dönüştürülmez. Ham baytlar parçalar halinde raw IPC gövdesiyle buraya
// gönderilir, uygulama önbellek klasörüne yazılır ve yolu döndürülür.
// Arayüz yolu `convertFileSrc` ile asset URL'sine çevirir; böylece:
//  - Büyük dosyalar RAM'e tamamen alınmaz (parça parça okunur)
//  - Her iki pencere de aynı URL'den diskten akış (streaming) ile oynatır
//  - State paketleri kısa kalır (data: URL yerine ~120 karakterlik yol)

/// Dosya adını dosya sistemi için güvenli hale getirir.
fn sanitize_media_name(name: &str) -> String {
    let mut cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    while cleaned.starts_with('.') {
        cleaned.remove(0);
    }
    if cleaned.is_empty() {
        "medya.bin".to_string()
    } else {
        cleaned
    }
}

/// Medya dosyalarının yazıldığı önbellek klasörünü hazırlar.
fn media_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Önbellek klasörü bulunamadı: {e}"))?;
    let dir = base.join("media");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Medya klasörü oluşturulamadı: {e}"))?;
    Ok(dir)
}

/// Ham baytları parçalar halinde önbelleğe yazar.
///
/// Gövde biçimi: `[4 bayt: başlık uzunluğu][JSON başlık][veri]`
/// Başlık: `{ "id": "m1a2b3", "name": "toren.mp4", "offset": 0, "final": true }`
///
/// `final` olan parçada dosya yolu döner; ara parçalarda boş string döner.
#[tauri::command]
fn media_import_chunk(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
    let raw = match request.body() {
        InvokeBody::Raw(v) => v.as_slice(),
        _ => return Err("Ham gövde bekleniyordu (Uint8Array gönderin)".into()),
    };

    if raw.len() < 4 {
        return Err("Geçersiz medya paketi".into());
    }
    let header_len = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]) as usize;
    if header_len == 0 || header_len > 8192 || 4 + header_len > raw.len() {
        return Err("Geçersiz medya başlığı".into());
    }

    let meta: Value = serde_json::from_slice(&raw[4..4 + header_len])
        .map_err(|e| format!("Medya başlığı çözülemedi: {e}"))?;
    let data = &raw[4 + header_len..];

    let id = meta
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>();
    if id.is_empty() {
        return Err("Geçersiz medya kimliği".into());
    }
    let name = sanitize_media_name(meta.get("name").and_then(|v| v.as_str()).unwrap_or("medya.bin"));
    let offset = meta.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
    let is_final = meta.get("final").and_then(|v| v.as_bool()).unwrap_or(false);

    let path = media_cache_dir(&app)?.join(format!("{id}_{name}"));

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&path)
        .map_err(|e| format!("Medya dosyası açılamadı: {e}"))?;
    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Medya konumlanamadı: {e}"))?;
    }
    file.write_all(data)
        .map_err(|e| format!("Medya yazılamadı: {e}"))?;
    drop(file);

    if is_final {
        Ok(path.to_string_lossy().to_string())
    } else {
        Ok(String::new())
    }
}

/// Önbellekte artık kullanılmayan medya dosyalarını siler.
///
/// Her içe aktarma yeni bir dosya adı ürettiği için (yeniden onarım dahil)
/// klasör zamanla şişer. Arayüz, kayıtlı akıştaki geçerli yolları gönderir;
/// listede olmayan dosyalar silinir.
///
/// GÜVENLİK: Yeni yazılan bir dosya, URL'si arayüz durumuna yazılmadan önce
/// "sahipsiz" görünebilir. Bu yüzden son 60 saniyede değişmiş dosyalara
/// dokunulmaz — içe aktarma sürerken temizlik çalışsa bile veri kaybolmaz.
#[tauri::command]
fn media_cache_cleanup(app: tauri::AppHandle, keep: Vec<String>) -> u32 {
    let dir = match media_cache_dir(&app) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    // Korunacaklar: girişler hem disk yolu hem "asset URL" olabilir.
    // URL'ler percent-encoded olduğu için önce çözülür, sonra dosya adı alınır.
    let keep_set: std::collections::HashSet<String> = keep
        .iter()
        .map(|p| {
            let mut s = p.trim().to_string();
            if let Some(rest) = s
                .strip_prefix("http://asset.localhost/")
                .or_else(|| s.strip_prefix("https://asset.localhost/"))
                .or_else(|| s.strip_prefix("asset://localhost/"))
            {
                s = percent_decode(rest);
            }
            if let Some(i) = s.find(['?', '#']) {
                s.truncate(i);
            }
            std::path::Path::new(&s)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .filter(|n| !n.is_empty())
        .collect();

    // Yeni yazılmış dosyaları korumak için yaş sınırı
    let min_age = std::time::Duration::from_secs(60);
    let now = std::time::SystemTime::now();

    let mut removed = 0u32;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if name.is_empty() || keep_set.contains(&name) {
                continue;
            }
            // Yalnızca bu uygulamanın ürettiği dosyalara dokun:
            // ad biçimi "<id>_<orijinal ad>", id 'm' ile başlar
            if !name.starts_with('m') {
                continue;
            }
            // Çok yeni dosyalar: içe aktarma sürüyor olabilir → dokunma
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if now.duration_since(modified).unwrap_or(std::time::Duration::ZERO) < min_age {
                        continue;
                    }
                }
            }
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

/// Bir asset URL'sinin ya da disk yolunun hâlâ var olup olmadığını söyler.
///
/// Kayıtlı akış listesi asset URL'leri tutar. Önbellek klasörü silinirse
/// URL'ler ölür; arayüz bu komutla kontrol edip dosyayı IndexedDB'deki
/// asıl kopyasından yeniden yazar (kendini onarma).
#[tauri::command]
fn media_path_exists(input: String) -> bool {
    let mut path = input.trim().to_string();

    if let Some(rest) = path
        .strip_prefix("http://asset.localhost/")
        .or_else(|| path.strip_prefix("https://asset.localhost/"))
        .or_else(|| path.strip_prefix("asset://localhost/"))
    {
        path = percent_decode(rest);
    }

    if path.is_empty() {
        return false;
    }
    std::path::Path::new(&path).is_file()
}

/// Küçük yüzde çözücü (%3A → ':', %5C → '\', %20 → ' ').
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Geçersiz URL formatı".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| -> Option<u8> {
                match b {
                    b'0'..=b'9' => Some(b - b'0'),
                    b'a'..=b'f' => Some(b - b'a' + 10),
                    b'A'..=b'F' => Some(b - b'A' + 10),
                    _ => None,
                }
            };
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(target_os = "windows")]
extern "system" {
    fn SetThreadExecutionState(es_flags: u32) -> u32;
}

#[cfg(target_os = "windows")]
const ES_CONTINUOUS: u32 = 0x8000_0000;
#[cfg(target_os = "windows")]
const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
#[cfg(target_os = "windows")]
const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
#[cfg(target_os = "windows")]
const ES_AWAYMODE_REQUIRED: u32 = 0x0000_0040;

/// Caffeine / Uyanık Kalma: Sistem ve ekran uyku modunu, ekran koruyucuyu engeller.
#[tauri::command]
fn set_keep_awake(enabled: bool) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        if enabled {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED);
        } else {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }
    enabled
}

fn parse_version_tuple(v: &str) -> Vec<u64> {
    let clean = v.trim_start_matches(|c: char| c == 'v' || c == 'V');
    clean
        .split(|c: char| c == '.' || c == '-' || c == '+')
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

fn is_version_newer(current: &str, latest: &str) -> bool {
    let c = parse_version_tuple(current);
    let l = parse_version_tuple(latest);
    let max_len = c.len().max(l.len());
    for i in 0..max_len {
        let cv = c.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        } else if lv < cv {
            return false;
        }
    }
    false
}

/// GitHub Releases üzerinden yeni sürüm kontrolü yapar.
#[tauri::command]
fn check_app_update(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let current_version = app_handle.package_info().version.to_string();
    let url = "https://api.github.com/repos/BeNKaYS/Master-Display/releases/latest";

    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args(["-s", "-H", "User-Agent: Master-Display-Updater", url]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| format!("Güncelleme kontrol komutu çalıştırılamadı: {}", e))?;
    if !output.status.success() {
        return Err("GitHub sunucusuna bağlanılamadı.".into());
    }

    let release: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("GitHub yanıtı okunamadı: {}", e))?;

    if release.get("message").and_then(|m| m.as_str()) == Some("Not Found") {
        return Ok(serde_json::json!({
            "has_update": false,
            "current_version": current_version,
            "message": "GitHub üzerinde yayınlanmış bir sürüm bulunamadı."
        }));
    }

    let tag_name = release.get("tag_name").and_then(|t| t.as_str()).unwrap_or("");
    let latest_version = tag_name.trim_start_matches(|c: char| c == 'v' || c == 'V').to_string();
    let release_name = release.get("name").and_then(|n| n.as_str()).unwrap_or(tag_name).to_string();
    let release_notes = release.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string();
    let html_url = release.get("html_url").and_then(|h| h.as_str()).unwrap_or("https://github.com/BeNKaYS/Master-Display/releases").to_string();
    let published_at = release.get("published_at").and_then(|p| p.as_str()).unwrap_or("").to_string();

    let mut download_url = None;
    let mut asset_size = 0u64;
    let mut asset_name = String::new();

    if let Some(assets) = release.get("assets").and_then(|a| a.as_array()) {
        for asset in assets {
            let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
            if name.ends_with(".exe") || name.ends_with(".msi") {
                download_url = asset.get("browser_download_url").and_then(|u| u.as_str()).map(|s| s.to_string());
                asset_size = asset.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                asset_name = name.to_string();
                if name.contains("Setup") {
                    break;
                }
            }
        }
    }

    let has_update = is_version_newer(&current_version, &latest_version);

    Ok(serde_json::json!({
        "has_update": has_update,
        "current_version": current_version,
        "latest_version": latest_version,
        "tag_name": tag_name,
        "release_name": release_name,
        "release_notes": release_notes,
        "download_url": download_url,
        "asset_size": asset_size,
        "asset_name": asset_name,
        "html_url": html_url,
        "published_at": published_at
    }))
}

/// İndirme ve kurulum işlemini başlatır.
#[tauri::command]
fn download_and_install_update(app_handle: tauri::AppHandle, download_url: String) -> Result<(), String> {
    if !download_url.starts_with("https://github.com/") {
        return Err("Geçersiz indirme adresi. Güvenlik nedeniyle yalnızca GitHub bağlantıları kabul edilir.".into());
    }

    let temp_dir = std::env::temp_dir();
    let target_path = temp_dir.join("Master-Display_Kurulum_Setup_Update.exe");
    let target_str = target_path.to_string_lossy().to_string();

    let app_handle_clone = app_handle.clone();
    let target_path_clone = target_path.clone();

    std::thread::spawn(move || {
        let mut dl_cmd = std::process::Command::new("curl.exe");
        dl_cmd.args(["-L", "-o", &target_str, &download_url]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            dl_cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let res = dl_cmd.status();
        match res {
            Ok(status) if status.success() => {
                let _ = app_handle_clone.emit("update-status", serde_json::json!({
                    "status": "ready",
                    "message": "Kurulum başlatılıyor..."
                }));

                std::thread::sleep(std::time::Duration::from_millis(1000));

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const DETACHED_PROCESS: u32 = 0x00000008;
                    let _ = std::process::Command::new(&target_path_clone)
                        .creation_flags(DETACHED_PROCESS)
                        .spawn();
                }

                std::thread::sleep(std::time::Duration::from_millis(800));
                app_handle_clone.exit(0);
            }
            _ => {
                let _ = app_handle_clone.emit("update-status", serde_json::json!({
                    "status": "error",
                    "message": "Güncelleme indirilemedi. Lütfen internet bağlantınızı kontrol edin."
                }));
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--autoplay-policy=no-user-gesture-required",
    );
    tauri::Builder::default()
        .on_window_event(|window, event| {
            match (window.label(), event) {
                // LED penceresi kapanınca master'a haber ver: ses reji konsoluna döner
                ("display", tauri::WindowEvent::Destroyed) => {
                    let _ = window.app_handle().emit(
                        "md-display-status",
                        serde_json::json!({ "connected": false }),
                    );
                }
                // Ana pencere kapandıysa uygulamadan tamamen çık:
                // LED penceresi arkada açık kalmasın.
                ("master", tauri::WindowEvent::Destroyed) => {
                    if let Some(display) = window.app_handle().get_webview_window("display") {
                        let _ = display.close();
                    }
                    window.app_handle().exit(0);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_loop_dir,
            open_display_window,
            close_display_window,
            toggle_display_fullscreen,
            exit_display_fullscreen,
            toggle_display_always_on_top,
            set_display_always_on_top,
            sync_broadcast,
            display_heartbeat,
            media_import_chunk,
            media_path_exists,
            list_media_dir,
            media_cache_cleanup,
            export_media_to_desktop,
            open_external_url,
            set_keep_awake,
            check_app_update,
            download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("Master-Display çalıştırılırken hata oluştu");
}
