@echo off
cd /d "%~dp0"
title Master-Display - Gelistirici Modu
echo ========================================================
echo  Master-Display Gelistirici Modu (Dev)
echo ========================================================

rem Varsa arka planda kilitli kalan master-display sureclerini temizle
taskkill /F /IM master-display.exe >nul 2>&1

echo [1/2] Arayuz dosyalari taranip dev surumu derleniyor...
powershell -NoProfile -Command "(Get-Item 'src-tauri\src\lib.rs').LastWriteTime = Get-Date"
cargo build --manifest-path src-tauri/Cargo.toml
if errorlevel 1 (
    echo.
    echo [HATA] Derleme sirasinda hata olustu.
    pause
    exit /b 1
)

echo [2/2] Master-Display Gelistirici Modunda aciliyor...
start "" "%~dp0src-tauri\target\debug\master-display.exe"