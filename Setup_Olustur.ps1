# Master-Display — Windows Kurulum Paketi (Setup.exe) Oluşturucu
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Root

Write-Host ">> 0/3 Test akışları, önbellek ve yerel ayarlar temizleniyor..." -ForegroundColor Cyan
Get-Process -Name "master-display" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
$AppDataDirs = @(
    "$env:LOCALAPPDATA\com.masterdisplay.app",
    "$env:APPDATA\com.masterdisplay.app"
)
foreach ($d in $AppDataDirs) {
    if (Test-Path $d) {
        Remove-Item -Path $d -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   Temizlendi: $d" -ForegroundColor DarkGray
    }
}

Write-Host ">> 1/3 İkon ve Kurulum Karşılama Görselleri üretiliyor..." -ForegroundColor Cyan
python "$Root\installer\generate_installer_assets.py"

Write-Host ">> 2/3 Uygulama ikilisi (master-display.exe) yeni ikonla derleniyor..." -ForegroundColor Cyan
(Get-Item "$Root\src-tauri\build.rs").LastWriteTime = Get-Date
powershell -ExecutionPolicy Bypass -File "$Root\Derle.ps1"

$IsccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Antigravity IDE\resources\app\node_modules\innosetup\bin\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$Iscc = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Iscc) {
    throw "ISCC.exe (Inno Setup 6) bulunamadı."
}

Write-Host ">> 3/3 Inno Setup ile Master-Display_Kurulum_Setup.exe paketleniyor..." -ForegroundColor Cyan
$TempOut = Join-Path $env:TEMP "md_setup_out"
New-Item -ItemType Directory -Path $TempOut -Force | Out-Null

& $Iscc "/O$TempOut" "$Root\installer\MasterDisplay_Setup.iss"
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup derlemesi başarısız oldu (kod: $LASTEXITCODE)"
}

$SetupDir = Join-Path $Root "Setup"
New-Item -ItemType Directory -Path $SetupDir -Force | Out-Null
$TargetExe = Join-Path $SetupDir "Master-Display_Kurulum_Setup.exe"
Move-Item -Path (Join-Path $TempOut "Master-Display_Kurulum_Setup.exe") -Destination $TargetExe -Force

$FileInfo = Get-Item $TargetExe
$SizeMB = [math]::Round($FileInfo.Length / 1MB, 2)
Write-Host ""
Write-Host ">> KURULUM DOSYASI HAZIR: $TargetExe ($SizeMB MB)" -ForegroundColor Green
