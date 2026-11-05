# Arayuz + Tauri release derlemesi
#
# NEDEN VAR:
# `cargo build --release` tek basina YETMIYOR. Tauri, ui/ icerigini
# `tauri::generate_context!()` makrosuyla DERLEME ZAMANINDA gomuyor.
# Makro yalnizca crate yeniden derlenirse yeniden calisir. build.rs'teki
# `cargo:rerun-if-changed` sadece build script'i tetikler; crate derlenmezse
# exe ESKI arayuzle kalir (basimiza geldi).
#
# Bu betik src/lib.rs'in zaman damgasini tazeleyerek crate'i yeniden derletir,
# boylece ui/ degisiklikleri exe'ye kesin olarak gomer.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tauri = Join-Path $root 'src-tauri'

if (-not (Test-Path $tauri)) { throw "src-tauri bulunamadi: $tauri" }

Write-Host ">> arayuz degisikligi exe'ye gomulsun diye crate tazeleniyor"
$stamp = Get-Date
(Get-Item (Join-Path $tauri 'src\lib.rs')).LastWriteTime = $stamp

Push-Location $tauri
try {
  & cargo build --release
  if ($LASTEXITCODE -ne 0) { throw "cargo build basarisiz (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

$exe = Join-Path $tauri 'target\release\master-display.exe'
if (-not (Test-Path $exe)) { throw "exe uretilmedi: $exe" }
$info = Get-Item $exe
Write-Host ""
Write-Host ">> HAZIR: $($info.FullName)"
Write-Host "   boyut: $([math]::Round($info.Length / 1MB, 2)) MB"
Write-Host "   zaman: $($info.LastWriteTime)"
