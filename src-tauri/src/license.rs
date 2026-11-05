use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// Master-Display Resmi Açık Doğrulama Anahtarı (Public Key)
// Bu anahtar sadece imza doğrulaması yapar, lisans üretemez.
const PUBLIC_KEY_HEX: &str = "5dc571f0279339a601f24040ef2a70ff8bdc8748b12f7807e371e1e48bf50908";
const TRIAL_DURATION_DAYS: u64 = 90; // 3 Ay (90 gün)

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseInfo {
    pub is_valid: bool,
    pub status: String, // "trial_active", "licensed", "trial_expired", "license_expired", "clock_tampered"
    pub machine_id: String,
    pub days_left: i64,
    pub expiry_date: String,
    pub owner: String,
    pub license_type: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct LicenseFile {
    pub machine_id: String,
    pub install_epoch: u64,
    pub last_seen_epoch: u64,
    pub license_key: Option<String>,
    pub checksum: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct LicensePayload {
    pub app: String,
    pub v: u32,
    pub mid: String,
    pub exp: String, // YYYY-MM-DD
    pub iat: String, // YYYY-MM-DD
    pub r#type: String,
    pub owner: String,
}

/// Bilgisayarın Windows MachineGuid değerini okur
fn read_windows_machine_guid() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    if line.contains("MachineGuid") {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if let Some(guid) = parts.last() {
                            return Some(guid.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

/// Bilgisayara özel 12 karakterlik benzersiz Cihaz Kimliği üretir (Örn: MD-2C68-B8B2-DEC4)
pub fn get_machine_id() -> String {
    let raw = read_windows_machine_guid().unwrap_or_else(|| {
        let user = std::env::var("USERNAME").unwrap_or_else(|_| "USER".into());
        let comp = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "HOST".into());
        format!("{}-{}", user, comp)
    });

    let mut hasher = Sha256::new();
    hasher.update(b"MasterDisplay-Hardware-ID-Salt-2026:");
    hasher.update(raw.trim().as_bytes());
    let hash = hasher.finalize();

    let hex_str: String = hash.iter().take(6).map(|b| format!("{:02X}", b)).collect();
    format!("MD-{}-{}-{}", &hex_str[0..4], &hex_str[4..8], &hex_str[8..12])
}

fn get_license_file_path() -> PathBuf {
    let base_dir = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let app_dir = base_dir.join("MasterDisplay");
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("license.dat")
}

fn compute_file_checksum(mid: &str, install: u64, last: u64, key: &Option<String>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"MD-Lic-Internal-Salt-v2");
    hasher.update(mid.as_bytes());
    hasher.update(install.to_le_bytes());
    hasher.update(last.to_le_bytes());
    if let Some(k) = key {
        hasher.update(k.as_bytes());
    }
    let res = hasher.finalize();
    res.iter().take(8).map(|b| format!("{:02x}", b)).collect()
}

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn epoch_to_date_string(epoch: u64) -> String {
    // Basit gün/ay/yıl hesaplaması
    let days_since_epoch = epoch / 86400;
    // 1970-01-01 referanslı takvim hesabı
    let z = days_since_epoch as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1024 + doe / 1461 - doe / 142401) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn date_string_to_epoch(date_str: &str) -> Option<u64> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let y: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let d: i64 = parts[2].parse().ok()?;

    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let doy = (153 * m as u32 + 2) / 5 + d as u32 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe as i64 - 719468;
    if days < 0 {
        return None;
    }
    Some(days as u64 * 86400)
}

fn parse_and_verify_key(key: &str, expected_mid: &str) -> Result<LicensePayload, String> {
    let key = key.trim();
    if !key.starts_with("MDLIC_") {
        return Err("Geçersiz lisans anahtarı formatı (MDLIC_ ile başlamalı)".into());
    }
    let rest = &key["MDLIC_".len()..];
    let parts: Vec<&str> = rest.split('.').collect();
    if parts.len() != 2 {
        return Err("Geçersiz lisans anahtarı yapısı (veri ve imza parçaları eksik)".into());
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| "Lisans verisi çözülemedi")?;

    let sig_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Lisans imzası çözülemedi")?;

    if sig_bytes.len() != 64 {
        return Err("Geçersiz imza uzunluğu".into());
    }

    let pub_key_bytes = (0..PUBLIC_KEY_HEX.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&PUBLIC_KEY_HEX[i..i + 2], 16))
        .collect::<Result<Vec<u8>, _>>()
        .map_err(|_| "Genel anahtar ayrıştırılamadı")?;

    let pub_key_arr: [u8; 32] = pub_key_bytes
        .try_into()
        .map_err(|_| "Genel anahtar boyutu hatalı")?;

    let verifying_key = VerifyingKey::from_bytes(&pub_key_arr)
        .map_err(|_| "Geçersiz genel doğrulama anahtarı")?;

    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "İmza dönüştürme hatası")?;
    let signature = Signature::from_bytes(&sig_arr);

    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| "Lisans anahtarının dijital imzası doğrulanamadı (Geçersiz veya sahte anahtar)".to_string())?;

    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "Lisans yükü okunamadı".to_string())?;

    if payload.app != "Master-Display" {
        return Err("Bu lisans anahtarı Master-Display uygulamasına ait değil".into());
    }

    if payload.mid.to_uppercase() != expected_mid.to_uppercase() {
        return Err(format!(
            "Bu lisans başka bir bilgisayar için üretilmiş! (Lisans Cihazı: {}, Bu Cihaz: {})",
            payload.mid, expected_mid
        ));
    }

    Ok(payload)
}

