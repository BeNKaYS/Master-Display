@echo off
chcp 65001 > nul
title Tören ve Sahne Sunum Yönetim Uygulaması
echo ========================================================
echo  Tören ve Sahne Sunum Yönetim Uygulaması Başlatılıyor...
echo ========================================================

rem Öncelik: release (hızlı, konsolsuz) → debug → tarayıcı
if exist "%~dp0src-tauri\target\release\master-display.exe" (
    start "" "%~dp0src-tauri\target\release\master-display.exe"
) else if exist "%~dp0src-tauri\target\debug\master-display.exe" (
    start "" "%~dp0src-tauri\target\debug\master-display.exe"
) else (
    start "" "%~dp0ui\index.html"
)
exit
