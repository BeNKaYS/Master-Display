@echo off
chcp 65001 >nul
title Master-Display -- GitHub'a Yükleme

echo ============================================================
echo   Master-Display -- GitHub'a Kod Gönderimi (Git Push)
echo ============================================================
echo.
echo Kodlar GitHub deponuza gönderiliyor...
echo (Eğer tarayıcı veya GitHub giriş penceresi açılırsa onaylayın)
echo.

"C:\Users\serca\AppData\Local\Programs\Git\cmd\git.exe" push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo ============================================================
    echo   ✓ TEBRİKLER! Tüm kodlar GitHub'a başarıyla yüklendi!
    echo   Depo Adresi: https://github.com/BeNKaYS/Master-Display
    echo ============================================================
) else (
    echo [!] Bir sorun oluştu. Yukarıdaki hata mesajını inceleyin.
)

echo.
echo Kapatmak için herhangi bir tuşa basın...
pause >nul
