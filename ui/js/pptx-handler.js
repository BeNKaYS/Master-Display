/**
 * PresentationHandler - Sunum, Medya ve Dosya Entegrasyonu
 * Görseller, Videolar, Sesler ve Sunum dosyalarını MediaItem'a dönüştürür.
 */

import { MediaItem } from './models/MediaItem.js';

export class PresentationHandler {
  /**
   * Dosyayı DataURL veya BlobURL olarak okur
   */
  static readFileAsUrl(file, type) {
    return new Promise((resolve) => {
      // Görsel ve ses dosyaları için DataURL (çift ekran ve iframe uyumluluğu için kusursuz)
      if ((type === 'image' || type === 'audio') && file.size < 30 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          let res = e.target.result;
          // Windows bazen .webp veya diğer görselleri application/octet-stream olarak okur, düzelt
          if (res && typeof res === 'string' && res.startsWith('data:application/octet-stream')) {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            if (ext === 'webp') res = res.replace('data:application/octet-stream', 'data:image/webp');
            else if (ext === 'png') res = res.replace('data:application/octet-stream', 'data:image/png');
            else if (ext === 'jpg' || ext === 'jpeg') res = res.replace('data:application/octet-stream', 'data:image/jpeg');
            else if (ext === 'gif') res = res.replace('data:application/octet-stream', 'data:image/gif');
            else if (ext === 'svg') res = res.replace('data:application/octet-stream', 'data:image/svg+xml');
          }
          resolve(res);
        };
        reader.onerror = () => resolve(URL.createObjectURL(file));
        reader.readAsDataURL(file);
      } else {
        resolve(URL.createObjectURL(file));
      }
    });
  }

  /**
   * Dosyayı analiz ederek uygun MediaItem nesnesini oluşturur
   */
  static async processFile(file) {
    const type = MediaItem.detectType(file);
    if (type === 'ignore') return null;

    const fileName = file.name;
    const title = fileName.replace(/\.[^/.]+$/, ''); // Uzantıyı kaldır
    const srcUrl = await PresentationHandler.readFileAsUrl(file, type);

    // Video ise (metadata süresini al veya 1.5 sn fallback)
    if (type === 'video') {
      return new Promise((resolve) => {
        let finished = false;
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = srcUrl;

        const done = (dur) => {
          if (finished) return;
          finished = true;
          resolve(new MediaItem({
            title: title,
            type: 'video',
            src: srcUrl,
            fileName: fileName,
            fileSize: file.size,
            fileBlob: file,
            duration: Math.round(dur) || 15,
            autoNext: false
          }));
        };

        video.onloadedmetadata = () => done(video.duration);
        video.onerror = () => done(15);
        setTimeout(() => done(15), 1500);
      });
    }

    // Ses ise
    if (type === 'audio') {
      return new Promise((resolve) => {
        let finished = false;
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.src = srcUrl;

        const done = (dur) => {
          if (finished) return;
          finished = true;
          resolve(new MediaItem({
            title: title,
            type: 'audio',
            src: srcUrl,
            fileName: fileName,
            fileSize: file.size,
            fileBlob: file,
            duration: Math.round(dur) || 0,
            autoNext: false
          }));
        };

        audio.onloadedmetadata = () => done(audio.duration);
        audio.onerror = () => done(0);
        setTimeout(() => done(0), 1500);
      });
    }

    // Sunum / PPTX / PDF
    if (type === 'presentation') {
      const ext = (file.name.split('.').pop() || '').toLowerCase();

      // 1. PDF ise ve PDF.js yüklüyse sayfaları yüksek çözünürlüklü slaytlara render et
      if (ext === 'pdf' && typeof window.pdfjsLib !== 'undefined') {
        try {
          const arrayBuf = await file.arrayBuffer();
          const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
          const slideUrls = [];

          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            slideUrls.push(canvas.toDataURL('image/jpeg', 0.9));
          }

          if (slideUrls.length > 0) {
            return new MediaItem({
              title: title,
              type: 'presentation',
              src: slideUrls[0],
              fileName: fileName,
              fileSize: file.size,
              fileBlob: file,
              slides: slideUrls,
              activeSlide: 0,
              duration: 0,
              autoNext: false,
              notes: `PDF Sunumu (${slideUrls.length} Sayfa)`
            });
          }
        } catch (pdfErr) {
          console.warn('PDF.js render hatası:', pdfErr);
        }
      }

      // 2. PPTX ise ve JSZip yüklüyse ppt/media içindeki slayt görsellerini ayıkla
      if ((ext === 'pptx' || ext === 'ppt') && typeof window.JSZip !== 'undefined') {
        try {
          const zip = await window.JSZip.loadAsync(file);
          const mediaKeys = Object.keys(zip.files).filter(k =>
            k.startsWith('ppt/media/') && /\.(png|jpeg|jpg|webp)$/i.test(k)
          ).sort();

          if (mediaKeys.length > 0) {
            const slideUrls = [];
            for (const mk of mediaKeys) {
              const b64 = await zip.file(mk).async('base64');
              const mExt = mk.split('.').pop().toLowerCase();
              const mime = (mExt === 'png') ? 'image/png' : 'image/jpeg';
              slideUrls.push(`data:${mime};base64,${b64}`);
            }

            if (slideUrls.length > 0) {
              return new MediaItem({
                title: title,
                type: 'presentation',
                src: slideUrls[0],
                fileName: fileName,
                fileSize: file.size,
                fileBlob: file,
                slides: slideUrls,
                activeSlide: 0,
                duration: 0,
                autoNext: false,
                notes: `PowerPoint Sunumu (${slideUrls.length} Slayt Görseli)`
              });
            }
          }
        } catch (zipErr) {
          console.warn('JSZip PPTX okuma hatası:', zipErr);
        }
      }

      // Standalone Fallback
      return new MediaItem({
        title: title,
        type: 'presentation',
        src: srcUrl,
        fileName: fileName,
        fileSize: file.size,
        fileBlob: file,
        slides: [srcUrl],
        activeSlide: 0,
        duration: 0,
        autoNext: false,
        notes: 'PowerPoint / PDF Sunumu'
      });
    }

    // Görsel
    return new MediaItem({
      title: title,
      type: 'image',
      src: srcUrl,
      fileName: fileName,
      fileSize: file.size,
      fileBlob: file,
      duration: 0,
      autoNext: false
    });
  }
}