/// Mevcut lisans durumunu sorgular
pub fn check_license() -> LicenseInfo {
    let mid = get_machine_id();
    let now = current_epoch_seconds();
    let file_path = get_license_file_path();

    let mut lic_file = if file_path.exists() {
        match fs::read_to_string(&file_path).ok().and_then(|s| serde_json::from_str::<LicenseFile>(&s).ok()) {
            Some(f) => {
                let expected_chk = compute_file_checksum(&f.machine_id, f.install_epoch, f.last_seen_epoch, &f.license_key);
                if f.checksum != expected_chk || f.machine_id != mid {
                    // Dosya tahrif edilmiş veya başka bilgisayardan kopyalanmış
                    LicenseFile {
                        machine_id: mid.clone(),
                        install_epoch: now,
                        last_seen_epoch: now,
                        license_key: None,
                        checksum: compute_file_checksum(&mid, now, now, &None),
                    }
                } else {
                    f
                }
            }
            None => LicenseFile {
                machine_id: mid.clone(),
                install_epoch: now,
                last_seen_epoch: now,
                license_key: None,
                checksum: compute_file_checksum(&mid, now, now, &None),
            },
        }
    } else {
        LicenseFile {
            machine_id: mid.clone(),
            install_epoch: now,
            last_seen_epoch: now,
            license_key: None,
            checksum: compute_file_checksum(&mid, now, now, &None),
        }
    };

    // Saat manipülasyon kontrolü (Anti-Tampering)
    // Eğer sistem saati son görülen zamandan 24 saatten daha eskiye alınmışsa
    if now + 86400 < lic_file.last_seen_epoch {
        return LicenseInfo {
            is_valid: false,
            status: "clock_tampered".into(),
            machine_id: mid,
            days_left: 0,
            expiry_date: "-".into(),
            owner: "-".into(),
            license_type: "-".into(),
            message: "Sistem saatinin geriye alındığı tespit edildi. Lütfen bilgisayarınızın tarih ve saatini güncelleyin.".into(),
        };
    }

    // Zamanı güncelle ve kaydet
    lic_file.last_seen_epoch = now;
    lic_file.checksum = compute_file_checksum(&lic_file.machine_id, lic_file.install_epoch, lic_file.last_seen_epoch, &lic_file.license_key);
    let _ = fs::write(&file_path, serde_json::to_string(&lic_file).unwrap_or_default());

    // 1. Durum: Lisans anahtarı girilmiş mi?
    if let Some(ref key) = lic_file.license_key {
        match parse_and_verify_key(key, &mid) {
            Ok(payload) => {
                if let Some(exp_epoch) = date_string_to_epoch(&payload.exp) {
                    if now <= exp_epoch {
                        let days_left = ((exp_epoch - now) / 86400) as i64;
                        return LicenseInfo {
                            is_valid: true,
                            status: "licensed".into(),
                            machine_id: mid,
                            days_left,
                            expiry_date: payload.exp,
                            owner: payload.owner,
                            license_type: payload.r#type,
                            message: format!("Lisanslı Sürüm ({} gün kaldı)", days_left),
                        };
                    } else {
                        return LicenseInfo {
                            is_valid: false,
                            status: "license_expired".into(),
                            machine_id: mid,
                            days_left: 0,
                            expiry_date: payload.exp,
                            owner: payload.owner,
                            license_type: payload.r#type,
                            message: "Lisans süreniz doldu. Lütfen lisansınızı uzatın.".into(),
                        };
                    }
                }
            }
            Err(_) => {
                // Anahtar bozulmuş, deneme süresine geri düş
            }
        }
    }

    // 2. Durum: İlk 3 Aylık Deneme Sürümü (90 gün)
    let trial_end = lic_file.install_epoch + TRIAL_DURATION_DAYS * 86400;
    let trial_exp_date = epoch_to_date_string(trial_end);

    if now <= trial_end {
        let days_left = ((trial_end - now) / 86400) as i64;
        LicenseInfo {
            is_valid: true,
            status: "trial_active".into(),
            machine_id: mid,
            days_left,
            expiry_date: trial_exp_date,
            owner: "Deneme Kullanıcısı".into(),
            license_type: "3 Aylık Başlangıç Denemesi".into(),
            message: format!("3 Aylık Deneme Sürümü Aktif ({} gün kaldı)", days_left),
        }
    } else {
        LicenseInfo {
            is_valid: false,
            status: "trial_expired".into(),
            machine_id: mid,
            days_left: 0,
            expiry_date: trial_exp_date,
            owner: "Deneme Kullanıcısı".into(),
            license_type: "3 Aylık Başlangıç Denemesi".into(),
            message: "3 Aylık deneme süreniz sona erdi. Kullanıma devam etmek için lisans anahtarı giriniz.".into(),
        }
    }
}

