/**
 * PdfWriter — JPEG sayfalardan tek dosyalık PDF üretir.
 *
 * Neden kütüphane yok: pdf.js yalnızca *okuma* yapar, yazma yapmaz. Bir PDF
 * yazıcı kütüphanesi (~300 KB) eklemek yerine ihtiyacımız olan en küçük
 * PDF'i kendimiz yazıyoruz: her sayfa bir JPEG, `/DCTDecode` filtresiyle
 * gömülür. Belirgin avantajlar:
 *
 *  - Dosya boyutu ≈ JPEG'lerin toplamı (yeniden sıkıştırma YOK, kalite kaybı YOK)
 *  - Çıktı standart PDF 1.4; Adobe, tarayıcı, yazıcı, pdf.js hepsi açar
 *  - RAM'de sayfa sayfa çalışır: tek seferde bir JPEG işlenir
 *
 * Kullanım:
 *   const bytes = await PdfWriter.fromJpegUrls(urls);   // Uint8Array
 */
(function () {
  'use strict';

  /** JPEG baytlarından genişlik/yükseklik okur (SOF0/1/2/9/10 işaretleri). */
  function jpegSize(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      // Dolgu baytlarını atla
      if (marker === 0xFF) { i++; continue; }
      // SOF0..SOF15 (C4, C8, CC hariç) → boyut burada
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return {
          height: (bytes[i + 5] << 8) | bytes[i + 6],
          width: (bytes[i + 7] << 8) | bytes[i + 8]
        };
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }

  // Metni bayta çevirir (PDF yapısı ASCII; içerik akışı da ASCII)
  function enc(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  /** Sayfaları birleştirip PDF baytları üretir. */
  async function fromJpegUrls(urls, options) {
    options = options || {};
    if (!urls || !urls.length) throw new Error('PDF için sayfa yok');

    // 1) Tüm JPEG'leri sırayla yükle ve boyutlarını öğren
    const pages = [];
    for (let i = 0; i < urls.length; i++) {
      if (typeof options.onProgress === 'function') options.onProgress(i + 1, urls.length);
      const res = await fetch(urls[i]);
      if (!res.ok) throw new Error('Sayfa yüklenemedi: ' + urls[i]);
      const buf = new Uint8Array(await res.arrayBuffer());
      const size = jpegSize(buf);
      if (!size || !size.width || !size.height) {
        throw new Error('JPEG boyutu okunamadı (sayfa ' + (i + 1) + ')');
      }
      pages.push({ bytes: buf, width: size.width, height: size.height });
    }

    // 2) Nesne numaralarını planla
    //    1 = Catalog, 2 = Pages, sonra her sayfa için: Page, Contents, Image
    const objCount = 2 + pages.length * 3;
    const offsets = new Array(objCount + 1).fill(0);

    const chunks = [];
    let pos = 0;
    const push = (u8) => { chunks.push(u8); pos += u8.length; };
    const pushStr = (s) => push(enc(s));

    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    const beginObj = (num) => {
      offsets[num] = pos;
      pushStr(num + ' 0 obj\n');
    };

    // Catalog
    beginObj(1);
    pushStr('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Pages
    const kids = [];
    for (let i = 0; i < pages.length; i++) {
      kids.push((3 + i * 3) + ' 0 R');
    }
    beginObj(2);
    pushStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>\nendobj\n');

    // Her sayfa
    for (let i = 0; i < pages.length; i++) {
      const pageNum = 3 + i * 3;
      const contentNum = pageNum + 1;
      const imageNum = pageNum + 2;
      const p = pages[i];

      // Çözünürlük: JPEG piksel boyutu doğrudan PDF noktası olarak kullanılır.
      // 96 dpi varsayımıyla 1 px = 0.75 pt → geniş sayfalar devasa olmasın.
      const w = Math.round(p.width * 0.75 * 100) / 100;
      const h = Math.round(p.height * 0.75 * 100) / 100;

      beginObj(pageNum);
      pushStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + ']' +
        ' /Resources << /XObject << /Im0 ' + imageNum + ' 0 R >> >>' +
        ' /Contents ' + contentNum + ' 0 R >>\nendobj\n');

      // İçerik: görüntüyü sayfayı kaplayacak şekilde yerleştir
      const content = 'q\n' + w + ' 0 0 ' + h + ' 0 0 cm\n/Im0 Do\nQ\n';
      beginObj(contentNum);
      pushStr('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

      // Görüntü: JPEG olduğu gibi gömülür (DCTDecode, yeniden sıkıştırma yok)
      beginObj(imageNum);
      pushStr('<< /Type /XObject /Subtype /Image' +
        ' /Width ' + p.width + ' /Height ' + p.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
        ' /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n');
      push(p.bytes);
      pushStr('\nendstream\nendobj\n');
    }

    // 3) xref tablosu
    const xrefPos = pos;
    let xref = 'xref\n0 ' + (objCount + 1) + '\n';
    xref += '0000000000 65535 f \n';
    for (let n = 1; n <= objCount; n++) {
      xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    }
    pushStr(xref);

    pushStr('trailer\n<< /Size ' + (objCount + 1) + ' /Root 1 0 R >>\nstartxref\n' +
      xrefPos + '\n%%EOF\n');

    // 4) Birleştir
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  window.PdfWriter = {
    fromJpegUrls: fromJpegUrls,
    _jpegSize: jpegSize
  };
})();
