# Master-Display (Tören ve Sahne Sunum Yönetim Uygulaması)

<p align="center">
  <strong>T.C. Millî Eğitim Bakanlığı — Mardin İl Millî Eğitim Müdürlüğü</strong><br>
  <em>Geliştirici: SERCAN ÖZDEMİR</em>
</p>

---

## 📌 Genel Bakış

**Master-Display**, okullar, resmi törenler, konferanslar, salon etkinlikleri ve sahne sunumları için özel olarak geliştirilmiş modern, profesyonel bir **Reji ve LED Ekran Yönetim Konsolu**dur.

Tören esnasında arka plan görselleri, saygı duruşu / İstiklâl Marşı, tören akışları, oratoryo ve koro fon müzikleri, bayrak loop videoları ve logoları çift ekran (Reji Konsolu + LED/Projeksiyon Ekranı) mimarisiyle sıfır takılma ve kusursuz geçiş efektleriyle yönetmenizi sağlar.

---

## ✨ Temel Özellikler

- **Çift Ekran (Master & Display) Mimarisi:**
  - **Reji Konsolu:** Süreç takibi, ses fader kontrolü, ön izleme (preview) ve oynatma listesi yönetimi.
  - **LED / Projeksiyon Ekranı:** Sahneye aktarılan tam ekran, logolu ve dinamik görsel çıktı.
- **Kesintisiz Bayrak & Loop Video Oynatıcı:**
  - Dikişsiz (seamless) döngü, 16ms mikro adımlı crossfade ve `🌓 Siyah/Beyaz (S/B)` video filtre desteği.
  - Şeffaflık (opaklık) ayarı ve fare tekerleğiyle hassas parlaklık/opaklık yönetimi.
- **Tören Fon Müzikleri (Loop Ses / Beat):**
  - Akış listesi, bağımsız zaman ilerleme çubuğu (scrubber) ve ses dalgası kontrolü.
  - Tıklamayla yanlışlıkla başlatmayı önleyen güvenli çalma butonu.
- **Logolar ve Arkaplan Yönetimi:**
  - MEB, Valilik ve İl MEM logoları; açılış ve kapanışta yumuşak 400ms crossfade geçişleri.
  - Dinamik tören afişi ve anlık görsel yerleştirme.
- **Gelişmiş Ses Fader & Mute:**
  - Hızlı fader susturma ve etiket susturma için optimize edilmiş ayrı ms süreleri (450ms / 750ms).
- **☕ Sürekli Uyanık Kal (Caffeine Modu):**
  - Sunum veya tören esnasında bilgisayarın uykuya geçmesini, ekran koruyucunun açılmasını veya ekranın kararmasını engelleyen yerleşik Windows API entegrasyonu.
- **🔒 Panel Ayraç Kilidi:**
  - Reji panel ayraçlarını sabitleme, kazara sürüklenmeleri önleme.
- **🚀 GitHub Releases Otomatik Güncelleme:**
  - Ayarlar menüsünden tek tıkla en son sürümleri denetleme, otomatik indirme ve uygulama içi güncelleme.
  - GitHub Actions ile otomatik kurulum (Setup.exe) derleme ve dağıtım.

---

## 🛠️ Geliştirici & Derleme Kılavuzu

### Gereksinimler
- **Windows 10 / 11** (64-bit)
- **Rust** (1.77.2 veya üzeri)
- **WebView2 Çalışma Zamanı**
- **Inno Setup 6** (Kurulum paketi derlemek için)
- **Python 3.10+** (Kurulum karşılama görselleri için)

### Geliştirici Modunda Çalıştırma
```powershell
.\Gelistirici_Mod.bat
```

### Kurulum Paketi (Setup.exe) Üretme
```powershell
.\Setup_Olustur.ps1
```
Bu betik:
1. Gerekli varlıkları ve karşılama görsellerini hazırlar.
2. `src-tauri` üzerinden release ikilisini derler.
3. Inno Setup ile `Setup/Master-Display_Kurulum_Setup.exe` kurulum paketini oluşturur.

---

## 🚀 GitHub Üzerinden Güncelleme Yayınlama

Projede GitHub Actions otomatik derleme ve dağıtım iş akışı (`.github/workflows/release.yml`) tanımlıdır.

Yeni bir sürüm yayınlamak için:
```bash
git tag v2.0.1
git push origin v2.0.1
```
GitHub Actions otomatik olarak:
1. Kodu derler.
2. Inno Setup kurulum dosyasını (`Master-Display_Kurulum_Setup.exe`) üretir.
3. İlgili etikete GitHub Release açarak kurulum dosyasını ekler.
4. Master-Display kullanıcıları uygulamayı açtığında veya Ayarlar menüsünden "Güncellemeleri Denetle" butonuna bastığında yeni sürümü doğrudan indirip kurabilir.

---

## 📄 Lisans & Telif Hakkı

© T.C. Millî Eğitim Bakanlığı — Mardin İl Millî Eğitim Müdürlüğü  
Geliştirici: **SERCAN ÖZDEMİR** ([@BeNKaYS](https://github.com/BeNKaYS))