/// Yeni bir lisans anahtarını aktive eder / süreyi uzatır
pub fn activate(key: String) -> Result<LicenseInfo, String> {
    let mid = get_machine_id();
    let payload = parse_and_verify_key(&key, &mid)?;
    let now = current_epoch_seconds();

    let exp_epoch = date_string_to_epoch(&payload.exp)
        .ok_or_else(|| "Geçersiz bitiş tarihi".to_string())?;

    if now > exp_epoch {
        return Err(format!("Girilen lisansın süresi zaten dolmuş ({})", payload.exp));
    }

    let file_path = get_license_file_path();
    let mut lic_file = if file_path.exists() {
        fs::read_to_string(&file_path)
            .ok()
            .and_then(|s| serde_json::from_str::<LicenseFile>(&s).ok())
            .unwrap_or_else(|| LicenseFile {
                machine_id: mid.clone(),
                install_epoch: now,
                last_seen_epoch: now,
                license_key: None,
                checksum: String::new(),
            })
    } else {
        LicenseFile {
            machine_id: mid.clone(),
            install_epoch: now,
            last_seen_epoch: now,
            license_key: None,
            checksum: String::new(),
        }
    };

    lic_file.machine_id = mid.clone();
    lic_file.license_key = Some(key.trim().to_string());
    lic_file.last_seen_epoch = now;
    lic_file.checksum = compute_file_checksum(&lic_file.machine_id, lic_file.install_epoch, lic_file.last_seen_epoch, &lic_file.license_key);

    fs::write(&file_path, serde_json::to_string(&lic_file).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Lisans kaydedilemedi: {}", e))?;

    let days_left = ((exp_epoch - now) / 86400) as i64;
    Ok(LicenseInfo {
        is_valid: true,
        status: "licensed".into(),
        machine_id: mid,
        days_left,
        expiry_date: payload.exp,
        owner: payload.owner,
        license_type: payload.r#type,
        message: format!("Lisans başarıyla etkinleştirildi! ({} gün geçerli)", days_left),
    })
}
