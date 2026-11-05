/**
 * Master-Display Standalone All-In-One Bundle
 * Ceremony & Stage Presentation Manager - Referans Pro Reji Tasarımı
 * 100% Offline-Ready & Browser Standalone
 */

(function () {
  'use strict';

  // Tauri WebView yeniden yüklendiğinde eski oturumun asenkron callback uyarılarını sustur
  (function() {
    var _w = console.warn;
    console.warn = function() {
      if (arguments.length > 0 && typeof arguments[0] === 'string' && arguments[0].indexOf("[TAURI] Couldn't find callback id") !== -1) {
        return;
      }
      return _w.apply(console, arguments);
    };
    try {
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.callbacks instanceof Map) {
        var _get = window.__TAURI_INTERNALS__.callbacks.get;
        window.__TAURI_INTERNALS__.callbacks.get = function(id) {
          if (this.has(id)) return _get.call(this, id);
          return function() {};
        };
      }
    } catch (e) {}
  })();

  // ==========================================================
  // TAURI KÖPRÜSÜ
  // Tarayıcı modunda hiçbir şey değişmez (yollar göreli kalır).
  // Tauri içindeyse büyük medya dosyaları (loop/ videoları) binary'ye
  // gömülmez; asset protocol üzerinden diskten servis edilir.
  // ==========================================================
  const MD = (window.MD = window.MD || {});
  MD.tauri = typeof window.__TAURI__ !== 'undefined' && !!window.__TAURI__.core;
  MD.loopDir = null;
  MD.ready = (async () => {
    if (!MD.tauri) return;
    try {
      MD.loopDir = await window.__TAURI__.core.invoke('get_loop_dir');
    } catch (e) {
      console.warn('[MD] loop dizini alınamadı:', e);
    }
  })();
  // 'loop/x.mp4' → tarayıcıda olduğu gibi döner; Tauri'de asset URL'sine çevrilir
  // İnsan kulağının logaritmik duyumuna uygun ses kazanç dönüşümü (Audio Taper).
  // %100 ile %60 arasında farkı belirginleştirir ve alt seviyelerde doğal iniş sağlar.
  MD.audioGain = function (linear) {
    const v = Math.max(0, Math.min(1, Number(linear) || 0));
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return Math.pow(v, 2.2);
  };

  /**
   * Canlı yayındaki tüm ses ve video elemanları için akıcı Fade-In / Fade-Out yöneticisi.
   * Giriş ve çıkışlarda sesin pat diye açılıp kapanmasını önler, yumuşakça kısarak açar ve kapatır.
   * @param {HTMLMediaElement} el - audio veya video elementi
   * @param {number} targetVol - Ulaşılacak hedef ses seviyesi (0.0 - 1.0)
   * @param {number} durationMs - Geçiş süresi (ms)
   * @param {Function} [onComplete] - Hedefe ulaşıldığında çalıştırılacak fonksiyon
   */
  MD.fadeAudio = function (el, targetVol, durationMs = 400, onComplete = null) {
    if (!el) return;
    const target = Math.max(0, Math.min(1, Number(targetVol) || 0));

    if (el._fadeAnimId) {
      cancelAnimationFrame(el._fadeAnimId);
      el._fadeAnimId = null;
    }

    const curVol = Number.isFinite(el.volume) ? el.volume : 0;

    if (target === 0 && (curVol <= 0.001 || el.paused)) {
      el.volume = 0;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    if (target > 0 && el.paused) {
      el.volume = 0;
      try {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }

    if (durationMs <= 20) {
      el.volume = target;
      if (target === 0 && typeof onComplete === 'function') onComplete();
      return;
    }

    const startVol = el.volume;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const current = startVol + (target - startVol) * eased;
      el.volume = Math.max(0, Math.min(1, current));

      if (progress < 1) {
        el._fadeAnimId = requestAnimationFrame(step);
      } else {
        el._fadeAnimId = null;
        el.volume = target;
        if (target === 0 && typeof onComplete === 'function') {
          onComplete();
        }
      }
    };

    el._fadeAnimId = requestAnimationFrame(step);
  };

  MD.loopSrc = function (src) {
    if (!MD.tauri || !MD.loopDir || typeof src !== 'string') return src;
    if (src.indexOf('loop/') !== 0) return src;
    try {
      // Alt klasörler olabilir: 'loop/alt/video.mp4' → loopDir\alt\video.mp4
      const rel = src.slice(5).split('/').join('\\');
      return window.__TAURI__.core.convertFileSrc(MD.loopDir + '\\' + rel);
    } catch (e) {
      return src;
    }
  };

  // Bir URL veya yoldan ham Windows/disk yolunu çıkarır
  MD.extractDiskPath = function (urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return '';
    let trimmed = urlOrPath.trim();
    if (trimmed.indexOf('?') > -1 && trimmed.indexOf('asset.localhost') > -1) {
      trimmed = trimmed.split('?')[0];
    }
    if (trimmed.startsWith('\\\\?\\')) {
      trimmed = trimmed.slice(4);
    }
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) {
      return trimmed.replace(/\//g, '\\');
    }
    if (trimmed.startsWith('file:///')) {
      try {
        const p = decodeURIComponent(trimmed.slice(8)).replace(/^\\\\\?\\/, '').replace(/\//g, '\\');
        if (/^[a-zA-Z]:\\/.test(p)) return p;
      } catch (e) {}
    }
    if (trimmed.indexOf('asset.localhost') > -1 || trimmed.indexOf('asset://') === 0) {
      try {
        let rest = trimmed
          .replace(/^https?:\/\/asset\.localhost\//i, '')
          .replace(/^asset:\/\/localhost\//i, '');
        let decoded = decodeURIComponent(rest);
        decoded = decoded.replace(/^\\\\\?\\/, '').replace(/\//g, '\\');
        if (/^[a-zA-Z]:\\/.test(decoded)) {
          return decoded;
        }
      } catch (e) {}
    }
    return '';
  };

  // Kök klasördeki bir dizini (loop, Beat...) asset URL'lerine çevirerek listeler.
  // Tauri yoksa boş dizi döner; çağıran ön tanımlı listeye düşer.
  MD._mediaCache = {};
  MD.listMedia = async function (folderName) {
    if (!MD.tauri || !window.__TAURI__?.core?.invoke) return [];
    try {
      const raw = await window.__TAURI__.core.invoke('list_media_dir', { dirName: folderName });
      if (!Array.isArray(raw)) return [];
      const out = raw.map((it) => {
        const rel = String(it.rel || '');
        const abs = String(it.abs || '');
        return {
          rel: rel,
          name: String(it.name || rel.split('/').pop()),
          folder: String(it.folder || ''),
          size: Number(it.size) || 0,
          src: abs ? window.__TAURI__.core.convertFileSrc(abs) : ''
        };
      });
      MD._mediaCache[folderName] = out;
      return out;
    } catch (e) {
      console.warn('[MD] Klasör listelenemedi:', folderName, e);
      return [];
    }
  };

  // --- Medya içe aktarma: Base64 yerine disk + asset protocol (Aşama 2) ---
  // Seçilen dosyalar tamamen RAM'e alınmaz; parçalar halinde Rust'a ham bayt
  // olarak gönderilir, önbellek klasörüne yazılır ve asset URL'si döner.
  // Böylece büyük video/müzik eklerken donma olmaz, state paketleri şişmez ve
  // ikinci pencere de aynı dosyadan diskten akış (streaming) ile oynatır.
  MD.MEDIA_CHUNK = 8 * 1024 * 1024;
  MD._importChunk = function (name, id, offset, isFinal, bytes) {
    const meta = new TextEncoder().encode(JSON.stringify({ id, name, offset, final: isFinal }));
    const out = new Uint8Array(4 + meta.length + bytes.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, meta.length, true);
    out.set(meta, 4);
    out.set(bytes, 4 + meta.length);
    return window.__TAURI__.core.invoke('media_import_chunk', out);
  };

  // File → { url, path }. Hata veya tarayıcı modunda null döner.
  MD.importFileEx = async function (file) {
    if (!MD.tauri || !window.__TAURI__.core?.invoke || !file) return null;
    try {
      const name = String(file.name || 'medya.bin');
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const total = file.size || 0;
      const chunk = MD.MEDIA_CHUNK;
      let path = '';
      for (let offset = 0; ; offset += chunk) {
        const end = Math.min(offset + chunk, total);
        const part = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        const isFinal = end >= total;
        path = (await MD._importChunk(name, id, offset, isFinal, part)) || '';
        if (isFinal) break;
      }
      if (!path) return null;
      return { url: window.__TAURI__.core.convertFileSrc(path), path: path };
    } catch (e) {
      console.warn('[MD] Medya içe aktarılamadı:', e);
      return null;
    }
  };

  // File → asset URL. Hata veya tarayıcı modunda null döner (çağıran fallback'e düşer).
  MD.importFile = async function (file) {
    const res = await MD.importFileEx(file);
    return res ? res.url : null;
  };

  // Bir asset URL'si / disk yolu hâlâ geçerli mi?
  MD.mediaExists = async function (urlOrPath) {
    if (!MD.tauri || !urlOrPath) return true;
    if (typeof urlOrPath !== 'string') return true;
    if (urlOrPath.indexOf('http://asset.localhost') !== 0 &&
        urlOrPath.indexOf('https://asset.localhost') !== 0 &&
        urlOrPath.indexOf('asset://localhost') !== 0) return true;
    try {
      return await window.__TAURI__.core.invoke('media_path_exists', { input: urlOrPath });
    } catch (e) {
      return true;
    }
  };

  /**
   * Önbellekteki kullanılmayan medya dosyalarını siler.
   *
   * Her yeni içe aktarma (ve yeniden onarım) benzersiz bir dosya adı üretir;
   * eskiler silinmezse klasör zamanla şişer. Kayıtlı akıştaki geçerli yollar
   * korunur, gerisi silinir.
   */
  MD.cleanupCache = async function (keepPaths) {
    if (!MD.tauri || !window.__TAURI__?.core?.invoke) return 0;
    try {
      const keep = (keepPaths || []).filter(p => typeof p === 'string' && p.length > 0);
      return await window.__TAURI__.core.invoke('media_cache_cleanup', { keep });
    } catch (e) {
      return 0;
    }
  };

  // Uint8Array → asset URL (PDF/PPTX slaytları gibi JS içinde üretilen görseller için)
  MD.importBytes = async function (name, u8) {
    if (!MD.tauri || !window.__TAURI__.core?.invoke || !u8 || !u8.length) return null;
    try {
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const total = u8.length;
      const chunk = MD.MEDIA_CHUNK;
      let path = '';
      for (let offset = 0; ; offset += chunk) {
        const end = Math.min(offset + chunk, total);
        const part = u8.subarray(offset, end);
        const isFinal = end >= total;
        path = (await MD._importChunk(name, id, offset, isFinal, part)) || '';
        if (isFinal) break;
      }
      return path ? window.__TAURI__.core.convertFileSrc(path) : null;
    } catch (e) {
      console.warn('[MD] Görsel yazılamadı:', e);
      return null;
    }
  };

  // data: URL → asset URL. Başarısızsa orijinal data: URL döner.
  MD.dataUrlToAsset = async function (dataUrl, name) {
    if (!MD.tauri || !dataUrl || dataUrl.indexOf('data:') !== 0) return dataUrl;
    try {
      const comma = dataUrl.indexOf(',');
      const head = dataUrl.slice(5, comma);
      const payload = dataUrl.slice(comma + 1);
      let bytes;
      if (head.indexOf(';base64') !== -1) {
        const bin = atob(payload);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      let ext = (String(name || '').split('.').pop() || '').toLowerCase();
      if (!/^[a-z0-9]{2,4}$/.test(ext)) {
        const mime = head.split(';')[0];
        ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[mime] || 'jpg';
      }
      const out = await MD.importBytes((name || 'slayt') + '.' + ext, bytes);
      return out || dataUrl;
    } catch (e) {
      return dataUrl;
    }
  };
  // --- Senkron paketlerini kare başına en fazla 1 IPC çağrısına indir ---
  // (opaklık slider'ı gibi yüksek frekanslı değişimlerde IPC'yi boğmamak için)
  // NOT: Yalnızca requestAnimationFrame kullanmak riskliydi — pencere odakta
  // değilken veya simge durumuna küçültülmüşken rAF durur ve LED ekran
  // senkrondan tamamen kopar. Bu yüzden ikinci bir zamanlayıcı ve bekçi eklendi.
  MD._pendingSync = null;
  MD._syncScheduled = false;
  MD._lastSyncSent = 0;
  MD._flushSync = function () {
    MD._syncScheduled = false;
    const p = MD._pendingSync;
    MD._pendingSync = null;
    if (!p) return;
    MD._lastSyncSent = Date.now();
    try { window.__TAURI__.core.invoke('sync_broadcast', { payload: p }); } catch (e) {}
  };
  MD.pushSync = function (payload) {
    MD._pendingSync = payload;
    if (MD._syncScheduled) return;
    MD._syncScheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(MD._flushSync);
    setTimeout(MD._flushSync, 16);
  };
  // Bekçi: bekleyen paket varsa ve 250 ms'dir gönderilmediyse zorla gönder
  if (typeof window !== 'undefined') {
    setInterval(function () {
      if (MD._pendingSync && Date.now() - MD._lastSyncSent > 250) MD._flushSync();
    }, 250);
  }

  // --- 1. CONFIG ---
  const APP_CONFIG = {
    APP_NAME: 'Ceremony & Stage Presentation Manager',
    VERSION: '2.0.0',
    SYNC_CHANNEL_NAME: 'master_display_sync_bus_v1',
    STORAGE_KEY: 'master_display_app_state',
    HEARTBEAT_INTERVAL_MS: 1500,
    HEARTBEAT_TIMEOUT_MS: 12000,
    SHORTCUTS: {
      PLAY_PAUSE: 'Space',
      STOP: 'KeyS',
      NEXT_ITEM: 'ArrowRight',
      PREV_ITEM: 'ArrowLeft',
      PANIC_BLACKOUT: 'KeyP',
      STAGE_LOCK: 'KeyL',
      FULLSCREEN: 'F11'
    }
  };

  // --- 2. MEDIA ITEM MODEL ---
  class MediaItem {
    constructor({
      id = null,
      title = 'Yeni Medya',
      type = 'image', // 'image' | 'video' | 'audio' | 'presentation'
      src = '',
      fileName = '',
      fileSize = 0,
      duration = 8,
      autoNext = false,
      fitMode = 'contain',
      background = { enabled: false, type: 'color', value: '#000000', loop: true },
      audioTrack = null,
      loopTrack = null,
      visualEnabled = true,
      slides = [],
      activeSlide = 0,
      notes = '',
      fileBlob = null,
      filePath = '',
      mdPath = null,
      slidesPdf = null,
      slidesPdfPath = null,
      createdAt = Date.now()
    } = {}) {
      this.id = id || `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.title = title;
      this.type = type;
      this.src = src;
      this.fileName = fileName;
      this.filePath = filePath || '';
      this.fileSize = fileSize;
      this.duration = Number(duration) || 0;
      this.autoNext = Boolean(autoNext);
      this.fitMode = fitMode;
      this.background = background;
      this.audioTrack = audioTrack;
      this.loopTrack = loopTrack;
      this.visualEnabled = visualEnabled !== false;
      this.slides = slides;
      this.activeSlide = activeSlide;
      this.notes = notes;
      this.fileBlob = fileBlob;
      // Diskteki kalıcı yol: önbellek silinirse dosya buradan yeniden yazılır
      this.mdPath = mdPath || null;
      // Sunumların tek dosyalık PDF kopyası (dışa aktarma / arşiv)
      this.slidesPdf = slidesPdf || null;
      this.slidesPdfPath = slidesPdfPath || null;
      this.createdAt = createdAt;
    }

    toJSON() {
      return {
        id: this.id,
        title: this.title,
        type: this.type,
        src: this.src,
        fileName: this.fileName,
        filePath: this.filePath || this.mdPath || '',
        fileSize: this.fileSize,
        duration: this.duration,
        autoNext: this.autoNext,
        fitMode: this.fitMode,
        background: this.background,
        audioTrack: this.audioTrack,
        loopTrack: this.loopTrack,
        visualEnabled: this.visualEnabled !== false,
        slides: this.slides,
        activeSlide: this.activeSlide,
        notes: this.notes,
        mdPath: this.mdPath,
        slidesPdf: this.slidesPdf,
        slidesPdfPath: this.slidesPdfPath,
        createdAt: this.createdAt
      };
    }

    static fromJSON(json) {
      if (typeof json === 'string') json = JSON.parse(json);
      return new MediaItem(json);
    }

    static detectType(file) {
      if (!file) return 'image';
      const mime = file.type || '';
      const name = (file.name || '').toLowerCase();

      // Gizli ve sistem dosyalarını yoksay
      if (name.startsWith('.') || name.startsWith('~') || name === 'thumbs.db' || name === 'desktop.ini') {
        return 'ignore';
      }

      if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|jfif|avif|ico)$/i.test(name)) {
        return 'image';
      }
      if (mime.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v|wmv|flv)$/i.test(name)) {
        return 'video';
      }
      if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|aac|m4a|flac|wma)$/i.test(name)) {
        return 'audio';
      }
      if (/\.(pptx|ppt|pdf|key)$/i.test(name)) {
        return 'presentation';
      }
      return 'image';
    }
  }
  window.MediaItem = MediaItem;

  // --- 3. PLAYLIST MODEL ---
  class Playlist {
    constructor({
      id = null,
      title = 'Tören Akışı',
      items = [],
      currentIndex = -1,
      loop = false,
      updatedAt = Date.now()
    } = {}) {
      this.id = id || `pl_${Date.now()}`;
      this.title = title;
      this.items = items.map(item => item instanceof MediaItem ? item : new MediaItem(item));
      this.currentIndex = currentIndex;
      this.loop = loop;
      this.updatedAt = updatedAt;
    }

    addItem(mediaItem, targetIndex = null) {
      const item = mediaItem instanceof MediaItem ? mediaItem : new MediaItem(mediaItem);
      if (targetIndex !== null && targetIndex >= 0 && targetIndex <= this.items.length) {
        this.items.splice(targetIndex, 0, item);
      } else {
        this.items.push(item);
      }
      this.updatedAt = Date.now();
      return item;
    }

    removeItem(indexOrId) {
      let index = typeof indexOrId === 'number' ? indexOrId : this.items.findIndex(i => i.id === indexOrId);
      if (index >= 0 && index < this.items.length) {
        const removed = this.items.splice(index, 1)[0];
        if (this.currentIndex === index) {
          this.currentIndex = this.items.length === 0 ? -1 : Math.min(this.currentIndex, this.items.length - 1);
        } else if (this.currentIndex > index) {
          this.currentIndex--;
        }
        this.updatedAt = Date.now();
        return removed;
      }
      return null;
    }

    moveItem(fromIndex, toIndex) {
      if (fromIndex < 0 || fromIndex >= this.items.length || toIndex < 0 || toIndex >= this.items.length) {
        return false;
      }
      const [moved] = this.items.splice(fromIndex, 1);
      this.items.splice(toIndex, 0, moved);

      if (this.currentIndex === fromIndex) {
        this.currentIndex = toIndex;
      } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
        this.currentIndex--;
      } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
        this.currentIndex++;
      }
      this.updatedAt = Date.now();
      return true;
    }

    getCurrentItem() {
      return (this.currentIndex >= 0 && this.currentIndex < this.items.length) ? this.items[this.currentIndex] : null;
    }

    getItem(index) {
      return (index >= 0 && index < this.items.length) ? this.items[index] : null;
    }

    setCurrentIndex(index) {
      if (index >= -1 && index < this.items.length) {
        this.currentIndex = index;
        this.updatedAt = Date.now();
        return true;
      }
      return false;
    }

    next() {
      if (this.items.length === 0) return null;
      if (this.currentIndex + 1 < this.items.length) {
        this.currentIndex++;
        this.updatedAt = Date.now();
        return this.getCurrentItem();
      } else if (this.loop) {
        this.currentIndex = 0;
        this.updatedAt = Date.now();
        return this.getCurrentItem();
      }
      return null;
    }

    prev() {
      if (this.items.length === 0) return null;
      if (this.currentIndex - 1 >= 0) {
        this.currentIndex--;
        this.updatedAt = Date.now();
        return this.getCurrentItem();
      }
      return null;
    }

    clear() {
      this.items = [];
      this.currentIndex = -1;
      this.updatedAt = Date.now();
    }
  }

  // --- 4. PRESENTATION & FILE HANDLER ---
  class PresentationHandler {
    // Dosyayı oynatılabilir bir URL'ye çevirir.
    // Tauri: ham baytlar diske yazılır, asset URL'si döner (Base64 YOK — bellek şişmez).
    // Tarayıcı: küçük resim/ses Base64, diğerleri Blob URL (eski davranış).
    static async readFileAsUrl(file, type, token) {
      const res = await MD.importFileEx(file);
      if (res) {
        // Diskteki yolu da sakla: önbellek silinirse dosya buradan onarılır.
        // Yol, çağrıya özel bir "token" ile saklanır; eşzamanlı içe aktarmalar
        // (ör. kendini onarma sırasında yeni dosya ekleme) birbirinin yolunu
        // ezmesin.
        if (token !== undefined && token !== null) {
          PresentationHandler._paths.set(token, res.path);
        }
        PresentationHandler._lastImportedPath = res.path;
        return res.url;
      }

      return new Promise((resolve) => {
        if ((type === 'image' || type === 'audio') && file.size < 30 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (e) => {
            let res = e.target.result;
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
     * Dosyayı işler ve diskteki kalıcı yolunu (`mdPath`) da öğeye yazar.
     *
     * `mdPath`, önbellek silindiğinde dosyayı yeniden yazmak için kullanılır;
     * bu yüzden her öğede bulunması gerekir (eskiden yalnızca çağıran tarafta
     * okunuyordu ve kayda hiç geçmiyordu).
     */
    static async processFile(file) {
      // Her içe aktarma kendi token'ını alır → eşzamanlı aktarımlar karışmaz
      const token = 'imp_' + (++PresentationHandler._seq) + '_' + Date.now();
      PresentationHandler._lastImportedPath = null;
      let item = null;
      try {
        item = await PresentationHandler._processFile(file, token);
      } finally {
        const path = PresentationHandler._paths.get(token);
        PresentationHandler._paths.delete(token);
        if (item) {
          const rawNative = (file && typeof file.path === 'string') ? file.path.trim() : '';
          const nativePath = (/^[a-zA-Z]:[\\/]/.test(rawNative) || rawNative.startsWith('\\\\')) ? rawNative : '';
          const extracted = MD.extractDiskPath ? MD.extractDiskPath(item.src) : '';
          item.filePath = nativePath || path || item.filePath || extracted || '';
          item.mdPath = path || nativePath || item.mdPath || extracted || null;
          if (!item.fileName) item.fileName = file.name;
          if (!item.fileSize) item.fileSize = file.size;
        }
      }

      // Sunum ise: sayfaları TEK bir PDF dosyasında topla.
      // (Slayt JPEG'leri gösterim hızı için kalır; PDF arşiv/dışa aktarma
      //  içindir: yazdırma, paylaşma, başka bilgisayara taşıma.)
      if (item && item.type === 'presentation' &&
          Array.isArray(item.slides) && item.slides.length > 0) {
        try {
          const built = await PresentationHandler._buildSlidesPdf(item);
          if (built) {
            item.slidesPdf = built.url;
            item.slidesPdfPath = built.path;
            item.notes = (item.notes || '') + ' • Tek PDF';
          }
        } catch (e) {
          console.warn('[MD] Sunum PDF üretilemedi (slaytlar çalışmaya devam eder):', e);
        }
      }

      return item;
    }

    /**
     * Slayt görsellerinden tek PDF üretir ve diske yazar.
     * @returns {Promise<{url:string, path:string}|null>}
     */
    static async _buildSlidesPdf(item) {
      if (typeof window.PdfWriter === 'undefined') return null;
      const urls = (item.slides || []).filter(u => typeof u === 'string' && u);
      if (!urls.length) return null;

      const bytes = await window.PdfWriter.fromJpegUrls(urls);
      if (!bytes || !bytes.length) return null;

      const safeBase = String(item.title || 'sunum')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 60) || 'sunum';
      const name = safeBase + '_sunum.pdf';

      if (MD.tauri && typeof MD.importBytes === 'function') {
        // Kaydedilen yol lazım → importFileEx benzeri parçalı yazma
        const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const CH = MD.MEDIA_CHUNK;
        let path = '';
        for (let off = 0; ; off += CH) {
          const end = Math.min(off + CH, bytes.length);
          const part = bytes.subarray(off, end);
          const isFinal = end >= bytes.length;
          path = (await MD._importChunk(name, id, off, isFinal, part)) || '';
          if (isFinal) break;
        }
        if (!path) return null;
        return { url: window.__TAURI__.core.convertFileSrc(path), path: path };
      }

      // Tarayıcı: Blob URL yeterli
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return { url: URL.createObjectURL(blob), path: '' };
    }

    static async _processFile(file, token) {
      const type = MediaItem.detectType(file);
      if (type === 'ignore') return null;

      const fileName = file.name;
      const title = fileName.replace(/\.[^/.]+$/, '');
      const srcUrl = await PresentationHandler.readFileAsUrl(file, type, token);

      if (type === 'video') {
        return new Promise((resolve) => {
          let finished = false;
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.src = srcUrl;

          const done = (dur) => {
            if (finished) return;
            finished = true;
            const exactDur = (Number.isFinite(dur) && dur > 0) ? Math.round(dur * 1000) / 1000 : 15;
            resolve(new MediaItem({
              title: title,
              type: 'video',
              src: srcUrl,
              fileName: fileName,
              fileSize: file.size,
              fileBlob: file,
              duration: exactDur,
              autoNext: false
            }));
          };

          video.onloadedmetadata = () => done(video.duration);
          video.onerror = () => done(15);
          setTimeout(() => done(15), 2500);
        });
      }

      if (type === 'audio') {
        return new Promise((resolve) => {
          let finished = false;
          const audio = document.createElement('audio');
          audio.preload = 'metadata';
          audio.src = srcUrl;

          const done = (dur) => {
            if (finished) return;
            finished = true;
            const exactDur = (Number.isFinite(dur) && dur > 0) ? Math.round(dur * 1000) / 1000 : 0;
            resolve(new MediaItem({
              title: title,
              type: 'audio',
              src: srcUrl,
              fileName: fileName,
              fileSize: file.size,
              fileBlob: file,
              duration: exactDur,
              autoNext: false
            }));
          };

          audio.onloadedmetadata = () => done(audio.duration);
          audio.onerror = () => done(0);
          setTimeout(() => done(0), 2500);
        });
      }

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
              // Slaytı Base64 olarak tutma — diske yaz, kısa bir asset URL'si kullan
              slideUrls.push(await MD.dataUrlToAsset(
                canvas.toDataURL('image/jpeg', 0.9),
                `${title}_sayfa${p}.jpg`
              ));
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

        // 2. PPTX: gerçek sunum çizici — yazı, resim, konum ve tasarım korunur.
        // (Eski yöntem yalnızca ppt/media içindeki resimleri sırayla diziyordu;
        //  metinler, yerleşim ve arka planlar kayboluyordu.)
        if ((ext === 'pptx') && typeof window.PptxRenderer !== 'undefined') {
          try {
            const slideUrls = await window.PptxRenderer.renderSlides(file, {
              onProgress: (done, total) => {
                if (typeof window.__mdPptxProgress === 'function') window.__mdPptxProgress(done, total, title);
              }
            });
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
                notes: `PowerPoint Sunumu (${slideUrls.length} Slayt)`
              });
            }
          } catch (pptErr) {
            console.warn('PPTX çizim hatası, yedek yönteme geçiliyor:', pptErr);
          }
        }

        // 2b. Yedek: ppt/media içindeki resimleri ayıkla
        if ((ext === 'pptx' || ext === 'ppt') && typeof window.JSZip !== 'undefined') {
          try {
            const zip = await window.JSZip.loadAsync(file);
            const mediaKeys = Object.keys(zip.files).filter(k =>
              k.startsWith('ppt/media/') && /\.(png|jpeg|jpg|webp)$/i.test(k)
            ).sort();

            if (mediaKeys.length > 0) {
              const slideUrls = [];
              for (const mk of mediaKeys) {
                const mExt = mk.split('.').pop().toLowerCase();
                const mime = (mExt === 'png') ? 'image/png' : 'image/jpeg';
                // Base64 yerine ham baytları diske yaz, asset URL'si kullan
                let slideUrl = null;
                try {
                  const u8 = await zip.file(mk).async('uint8array');
                  slideUrl = await MD.importBytes(mk.split('/').pop(), u8);
                } catch (writeErr) {}
                if (!slideUrl) {
                  const b64 = await zip.file(mk).async('base64');
                  slideUrl = `data:${mime};base64,${b64}`;
                }
                slideUrls.push(slideUrl);
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

  // --- 5. STATE ENGINE ---
  class AppState {
    constructor() {
      this.listeners = new Set();
      this.state = {
        role: 'master',
        playbackState: 'stopped',
        playlist: new Playlist(),
        liveItem: null,
        duration: 0,
        remaining: 0,
        endAt: 0,
        stageLock: false,
        blackout: false,
        liveVisualHidden: false,
        ledConfig: this._loadLedConfig(),
        logoConfig: this._loadLogoConfig(),
        globalBackground: { enabled: false, type: 'video', src: MD.loopSrc('loop/16871-276488572_medium.mp4'), loop: true, opacity: 0.35, audioSrc: null, audioVolume: 0.8 },
        audio: { masterVolume: 1.0, mediaVolume: 1.0, bgMusicVolume: 0.7, bgMusicPlaying: false, bgMusicTrack: null, muted: false, loopAudioVolume: 0.8, fxVolume: 0.8 },
        displayConnected: false,
        lastHeartbeat: 0,
        ceremonySettings: this._loadCeremonySettings(),
        // [7] GEÇİŞ: yayına alınan HER öğeye uygulanan varsayılan geçiş
        transition: this._loadTransition(),
        rev: 0
      };
      this._rafId = null;
      this._startTicker();
    }

    /**
     * LED ekran yapılandırması (çözünürlük, ölçek, boşluk doldurma).
     * Kalıcıdır: farklı LED panelleri için bir kez ayarlanır.
     */
    _loadLedConfig() {
      const defaults = {
        width: 1536,
        height: 768,
        scaleMode: 'contain',   // contain | cover | fill
        fillMode: 'blank',      // blank | blur | color
        blurAmount: 28,         // px
        fillColor: '#000000'
      };
      try {
        const raw = localStorage.getItem('master_display_led_config');
        if (raw) {
          const p = JSON.parse(raw) || {};
          const w = Math.max(64, Math.min(16384, parseInt(p.width, 10) || defaults.width));
          const h = Math.max(64, Math.min(16384, parseInt(p.height, 10) || defaults.height));
          return {
            width: w,
            height: h,
            scaleMode: ['contain', 'cover', 'fill', 'original'].includes(p.scaleMode) ? p.scaleMode : 'contain',
            fillMode: ['blank', 'blur', 'color'].includes(p.fillMode) ? p.fillMode : 'blank',
            blurAmount: Math.max(0, Math.min(60, parseInt(p.blurAmount, 10) || 28)),
            fillColor: /^#[0-9a-fA-F]{6}$/.test(p.fillColor || '') ? p.fillColor : '#000000'
          };
        }
      } catch (e) {}
      return defaults;
    }

    setLedConfig(patch) {
      const cur = this.state.ledConfig;
      const next = { ...cur, ...patch };
      next.width = Math.max(64, Math.min(16384, parseInt(next.width, 10) || cur.width));
      next.height = Math.max(64, Math.min(16384, parseInt(next.height, 10) || cur.height));
      if (!['contain', 'cover', 'fill', 'original'].includes(next.scaleMode)) next.scaleMode = 'contain';
      if (!['blank', 'blur', 'color'].includes(next.fillMode)) next.fillMode = 'blank';
      next.blurAmount = Math.max(0, Math.min(60, parseInt(next.blurAmount, 10) || 0));
      if (!/^#[0-9a-fA-F]{6}$/.test(next.fillColor || '')) next.fillColor = '#000000';
      try { localStorage.setItem('master_display_led_config', JSON.stringify(next)); } catch (e) {}
      this.setState({ ledConfig: next });
    }

    /**
     * Logo katmanı yapılandırması.
     *
     * x / y / w değerleri EKRANIN kendi boyutuna göre orandır (0..1):
     * böylece aynı yerleşim hem LED çıkışında hem küçük önizlemede
     * birebir aynı yere düşer. w = ekran genişliğinin oranı; yükseklik
     * PNG'nin kendi en-boy oranından gelir.
     */
    _loadLogoConfig() {
      const defaults = {
        enabled: true,
        linked: false,
        logos: [
          { id: 'logo-1', src: '', name: '', visible: true, x: 0.05, y: 0.07, w: 0.18, opacity: 1 },
          { id: 'logo-2', src: '', name: '', visible: true, x: 0.77, y: 0.07, w: 0.18, opacity: 1 }
        ]
      };
      const normLogo = (raw, fallback) => {
        const p = raw && typeof raw === 'object' ? raw : {};
        const num = (v, d, min, max) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
        };
        return {
          id: fallback.id,
          src: typeof p.src === 'string' ? p.src : '',
          name: typeof p.name === 'string' ? p.name : '',
          visible: p.visible !== false,
          x: num(p.x, fallback.x, 0, 1),
          y: num(p.y, fallback.y, 0, 1),
          w: num(p.w, fallback.w, 0.01, 1),
          opacity: num(p.opacity, fallback.opacity, 0, 1)
        };
      };
      try {
        const raw = localStorage.getItem('master_display_logo_config');
        if (raw) {
          const p = JSON.parse(raw) || {};
          const saved = Array.isArray(p.logos) ? p.logos : [];
          return {
            enabled: true,
            linked: Boolean(p.linked),
            logos: defaults.logos.map((fb, i) => normLogo(saved[i], fb))
          };
        }
      } catch (e) {}
      return defaults;
    }

    setLogoConfig(patch) {
      const cur = this.state.logoConfig || { enabled: true, linked: false, logos: [] };
      const next = { ...cur, ...patch };
      next.enabled = next.enabled !== false;
      next.linked = Boolean(next.linked);
      const list = Array.isArray(next.logos) ? next.logos : cur.logos || [];
      next.logos = [0, 1].map((i) => {
        const raw = list[i] || {};
        const src = typeof raw.src === 'string' ? raw.src : '';
        const num = (v, d, min, max) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
        };
        return {
          id: `logo-${i + 1}`,
          src,
          name: typeof raw.name === 'string' ? raw.name : '',
          visible: raw.visible !== false,
          x: num(raw.x, i === 0 ? 0.05 : 0.77, 0, 1),
          y: num(raw.y, 0.07, 0, 1),
          w: num(raw.w, 0.18, 0.01, 1),
          opacity: num(raw.opacity, 1, 0, 1)
        };
      });
      // Kalıcı kayıtta her logonun kendi visible durumu saklanır; enabled ise anlık yayın mix durumudur
      try { localStorage.setItem('master_display_logo_config', JSON.stringify({ ...next, enabled: true })); } catch (e) {}
      this.setState({ logoConfig: next });
    }

    setLogo(id, patch) {
      const cur = this.state.logoConfig || { enabled: true, linked: false, logos: [] };
      const logos = (cur.logos || []).map((l) => (l.id === id ? { ...l, ...patch } : l));
      this.setLogoConfig({ enabled: true, linked: cur.linked, logos });
    }

    /** Geçiş ayarı (tür + süre) kalıcıdır. */
    _loadTransition() {      try {
        const raw = localStorage.getItem('master_display_transition');
        if (raw) {
          const p = JSON.parse(raw);
          const type = ['cut', 'crossfade', 'fadeblack', 'cards', 'zoom', 'slide', 'sandstorm', 'explode', 'vortex', 'fall', 'wave', 'thanos', 'blinds', 'mosaic'].includes(p.type) ? p.type : 'crossfade';
          const duration = Math.max(0, Math.min(5000, parseInt(p.duration, 10) || 400));
          return { type, duration };
        }
      } catch (e) {}
      return { type: 'crossfade', duration: 400 };
    }

    setTransition(patch) {
      const cur = this.state.transition || { type: 'crossfade', duration: 400 };
      const type = patch.type !== undefined ? patch.type : cur.type;
      const duration = patch.duration !== undefined ? patch.duration : cur.duration;
      const next = {
        type: ['cut', 'crossfade', 'fadeblack', 'cards', 'zoom', 'slide', 'sandstorm', 'explode', 'vortex', 'fall', 'wave', 'thanos', 'blinds', 'mosaic'].includes(type) ? type : 'crossfade',
        duration: Math.max(0, Math.min(5000, parseInt(duration, 10) || 0))
      };
      try { localStorage.setItem('master_display_transition', JSON.stringify(next)); } catch (e) {}
      this.setState({ transition: next });
    }

    _loadCeremonySettings() {
      try {
        const saved = localStorage.getItem('master_display_ceremony_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.defaultPosterSrc === 'assets/samples/ataturk_bayrak.svg') parsed.defaultPosterSrc = '';
          if (parsed.audioPosterSrc === 'assets/samples/ataturk_bayrak.svg') parsed.audioPosterSrc = '';
          if (parsed.posterSrc === 'assets/samples/ataturk_bayrak.svg') parsed.posterSrc = '';
          return {
            defaultPosterSrc: parsed.defaultPosterSrc || parsed.posterSrc || '',
            defaultPosterTitle: parsed.defaultPosterTitle || parsed.posterTitle || 'Varsayılan Tören Sahnesi',
            audioPosterSrc: parsed.audioPosterSrc || parsed.defaultPosterSrc || parsed.posterSrc || '',
            audioPosterTitle: parsed.audioPosterTitle || 'Ses ve Müzik Resmi',
            audioScreenMode: parsed.audioScreenMode || 'audio_poster',
            audioLoopSrc: parsed.audioLoopSrc || '',
            audioLoopName: parsed.audioLoopName || '',
            audioLoopMusicSrc: parsed.audioLoopMusicSrc || '',
            audioLoopMusicName: parsed.audioLoopMusicName || '',
            audioLoopCustom: Array.isArray(parsed.audioLoopCustom) ? parsed.audioLoopCustom : [],
            autoDefaultPosterOnIdle: parsed.autoDefaultPosterOnIdle !== false
          };
        }
      } catch (e) {}
      return {
        defaultPosterSrc: '',
        defaultPosterTitle: 'Varsayılan Tören Sahnesi',
        audioPosterSrc: '',
        audioPosterTitle: 'Ses ve Müzik Resmi',
        audioScreenMode: 'audio_poster',
        audioLoopSrc: '',
        audioLoopName: '',
        audioLoopMusicSrc: '',
        audioLoopMusicName: '',
        audioLoopCustom: [],
        autoDefaultPosterOnIdle: true
      };
    }

    setCeremonySettings(settings) {
      const updated = {
        ...this.state.ceremonySettings,
        ...settings
      };
      try {
        localStorage.setItem('master_display_ceremony_settings', JSON.stringify(updated));
      } catch (e) {}
      this.setState({ ceremonySettings: updated });
    }

    setState(partialState, notify = true) {
      this.state = { ...this.state, ...partialState, rev: this.state.rev + 1 };
      if (notify) this._notifyListeners();
    }

    getState() { return this.state; }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    _notifyListeners() {
      for (const listener of this.listeners) {
        try { listener(this.state); } catch (e) { console.error(e); }
      }
    }

    _startTicker() {
      let lastTickNotify = 0;
      const tick = () => {
        if (this.state.playbackState === 'playing') {
          const now = Date.now();
          if (this.state.endAt > 0) {
            const remaining = Math.max(0, this.state.endAt - now);

            if (remaining === 0) {
              // Yayın sonunu YALNIZCA reji konsolu belirler (hakem = master).
              // Display kendi saatiyle bitirirse iki ekran arasında kare kayması
              // ve "ekran karardı / ses devam ediyor" gibi desenkronlar oluşuyordu.
              if (this.state.role === 'master') {
                this.state.remaining = 0;
                this.handleItemTimeUp();
              }
            } else if (now - lastTickNotify >= 250) {
              this.state.remaining = remaining;
              lastTickNotify = now;
              this._notifyListeners();
            }
          } else if (this.state.liveItem && (now - lastTickNotify >= 500)) {
            // Görsel / süresiz akışlarda geçen sürenin ekranda canlı sayması için bildirim
            lastTickNotify = now;
            this._notifyListeners();
          }
        }
        this._rafId = requestAnimationFrame(tick);
      };
      this._rafId = requestAnimationFrame(tick);
    }

    handleItemTimeUp() {
      // Çift tetikleme koruması: Zaten durduysa tekrar tetikleme yapma (Göz kırpma / kararma önlemi)
      if (this.state.playbackState === 'stopped') return;

      this.setState({
        playbackState: 'stopped',
        remaining: 0,
        endAt: 0,
        seekRequest: null
      });
    }

    play(itemIndex = null) {
      const playlist = this.state.playlist;
      if (playlist.items.length === 0) return;

      let targetItem = null;
      if (itemIndex !== null && itemIndex >= 0 && itemIndex < playlist.items.length) {
        playlist.setCurrentIndex(itemIndex);
        targetItem = playlist.getItem ? playlist.getItem(itemIndex) : playlist.items[itemIndex];
      } else {
        if (playlist.currentIndex === -1) playlist.setCurrentIndex(0);
        targetItem = playlist.getCurrentItem();
      }

      if (!targetItem) return;

      // Akıllı Medya Süre Algılama: Sadece video ve ses zaman kısıtlıdır; resim ve sunular süresizdir (manuel kalır)
      const isTimeBounded = (targetItem.type === 'video' || targetItem.type === 'audio') && (targetItem.duration > 0);
      const durationMs = isTimeBounded ? Math.round((targetItem.duration || 0) * 1000) : 0;
      const now = Date.now();
      const endAt = durationMs > 0 ? (now + durationMs) : 0;

      let cleanLive = targetItem;
      if (typeof targetItem.toJSON === 'function') {
        cleanLive = targetItem.toJSON();
      } else {
        cleanLive = { ...targetItem };
        delete cleanLive.fileBlob;
      }

      const nextBg = { ...this.state.globalBackground };
      if (cleanLive && cleanLive.loopTrack && cleanLive.loopTrack.src) {
        nextBg.src = cleanLive.loopTrack.src;
        nextBg.type = 'video';
        nextBg.loop = true;
        nextBg.enabled = cleanLive.loopTrack.enabled !== false;
        if (cleanLive.loopTrack.opacity !== undefined && Number.isFinite(Number(cleanLive.loopTrack.opacity))) {
          nextBg.opacity = Math.max(0, Math.min(1, Number(cleanLive.loopTrack.opacity)));
        }
        if (cleanLive.loopTrack.grayscale !== undefined) {
          nextBg.grayscale = Boolean(cleanLive.loopTrack.grayscale);
        }
        if (cleanLive.loopTrack.flipX !== undefined) {
          nextBg.flipX = Boolean(cleanLive.loopTrack.flipX);
        }
        if (cleanLive.loopTrack.flipY !== undefined) {
          nextBg.flipY = Boolean(cleanLive.loopTrack.flipY);
        }
      } else {
        // Sıradaki medyaya özel loop video ekli değilse, önceki medyanın loop videosu kapatılır ve taşınmaz!
        nextBg.enabled = false;
        nextBg.src = null;
        nextBg.grayscale = false;
      }

      this.setState({
        stageLock: false,
        blackout: false,
        liveVisualHidden: cleanLive ? (cleanLive.visualEnabled === false) : false,
        playbackState: 'playing',
        liveItem: cleanLive,
        globalBackground: nextBg,
        duration: durationMs,
        remaining: durationMs,
        endAt: endAt,
        seekRequest: null,
        playRequestId: now
      });
    }

    pause() {
      if (this.state.playbackState !== 'playing') return;
      this.setState({
        playbackState: 'paused',
        endAt: 0
      });
    }

    /** Ses aç / kapat (tek düğme). Tüm kanalları susturur, yayını durdurmaz. */
    toggleMute() {
      const muted = !this.state.audio.muted;
      this.setState({ audio: { ...this.state.audio, muted } });
      return muted;
    }

    setMuted(muted) {
      if (this.state.audio.muted === !!muted) return;
      this.setState({ audio: { ...this.state.audio, muted: !!muted } });
    }

    resume() {
      if (this.state.playbackState !== 'paused' || !this.state.liveItem) return;
      const remainingMs = this.state.remaining;
      const endAt = remainingMs > 0 ? (Date.now() + remainingMs) : 0;
      this.setState({
        playbackState: 'playing',
        endAt: endAt
      });
    }

    stop() {
      this.setState({
        playbackState: 'stopped',
        liveItem: null,
        duration: 0,
        remaining: 0,
        endAt: 0,
        seekRequest: null,
        globalBackground: {
          ...this.state.globalBackground,
          enabled: false
        },
        audio: {
          ...this.state.audio,
          bgMusicPlaying: false
        }
      });
    }

    playNext() {
      const nextItem = this.state.playlist.next();
      if (nextItem) {
        this.play(this.state.playlist.currentIndex);
      } else {
        this.stop();
      }
    }

    playPrev() {
      const prevItem = this.state.playlist.prev();
      if (prevItem) {
        this.play(this.state.playlist.currentIndex);
      }
    }

    toggleBlackout() {
      this.setState({ blackout: !this.state.blackout });
    }

    setVolume(channel, volume) {
      const v = Math.max(0, Math.min(1, parseFloat(volume)));
      const audio = { ...this.state.audio };
      if (channel === 'master') audio.masterVolume = v;
      else if (channel === 'media') audio.mediaVolume = v;
      else if (channel === 'bgMusic') audio.bgMusicVolume = v;
      this.setState({ audio });
    }

    /** Kanal seviyesi yazar (loopAudioVolume / fxVolume gibi). */
    setAudioChannel(key, value) {
      const v = Math.max(0, Math.min(1, parseFloat(value)));
      if (!key || isNaN(v)) return;
      if (this.state.audio[key] === v) return;
      this.setState({ audio: { ...this.state.audio, [key]: v } });
    }

    setGlobalBackground(bgConfig) {
      this.setState({
        globalBackground: { ...this.state.globalBackground, ...bgConfig }
      });
    }

    seekTo(targetSeconds) {
      const totalDurationSec = (this.state.duration || 0) / 1000;
      if (totalDurationSec <= 0) return;

      const clampedSec = Math.max(0, Math.min(targetSeconds, totalDurationSec));
      const targetMs = clampedSec * 1000;
      const remainingMs = Math.max(0, this.state.duration - targetMs);
      const now = Date.now();

      const updates = {
        remaining: remainingMs,
        seekRequest: {
          time: clampedSec,
          timestamp: now
        }
      };

      if (this.state.playbackState === 'playing') {
        updates.endAt = now + remainingMs;
      } else {
        updates.endAt = 0;
      }

      this.setState(updates);
    }

    setLoopOpacity(opacityVal) {
      const opacity = Math.max(0, Math.min(1.0, parseFloat(opacityVal) !== undefined ? parseFloat(opacityVal) : 1.0));
      this.setState({
        globalBackground: { ...this.state.globalBackground, opacity }
      });
    }
  }
  window.AppState = AppState;

  // --- 6. TRIPLE-BUS SYNC ---
  class SyncBus {
    constructor(appState, role = 'master', isPreview = false) {
      this.appState = appState;
      this.role = role;
      this.isPreview = isPreview;
      this.displayWindowRef = null;
      this.displayTargets = new Set();

      try {
        this.broadcastChannel = new BroadcastChannel(APP_CONFIG.SYNC_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (e) => this._handleMessage(e.data);
      } catch (e) {
        console.warn('BroadcastChannel kullanılamıyor, fallback devrede.');
      }

      window.addEventListener('storage', (e) => {
        if (e.key === APP_CONFIG.STORAGE_KEY && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this._handleMessage(data);
          } catch (err) {}
        }
        if (e.key === 'MASTER_DISPLAY_CMD' && e.newValue) {
          try {
            const cmdPacket = JSON.parse(e.newValue);
            if (cmdPacket.type === 'CMD_STOP' || cmdPacket.action === 'CMD_STOP') {
              this.appState.stop();
              window.__DisplayRendererInstance?.stopAll();
              window.__AudioManagerInstance?.stopAllAudio();
            }
          } catch(err) {}
        }
      });

      window.addEventListener('message', (e) => {
        if (!e.data) return;
        const data = e.data;

        // Display penceresi veya ön izleme iframe'inden gelen el sıkışma
        if (data.type === 'DISPLAY_HELLO' || data.type === 'REQUEST_STATE' || data.type === 'DISPLAY_READY') {
          if (this.role === 'master' && e.source) {
            this.addDisplayTarget(e.source);
            // Ön izleme iframe'i gerçek bir çıkış ekranı DEĞİLDİR: sesi o çalmaz,
            // bu yüzden onu "bağlı ekran" sayıp master'ın sesini kapatmayız.
            if (data.preview !== true) this._markDisplayAlive();
            this.broadcastState(this.appState.getState());
          }
        }

        // Master'dan gelen durum paketi
        if (data.type === 'MASTER_DISPLAY_SYNC') {
          this._handleMessage(data.payload);
        } else if (data.type === 'STATE_SYNC') {
          this._handleMessage(data);
        }
      });

      // --- TAURI: ayrı WebView pencereleri arası senkron (Rust event rölesi) ---
      // BroadcastChannel/postMessage ayrı WebView'lar arasında çalışmadığı için
      // state tek bir Rust rölesi üzerinden taşınır.
      if (MD.tauri) {
        try {
          let unlistenSync = null;
          let unlistenStatus = null;

          window.__TAURI__.event.listen('md-sync', (ev) => this._handleMessage(ev.payload))
            .then(fn => { unlistenSync = fn; })
            .catch(() => {});

          if (this.role === 'master') {
            window.__TAURI__.event.listen('md-display-status', (ev) => {
              const connected = !ev || !ev.payload || ev.payload.connected !== false;
              if (connected) {
                this._markDisplayAlive();
              } else {
                // LED penceresi kapandı → ses yeniden reji konsoluna döner
                const wasConnected = this.appState.getState().displayConnected;
                this.appState.setState({ displayConnected: false, lastHeartbeat: 0 }, wasConnected);
                if (wasConnected) this.showDisconnectedToast?.();
              }
              this.broadcastState(this.appState.getState());
            }).then(fn => { unlistenStatus = fn; })
              .catch(() => {});
          }

          window.addEventListener('beforeunload', () => {
            if (typeof unlistenSync === 'function') {
              try { unlistenSync(); } catch(e) {}
            }
            if (typeof unlistenStatus === 'function') {
              try { unlistenStatus(); } catch(e) {}
            }
          });
        } catch (e) {
          console.warn('[MD] Tauri event dinleyicisi kurulamadı:', e);
        }
      }

      if (this.role === 'master') {
        this.appState.subscribe(state => this.broadcastState(state));

        // İlk yayın: hiçbir şey değişmese de açık ekranlar mevcut durumu alsın
        this.broadcastState(this.appState.getState());

        // Kalp atışı: state değişmese de saniyede bir yayınla.
        // (Sonradan açılan/ırgalanan bir LED ekranı böylece beklemede kalmaz.)
        setInterval(() => this.broadcastState(this.appState.getState()), 1000);

        window.addEventListener('storage', (e) => {
          if (e.key === 'MASTER_DISPLAY_PULSE') {
            this.broadcastState(this.appState.getState());
          }
        });
        let lastPulse = null;
        setInterval(() => {
          try {
            const p = localStorage.getItem('MASTER_DISPLAY_PULSE');
            if (p && p !== lastPulse) {
              lastPulse = p;
              this.broadcastState(this.appState.getState());
            }
          } catch(e) {}
        }, 150);

        // --- Bağlantı bekçisi ---
        // Tarayıcı modunda: display sessizce ölürse ses master'a geri dönsün.
        // Tauri'de bu işi Rust devralır (pencere kapanınca 'md-display-status'
        // olayı gelir). Tarayıcı zamanlayıcıları arka planda kısıldığı için
        // heartbeat yaşına bakarak bağlantı koparmak YANLIŞ ses yönlendirmesine
        // yol açıyordu (gösteri sırasında ses reji konsoluna dönebiliyordu).
        if (!MD.tauri) {
          setInterval(() => {
            const st = this.appState.getState();
            if (!st.displayConnected) return;
            const hb = st.lastHeartbeat || 0;
            if (Date.now() - hb > APP_CONFIG.HEARTBEAT_TIMEOUT_MS) {
              this.appState.setState({ displayConnected: false, lastHeartbeat: 0 }, true);
              this.showDisconnectedToast?.();
            }
          }, 2000);
        }
      } else if (this.role === 'display') {
        this._initDisplayHandshake();
        this._initDisplayStoragePolling();
      }
    }

    // Display'in canlı olduğunu işaretler.
    _markDisplayAlive() {
      const st = this.appState.getState();
      const changed = !st.displayConnected;
      // Bağlantı değiştiyse dinleyicileri uyar: ses hakemliği (master sus / display çal)
      // ancak bu bildirimle devreye girer.
      this.appState.setState({ displayConnected: true, lastHeartbeat: Date.now() }, changed);
      if (changed) this.showConnectedToast?.();
    }

    /** Reji konsolunun altında kısa süreli durum bildirimi. */
    _toast(text, tone = 'info') {
      if (this.role !== 'master') return;
      try {
        let el = document.getElementById('md-sync-toast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'md-sync-toast';
          el.style.cssText = [
            'position:fixed', 'left:50%', 'bottom:26px', 'transform:translateX(-50%)',
            'z-index:2147483000', 'font:700 12px/1 system-ui,sans-serif',
            'padding:9px 16px', 'border-radius:16px', 'transition:opacity .35s',
            'background:#141a24', 'color:#e2e8f0', 'border:1px solid #4a5568',
            'box-shadow:0 6px 22px rgba(0,0,0,.5)', 'pointer-events:none'
          ].join(';');
          document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.borderColor = tone === 'ok' ? '#2f855a' : (tone === 'warn' ? '#9b2c2c' : '#4a5568');
        el.style.color = tone === 'ok' ? '#68d391' : (tone === 'warn' ? '#fc8181' : '#e2e8f0');
        el.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
      } catch (e) {}
    }

    showConnectedToast() { this._toast('📺 LED ekranı bağlandı — ses artık çıkış ekranında', 'ok'); }
    showDisconnectedToast() { this._toast('🔌 LED ekranı ayrıldı — ses reji konsoluna döndü', 'warn'); }

    _initDisplayStoragePolling() {
      this._lastSeenStorage = null;
      this._lastSeenCmd = null;
      // Tauri'de pencereler arası senkron Rust rölesinden gelir; localStorage
      // yoklaması gereksizdir ve her 40 ms'de JSON ayrıştırıp kare düşürür.
      if (MD.tauri) return;
      const poll = () => {
        try {
          const raw = localStorage.getItem(APP_CONFIG.STORAGE_KEY);
          if (raw && raw !== this._lastSeenStorage) {
            this._lastSeenStorage = raw;
            const packet = JSON.parse(raw);
            this._handleMessage(packet);
          }
          const cmdRaw = localStorage.getItem('MASTER_DISPLAY_CMD');
          if (cmdRaw && cmdRaw !== this._lastSeenCmd) {
            this._lastSeenCmd = cmdRaw;
            const cmdPacket = JSON.parse(cmdRaw);
            if (cmdPacket.type === 'CMD_STOP' || cmdPacket.action === 'CMD_STOP') {
              this.appState.stop();
              window.__DisplayRendererInstance?.stopAll();
              window.__AudioManagerInstance?.stopAllAudio();
            }
          }
        } catch (e) {}
      };
      poll();
      setInterval(poll, 100);
    }

    _initDisplayHandshake() {
      const ping = () => {
        const msg = {
          type: 'DISPLAY_HELLO',
          role: 'display',
          preview: this.isPreview === true,
          timestamp: Date.now()
        };
        try { if (this.broadcastChannel) this.broadcastChannel.postMessage(msg); } catch (e) {}
        try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch (e) {}
        try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch (e) {}
        try { localStorage.setItem('MASTER_DISPLAY_PULSE', String(Date.now())); } catch (e) {}
        // Tauri: master bu sinyalle bağlantıyı görür ve mevcut state'i geri yollar.
        // Ön izleme iframe'i bu sinyali GÖNDERMEZ: sesi o çalmaz, master'ı sessize almamalı.
        if (MD.tauri && !this.isPreview) {
          try { window.__TAURI__.core.invoke('display_heartbeat'); } catch (e) {}
        }
      };

      ping();
      // İlk saniyelerde daha sık dene: ilk state gecikirse ekran boş kalmasın
      [50, 200, 500, 900].forEach(ms => setTimeout(ping, ms));
      setInterval(ping, 1500);
    }

    addDisplayTarget(win) {
      if (!win) return;
      this.displayTargets.add(win);
      try {
        const payload = this._buildPayload(this.appState.getState());
        win.postMessage({ type: 'MASTER_DISPLAY_SYNC', payload }, '*');
      } catch (e) {}
    }

    _buildPayload(state) {
      const rawLive = state.liveItem;
      let cleanLive = null;
      if (rawLive) {
        if (typeof rawLive.toJSON === 'function') {
          cleanLive = rawLive.toJSON();
        } else {
          cleanLive = { ...rawLive };
          delete cleanLive.fileBlob;
        }
      }

      return {
        type: 'STATE_SYNC',
        sender: this.role,
        timestamp: Date.now(),
        state: {
          playbackState: state.playbackState,
          liveItem: cleanLive,
          duration: state.duration,
          remaining: state.remaining,
          endAt: state.endAt,
          stageLock: state.stageLock || false,
          blackout: state.blackout || false,
          liveVisualHidden: Boolean(state.liveVisualHidden),
          ledConfig: state.ledConfig,
          logoConfig: state.logoConfig,
          globalBackground: state.globalBackground,
          audio: state.audio,
          ceremonySettings: state.ceremonySettings,
          transition: state.transition,
          transitionTestId: state.transitionTestId || null,
          seekRequest: state.seekRequest || null,
          playRequestId: state.playRequestId || null,
          displayConnected: Boolean(state.displayConnected),
          rev: state.rev
        }
      };
    }

    broadcastState(state) {
      if (this.role !== 'master') return;
      const payload = this._buildPayload(state);

      // Tauri: asıl kanal — Rust tüm pencerelere yayar
      // (kare başına en fazla 1 IPC; slider gibi yüksek frekanslı akışlarda IPC boğulmaz)
      if (MD.tauri) {
        MD.pushSync(payload);
        // Tauri'de aynı pencerede yer alan ön izleme iframe'ine de yalnız tek postMessage gönder
        try {
          for (let i = 0; i < window.frames.length; i++) {
            try {
              window.frames[i].postMessage({ type: 'MASTER_DISPLAY_SYNC', payload }, '*');
            } catch (err) {}
          }
        } catch (e) {}
        return;
      }

      try { if (this.broadcastChannel) this.broadcastChannel.postMessage(payload); } catch (e) {}
      // localStorage aynası yalnızca tarayıcı modunda gerekli (Tauri'de Rust rölesi var)
      // ve saniyede 4+ kez tam JSON yazmak ana iş parçacığını meşgul ediyordu.
      if (!MD.tauri) {
        const now = Date.now();
        if (!this._lastMirrorAt || now - this._lastMirrorAt >= 200) {
          this._lastMirrorAt = now;
          try {
            localStorage.setItem(APP_CONFIG.STORAGE_KEY, JSON.stringify(payload));
          } catch (e) {}
        }
      }

      if (this.displayWindowRef && !this.displayWindowRef.closed) {
        try { this.displayWindowRef.postMessage({ type: 'MASTER_DISPLAY_SYNC', payload }, '*'); } catch (e) {}
      }

      for (const target of this.displayTargets) {
        try {
          if (!target || target.closed) {
            this.displayTargets.delete(target);
          } else {
            target.postMessage({ type: 'MASTER_DISPLAY_SYNC', payload }, '*');
          }
        } catch (e) {
          this.displayTargets.delete(target);
        }
      }

      try {
        for (let i = 0; i < window.frames.length; i++) {
          try {
            if (!this.displayTargets.has(window.frames[i])) {
              window.frames[i].postMessage({ type: 'MASTER_DISPLAY_SYNC', payload }, '*');
            }
          } catch (err) {}
        }
      } catch (e) {}
    }

    _handleMessage(msg) {
      if (!msg || this.role !== 'display') return;
      const actual = msg.payload || msg;
      if (actual.type === 'CMD_STOP' || actual.action === 'CMD_STOP' || msg.type === 'CMD_STOP' || msg.action === 'CMD_STOP') {
        this.appState.stop();
        window.__DisplayRendererInstance?.stopAll();
        window.__AudioManagerInstance?.stopAllAudio();
        return;
      }
      const st = actual.state || (msg.payload && msg.payload.state) || msg.state;
      if (st) {
        const now = Date.now();
        this._lastStateAt = now;
        // Aynı revizyon paketi birden fazla kanaldan (BroadcastChannel + postMessage + Tauri)
        // geldiğinde yalnız ilkini işle; kalp atışı için 800ms'den eskiyse kabul et.
        if (st.rev !== undefined && st.rev === this._lastHandledRev && (now - (this._lastHandledRevAt || 0) < 800)) {
          return;
        }
        this._lastHandledRev = st.rev;
        this._lastHandledRevAt = now;
        this.appState.setState(st);
      }
    }

    broadcastCommand(cmdName, data = {}) {
      const packet = {
        type: cmdName,
        action: cmdName,
        sender: this.role,
        timestamp: Date.now(),
        ...data
      };

      if (MD.tauri) {
        try { window.__TAURI__.core.invoke('sync_broadcast', { payload: packet }); } catch (e) {}
      }

      try { if (this.broadcastChannel) this.broadcastChannel.postMessage(packet); } catch(e) {}
      try { localStorage.setItem('MASTER_DISPLAY_CMD', JSON.stringify(packet)); } catch(e) {}

      if (this.displayWindowRef && !this.displayWindowRef.closed) {
        try { this.displayWindowRef.postMessage(packet, '*'); } catch(e) {}
      }

      for (const target of this.displayTargets) {
        try {
          if (!target || target.closed) {
            this.displayTargets.delete(target);
          } else {
            target.postMessage(packet, '*');
          }
        } catch (e) {
          this.displayTargets.delete(target);
        }
      }

      try {
        for (let i = 0; i < window.frames.length; i++) {
          try {
            window.frames[i].postMessage(packet, '*');
          } catch(e) {}
        }
      } catch(e) {}
    }

    openDisplayWindow() {
      // Tauri: gerçek WebviewWindow (window.open WebView2'de çalışmaz)
      if (MD.tauri) {
        window.__TAURI__.core.invoke('open_display_window').catch((e) => {
          console.error('[MD] LED ekran penceresi açılamadı:', e);
        });
        return null;
      }

      const url = 'index.html?screen=1';
      const features = 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes';
      if (this.displayWindowRef && !this.displayWindowRef.closed) {
        this.displayWindowRef.focus();
        this.addDisplayTarget(this.displayWindowRef);
        return this.displayWindowRef;
      }
      this.displayWindowRef = window.open(url, 'MasterDisplayStage', features);
      if (this.displayWindowRef) {
        this.addDisplayTarget(this.displayWindowRef);
      }
      return this.displayWindowRef;
    }
  }
  window.SyncBus = SyncBus;

  // --- 7. AUDIO MANAGER ---
  class AudioManager {
    constructor(appState, role = 'master', isPreview = false) {
      this.appState = appState;
      this.role = role;
      this.isPreview = isPreview;
      this.bgMusicAudio = new Audio();
      this.mediaAudio = new Audio();
      this.mediaAudio.preload = 'auto';
      this._bindMediaAudioListeners(this.mediaAudio);

      this.loopAudio = new Audio();
      this.loopAudio.loop = true;

      this.fxAudio = new Audio();
      this.fxAudio.loop = true;

      this._currentLoopAudioSrc = null;
      this._currentFxAudioSrc = null;
      this._currentBgMusicSrc = null;
      this._currentMediaAudioSrc = null;
      this._lastAudioSeek = null;
      this._lastAudioPlayRequestId = null;

      window.__AudioManagerInstance = this;

      this.appState.subscribe(state => this.updateAudioOutputs(state));
    }

    _bindMediaAudioListeners(el) {
      if (!el) return;
      el.addEventListener('ended', () => {
        this.appState.handleItemTimeUp();
      });
      el.addEventListener('loadedmetadata', () => {
        const st = this.appState.getState();
        if (st && st.liveItem && st.liveItem.type === 'audio' && el.duration && Number.isFinite(el.duration)) {
          const exactMs = Math.round(el.duration * 1000);
          if (!st.duration || Math.abs(st.duration - exactMs) > 500) {
            const elapsedMs = Math.round((el.currentTime || 0) * 1000);
            const remMs = Math.max(0, exactMs - elapsedMs);
            this.appState.setState({
              duration: exactMs,
              remaining: remMs,
              endAt: st.playbackState === 'playing' ? (Date.now() + remMs) : 0
            });
          }
        }
      });
    }

    stopAllAudio(smooth = true, durationMs = 450) {
      const all = [this.mediaAudio, this.bgMusicAudio, this.loopAudio, this.fxAudio].filter(Boolean);
      if (smooth) {
        all.forEach(el => {
          if (!el.paused) {
            MD.fadeAudio(el, 0, durationMs, () => {
              try {
                el.pause();
                el.currentTime = 0;
              } catch (e) {}
            });
          }
        });
        setTimeout(() => {
          this._currentMediaAudioSrc = null;
          this._currentLoopAudioSrc = null;
          this._currentFxAudioSrc = null;
        }, durationMs + 25);
      } else {
        all.forEach(el => {
          try {
            el.pause();
            el.currentTime = 0;
          } catch (e) {}
        });
        this._currentMediaAudioSrc = null;
        this._currentLoopAudioSrc = null;
        this._currentFxAudioSrc = null;
      }
    }

    shouldPlaySound() {
      if (this.isPreview) return false;
      if (this.appState.getState().audio?.muted) return false;
      if (this.role === 'display') return true;
      if (this.role === 'master') return !this.appState.getState().displayConnected;
      return false;
    }

    updateAudioOutputs(state) {
      const muted = Boolean(state.audio?.muted);
      const canPlay = this.shouldPlaySound();
      const masterVol = state.audio?.masterVolume !== undefined ? state.audio.masterVolume : 1.0;
      const mediaVol = state.audio?.mediaVolume !== undefined ? state.audio.mediaVolume : 1.0;
      const bgVol = state.audio?.bgMusicVolume !== undefined ? state.audio.bgMusicVolume : 0.7;

      // 1. Loop Sesi (Beat)
      const bgAudioSrc = state.globalBackground?.audioSrc || null;
      const bgAudioEnabled = state.globalBackground?.audioEnabled !== false;
      const audioItemIsLive = Boolean(state.liveItem && state.liveItem.type === 'audio' && state.playbackState === 'playing');
      if (bgAudioSrc) {
        if (this._currentLoopAudioSrc !== bgAudioSrc) {
          this._currentLoopAudioSrc = bgAudioSrc;
          this.loopAudio.loop = true;
          this.loopAudio.src = bgAudioSrc;
          try { this.loopAudio.currentTime = 0; } catch (e) {}
        }
        const loopChannel = state.audio?.loopAudioVolume !== undefined ? state.audio.loopAudioVolume : 0.8;
        const perLoop = Number(state.globalBackground?.audioVolume ?? 0.8);
        const masterGain = MD.audioGain(masterVol);
        const targetVol = Math.max(0, Math.min(1, masterGain * loopChannel * perLoop));
        const shouldPlay = canPlay && !muted && bgAudioEnabled && !audioItemIsLive;
        this.loopAudio.muted = false;
        if (shouldPlay) {
          this._targetLoopVol = targetVol;
          MD.fadeAudio(this.loopAudio, targetVol, 450);
          if (!this._loopAudioFadeAttached && this.loopAudio) {
            this._loopAudioFadeAttached = true;
            this.loopAudio.addEventListener('timeupdate', () => {
              if (!this.loopAudio || this.loopAudio.paused || this.loopAudio._fadeAnimId) return;
              const dur = this.loopAudio.duration;
              const cur = this.loopAudio.currentTime;
              if (isFinite(dur) && dur > 4) {
                const fadeDur = Math.min(3.5, dur * 0.25);
                const remaining = dur - cur;
                const target = this._targetLoopVol !== undefined ? this._targetLoopVol : 0.8;
                if (remaining <= fadeDur && remaining >= 0) {
                  const ratio = Math.max(0, remaining / fadeDur);
                  this.loopAudio.volume = Math.max(0, Math.min(1, target * (ratio * ratio)));
                } else if (cur <= 1.0) {
                  const inRatio = Math.max(0.1, cur / 1.0);
                  this.loopAudio.volume = Math.max(0, Math.min(1, target * inRatio));
                } else {
                  this.loopAudio.volume = target;
                }
              }
            });
          }
        } else {
          MD.fadeAudio(this.loopAudio, 0, 400, () => {
            if (!this.loopAudio.paused) try { this.loopAudio.pause(); } catch (e) {}
          });
        }
      } else {
        if (!this.loopAudio.paused) {
          MD.fadeAudio(this.loopAudio, 0, 350, () => {
            try { this.loopAudio.pause(); } catch (e) {}
            if (this._currentLoopAudioSrc) {
              this.loopAudio.removeAttribute('src');
              this._currentLoopAudioSrc = null;
            }
          });
        } else if (this._currentLoopAudioSrc) {
          this.loopAudio.removeAttribute('src');
          this._currentLoopAudioSrc = null;
        }
      }

      // Yayın durdurulduysa yayına bağlı sesleri kısıp durdur
      if (!state.liveItem || state.playbackState === 'stopped') {
        this._pauseNonLoopAudio(state);
        return;
      }

      // 2. Tören Fon Müziği (bgMusicTrack)
      if (state.audio.bgMusicTrack && state.audio.bgMusicTrack.src) {
        if (this._currentBgMusicSrc !== state.audio.bgMusicTrack.src) {
          this._currentBgMusicSrc = state.audio.bgMusicTrack.src;
          this.bgMusicAudio.src = state.audio.bgMusicTrack.src;
          this.bgMusicAudio.loop = true;
        }
        const targetBgVol = canPlay && !muted ? (MD.audioGain(masterVol) * bgVol) : 0;
        this.bgMusicAudio.muted = false;
        if (state.audio.bgMusicPlaying && canPlay && !muted) {
          MD.fadeAudio(this.bgMusicAudio, targetBgVol, 450);
        } else {
          MD.fadeAudio(this.bgMusicAudio, 0, 400, () => {
            if (!this.bgMusicAudio.paused) try { this.bgMusicAudio.pause(); } catch (e) {}
          });
        }
      } else {
        if (!this.bgMusicAudio.paused) {
          MD.fadeAudio(this.bgMusicAudio, 0, 350, () => {
            try { this.bgMusicAudio.pause(); this.bgMusicAudio.src = ''; } catch (e) {}
            this._currentBgMusicSrc = null;
          });
        } else {
          this._currentBgMusicSrc = null;
        }
      }

      // 3. Medyaya Bağlı Müzik (liveItem.audioTrack)
      const liveItem = state.liveItem;
      const fxTrack = (liveItem && liveItem.type !== 'audio' && liveItem.audioTrack && liveItem.audioTrack.src)
        ? liveItem.audioTrack
        : null;
      if (fxTrack) {
        const fxSrc = fxTrack.src;
        const fxEnabled = fxTrack.enabled !== false;
        if (this._currentFxAudioSrc !== fxSrc) {
          this._currentFxAudioSrc = fxSrc;
          this.fxAudio.src = fxSrc;
          this.fxAudio.loop = true;
          try { this.fxAudio.currentTime = 0; } catch (e) {}
        }
        const fxVol = Number(fxTrack.volume ?? 0.8);
        const fxChannel = state.audio?.fxVolume !== undefined ? state.audio.fxVolume : 0.8;
        const shouldPlayFx = state.playbackState === 'playing' && canPlay && !muted && fxEnabled;
        const targetFxVol = shouldPlayFx ? Math.max(0, Math.min(1, MD.audioGain(masterVol) * fxChannel * fxVol)) : 0;
        this.fxAudio.muted = false;
        if (shouldPlayFx) {
          MD.fadeAudio(this.fxAudio, targetFxVol, 450);
        } else {
          MD.fadeAudio(this.fxAudio, 0, 400, () => {
            if (!this.fxAudio.paused) try { this.fxAudio.pause(); } catch (e) {}
          });
        }
      } else {
        if (!this.fxAudio.paused) {
          MD.fadeAudio(this.fxAudio, 0, 350, () => {
            try { this.fxAudio.pause(); this.fxAudio.removeAttribute('src'); } catch (e) {}
            this._currentFxAudioSrc = null;
          });
        } else if (this._currentFxAudioSrc) {
          this.fxAudio.removeAttribute('src');
          this._currentFxAudioSrc = null;
        }
      }

      // 4. Medya Ses Dosyası (liveItem.type === 'audio')
      if (liveItem && liveItem.type === 'audio' && liveItem.src) {
        const targetMediaVol = (state.playbackState === 'playing' && canPlay && !muted)
          ? Math.max(0, Math.min(1, MD.audioGain(masterVol) * mediaVol))
          : 0;

        if (this._currentMediaAudioSrc !== liveItem.src) {
          // Crossfade: Önceki ses dosyası çalıyorsa yumuşakça söndür
          if (this.mediaAudio && !this.mediaAudio.paused && this._currentMediaAudioSrc) {
            const oldAudio = this.mediaAudio;
            MD.fadeAudio(oldAudio, 0, 400, () => {
              try {
                oldAudio.pause();
                oldAudio.currentTime = 0;
                oldAudio.src = '';
              } catch (e) {}
            });
            this.mediaAudio = new Audio();
            this.mediaAudio.preload = 'auto';
            this._bindMediaAudioListeners(this.mediaAudio);
          }
          this._currentMediaAudioSrc = liveItem.src;
          this.mediaAudio.src = liveItem.src;
          this.mediaAudio.loop = Boolean(liveItem.loop);
        }

        this.mediaAudio.muted = false;

        if (state.playRequestId && this._lastAudioPlayRequestId !== state.playRequestId) {
          this._lastAudioPlayRequestId = state.playRequestId;
          this._lastAudioSeek = null;
          try { this.mediaAudio.currentTime = 0; } catch (e) {}
        }

        if (state.playbackState === 'playing' && canPlay && !muted) {
          MD.fadeAudio(this.mediaAudio, targetMediaVol, 450);
        } else if (state.playbackState === 'paused') {
          MD.fadeAudio(this.mediaAudio, 0, 250, () => {
            if (!this.mediaAudio.paused) try { this.mediaAudio.pause(); } catch (e) {}
          });
        } else {
          MD.fadeAudio(this.mediaAudio, 0, 400, () => {
            if (!this.mediaAudio.paused) try { this.mediaAudio.pause(); } catch (e) {}
          });
        }

        if (state.seekRequest && this._lastAudioSeek !== state.seekRequest.timestamp) {
          this._lastAudioSeek = state.seekRequest.timestamp;
          const reqTime = state.seekRequest.time;
          if (Math.abs(this.mediaAudio.currentTime - reqTime) > 0.08) {
            try { this.mediaAudio.currentTime = reqTime; } catch (e) {}
          }
        }
      } else {
        if (this.mediaAudio && !this.mediaAudio.paused) {
          MD.fadeAudio(this.mediaAudio, 0, 400, () => {
            try { this.mediaAudio.pause(); this.mediaAudio.src = ''; } catch (e) {}
            this._currentMediaAudioSrc = null;
          });
        } else {
          this._currentMediaAudioSrc = null;
        }
      }
    }

    _pauseNonLoopAudio(state) {
      if (this.mediaAudio && !this.mediaAudio.paused) {
        MD.fadeAudio(this.mediaAudio, 0, 400, () => {
          try { this.mediaAudio.pause(); } catch (e) {}
        });
      }
      if (this.bgMusicAudio && !this.bgMusicAudio.paused) {
        MD.fadeAudio(this.bgMusicAudio, 0, 400, () => {
          try { this.bgMusicAudio.pause(); } catch (e) {}
        });
      }
      if (this.fxAudio && !this.fxAudio.paused) {
        MD.fadeAudio(this.fxAudio, 0, 400, () => {
          try { this.fxAudio.pause(); } catch (e) {}
        });
      }
    }

    updateLoopAudioOnly(state, canPlay) {
      const src = state.globalBackground?.audioSrc;
      if (!src) return;
      this._currentLoopAudioSrc = src;
      this.loopAudio.src = src;
      const loopChannel = state.audio?.loopAudioVolume !== undefined ? state.audio.loopAudioVolume : 0.8;
      const perLoop = Number(state.globalBackground?.audioVolume ?? 0.8);
      const masterGain = MD.audioGain(state.audio?.masterVolume ?? 1);
      const vol = Math.max(0, Math.min(1, masterGain * loopChannel * perLoop));
      const muted = Boolean(state.audio?.muted);
      this.loopAudio.muted = false;
      if (canPlay && !muted) {
        MD.fadeAudio(this.loopAudio, vol, 450);
      } else {
        MD.fadeAudio(this.loopAudio, 0, 350, () => {
          if (!this.loopAudio.paused) try { this.loopAudio.pause(); } catch (e) {}
        });
      }
    }
  }

  // --- 8. DISPLAY RENDERER (GPU COMPOSITED & FULL MULTI-MEDIA) ---
  /**
   * Loop videoların döngü (son -> baş) noktalarında keskin "cut" yerine
   * 800 ms yumuşak Crossfade geçişi yapmasını sağlar (A/B çift tamponlu).
   * İzleyici döngünün başa sardığını fark etmez.
   */
  function attachSeamlessLoopCrossfade(primaryVideo, fadeMs = 800) {
    if (!primaryVideo) return null;
    if (primaryVideo._seamlessLoopCtrl) return primaryVideo._seamlessLoopCtrl;
    if (primaryVideo._seamlessLoopBound) return null;
    primaryVideo._seamlessLoopBound = true;
    primaryVideo.loop = false;
    primaryVideo.removeAttribute('loop');
    primaryVideo.muted = true;
    primaryVideo.playsInline = true;

    const parent = primaryVideo.parentElement;
    if (!parent) {
      primaryVideo.loop = true;
      return null;
    }

    const pos = window.getComputedStyle ? window.getComputedStyle(parent).position : '';
    if (!pos || pos === 'static') {
      parent.style.position = 'relative';
    }

    const cloneVideo = primaryVideo.cloneNode(false);
    cloneVideo.removeAttribute('id');
    cloneVideo.removeAttribute('data-loop-overlay');
    cloneVideo.removeAttribute('loop');
    cloneVideo.setAttribute('data-loop-clone', '1');
    cloneVideo.loop = false;
    cloneVideo.muted = true;
    cloneVideo.playsInline = true;
    cloneVideo.preload = 'auto';
    primaryVideo.preload = 'auto';

    const baseTransition = `opacity ${fadeMs}ms ease-in-out`;
    primaryVideo.style.position = 'absolute';
    primaryVideo.style.top = '0';
    primaryVideo.style.left = '0';
    primaryVideo.style.width = '100%';
    primaryVideo.style.height = '100%';
    primaryVideo.style.transition = baseTransition;
    primaryVideo.style.opacity = '1';
    primaryVideo.style.zIndex = '1';

    cloneVideo.style.position = 'absolute';
    cloneVideo.style.top = '0';
    cloneVideo.style.left = '0';
    cloneVideo.style.width = '100%';
    cloneVideo.style.height = '100%';
    cloneVideo.style.objectFit = primaryVideo.style.objectFit || 'cover';
    cloneVideo.style.pointerEvents = 'none';
    cloneVideo.style.transition = baseTransition;
    cloneVideo.style.opacity = '0';
    cloneVideo.style.zIndex = '1';

    parent.insertBefore(cloneVideo, primaryVideo.nextSibling);

    let activeVid = primaryVideo;
    let standbyVid = cloneVideo;
    let isCrossfading = false;
    let fadeTimer = null;
    let rafId = null;
    let currentSrc = primaryVideo.getAttribute('src') || primaryVideo.src || '';

    const getLeadTime = (dur) => {
      const fadeSec = fadeMs / 1000;
      // Normal videolarda 800ms geçiş için ~1.05s önceden başla ki eski video geçiş bitmeden ASLA donmasın
      if (dur > fadeSec * 2.2) {
        return fadeSec + 0.25;
      }
      return dur * 0.45;
    };

    const triggerCrossfade = () => {
      if (isCrossfading) return;
      const src = activeVid.getAttribute('src') || activeVid.src || currentSrc;
      if (!src) return;
      isCrossfading = true;

      // Standby video kaynağını kontrol et
      if (standbyVid.getAttribute('src') !== src && standbyVid.src !== src) {
        standbyVid.setAttribute('src', src);
        standbyVid.load();
      }
      if (Math.abs(standbyVid.currentTime) > 0.05) {
        try { standbyVid.currentTime = 0; } catch (e) {}
      }
      standbyVid.muted = true;
      standbyVid.playsInline = true;

      const dur = activeVid.duration || 10;
      const leadTime = getLeadTime(dur);
      const actualFadeMs = Math.min(fadeMs, Math.max(250, Math.round(leadTime * 850)));
      const transitionStr = `opacity ${actualFadeMs}ms ease-in-out`;

      const startFade = () => {
        // Gelen videoyu üste al (zIndex 2)
        standbyVid.style.zIndex = '2';
        activeVid.style.zIndex = '1';

        standbyVid.style.transition = transitionStr;
        activeVid.style.transition = transitionStr;
        void standbyVid.offsetWidth;
        standbyVid.style.opacity = '1';
        activeVid.style.opacity = '0';

        const outgoingVid = activeVid;
        const incomingVid = standbyVid;
        activeVid = incomingVid;
        standbyVid = outgoingVid;

        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          try {
            outgoingVid.pause();
            outgoingVid.currentTime = 0;
            outgoingVid.style.zIndex = '1';
            outgoingVid.style.opacity = '0';
            incomingVid.style.zIndex = '1';
          } catch (e) {}
          isCrossfading = false;
        }, actualFadeMs + 60);
      };

      const p = standbyVid.play();
      if (p && typeof p.then === 'function') {
        p.then(startFade).catch(() => {
          startFade();
        });
      } else {
        startFade();
      }
    };

    // Yüksek hassasiyetli (16ms) animasyon döngüsü: timeupdate'in 250ms gecikmesini baypas eder
    const checkLoop = () => {
      if (!activeVid.paused && !isCrossfading) {
        const dur = activeVid.duration;
        const cur = activeVid.currentTime;
        if (dur && Number.isFinite(dur) && dur > 0.5) {
          const leadTime = getLeadTime(dur);
          if (dur - cur <= leadTime) {
            triggerCrossfade();
          }
        }
      }
      rafId = requestAnimationFrame(checkLoop);
    };

    const startRaf = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(checkLoop);
      }
    };

    const stopRaf = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onEnded = (e) => {
      const v = e.currentTarget;
      if (v !== activeVid) return;
      if (!isCrossfading) {
        triggerCrossfade();
      }
    };

    primaryVideo.addEventListener('ended', onEnded);
    cloneVideo.addEventListener('ended', onEnded);

    const controller = {
      setSrc(newSrc) {
        if (!newSrc) return;
        if (currentSrc === newSrc && (activeVid.getAttribute('src') === newSrc || activeVid.src === newSrc)) return;
        currentSrc = newSrc;
        if (fadeTimer) {
          clearTimeout(fadeTimer);
          fadeTimer = null;
        }
        isCrossfading = false;
        activeVid = primaryVideo;
        standbyVid = cloneVideo;

        try {
          cloneVideo.pause();
          cloneVideo.style.transition = 'none';
          cloneVideo.style.opacity = '0';
          cloneVideo.style.zIndex = '1';
          cloneVideo.setAttribute('src', newSrc);
          cloneVideo.load();
          cloneVideo.currentTime = 0;
        } catch (e) {}

        try {
          primaryVideo.style.transition = 'none';
          primaryVideo.style.opacity = '1';
          primaryVideo.style.zIndex = '1';
          primaryVideo.setAttribute('src', newSrc);
          primaryVideo.load();
          primaryVideo.currentTime = 0;
          void primaryVideo.offsetWidth;
          primaryVideo.style.transition = baseTransition;
          cloneVideo.style.transition = baseTransition;
        } catch (e) {}
      },
      play() {
        primaryVideo.style.display = 'block';
        cloneVideo.style.display = 'block';
        startRaf();
        if (activeVid.paused) {
          activeVid.play().catch(() => {});
        }
      },
      pause() {
        stopRaf();
        if (fadeTimer) {
          clearTimeout(fadeTimer);
          fadeTimer = null;
        }
        isCrossfading = false;
        try { primaryVideo.pause(); } catch (e) {}
        try { cloneVideo.pause(); } catch (e) {}
      },
      hide() {
        this.pause();
        primaryVideo.style.display = 'none';
        cloneVideo.style.display = 'none';
      },
      isPaused() {
        return activeVid.paused;
      }
    };

    primaryVideo._seamlessLoopCtrl = controller;
    return controller;
  }

  class DisplayRenderer {
    constructor(containerEl, appState, isPreview = false) {
      this.container = containerEl;
      this.appState = appState;
      this.isPreview = isPreview;
      this.currentRenderedId = null;
      this.currentActiveSlide = -1;
      this._lastSeekTimestamp = null;
      this._lastPlayRequestId = null;
      this._trTimers = [];
      this.storageService = new StorageService();

      this._buildDom();
      this._initFullscreenShortcut();
      this._initAlwaysOnTopPin();
      this._startSyncClock();

      window.__DisplayRendererInstance = this;

      if (!this.isPreview) {
        window.addEventListener('resize', () => {
          this._fitViewport(this.appState.getState());
        });
      }

      this.appState.subscribe(state => this.render(state));
      this.render(this.appState.getState());
    }

    stopAll(smooth = true) {
      const dur = smooth ? 450 : 0;
      const runningVideos = this.container ? this.container.querySelectorAll('video') : [];
      runningVideos.forEach(v => {
        MD.fadeAudio(v, 0, dur, () => {
          try {
            v.pause();
            v.currentTime = 0;
            if (!v.classList.contains('bg-video')) {
              v.removeAttribute('src');
              v.load();
            }
          } catch (e) {}
        });
      });
      const runningAudios = this.container ? this.container.querySelectorAll('audio') : [];
      runningAudios.forEach(a => {
        MD.fadeAudio(a, 0, dur, () => {
          try {
            a.pause();
            a.currentTime = 0;
            a.removeAttribute('src');
            a.load();
          } catch (e) {}
        });
      });

      const finishStop = () => {
        if (this._bgLoopCtrl) {
          this._bgLoopCtrl.pause();
        } else if (this.bgVideo) {
          try {
            this.bgVideo.pause();
            this.bgVideo.currentTime = 0;
          } catch (e) {}
        }
        if (this.bgLayer) {
          this.bgLayer.style.display = 'none';
        }
        this.currentRenderedId = null;
        this.currentActiveSlide = -1;
        const settings = this.appState.getState().ceremonySettings || {};
        const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
        if (defPoster && this.mediaContent) {
          this.mediaContent.innerHTML = `
            <div class="media-wrapper" style="opacity:0; transition:opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);">
              <img src="${defPoster}" alt="Tören Sahnesi" class="fit-contain" decoding="async" />
            </div>
          `;
          const wrap = this.mediaContent.querySelector('.media-wrapper');
          if (wrap) {
            void wrap.offsetWidth;
            wrap.style.opacity = '1';
          }
        } else if (this.mediaContent) {
          this.mediaContent.innerHTML = '';
        }
      };

      if (smooth && this.mediaContent) {
        const activeLayers = Array.prototype.slice.call(this.mediaContent.children);
        if (activeLayers.length > 0) {
          activeLayers.forEach(el => {
            el.style.transition = `opacity ${dur}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            el.style.opacity = '0';
          });
          this._clearTrTimers();
          this._trTimers.push(setTimeout(finishStop, dur + 20));
          return;
        }
      }
      finishStop();
    }

    shouldPlayVideoSound(state) {
      if (Boolean(state.audio?.muted)) return false;
      // Gerçek LED ekran penceresi: her zaman ses çalar
      if (!this.isPreview) return true;
      // Ön izleme iframe'i: yalnızca 2. ekran bağlı DEĞİLSE reji konsolu hoparlöründen çalar
      return !state.displayConnected;
    }

    _startSyncClock() {
      let lastCheck = 0;
      const loop = () => {
        const now = Date.now();
        if (now - lastCheck >= 50) {
          lastCheck = now;
          const state = this.appState.getState();

          // 1. Ses Hakemliği: Yalnızca canlı öğe gerçekten bir VİDEO ise ses hakemliği çalışır.
          // MP3/ses yayınında sahnedeki video bir loop videosudur ve her zaman sessiz (muted) kalmalıdır!
          const isLiveVideoItem = Boolean(state && state.liveItem && state.liveItem.type === 'video' && state.playbackState !== 'stopped');
          const canPlayVidSound = isLiveVideoItem && this.shouldPlayVideoSound(state);
          const v = this.mediaContent?.querySelector('.media-wrapper > video') || this.mediaContent?.querySelector('video:not(.md-fill-blur)');
          if (v) {
            const shouldMute = !canPlayVidSound;
            const targetVol = shouldMute ? 0 : Math.max(0, Math.min(1, MD.audioGain(state.audio?.masterVolume ?? 1.0) * (state.audio?.mediaVolume ?? 1.0)));
            if (v.muted !== shouldMute) v.muted = shouldMute;
            if (Math.abs(v.volume - targetVol) > 0.01) v.volume = targetVol;
          }
          if (this.bgVideo && (!this.bgVideo.muted || this.bgVideo.volume !== 0)) {
            this.bgVideo.muted = true;
            this.bgVideo.volume = 0;
          }

          // 2. Canlı Video Faz-Kilidi (PLL) Senkronizasyonu: YALNIZCA canlı öğe 'video' iken çalışır!
          // Ses çıkaran videoda (canPlayVidSound === true) playbackRate değiştirilmez;
          // aksi halde WebAudio/FFmpeg zaman-esnetici (resampler) tamponu sürekli sıfırlanarak seste parazit/çıtırtı üretir!
          if (isLiveVideoItem && state.playbackState === 'playing') {
            const activeVideo = this.mediaContent?.querySelector('.media-wrapper > video') || this.mediaContent?.querySelector('video:not(.md-fill-blur)');
            const fillVideo = this.mediaContent?.querySelector('video.md-fill-blur');
            if (activeVideo && activeVideo.duration > 0 && !activeVideo.seeking) {
              if (activeVideo.playbackRate !== 1.0) {
                activeVideo.playbackRate = 1.0;
              }
              const targetTime = (state.duration > 0 && state.endAt > 0)
                ? Math.max(0, (state.duration - Math.max(0, state.endAt - now)) / 1000)
                : (state.duration > 0 && state.remaining >= 0 ? (state.duration - state.remaining) / 1000 : 0);
              if (targetTime >= 0) {
                const absDiff = Math.abs(activeVideo.currentTime - targetTime);
                const jumpThreshold = canPlayVidSound ? 1.2 : 0.65;
                if (absDiff > jumpThreshold) {
                  try {
                    activeVideo.currentTime = targetTime;
                    if (fillVideo && !fillVideo.seeking) fillVideo.currentTime = targetTime;
                  } catch(e) {}
                }
                if (fillVideo && !fillVideo.seeking && Math.abs(fillVideo.currentTime - activeVideo.currentTime) > 0.6) {
                  try { fillVideo.currentTime = activeVideo.currentTime; } catch(e) {}
                }
              }
            }
          } else if (isLiveVideoItem && state.playbackState === 'paused') {
            const activeVideo = this.mediaContent?.querySelector('.media-wrapper > video') || this.mediaContent?.querySelector('video:not(.md-fill-blur)');
            if (activeVideo && !activeVideo.seeking && state.duration > 0 && state.remaining >= 0) {
              const targetTime = Math.max(0, (state.duration - state.remaining) / 1000);
              if (Math.abs(activeVideo.currentTime - targetTime) > 0.08) {
                try { activeVideo.currentTime = targetTime; } catch(e) {}
              }
            }
          }
        }
        this._syncRafId = requestAnimationFrame(loop);
      };
      this._syncRafId = requestAnimationFrame(loop);
    }

    _buildDom() {
      this.container.innerHTML = `
        <div class="stage-viewport" id="stage-viewport">
          <div class="stage-layer media-layer" id="media-layer">
            <div class="media-container" id="media-content"></div>
          </div>
          <div class="stage-layer background-layer" id="bg-layer">
            <video class="bg-media bg-video" id="bg-video" muted playsinline decoding="async" style="display:none;"></video>
            <div class="bg-media bg-image" id="bg-image" style="display:none;"></div>
          </div>
          <div class="stage-layer logo-layer" id="logo-layer"></div>
          <div class="stage-layer fade-layer" id="fade-layer"></div>
          <div class="stage-layer blackout-layer" id="blackout-layer" style="display:none;"></div>
        </div>
      `;
      this.viewport = this.container.querySelector('#stage-viewport');
      this.bgLayer = this.container.querySelector('#bg-layer');
      this.bgVideo = this.container.querySelector('#bg-video');
      this.bgImage = this.container.querySelector('#bg-image');
      this.mediaLayer = this.container.querySelector('#media-layer');
      this.mediaContent = this.container.querySelector('#media-content');
      this.fadeLayer = this.container.querySelector('#fade-layer');
      this.blackoutLayer = this.container.querySelector('#blackout-layer');
      this.logoLayer = this.container.querySelector('#logo-layer');

      this._currentBgVideoSrc = null;
      if (this.bgVideo) {
        this._bgLoopCtrl = attachSeamlessLoopCrossfade(this.bgVideo, 800);
      }
    }

    /**
     * Kenar boşluğu dolgu katmanını üretir.
     *
     * İçerik "contain" ile yerleştiğinde ekran oranı içerik oranından farklıysa
     * sağda-solda (pillarbox) veya üstte-altta (letterbox) boşluk kalır.
     * Bu katman o boşluğu doldurur:
     *  - blank : hiçbir şey eklenmez (siyah zemin)
     *  - blur  : içeriğin kendisinin bulanık, ekranı kaplayan kopyası
     *  - color : seçilen düz renk
     */
    _buildFillLayer(state, media) {
      const cfg = state.ledConfig || {};
      const fillMode = cfg.fillMode || 'blank';
      const scaleMode = cfg.scaleMode || 'contain';

      // Yalnızca "Sığdır" modunda kenar boşluğu oluşur
      if (scaleMode !== 'contain') return '';

      if (fillMode === 'color') {
        const color = cfg.fillColor || '#000000';
        return `<div class="md-fill-layer"><div class="md-fill-color" style="background:${color};"></div></div>`;
      }
      if (fillMode !== 'blur') return '';
      if (!media || !media.src) return '';

      const blur = Math.max(0, Math.min(60, cfg.blurAmount ?? 28));
      const filter = `filter: blur(${blur}px) brightness(0.62) saturate(1.15);`;

      if (media.type === 'video') {
        // Aynı kaynağın sessiz, döngülü, ekranı kaplayan kopyası
        return `<div class="md-fill-layer">
          <video class="md-fill-blur" src="${media.src}" muted loop autoplay playsinline
                 aria-hidden="true" style="${filter}"></video>
        </div>`;
      }
      return `<div class="md-fill-layer">
        <div class="md-fill-blur" aria-hidden="true"
             style="background-image:url('${media.src}'); ${filter}"></div>
      </div>`;
    }

    /**
     * Eski katmanın video/ses elementlerini serbest bırakır.
     * (Geçiş sırasında son kare görünsün diye kaynak temizliği ertelenir.)
     */
    _releaseOldMedia(nodes, clearSrc) {
      nodes.forEach((el) => {
        MD.fadeAudio(el, 0, 380, () => {
          try {
            el.pause();
            el.currentTime = 0;
            if (clearSrc) {
              el.removeAttribute('src');
              el.load();
            }
          } catch (e) {}
        });
      });
    }

    /**
     * Yeni medyayı geçiş efektleriyle sahneye alır.
     *
     * Seçilen geçiş türü (state.transition) yayına alınan HER öğeye uygulanır:
     *  - cut      : anında, efekt yok
     *  - crossfade: eski görüntü sönerken yenisi belirir (üst üste erime)
     *  - fadeblack: önce siyaha kararır, içerik değişir, sonra aydınlanır
     *
     * @returns {HTMLElement} yeni katman (içindeki video'ya erişmek için)
     */
    _swapMedia(html, state, onOldRemoved, fillInfo) {
      const tr = (state && state.transition) || { type: 'crossfade', duration: 400 };
      const dur = Math.max(0, parseInt(tr.duration, 10) || 0);
      const type = (dur <= 10 || tr.type === 'cut') ? 'cut' : tr.type;

      // Üst üste gelen geçişler birbirini bozmasın: önceki zamanlayıcıları iptal et
      this._clearTrTimers();

      const layer = document.createElement('div');
      layer.className = 'md-media-layer';
      // Kenar boşluğu dolgusu içeriğin ARKASINA yerleşir
      layer.innerHTML = this._buildFillLayer(state, fillInfo) + html;

      const oldLayers = Array.prototype.slice.call(this.mediaContent.children);
      const ease = 'cubic-bezier(0.4, 0, 0.2, 1)';
      const clearOld = () => {
        oldLayers.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
        if (typeof onOldRemoved === 'function') onOldRemoved();
      };

      if (oldLayers.length === 0) {
        layer.style.opacity = '0';
        layer.style.transition = `opacity ${Math.max(350, dur)}ms ${ease}`;
        this.mediaContent.appendChild(layer);
        void layer.offsetWidth;
        layer.style.opacity = '1';
        return layer;
      }

      if (type === 'cut') {
        const cutDur = 250;
        layer.style.opacity = '0';
        layer.style.transition = `opacity ${cutDur}ms ${ease}`;
        this.mediaContent.appendChild(layer);
        oldLayers.forEach(el => {
          el.style.transition = `opacity ${cutDur}ms ${ease}`;
          el.style.opacity = '0';
        });
        void layer.offsetWidth;
        layer.style.opacity = '1';
        this._trTimers.push(setTimeout(clearOld, cutDur + 40));
        return layer;
      }

      if (type === 'fadeblack') {
        // 1) Eski görüntü dururken siyaha karar (dur/2)
        // 2) Tam siyahta içerik değişir
        // 3) Siyah perde kalkar, yeni içerik aydınlanır (dur/2)
        // Böylece başlangıçta siyah flaş olmaz; "karararak geçiş" gerçekten görünür.
        const half = Math.max(120, Math.round(dur / 2));
        const veil = this.fadeLayer;
        layer.style.opacity = '1';

        if (veil) {
          veil.style.transition = `opacity ${half}ms ${ease}`;
          veil.style.display = 'block';
          veil.style.opacity = '0';
          void veil.offsetWidth;
          veil.style.opacity = '1';
        }

        this._trTimers.push(setTimeout(() => {
          clearOld();
          this.mediaContent.appendChild(layer);
          if (veil) {
            veil.style.opacity = '0';
            this._trTimers.push(setTimeout(() => {
              veil.style.display = 'none';
            }, half + 40));
          }
        }, veil ? half : 0));

        return layer;
      }

      if (type === 'cards') {
        // Dağılan kartlar (Cards Disperse):
        // Eski katman: 3D eğilip küçülerek aşağıya dağılır
        // Yeni katman: 3D derinlikten sahneye yerleşir
        layer.style.opacity = '0';
        layer.style.transform = 'scale(1.08) rotate(3deg) translateZ(60px)';
        layer.style.transition = `all ${dur}ms ${ease}`;
        this.mediaContent.appendChild(layer);

        oldLayers.forEach((el) => {
          el.style.transition = `all ${dur}ms ${ease}`;
          el.style.transform = 'scale(0.72) rotate(-12deg) translateY(120px) translateZ(-160px)';
          el.style.opacity = '0';
          el.style.filter = 'blur(4px)';
        });

        void layer.offsetWidth;
        layer.style.opacity = '1';
        layer.style.transform = 'scale(1) rotate(0deg) translateY(0) translateZ(0)';
        this._trTimers.push(setTimeout(clearOld, dur + 60));
        return layer;
      }

      if (type === 'zoom') {
        // Sinematik Zoom & Blur:
        // Eski katman: büyüyerek odak dışına çıkar
        // Yeni katman: netleşerek sahneye yerleşir
        layer.style.opacity = '0';
        layer.style.transform = 'scale(0.85)';
        layer.style.filter = 'blur(8px)';
        layer.style.transition = `all ${dur}ms ${ease}`;
        this.mediaContent.appendChild(layer);

        oldLayers.forEach((el) => {
          el.style.transition = `all ${dur}ms ${ease}`;
          el.style.transform = 'scale(1.3)';
          el.style.opacity = '0';
          el.style.filter = 'blur(12px)';
        });

        void layer.offsetWidth;
        layer.style.opacity = '1';
        layer.style.transform = 'scale(1)';
        layer.style.filter = 'blur(0)';
        this._trTimers.push(setTimeout(clearOld, dur + 60));
        return layer;
      }

      if (type === 'slide') {
        // Slide Push: Sağdan kayarak sahneye itme geçişi
        layer.style.transform = 'translate3d(100%, 0, 0)';
        layer.style.transition = `transform ${dur}ms ${ease}`;
        this.mediaContent.appendChild(layer);

        oldLayers.forEach((el) => {
          el.style.transition = `transform ${dur}ms ${ease}`;
          el.style.transform = 'translate3d(-100%, 0, 0)';
        });

        void layer.offsetWidth;
        layer.style.transform = 'translate3d(0, 0, 0)';
        this._trTimers.push(setTimeout(clearOld, dur + 60));
        return layer;
      }

      if (['sandstorm', 'explode', 'vortex', 'fall', 'wave', 'thanos', 'blinds', 'mosaic'].includes(type)) {
        let visual = null;
        for (const ol of oldLayers) {
          const v = ol.querySelector('video:not(.md-fill-blur), img.md-stage-img, canvas, img, video');
          if (v) { visual = v; break; }
        }

        const rect = this.mediaContent.getBoundingClientRect();
        const W = Math.max(320, Math.round(rect.width || this.mediaContent.offsetWidth || 1280));
        const H = Math.max(180, Math.round(rect.height || this.mediaContent.offsetHeight || 720));

        let snapCanvas = null;
        if (visual) {
          try {
            snapCanvas = document.createElement('canvas');
            snapCanvas.width = W;
            snapCanvas.height = H;
            const sctx = snapCanvas.getContext('2d');
            if (visual.tagName === 'VIDEO' && visual.readyState >= 2) {
              sctx.drawImage(visual, 0, 0, W, H);
            } else if (visual.tagName === 'IMG' && visual.complete && visual.naturalWidth > 0) {
              sctx.drawImage(visual, 0, 0, W, H);
            } else if (visual.tagName === 'CANVAS') {
              sctx.drawImage(visual, 0, 0, W, H);
            } else {
              snapCanvas = null;
            }
          } catch (e) {
            snapCanvas = null;
          }
        }

        if (!snapCanvas) {
          layer.style.opacity = '0';
          layer.style.transition = `opacity ${dur}ms ${ease}`;
          this.mediaContent.appendChild(layer);
          oldLayers.forEach(el => { el.style.transition = `opacity ${dur}ms ${ease}`; el.style.opacity = '0'; });
          void layer.offsetWidth;
          layer.style.opacity = '1';
          this._trTimers.push(setTimeout(clearOld, dur + 60));
          return layer;
        }

        layer.style.opacity = '1';
        this.mediaContent.appendChild(layer);
        oldLayers.forEach(el => { el.style.display = 'none'; });

        const cv = document.createElement('canvas');
        cv.className = 'md-transition-fx-canvas';
        cv.width = W;
        cv.height = H;
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:25;pointer-events:none;';
        this.mediaContent.appendChild(cv);
        this._activeTrCanvas = cv;
        const ctx = cv.getContext('2d');

        let cols = 32;
        let rows = 18;
        if (type === 'sandstorm') { cols = 36; rows = 20; }
        else if (type === 'explode') { cols = 28; rows = 16; }
        else if (type === 'vortex') { cols = 30; rows = 18; }
        else if (type === 'fall') { cols = 28; rows = 16; }
        else if (type === 'wave') { cols = 48; rows = 1; }
        else if (type === 'thanos') { cols = 36; rows = 22; }
        else if (type === 'blinds') { cols = 16; rows = 1; }
        else if (type === 'mosaic') { cols = 24; rows = 14; }

        const tw = W / cols;
        const th = H / rows;
        const total = cols * rows;
        const tiles = new Array(total);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            tiles[idx] = {
              c, r,
              x: c * tw,
              y: r * th,
              rnd1: Math.random(),
              rnd2: Math.random(),
              rnd3: Math.random(),
              rnd4: (Math.random() - 0.5) * 2
            };
          }
        }

        const startTime = performance.now();
        const duration = Math.max(300, dur);

        const renderFrame = (now) => {
          const elapsed = now - startTime;
          const p = Math.min(1, Math.max(0, elapsed / duration));

          ctx.clearRect(0, 0, W, H);

          if (type === 'sandstorm') {
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const delay = (t.c / cols) * 0.45 + t.rnd1 * 0.15;
              const lp = Math.max(0, Math.min(1, (p - delay) / 0.5));
              if (lp >= 1) continue;
              if (lp === 0) {
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, t.x, t.y, tw, th);
                continue;
              }
              const eased = Math.pow(lp, 2);
              const dx = eased * (W * 0.75 + t.rnd2 * W * 0.5);
              const dy = -eased * (H * 0.35 + t.rnd3 * H * 0.3) + Math.sin(lp * 8 + t.r) * 15;
              const scale = Math.max(0, 1 - eased);
              const alpha = Math.max(0, 1 - eased * 1.15);
              const rot = lp * t.rnd4 * 5;

              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(t.x + tw / 2 + dx, t.y + th / 2 + dy);
              ctx.rotate(rot);
              ctx.scale(scale, scale);
              ctx.drawImage(snapCanvas, t.x, t.y, tw, th, -tw / 2, -th / 2, tw, th);
              ctx.restore();
            }
          } else if (type === 'explode') {
            const cx = W / 2;
            const cy = H / 2;
            const maxD = Math.hypot(cx, cy);
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const tcx = t.x + tw / 2;
              const tcy = t.y + th / 2;
              const dx = tcx - cx;
              const dy = tcy - cy;
              const dist = Math.hypot(dx, dy);
              const ang = Math.atan2(dy, dx) + t.rnd4 * 0.35;
              const delay = (dist / maxD) * 0.15;
              const lp = Math.max(0, Math.min(1, (p - delay) / 0.85));
              if (lp >= 1) continue;
              if (lp === 0) {
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, t.x, t.y, tw, th);
                continue;
              }
              const spd = Math.pow(lp, 0.75) * (W * 0.8 + t.rnd1 * W * 0.6);
              const px = Math.cos(ang) * spd;
              const py = Math.sin(ang) * spd + lp * lp * H * 0.25;
              const scale = Math.max(0, 1 - Math.pow(lp, 1.4));
              const alpha = Math.max(0, 1 - Math.pow(lp, 1.8));
              const rot = lp * t.rnd4 * 12;

              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(tcx + px, tcy + py);
              ctx.rotate(rot);
              ctx.scale(scale, scale);
              ctx.drawImage(snapCanvas, t.x, t.y, tw, th, -tw / 2, -th / 2, tw, th);
              ctx.restore();
            }
          } else if (type === 'vortex') {
            const cx = W / 2;
            const cy = H / 2;
            const maxR = Math.hypot(cx, cy);
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const tcx = t.x + tw / 2;
              const tcy = t.y + th / 2;
              const r0 = Math.hypot(tcx - cx, tcy - cy);
              const theta0 = Math.atan2(tcy - cy, tcx - cx);
              const spin = (1 - r0 / maxR) * 6 * Math.PI + 4 * Math.PI;
              const theta = theta0 + p * spin;
              const r = r0 * Math.max(0, 1 - Math.pow(p, 1.5));
              const scale = Math.max(0, 1 - p * 0.95);
              const alpha = Math.max(0, 1 - Math.pow(p, 2.2));
              if (scale <= 0.01 || alpha <= 0.01) continue;

              const px = cx + Math.cos(theta) * r;
              const py = cy + Math.sin(theta) * r;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(px, py);
              ctx.rotate(p * spin * 0.5);
              ctx.scale(scale, scale);
              ctx.drawImage(snapCanvas, t.x, t.y, tw, th, -tw / 2, -th / 2, tw, th);
              ctx.restore();
            }
          } else if (type === 'fall') {
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const delay = (1 - t.r / rows) * 0.25 + t.rnd1 * 0.25;
              const lp = Math.max(0, Math.min(1, (p - delay) / 0.65));
              if (lp >= 1) continue;
              if (lp === 0) {
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, t.x, t.y, tw, th);
                continue;
              }
              const dropY = Math.pow(lp, 2.5) * (H * 1.35);
              const driftX = Math.sin(lp * 5 + t.c) * 35 * t.rnd4;
              const rot = t.rnd4 * 3.5 * lp;
              const alpha = Math.max(0, 1 - Math.pow(lp, 2));

              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(t.x + tw / 2 + driftX, t.y + th / 2 + dropY);
              ctx.rotate(rot);
              ctx.drawImage(snapCanvas, t.x, t.y, tw, th, -tw / 2, -th / 2, tw, th);
              ctx.restore();
            }
          } else if (type === 'wave') {
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const phase = (t.c / cols) * 5 - p * 10;
              const amp = Math.sin(phase) * H * 0.09 * (1 - p);
              const wipeP = Math.max(0, Math.min(1, (p * 1.5 - (t.c / cols) * 0.75)));
              const alpha = Math.max(0, 1 - Math.pow(wipeP, 1.6));
              if (alpha <= 0.01) continue;

              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.drawImage(snapCanvas, t.x, 0, tw, H, t.x, amp, tw, H);
              ctx.restore();
            }
          } else if (type === 'thanos') {
            const cutoff = p * 1.35;
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const relX = t.c / cols;
              if (relX > cutoff) {
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, t.x, t.y, tw, th);
              } else {
                const lp = Math.min(1, (cutoff - relX) / 0.38);
                if (lp >= 1) continue;
                const driftX = Math.pow(lp, 1.4) * (W * 0.35 + t.rnd1 * W * 0.25);
                const driftY = -Math.pow(lp, 1.1) * (H * 0.18 + t.rnd2 * H * 0.2) + t.rnd4 * 25;
                const scale = Math.max(0, 1 - lp);
                const alpha = Math.max(0, 1 - Math.pow(lp, 1.3));
                const rot = lp * t.rnd4 * 4;

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(t.x + tw / 2 + driftX, t.y + th / 2 + driftY);
                ctx.rotate(rot);
                ctx.scale(scale, scale);
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, -tw / 2, -th / 2, tw, th);
                ctx.restore();
              }
            }
          } else if (type === 'blinds') {
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const delay = (t.c / cols) * 0.28;
              const lp = Math.max(0, Math.min(1, (p - delay) / 0.72));
              if (lp >= 1) continue;
              const angle = lp * (Math.PI / 2);
              const effW = Math.max(0.5, Math.cos(angle) * tw);
              const cx = t.x + tw / 2;

              ctx.save();
              ctx.drawImage(snapCanvas, t.x, 0, tw, H, cx - effW / 2, 0, effW, H);
              ctx.fillStyle = `rgba(0, 0, 0, ${Math.sin(angle) * 0.35})`;
              ctx.fillRect(cx - effW / 2, 0, effW, H);
              ctx.restore();
            }
          } else if (type === 'mosaic') {
            for (let i = 0; i < total; i++) {
              const t = tiles[i];
              const rnd = (Math.sin(t.c * 12.9898 + t.r * 78.233) * 43758.5453) % 1;
              const seed = Math.abs(rnd);
              const delay = seed * 0.52;
              const lp = Math.max(0, Math.min(1, (p - delay) / 0.48));
              if (lp >= 1) continue;
              if (lp === 0) {
                ctx.drawImage(snapCanvas, t.x, t.y, tw, th, t.x, t.y, tw, th);
                continue;
              }
              const rotY = lp * Math.PI;
              const scale = Math.max(0, Math.cos(rotY));
              const alpha = Math.max(0, 1 - Math.pow(lp, 2));

              ctx.save();
              ctx.globalAlpha = alpha;
              const cx = t.x + tw / 2;
              const cy = t.y + th / 2;
              ctx.drawImage(snapCanvas, t.x, t.y, tw, th, cx - (tw * scale) / 2, cy - (th * scale) / 2, tw * scale, th * scale);
              ctx.restore();
            }
          }

          if (p < 1) {
            this._trRaf = requestAnimationFrame(renderFrame);
          } else {
            if (cv.parentNode) cv.parentNode.removeChild(cv);
            this._activeTrCanvas = null;
            clearOld();
          }
        };

        this._trRaf = requestAnimationFrame(renderFrame);
        return layer;
      }

      // crossfade: yeni katman üstte belirir, eskiler söner
      layer.style.opacity = '0';
      layer.style.transition = `opacity ${dur}ms ${ease}`;
      this.mediaContent.appendChild(layer);
      oldLayers.forEach((el) => {
        el.style.transition = `opacity ${dur}ms ${ease}`;
        el.style.opacity = '0';
      });
      void layer.offsetWidth; // reflow: geçişin başlaması için
      layer.style.opacity = '1';
      this._trTimers.push(setTimeout(clearOld, dur + 60));
      return layer;
    }

    /** Bekleyen geçiş zamanlayıcılarını iptal eder. */
    _clearTrTimers() {
      if (this._trTimers) {
        this._trTimers.forEach(id => clearTimeout(id));
      }
      this._trTimers = [];
      if (this._trRaf) {
        cancelAnimationFrame(this._trRaf);
        this._trRaf = null;
      }
      if (this._activeTrCanvas && this._activeTrCanvas.parentNode) {
        this._activeTrCanvas.parentNode.removeChild(this._activeTrCanvas);
        this._activeTrCanvas = null;
      }
    }

    /** Sahneyi temizler (geçişsiz). */
    _clearMedia() {
      this.mediaContent.innerHTML = '';
    }

    _initAlwaysOnTopPin() {
      if (this.isPreview) return;

      const pinBtn = document.createElement('button');
      pinBtn.id = 'display-pin-btn';
      pinBtn.type = 'button';
      pinBtn.setAttribute('aria-label', 'Daima Üstte');
      pinBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"></line>
          <path d="M5 17h14v-2l-2-2V5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v8l-2 2v2z"></path>
          <line x1="9" y1="9" x2="15" y2="9"></line>
        </svg>
      `;

      pinBtn.style.cssText = [
        'position:fixed',
        'top:10px',
        'right:10px',
        'z-index:2147483647',
        'width:32px',
        'height:32px',
        'border-radius:50%',
        'border:1px solid rgba(255, 255, 255, 0.2)',
        'background:rgba(15, 20, 30, 0.75)',
        'color:#a0aec0',
        'backdrop-filter:blur(8px)',
        '-webkit-backdrop-filter:blur(8px)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
        'outline:none',
        'opacity:0.35',
        'transition:all 0.25s ease',
        'padding:0',
        'box-shadow:0 4px 12px rgba(0,0,0,0.35)'
      ].join(';');

      let isPinned = false;
      try {
        isPinned = localStorage.getItem('md_display_always_on_top') === 'true';
      } catch(e) {}

      let isHoveringPin = false;
      let hidePinTimer = null;

      const isWindowFullscreen = () => {
        if (this._isDisplayFullscreen) return true;
        if (document.fullscreenElement) return true;
        if (window.innerWidth >= screen.width - 2 && window.innerHeight >= screen.height - 2) return true;
        return false;
      };

      const hidePinBtn = () => {
        if (isHoveringPin && !isWindowFullscreen()) return;
        pinBtn.style.opacity = '0';
        pinBtn.style.pointerEvents = 'none';
      };

      const scheduleHidePin = () => {
        if (hidePinTimer) clearTimeout(hidePinTimer);
        hidePinTimer = setTimeout(hidePinBtn, 2500);
      };

      const showPinTemporarily = () => {
        if (isWindowFullscreen()) {
          pinBtn.style.display = 'none';
          pinBtn.style.opacity = '0';
          pinBtn.style.pointerEvents = 'none';
          return;
        }
        pinBtn.style.display = 'flex';
        pinBtn.style.pointerEvents = 'auto';
        pinBtn.style.opacity = isHoveringPin ? '1' : (isPinned ? '0.9' : '0.45');
        scheduleHidePin();
      };

      this._syncDisplayPinVisibility = () => {
        if (isWindowFullscreen()) {
          if (hidePinTimer) clearTimeout(hidePinTimer);
          pinBtn.style.display = 'none';
          pinBtn.style.opacity = '0';
          pinBtn.style.pointerEvents = 'none';
        } else {
          pinBtn.style.display = 'flex';
          showPinTemporarily();
        }
      };

      const renderPinState = (pinned) => {
        isPinned = pinned;
        if (pinned) {
          pinBtn.style.borderColor = '#ecc94b';
          pinBtn.style.background = 'rgba(26, 32, 44, 0.92)';
          pinBtn.style.color = '#ecc94b';
          pinBtn.style.boxShadow = '0 0 12px rgba(236, 201, 75, 0.45)';
          pinBtn.title = 'Daima Üstte: AÇIK (Sabitlemeyi kaldırmak için tıkla)';
        } else {
          pinBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          pinBtn.style.background = 'rgba(15, 20, 30, 0.75)';
          pinBtn.style.color = '#a0aec0';
          pinBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
          pinBtn.title = 'Daima Üstte: KAPALI (Pencereyi sabitlemek için tıkla)';
        }
        showPinTemporarily();
      };

      pinBtn.addEventListener('mouseenter', () => {
        isHoveringPin = true;
        if (hidePinTimer) clearTimeout(hidePinTimer);
        if (!isWindowFullscreen()) {
          pinBtn.style.opacity = '1';
          pinBtn.style.transform = 'scale(1.08)';
        }
      });
      pinBtn.addEventListener('mouseleave', () => {
        isHoveringPin = false;
        pinBtn.style.transform = 'scale(1)';
        if (!isWindowFullscreen()) {
          pinBtn.style.opacity = isPinned ? '0.9' : '0.45';
          scheduleHidePin();
        }
      });

      window.addEventListener('mousemove', showPinTemporarily, { passive: true });
      window.addEventListener('mousedown', showPinTemporarily, { passive: true });
      window.addEventListener('resize', () => this._syncDisplayPinVisibility?.());
      document.addEventListener('fullscreenchange', () => this._syncDisplayPinVisibility?.());

      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = !isPinned;
        if (MD.tauri) {
          window.__TAURI__.core.invoke('set_display_always_on_top', { alwaysOnTop: next })
            .then((res) => {
              renderPinState(res);
              try { localStorage.setItem('md_display_always_on_top', String(res)); } catch(err) {}
            })
            .catch(() => {
              renderPinState(next);
              try { localStorage.setItem('md_display_always_on_top', String(next)); } catch(err) {}
            });
        } else {
          renderPinState(next);
          try { localStorage.setItem('md_display_always_on_top', String(next)); } catch(err) {}
        }
      });

      renderPinState(isPinned);
      if (isPinned && MD.tauri) {
        window.__TAURI__.core.invoke('set_display_always_on_top', { alwaysOnTop: true }).catch(() => {});
      }

      this.container.appendChild(pinBtn);
    }

    _initFullscreenShortcut() {
      if (this.isPreview) return;

      const toggleFullscreen = () => {
        // Tauri: pencere tam ekranı (daha güvenilir, Esc/F11 simetrik).
        // Tarayıcı: HTML tam ekranı.
        if (MD.tauri) {
          window.__TAURI__.core.invoke('toggle_display_fullscreen')
            .then((isFs) => {
              this._isDisplayFullscreen = Boolean(isFs);
              this._syncDisplayPinVisibility?.();
            })
            .catch(() => {});
          return;
        }
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen()
            .then(() => { this._isDisplayFullscreen = true; this._syncDisplayPinVisibility?.(); })
            .catch(() => {});
        } else {
          document.exitFullscreen()
            .then(() => { this._isDisplayFullscreen = false; this._syncDisplayPinVisibility?.(); })
            .catch(() => {});
        }
      };

      const leaveFullscreen = () => {
        if (MD.tauri) {
          window.__TAURI__.core.invoke('exit_display_fullscreen')
            .then(() => {
              this._isDisplayFullscreen = false;
              this._syncDisplayPinVisibility?.();
            })
            .catch(() => {});
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen()
            .then(() => { this._isDisplayFullscreen = false; this._syncDisplayPinVisibility?.(); })
            .catch(() => {});
        }
      };

      window.addEventListener('dblclick', (e) => {
        if (e.target && e.target.closest && e.target.closest('#display-pin-btn')) return;
        toggleFullscreen();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'F11' || e.code === 'F11') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'Escape') {
          leaveFullscreen();
        }
      });
    }

    /**
     * LED ekran oranını (aspect ratio) pencere boyutu ne olursa olsun korur.
     * Pencere büyütülüp küçültüldüğünde kenarları kırpmaz veya gizlemez;
     * canlı yayında çıkışta ne görünüyorsa birebir aynı ölçekte sığdırır.
     */
    _fitViewport(state) {
      if (!this.viewport) return;
      const cfg = (state && state.ledConfig) || {};
      const targetW = cfg.width || 1536;
      const targetH = cfg.height || 768;
      const aspect = targetW / targetH;

      document.documentElement.style.setProperty('--led-aspect', `${targetW} / ${targetH}`);
      this.viewport.style.aspectRatio = `${targetW} / ${targetH}`;

      if (this.isPreview) {
        this.viewport.style.width = '100%';
        this.viewport.style.height = '100%';
        return;
      }

      const parentW = this.container ? this.container.clientWidth : (window.innerWidth || document.documentElement.clientWidth);
      const parentH = this.container ? this.container.clientHeight : (window.innerHeight || document.documentElement.clientHeight);
      if (!parentW || !parentH) return;

      const parentAspect = parentW / parentH;
      if (parentAspect > aspect) {
        const w = Math.round(parentH * aspect);
        this.viewport.style.width = `${w}px`;
        this.viewport.style.height = `${parentH}px`;
      } else {
        const h = Math.round(parentW / aspect);
        this.viewport.style.width = `${parentW}px`;
        this.viewport.style.height = `${h}px`;
      }
    }

    /**
     * Ölçek (Sığdır / Kapla / Doldur) ve kenar boşluğu doldurma (Boş / Bulanık / Renk)
     * ayarlarını çalışan videoyu durdurmadan, sesi kesmeden ve geçiş (fade) efekti
     * tetiklemeden ANINDA yerinde (in-place) uygular.
     */
    _applyLedConfigInPlace(state) {
      if (!this.mediaContent) return;
      const cfg = (state && state.ledConfig) || {};
      const scaleMode = cfg.scaleMode || 'contain';
      const scaleClass = `fit-${scaleMode}`;

      // 1. Ana medya elemanının ölçek sınıfını anında değiştir (videoyu yeniden yüklemez)
      const mediaEls = this.mediaContent.querySelectorAll('.media-wrapper > img, .media-wrapper > video');
      mediaEls.forEach((el) => {
        el.classList.remove('fit-contain', 'fit-cover', 'fit-fill', 'fit-original');
        el.classList.add(scaleClass);
        if (scaleMode === 'original') {
          const nw = el.videoWidth || el.naturalWidth || (liveItem && liveItem.naturalWidth) || 0;
          const nh = el.videoHeight || el.naturalHeight || (liveItem && liveItem.naturalHeight) || 0;
          const ledW = cfg.width || 1536;
          const ledH = cfg.height || 768;
          if (nw > 0 && nh > 0) {
            el.style.width = `${(nw / ledW) * 100}%`;
            el.style.height = `${(nh / ledH) * 100}%`;
          }
        } else {
          el.style.width = '100%';
          el.style.height = '100%';
        }
      });

      // 2. Kenar boşluğu dolgu katmanını (.md-fill-layer) geçişsiz ve kesintisiz güncelle
      const layers = this.mediaContent.querySelectorAll('.md-media-layer');
      const activeLayer = layers.length > 0 ? layers[layers.length - 1] : null;
      if (!activeLayer) return;

      const existingFill = activeLayer.querySelector('.md-fill-layer');
      const liveItem = state && state.liveItem;
      // MP3 loop veya karartma modunda kenar dolgusu kullanılmaz
      const isAudioLoopOrBlackout = Boolean(
        liveItem &&
        liveItem.type === 'audio' &&
        (state.ceremonySettings?.audioScreenMode === 'loop' || state.ceremonySettings?.audioScreenMode === 'blackout')
      );

      if ((scaleMode !== 'contain' && scaleMode !== 'original') || (cfg.fillMode || 'blank') === 'blank' || isAudioLoopOrBlackout) {
        if (existingFill) {
          const oldBlurVid = existingFill.querySelector('video');
          if (oldBlurVid) {
            try { oldBlurVid.pause(); oldBlurVid.removeAttribute('src'); oldBlurVid.load(); } catch (e) {}
          }
          existingFill.remove();
        }
        return;
      }

      const fillMode = cfg.fillMode || 'blank';
      if (fillMode === 'color') {
        const color = cfg.fillColor || '#000000';
        const existingColorEl = existingFill && existingFill.querySelector('.md-fill-color');
        if (existingColorEl) {
          existingColorEl.style.background = color;
          return;
        }
        if (existingFill) {
          const oldBlurVid = existingFill.querySelector('video');
          if (oldBlurVid) {
            try { oldBlurVid.pause(); oldBlurVid.removeAttribute('src'); oldBlurVid.load(); } catch (e) {}
          }
          existingFill.remove();
        }
        const wrap = document.createElement('div');
        wrap.className = 'md-fill-layer';
        wrap.innerHTML = `<div class="md-fill-color" style="background:${color};"></div>`;
        activeLayer.insertBefore(wrap, activeLayer.firstChild);
        return;
      }

      if (fillMode === 'blur') {
        const blur = Math.max(0, Math.min(60, cfg.blurAmount ?? 28));
        const filterCss = `blur(${blur}px) brightness(0.62) saturate(1.15)`;
        const mainVideo = activeLayer.querySelector('.media-wrapper > video');
        const mainImg = activeLayer.querySelector('.media-wrapper > img');

        if (mainVideo && mainVideo.getAttribute('src')) {
          const vSrc = mainVideo.getAttribute('src');
          const existingBlurVid = existingFill && existingFill.querySelector('video.md-fill-blur');
          if (existingBlurVid && existingBlurVid.getAttribute('src') === vSrc) {
            existingBlurVid.style.filter = filterCss;
            return;
          }
          if (existingFill) existingFill.remove();
          const wrap = document.createElement('div');
          wrap.className = 'md-fill-layer';
          wrap.innerHTML = `<video class="md-fill-blur" src="${vSrc}" muted loop autoplay playsinline aria-hidden="true" style="filter: ${filterCss};"></video>`;
          activeLayer.insertBefore(wrap, activeLayer.firstChild);
          const newBlurVid = wrap.querySelector('video.md-fill-blur');
          if (newBlurVid) {
            try { newBlurVid.currentTime = mainVideo.currentTime || 0; } catch (e) {}
            if (!mainVideo.paused) newBlurVid.play().catch(() => {});
          }
        } else if (mainImg && mainImg.getAttribute('src')) {
          const iSrc = mainImg.getAttribute('src');
          const existingBlurDiv = existingFill && existingFill.querySelector('div.md-fill-blur');
          if (existingBlurDiv) {
            existingBlurDiv.style.backgroundImage = `url('${iSrc}')`;
            existingBlurDiv.style.filter = filterCss;
            return;
          }
          if (existingFill) {
            const oldBlurVid = existingFill.querySelector('video');
            if (oldBlurVid) {
              try { oldBlurVid.pause(); oldBlurVid.removeAttribute('src'); oldBlurVid.load(); } catch (e) {}
            }
            existingFill.remove();
          }
          const wrap = document.createElement('div');
          wrap.className = 'md-fill-layer';
          wrap.innerHTML = `<div class="md-fill-blur" aria-hidden="true" style="background-image:url('${iSrc}'); filter: ${filterCss};"></div>`;
          activeLayer.insertBefore(wrap, activeLayer.firstChild);
        }
      }
    }

    render(state) {
      this._fitViewport(state);
      // "Geçişi Dene": aynı içeriği yeniden çizerek efekti göster
      if (state.transitionTestId && state.transitionTestId !== this._lastTransitionTest) {
        this._lastTransitionTest = state.transitionTestId;
        this.currentRenderedId = null;
        this.currentActiveSlide = -1;
      }
      // Ölçek / kenar dolgusu değiştiyse videoyu/sesi kesmeden ve geçiş efekti uygulamadan ANINDA yerinde güncelle!
      const led = state.ledConfig || {};
      const ledSig = [led.scaleMode, led.fillMode, led.blurAmount, led.fillColor].join('|');
      if (this._lastLedSig !== ledSig) {
        this._lastLedSig = ledSig;
        this._applyLedConfigInPlace(state);
      }
      if (this.blackoutLayer) {
        this.blackoutLayer.style.transition = 'opacity 350ms cubic-bezier(0.4, 0, 0.2, 1)';
        this.blackoutLayer.style.display = 'block';
        this.blackoutLayer.style.pointerEvents = state.blackout ? 'auto' : 'none';
        this.blackoutLayer.style.opacity = state.blackout ? '1' : '0';
      }
      if (this.mediaLayer) {
        const hideVisual = Boolean(state.liveVisualHidden) || Boolean(state.liveItem && state.liveItem.visualEnabled === false);
        this.mediaLayer.style.transition = 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)';
        this.mediaLayer.style.opacity = hideVisual ? '0' : '1';
      }
      this._renderLogos(state.logoConfig);
      this._renderBackground(state.globalBackground, state);
      this._renderMedia(state);
    }

    /**
     * Kalıcı PNG logo katmanı.
     * Konum/boyut ekran oranına göre normalize edilir; LED çıkışı ve
     * önizleme aynı görüntüyü üretir. Değişiklik yoksa DOM'a dokunulmaz.
     */
    _renderLogos(cfg) {
      if (!this.logoLayer) return;
      const layer = this.logoLayer;
      const isEnabled = Boolean(cfg && cfg.enabled !== false);
      const all = Array.isArray(cfg?.logos) ? cfg.logos : [];

      layer.style.transition = 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)';
      if (!isEnabled) {
        layer.style.opacity = '0';
        return;
      }
      layer.style.opacity = '1';

      const sig = all.map((l) => `${l.id}|${l.src}|${l.visible}|${l.x}|${l.y}|${l.w}|${l.opacity}`).join('~');
      if (sig === this._lastLogoSig) return;
      this._lastLogoSig = sig;

      const presentIds = new Set();

      for (const l of all) {
        if (!l || !l.id) continue;
        presentIds.add(l.id);

        let img = layer.querySelector(`[data-logo-id="${l.id}"]`);
        const shouldShow = Boolean(l.src && l.visible !== false);
        const op = Math.max(0, Math.min(1, l.opacity === undefined ? 1 : Number(l.opacity)));

        const x = Math.max(0, Math.min(1, Number(l.x) || 0));
        const y = Math.max(0, Math.min(1, Number(l.y) || 0));
        const w = Math.max(0.01, Math.min(1, Number(l.w) || 0.18));

        if (!img) {
          if (!shouldShow) continue;
          img = document.createElement('img');
          img.className = 'stage-logo';
          img.dataset.logoId = l.id;
          img.alt = l.name || 'Logo';
          img.decoding = 'async';
          img.draggable = false;
          img.src = l.src;
          img.style.transition = 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)';
          img.style.opacity = '0';
          img.style.left = `${(x * 100).toFixed(3)}%`;
          img.style.top = `${(y * 100).toFixed(3)}%`;
          img.style.width = `${(w * 100).toFixed(3)}%`;
          layer.appendChild(img);
          requestAnimationFrame(() => {
            img.style.opacity = String(op);
          });
        } else {
          if (l.src && img.src !== l.src) {
            img.src = l.src;
          }
          img.style.left = `${(x * 100).toFixed(3)}%`;
          img.style.top = `${(y * 100).toFixed(3)}%`;
          img.style.width = `${(w * 100).toFixed(3)}%`;
          img.style.opacity = shouldShow ? String(op) : '0';
        }
      }

      // Layer'da olup artık cfg'de bulunmayan veya silinen logoları fade out ile temizle
      layer.querySelectorAll('.stage-logo').forEach((el) => {
        if (!presentIds.has(el.dataset.logoId)) {
          el.style.opacity = '0';
          setTimeout(() => { if (el.parentNode) el.remove(); }, 420);
        }
      });
    }

    _renderBackground(bg, state) {
      // MP3/ses yayını "loop" modundayken mediaContent zaten tam ekran loop videosu oynatır;
      // bgLayer'da ikinci bir loop videosunu aynı anda çözmek (çift GPU decode) takılmaya yol açar.
      const isAudioLoopActive = Boolean(
        state &&
        state.liveItem &&
        state.liveItem.type === 'audio' &&
        state.playbackState !== 'stopped' &&
        (state.ceremonySettings?.audioScreenMode === 'loop')
      );
      if (!bg || !bg.enabled || isAudioLoopActive) {
        if (this.bgLayer.style.display !== 'none') {
          this.bgLayer.style.transition = 'opacity 350ms cubic-bezier(0.4, 0, 0.2, 1)';
          this.bgLayer.style.opacity = '0';
          setTimeout(() => {
            const curBg = this.appState.getState().globalBackground;
            if (!curBg || !curBg.enabled) {
              this.bgLayer.style.display = 'none';
              if (this._bgLoopCtrl) {
                this._bgLoopCtrl.pause();
              } else if (this.bgVideo && !this.bgVideo.paused) {
                this.bgVideo.pause();
              }
            }
          }, 360);
        }
        return;
      }
      this.bgLayer.style.display = 'block';
      this.bgLayer.style.transition = 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), filter 300ms ease';
      this.bgLayer.style.zIndex = '20';
      this.bgLayer.style.pointerEvents = 'none';
      this.bgLayer.style.willChange = 'opacity, transform, filter';
      this.bgLayer.style.backfaceVisibility = 'hidden';
      const blur = bg.blur || 0;
      const isGrayscale = Boolean(bg.grayscale);
      const isFlipX = Boolean(bg.flipX || bg.flipH);
      const isFlipY = Boolean(bg.flipY || bg.flipV);
      const filters = [];
      if (isGrayscale) filters.push('grayscale(100%) contrast(106%)');
      if (blur > 0) filters.push(`blur(${blur}px)`);
      const filterVal = filters.length > 0 ? filters.join(' ') : 'none';
      if (this.bgLayer.style.filter !== filterVal) this.bgLayer.style.filter = filterVal;
      const scaleX = isFlipX ? -1 : 1;
      const scaleY = isFlipY ? -1 : 1;
      const baseScale = blur > 0 ? 1.06 : 1.0;
      const transformVal = `scale(${scaleX * baseScale}, ${scaleY * baseScale}) translate3d(0,0,0)`;
      if (this.bgLayer.style.transform !== transformVal) this.bgLayer.style.transform = transformVal;
      const opacityVal = String((bg.opacity !== undefined) ? bg.opacity : 0.35);
      if (this.bgLayer.style.opacity !== opacityVal) this.bgLayer.style.opacity = opacityVal;
      if (bg.type === 'video' && bg.src) {
        this.bgImage.style.display = 'none';
        if (this._bgLoopCtrl) {
          if (this._currentBgVideoSrc !== bg.src) {
            this._currentBgVideoSrc = bg.src;
            this._bgLoopCtrl.setSrc(bg.src);
          }
          this._bgLoopCtrl.play();
        } else {
          if (this._currentBgVideoSrc !== bg.src) {
            this._currentBgVideoSrc = bg.src;
            this.bgVideo.src = bg.src;
            this.bgVideo.load();
          }
          this.bgVideo.style.display = 'block';
          if (this.bgVideo.paused) this.bgVideo.play().catch(() => {});
        }
      } else if (bg.type === 'image' && bg.src) {
        this._currentBgVideoSrc = null;
        if (this._bgLoopCtrl) this._bgLoopCtrl.hide();
        else { this.bgVideo.style.display = 'none'; this.bgVideo.pause(); }
        this.bgImage.style.display = 'block';
        this.bgImage.style.backgroundImage = `url('${bg.src}')`;
      } else {
        this._currentBgVideoSrc = null;
        if (this._bgLoopCtrl) this._bgLoopCtrl.hide();
        else { this.bgVideo.style.display = 'none'; this.bgVideo.pause(); }
        this.bgImage.style.display = 'block';
        this.bgImage.style.backgroundImage = 'none';
        this.bgImage.style.backgroundColor = bg.src || '#0a0d14';
      }
    }

    async _renderMedia(state) {
      const liveItem = state.liveItem;
      const settings = state.ceremonySettings || {
        defaultPosterSrc: '',
        defaultPosterTitle: 'Varsayılan Tören Sahnesi',
        audioPosterSrc: '',
        audioPosterTitle: 'Ses Sahne Görseli',
        audioScreenMode: 'audio_poster',
        autoDefaultPosterOnIdle: true
      };

      const scaleClass = `fit-${state.ledConfig?.scaleMode || (liveItem ? liveItem.fitMode : 'contain') || 'contain'}`;

      // Medya yoksa veya oynatma durdurulduysa (Ara / Duraklama / Tören Beklemesi)
      if (!liveItem || state.playbackState === 'stopped') {
        const runningVideos = this.mediaContent.querySelectorAll('video');
        runningVideos.forEach(v => {
          MD.fadeAudio(v, 0, 380, () => {
            try {
              v.pause();
              v.currentTime = 0;
              v.removeAttribute('src');
              v.load();
            } catch (e) {}
          });
        });
        const runningAudios = this.mediaContent.querySelectorAll('audio');
        runningAudios.forEach(a => {
          MD.fadeAudio(a, 0, 380, () => {
            try {
              a.pause();
              a.currentTime = 0;
              a.removeAttribute('src');
              a.load();
            } catch (e) {}
          });
        });

        const activeLayers = Array.prototype.slice.call(this.mediaContent.children);
        const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';

        const performCleanup = () => {
          if (settings.autoDefaultPosterOnIdle !== false && defPoster) {
            if (this.currentRenderedId === '__ceremony_idle_poster__') {
              return;
            }
            this.currentRenderedId = '__ceremony_idle_poster__';
            this.currentActiveSlide = -1;

            this.mediaContent.innerHTML = `
              <div class="media-wrapper" style="opacity:0; transition:opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);">
                <img src="${defPoster}" alt="${settings.defaultPosterTitle || 'Tören Sahnesi'}" class="${scaleClass}" decoding="async" />
              </div>
            `;
            const wrap = this.mediaContent.querySelector('.media-wrapper');
            if (wrap) {
              void wrap.offsetWidth;
              wrap.style.opacity = '1';
            }
          } else {
            this.mediaContent.innerHTML = '';
            this.currentRenderedId = null;
            this.currentActiveSlide = -1;
          }
        };

        if (activeLayers.length > 0 && this.currentRenderedId && this.currentRenderedId !== '__ceremony_idle_poster__') {
          activeLayers.forEach(el => {
            el.style.transition = 'opacity 420ms cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
          });
          this._clearTrTimers();
          this._trTimers.push(setTimeout(() => {
            performCleanup();
          }, 430));
        } else {
          performCleanup();
        }
        return;
      }

      // Medya kimliğini türe göre doğru hesapla (özellikle audio için görsel kimliği dahil et)
      const currentBg = state.globalBackground || {};
      const fallbackLoopSrc = currentBg.src || MD.loopSrc('loop/16871-276488572_medium.mp4');
      let targetRenderId = liveItem.id;
      if (liveItem.type === 'audio') {
        const aMode = settings.audioScreenMode || 'audio_poster';
        const aPoster = (aMode === 'default_poster')
          ? (settings.defaultPosterSrc || settings.posterSrc || '')
          : (settings.audioPosterSrc || settings.defaultPosterSrc || settings.posterSrc || '');
        const aLoop = (aMode === 'loop') ? (settings.audioLoopSrc || fallbackLoopSrc) : '';
        targetRenderId = `__audio_${aMode}_${aPoster}_${aLoop}__`;
      }

      const isSameMedia = (this.currentRenderedId === targetRenderId);
      const isSameSlide = (liveItem.type === 'audio')
        ? true
        : (this.currentActiveSlide === (liveItem.activeSlide || 0));

      const getExactMasterTime = () => (state.duration > 0 && state.endAt > 0)
        ? Math.max(0, (state.duration - Math.max(0, state.endAt - Date.now())) / 1000)
        : (state.duration > 0 && state.remaining >= 0 ? (state.duration - state.remaining) / 1000 : 0);

      if (isSameMedia && isSameSlide) {
        // Ses dosyalarında görsel sahne zaten hazır ve ekranda duruyor, DOM'a ve geçişe asla dokunma!
        if (liveItem.type === 'audio') {
          const loopVid = this.mediaContent.querySelector('video:not([data-loop-clone])');
          if (loopVid && loopVid._seamlessLoopCtrl) {
            loopVid._seamlessLoopCtrl.play();
          } else if (loopVid && loopVid.paused) {
            loopVid.play().catch(() => {});
          }
          return;
        }
        const activeVideo = this.mediaContent.querySelector('.media-wrapper > video') || this.mediaContent.querySelector('video:not(.md-fill-blur)');
        const fillVideo = this.mediaContent.querySelector('video.md-fill-blur');
        if (activeVideo) {
          // Ses Hakemliği: 2. ekran bağlıyken önizleme sessizdir, bağlı değilken reji konsolundan çalar.
          const shouldMute = !this.shouldPlayVideoSound(state);
          const targetVol = shouldMute ? 0 : Math.max(0, Math.min(1, MD.audioGain(state.audio?.masterVolume ?? 1.0) * (state.audio?.mediaVolume ?? 1.0)));
          if (activeVideo.muted !== shouldMute) {
            activeVideo.muted = shouldMute;
          }
          if (Math.abs(activeVideo.volume - targetVol) > 0.01) {
            MD.fadeAudio(activeVideo, targetVol, 150);
          }

          // Yeni bir OYNAT komutu geldiyse videoyu başa sar ve oynat
          if (state.playRequestId && this._lastPlayRequestId !== state.playRequestId) {
            this._lastPlayRequestId = state.playRequestId;
            this._lastSeekTimestamp = null;
            try {
              activeVideo.currentTime = 0;
              if (fillVideo) fillVideo.currentTime = 0;
            } catch(e) {}
          }

          if (state.playbackState === 'playing') {
            if (activeVideo.paused) activeVideo.play().catch(() => {});
            if (fillVideo && fillVideo.paused) fillVideo.play().catch(() => {});
          } else if (state.playbackState === 'paused') {
            if (!activeVideo.paused) activeVideo.pause();
            if (fillVideo && !fillVideo.paused) fillVideo.pause();
          }

          // Scrubber sarma (Seek) isteği: doğrudan videoyu tam hedef kareye zıplat (fastSeek yalnız kilit kareye atladığı için currentTime kullan)
          if (state.seekRequest && this._lastSeekTimestamp !== state.seekRequest.timestamp) {
            this._lastSeekTimestamp = state.seekRequest.timestamp;
            const targetSec = state.seekRequest.time;
            try {
              activeVideo.currentTime = targetSec;
              if (fillVideo) fillVideo.currentTime = targetSec;
            } catch(e) {}
          }
        }
        return;
      }

      // Önceki medyadan kalan çalışan video/sesleri duraklat.
      // Kaynak temizliği geçiş bitince yapılır; böylece crossfade sırasında
      // eski karenin son görüntüsü kaybolmaz.
      const prevVideos = Array.prototype.slice.call(this.mediaContent.querySelectorAll('video'));
      const prevAudios = Array.prototype.slice.call(this.mediaContent.querySelectorAll('audio'));
      this._releaseOldMedia(prevVideos, false);
      this._releaseOldMedia(prevAudios, false);
      const releaseOld = () => {
        this._releaseOldMedia(prevVideos, true);
        this._releaseOldMedia(prevAudios, true);
      };

      this.currentRenderedId = targetRenderId;
      this.currentActiveSlide = (liveItem.type === 'audio') ? 0 : (liveItem.activeSlide || 0);
      this._lastSeekTimestamp = null;
      if (state.playRequestId) {
        this._lastPlayRequestId = state.playRequestId;
      }

      let src = liveItem.src;
      if (liveItem.type !== 'audio' && (!src || src.startsWith('blob:')) && this.storageService) {
        try {
          const stored = await this.storageService.getItem(liveItem.id);
          if (stored && stored.fileBlob) {
            src = URL.createObjectURL(stored.fileBlob);
          }
        } catch (e) {}
      }

      if (liveItem.type === 'image') {
        this._swapMedia(`
          <div class="media-wrapper">
            <img src="${src}" alt="${liveItem.title}" class="${scaleClass}" decoding="async" />
          </div>
        `, state, releaseOld, { type: 'image', src: src });
      } else if (liveItem.type === 'video') {
        const shouldMute = !this.shouldPlayVideoSound(state);
        const targetVol = shouldMute ? 0 : Math.max(0, Math.min(1, MD.audioGain(state.audio?.masterVolume ?? 1.0) * (state.audio?.mediaVolume ?? 1.0)));

        const vLayer = this._swapMedia(`
          <div class="media-wrapper">
            <video src="${src}" class="${scaleClass}" ${shouldMute ? 'muted' : ''} autoplay playsinline decoding="async"></video>
          </div>
        `, state, releaseOld, { type: 'video', src: src });
        const vEl = vLayer.querySelector('.media-wrapper video');
        if (vEl) {
          vEl.muted = shouldMute;
          vEl.volume = 0; // Başlangıç sessiz (Fade-In için)

          const tryPlayVideo = () => {
            if (state.playbackState === 'playing') {
              const p = vEl.play();
              if (p !== undefined) {
                p.then(() => {
                  if (!shouldMute) {
                    MD.fadeAudio(vEl, targetVol, 450);
                  }
                }).catch((err) => {
                  console.warn('[DisplayRenderer] Video oynatma kısıtlandı, sessiz deneniyor:', err);
                  if (!vEl.muted) {
                    vEl.muted = true;
                    vEl.play().catch(() => {});
                    if (!shouldMute) {
                      const unlock = () => {
                        vEl.muted = false;
                        vEl.volume = targetVol;
                        document.removeEventListener('click', unlock);
                        document.removeEventListener('keydown', unlock);
                      };
                      document.addEventListener('click', unlock, { once: true });
                      document.addEventListener('keydown', unlock, { once: true });
                    }
                  }
                });
              }
            }
          };

          vEl.addEventListener('ended', () => {
            this.appState.handleItemTimeUp();
          });



          const initialTarget = getExactMasterTime();
          vEl.addEventListener('loadedmetadata', () => {
            if (state.ledConfig?.scaleMode === 'original') {
              const nw = vEl.videoWidth || 0;
              const nh = vEl.videoHeight || 0;
              const ledW = state.ledConfig?.width || 1536;
              const ledH = state.ledConfig?.height || 768;
              if (nw > 0 && nh > 0) {
                vEl.style.width = `${(nw / ledW) * 100}%`;
                vEl.style.height = `${(nh / ledH) * 100}%`;
              }
            }
            vEl.muted = shouldMute;
            vEl.volume = targetVol;
            if (vEl.duration && Number.isFinite(vEl.duration)) {
              const exactMs = Math.round(vEl.duration * 1000);
              if (!state.duration || Math.abs(state.duration - exactMs) > 500) {
                const elapsedMs = Math.round(getExactMasterTime() * 1000);
                const remMs = Math.max(0, exactMs - elapsedMs);
                this.appState.setState({
                  duration: exactMs,
                  remaining: remMs,
                  endAt: state.playbackState === 'playing' ? (Date.now() + remMs) : 0
                });
              }
            }
            const curTarget = getExactMasterTime();
            if (curTarget > 0.8 && Math.abs(vEl.currentTime - curTarget) > 0.6) {
              try { vEl.currentTime = curTarget; } catch(e) {}
            }
            if (state.playbackState === 'playing' && vEl.paused) {
              tryPlayVideo();
            }
          });

          if (state.seekRequest && state.seekRequest.timestamp && this._lastSeekTimestamp !== state.seekRequest.timestamp) {
            this._lastSeekTimestamp = state.seekRequest.timestamp;
            try { vEl.currentTime = state.seekRequest.time; } catch(e) {}
          } else if (initialTarget > 0) {
            try { vEl.currentTime = initialTarget; } catch(e) {}
          } else {
            vEl.currentTime = 0;
          }

          tryPlayVideo();
        }
      } else if (liveItem.type === 'presentation') {
        let activeSlideUrl = (liveItem.slides && liveItem.slides.length > 0)
          ? liveItem.slides[liveItem.activeSlide || 0]
          : src;
        if (activeSlideUrl && activeSlideUrl.startsWith('blob:') && this.storageService) {
          try {
            const stored = await this.storageService.getItem(liveItem.id);
            if (stored && stored.fileBlob) {
              activeSlideUrl = URL.createObjectURL(stored.fileBlob);
            }
          } catch (e) {}
        }
        this._swapMedia(`
          <div class="media-wrapper">
            <img src="${activeSlideUrl}" alt="Slayt" class="${scaleClass}" decoding="async" />
          </div>
        `, state, releaseOld, { type: 'image', src: activeSlideUrl });
      } else if (liveItem.type === 'audio') {
        // Ses sahnesi kimliğini kaydet: şarkı bitene kadar gereksiz re-render/swap yapılmayacak!
        this.currentRenderedId = targetRenderId;
        this.currentActiveSlide = 0;

        const mode = settings.audioScreenMode || 'audio_poster';
        const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
        const audioVisualSrc = (mode === 'default_poster')
          ? defPoster
          : (settings.audioPosterSrc || defPoster);

        if (mode === 'loop') {
          const customLoop = settings.audioLoopSrc || fallbackLoopSrc || '';
          if (customLoop) {
            const loopLayer = this._swapMedia(`
              <div class="media-wrapper">
                <video src="${customLoop}" autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
              </div>
            `, state, releaseOld, null);
            const loopVid = loopLayer && loopLayer.querySelector('.media-wrapper > video');
            if (loopVid) {
              const ctrl = attachSeamlessLoopCrossfade(loopVid, 800);
              if (ctrl) ctrl.play();
            }
          } else {
            this.mediaContent.innerHTML = '';
            releaseOld();
          }
        } else if (mode === 'blackout') {
          this._swapMedia(`
            <div class="media-wrapper" style="background:#000000; width:100%; height:100%;"></div>
          `, state, releaseOld, null);
        } else {
          if (!audioVisualSrc) {
            this._swapMedia(`
              <div class="media-wrapper md-neutral-stage"></div>
            `, state, releaseOld, null);
          } else {
            this._swapMedia(`
              <div class="media-wrapper">
                <img src="${audioVisualSrc}" alt="" class="${scaleClass}" decoding="async" />
              </div>
            `, state, releaseOld, { type: 'image', src: audioVisualSrc });
          }
        }
      }
    }
  }
  window.DisplayRenderer = DisplayRenderer;
  // Teşhis / test araçları için: dosya işleme hattına dışarıdan erişim
  window.PresentationHandler = PresentationHandler;
  PresentationHandler._paths = new Map();
  PresentationHandler._seq = 0;
  class StorageService {
    constructor() {
      this.dbName = 'MasterDisplayDB_v2';
      this.storeName = 'playlist_store';
      this.db = null;
      this._initPromise = this._initDb();
    }

    _initDb() {
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open(this.dbName, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
              db.createObjectStore(this.storeName, { keyPath: 'id' });
            }
          };
          req.onsuccess = (e) => {
            this.db = e.target.result;
            resolve(this.db);
          };
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async savePlaylist(items) {
      await this._initPromise;
      const ready = items.filter(it => !it.pending);
      if (!this.db) {
        try {
          const simple = ready.map((it, idx) => ({
            id: it.id,
            order: idx,
            title: it.title,
            type: it.type,
            src: (it.src && !it.src.startsWith('blob:')) ? it.src : '',
            duration: it.duration,
            autoNext: it.autoNext,
            notes: it.notes,
            audioTrack: it.audioTrack || null,
            loopTrack: it.loopTrack || null,
            visualEnabled: it.visualEnabled !== false
          }));
          localStorage.setItem('master_display_playlist_backup', JSON.stringify(simple));
        } catch (e) {}
        return;
      }

      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction([this.storeName], 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.clear();

          ready.forEach((item, index) => {
            store.put({
              id: item.id || `item_${Date.now()}_${index}`,
              order: index,
              title: item.title,
              type: item.type,
              duration: item.duration,
              autoNext: item.autoNext,
              fitMode: item.fitMode || 'contain',
              notes: item.notes || '',
              fileName: item.fileName || '',
              filePath: item.filePath || item.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(item.src) : '') || '',
              fileSize: item.fileSize || 0,
              mdPath: item.mdPath || '',
              slides: Array.isArray(item.slides) ? item.slides : [],
              slidesPdf: item.slidesPdf || '',
              slidesPdfPath: item.slidesPdfPath || '',
              activeSlide: item.activeSlide || 0,
              audioTrack: item.audioTrack || null,
              loopTrack: item.loopTrack || null,
              visualEnabled: item.visualEnabled !== false,
              fileBlob: item.fileBlob || null,
              src: (item.src && !item.src.startsWith('blob:')) ? item.src : ''
            });
          });

          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }

    async loadPlaylist() {
      await this._initPromise;
      if (!this.db) {
        try {
          const raw = localStorage.getItem('master_display_playlist_backup');
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      }

      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction([this.storeName], 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.getAll();

          req.onsuccess = () => {
            const rawItems = (req.result || []).filter(r => r && r.type !== 'poster' && !String(r.id || '').startsWith('__poster_'));
            rawItems.sort((a, b) => (a.order || 0) - (b.order || 0));

            const items = rawItems.map(raw => {
              let src = raw.src;
              if (!src && raw.fileBlob) {
                try {
                  src = URL.createObjectURL(raw.fileBlob);
                } catch (e) {
                  console.error('Blob URL oluşturulamadı:', e);
                }
              }

              const finalDuration = ((raw.type === 'image' || raw.type === 'presentation') && raw.duration === 8)
                ? 0
                : (raw.duration || 0);

              return new MediaItem({
                id: raw.id,
                title: raw.title,
                type: raw.type,
                src: src || '',
                fileName: raw.fileName || '',
                filePath: raw.filePath || raw.mdPath || '',
                fileSize: raw.fileSize || 0,
                mdPath: raw.mdPath || '',
                slidesPdf: raw.slidesPdf || '',
                slidesPdfPath: raw.slidesPdfPath || '',
                duration: finalDuration,
                autoNext: raw.autoNext,
                fitMode: raw.fitMode,
                notes: raw.notes,
                audioTrack: raw.audioTrack || null,
                loopTrack: raw.loopTrack || null,
                visualEnabled: raw.visualEnabled !== false,
                fileBlob: raw.fileBlob || null,
                slides: Array.isArray(raw.slides) && raw.slides.length ? raw.slides : (src ? [src] : []),
                activeSlide: raw.activeSlide || 0
              });
            });

            resolve(items);
          };

          req.onerror = () => resolve([]);
        } catch (err) {
          resolve([]);
        }
      });
    }

    async getItem(id) {
      await this._initPromise;
      if (!this.db) return null;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction([this.storeName], 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async clearPlaylist() {
      await this._initPromise;
      if (this.db) {
        try {
          const tx = this.db.transaction([this.storeName], 'readwrite');
          tx.objectStore(this.storeName).clear();
        } catch (e) {}
      }
      try {
        localStorage.removeItem('master_display_playlist_backup');
      } catch (e) {}
    }

    /** Tek kayıt yazar (afiş dosyaları gibi akış dışı öğeler için). */
    async putItem(record) {
      await this._initPromise;
      if (!this.db || !record || !record.id) return false;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction([this.storeName], 'readwrite');
          tx.objectStore(this.storeName).put(record);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }
  }

  // --- 10. LAYOUT SPLITTER MANAGER (PANEL BOYUTLANDIRICI) ---
  class LayoutSplitterManager {
    constructor() {
      this.storageKey = 'master_display_layout_sizes_v1';
      this.lockStorageKey = 'master_display_layout_locked_v1';
      this.colLeft = 290;
      this.colRight = 340;
      this.rowBottom = Math.round(Math.min(320, Math.max(220, (window.innerHeight || 900) * 0.34)));
      this.isLocked = false;

      this._loadSavedSizes();
      this._loadLockState();
      this._applySizes();
      this._initSplitters();
      this._initLockButton();
      window.__LayoutSplitterManager = this;
    }

    _loadSavedSizes() {
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.colLeft) this.colLeft = parsed.colLeft;
          if (parsed.colRight) this.colRight = parsed.colRight;
          if (parsed.rowBottom) this.rowBottom = parsed.rowBottom;
          this._applySizes();
        }
      } catch (e) {}
    }

    _saveSizes() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({
          colLeft: this.colLeft,
          colRight: this.colRight,
          rowBottom: this.rowBottom
        }));
      } catch (e) {}
    }

    _applySizes() {
      document.documentElement.style.setProperty('--col-left-width', `${this.colLeft}px`);
      document.documentElement.style.setProperty('--col-right-width', `${this.colRight}px`);
      document.documentElement.style.setProperty('--row-bottom-height', `${this.rowBottom}px`);
    }

    _loadLockState() {
      try {
        this.isLocked = localStorage.getItem(this.lockStorageKey) === 'true';
      } catch (e) {
        this.isLocked = false;
      }
      this._applyLockUi();
    }

    _applyLockUi() {
      if (this.isLocked) {
        document.body.classList.add('layout-locked');
      } else {
        document.body.classList.remove('layout-locked');
      }
      const btn = document.getElementById('btn-lock-layout');
      const label = document.getElementById('label-lock-layout');
      const shackle = document.getElementById('path-lock-shackle');
      if (btn) {
        if (this.isLocked) {
          btn.classList.add('is-locked');
          btn.title = 'Panel Ayraçları Kilitli (Boyutlar sabitlendi. Kilidi açmak için tıklayın)';
          if (label) label.textContent = 'Kilitli';
          if (shackle) shackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
        } else {
          btn.classList.remove('is-locked');
          btn.title = 'Panel Ayraçlarını Kilitle (Mevcut boyutları sabitle)';
          if (label) label.textContent = 'Kilit';
          if (shackle) shackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 9.9-1');
        }
      }

      const chk = document.getElementById('chk-setting-lock-layout');
      const badge = document.getElementById('badge-setting-lock-status');
      if (chk) chk.checked = this.isLocked;
      if (badge) {
        badge.textContent = this.isLocked ? 'Kilitli' : 'Serbest';
        badge.style.background = this.isLocked ? '#ef444426' : 'var(--bg-card)';
        badge.style.color = this.isLocked ? '#f87171' : 'var(--text-dim)';
      }

      const splitters = [
        document.getElementById('splitter-v1'),
        document.getElementById('splitter-v2'),
        document.getElementById('splitter-h')
      ].filter(Boolean);

      splitters.forEach(s => {
        if (this.isLocked) {
          s.title = '🔒 Panel Ayraçları Kilitli (Boyutlar sabit. Kilidi açmak için çift tıklayın)';
        } else {
          s.title = s.id === 'splitter-h'
            ? 'Yüksekliği Ayarlamak İçin Sürükleyin (Kilitlemek için çift tıklayın)'
            : 'Genişliği Ayarlamak İçin Sürükleyin (Kilitlemek için çift tıklayın)';
        }
      });
    }

    toggleLock(showToast = true) {
      this.isLocked = !this.isLocked;
      try {
        localStorage.setItem(this.lockStorageKey, this.isLocked ? 'true' : 'false');
      } catch (e) {}
      this._applyLockUi();
      if (showToast) {
        const toastFn = window.__MasterApp?.controller?._toast;
        if (this.isLocked) {
          toastFn?.('🔒 Panel ayraçları kilitlendi (Boyutlar sabitlendi)', 'ok');
        } else {
          toastFn?.('🔓 Panel ayraçlarının kilidi açıldı (Boyutlandırılabilir)', 'info');
        }
      }
    }

    _initLockButton() {
      const btn = document.getElementById('btn-lock-layout');
      if (btn) {
        btn.addEventListener('click', () => {
          this.toggleLock(true);
        });
      }
      this._applyLockUi();
    }

    _initSplitters() {
      const splittersV1 = [document.getElementById('splitter-v1'), document.getElementById('splitter-v3')].filter(Boolean);
      const splittersV2 = [document.getElementById('splitter-v2'), document.getElementById('splitter-v4')].filter(Boolean);
      const splitterH = document.getElementById('splitter-h');
      const workspace = document.querySelector('.workspace-grid');

      // 1. Sol Dikey Ayırıcılar (V1 & V3)
      splittersV1.forEach(sp => {
        sp.addEventListener('dblclick', () => {
          this.toggleLock(true);
        });

        sp.addEventListener('pointerdown', (e) => {
          if (this.isLocked) {
            e.preventDefault();
            const toastFn = window.__MasterApp?.controller?._toast;
            toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için Ayarlar menüsünü kullanın veya ayraçlara çift tıklayın.', 'info');
            return;
          }
          e.preventDefault();
          try { sp.setPointerCapture(e.pointerId); } catch (err) {}
          sp.classList.add('dragging');
          document.body.classList.add('is-resizing', 'is-resizing-v');

          const onPointerMove = (ev) => {
            const rect = workspace ? workspace.getBoundingClientRect() : { left: 0, width: window.innerWidth };
            const minW = 180;
            const maxW = Math.max(minW, Math.min(rect.width - this.colRight - 320, 600));
            const newW = Math.round(Math.max(minW, Math.min(ev.clientX - rect.left, maxW)));
            this.colLeft = newW;
            document.documentElement.style.setProperty('--col-left-width', `${newW}px`);
          };

          const onPointerUp = (ev) => {
            try { sp.releasePointerCapture(ev.pointerId); } catch (err) {}
            sp.classList.remove('dragging');
            document.body.classList.remove('is-resizing', 'is-resizing-v');
            sp.removeEventListener('pointermove', onPointerMove);
            sp.removeEventListener('pointerup', onPointerUp);
            this._saveSizes();
          };

          sp.addEventListener('pointermove', onPointerMove);
          sp.addEventListener('pointerup', onPointerUp);
        });
      });

      // 2. Sağ Dikey Ayırıcılar (V2 & V4)
      splittersV2.forEach(sp => {
        sp.addEventListener('dblclick', () => {
          this.toggleLock(true);
        });

        sp.addEventListener('pointerdown', (e) => {
          if (this.isLocked) {
            e.preventDefault();
            const toastFn = window.__MasterApp?.controller?._toast;
            toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için Ayarlar menüsünü kullanın veya ayraçlara çift tıklayın.', 'info');
            return;
          }
          e.preventDefault();
          try { sp.setPointerCapture(e.pointerId); } catch (err) {}
          sp.classList.add('dragging');
          document.body.classList.add('is-resizing', 'is-resizing-v');

          const onPointerMove = (ev) => {
            const rect = workspace ? workspace.getBoundingClientRect() : { right: window.innerWidth, width: window.innerWidth };
            const minW = 200;
            const maxW = Math.max(minW, Math.min(rect.width - this.colLeft - 320, 650));
            const newW = Math.round(Math.max(minW, Math.min(rect.right - ev.clientX, maxW)));
            this.colRight = newW;
            document.documentElement.style.setProperty('--col-right-width', `${newW}px`);
          };

          const onPointerUp = (ev) => {
            try { sp.releasePointerCapture(ev.pointerId); } catch (err) {}
            sp.classList.remove('dragging');
            document.body.classList.remove('is-resizing', 'is-resizing-v');
            sp.removeEventListener('pointermove', onPointerMove);
            sp.removeEventListener('pointerup', onPointerUp);
            this._saveSizes();
          };

          sp.addEventListener('pointermove', onPointerMove);
          sp.addEventListener('pointerup', onPointerUp);
        });
      });

      // 3. Yatay Ayırıcı (H)
      if (splitterH) {
        splitterH.addEventListener('dblclick', () => {
          this.toggleLock(true);
        });

        splitterH.addEventListener('pointerdown', (e) => {
          if (this.isLocked) {
            e.preventDefault();
            const toastFn = window.__MasterApp?.controller?._toast;
            toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için Ayarlar menüsünü kullanın veya ayraçlara çift tıklayın.', 'info');
            return;
          }
          e.preventDefault();
          try { splitterH.setPointerCapture(e.pointerId); } catch (err) {}
          splitterH.classList.add('dragging');
          document.body.classList.add('is-resizing', 'is-resizing-h');

          const onPointerMove = (ev) => {
            const rect = workspace ? workspace.getBoundingClientRect() : { bottom: window.innerHeight, height: window.innerHeight };
            const minH = 140;
            const maxH = Math.max(minH, Math.min(rect.height - 200, 500));
            const newH = Math.round(Math.max(minH, Math.min(rect.bottom - ev.clientY, maxH)));
            this.rowBottom = newH;
            document.documentElement.style.setProperty('--row-bottom-height', `${newH}px`);
          };

          const onPointerUp = (ev) => {
            try { splitterH.releasePointerCapture(ev.pointerId); } catch (err) {}
            splitterH.classList.remove('dragging');
            document.body.classList.remove('is-resizing', 'is-resizing-h');
            splitterH.removeEventListener('pointermove', onPointerMove);
            splitterH.removeEventListener('pointerup', onPointerUp);
            this._saveSizes();
          };

          splitterH.addEventListener('pointermove', onPointerMove);
          splitterH.addEventListener('pointerup', onPointerUp);
        });
      }
    }
  }

  // --- 11. KEEP AWAKE MANAGER (CAFFEINE / UYANIK KALMA) ---
  class KeepAwakeManager {
    constructor() {
      this.storageKey = 'md_keep_awake_enabled_v1';
      this.isEnabled = true; // Varsayılan: Açık (Tören ve sahnede ekran kapanmamalı)
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved !== null) {
          this.isEnabled = (saved === 'true');
        }
      } catch (e) {
        this.isEnabled = true;
      }
      this._wakeLockSentinel = null;
      window.__KeepAwakeManager = this;
    }

    init() {
      this.apply(this.isEnabled, false);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isEnabled) {
          this._requestWakeLock();
        }
      });
    }

    async setEnabled(enabled, showToast = true) {
      this.isEnabled = Boolean(enabled);
      try {
        localStorage.setItem(this.storageKey, this.isEnabled ? 'true' : 'false');
      } catch (e) {}
      await this.apply(this.isEnabled, showToast);
    }

    async apply(enabled, showToast = false) {
      // 1. Windows Win32 API üzerinden (Tauri invoke SetThreadExecutionState)
      try {
        if (window.__TAURI__?.core?.invoke) {
          await window.__TAURI__.core.invoke('set_keep_awake', { enabled });
        }
      } catch (err) {
        console.warn('[KeepAwake] Tauri invoke hatası:', err);
      }

      // 2. Web Screen Wake Lock API üzerinden
      if (enabled) {
        await this._requestWakeLock();
      } else {
        this._releaseWakeLock();
      }

      const chk = document.getElementById('chk-setting-keep-awake');
      if (chk) chk.checked = this.isEnabled;

      if (showToast) {
        const toastFn = window.__MasterApp?.controller?._toast;
        if (this.isEnabled) {
          toastFn?.('☕ Uyanık Kalma (Caffeine) aktif: Sistem ve ekran uykuya geçmeyecek.', 'ok');
        } else {
          toastFn?.('Standart güç yönetimine dönüldü: Sistem normal uyku ayarlarına uyacak.', 'info');
        }
      }
    }

    async _requestWakeLock() {
      try {
        if ('wakeLock' in navigator && !this._wakeLockSentinel) {
          this._wakeLockSentinel = await navigator.wakeLock.request('screen');
          this._wakeLockSentinel.addEventListener('release', () => {
            this._wakeLockSentinel = null;
          });
        }
      } catch (e) {}
    }

    _releaseWakeLock() {
      if (this._wakeLockSentinel) {
        try {
          this._wakeLockSentinel.release();
        } catch (e) {}
        this._wakeLockSentinel = null;
      }
    }
  }

  class MasterController {
    constructor(appState, syncBus, audioManager) {
      this.appState = appState;
      this.syncBus = syncBus;
      this.audioManager = audioManager;

      this.fadeSpeed = 400;
      this.selectedItemIndex = 0;
      this.draggedIndex = null;
      this.previewLoopSrc = null;
      this.previewLoopEnabled = false;
      this.forcePreview = false;
      this._previewItemId = null;

      this._toast = (text, tone) => this.syncBus?._toast?.(text, tone);

      this.storageService = new StorageService();
      this.layoutSplitter = new LayoutSplitterManager();
      this._bindDomElements();
      this._initEvents();
      this._initKeyboardShortcuts();

      this.appState.subscribe(state => this.updateUI(state));
      this._watchBeatLifecycle();

      // Loop müziği ayarı arka plan katmanına geri yüklenir (kalıcı: ceremonySettings).
      // globalBackground kendi başına diske yazılmadığı için açılışta buradan kurulur.
      const _bootCs = this.appState.getState().ceremonySettings || {};
      if (_bootCs.audioLoopMusicSrc) {
        this.appState.setGlobalBackground({
          audioSrc: _bootCs.audioLoopMusicSrc,
          audioName: _bootCs.audioLoopMusicName || null
        });
      }

      this.initPlaylist();
      this.updateUI(this.appState.getState());
    }

    /**
     * Beat arka plan müziğinin ömrü.
     *
     * Kural (yalnızca Ses Kütüphanesi için): yayınlanan beat parça biter ve
     * kendini tekrar eder; akışta BAŞKA bir öğe yayına alındığında susar.
     * Akış (playlist) öğelerinin loop ayarlarına dokunulmaz.
     */
    _watchBeatLifecycle() {
      this._beatWatchedPlayRequestId = this.appState.getState().playRequestId || null;
      this.appState.subscribe((state) => {
        if (state.role && state.role !== 'master') return;
        const pid = state.playRequestId || null;
        if (!pid || pid === this._beatWatchedPlayRequestId) return;
        this._beatWatchedPlayRequestId = pid;

        const bg = state.globalBackground || {};
        if (!bg.audioSrc) return;

        // Akışta başka bir öğeye geçildi → beat arka plan müziği durur.
        this.appState.setGlobalBackground({ audioSrc: null, audioName: null, audioEnabled: false });
        this.audioManager?._stopLoopAudio?.();
      });
    }


    _bindDomElements() {
      // [1] Üst Bar & Ayarlar
      this.btnOpenDisplay = document.getElementById('btn-open-display');
      this.btnPanic = document.getElementById('btn-panic');
      this.btnBroadcastLive = document.getElementById('btn-broadcast-live');
      this.btnSettingsQuick = document.getElementById('btn-settings-quick');
      this.menuSettings = document.getElementById('menu-settings');

      // Tören Ayarları Modalı
      this.modalCeremonySettings = document.getElementById('modal-ceremony-settings');
      this.btnCloseSettingsModal = document.getElementById('btn-close-settings-modal');
      this.btnCancelSettings = document.getElementById('btn-cancel-settings');
      this.btnSaveCeremonySettings = document.getElementById('btn-save-ceremony-settings');
      this.btnUploadCeremonyPoster = document.getElementById('btn-upload-ceremony-poster');
      this.ceremonyPosterFileInput = document.getElementById('ceremony-poster-file-input');
      this.settingsPosterImg = document.getElementById('settings-poster-img');
      this.chkAutoDefaultPoster = document.getElementById('chk-auto-default-poster');
      this.btnUploadAudioPoster = document.getElementById('btn-upload-audio-poster');
      this.audioPosterFileInput = document.getElementById('audio-poster-file-input');
      this.settingsAudioPosterImg = document.getElementById('settings-audio-poster-img');

      // Logo Ayarları Modalı
      this.modalLogoSettings = document.getElementById('modal-logo-settings');
      this.btnLogoQuick = document.getElementById('btn-logo-settings');
      this.menuLogo = document.getElementById('menu-logo');
      this.logoStageWrap = document.getElementById('logo-stage-wrap');
      this.logoStage = document.getElementById('logo-stage');
      this.logoStageHint = document.getElementById('logo-stage-hint');
      this.logoStageSizeLabel = document.getElementById('logo-stage-size-label');
      this.logoStageRatioLabel = document.getElementById('logo-stage-ratio-label');
      this.logoCardsContainer = document.getElementById('logo-cards-container');

      // [2] Akış Listesi & Klasör / Dosya Ekleme
      this.playlistDbContainer = document.getElementById('playlist-db-container');
      this.btnAddFolder = document.getElementById('btn-add-folder');
      this.btnAddFiles = document.getElementById('btn-add-files');
      this.btnSaveCeremony = document.getElementById('btn-save-ceremony');
      this.btnOpenCeremony = document.getElementById('btn-open-ceremony');
      this.ceremonyFileInput = document.getElementById('ceremony-file-input');
      this.folderInput = document.getElementById('folder-input');
      this.fileInput = document.getElementById('file-input');
      this.btnDeleteItem = document.getElementById('btn-delete-item');
      this.btnClearAll = document.getElementById('btn-clear-all');
      this.playlistCountLabel = document.getElementById('playlist-count-label');

      // [3] Medya Ön Görünüm Sahnesi
      this.mediaPreviewArea = document.getElementById('preview-stage-col') || document.getElementById('media-flow-list');
      this.previewModeBadge = document.getElementById('preview-mode-badge');
      this.btnPublishPreview = document.getElementById('btn-publish-preview');
      this.btnSavePdf = document.getElementById('btn-save-pdf');

      // [4] Canlı Önizleme Monitörü ve İnteraktif Scrubber (Ekran Altı)
      this.previewIframeWrapper = document.getElementById('preview-iframe-wrapper');
      this.scrubberSlider = document.getElementById('scrubber-slider');
      this.scrubberFill = document.getElementById('scrubber-fill');
      this.scrubberCurTime = document.getElementById('scrubber-cur-time');
      this.scrubberTotalTime = document.getElementById('scrubber-total-time');
      this.scrubberTooltip = document.getElementById('scrubber-tooltip');
      this.scrubberTrackContainer = document.getElementById('scrubber-track-container');
      this.isScrubbing = false;

      // [5] Hızlı Kontroller
      this.btnPrev = document.getElementById('btn-prev');
      this.btnPlayPause = document.getElementById('btn-play-pause');
      this.btnNext = document.getElementById('btn-next');
      this.btnStop = document.getElementById('btn-stop');
      this.playbackTimer = document.getElementById('playback-timer');
      this.playbackProgressBar = document.getElementById('playback-progress-bar');

      // [6] Arka Plan / Loop Video & Transparanlık
      this.sliderLoopOpacity = document.getElementById('slider-loop-opacity');
      this.opacityValDisplay = document.getElementById('opacity-val-display');
      this.loopVideoSelect = document.getElementById('loop-video-select');
      this.loopThumbsContainer = document.getElementById('loop-thumbs-container');
      this.btnCheckLoop = document.getElementById('btn-check-loop');
      this.btnDisableAllLoop = document.getElementById('btn-disable-all-loop');
      this.btnLoopBw = document.getElementById('btn-loop-bw');
      this.btnLoopFlipX = document.getElementById('btn-loop-flip-x');
      this.btnLoopFlipY = document.getElementById('btn-loop-flip-y');
      this.previewLoopGrayscale = false;
      this.previewLoopFlipX = false;
      this.previewLoopFlipY = false;
      this.selectMediaLoop = document.getElementById('select-media-loop');
      this.btnMediaLoopToggle = document.getElementById('btn-media-loop-toggle');

      this.btnMute = document.getElementById('btn-mute');
      this.btnMuteIcon = document.getElementById('btn-mute-icon');
      this.btnMuteLabel = document.getElementById('btn-mute-label');

      // Tema düğmesi
      this.btnTheme = document.getElementById('btn-theme');
      this.btnThemeIcon = document.getElementById('btn-theme-icon');
      this.btnThemeLabel = document.getElementById('btn-theme-label');

      // [8] Ses Kütüphanesi (Beat)
      this.selectLoopAudio = document.getElementById('select-loop-audio');
      this.selectMediaAudio = document.getElementById('select-media-audio');
      this.btnLoopAudioPlay = document.getElementById('btn-loop-audio-play');
      this.btnMediaAudioPlay = document.getElementById('btn-media-audio-play');
      this.btnBeatStop = document.getElementById('btn-beat-stop');
      this.btnBeatPublish = document.getElementById('btn-beat-publish');
      this.btnBeatDisableAll = document.getElementById('btn-beat-disable-all');

      // [9] Ses Ayarları
      this.btnAudioMaster = document.getElementById('btn-audio-master');
      this.btnAudioMasterIcon = document.getElementById('btn-audio-master-icon');
      this.btnAudioMasterText = document.getElementById('btn-audio-master-text');
      this.audioStateBadge = document.getElementById('audio-state-badge');
      this.sliderMasterVol = document.getElementById('slider-master-vol');
      this.sliderMediaVol = document.getElementById('slider-media-vol');
      this.sliderLoopVol = document.getElementById('slider-loop-vol');
      this.sliderFxVol = document.getElementById('slider-fx-vol');
      this.valMasterVol = document.getElementById('val-master-vol');
      this.valMediaVol = document.getElementById('val-media-vol');
      this.valLoopVol = document.getElementById('val-loop-vol');
      this.valFxVol = document.getElementById('val-fx-vol');
      this.btnAudioTest = document.getElementById('btn-audio-test');
      this.audioRouteInfo = document.getElementById('audio-route-info');

      // [11] Ana ses dikey fader'ı
      this.masterFaderBox = document.getElementById('master-fader-box');
      this.masterFaderRail = document.getElementById('master-fader-rail');
      this.valFaderMaster = document.getElementById('val-fader-master');
      this.faderMuteBadge = document.getElementById('fader-mute-badge');
      this.btnFaderMute = document.getElementById('btn-fader-mute');

      // [8] Ekran & Ölçek
      this.selectLedPreset = document.getElementById('select-led-preset');
      this.inputLedW = document.getElementById('input-led-w');
      this.inputLedH = document.getElementById('input-led-h');
      this.ledSizeBadge = document.getElementById('led-size-badge');
      this.ledRatioLabel = document.getElementById('led-ratio-label');
      this.scrScaleGroup = document.getElementById('scr-scale-group');
      this.scrFillGroup = document.getElementById('scr-fill-group');
      this.scrFillRow = document.getElementById('scr-fill-row');
      this.scrBlurRow = document.getElementById('scr-blur-row');
      this.scrColorRow = document.getElementById('scr-color-row');
      this.inputBlurAmount = document.getElementById('input-blur-amount');
      this.blurAmountVal = document.getElementById('blur-amount-val');
      this.inputFillColor = document.getElementById('input-fill-color');
      this.fillColorVal = document.getElementById('fill-color-val');

      // [7] Geçiş
      this.sliderFadeSpeed = document.getElementById('slider-fade-speed');      this.fadeSpeedDisplay = document.getElementById('fade-speed-display');
      this.btnFadeBlack = document.getElementById('btn-fade-black');
      this.btnFadeCut = document.getElementById('btn-fade-cut');
      this.btnFadeCross = document.getElementById('btn-fade-cross');
    }

    _initEvents() {
      // 2. Ekran Başlat
      this.btnOpenDisplay?.addEventListener('click', () => {
        this.syncBus.openDisplayWindow();
      });

      // KARART (BLACKOUT)
      this.btnPanic?.addEventListener('click', () => {
        this.appState.toggleBlackout();
        const isBlackout = this.appState.getState().blackout;
        this.btnPanic.classList.toggle('active', isBlackout);
      });

      // SES AÇ / KAPAT (Üst Çubuk: 450 ms Hızlı/Standart Fade)
      this.btnMute?.addEventListener('click', () => {
        this.toggleMuteSmooth(450);
      });
      this._updateMuteUi();

      // TEMA (açık / koyu)
      this.btnTheme?.addEventListener('click', () => this._toggleTheme());
      this._updateThemeUi();

      // [3] Ön görünüm başlığındaki YAYINLA butonu
      this.btnPublishPreview?.addEventListener('click', () => {
        this.publishSelectedItem();
      });

      // Sunumun tüm sayfalarını tek PDF olarak Masaüstü'ne kaydet
      this.btnSavePdf?.addEventListener('click', () => {
        this._exportSlidesPdf();
      });

      // Üst Bar YAYINLA Butonu
      this.btnBroadcastLive?.addEventListener('click', () => {
        this.publishSelectedItem();
      });

      // Klasör Ekleme
      this.btnAddFolder?.addEventListener('click', () => this.folderInput?.click());
      this.folderInput?.addEventListener('change', async (e) => {
        if (e.target.files?.length) {
          const picked = Array.from(e.target.files);
          await this.handleUploadedFiles(picked);
          e.target.value = '';
        }
      });

      // Dosya Ekleme
      this.btnAddFiles?.addEventListener('click', () => this.fileInput?.click());
      this.fileInput?.addEventListener('change', async (e) => {
        if (e.target.files?.length) {
          const picked = Array.from(e.target.files);
          await this.handleUploadedFiles(picked);
          e.target.value = '';
        }
      });

      // Tören Kaydet & Tören Aç
      this.btnSaveCeremony?.addEventListener('click', () => this.exportCeremony());
      this.btnOpenCeremony?.addEventListener('click', () => this.ceremonyFileInput?.click());
      this.ceremonyFileInput?.addEventListener('change', async (e) => {
        const pickedFile = e.target.files?.[0];
        if (pickedFile) {
          await this.importCeremony(pickedFile);
          e.target.value = '';
        }
      });

      // Masaüstü / Windows Explorer'dan Tut-Bırak İle Dosya & Klasör Yükleme
      const dropTarget = this.playlistDbContainer;
      if (dropTarget) {
        ['dragenter', 'dragover'].forEach(name => {
          dropTarget.addEventListener(name, (e) => {
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
              e.preventDefault();
              e.stopPropagation();
              dropTarget.classList.add('os-drag-over');
            }
          });
        });

        ['dragleave', 'dragend'].forEach(name => {
          dropTarget.addEventListener(name, () => {
            dropTarget.classList.remove('os-drag-over');
          });
        });

        dropTarget.addEventListener('drop', (e) => {
          dropTarget.classList.remove('os-drag-over');
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            this.handleUploadedFiles(e.dataTransfer.files);
          }
        });
      }

      // Akış Listesi Tıklama (Ön Görünüm) ve Çift Tıklama (Yayına Ver) - Kalıcı Event Delegation
      if (this.playlistDbContainer) {
        this.playlistDbContainer.addEventListener('click', (e) => {
          if (this._isSortingActive || e.target.closest('.drag-handle')) return;
          const row = e.target.closest('.playlist-row');
          if (!row) return;
          const idx = parseInt(row.dataset.index, 10);
          if (isNaN(idx)) return;

          // TEK TIK = yalnızca ÖN GÖRÜNÜM.
          // Yayındaki içerik durdurulmaz, canlıya bir şey gönderilmez.
          // (Çift tık veya [3] başlığındaki YAYINLA butonu canlıya verir.)
          if (this.selectedItemIndex !== idx) {
            this.previewLoopSrc = null;
            this.previewLoopEnabled = false;
            if (this.loopThumbsContainer) {
              this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
            }
          }
          this.selectedItemIndex = idx;
          this._updatePlaylistRowStyles();
          this.renderMediaPreview();
          this.updateUI(this.appState.getState());
        });

        this.playlistDbContainer.addEventListener('dblclick', (e) => {
          const row = e.target.closest('.playlist-row');
          if (!row) return;
          const idx = parseInt(row.dataset.index, 10);
          if (isNaN(idx)) return;
          this.selectedItemIndex = idx;
          this.publishSelectedItem();
        });
      }

      // Seçili Öğeyi Silme
      this.btnDeleteItem?.addEventListener('click', () => {
        const playlist = this.appState.getState().playlist;
        if (playlist.items.length === 0) return;
        const removed = playlist.removeItem(this.selectedItemIndex);
        if (this.selectedItemIndex >= playlist.items.length) {
          this.selectedItemIndex = Math.max(0, playlist.items.length - 1);
        }
        this.renderPlaylistDb();
        this.renderMediaPreview();
        this.updateUI(this.appState.getState());
        this.saveCurrentPlaylist();
      });

      // Tüm Listeyi Temizle
      this.btnClearAll?.addEventListener('click', () => {
        if (confirm('Tüm akış listesi temizlensin mi?')) {
          this.appState.state.playlist.clear();
          this.appState.stop();
          this.selectedItemIndex = -1;
          this.storageService.clearPlaylist();
          this.renderPlaylistDb();
          this.renderMediaPreview();
          this.updateUI(this.appState.getState());
        }
      });

      // Hızlı Kontroller (Seçenek B: Akıllı Yayın & Oynat Butonu)
      this.btnPlayPause?.addEventListener('click', () => {
        const s = this.appState.getState();
        const liveIndex = (s.playbackState !== 'stopped' && s.liveItem) ? s.playlist.currentIndex : -1;
        const isSelectedDifferentFromLive = (this.selectedItemIndex >= 0 && this.selectedItemIndex !== liveIndex);

        if (isSelectedDifferentFromLive) {
          this.publishSelectedItem();
          return;
        }

        if (s.playbackState === 'playing') {
          const liveItem = s.liveItem;
          if (liveItem && (liveItem.type === 'video' || liveItem.type === 'audio')) {
            this.appState.pause();
          } else {
            this.publishSelectedItem();
          }
        } else if (s.playbackState === 'paused') {
          this.appState.resume();
        } else {
          this.publishSelectedItem();
        }
      });

      this.btnNext?.addEventListener('click', () => {
        this.previewLoopSrc = null;
        this.previewLoopEnabled = false;
        this.appState.playNext();
        this.selectedItemIndex = this.appState.getState().playlist.currentIndex;
        this.renderPlaylistDb();
        this.renderMediaPreview();
        this.updateUI(this.appState.getState());
      });

      this.btnPrev?.addEventListener('click', () => {
        this.previewLoopSrc = null;
        this.previewLoopEnabled = false;
        this.appState.playPrev();
        this.selectedItemIndex = this.appState.getState().playlist.currentIndex;
        this.renderPlaylistDb();
        this.renderMediaPreview();
        this.updateUI(this.appState.getState());
      });

      this.btnStop?.addEventListener('click', () => {
        // 1. Sesleri ve sahneleri kısarak kapat (Fade Out)
        this.audioManager?.stopAllAudio(true, 450);
        window.__AudioManagerInstance?.stopAllAudio(true, 450);
        window.__DisplayRendererInstance?.stopAll(true);

        // 2. Durum motorunda oynatmayı tamamen sıfırla
        this.appState.stop();

        // 1b. Beat ve loop arka planı da dursun (video + ses).
        //     Yalnızca playback durdurmak yetmiyordu: loop müziği/videosu
        //     durdurulan yayının arkasında çalmaya devam ediyordu.
        this.appState.setGlobalBackground({
          enabled: false,
          audioSrc: null,
          audioName: null
        });
        this._stopAllBeatSound();
        this._beatPlayingSrc = null;
        this._renderBeatList?.();
        this._updateBeatBgUi?.();

        // 2. Ekranlara ve önizleme pencerelerine acil durdurma emri ve güncel durumu gönder
        this.syncBus.broadcastCommand('CMD_STOP');
        this.syncBus.broadcastState(this.appState.getState());

        // 3. Arkaplan loop kart seçimlerini sıfırla
        this.previewLoopEnabled = false;
        this.previewLoopSrc = null;
        if (this.loopThumbsContainer) {
          this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
        }
        this._updateLoopButtonUi();

        // 4. Orta panel önizlemesindeki video oynatıcısını kesin olarak durdur
        const prevVideo = this.mediaPreviewArea?.querySelector('video');
        if (prevVideo) {
          try {
            prevVideo.pause();
            prevVideo.currentTime = 0;
          } catch (e) {}
        }
        this._lastPreviewDomSig = null;

        // 5. Iframe önizlemesini doğrudan durdur
        try {
          const iframe = this.previewIframeWrapper?.querySelector('iframe');
          if (iframe?.contentWindow?.__DisplayRendererInstance) {
            iframe.contentWindow.__DisplayRendererInstance.stopAll();
          }
        } catch (e) {}

        // 6. Global örnekler yumuşak durduruldu

        // 7. Arayüzü güncelle
        this.renderPlaylistDb();
        this.renderMediaPreview();
        this.updateUI(this.appState.getState());
      });

      // İnteraktif İleri-Geri Sarma (Scrubber) Olayları — Yüksek Performanslı ve Akıcı
      if (this.scrubberSlider) {
        let lastSeekThrottle = 0;
        let pendingSeekTimer = null;

        const applySeek = (timeSec, force = false) => {
          const now = Date.now();
          if (force || now - lastSeekThrottle >= 50) {
            lastSeekThrottle = now;
            if (pendingSeekTimer) {
              clearTimeout(pendingSeekTimer);
              pendingSeekTimer = null;
            }
            this.appState.seekTo(timeSec);
          } else if (!pendingSeekTimer) {
            pendingSeekTimer = setTimeout(() => {
              pendingSeekTimer = null;
              lastSeekThrottle = Date.now();
              this.appState.seekTo(timeSec);
            }, 50 - (now - lastSeekThrottle));
          }
        };

        const updateScrubDisplay = () => {
          const percent = parseFloat(this.scrubberSlider.value) || 0;
          if (this.scrubberFill) this.scrubberFill.style.width = `${percent}%`;

          const totalSec = (this.appState.getState().duration || 0) / 1000;
          const curSec = Math.round((percent / 100) * totalSec);
          if (this.scrubberCurTime) this.scrubberCurTime.textContent = this._fmt(curSec);
          return (percent / 100) * totalSec;
        };

        this.scrubberSlider.addEventListener('pointerdown', () => {
          this.isScrubbing = true;
        });

        this.scrubberSlider.addEventListener('input', () => {
          const targetTime = updateScrubDisplay();
          // Hızlı sarma sırasında ses motorunu kilitlememek için 120ms throttle ile hafifçe yönlendir
          applySeek(targetTime, false);
        });

        const finishScrub = () => {
          if (!this.isScrubbing) return;
          this.isScrubbing = false;
          if (pendingSeekTimer) {
            clearTimeout(pendingSeekTimer);
            pendingSeekTimer = null;
          }
          const targetTime = updateScrubDisplay();
          applySeek(targetTime, true);
        };

        this.scrubberSlider.addEventListener('change', finishScrub);
        window.addEventListener('pointerup', finishScrub);
      }

      // Hover Tooltip Süre Göstergesi
      if (this.scrubberTrackContainer && this.scrubberTooltip) {
        this.scrubberTrackContainer.addEventListener('mousemove', (e) => {
          const rect = this.scrubberTrackContainer.getBoundingClientRect();
          const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
          const ratio = rect.width > 0 ? (offsetX / rect.width) : 0;
          const totalSec = (this.appState.getState().duration || 0) / 1000;
          const hoverSec = Math.round(ratio * totalSec);

          this.scrubberTooltip.textContent = this._fmt(hoverSec);
          this.scrubberTooltip.style.left = `${offsetX}px`;
          this.scrubberTooltip.style.display = 'block';
        });

        this.scrubberTrackContainer.addEventListener('mouseleave', () => {
          this.scrubberTooltip.style.display = 'none';
        });
      }

      // Loop Video & Blur Yöneticisi Başlat
      this._initLoopVideos();
      this._initBeatLibrary();

      // Tören ve Sahne Ayarları Modalı Başlat
      this._initSettingsModal();
      this._initAppSettingsModal();

      this.sliderFadeSpeed?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.fadeSpeedDisplay) this.fadeSpeedDisplay.textContent = `${val} ms`;
        this.appState.setTransition({ duration: val });
        this._updateFadeModeUi();
      });

      // [7] Geçiş türü seçimi: yayına alınan HER öğeye uygulanır
      document.querySelectorAll('#fade-mode-group .btn-fade-action').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const mode = btn.dataset.mode;
          if (!mode) return;
          if (e.target.closest('.fade-row-test-btn')) {
            e.stopPropagation();
            this._testTransition(mode);
            return;
          }
          this.appState.setTransition({ type: mode });
          this._updateFadeModeUi();
          this._toast?.(`Geçiş: ${this._fadeModeLabel(mode)}`, 'ok');
        });
      });

      // Seçili geçişi yayındaki içerikte dene
      document.getElementById('btn-fade-test')?.addEventListener('click', () => {
        this._testTransition();
      });

      this._updateFadeModeUi();
      this._initScreenSettings();
      this._initLogoModal();
      this._initAudioSettings();
    }

    /**
     * [9] SES AYARLARI denetimleri.
     *
     * Ana aç/kapat düğmesi üst çubuktaki SES düğmesiyle aynı durumu kullanır;
     * seviyeler kanal bazlıdır (ana × kanal).
     */
    _initAudioSettings() {
      const st = () => this.appState.getState();

      // Ana aç/kapat
      this.btnAudioMaster?.addEventListener('click', () => {
        const muted = this.appState.toggleMute();
        this._updateMuteUi();
        this._toast?.(muted ? '🔇 Ses kapatıldı' : '🔊 Ses açıldı', muted ? 'warn' : 'ok');
      });

      const bindSlider = (input, key, label, apply) => {
        if (!input) return;
        input.addEventListener('input', (e) => {
          const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
          if (label) label.textContent = `%${v}`;
          apply(v / 100);
        });
      };

      bindSlider(this.sliderMasterVol, 'masterVolume', this.valMasterVol,
        (v) => { this.appState.setVolume('master', v); });
      bindSlider(this.sliderMediaVol, 'mediaVolume', this.valMediaVol,
        (v) => { this.appState.setVolume('media', v); });
      bindSlider(this.sliderLoopVol, 'loopAudioVolume', this.valLoopVol,
        (v) => { this.appState.setAudioChannel('loopAudioVolume', v); });
      bindSlider(this.sliderFxVol, 'fxVolume', this.valFxVol,
        (v) => { this.appState.setAudioChannel('fxVolume', v); });

      // Test sesi: kısa bir bip (çıkışın doğru yerde olduğunu anlamak için)
      this.btnAudioTest?.addEventListener('click', () => this._playTestTone());

      // [11] Dikey ana ses fader'ı
      this._initMasterFader();
    }

    /** Ana ses seviyesi (0-100). Tek gerçek kaynak: state.audio.masterVolume. */
    _masterVolumePct() {
      const v = Number(this.appState.getState().audio?.masterVolume);
      return Math.round((Number.isFinite(v) ? v : 1) * 100);
    }

    /** Ana sesi yüzde olarak yazar; state abonesi arayüzü eşitler. */
    _setMasterVolumePct(pct) {
      const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      if (v === this._masterVolumePct()) return;
      this.appState.setVolume('master', v / 100);
    }

    /**
     * [11] ANA SES — dikey fader.
     *
     * Sürükleme, fare tekerleği (üzerine gelince) ve ok tuşları desteklenir.
     * Değer her zaman state'e yazılır; [9] panelindeki kaydırıcıyla senkron kalır.
     */
    /**
     * Sesi yavaşça kısıp kapatan (Fade Out) ve tekrar aynı seviyeye artıran (Fade In)
     * pürüzsüz susturma işlevi.
     */
    toggleMuteSmooth(durationMs = 450) {
      if (this._muteFadeAnimId) {
        cancelAnimationFrame(this._muteFadeAnimId);
        this._muteFadeAnimId = null;
      }

      const st = this.appState.getState();
      const audio = st.audio || {};
      const isMuted = Boolean(audio.muted);
      const curPct = this._masterVolumePct();
      const duration = Math.max(100, Number(durationMs) || 450);

      if (!isMuted && curPct > 0) {
        // --- FADE OUT (SESİ YAVAŞÇA KISIP KAPAT) ---
        this._unmutedTargetPct = curPct;
        const startPct = curPct;
        const startTime = performance.now();

        const step = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const ease = Math.cos(progress * Math.PI * 0.5);
          const nextPct = Math.round(startPct * ease);
          this._setMasterVolumePct(nextPct);

          if (progress < 1) {
            this._muteFadeAnimId = requestAnimationFrame(step);
          } else {
            this._muteFadeAnimId = null;
            this.appState.setMuted(true);
            this._updateMuteUi();
            this._toast?.(`🔇 Ses kısılarak kapatıldı (${duration} ms)`, 'warn');
          }
        };
        this._muteFadeAnimId = requestAnimationFrame(step);
      } else {
        // --- FADE IN (SESİ AYNI SEVİYEYE YAVAŞÇA ARTIR) ---
        const targetPct = (this._unmutedTargetPct && this._unmutedTargetPct > 5)
          ? this._unmutedTargetPct
          : (curPct > 5 ? curPct : 100);
        const startPct = isMuted ? 0 : curPct;
        const startTime = performance.now();

        this.appState.setMuted(false);
        this._updateMuteUi();

        const step = (now) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);
          const nextPct = Math.round(startPct + (targetPct - startPct) * ease);
          this._setMasterVolumePct(nextPct);

          if (progress < 1) {
            this._muteFadeAnimId = requestAnimationFrame(step);
          } else {
            this._muteFadeAnimId = null;
            this._toast?.(`🔊 Ses açılarak artırıldı (${duration} ms)`, 'ok');
          }
        };
        this._muteFadeAnimId = requestAnimationFrame(step);
      }
    }

    _initMasterFader() {
      const rail = this.masterFaderRail;
      if (!rail) return;

      const applyFromPointer = (clientY) => {
        const r = rail.getBoundingClientRect();
        if (!r.height) return;
        this._setMasterVolumePct((1 - (clientY - r.top) / r.height) * 100);
      };

      rail.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (this._muteFadeAnimId) {
          cancelAnimationFrame(this._muteFadeAnimId);
          this._muteFadeAnimId = null;
        }
        if (this.appState.getState().audio?.muted) {
          this.appState.setMuted(false);
        }
        e.preventDefault();
        rail.setPointerCapture(e.pointerId);
        rail.classList.add('is-dragging');
        rail.focus({ preventScroll: true });
        applyFromPointer(e.clientY);
      });

      rail.addEventListener('pointermove', (e) => {
        if (!rail.hasPointerCapture(e.pointerId)) return;
        applyFromPointer(e.clientY);
      });

      const endDrag = (e) => {
        if (rail.hasPointerCapture?.(e.pointerId)) rail.releasePointerCapture(e.pointerId);
        rail.classList.remove('is-dragging');
      };
      rail.addEventListener('pointerup', endDrag);
      rail.addEventListener('pointercancel', endDrag);

      // Fare tekerleği: panelin herhangi bir yerinde çalışsın
      const wheelTarget = this.masterFaderBox || rail;
      wheelTarget.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        this._setMasterVolumePct(this._masterVolumePct() + (e.deltaY < 0 ? step : -step));
      }, { passive: false });

      // Klavye erişilebilirliği
      rail.addEventListener('keydown', (e) => {
        const cur = this._masterVolumePct();
        const step = e.shiftKey ? 10 : 2;
        let next = null;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = cur + step;
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = cur - step;
        else if (e.key === 'PageUp') next = cur + 10;
        else if (e.key === 'PageDown') next = cur - 10;
        else if (e.key === 'Home') next = 100;
        else if (e.key === 'End') next = 0;
        if (next === null) return;
        e.preventDefault();
        this._setMasterVolumePct(next);
      });

      // Fader Sustur düğmesi ağır fade ile sesi kısıp kapatır ve artırır (600-800 ms aralığında: 750 ms)
      this.btnFaderMute?.addEventListener('click', () => {
        this.toggleMuteSmooth(750);
      });
      this.faderMuteBadge?.addEventListener('click', () => {
        this.toggleMuteSmooth(750);
      });

      // Sol (L) ve Sağ (R) Ekolayzır (VU Meter) gerçek zamanlı göstergesi
      const eqFillL = document.getElementById('fader-eq-fill-l');
      const eqFillR = document.getElementById('fader-eq-fill-r');
      if (eqFillL && eqFillR && !this._faderEqTimer) {
        let phase = 0;
        this._faderEqTimer = setInterval(() => {
          const st = this.appState.getState();
          const a = st.audio || {};
          if (a.muted || (a.masterVolume ?? 1) <= 0.005) {
            if (eqFillL.style.height !== '0%') eqFillL.style.height = '0%';
            if (eqFillR.style.height !== '0%') eqFillR.style.height = '0%';
            return;
          }
          const master = Math.max(0, Math.min(1, Number(a.masterVolume ?? 1)));
          const liveAudioActive = st.playbackState === 'playing' && st.liveItem && (st.liveItem.type === 'audio' || st.liveItem.type === 'video');
          const liveItemBeatActive = Boolean(st.playbackState === 'playing' && st.liveItem && st.liveItem.type !== 'audio' && st.liveItem.audioTrack && st.liveItem.audioTrack.src && st.liveItem.audioTrack.enabled !== false);
          const bgBeatActive = Boolean(st.globalBackground && st.globalBackground.audioSrc && st.globalBackground.audioEnabled !== false);
          const bgMusicActive = Boolean(st.audio && st.audio.bgMusicPlaying && st.audio.bgMusicTrack && st.audio.bgMusicTrack.src);
          const auditionActive = Boolean(this._beatPlayingSrc && (!this._auditionEl || !this._auditionEl.paused));
          const pvVidEl = document.getElementById('pv-video-el');
          const pvAudActive = Boolean((this._previewAudioEl && !this._previewAudioEl.paused && !this._previewAudioEl.muted) || (pvVidEl && !pvVidEl.paused && !pvVidEl.muted));
          const isSoundFlowing = liveAudioActive || liveItemBeatActive || bgBeatActive || bgMusicActive || auditionActive || pvAudActive;

          if (isSoundFlowing) {
            phase += 0.45;
            const waveL = 0.58 + 0.24 * Math.sin(phase * 1.7) + 0.16 * Math.cos(phase * 3.1);
            const waveR = 0.56 + 0.25 * Math.cos(phase * 1.9) + 0.17 * Math.sin(phase * 2.7);
            const pctL = Math.max(6, Math.min(100, Math.round(master * waveL * 100)));
            const pctR = Math.max(6, Math.min(100, Math.round(master * waveR * 100)));
            eqFillL.style.height = pctL + '%';
            eqFillR.style.height = pctR + '%';
          } else {
            // Ses çalmıyorken fader seviyesini hafif referans çizgisi olarak göster
            const idlePct = rail.classList.contains('is-dragging') ? Math.round(master * 100) : Math.max(0, Math.round(master * 12));
            const nextH = idlePct + '%';
            if (eqFillL.style.height !== nextH) eqFillL.style.height = nextH;
            if (eqFillR.style.height !== nextH) eqFillR.style.height = nextH;
          }
        }, 90);
      }
    }

    /** Kısa test tonu çalar (hoparlör yönlendirmesini doğrulamak için). */
    _playTestTone() {
      try {
        const s = this.appState.getState();
        if (s.audio?.muted) {
          this._toast?.('Ses kapalı — önce açın', 'warn');
          return;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!this._testCtx) this._testCtx = new Ctx();
        const ctx = this._testCtx;
        if (ctx.state === 'suspended') ctx.resume();

        const master = s.audio?.masterVolume ?? 1;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0.0001, Math.min(1, 0.18 * master));
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 660;
        osc.connect(gain);

        const t = ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, t);
        // Yumuşak yüksel-alçal (klik sesi olmasın)
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.5);

        this._toast?.(`🔊 Test sesi (seviye %${Math.round(master * 100)})`, 'info');
      } catch (e) {}
    }

    /** [9] panelini mevcut ses durumuyla eşitler. */
    _updateAudioSettingsUi() {
      const a = this.appState.getState().audio || {};
      const muted = Boolean(a.muted);

      if (this.btnAudioMaster) {
        this.btnAudioMaster.classList.toggle('muted', muted);
        this.btnAudioMasterIcon.textContent = muted ? '🔇' : '🔊';
        this.btnAudioMasterText.textContent = muted ? 'SES KAPALI' : 'SES AÇIK';
      }
      if (this.audioStateBadge) {
        this.audioStateBadge.textContent = muted ? 'KAPALI' : 'AÇIK';
        this.audioStateBadge.style.background = muted ? 'rgba(155,44,44,0.18)' : 'rgba(104,211,145,0.15)';
        this.audioStateBadge.style.color = muted ? '#fc8181' : '#68d391';
      }

      // [11] Dikey fader + sustur düğmesi
      const masterPct = Math.round((Number.isFinite(Number(a.masterVolume)) ? Number(a.masterVolume) : 1) * 100);
      if (this.masterFaderRail) {
        this.masterFaderRail.classList.toggle('is-muted', muted);
        this.masterFaderRail.style.setProperty('--fader-v', String(masterPct));
        this.masterFaderRail.style.setProperty('--fader-f', String(masterPct / 100));
        this.masterFaderRail.setAttribute('aria-valuenow', String(masterPct));
        this.masterFaderRail.setAttribute('aria-valuetext', `%${masterPct}`);
      }
      if (this.valFaderMaster) this.valFaderMaster.textContent = `%${masterPct}`;
      if (this.faderMuteBadge) {
        this.faderMuteBadge.textContent = muted ? 'KAPALI' : 'AÇIK';
        this.faderMuteBadge.style.background = muted ? 'rgba(155,44,44,0.18)' : 'rgba(104,211,145,0.15)';
        this.faderMuteBadge.style.color = muted ? 'var(--accent-red)' : 'var(--accent-green)';
        this.faderMuteBadge.title = muted ? 'Sesi yavaşça aç (Fade In)' : 'Sesi yavaşça kapat (Fade Out)';
      }
      if (this.btnFaderMute) {
        this.btnFaderMute.classList.toggle('muted', muted);
        const iconSpan = this.btnFaderMute.querySelector('#btn-fader-mute-icon') || this.btnFaderMute;
        iconSpan.textContent = muted ? '🔇' : '🔊';
        this.btnFaderMute.title = muted ? 'Sesi yavaşça aç (750 ms Ağır Fade In)' : 'Sesi yavaşça kapat (750 ms Ağır Fade Out)';
      }

      const set = (input, label, v) => {
        const pct = Math.round((Number(v) || 0) * 100);
        if (input && document.activeElement !== input) input.value = String(pct);
        if (label) label.textContent = `%${pct}`;
      };
      set(this.sliderMasterVol, this.valMasterVol, a.masterVolume ?? 1);
      set(this.sliderMediaVol, this.valMediaVol, a.mediaVolume ?? 1);
      set(this.sliderLoopVol, this.valLoopVol, a.loopAudioVolume ?? 0.8);
      set(this.sliderFxVol, this.valFxVol, a.fxVolume ?? 0.8);

      if (this.audioRouteInfo) {
        const st = this.appState.getState();
        const target = st.displayConnected ? 'LED ekranı' : 'reji konsolu';
        this.audioRouteInfo.textContent = muted
          ? 'Ses kapalı — yayın devam ediyor'
          : `Ses çıkışı: ${target}`;
      }
    }

    /**
     * [8] EKRAN & ÖLÇEK denetimleri.
     *
     * Farklı LED panelleri için çözünürlük, içerik ölçeği ve kenar boşluğu
     * doldurma yöntemi burada ayarlanır. Ayar kalıcıdır ve LED ekranına
     * senkronla taşınır.
     */
    _initScreenSettings() {
      const applyNum = () => {
        const w = parseInt(this.inputLedW?.value, 10);
        const h = parseInt(this.inputLedH?.value, 10);
        if (!w || !h || w < 64 || h < 64) {
          this._updateScreenUi();
          return;
        }
        this.appState.setLedConfig({ width: w, height: h });
        this._updateScreenUi();
      };

      this.selectLedPreset?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) return;
        const [w, h] = val.split('x').map(v => parseInt(v, 10));
        if (!w || !h) return;
        this.appState.setLedConfig({ width: w, height: h });
        this._updateScreenUi();
        e.target.value = '';
        this._toast?.(`Ekran: ${w} × ${h}`, 'ok');
      });

      [this.inputLedW, this.inputLedH].forEach((inp) => {
        inp?.addEventListener('change', applyNum);
      });

      // İçerik ölçeği
      this.scrScaleGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-scale]');
        if (!btn) return;
        const scaleMode = btn.dataset.scale;
        this.appState.setLedConfig({ scaleMode });
        if (scaleMode === 'original') {
          const playlist = this.appState.getState().playlist;
          const activeItem = (this.selectedItemIndex >= 0 && this.selectedItemIndex < playlist.items.length)
            ? playlist.items[this.selectedItemIndex]
            : this.appState.getState().liveItem;
          this._syncOriginalMediaSize(activeItem, true);
        }
        this._updateScreenUi();
      });

      // Kenar boşluğu doldurma
      this.scrFillGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-fill]');
        if (!btn) return;
        this.appState.setLedConfig({ fillMode: btn.dataset.fill });
        this._updateScreenUi();
        const labels = { blank: 'Blanking (siyah)', blur: 'Blur Fill (bulanık)', color: 'Düz renk' };
        this._toast?.(`Kenar dolgusu: ${labels[btn.dataset.fill] || btn.dataset.fill}`, 'ok');
      });

      // Bulanıklık şiddeti
      this.inputBlurAmount?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        if (this.blurAmountVal) this.blurAmountVal.textContent = `${v} px`;
        this.appState.setLedConfig({ blurAmount: v });
      });

      // Zemin rengi
      this.inputFillColor?.addEventListener('input', (e) => {
        const v = e.target.value;
        if (this.fillColorVal) this.fillColorVal.textContent = v;
        this.appState.setLedConfig({ fillColor: v });
      });

      this._updateScreenUi();
    }

    /** [8] panelinin görünümünü mevcut yapılandırmayla eşitler. */
    _updateScreenUi() {
      const cfg = this.appState.getState().ledConfig || {};
      const w = cfg.width || 1536;
      const h = cfg.height || 768;

      if (this.inputLedW && document.activeElement !== this.inputLedW) this.inputLedW.value = String(w);
      if (this.inputLedH && document.activeElement !== this.inputLedH) this.inputLedH.value = String(h);
      if (this.ledSizeBadge) this.ledSizeBadge.textContent = `${w}×${h}`;

      // Ön görünüm ve canlı önizleme kutuları LED çıkışının oranını kullanır.
      const ratio = h ? (w / h) : 2;
      if (this.mediaPreviewArea) {
        this.mediaPreviewArea.style.setProperty('--led-ratio', String(ratio));
        this.mediaPreviewArea.style.setProperty('--led-aspect', `${w} / ${h}`);
      }
      const monitorWrapper = document.querySelector('.monitor-screen-wrapper');
      if (monitorWrapper) {
        monitorWrapper.style.setProperty('--led-aspect', `${w} / ${h}`);
      }

      if (this.ledRatioLabel) {
        const r = h ? (w / h) : 0;
        let txt;
        if (r < 1) {
          txt = `1 : ${(1 / r).toFixed(2)}  (Dikey)`;
        } else {
          txt = `${r.toFixed(2)} : 1`;
          if (Math.abs(r - 16 / 9) < 0.02) txt += '  (16:9)';
          else if (Math.abs(r - 4 / 3) < 0.02) txt += '  (4:3)';
          else if (Math.abs(r - 1) < 0.02) txt += '  (Kare)';
        }
        this.ledRatioLabel.textContent = txt;
      }

      const scale = cfg.scaleMode || 'contain';
      this.scrScaleGroup?.querySelectorAll('button[data-scale]').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.scale === scale ? 'true' : 'false');
      });

      const fill = cfg.fillMode || 'blank';
      this.scrFillGroup?.querySelectorAll('button[data-fill]').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.fill === fill ? 'true' : 'false');
      });

      // Kenar dolgusu yalnızca "Sığdır" ölçeğinde anlamlı
      if (this.scrFillRow) {
        this.scrFillRow.style.opacity = scale === 'contain' ? '1' : '0.45';
        this.scrFillRow.title = scale === 'contain'
          ? ''
          : 'Kenar boşluğu doldurma yalnızca "Sığdır" ölçeğinde kullanılır';
      }

      const showBlur = scale === 'contain' && fill === 'blur';
      const showColor = scale === 'contain' && fill === 'color';
      if (this.scrBlurRow) this.scrBlurRow.style.display = showBlur ? 'flex' : 'none';
      if (this.scrColorRow) this.scrColorRow.style.display = showColor ? 'flex' : 'none';

      const blur = cfg.blurAmount ?? 28;
      if (this.inputBlurAmount) this.inputBlurAmount.value = String(blur);
      if (this.blurAmountVal) this.blurAmountVal.textContent = `${blur} px`;

      const color = cfg.fillColor || '#000000';
      if (this.inputFillColor) this.inputFillColor.value = color;
      if (this.fillColorVal) this.fillColorVal.textContent = color;

      // Logo editörü açıksa ekran oranı/dörtgeni de aynı anda güncellenir
      if (this.modalLogoSettings && this.modalLogoSettings.style.display !== 'none') {
        this._layoutLogoStage();
        this._syncLogoEditorUi();
      }
    }

    /* =====================================================
       LOGO AYARLARI MODALI
       PNG logoları ekranın oranlı dörtgenine yerleştirir.
       ===================================================== */

    /**
     * "Orijinal" ölçek modunda seçili veya yayındaki medyanın kendi doğal piksel
     * boyutlarını (videoWidth×videoHeight / naturalWidth×naturalHeight) okur ve
     * önizleme ve LED sahnesine uygular.
     * Ekran çözünürlüğünü (#screen-settings-box > div:nth-child(2)) KESİNLİKLE DEĞİŞTİRMEZ.
     */
    _syncOriginalMediaSize(item, showToast = false) {
      if (!item || item.pending) return;

      const applyDimensions = (w, h) => {
        const nw = Math.round(Number(w) || 0);
        const nh = Math.round(Number(h) || 0);
        if (nw < 64 || nh < 64) return;
        item.naturalWidth = nw;
        item.naturalHeight = nh;

        const ledCfg = this.appState.getState().ledConfig || {};
        const ledW = ledCfg.width || 1536;
        const ledH = ledCfg.height || 768;

        if (this.mediaPreviewArea) {
          const pvMedia = this.mediaPreviewArea.querySelector('#pv-video-el, .pv-main-host img');
          if (pvMedia) {
            pvMedia.classList.add('fit-original');
            pvMedia.style.width = `${(nw / ledW) * 100}%`;
            pvMedia.style.height = `${(nh / ledH) * 100}%`;
          }
        }

        const displayInst = window.__DisplayRendererInstance;
        if (displayInst && displayInst.mediaContent) {
          const stageMedia = displayInst.mediaContent.querySelectorAll('.media-wrapper > img, .media-wrapper > video');
          stageMedia.forEach(el => {
            el.classList.add('fit-original');
            el.style.width = `${(nw / ledW) * 100}%`;
            el.style.height = `${(nh / ledH) * 100}%`;
          });
        }

        if (showToast) {
          this._toast?.(`Medya orijinal boyutu: ${nw} × ${nh}`, 'ok');
        }
      };

      if (this.mediaPreviewArea) {
        if (item.type === 'video') {
          const pvVid = this.mediaPreviewArea.querySelector('#pv-video-el');
          if (pvVid && pvVid.videoWidth > 0 && pvVid.videoHeight > 0) {
            applyDimensions(pvVid.videoWidth, pvVid.videoHeight);
            return;
          }
          if (pvVid) {
            pvVid.addEventListener('loadedmetadata', () => {
              if (pvVid.videoWidth > 0 && pvVid.videoHeight > 0) {
                applyDimensions(pvVid.videoWidth, pvVid.videoHeight);
              }
            }, { once: true });
            return;
          }
        } else if (item.type === 'image' || item.type === 'presentation') {
          const pvImg = this.mediaPreviewArea.querySelector('.pv-main-host img');
          if (pvImg && pvImg.complete && pvImg.naturalWidth > 0 && pvImg.naturalHeight > 0) {
            applyDimensions(pvImg.naturalWidth, pvImg.naturalHeight);
            return;
          }
          if (pvImg) {
            pvImg.addEventListener('load', () => {
              if (pvImg.naturalWidth > 0 && pvImg.naturalHeight > 0) {
                applyDimensions(pvImg.naturalWidth, pvImg.naturalHeight);
              }
            }, { once: true });
            return;
          }
        }
      }

      if (item.type === 'video' && item.src) {
        const probeVid = document.createElement('video');
        probeVid.preload = 'metadata';
        probeVid.muted = true;
        probeVid.onloadedmetadata = () => {
          applyDimensions(probeVid.videoWidth, probeVid.videoHeight);
          probeVid.removeAttribute('src');
          probeVid.load();
        };
        probeVid.src = item.src;
      } else if (item.type === 'image' || item.type === 'presentation') {
        const targetSrc = (item.type === 'presentation' && Array.isArray(item.slides) && item.slides.length > 0)
          ? (item.slides[item.activeSlide || 0] || item.src)
          : item.src;
        if (targetSrc) {
          const probeImg = new Image();
          probeImg.onload = () => {
            applyDimensions(probeImg.naturalWidth, probeImg.naturalHeight);
          };
          probeImg.src = targetSrc;
        }
      } else if (item.type === 'audio') {
        const settings = this.appState.getState().ceremonySettings || {};
        const mode = settings.audioScreenMode || 'audio_poster';
        const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
        const posterUrl = (mode === 'default_poster') ? defPoster : (settings.audioPosterSrc || defPoster);
        if (mode !== 'loop' && mode !== 'blackout' && posterUrl) {
          const probeImg = new Image();
          probeImg.onload = () => {
            applyDimensions(probeImg.naturalWidth, probeImg.naturalHeight);
          };
          probeImg.src = posterUrl;
        }
      }
    }

    _initLogoModal() {
      if (!this.modalLogoSettings) return;

      const openModal = () => {
        this._refreshLogoEditor();
        this.modalLogoSettings.style.display = 'flex';
        requestAnimationFrame(() => this._layoutLogoStage());
        // Modal ölçüleri oturduktan sonra bir kez daha: dörtgen tam boyutuna yerleşir.
        setTimeout(() => this._layoutLogoStage(), 80);
      };
      const closeModal = () => {
        const cfg = this.appState.getState().logoConfig;
        if (cfg && (cfg.logos || []).some((l) => l && l.src && l.visible !== false) && cfg.enabled === false) {
          this.appState.setLogoConfig({ enabled: true });
        }
        this.modalLogoSettings.style.display = 'none';
      };

      this.btnLogoQuick?.addEventListener('click', openModal);
      this.menuLogo?.addEventListener('click', openModal);
      document.getElementById('btn-close-logo-modal')?.addEventListener('click', closeModal);
      document.getElementById('btn-close-logo-modal-footer')?.addEventListener('click', closeModal);
      this.modalLogoSettings.addEventListener('click', (e) => {
        if (e.target === this.modalLogoSettings) closeModal();
      });

      document.getElementById('btn-logo-clear-all')?.addEventListener('click', () => {
        const cfg = this.appState.getState().logoConfig || {};
        this.appState.setLogoConfig({
          logos: (cfg.logos || []).map((l) => ({ ...l, src: '', name: '' }))
        });
        this._refreshLogoEditor();
        this._toast?.('Logolar temizlendi', 'ok');
      });

      window.addEventListener('resize', () => {
        if (this.modalLogoSettings.style.display !== 'none') this._layoutLogoStage();
      });

      // Yatayda Merkezleri Hizala Butonu
      document.getElementById('btn-logo-align-h')?.addEventListener('click', () => {
        const cfg = this.appState.getState().logoConfig || {};
        const logos = cfg.logos || [];
        if (logos.length < 2) return;

        const stage = this.logoStage;
        const stageRect = stage?.getBoundingClientRect();
        const item1 = stage?.querySelector(`.logo-stage-item[data-logo-id="${logos[0].id}"]`);
        const item2 = stage?.querySelector(`.logo-stage-item[data-logo-id="${logos[1].id}"]`);

        const getH = (item, l) => {
          if (item && stageRect && stageRect.height > 0) {
            const h = item.getBoundingClientRect().height;
            if (h > 0) return Math.min(1, h / stageRect.height);
          }
          const img = item?.querySelector('img');
          if (img && img.naturalWidth && img.naturalHeight && stageRect && stageRect.width && stageRect.height) {
            const sRatio = stageRect.width / stageRect.height;
            const iRatio = img.naturalWidth / img.naturalHeight;
            return Math.min(1, (l.w * sRatio) / iRatio);
          }
          return l.w || 0.18;
        };

        const h1 = getH(item1, logos[0]);
        const h2 = getH(item2, logos[1]);

        const c1 = logos[0].y + h1 / 2;
        const c2 = logos[1].y + h2 / 2;
        let targetCY = (c1 + c2) / 2;

        let newY1 = targetCY - h1 / 2;
        let newY2 = targetCY - h2 / 2;

        if (newY1 < 0) {
          const shift = -newY1;
          newY1 += shift;
          newY2 += shift;
        }
        if (newY2 < 0) {
          const shift = -newY2;
          newY1 += shift;
          newY2 += shift;
        }
        if (newY1 + h1 > 1) {
          const shift = (newY1 + h1) - 1;
          newY1 -= shift;
          newY2 -= shift;
        }
        if (newY2 + h2 > 1) {
          const shift = (newY2 + h2) - 1;
          newY1 -= shift;
          newY2 -= shift;
        }

        newY1 = Math.max(0, Math.min(Math.max(0, 1 - h1), newY1));
        newY2 = Math.max(0, Math.min(Math.max(0, 1 - h2), newY2));

        this.appState.setLogo(logos[0].id, { y: newY1 });
        this.appState.setLogo(logos[1].id, { y: newY2 });
        this._syncLogoEditorUi();
        this._toast?.('Logolar merkez noktalarından yatayda hizalandı', 'ok');
      });

      // Logoları Birbirine Bağla (Ayna Modu) Butonu
      document.getElementById('btn-logo-toggle-link')?.addEventListener('click', () => {
        const cfg = this.appState.getState().logoConfig || {};
        const logos = cfg.logos || [];
        const nextLinked = !cfg.linked;
        this.appState.setLogoConfig({ linked: nextLinked });

        if (nextLinked && logos.length >= 2) {
          const l1 = logos[0];
          const l2 = logos[1];
          const stage = this.logoStage;
          const stageRect = stage?.getBoundingClientRect();
          const item1 = stage?.querySelector(`.logo-stage-item[data-logo-id="${l1.id}"]`);
          const item2 = stage?.querySelector(`.logo-stage-item[data-logo-id="${l2.id}"]`);

          const getH = (item, l) => {
            if (item && stageRect && stageRect.height > 0) {
              const h = item.getBoundingClientRect().height;
              if (h > 0) return Math.min(1, h / stageRect.height);
            }
            return l.w || 0.18;
          };
          const h1 = getH(item1, l1);
          const h2 = getH(item2, l2);

          const targetW = l1.w;
          const targetX2 = Math.max(0, Math.min(1 - targetW, 1 - l1.x - targetW));
          const c1 = l1.y + h1 / 2;
          const targetY2 = Math.max(0, Math.min(1 - h2, c1 - h2 / 2));

          this.appState.setLogo(l2.id, { x: targetX2, y: targetY2, w: targetW });
          this._toast?.('🔗 Logolar birbirine bağlandı (Ayna modu aktif)', 'ok');
        } else if (!nextLinked) {
          this._toast?.('Logoların bağı çözüldü (Bağımsız mod)', 'info');
        }

        this._syncLogoEditorUi();
      });

      // Kartlardaki düğme / kaydırıcı / dosya olayları (tek delege)
      this.logoCardsContainer?.addEventListener('click', (e) => {
        const actBtn = e.target.closest('[data-act]');
        const card = e.target.closest('.logo-card');
        if (!actBtn || !card) return;
        const id = card.dataset.logoId;
        if (actBtn.dataset.act === 'upload') {
          card.querySelector('input[type="file"]')?.click();
        } else if (actBtn.dataset.act === 'clear') {
          this.appState.setLogo(id, { src: '', name: '' });
          this._refreshLogoEditor();
        }
      });

      // Fare tekerleğiyle hassas kaydırıcı (slider) ayarı
      this.logoCardsContainer?.addEventListener('wheel', (e) => {
        const slider = e.target.matches('input[type="range"]')
          ? e.target
          : e.target.closest('.logo-slider-row')?.querySelector('input[type="range"]');
        if (!slider) return;
        e.preventDefault();

        const step = Number(slider.step) || 1;
        const min = slider.min !== '' ? Number(slider.min) : 0;
        const max = slider.max !== '' ? Number(slider.max) : 100;
        const cur = Number(slider.value) || 0;
        const delta = e.deltaY < 0 ? step : -step;
        const nextVal = Math.min(max, Math.max(min, cur + delta));

        if (nextVal !== cur) {
          slider.value = String(nextVal);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { passive: false });

      this.logoCardsContainer?.addEventListener('input', (e) => {
        const input = e.target;
        const card = input.closest('.logo-card');
        if (!card || input.tagName !== 'INPUT' || input.type !== 'range') return;
        const id = card.dataset.logoId;
        const field = input.dataset.field;
        const val = parseInt(input.value, 10) || 0;
        const cfg = this.appState.getState().logoConfig || {};

        if (field === 'w') {
          const nw = Math.max(2, Math.min(100, val)) / 100;
          this.appState.setLogo(id, { w: nw });
          if (cfg.linked) {
            const curLogo = (cfg.logos || []).find((x) => x.id === id);
            const otherLogo = (cfg.logos || []).find((x) => x.id !== id);
            if (curLogo && otherLogo) {
              const otherX = Math.max(0, Math.min(1 - nw, 1 - curLogo.x - nw));
              this.appState.setLogo(otherLogo.id, { w: nw, x: otherX });
            }
          }
        } else if (field === 'trans') {
          const op = 1 - Math.max(0, Math.min(100, val)) / 100;
          this.appState.setLogo(id, { opacity: op });
          if (cfg.linked) {
            const otherLogo = (cfg.logos || []).find((x) => x.id !== id);
            if (otherLogo) {
              this.appState.setLogo(otherLogo.id, { opacity: op });
            }
          }
        }
        this._syncLogoEditorUi();
      });

      this.logoCardsContainer?.addEventListener('change', async (e) => {
        const card = e.target.closest('.logo-card');
        if (!card) return;
        const id = card.dataset.logoId;

        if (e.target.matches('input[type="checkbox"][data-field="visible"]')) {
          this.appState.setLogo(id, { visible: e.target.checked });
          this._refreshLogoEditor();
          return;
        }

        if (e.target.matches('input[type="file"]')) {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const isPng = file.type === 'image/png' || /\.png$/i.test(file.name || '');
          if (!isPng) {
            this._toast?.('Yalnızca PNG dosyası seçin', 'warn');
            return;
          }
          // Tauri: diske yaz + asset URL. Tarayıcı: Base64 data URL.
          let src = await MD.importFile(file);
          if (!src) src = await this._readFileAsDataUrl(file);
          if (!src) {
            this._toast?.('Logo yüklenemedi', 'warn');
            return;
          }
          this.appState.setLogo(id, { src, name: file.name, visible: true });
          this._refreshLogoEditor();
          this._toast?.('Logo eklendi', 'ok');
        }
      });

      this._refreshLogoEditor();
    }

    _readFileAsDataUrl(file) {
      return new Promise((resolve) => {
        try {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result || '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        } catch (e) {
          resolve('');
        }
      });
    }

    _logoById(id) {
      const cfg = this.appState.getState().logoConfig || {};
      return (cfg.logos || []).find((l) => l.id === id) || null;
    }

    _logoEsc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
      ));
    }

    /** Modal içeriğini (kartlar + ekran dörtgenindeki logolar) baştan kurar. */
    _refreshLogoEditor() {
      const cfg = this.appState.getState().logoConfig || {};
      const logos = (cfg.logos || []).slice(0, 2);
      while (logos.length < 2) {
        const i = logos.length;
        logos.push({
          id: `logo-${i + 1}`, src: '', name: '', visible: true,
          x: i === 0 ? 0.05 : 0.77, y: 0.07, w: 0.18, opacity: 1
        });
      }

      // --- Kartlar ---
      if (this.logoCardsContainer) {
        this.logoCardsContainer.innerHTML = logos.map((l, i) => {
          const name = l.name ? this._logoEsc(l.name) : 'Henüz PNG seçilmedi';
          const fileName = l.name ? this._logoEsc(l.name) : 'logo' + (i + 1) + '.png';
          const trans = Math.round((1 - l.opacity) * 100);
          return `
            <article class="logo-card${l.src ? ' active' : ''}" data-logo-id="${l.id}">
              <div class="logo-card-head">
                <span class="logo-card-chip">LOGO ${i + 1}</span>
                <label class="logo-card-visible">
                  <input type="checkbox" data-field="visible" ${l.visible ? 'checked' : ''}>
                  Ekranda göster
                </label>
              </div>
              <div class="logo-card-body">
                <div class="logo-thumb${l.src ? ' has-img' : ''}" data-role="thumb">
                  <img alt="Logo ${i + 1}" ${l.src ? `src="${this._logoEsc(l.src)}"` : ''} draggable="false">
                  <span class="logo-thumb-empty">PNG</span>
                </div>
                <div class="logo-card-controls">
                  <div class="logo-card-filename" title="${fileName}">${name}</div>
                  <div class="logo-card-actions">
                    <button type="button" class="btn btn-primary" data-act="upload">PNG Seç</button>
                    <button type="button" class="btn" data-act="clear">Temizle</button>
                  </div>
                  <label class="logo-slider-row">
                    <span>Boyut</span>
                    <input type="range" min="2" max="100" step="1" value="${Math.round(l.w * 100)}" data-field="w">
                    <span class="logo-slider-val" data-out="w">${Math.round(l.w * 100)}%</span>
                  </label>
                  <label class="logo-slider-row">
                    <span>Şeffaflık</span>
                    <input type="range" min="0" max="100" step="1" value="${trans}" data-field="trans">
                    <span class="logo-slider-val" data-out="trans">${trans}%</span>
                  </label>
                  <div class="logo-card-pos" data-out="pos"></div>
                  <input type="file" accept=".png,image/png" data-role="file" style="display:none;">
                </div>
              </div>
            </article>
          `;
        }).join('');
      }

      // --- Ekran dörtgenindeki sürüklenebilir logolar ---
      if (this.logoStage) {
        this.logoStage.querySelectorAll('.logo-stage-item').forEach((n) => n.remove());
        let any = false;
        logos.forEach((l, i) => {
          if (!l.src || l.visible === false) return;
          any = true;
          const item = document.createElement('div');
          item.className = 'logo-stage-item';
          item.dataset.logoId = l.id;
          item.title = l.name || `Logo ${i + 1}`;
          const img = document.createElement('img');
          img.alt = l.name || `Logo ${i + 1}`;
          img.src = l.src;
          img.draggable = false;
          const handle = document.createElement('span');
          handle.className = 'logo-resize-handle';
          handle.title = 'Boyutlandır';
          item.append(img, handle);
          this._applyLogoItemStyle(item, l);
          this._bindLogoDrag(item, l.id);
          this.logoStage.appendChild(item);
        });
        if (this.logoStageHint) this.logoStageHint.style.display = any ? 'none' : 'flex';
      }

      this._layoutLogoStage();
      this._syncLogoEditorUi();
    }

    _applyLogoItemStyle(item, l) {
      item.style.left = `${(l.x * 100).toFixed(3)}%`;
      item.style.top = `${(l.y * 100).toFixed(3)}%`;
      item.style.width = `${(l.w * 100).toFixed(3)}%`;
      item.style.opacity = String(l.opacity);
    }

    /** Dörtgeni LED çözünürlüğüyle aynı oranda, alana sığacak şekilde boyutlandırır. */
    _layoutLogoStage() {
      const cfg = this.appState.getState().ledConfig || {};
      const w = cfg.width || 1536;
      const h = cfg.height || 768;
      const ratio = h ? (w / h) : 2;

      if (this.logoStageSizeLabel) this.logoStageSizeLabel.textContent = `${w} × ${h}`;
      if (this.logoStageRatioLabel) {
        this.logoStageRatioLabel.textContent = ratio < 1
          ? `1 : ${(1 / ratio).toFixed(2)}`
          : `${ratio.toFixed(2)} : 1`;
      }

      const wrap = this.logoStageWrap;
      const stage = this.logoStage;
      if (!wrap || !stage) return;
      const availW = Math.max(80, wrap.clientWidth - 18);
      const availH = Math.max(60, wrap.clientHeight - 18);
      const s = Math.min(availW / w, availH / h);
      stage.style.width = `${Math.max(80, Math.round(w * s))}px`;
      stage.style.height = `${Math.max(45, Math.round(h * s))}px`;
    }

    /** Kaydırıcı/okuma değerlerini duruma göre tazeler (DOM'u yeniden kurmaz). */
    _syncLogoEditorUi() {
      const cfg = this.appState.getState().logoConfig || {};
      const logos = cfg.logos || [];

      this.logoCardsContainer?.querySelectorAll('.logo-card').forEach((card) => {
        const l = logos.find((x) => x.id === card.dataset.logoId);
        if (!l) return;

        const wInp = card.querySelector('input[data-field="w"]');
        const tInp = card.querySelector('input[data-field="trans"]');
        const wOut = card.querySelector('[data-out="w"]');
        const tOut = card.querySelector('[data-out="trans"]');
        const posOut = card.querySelector('[data-out="pos"]');
        const chk = card.querySelector('input[data-field="visible"]');
        const thumb = card.querySelector('[data-role="thumb"]');
        const thumbImg = thumb?.querySelector('img');
        const fileNameEl = card.querySelector('.logo-card-filename');

        const wPct = Math.round(l.w * 100);
        const transPct = Math.round((1 - l.opacity) * 100);
        if (wInp && document.activeElement !== wInp) wInp.value = String(wPct);
        if (tInp && document.activeElement !== tInp) tInp.value = String(transPct);
        if (wOut) wOut.textContent = `${wPct}%`;
        if (tOut) tOut.textContent = `${transPct}%`;
        if (posOut) {
          posOut.textContent = `Konum: X %${Math.round(l.x * 100)} · Y %${Math.round(l.y * 100)}`;
        }
        if (chk && chk.checked !== (l.visible !== false)) chk.checked = l.visible !== false;
        if (thumb) thumb.classList.toggle('has-img', Boolean(l.src));
        if (thumbImg) {
          if (l.src) {
            if (thumbImg.getAttribute('src') !== l.src) thumbImg.setAttribute('src', l.src);
          } else if (thumbImg.hasAttribute('src')) {
            thumbImg.removeAttribute('src');
          }
        }
        if (fileNameEl) {
          fileNameEl.textContent = l.name || 'Henüz PNG seçilmedi';
          fileNameEl.title = l.name || `logo${logos.indexOf(l) + 1}.png`;
        }
        card.classList.toggle('active', Boolean(l.src));
      });

      const isLinked = Boolean(cfg.linked);
      const btnLink = document.getElementById('btn-logo-toggle-link');
      const linkText = document.getElementById('btn-logo-link-text');
      if (btnLink) {
        btnLink.classList.toggle('active', isLinked);
        btnLink.title = isLinked
          ? 'Logolar bağlı (Ayna Modu aktif). Tıklayarak bağı çözebilirsiniz.'
          : 'Logoları birbirine bağlar (Ayna Modu)';
      }
      if (linkText) {
        linkText.textContent = isLinked ? 'Logolar Bağlı (Ayna Modu)' : 'Logoları Bağla (Ayna Modu)';
      }

      this.logoStage?.querySelectorAll('.logo-stage-item').forEach((item) => {
        const l = logos.find((x) => x.id === item.dataset.logoId);
        if (l) this._applyLogoItemStyle(item, l);
      });
    }

    /** Dörtgen içinde sürükleme + köşeden boyutlandırma. */
    _bindLogoDrag(item, id) {
      const stage = this.logoStage;
      if (!stage) return;
      const handle = item.querySelector('.logo-resize-handle');

      const track = (onMove) => {
        const move = (ev) => onMove(ev);
        const end = () => {
          item.classList.remove('dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      };

      item.addEventListener('pointerdown', (e) => {
        if (e.target === handle) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        const l = this._logoById(id);
        if (!l) return;
        const rect = stage.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const offX = e.clientX - itemRect.left;
        const offY = e.clientY - itemRect.top;
        const hFrac = Math.min(1, itemRect.height / rect.height);
        item.classList.add('dragging');
        track((ev) => {
          const cur = this._logoById(id);
          if (!cur) return;
          let nx = (ev.clientX - rect.left - offX) / rect.width;
          let ny = (ev.clientY - rect.top - offY) / rect.height;
          nx = Math.max(0, Math.min(Math.max(0, 1 - cur.w), nx));
          ny = Math.max(0, Math.min(Math.max(0, 1 - hFrac), ny));
          this.appState.setLogo(id, { x: nx, y: ny });
          item.style.left = `${(nx * 100).toFixed(3)}%`;
          item.style.top = `${(ny * 100).toFixed(3)}%`;

          const cfg = this.appState.getState().logoConfig || {};
          if (cfg.linked) {
            const otherLogo = (cfg.logos || []).find((x) => x.id !== id);
            if (otherLogo) {
              const otherItem = stage.querySelector(`.logo-stage-item[data-logo-id="${otherLogo.id}"]`);
              const otherRect = otherItem?.getBoundingClientRect();
              const otherHFrac = otherRect && rect.height ? Math.min(1, otherRect.height / rect.height) : hFrac;

              let otherX = 1 - nx - otherLogo.w;
              otherX = Math.max(0, Math.min(Math.max(0, 1 - otherLogo.w), otherX));

              const curCenterY = ny + hFrac / 2;
              let otherY = curCenterY - otherHFrac / 2;
              otherY = Math.max(0, Math.min(Math.max(0, 1 - otherHFrac), otherY));

              this.appState.setLogo(otherLogo.id, { x: otherX, y: otherY });
              if (otherItem) {
                otherItem.style.left = `${(otherX * 100).toFixed(3)}%`;
                otherItem.style.top = `${(otherY * 100).toFixed(3)}%`;
              }
            }
          }

          this._syncLogoEditorUi();
        });
      });

      handle?.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = stage.getBoundingClientRect();
        if (!rect.width) return;
        const start = this._logoById(id);
        if (!start) return;
        const startX = e.clientX;
        const startW = start.w;
        item.classList.add('dragging');
        track((ev) => {
          const nw = Math.max(0.02, Math.min(1, startW + (ev.clientX - startX) / rect.width));
          this.appState.setLogo(id, { w: nw });
          item.style.width = `${(nw * 100).toFixed(3)}%`;

          const cfg = this.appState.getState().logoConfig || {};
          if (cfg.linked) {
            const otherLogo = (cfg.logos || []).find((x) => x.id !== id);
            if (otherLogo) {
              const otherItem = stage.querySelector(`.logo-stage-item[data-logo-id="${otherLogo.id}"]`);
              let otherX = 1 - start.x - nw;
              otherX = Math.max(0, Math.min(Math.max(0, 1 - nw), otherX));
              this.appState.setLogo(otherLogo.id, { w: nw, x: otherX });
              if (otherItem) {
                otherItem.style.width = `${(nw * 100).toFixed(3)}%`;
                otherItem.style.left = `${(otherX * 100).toFixed(3)}%`;
              }
            }
          }

          this._syncLogoEditorUi();
        });
      });
    }

    /**
     * Açık / koyu tema.
     *
     * Renkler CSS değişkenlerinde tutulur (`base.css`); tema değişimi
     * `<html data-theme="light">` ile tek satırda olur. Seçim kalıcıdır.
     * LED/display penceresi bundan etkilenmez (o her zaman siyah zeminlidir).
     */
    _toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      this._applyTheme(next);
      try { localStorage.setItem('master_display_theme', next); } catch (e) {}
      this._toast?.(next === 'light' ? '☀️ Açık tema' : '🌙 Koyu tema', 'info');
    }

    _applyTheme(theme) {
      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      this._updateThemeUi();
    }

    _updateThemeUi() {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (this.btnThemeIcon) this.btnThemeIcon.textContent = isLight ? '🌙' : '☀️';
      if (this.btnThemeLabel) this.btnThemeLabel.textContent = isLight ? 'KOYU' : 'TEMA';
      if (this.btnTheme) {
        this.btnTheme.title = isLight ? 'Koyu temaya geç (T)' : 'Açık temaya geç (T)';
      }
    }

    /** SES düğmesinin görünümünü duruma göre günceller. */
    _updateMuteUi() {      const muted = Boolean(this.appState.getState().audio?.muted);
      if (this.btnMuteIcon) this.btnMuteIcon.textContent = muted ? '🔇' : '🔊';
      if (this.btnMuteLabel) this.btnMuteLabel.textContent = muted ? 'SES KAPALI' : 'SES';
      if (this.btnMute) {
        this.btnMute.classList.toggle('active', muted);
        this.btnMute.style.borderColor = muted ? '#9b2c2c' : '';
        this.btnMute.style.color = muted ? '#fc8181' : '';
        this.btnMute.style.background = muted ? 'rgba(155,44,44,0.18)' : '';
        this.btnMute.title = muted ? 'Ses kapalı — açmak için tıklayın (M)' : 'Sesi kapat (M)';
      }
      // [9] panelini de eşitle (tek gerçek kaynak: state)
      this._updateAudioSettingsUi();
    }

    /**
     * Ses Kütüphanesi (Beat) — kök klasördeki `Beat/` dizini taranır.
     * Alt klasörler optgroup olarak gruplanır.
     *
     * İki hedef vardır:
     *  - Loop sesi  : canlı loop arka planı çalarken duyulur
     *  - Medya sesi : seçili görsel/video/sunum yayına girdiğinde duyulur
     */
    async _initBeatLibrary() {
      const files = await MD.listMedia('Beat');
      this.beatFiles = files.filter(it => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(it.name));

      const buildOptions = (selected, placeholder = '(ses yok)') => {
        const groups = new Map();
        this.beatFiles.forEach((f) => {
          const key = f.folder || '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(f);
        });

        let html = `<option value="">${this._escapeHtml(placeholder)}</option>`;
        if (this.beatFiles.length === 0) {
          html += '<option value="" disabled>Beat klasörü boş veya bulunamadı</option>';
        }
        groups.forEach((list, folder) => {
          const label = folder || 'Kök (Beat)';
          html += `<optgroup label="${this._escapeHtml(label)}">`;
          list.forEach((f) => {
            const sel = selected === f.src ? ' selected' : '';
            html += `<option value="${f.src}"${sel}>${this._escapeHtml(f.name.replace(/\.[^.]+$/, ''))}</option>`;
          });
          html += '</optgroup>';
        });
        return html;
      };

      this._buildBeatOptions = buildOptions;

      if (this.selectLoopAudio) {
        const cur = this.appState.getState().globalBackground?.audioSrc || '';
        this.selectLoopAudio.innerHTML = buildOptions(cur, '— Beat seçin —');
        // Seçim yalnızca not edilir; canlı yayına "Yayınla" düğmesi alır.
        this.selectLoopAudio.addEventListener('change', (e) => {
          this._beatPendingSrc = e.target.value || null;
          this._updateBeatBgUi();
        });
      }

      // Beat Arka Plan: Yayınla / KAPAT
      this.btnBeatPublish?.addEventListener('click', () => {
        const src = this.selectLoopAudio?.value || this._beatPendingSrc || null;
        if (!src) {
          this._toast?.('Önce listeden bir beat seçin', 'warn');
          return;
        }
        const name = (this.beatFiles.find(f => f.src === src) || {}).name || null;
        this._beatPendingSrc = src;
        this.appState.setGlobalBackground({ audioSrc: src, audioName: name, audioEnabled: true });
        this._updateBeatBgUi();
        this._toast?.(`🎵 Beat yayında: ${name || 'ses'}`, 'ok');
      });

      this.btnBeatDisableAll?.addEventListener('click', () => {
        this._mixLastBeatSrc = null;
        this._mixLastBeatName = null;
        this.appState.setGlobalBackground({ audioSrc: null, audioName: null });
        this._stopAllBeatSound();
        this._beatPlayingSrc = null;
        this._renderBeatList();
        this._updateBeatBgUi();
        this._toast?.('⏹ Beat kapatıldı', 'info');
      });

      if (this.selectMediaAudio) {
        this.selectMediaAudio.innerHTML = buildOptions('');
        this.selectMediaAudio.addEventListener('change', () => {
          this._selectedBeatSrc = this.selectMediaAudio.value;
          this._renderBeatList();
          this._updateMediaAudioAddRemoveBtn();
        });
      }

      // Dinleme düğmeleri
      this.btnLoopAudioPlay?.addEventListener('click', () => {
        this._auditionAudio(this.selectLoopAudio?.value || null);
      });
      this.btnMediaAudioPlay?.addEventListener('click', () => {
        this._auditionAudio(this.selectMediaAudio?.value || null);
      });

      // Medyaya müzik Ekle (+) / Kaldır (−) düğmesi
      this.btnBeatStop?.addEventListener('click', () => {
        const item = this._selectedItem();
        if (!item) {
          this._toast?.('Önce akış listesinden bir medya seçin', 'warn');
          return;
        }
        if (item.type === 'audio') {
          this._toast?.('Ses dosyasına ayrıca ses eklenmez', 'warn');
          return;
        }
        const curSrc = (item.audioTrack && item.audioTrack.src) || '';
        const selVal = this.selectMediaAudio?.value || '';

        if (curSrc && (!selVal || selVal === curSrc)) {
          // Zaten müzik ekli: kaldır (−)
          this._assignMediaAudio(null);
          if (this.selectMediaAudio) this.selectMediaAudio.value = '';
          this._syncMediaAudioSelect();
          this._renderBeatList();
        } else {
          // Müzik ekle (+)
          let srcToAdd = selVal || this._beatPlayingSrc || ((this.beatFiles && this.beatFiles[0]) ? this.beatFiles[0].src : '');
          if (!srcToAdd) {
            this._toast?.('Önce listeden eklenecek müziği seçin', 'warn');
            return;
          }
          if (this.selectMediaAudio) this.selectMediaAudio.value = srcToAdd;
          this._assignMediaAudio(srcToAdd);
          this._syncMediaAudioSelect();
          this._renderBeatList();
        }
      });

      // Ses kaldırma düğmeleri
      document.querySelectorAll('[data-clear]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.clear === 'loop') {
            this.appState.setGlobalBackground({ audioSrc: null, audioName: null });
            if (this.selectLoopAudio) this.selectLoopAudio.value = '';
            this._renderBeatList();
            this._toast?.('Loop sesi kaldırıldı', 'info');
          } else {
            this._assignMediaAudio(null);
            if (this.selectMediaAudio) this.selectMediaAudio.value = '';
            this._renderBeatList();
          }
        });
      });

      // Arama
      this.beatSearch = document.getElementById('beat-search');
      this.beatSearch?.addEventListener('input', () => this._renderBeatList());

      // Klasör renkleri (loop'larla aynı palet)
      this._initBeatFolderColors();

      this._renderBeatList();
      this._updateBeatBgUi();
      this._initBeatScrubber();

      // Seçili medya değişince medya sesi açılır listesini eşitle
      this._syncMediaAudioSelect();
    }

    /** Loop Ses zaman ilerleme çubuğu ve ileri / geri sarma yöneticisi. */
    _initBeatScrubber() {
      const slider = document.getElementById('beat-seek-slider');
      const curTime = document.getElementById('beat-cur-time');
      const durTime = document.getElementById('beat-dur-time');
      if (!slider) return;

      const fmt = (s) => {
        if (!isFinite(s) || s < 0) return '00:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      };

      const getActiveAudio = () => {
        if (this._auditionEl) return this._auditionEl;
        const loopAud = this.audioManager?.loopAudio;
        if (loopAud && loopAud.src && !loopAud.paused) return loopAud;
        return null;
      };

      slider.addEventListener('pointerdown', () => {
        slider._dragging = true;
      });

      const applySeek = (valPct) => {
        const audio = getActiveAudio();
        if (audio && isFinite(audio.duration) && audio.duration > 0) {
          const targetSec = (valPct / 100) * audio.duration;
          if (curTime) curTime.textContent = fmt(targetSec);
          try { audio.currentTime = targetSec; } catch (e) {}
        }
      };

      slider.addEventListener('input', () => {
        applySeek(Number(slider.value));
      });

      const finishSeek = () => {
        if (!slider._dragging) return;
        slider._dragging = false;
        applySeek(Number(slider.value));
      };

      slider.addEventListener('change', finishSeek);
      window.addEventListener('pointerup', finishSeek);

      // Fare tekerleği ile sarma (ileri / geri 2 saniye)
      slider.addEventListener('wheel', (e) => {
        e.preventDefault();
        const audio = getActiveAudio();
        if (audio && isFinite(audio.duration) && audio.duration > 0) {
          const delta = e.deltaY < 0 ? 2 : -2;
          const next = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
          try { audio.currentTime = next; } catch (err) {}
          const pct = (next / audio.duration) * 100;
          slider.value = String(pct);
          if (curTime) curTime.textContent = fmt(next);
        }
      }, { passive: false });

      // Arka plan loopAudio dinleme süresi bağlama
      const loopAud = this.audioManager?.loopAudio;
      if (loopAud) {
        loopAud.addEventListener('timeupdate', () => {
          if (this._auditionEl && !this._auditionEl.paused) return;
          if (slider && !slider._dragging && isFinite(loopAud.duration) && loopAud.duration > 0) {
            slider.value = String((loopAud.currentTime / loopAud.duration) * 100);
            slider.disabled = false;
            if (curTime) curTime.textContent = fmt(loopAud.currentTime);
            if (durTime) durTime.textContent = fmt(loopAud.duration);
          }
        });
      }
    }

    /** Beat klasörlerine loop'larla tutarlı renk atar. */
    _initBeatFolderColors() {
      this._beatFolderColors = {};
      const palette = [
        { bar: '#0284c7', text: '#7dd3fc', textLight: '#0369a1', bg: 'rgba(56,189,248,0.18)', bgLight: '#e0f2fe', borderLight: '#bae6fd' },
        { bar: '#d97706', text: '#fbd38d', textLight: '#b45309', bg: 'rgba(246,173,85,0.18)', bgLight: '#fef3c7', borderLight: '#fde68a' },
        { bar: '#16a34a', text: '#9ae6b4', textLight: '#15803d', bg: 'rgba(104,211,145,0.18)', bgLight: '#dcfce7', borderLight: '#bbf7d0' },
        { bar: '#9333ea', text: '#d6bcfa', textLight: '#7e22ce', bg: 'rgba(183,148,244,0.18)', bgLight: '#f3e8ff', borderLight: '#e9d5ff' },
        { bar: '#dc2626', text: '#feb2b2', textLight: '#b91c1c', bg: 'rgba(252,129,129,0.18)', bgLight: '#fee2e2', borderLight: '#fecaca' },
        { bar: '#0d9488', text: '#81e6d9', textLight: '#0f766e', bg: 'rgba(79,209,197,0.18)', bgLight: '#ccfbf1', borderLight: '#99f6e4' }
      ];
      const folders = [...new Set((this.beatFiles || []).map(f => f.folder).filter(Boolean))];
      folders.forEach((f, i) => { this._beatFolderColors[f] = palette[i % palette.length]; });
    }

    /**
     * [8] SES KÜTÜPHANESİ listesini çizer.
     * Her satır: çal, loop'a bağla, medyaya bağla.
     */
    _renderBeatList() {
      const list = document.getElementById('beat-list');
      const badge = document.getElementById('beat-count-badge');
      if (!list) return;

      const all = this.beatFiles || [];
      if (badge) badge.textContent = `${all.length} ses`;

      if (!all.length) {
        list.innerHTML = '<div class="beat-empty">Beat klasörü boş veya bulunamadı.<br><span style="font-size:9px;opacity:.7">Beat/ klasörüne ses dosyası ekleyin.</span></div>';
        this._updateBeatBgUi?.();
        return;
      }

      const q = (this.beatSearch?.value || '').trim().toLowerCase();
      const filtered = q
        ? all.filter(f => (f.name + ' ' + (f.folder || '')).toLowerCase().includes(q))
        : all;

      if (!filtered.length) {
        list.innerHTML = '<div class="beat-empty">Eşleşen ses yok.</div>';
        this._updateBeatBgUi?.();
        return;
      }

      const st = this.appState.getState();
      const loopSrc = st.globalBackground?.audioSrc || '';
      const sel = this._selectedItem();
      const mediaSrc = (sel && sel.audioTrack && sel.audioTrack.src) || '';
      const playingSrc = this._beatPlayingSrc || '';
      const selectedAudioSrc = (this.selectMediaAudio && this.selectMediaAudio.value) || this._selectedBeatSrc || '';

      list.innerHTML = filtered.map((f) => {
        const c = f.folder ? this._beatFolderColors[f.folder] : null;
        const cls = [
          'beat-item',
          playingSrc === f.src ? 'playing' : '',
          loopSrc === f.src ? 'assigned-loop' : '',
          mediaSrc === f.src ? 'assigned-media' : '',
          selectedAudioSrc === f.src ? 'selected-beat' : ''
        ].filter(Boolean).join(' ');

        const folderChip = f.folder && c
          ? `<span class="beat-item-folder" style="--folder-bar:${c.bar};--folder-text:${c.text};--folder-text-light:${c.textLight};--folder-bg:${c.bg};--folder-bg-light:${c.bgLight};--folder-border-light:${c.borderLight};background:${c.bg};color:${c.text};" title="${this._escapeHtml(f.folder)}">${this._escapeHtml(f.folder.slice(0, 2))}</span>`
          : (f.folder ? `<span class="beat-item-folder" title="${this._escapeHtml(f.folder)}">${this._escapeHtml(f.folder.slice(0, 2))}</span>` : '');

        // Klasör rengi satırın soluna da yansısın (loop kartlarıyla aynı dil)
        const borderStyle = c ? `border-left-color:${c.bar};` : '';

        const isPlaying = playingSrc === f.src;

        // Çalan satırda ▶ yerine ⏸ göster — durdurmanın yolu görünür olsun
        const playIcon = isPlaying ? '⏸' : '▶';
        const playTitle = isPlaying ? 'Durdur' : 'Dinle';

        return `
          <div class="${cls}" data-src="${this._escapeHtml(f.src)}" style="${borderStyle}" title="${this._escapeHtml(f.folder ? f.folder + ' / ' + f.name : f.name)}">
            <button type="button" class="beat-item-act act-play${isPlaying ? ' is-playing' : ''}" data-act="play" title="${playTitle}">${playIcon}</button>
            <span class="beat-item-name">${this._escapeHtml(f.name.replace(/\.[^.]+$/, ''))}</span>
            ${folderChip}
          </div>
        `;
      }).join('');

      // Tek tıklama: satırı seç (dinlet + select-media-audio'ya getir), düğmeler ayrı iş yapar
      list.querySelectorAll('.beat-item').forEach((row) => {
        const src = row.dataset.src;
        row.addEventListener('click', (e) => {
          // Listeden bir müziğe tıklandığında #select-media-audio menüsüne seçili gelsin
          if (this.selectMediaAudio && src) {
            const has = Array.prototype.some.call(this.selectMediaAudio.options, o => o.value === src);
            if (has) {
              this.selectMediaAudio.value = src;
              this._lastMediaAudioSyncSrc = src;
              this._updateMediaAudioAddRemoveBtn?.();
            }
          }
          this._selectedBeatSrc = src;
          list.querySelectorAll('.beat-item').forEach(r => r.classList.toggle('selected-beat', r.dataset.src === src));

          const act = e.target.closest('[data-act]');
          if (!act) {
            // Sadece satıra tıklandığında seçimi yap ama otomatik çalma! Sadece play butonuna basılınca çal.
            return;
          }
          const kind = act.dataset.act;
          if (kind === 'play') {
            this._auditionAudio(src);
          } else if (kind === 'loop') {
            this._assignLoopAudio(src);
          } else if (kind === 'media') {
            this._assignMediaAudio(src);
            this._renderBeatList();
          }
        });
      });
    }

    /** Beat sesini loop arka planına bağlar. */
    _assignLoopAudio(src) {
      const name = src ? ((this.beatFiles || []).find(f => f.src === src) || {}).name : null;
      this.appState.setGlobalBackground({ audioSrc: src || null, audioName: name || null });
      if (this.selectLoopAudio) {
        const has = Array.prototype.some.call(this.selectLoopAudio.options, o => o.value === (src || ''));
        this.selectLoopAudio.value = has ? (src || '') : '';
      }
      this._beatPendingSrc = src || null;
      this._renderBeatList();
      this._updateBeatBgUi();
      this._toast?.(src ? `Loop sesi: ${name}` : 'Loop sesi kaldırıldı', src ? 'ok' : 'info');
    }

    /** Beat dosyasını yayına dokunmadan dinletir. Aynı sese tekrar basınca DURUR. */
    _auditionAudio(src) {
      // Aynı ses çalıyorsa → durdur (toggle). Kullanıcının "susturamıyorum"
      // şikâyeti buydu: tekrar tıklama sesi baştan başlatıyordu.
      if (src && this._beatPlayingSrc === src && this._auditionEl) {
        this._stopBeatPlayback();
        this._toast?.('⏹ Durduruldu', 'info');
        return;
      }

      this._stopAllBeatSound();
      if (!src) {
        this._toast?.('Dinlemek için bir ses seçin', 'warn');
        return;
      }

      try {
        const getBaseVol = () => {
          const s = this.appState.getState();
          if (s.audio?.muted) return 0;
          const m = s.audio?.masterVolume ?? 1;
          return Math.max(0, Math.min(1, 0.85 * MD.audioGain(m)));
        };

        this._auditionEl = new Audio(src);
        this._auditionEl.preload = 'auto';
        this._auditionEl.volume = 0; // Yumuşak fade-in ile başlayacak

        const slider = document.getElementById('beat-seek-slider');
        const curTime = document.getElementById('beat-cur-time');
        const durTime = document.getElementById('beat-dur-time');
        const fmt = (secs) => {
          if (!isFinite(secs) || secs < 0) return '00:00';
          const m = Math.floor(secs / 60);
          const sec = Math.floor(secs % 60);
          return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        };

        const updateDur = () => {
          if (this._auditionEl && isFinite(this._auditionEl.duration) && this._auditionEl.duration > 0) {
            if (durTime) durTime.textContent = fmt(this._auditionEl.duration);
            if (slider) slider.disabled = false;
          }
        };

        this._auditionEl.addEventListener('loadedmetadata', updateDur);
        this._auditionEl.addEventListener('durationchange', updateDur);
        if (this._auditionEl.duration) updateDur();

        // Parçanın bitimine doğru (son 3.5 sn) yumuşak fade-out hesaplama
        const updateFadeAndProgress = () => {
          if (!this._auditionEl) return;
          const cur = this._auditionEl.currentTime;
          const dur = this._auditionEl.duration;

          if (isFinite(dur) && dur > 0) {
            // Son 3.5 saniyede (kısa dosyalarda %25) yumuşak fade-out
            const fadeDur = Math.min(3.5, dur * 0.25);
            const remaining = dur - cur;
            const currentBase = getBaseVol();

            if (remaining <= fadeDur && remaining >= 0) {
              const ratio = Math.max(0, remaining / fadeDur);
              // Karesel akustik yumuşatma eğrisi
              const targetVol = currentBase * (ratio * ratio);
              this._auditionEl.volume = Math.max(0, Math.min(1, targetVol));
            } else if (!this._beatFadingStop && !this._auditionEl._fadeAnimId) {
              this._auditionEl.volume = currentBase;
            }
          }

          if (curTime && (!slider || !slider._dragging)) {
            curTime.textContent = fmt(cur);
          }
          if (slider && !slider._dragging && isFinite(dur) && dur > 0) {
            slider.value = String((cur / dur) * 100);
            slider.disabled = false;
          }
        };

        this._auditionEl.addEventListener('timeupdate', updateFadeAndProgress);

        const fadeMonitor = () => {
          if (!this._auditionEl || this._auditionEl.paused) return;
          updateFadeAndProgress();
          this._auditionRaf = requestAnimationFrame(fadeMonitor);
        };

        this._auditionEl.addEventListener('error', () => {
          this._stopAllBeatSound();
          this._renderBeatList();
          this._toast?.('Ses açılamadı', 'warn');
        });
        this._auditionEl.addEventListener('ended', () => {
          this._stopAllBeatSound();
          this._renderBeatList();
        });

        // Durumu ÖNCE yaz: play() reddedilse bile liste doğru görünsün
        this._beatPlayingSrc = src;
        this._renderBeatList();

        const p = this._auditionEl.play();
        const startPlaybackWithFade = () => {
          MD.fadeAudio(this._auditionEl, getBaseVol(), 250);
          if (this._auditionRaf) cancelAnimationFrame(this._auditionRaf);
          this._auditionRaf = requestAnimationFrame(fadeMonitor);
        };

        if (p && typeof p.then === 'function') {
          p.then(startPlaybackWithFade).catch(() => {
            this._auditionEl.muted = false;
            const again = this._auditionEl.play();
            if (again && typeof again.then === 'function') {
              again.then(startPlaybackWithFade).catch(() => {
                this._beatPlayingSrc = null;
                this._renderBeatList();
              });
            } else if (again && again.catch) {
              again.catch(() => {
                this._beatPlayingSrc = null;
                this._renderBeatList();
              });
            }
          });
        }
        this._toast?.('▶ Dinleniyor — durdurmak için tekrar bas', 'info');
      } catch (e) {
        this._beatPlayingSrc = null;
        this._renderBeatList();
      }
    }

    /** Dinleme sesini tamamen kapatır ve kaynağını serbest bırakır. */
    _stopAllBeatSound() {
      if (this._auditionRaf) {
        cancelAnimationFrame(this._auditionRaf);
        this._auditionRaf = null;
      }
      if (this._auditionEl) {
        try {
          this._auditionEl.pause();
          this._auditionEl.currentTime = 0;
          this._auditionEl.removeAttribute('src');
          this._auditionEl.load();
        } catch (e) {}
      }
      this._auditionEl = null;
      this._beatPlayingSrc = null;
      this._beatFadingStop = false;

      const slider = document.getElementById('beat-seek-slider');
      const curTime = document.getElementById('beat-cur-time');
      const durTime = document.getElementById('beat-dur-time');
      const loopAud = this.audioManager?.loopAudio;
      const isLoopPlaying = Boolean(loopAud && loopAud.src && !loopAud.paused && isFinite(loopAud.duration) && loopAud.duration > 0);

      if (!isLoopPlaying) {
        if (slider) {
          slider.value = '0';
          slider.disabled = true;
        }
        if (curTime) curTime.textContent = '00:00';
        if (durTime) durTime.textContent = '00:00';
      }
    }

    /** Listede çalan dinleme sesini durdurur (yumuşak fade out ile, aniden kesilmez). */
    _stopBeatPlayback() {
      if (this._auditionRaf) {
        cancelAnimationFrame(this._auditionRaf);
        this._auditionRaf = null;
      }
      if (this._auditionEl && !this._auditionEl.paused && this._auditionEl.volume > 0.04) {
        const el = this._auditionEl;
        this._beatFadingStop = true;
        this._beatPlayingSrc = null;
        this._renderBeatList();

        MD.fadeAudio(el, 0, 500, () => {
          this._beatFadingStop = false;
          if (this._auditionEl === el) {
            this._stopAllBeatSound();
          } else {
            try {
              el.pause();
              el.currentTime = 0;
              el.removeAttribute('src');
              el.load();
            } catch (e) {}
          }
        });
      } else {
        this._stopAllBeatSound();
        this._renderBeatList();
      }
    }

    /** Seçili medyaya Beat sesi bağlar (veya kaldırır). */
    _assignMediaAudio(src) {
      const item = this._selectedItem();
      if (!item) {
        this._toast?.('Önce akış listesinden bir medya seçin', 'warn');
        return;
      }
      if (item.type === 'audio') {
        this._toast?.('Ses dosyasına ayrıca ses eklenmez', 'warn');
        return;
      }
      const name = src ? ((this.beatFiles || []).find(f => f.src === src) || {}).name : null;
      item.audioTrack = src ? { src, name, volume: 0.8, enabled: true } : null;

      // Canlı yayındaki öğeyse ekranı da güncelle
      const st = this.appState.getState();
      if (st.liveItem && st.liveItem.id === item.id) {
        this.appState.setState({ liveItem: { ...st.liveItem, audioTrack: item.audioTrack ? { ...item.audioTrack } : null } });
      }

      this.renderPlaylistDb();
      this._syncMediaAudioSelect();
      this._updatePreviewMixBar?.();
      this._updateLiveMixBar?.(this.appState.getState());
      this.saveCurrentPlaylist?.();
      this._toast?.(src ? `Ses bağlandı: ${name}` : 'Medya sesi kaldırıldı', src ? 'ok' : 'info');
    }

    /** Seçili medyanın sesini açılır listede ve + / − butonunda gösterir. */
    _syncMediaAudioSelect() {
      if (!this.selectMediaAudio) return;
      const item = this._selectedItem();
      const itemId = item ? item.id : null;
      const cur = (item && item.audioTrack && item.audioTrack.src) || '';
      const has = Array.prototype.some.call(this.selectMediaAudio.options, o => o.value === cur);
      if (this._lastMediaAudioSyncItemId !== itemId || this._lastMediaAudioSyncSrc !== cur) {
        this._lastMediaAudioSyncItemId = itemId;
        this._lastMediaAudioSyncSrc = cur;
        this.selectMediaAudio.value = has ? cur : '';
      }
      const isDisabled = !item || item.type === 'audio';
      this.selectMediaAudio.disabled = isDisabled;
      this._updateMediaAudioAddRemoveBtn();
    }

    /** .beat-media-row içindeki + / − butonunun durumunu günceller. */
    _updateMediaAudioAddRemoveBtn() {
      if (!this.btnBeatStop) return;
      const item = this._selectedItem();
      const isDisabled = !item || item.type === 'audio';
      const cur = (item && item.audioTrack && item.audioTrack.src) || '';
      const selVal = this.selectMediaAudio ? (this.selectMediaAudio.value || '') : '';
      // Medyaya müzik ekliyse ve açılır listede farklı bir müzik seçilmediyse '−' (kaldır), aksi halde '+' (ekle)
      const isRemoveMode = Boolean(cur && (!selVal || selVal === cur));
      this.btnBeatStop.disabled = isDisabled;
      this.btnBeatStop.textContent = isRemoveMode ? '−' : '+';
      this.btnBeatStop.classList.toggle('beat-remove-btn', isRemoveMode);
      this.btnBeatStop.classList.toggle('beat-stop-btn', isRemoveMode);
      this.btnBeatStop.classList.toggle('beat-add-btn', !isRemoveMode);
      this.btnBeatStop.title = isRemoveMode
        ? 'Medyaya bağlı müziği kaldır (−)'
        : 'Seçili müziği medyaya ekle (+)';
    }

    _stopAudition() {
      this._stopAllBeatSound();
    }

    _fadeModeLabel(mode) {
      return ({
        cut: 'Anında (Cut)',
        crossfade: 'Yumuşak (Crossfade)',
        fadeblack: 'Karartarak (Fade to Black)',
        cards: 'Dağılan Kartlar (Cards)',
        zoom: 'Sinematik Odak (Zoom Blur)',
        slide: 'Kaydırma (Slide Push)',
        sandstorm: 'Kum Fırtınası (Sandstorm)',
        explode: 'Patlama (Explode)',
        vortex: 'Girdap (Vortex)',
        fall: 'Dökülme (Fall)',
        wave: 'Dalga (Wave)',
        thanos: 'Thanos (Kül Dağılma)',
        blinds: 'Panjur (Blinds)',
        mosaic: 'Mozaik (Mosaic)'
      })[mode] || mode;
    }

    /** [7] panelinde seçili geçişi görsel olarak işaretler. */
    _updateFadeModeUi() {
      const tr = this.appState.getState().transition || { type: 'crossfade', duration: 400 };
      const group = document.getElementById('fade-mode-group');
      if (group) {
        group.querySelectorAll('.btn-fade-action').forEach((btn) => {
          const on = btn.dataset.mode === tr.type;
          // Stil tamamen CSS'te (tema duyarlı). Burada yalnızca durum bildirilir.
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      if (this.sliderFadeSpeed) this.sliderFadeSpeed.value = String(tr.duration);
      if (this.fadeSpeedDisplay) this.fadeSpeedDisplay.textContent = `${tr.duration} ms`;
      this.fadeSpeed = tr.duration;
    }

    /**
     * Seçili geçişi, canlıdaki içeriği yeniden yükleyerek dener.
     * Yayını bozmadan sadece ekranda efekti gösterir.
     */
    _testTransition(specificMode = null) {
      if (specificMode) {
        this.appState.setTransition({ type: specificMode });
        this._updateFadeModeUi();
      }
      const state = this.appState.getState();
      if (!state.liveItem || state.playbackState === 'stopped') {
        this._toast?.('Denemek için önce bir medya yayına alın', 'warn');
        return;
      }
      const tr = state.transition || {};
      // Ekranları "aynı içeriği yeniden çiz" diye tetikler (yayın bozulmaz)
      this.appState.setState({ transitionTestId: Date.now() });
      this._toast?.(`Geçiş denendi: ${this._fadeModeLabel(tr.type)} (${tr.duration} ms)`, 'ok');
    }

    _initKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        // Sunum seçiliyken ok tuşları slaytları çevirir (operatör beklentisi).
        // Sunum yoksa ok tuşları medya geçişi olarak çalışmaya devam eder.
        const selItem = this._selectedItem();
        const isPresentation = Boolean(selItem && selItem.type === 'presentation' &&
          Array.isArray(selItem.slides) && selItem.slides.length > 1);

        if (isPresentation && (e.code === 'ArrowRight' || e.code === 'PageDown' || e.code === 'ArrowDown')) {
          e.preventDefault();
          this.stepSlide(1);
          return;
        }
        if (isPresentation && (e.code === 'ArrowLeft' || e.code === 'PageUp' || e.code === 'ArrowUp')) {
          e.preventDefault();
          this.stepSlide(-1);
          return;
        }

        if (e.code === APP_CONFIG.SHORTCUTS.PLAY_PAUSE) {
          e.preventDefault();
          this.btnPlayPause?.click();
        } else if (e.code === APP_CONFIG.SHORTCUTS.NEXT_ITEM) {
          e.preventDefault();
          this.btnNext?.click();
        } else if (e.code === APP_CONFIG.SHORTCUTS.PREV_ITEM) {
          e.preventDefault();
          this.btnPrev?.click();
        } else if (e.code === APP_CONFIG.SHORTCUTS.PANIC_BLACKOUT || e.key === 'Escape') {
          e.preventDefault();
          this.btnPanic?.click();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.publishSelectedItem();
        } else if (e.code === 'KeyM') {
          e.preventDefault();
          this.toggleMuteSmooth(450);
        } else if (e.code === 'KeyT') {
          e.preventDefault();
          this._toggleTheme();
        } else if (e.code === (APP_CONFIG.SHORTCUTS.STOP || 'KeyS') || e.key === 's' || e.key === 'S') {
          e.preventDefault();
          this.btnStop?.click();
        }
      });
    }

    publishSelectedItem() {
      const playlist = this.appState.getState().playlist;
      if (this.selectedItemIndex >= 0 && this.selectedItemIndex < playlist.items.length) {
        const item = playlist.items[this.selectedItemIndex];
        if (item && item.pending) return; // dosya hâlâ içe aktarılıyor
        this.appState.play(this.selectedItemIndex);
        this._updatePlaylistRowStyles();
        this.renderMediaPreview();
      }
    }

    /**
     * Loop Video ve Blur Yöneticisi
     *
     * Liste ÖN TANIMLI DEĞİLDİR: kök klasördeki `loop/` dizini (alt klasörler
     * dahil) taranır ve içindeki tüm videolar listelenir. Klasöre video
     * eklemek yeterlidir; uygulama açılışında kendisi bulur.
     *
     * Alt klasörler farklı renklerle işaretlenir, sıra numarası tüm liste
     * boyunca devam eder (#8 Loop, #9 Loop...).
     */
    async _initLoopVideos() {
      await MD.ready;

      // Alt klasör başına renk paleti (isimleri renklendirmek için)
      this._folderColors = {};
      this._colorPalette = [
        { bar: '#38bdf8', text: '#7dd3fc', bg: 'rgba(56,189,248,0.18)' },
        { bar: '#f6ad55', text: '#fbd38d', bg: 'rgba(246,173,85,0.18)' },
        { bar: '#68d391', text: '#9ae6b4', bg: 'rgba(104,211,145,0.18)' },
        { bar: '#b794f4', text: '#d6bcfa', bg: 'rgba(183,148,244,0.18)' },
        { bar: '#fc8181', text: '#feb2b2', bg: 'rgba(252,129,129,0.18)' },
        { bar: '#4fd1c5', text: '#81e6d9', bg: 'rgba(79,209,197,0.18)' },
        { bar: '#f687b3', text: '#fbb6ce', bg: 'rgba(246,135,179,0.18)' },
        { bar: '#ecc94b', text: '#faf089', bg: 'rgba(236,201,75,0.18)' }
      ];

      const scanned = await MD.listMedia('loop');
      const videos = scanned.filter(it => /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(it.name));

      if (videos.length > 0) {
        this.loopVideos = videos.map((it, idx) => {
          // Alt klasör rengi
          let color = null;
          if (it.folder) {
            if (!this._folderColors[it.folder]) {
              const used = Object.keys(this._folderColors).length;
              this._folderColors[it.folder] = this._colorPalette[used % this._colorPalette.length];
            }
            color = this._folderColors[it.folder];
          }
          return {
            id: 'loop_' + idx,
            index: idx + 1,
            label: `#${idx + 1} Loop`,
            name: it.folder ? `${it.folder} / ${it.name}` : it.name,
            folder: it.folder,
            color: color,
            src: it.src,
            rel: it.rel
          };
        });
        const curBg = this.appState.getState().globalBackground || {};
        if (!curBg.src || !this.loopVideos.some(lv => lv.src === curBg.src)) {
          this.appState.setGlobalBackground({ src: this.loopVideos[0].src });
        }
      } else {
        // Tarama yapılamadı (tarayıcı modu): eski sabit listeye düş
        this.loopVideos = [
          { id: 'flag1', name: '🇹🇷 Türk Bayrağı (Dalgalanan)', src: 'loop/16871-276488572_medium.mp4' },
          { id: 'flag2', name: '🇹🇷 Türk Bayrağı 2 (Göklerde)', src: 'loop/14320-685293368_medium.mp4' },
          { id: 'flag3', name: '🇹🇷 Türk Bayrağı 3 (Işıltılı)', src: 'loop/82427-578641022_medium.mp4' },
          { id: 'flag4', name: '🇹🇷 Tören & Sahne Bayrak Loop', src: 'loop/gemini_generated_video_280bd631.mp4' },
          { id: 'loop1', name: 'Loop 1', src: 'loop/12716-241674181_medium.mp4' },
          { id: 'loop2', name: 'Loop 2', src: 'loop/138556-769988117_medium.mp4' },
          { id: 'loop3', name: 'Loop 3', src: 'loop/138558-770009759_medium.mp4' }
        ].map(function (lv, idx) {
          return Object.assign({}, lv, {
            index: idx + 1,
            label: `#${idx + 1} Loop`,
            folder: '',
            color: null,
            src: MD.loopSrc(lv.src)
          });
        });
      }

      // Dropdown listesini doldur (klasörler optgroup olarak gruplanır)
      if (this.loopVideoSelect) {
        const groups = new Map();
        this.loopVideos.forEach((lv) => {
          const key = lv.folder || '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(lv);
        });

        let html = '<option value="">— Loop seçin —</option>';
        groups.forEach((list, folder) => {
          if (folder) {
            html += `<optgroup label="${this._escapeHtml(folder)}">`;
            list.forEach(lv => {
              html += `<option value="${lv.src}">${lv.label}</option>`;
            });
            html += '</optgroup>';
          }
        });
        // Kök dizindeki dosyalar en sonda
        (groups.get('') || []).forEach(lv => {
          html += `<option value="${lv.src}">${lv.label} — ${this._escapeHtml(lv.name)}</option>`;
        });
        this.loopVideoSelect.innerHTML = html;

        this.loopVideoSelect.addEventListener('change', (e) => {
          if (!e.target.value) return;
          // Yalnızca ön görünüme al; canlıya vermek için ✓ (btn-check-loop)
          this.selectLoopVideo(e.target.value, false);
        });
      }

      // Küçük önizleme kartlarını oluştur
      if (this.loopThumbsContainer) {
        this.loopThumbsContainer.innerHTML = this.loopVideos.map((lv) => {
          const c = lv.color;
          const labelStyle = c
            ? `background:${c.bg}; color:${c.text}; border-left:3px solid ${c.bar};`
            : '';
          return `
            <div class="loop-card-thumb" data-src="${lv.src}" title="${this._escapeHtml(lv.name)}">
              <video src="${lv.src}" muted preload="none" playsinline></video>
              <span class="loop-card-label" style="${labelStyle}">${lv.label}</span>
            </div>
          `;
        }).join('');

        const cards = this.loopThumbsContainer.querySelectorAll('.loop-card-thumb');
        cards.forEach(card => {
          card.addEventListener('click', (e) => {
          if (e.target.closest('#audio-loop-picker')) {
            if (!card.classList.contains('active')) {
              radioCards.forEach(c => c.classList.remove('active'));
              card.classList.add('active');
              const radio = card.querySelector('input[type="radio"]');
              if (radio) radio.checked = true;
              tempSettings.audioScreenMode = card.dataset.mode;
            }
            return;
          }
            const src = card.dataset.src;
            const v = card.querySelector('video');
            if (v && v.preload === 'none') { v.preload = 'metadata'; v.load(); }
            // Yalnızca ön görünüme al. Canlı LED ekrana vermek için ✓ (btn-check-loop).
            this.selectLoopVideo(src, false);
          });
        });

        // Tembel yükleme: kart görünür alana girince ilk kare çözülsün.
        const lazyLoadCard = (card) => {
          const v = card.querySelector('video');
          if (v && v.preload === 'none') { v.preload = 'metadata'; v.load(); }
        };
        let io = null;
        if (typeof IntersectionObserver !== 'undefined') {
          io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
              if (en.isIntersecting) {
                lazyLoadCard(en.target);
                io.unobserve(en.target);
              }
            });
          }, { root: this.loopThumbsContainer, rootMargin: '120px' });
          cards.forEach(c => io.observe(c));
        } else {
          cards.forEach(lazyLoadCard);
        }
        this._loopThumbObserver = io;
      }

      // Transparanlık / Opaklık Slider Ayarı (%0 - %100)
      const opSlider = this.sliderLoopOpacity;
      if (opSlider) {
        opSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          const opacity = isNaN(val) ? 1.0 : (val / 100);
          if (this.opacityValDisplay) this.opacityValDisplay.textContent = `%${val}`;
          // Seçili medyada bağlı bir loop varsa onun kaydedilmiş opaklığını da anında güncelle
          const selItem = this._selectedItem();
          if (selItem && selItem.loopTrack && selItem.loopTrack.src) {
            selItem.loopTrack.opacity = opacity;
          }
          // SIFIR YENİDEN YÜKLEME: DOM kurulmaz, video elementi korunur.
          // Yalnızca GPU kompozit katmanının opacity'si değişir.
          this._applyPreviewLoopOpacity(opacity);
          this.appState.setLoopOpacity(opacity);
          this._updatePreviewMixBar?.();
        });
        opSlider.addEventListener('change', () => {
          const selItem = this._selectedItem();
          if (selItem && selItem.loopTrack && selItem.loopTrack.src) {
            this.saveCurrentPlaylist?.();
          }
        });

        // Fare tekerleği (wheel) ile hassas opaklık ayarı (yukarı: +%1, aşağı: -%1, Shift ile: +/-%5)
        const loopOpRow = document.getElementById('loop-opacity-row');
        const wheelTargets = [opSlider, this.opacityValDisplay, loopOpRow].filter(Boolean);
        const handleWheel = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? 5 : 1;
          const dir = e.deltaY < 0 ? step : -step;
          let curVal = parseInt(opSlider.value, 10);
          if (isNaN(curVal)) curVal = 35;
          const nextVal = Math.max(0, Math.min(100, curVal + dir));
          if (nextVal !== curVal) {
            opSlider.value = nextVal;
            opSlider.dispatchEvent(new Event('input', { bubbles: true }));
            opSlider.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        wheelTargets.forEach(el => {
          el.addEventListener('wheel', handleWheel, { passive: false });
        });
      }

      // Siyah-Beyaz (Monokrom) Loop Filtresi (btn-loop-bw)
      if (this.btnLoopBw) {
        this._updateLoopBwButtonUi();
        this.btnLoopBw.addEventListener('click', () => {
          this.previewLoopGrayscale = !this.previewLoopGrayscale;
          const selItem = this._selectedItem();
          if (selItem && selItem.loopTrack && selItem.loopTrack.src) {
            selItem.loopTrack.grayscale = this.previewLoopGrayscale;
            this.saveCurrentPlaylist?.();
          }
          const curBg = this.appState.getState().globalBackground || {};
          if (curBg.enabled) {
            this.appState.setGlobalBackground({ grayscale: this.previewLoopGrayscale });
          }
          this._updateLoopBwButtonUi();
          this._applyPreviewLoopFilter(this.previewLoopGrayscale);
          this._updatePreviewMixBar?.();
          this._updateLiveMixBar?.(this.appState.getState());
          this._toast?.(
            this.previewLoopGrayscale
              ? '🌓 Loop filtresi: Siyah / Beyaz (Monokrom) aktif'
              : '🌈 Loop filtresi: Orijinal renkli moda dönüldü',
            this.previewLoopGrayscale ? 'ok' : 'info'
          );
        });
      }

      // Yatay Ayna (Flip X)
      if (this.btnLoopFlipX) {
        this._updateLoopFlipButtonsUi();
        this.btnLoopFlipX.addEventListener('click', () => {
          this.previewLoopFlipX = !this.previewLoopFlipX;
          const selItem = this._selectedItem();
          if (selItem && selItem.loopTrack && selItem.loopTrack.src) {
            selItem.loopTrack.flipX = this.previewLoopFlipX;
            this.saveCurrentPlaylist?.();
          }
          const curBg = this.appState.getState().globalBackground || {};
          if (curBg.enabled) {
            this.appState.setGlobalBackground({ flipX: this.previewLoopFlipX });
          }
          this._updateLoopFlipButtonsUi();
          this._applyPreviewLoopTransforms();
          this._toast?.(
            this.previewLoopFlipX ? '⇄ Loop Video: Yatay ayna (sağa-sola ters) aktif' : '⇄ Loop Video: Yatay ayna kapatıldı',
            this.previewLoopFlipX ? 'ok' : 'info'
          );
        });
      }

      // Dikey Ayna (Flip Y)
      if (this.btnLoopFlipY) {
        this._updateLoopFlipButtonsUi();
        this.btnLoopFlipY.addEventListener('click', () => {
          this.previewLoopFlipY = !this.previewLoopFlipY;
          const selItem = this._selectedItem();
          if (selItem && selItem.loopTrack && selItem.loopTrack.src) {
            selItem.loopTrack.flipY = this.previewLoopFlipY;
            this.saveCurrentPlaylist?.();
          }
          const curBg = this.appState.getState().globalBackground || {};
          if (curBg.enabled) {
            this.appState.setGlobalBackground({ flipY: this.previewLoopFlipY });
          }
          this._updateLoopFlipButtonsUi();
          this._applyPreviewLoopTransforms();
          this._toast?.(
            this.previewLoopFlipY ? '⇅ Loop Video: Dikey ters çevirme aktif' : '⇅ Loop Video: Dikey ters çevirme kapatıldı',
            this.previewLoopFlipY ? 'ok' : 'info'
          );
        });
      }

      // Loop Arka Plan Açma / Onaylama / Kapatma (btn-check-loop)
      if (this.btnCheckLoop) {
        this._updateLoopButtonUi();

        this.btnCheckLoop.addEventListener('click', () => {
          const currentBg = this.appState.getState().globalBackground;
          const isLiveActive = Boolean(currentBg && currentBg.enabled);
          const isLiveSameSrc = (currentBg && currentBg.src === this.previewLoopSrc);

          if (isLiveActive && isLiveSameSrc) {
            // Canlıdaki loop'u kapat — ön görünümdeki seçim korunur
            this.appState.setGlobalBackground({ enabled: false });
            this.previewLoopSrc = currentBg.src || this.previewLoopSrc;
            this.previewLoopEnabled = Boolean(this.previewLoopSrc);
          } else {
            // Seçili loop videoyu canlı yayına onayla ve aktar!
            const targetSrc = this.previewLoopSrc || (this.loopVideos[0] ? this.loopVideos[0].src : currentBg.src);
            const opSlider = this.sliderLoopOpacity;
            const opacity = opSlider ? (parseInt(opSlider.value, 10) / 100) : 0.35;

            this.appState.setGlobalBackground({
              enabled: true,
              type: 'video',
              src: targetSrc,
              loop: true,
              opacity: isNaN(opacity) ? 0.35 : opacity,
              grayscale: Boolean(this.previewLoopGrayscale),
              flipX: Boolean(this.previewLoopFlipX),
              flipY: Boolean(this.previewLoopFlipY)
            });
            this.previewLoopSrc = targetSrc;
            this.previewLoopEnabled = true;
          }

          this._updateLoopButtonUi();
          this.renderMediaPreview();
        });
      }

      // Loop Tamamen Kapatma Butonu (btn-disable-all-loop)
      if (this.btnDisableAllLoop) {
        this.btnDisableAllLoop.addEventListener('click', () => {
          this.previewLoopEnabled = false;
          this.previewLoopSrc = null;
          this._mixLastLoopSrc = null;
          this.appState.setGlobalBackground({ enabled: false });
          if (this.loopThumbsContainer) {
            this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
          }
          const selIt = this._selectedItem();
          if (selIt && selIt.loopTrack) {
            delete selIt.loopTrack;
            delete selIt.loopSrc;
            this.saveCurrentPlaylist?.();
          }
          this.renderPlaylistDb();
          this._syncMediaLoopSelect?.();
          if (this.loopVideoSelect) {
            this.loopVideoSelect.selectedIndex = -1;
          }
          this._updateLoopButtonUi();
          this.renderMediaPreview();
        });
      }

      // Seçili medyaya özel Loop Video açılır listesi (Tören öncesi hazırlık + / −)
      if (this.selectMediaLoop) {
        const groups = new Map();
        this.loopVideos.forEach((lv) => {
          const key = lv.folder || '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(lv);
        });
        let mHtml = '<option value="">— Medya loop\'u yok —</option>';
        groups.forEach((list, folder) => {
          if (folder) {
            mHtml += `<optgroup label="${this._escapeHtml(folder)}">`;
            list.forEach(lv => {
              mHtml += `<option value="${lv.src}">${lv.label} — ${this._escapeHtml(lv.name)}</option>`;
            });
            mHtml += '</optgroup>';
          }
        });
        (groups.get('') || []).forEach(lv => {
          mHtml += `<option value="${lv.src}">${lv.label} — ${this._escapeHtml(lv.name)}</option>`;
        });
        this.selectMediaLoop.innerHTML = mHtml;

        this.selectMediaLoop.addEventListener('change', () => {
          this._updateMediaLoopAddRemoveBtn();
        });
      }

      if (this.btnMediaLoopToggle) {
        this.btnMediaLoopToggle.addEventListener('click', () => {
          const item = this._selectedItem();
          if (!item) {
            this._toast?.('Önce akış listesinden bir medya seçin', 'warn');
            return;
          }
          const curSrc = (item.loopTrack && item.loopTrack.src) || '';
          const selVal = this.selectMediaLoop?.value || '';

          if (curSrc && (!selVal || selVal === curSrc)) {
            // Zaten loop ekli: kaldır (−)
            this._assignMediaLoop(null);
            if (this.selectMediaLoop) this.selectMediaLoop.value = '';
            this._syncMediaLoopSelect();
          } else {
            // Loop ekle (+)
            const srcToAdd = selVal || this.previewLoopSrc || (this.loopVideos && this.loopVideos[0] ? this.loopVideos[0].src : '');
            if (!srcToAdd) {
              this._toast?.('Önce eklenecek loop videoyu seçin', 'warn');
              return;
            }
            if (this.selectMediaLoop) this.selectMediaLoop.value = srcToAdd;
            this._assignMediaLoop(srcToAdd);
            this._syncMediaLoopSelect();
          }
        });
      }

      // Başlangıçta loop video kapalı başlar; kullanıcı tıklayana kadar ön görünüm ve canlı temizdir
      this.previewLoopSrc = null;
      this.previewLoopEnabled = false;
      this._updateLoopButtonUi();
      this._syncMediaLoopSelect();
    }

    /** Seçili medyaya Loop Video bağlar veya kaldırır (Tören öncesi hazırlık). */
    _assignMediaLoop(src) {
      const item = this._selectedItem();
      if (!item) {
        this._toast?.('Önce akış listesinden bir medya seçin', 'warn');
        return;
      }
      const found = src ? (this.loopVideos || []).find(lv => lv.src === src) : null;
      let name = found ? (found.label + ' — ' + found.name) : null;
      if (src && !name) {
        const parts = src.split(/[\\/]/);
        name = (parts[parts.length - 1] || 'Loop Video').replace(/\.[^/.]+$/, '');
      }
      // '+' ya basıldığı anda opaklık slider'ında hangi değer varsa o değerle kaydet!
      const opSlider = this.sliderLoopOpacity;
      const rawPct = opSlider ? parseInt(opSlider.value, 10) : 35;
      const savedOpacity = Number.isFinite(rawPct) ? Math.max(0, Math.min(1, rawPct / 100)) : 0.35;
      const pctLabel = Math.round(savedOpacity * 100);

      item.loopTrack = src ? { src, name, enabled: true, opacity: savedOpacity, grayscale: Boolean(this.previewLoopGrayscale), flipX: Boolean(this.previewLoopFlipX), flipY: Boolean(this.previewLoopFlipY) } : null;

      // Canlı yayındaki öğeyse ekranı ve canlı arka planı da güncelle
      const st = this.appState.getState();
      if (st.liveItem && st.liveItem.id === item.id) {
        const nextBg = { ...st.globalBackground };
        if (item.loopTrack && item.loopTrack.src) {
          nextBg.src = item.loopTrack.src;
          nextBg.type = 'video';
          nextBg.loop = true;
          nextBg.enabled = item.loopTrack.enabled !== false;
          nextBg.opacity = savedOpacity;
        } else {
          nextBg.enabled = false;
        }
        this.appState.setState({
          liveItem: { ...st.liveItem, loopTrack: item.loopTrack ? { ...item.loopTrack } : null },
          globalBackground: nextBg
        });
      }

      this.renderPlaylistDb();
      this.renderMediaPreview();
      this._syncMediaLoopSelect();
      this._updatePreviewMixBar();
      this._updateLiveMixBar(this.appState.getState());
      this.saveCurrentPlaylist();
      this._toast?.(src ? `🔄 Loop bağlandı: ${name} (%${pctLabel})` : 'Medya loop videosu kaldırıldı', src ? 'ok' : 'info');
    }

    /** Seçili medyanın loop videosunu açılır listede ve + / − butonunda gösterir. */
    _syncMediaLoopSelect() {
      if (!this.selectMediaLoop) return;
      const item = this._selectedItem();
      const itemId = item ? item.id : null;
      const cur = (item && item.loopTrack && item.loopTrack.src) || '';
      const has = Array.prototype.some.call(this.selectMediaLoop.options, o => o.value === cur);
      if (this._lastMediaLoopSyncItemId !== itemId || this._lastMediaLoopSyncSrc !== cur) {
        this._lastMediaLoopSyncItemId = itemId;
        this._lastMediaLoopSyncSrc = cur;
        this.selectMediaLoop.value = has ? cur : '';
        // Seçili medyada kayıtlı bir loop opaklığı varsa slider ve ön görünümü o değere eşitle
        if (item && item.loopTrack && item.loopTrack.opacity !== undefined) {
          const pct = Math.round(Math.max(0, Math.min(1, Number(item.loopTrack.opacity))) * 100);
          if (this.sliderLoopOpacity) this.sliderLoopOpacity.value = String(pct);
          if (this.opacityValDisplay) this.opacityValDisplay.textContent = `%${pct}`;
        }
        if (item && item.loopTrack) {
          if (item.loopTrack.grayscale !== undefined) this.previewLoopGrayscale = Boolean(item.loopTrack.grayscale);
          if (item.loopTrack.flipX !== undefined) this.previewLoopFlipX = Boolean(item.loopTrack.flipX);
          if (item.loopTrack.flipY !== undefined) this.previewLoopFlipY = Boolean(item.loopTrack.flipY);
          this._updateLoopBwButtonUi();
          this._updateLoopFlipButtonsUi();
          this._applyPreviewLoopTransforms();
        }
      }
      this.selectMediaLoop.disabled = !item;

      if (this.loopThumbsContainer) {
        this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => {
          c.classList.toggle('assigned-media-loop', Boolean(cur && c.dataset.src === cur));
        });
      }

      this._updateMediaLoopAddRemoveBtn();
    }

    /** .loop-media-row içindeki + / − butonunun durumunu günceller. */
    _updateMediaLoopAddRemoveBtn() {
      if (!this.btnMediaLoopToggle) return;
      const item = this._selectedItem();
      const isDisabled = !item;
      const cur = (item && item.loopTrack && item.loopTrack.src) || '';
      const selVal = this.selectMediaLoop ? (this.selectMediaLoop.value || '') : '';
      const isRemoveMode = Boolean(cur && (!selVal || selVal === cur));
      this.btnMediaLoopToggle.disabled = isDisabled;
      this.btnMediaLoopToggle.textContent = isRemoveMode ? '−' : '+';
      this.btnMediaLoopToggle.classList.toggle('beat-remove-btn', isRemoveMode);
      this.btnMediaLoopToggle.classList.toggle('beat-stop-btn', isRemoveMode);
      this.btnMediaLoopToggle.classList.toggle('beat-add-btn', !isRemoveMode);
      this.btnMediaLoopToggle.title = isRemoveMode
        ? 'Medyaya bağlı loop videoyu kaldır (−)'
        : 'Seçili loop videoyu medyaya ekle (+)';
    }

    _updateLoopButtonUi() {
      if (!this.btnCheckLoop) return;
      const currentBg = this.appState.getState().globalBackground;
      const isLiveActive = Boolean(currentBg && currentBg.enabled);
      const isLiveSameSrc = (currentBg && currentBg.src === this.previewLoopSrc);
      const previewOnly = Boolean(this.previewLoopEnabled && this.previewLoopSrc && !isLiveSameSrc);

      let nextState = 'off';
      let nextIcon = '✓';
      let nextLabel = 'YAYINLA';
      let nextTitle = 'Canlı loop kapalı. Ön görünüme almak için bir loop kartına tıklayın.';

      if (isLiveActive && isLiveSameSrc) {
        nextState = 'live';
        nextIcon = '●';
        nextLabel = 'CANLI';
        nextTitle = 'Loop video şu an CANLI yayında. Kapatmak için tıklayın (ön görünümde kalır).';
      } else if (previewOnly) {
        nextState = 'preview';
        nextIcon = '✓';
        nextLabel = 'YAYINLA';
        nextTitle = 'Loop yalnızca ÖN GÖRÜNÜMDE. Canlı LED ekrana vermek için tıklayın.';
      }

      if (this.btnCheckLoop.dataset.state !== nextState) {
        this.btnCheckLoop.dataset.state = nextState;
        this._setLoopPublishLabel(nextIcon, nextLabel);
        this.btnCheckLoop.title = nextTitle;
      }
    }

    /** ✓ düğmesinin içeriği (yalnızca kompakt ikon). */
    _setLoopPublishLabel(icon, label) {
      this.btnCheckLoop.innerHTML =
        `<span class="loop-btn-icon" style="font-size:13px; font-weight:700;">${icon}</span>`;
    }

    /**
     * [8] Beat Arka Plan düğmesinin durumu.
     * Canlı beat varsa yeşil "CANLI", yalnızca seçim varsa mavi "YAYINLA".
     */
    _updateBeatBgUi() {
      if (!this.btnBeatPublish) return;
      const bg = this.appState.getState().globalBackground || {};
      const liveSrc = bg.audioSrc || '';
      const sel = this.selectLoopAudio;

      // Başka pencereden/panelden gelen değişikliği seçime yansıt.
      if (sel && liveSrc && sel.value !== liveSrc) {
        const hasOption = Array.from(sel.options).some(o => o.value === liveSrc);
        if (hasOption) sel.value = liveSrc;
      }

      const isLive = Boolean(liveSrc) && (!sel || sel.value === liveSrc);
      const nextState = isLive ? 'live' : 'off';
      if (this.btnBeatPublish.dataset.state !== nextState) {
        this.btnBeatPublish.dataset.state = nextState;
        this.btnBeatPublish.innerHTML = isLive
          ? '<span class="loop-btn-icon">●</span><span>CANLI</span>'
          : '<span class="loop-btn-icon">✓</span><span>Yayınla</span>';
      }
      const nextTitle = isLive
        ? `Beat canlı yayında: ${bg.audioName || 'seçili ses'} (kapatmak için KAPAT)`
        : 'Seçili beat sesini canlı yayına ver';
      if (this.btnBeatPublish.title !== nextTitle) {
        this.btnBeatPublish.title = nextTitle;
      }
    }

    selectLoopVideo(src, commitToLive = false) {
      this.previewLoopSrc = src;
      this.previewLoopEnabled = true;

      if (this.loopVideoSelect) this.loopVideoSelect.value = src;
      if (this.selectMediaLoop) {
        this.selectMediaLoop.value = src;
        this._updateMediaLoopAddRemoveBtn();
      }

      if (this.loopThumbsContainer) {
        const cards = this.loopThumbsContainer.querySelectorAll('.loop-card-thumb');
        cards.forEach(c => c.classList.toggle('active-loop', c.dataset.src === src));
      }

      if (commitToLive) {
        const opSlider = this.sliderLoopOpacity;
        const opacity = opSlider ? (parseInt(opSlider.value, 10) / 100) : 0.35;
        this.appState.setGlobalBackground({
          enabled: true,
          type: 'video',
          src: src,
          loop: true,
          opacity: isNaN(opacity) ? 0.35 : opacity
        });
      }

      this._updateLoopButtonUi();
      this.renderMediaPreview();
      this._updatePreviewMixBar();
    }

    renderPlaylistDb() {
      const playlist = this.appState.getState().playlist;
      const items = playlist.items;
      const liveIndex = (this.appState.getState().playbackState === 'playing') ? playlist.currentIndex : -1;

      if (this.playlistCountLabel) {
        this.playlistCountLabel.textContent = `${items.length} Medya`;
      }

      if (items.length === 0) {
        this.playlistDbContainer.innerHTML = `
          <div style="text-align:center; padding:30px 10px; color:var(--text-dim); font-size:11px;">
            Liste boş.<br>Yukarıdaki <strong>"📁 Klasör Ekle"</strong> veya <strong>"➕ Dosya Ekle"</strong> ile medyalarınızı yükleyin ya da dosyaları doğrudan buraya sürükleyin.
          </div>
        `;
        return;
      }

      this.playlistDbContainer.innerHTML = items.map((item, index) => {
        const isLive = (index === liveIndex);
        const isPreview = (index === this.selectedItemIndex);

        let rowClass = 'playlist-row';
        if (isLive) rowClass += ' active-live';
        else if (isPreview) rowClass += ' active-preview';

        let typeIcon = '📄';
        if (item.type === 'video') typeIcon = '🎥';
        else if (item.type === 'image') typeIcon = '🖼️';
        else if (item.type === 'audio') typeIcon = '🎵';
        else if (item.type === 'presentation') typeIcon = '📊';

        let statusBadge = '';
        if (item.pending) statusBadge = `<span style="color:#f6ad55; font-weight:700; font-size:9px;">⏳ YÜKLENİYOR</span>`;
        else if (isLive) statusBadge = `<span class="status-live-text">● CANLI</span>`;
        else if (isPreview) statusBadge = `<span class="status-preview-text" title="Ön Görünüm">👁️</span>`;

        // Loop video bağlıysa ve aktifse küçük işaret (film şeridi)
        const hasValidLoop = Boolean(item.loopTrack && item.loopTrack.src && item.loopTrack.enabled !== false);
        const loopMark = hasValidLoop
          ? `<span class="row-loop-badge" title="Bağlı Loop Video: ${this._escapeHtml(item.loopTrack.name || '')}" style="color:#38bdf8; font-size:11px; margin:0 2px;">🎞️</span>`
          : '';
        // Beat sesi bağlıysa ve aktifse küçük işaret
        const hasValidAudio = Boolean(item.audioTrack && item.audioTrack.src && item.audioTrack.enabled !== false);
        const audioMark = hasValidAudio
          ? `<span class="row-audio-badge" title="Bağlı Ses: ${this._escapeHtml(item.audioTrack.name || '')}" style="color:#b794f4; font-size:11px; margin:0 2px;">🎵</span>`
          : '';

        return `
          <div class="${rowClass}" data-index="${index}" title="Tek tık: Ön Görünüm • Çift tık: Yayına Ver • Tutamaçtan Sürükle: Sırala">
            <div class="playlist-row-left">
              <span class="drag-handle" title="Sıralamak için buradan tutup sürükleyin">⋮⋮</span>
              <span style="font-size:12px;">${typeIcon}</span>
              <span class="playlist-name">#${index + 1} ${item.title}</span>
            </div>
            <div class="playlist-row-icons">
              <span class="playlist-status-badge">${statusBadge}</span>
              ${loopMark}
              ${audioMark}
              <span style="font-size:10px; color:var(--text-dim);">${item.duration > 0 ? item.duration + 's' : 'Manuel'}</span>
            </div>
          </div>
        `;
      }).join('');

      this._bindPlaylistDragEvents();
    }

    _updatePlaylistRowStyles() {
      if (!this.playlistDbContainer) return;
      const rows = this.playlistDbContainer.querySelectorAll('.playlist-row');
      const liveIndex = (this.appState.getState().playbackState === 'playing') ? this.appState.getState().playlist.currentIndex : -1;

      rows.forEach((row, i) => {
        const isLive = (i === liveIndex);
        const isPreview = (i === this.selectedItemIndex);
        row.classList.toggle('active-live', isLive);
        row.classList.toggle('active-preview', isPreview && !isLive);

        const badge = row.querySelector('.playlist-status-badge');
        if (badge) {
          let nextBadgeState = 'none';
          let nextBadgeHtml = '';
          if (isLive) {
            nextBadgeState = 'live';
            nextBadgeHtml = `<span class="status-live-text">● CANLI</span>`;
          } else if (isPreview) {
            nextBadgeState = 'preview';
            nextBadgeHtml = `<span class="status-preview-text" title="Ön Görünüm">👁️</span>`;
          }
          if (badge.dataset.badgeState !== nextBadgeState) {
            badge.dataset.badgeState = nextBadgeState;
            badge.innerHTML = nextBadgeHtml;
          }
        }
      });
    }

    /**
     * Akış öğesinin listedeki yerini değiştirir ve kalıcı olarak kaydeder.
     */
    _movePlaylistItem(fromIndex, toIndex) {
      if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;
      const playlist = this.appState.getState().playlist;
      if (!playlist || !Array.isArray(playlist.items)) return;
      if (fromIndex < 0 || fromIndex >= playlist.items.length || toIndex < 0 || toIndex >= playlist.items.length) return;

      playlist.moveItem(fromIndex, toIndex);

      if (this.selectedItemIndex === fromIndex) {
        this.selectedItemIndex = toIndex;
      } else if (fromIndex < this.selectedItemIndex && toIndex >= this.selectedItemIndex) {
        this.selectedItemIndex--;
      } else if (fromIndex > this.selectedItemIndex && toIndex <= this.selectedItemIndex) {
        this.selectedItemIndex++;
      }

      this.appState.setState({ playlist });
      this.renderPlaylistDb();
      this.renderMediaPreview();
      this.saveCurrentPlaylist();
    }

    /**
     * Akış Listesi Dinamik Sıralama (Live Shift Sortable)
     * .drag-handle tutulup sürüklendiğinde öğe fareyi takip eder,
     * diğer öğeler akıcı biçimde kayarak arayı açar (smooth animated slot).
     */
    _bindPlaylistDragEvents() {
      if (!this.playlistDbContainer) return;
      const container = this.playlistDbContainer;
      const rows = Array.from(container.querySelectorAll('.playlist-row'));
      if (rows.length < 2) return;

      rows.forEach(row => {
        row.removeAttribute('draggable');
        const handle = row.querySelector('.drag-handle');
        if (!handle) return;
        handle.removeAttribute('draggable');

        handle.onpointerdown = (e) => {
          if (e.button !== 0) return; // Yalnızca sol tık

          e.preventDefault();
          e.stopPropagation();

          const fromIndex = parseInt(row.dataset.index, 10);
          if (isNaN(fromIndex)) return;

          try { handle.setPointerCapture(e.pointerId); } catch (err) {}

          const startY = e.clientY;
          let targetIndex = fromIndex;
          let isDraggingActive = false;
          this._isSortingActive = true;

          const currentRows = Array.from(container.querySelectorAll('.playlist-row'));
          const initialRects = currentRows.map(r => r.getBoundingClientRect());
          const rowHeight = initialRects[fromIndex] ? initialRects[fromIndex].height : 38;
          const initialTops = initialRects.map(r => r.top);
          const stepHeight = currentRows.length > 1
            ? Math.max(20, initialTops[1] - initialTops[0])
            : (rowHeight + 4);
          const initialScrollTop = container.scrollTop;

          const onPointerMove = (ev) => {
            const deltaY = ev.clientY - startY;

            // Küçük tıklama titremelerini önlemek için 3px eşik
            if (!isDraggingActive) {
              if (Math.abs(deltaY) < 3) return;
              isDraggingActive = true;
              row.classList.add('is-dragging');
              document.body.classList.add('is-sorting-playlist');
            }

            ev.preventDefault();

            // Kenarlara yaklaşıldığında otomatik kaydırma (auto-scroll)
            const cRect = container.getBoundingClientRect();
            if (ev.clientY < cRect.top + 30) {
              container.scrollTop -= 5;
            } else if (ev.clientY > cRect.bottom - 30) {
              container.scrollTop += 5;
            }

            // Sürüklenen satır doğrudan fareyi takip eder
            row.style.transform = `translateY(${deltaY}px) scale(1.02)`;

            // Scroll farkını hesaba katarak en yakın hedef satır indeksini hesapla
            const currentScrollDiff = container.scrollTop - initialScrollTop;
            const draggedCenterY = initialTops[fromIndex] + (rowHeight / 2) + deltaY + currentScrollDiff;

            let closestIndex = 0;
            let minDistance = Infinity;
            for (let i = 0; i < currentRows.length; i++) {
              const midY = initialTops[i] + (rowHeight / 2);
              const dist = Math.abs(draggedCenterY - midY);
              if (dist < minDistance) {
                minDistance = dist;
                closestIndex = i;
              }
            }

            const newTarget = Math.max(0, Math.min(currentRows.length - 1, closestIndex));
            if (newTarget !== targetIndex) {
              targetIndex = newTarget;
            }

            // Diğer tüm satırları kaydırarak yer aç (Smooth Shift)
            currentRows.forEach((r, idx) => {
              if (idx === fromIndex) return;

              if (fromIndex < targetIndex) {
                // Aşağı sürükleniyor: aradaki satırlar YUKARI kayar
                if (idx > fromIndex && idx <= targetIndex) {
                  r.style.transform = `translateY(-${stepHeight}px)`;
                } else {
                  r.style.transform = '';
                }
              } else if (fromIndex > targetIndex) {
                // Yukarı sürükleniyor: aradaki satırlar AŞAĞI kayar
                if (idx >= targetIndex && idx < fromIndex) {
                  r.style.transform = `translateY(${stepHeight}px)`;
                } else {
                  r.style.transform = '';
                }
              } else {
                r.style.transform = '';
              }
            });
          };

          const onPointerUp = (ev) => {
            try { handle.releasePointerCapture(ev.pointerId); } catch (err) {}
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);

            document.body.classList.remove('is-sorting-playlist');
            row.classList.remove('is-dragging');

            currentRows.forEach(r => {
              r.style.transform = '';
            });

            setTimeout(() => {
              this._isSortingActive = false;
            }, 60);

            if (isDraggingActive && targetIndex !== fromIndex) {
              this._movePlaylistItem(fromIndex, targetIndex);
            }
          };

          handle.addEventListener('pointermove', onPointerMove);
          handle.addEventListener('pointerup', onPointerUp);
          handle.addEventListener('pointercancel', onPointerUp);
        };
      });
    }

    /**
     * Loop önizleme katmanının opaklığını DOM'u YENİDEN KURMADAN günceller.
     *
     * Eski davranış: her `input` olayında renderMediaPreview() → innerHTML →
     * oynayan video elementinin saniyede 60 kez silinip yeniden yaratılması.
     * Yeni davranış: mevcut katman bulunur, yalnızca GPU opacity'si değişir.
     */
    _applyPreviewLoopOpacity(op) {
      if (!this.mediaPreviewArea) return;
      const overlay = this.mediaPreviewArea.querySelector('[data-loop-overlay]');
      if (overlay) {
        if (!overlay.style.willChange) overlay.style.willChange = 'opacity';
        overlay.style.opacity = String(op);
      }
    }

    _updateLoopBwButtonUi() {
      if (!this.btnLoopBw) return;
      const isBw = Boolean(this.previewLoopGrayscale);
      if (isBw) {
        this.btnLoopBw.classList.add('is-active');
        this.btnLoopBw.title = 'Siyah-Beyaz Filtre Aktif (Loop video monokrom). Renkli moda dönmek için tıklayın.';
      } else {
        this.btnLoopBw.classList.remove('is-active');
        this.btnLoopBw.title = 'Siyah-Beyaz Filtre: Loop videoyu monokrom (siyah/beyaz) yapar.';
      }
    }

    _updateLoopFlipButtonsUi() {
      if (this.btnLoopFlipX) {
        const isFlipX = Boolean(this.previewLoopFlipX);
        this.btnLoopFlipX.classList.toggle('is-active', isFlipX);
        this.btnLoopFlipX.title = isFlipX
          ? 'Yatay Ayna Aktif (Sağa-sola ters). Normale dönmek için tıklayın.'
          : 'Yatay Ayna: Loop videoyu yatayda (sağa-sola) ters çevirir / aynalar.';
      }
      if (this.btnLoopFlipY) {
        const isFlipY = Boolean(this.previewLoopFlipY);
        this.btnLoopFlipY.classList.toggle('is-active', isFlipY);
        this.btnLoopFlipY.title = isFlipY
          ? 'Dikey Ters Aktif (Yukarı-aşağı ters). Normale dönmek için tıklayın.'
          : 'Dikey Ters: Loop videoyu dikeyde (yukarı-aşağı) ters çevirir.';
      }
    }

    _applyPreviewLoopTransforms() {
      if (!this.mediaPreviewArea) return;
      const filterVal = this.previewLoopGrayscale ? 'grayscale(100%) contrast(106%)' : 'none';
      const scaleX = this.previewLoopFlipX ? -1 : 1;
      const scaleY = this.previewLoopFlipY ? -1 : 1;
      const transformVal = `scale(${scaleX}, ${scaleY}) translate3d(0,0,0)`;
      const overlays = this.mediaPreviewArea.querySelectorAll('[data-loop-overlay]');
      overlays.forEach(el => {
        el.style.transition = 'filter 250ms ease, transform 250ms ease';
        el.style.filter = filterVal;
        el.style.transform = transformVal;
      });
    }

    _applyPreviewLoopFilter(isBw) {
      this._applyPreviewLoopTransforms();
    }

    _applyPreviewLedConfigInPlace(ledCfg, currentItem) {
      if (!this.mediaPreviewArea || !currentItem) return;
      const wrapper = this.mediaPreviewArea.querySelector('.staging-monitor-wrapper');
      if (!wrapper) return;
      const ledW = ledCfg.width || 1536;
      const ledH = ledCfg.height || 768;
      wrapper.style.aspectRatio = `${ledW} / ${ledH}`;

      const previewScale = ledCfg.scaleMode || 'contain';
      const scaleClass = `fit-${previewScale}`;

      const mainHost = wrapper.querySelector('.pv-main-host');
      if (mainHost) {
        const mediaEl = mainHost.querySelector('#pv-video-el, img');
        if (mediaEl) {
          mediaEl.classList.remove('fit-contain', 'fit-cover', 'fit-fill', 'fit-original');
          mediaEl.classList.add(scaleClass);
          if (previewScale === 'original') {
            const nw = mediaEl.videoWidth || mediaEl.naturalWidth || (currentItem && currentItem.naturalWidth) || 0;
            const nh = mediaEl.videoHeight || mediaEl.naturalHeight || (currentItem && currentItem.naturalHeight) || 0;
            if (nw > 0 && nh > 0) {
              mediaEl.style.width = `${(nw / ledW) * 100}%`;
              mediaEl.style.height = `${(nh / ledH) * 100}%`;
            }
          } else {
            mediaEl.style.width = '100%';
            mediaEl.style.height = '100%';
          }
        }
      }

      const fillHost = wrapper.querySelector('.pv-fill-host');
      if (fillHost) {
        const previewFillMode = ledCfg.fillMode || 'blank';
        let previewFillHtml = '';
        if (previewScale === 'contain' || previewScale === 'original') {
          if (previewFillMode === 'color') {
            previewFillHtml = `<div style="position:absolute; inset:0; background:${ledCfg.fillColor || '#000'}; z-index:0;"></div>`;
          } else if (previewFillMode === 'blur') {
            const pBlur = Math.max(0, Math.min(60, ledCfg.blurAmount ?? 28));
            const src = (currentItem.type === 'presentation')
              ? ((currentItem.slides && currentItem.slides[currentItem.activeSlide || 0]) || currentItem.src)
              : currentItem.src;
            if (src && currentItem.type !== 'audio' && !currentItem.pending) {
              previewFillHtml = `
                <div style="position:absolute; inset:-8%; width:116%; height:116%; z-index:0;
                            background-image:url('${src}'); background-size:cover; background-position:center;
                            filter:blur(${pBlur}px) brightness(0.62) saturate(1.15);
                            transform:translate3d(0,0,0) scale(1.04); opacity:0.85;"></div>
              `;
            }
          }
        }
        fillHost.innerHTML = previewFillHtml;
      }
    }

    renderMediaPreview() {
      if (this._isRenderingPreview) return;
      this._isRenderingPreview = true;
      try {
      const playlist = this.appState.getState().playlist;
      const currentItem = (this.selectedItemIndex >= 0 && this.selectedItemIndex < playlist.items.length)
        ? playlist.items[this.selectedItemIndex]
        : null;

      if (!currentItem) {
        const _standaloneBg = this.appState.getState().globalBackground || {};
        const _standaloneLoopSrc = (this.previewLoopEnabled && this.previewLoopSrc)
          ? this.previewLoopSrc
          : (_standaloneBg.enabled && _standaloneBg.type === 'video' ? _standaloneBg.src : null);
        if (_standaloneLoopSrc) {
          const _sLed = this.appState.getState().ledConfig || {};
          const _sW = _sLed.width || 1536;
          const _sH = _sLed.height || 768;
          const _sOp = this.sliderLoopOpacity ? (parseInt(this.sliderLoopOpacity.value, 10) / 100) : (_standaloneBg.opacity ?? 0.35);
          const _sSig = `__standalone_loop__|${_standaloneLoopSrc}|${_sW}x${_sH}`;
          if (this._lastPreviewDomSig === _sSig && this.mediaPreviewArea.querySelector('.staging-monitor-wrapper')) {
            this._applyPreviewLoopOpacity(_sOp);
            return;
          }
          this._lastPreviewDomSig = _sSig;
          this.mediaPreviewArea.innerHTML = `
            <div class="staging-monitor-wrapper" style="aspect-ratio:${_sW} / ${_sH};">
              <div class="staging-monitor-content" style="position:relative; width:100%; height:100%; overflow:hidden; background:#000;">
                <div data-loop-overlay style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:5; opacity:${_sOp}; filter:${this.previewLoopGrayscale ? 'grayscale(100%) contrast(106%)' : 'none'}; transition:filter 250ms ease, transform 250ms ease; transform:scale(${this.previewLoopFlipX ? -1 : 1}, ${this.previewLoopFlipY ? -1 : 1}) translate3d(0,0,0);">
                  <video src="${_standaloneLoopSrc}" data-pv-loop-vid autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
                </div>
              </div>
            </div>
          `;
          this.mediaPreviewArea.querySelectorAll('video[data-pv-loop-vid]').forEach((lv) => {
            const ctrl = attachSeamlessLoopCrossfade(lv, 800);
            if (ctrl) ctrl.play();
          });
          return;
        }
        this._lastPreviewDomSig = null;
        this.mediaPreviewArea.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-dim); gap:8px;">
            <span style="font-size:36px; opacity:0.4;">👁️</span>
            <span>Ön görünüm için sol taraftaki akış listesinden bir medya seçin</span>
          </div>
        `;
        return;
      }

      const isLive = (this.selectedItemIndex === playlist.currentIndex && this.appState.getState().playbackState === 'playing');

      // Dosya hâlâ diske yazılıyor: kaynağı boş medya öğesi gösterme
      if (currentItem.pending) {
        this._lastPreviewDomSig = null;
        this.mediaPreviewArea.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-dim); gap:8px;">
            <span style="font-size:36px; opacity:0.4;">⏳</span>
            <span><strong>${currentItem.title}</strong> içe aktarılıyor…</span>
          </div>
        `;
        return;
      }

      // Kalıcı DOM kontrolü: yalnızca medya kimliği veya görsel ayarları değiştiğinde DOM'u baştan kur!
      const _pvSettings = this.appState.getState().ceremonySettings || {};
      const _pvBg = this.appState.getState().globalBackground || {};
      const _pvLed = this.appState.getState().ledConfig || {};
      const _pvOpSlider = this.sliderLoopOpacity;
      const _itemLoop = (currentItem.loopTrack && currentItem.loopTrack.src) ? currentItem.loopTrack : null;
      const _hasManualPreviewLoop = Boolean(this.previewLoopSrc);
      const _pvOpacity = (!_hasManualPreviewLoop && _itemLoop && _itemLoop.opacity !== undefined)
        ? Number(_itemLoop.opacity)
        : (_pvOpSlider ? (parseInt(_pvOpSlider.value, 10) / 100) : 0.35);
      const _pvLoopSrc = _hasManualPreviewLoop
        ? (this.previewLoopEnabled ? this.previewLoopSrc : null)
        : (_itemLoop ? (_itemLoop.enabled !== false ? _itemLoop.src : null) : null);
      const _pvShowLoop = _hasManualPreviewLoop
        ? Boolean(this.previewLoopEnabled && this.previewLoopSrc)
        : Boolean(_itemLoop && _itemLoop.enabled !== false && _itemLoop.src);
      const _pvVisualEnabled = currentItem.visualEnabled !== false;

      const pvSig = [
        currentItem.id,
        currentItem.type,
        currentItem.src,
        currentItem.activeSlide || 0,
        (currentItem.slides && currentItem.slides.length) || 0,
        _pvSettings.audioScreenMode || 'audio_poster',
        _pvSettings.defaultPosterSrc || _pvSettings.posterSrc || '',
        _pvSettings.audioPosterSrc || '',
        _pvSettings.audioLoopSrc || '',
        _pvShowLoop ? _pvLoopSrc : '',
        _pvVisualEnabled ? '1' : '0'
      ].join('|');

      if (this._lastPreviewDomSig === pvSig && this.mediaPreviewArea.querySelector('.staging-monitor-wrapper')) {
        this._applyPreviewLoopOpacity(_pvOpacity);
        this._applyPreviewLedConfigInPlace(_pvLed, currentItem);
        if (this._lastPreviewBoundIsLive !== isLive) {
          this._lastPreviewBoundIsLive = isLive;
          if (currentItem.type === 'video') {
            this._detachPreviewAudioPlayer();
            this._bindPreviewVideoPlayer(currentItem);
          } else if (currentItem.type === 'audio') {
            this._bindPreviewAudioPlayer(currentItem);
          }
        }
        return;
      }
      this._lastPreviewDomSig = pvSig;
      this._lastPreviewBoundIsLive = isLive;

      if (this._previewItemId !== currentItem.id) {
        this._previewItemId = currentItem.id;
        this.forcePreview = false;
      }
// Ön izleme her zaman canlı ve senkron gösterilir

      let previewContentHtml = '';
      if (currentItem.type === 'video') {
        previewContentHtml = `
          <video id="pv-video-el" src="${currentItem.src}" playsinline style="width:100%; height:100%; object-fit:contain;"></video>
        `;
      } else if (currentItem.type === 'presentation') {
        const slides = (currentItem.slides && currentItem.slides.length > 0)
          ? currentItem.slides
          : [currentItem.src];
        const slideIdx = Math.max(0, Math.min(slides.length - 1, currentItem.activeSlide || 0));
        const activeSlideUrl = slides[slideIdx];
        const total = slides.length;

        previewContentHtml = `
          <img src="${activeSlideUrl}" alt="${currentItem.title}" style="width:100%; height:100%; object-fit:contain;">

          ${total > 1 ? `
          <button type="button" data-slide-nav="-1" title="Önceki slayt (←)"
            style="position:absolute; left:10px; top:50%; transform:translateY(-50%); z-index:12;
                   width:38px; height:38px; border-radius:50%; cursor:pointer;
                   background:rgba(10,14,24,0.86); border:1px solid #38bdf8; color:#38bdf8;
                   font-size:18px; font-weight:800; display:flex; align-items:center; justify-content:center;
                   backdrop-filter:blur(6px);">‹</button>
          <button type="button" data-slide-nav="1" title="Sonraki slayt (→)"
            style="position:absolute; right:10px; top:50%; transform:translateY(-50%); z-index:12;
                   width:38px; height:38px; border-radius:50%; cursor:pointer;
                   background:rgba(10,14,24,0.86); border:1px solid #38bdf8; color:#38bdf8;
                   font-size:18px; font-weight:800; display:flex; align-items:center; justify-content:center;
                   backdrop-filter:blur(6px);">›</button>
          ` : ''}

          <div style="position:absolute; bottom:12px; right:12px; z-index:12; background:rgba(0,0,0,0.82);
                      color:#fff; padding:5px 12px; border-radius:12px; font-size:11px; display:flex; align-items:center; gap:8px;">
            <span>Slayt <strong>${slideIdx + 1}</strong> / ${total}</span>
            ${total > 1 ? `
            <span style="display:flex; gap:4px;">
              <button type="button" data-slide-nav="-1" style="background:#1e3a5f; border:1px solid #38bdf8; color:#38bdf8; border-radius:8px; padding:1px 7px; font-size:11px; cursor:pointer;">‹</button>
              <button type="button" data-slide-nav="1" style="background:#1e3a5f; border:1px solid #38bdf8; color:#38bdf8; border-radius:8px; padding:1px 7px; font-size:11px; cursor:pointer;">›</button>
            </span>` : ''}
          </div>

          <div style="position:absolute; top:10px; left:10px; z-index:12; background:rgba(10,14,24,0.86);
                      border:1px solid #4a5568; color:#a0aec0; padding:3px 10px; border-radius:12px; font-size:10px;">
            📊 Sunum
          </div>
        `;
      } else if (currentItem.type === 'audio') {
        // Ses dosyalarında asla dosya adı veya yabancı linkler ekrana yansıtılmaz!
        const settings = this.appState.getState().ceremonySettings || {
          defaultPosterSrc: '',
          audioPosterSrc: '',
          audioScreenMode: 'audio_poster'
        };
        const mode = settings.audioScreenMode || 'audio_poster';
        const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
        const visualSrc = (mode === 'default_poster') ? defPoster : (settings.audioPosterSrc || defPoster);

        let visualHtml = '';
        if (mode === 'loop') {
          const currentBg = this.appState.getState().globalBackground;
          // Ayarlardan seçilen loop varsa o, yoksa arka plan loop'u.
          const loopSrcToPreview = settings.audioLoopSrc
            || this.previewLoopSrc
            || currentBg.src
            || MD.loopSrc('loop/16871-276488572_medium.mp4');
          const bgOpacity = (currentBg.opacity !== undefined) ? currentBg.opacity : 1.0;
          visualHtml = `
            <div style="position:relative; width:100%; height:100%; opacity:${bgOpacity};">
              <video src="${loopSrcToPreview}" data-pv-loop-vid autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
            </div>
          `;
        } else if (mode === 'blackout') {
          visualHtml = `<div style="background:#000000; width:100%; height:100%;"></div>`;
        } else if (!visualSrc) {
          // Afiş seçilmemişse kırık görsel yerine nötr zemin
          visualHtml = `<div class="md-neutral-stage" style="width:100%; height:100%;"></div>`;
        } else {
          visualHtml = `
            <img src="${visualSrc}" alt="" style="width:100%; height:100%; object-fit:contain;">
          `;
        }

        // Ön görünümde mp3/video ses görseli (kontroller sahnenin altına yerleşir)
        previewContentHtml = `
          <div class="preview-audio-shell">
            ${visualHtml}
          </div>
        `;
      } else {
        previewContentHtml = `
          <img src="${currentItem.src}" alt="${currentItem.title}" style="width:100%; height:100%; object-fit:contain;">
        `;
      }

      const currentBg = this.appState.getState().globalBackground;
      const curOpacity = _pvOpacity;
      const loopSrcToPreview = _pvLoopSrc;
      const shouldShowPreviewLoop = _pvShowLoop;

      let loopOverlayHtml = '';
      const isAudioFullLoop = (currentItem.type === 'audio' && (_pvSettings.audioScreenMode === 'loop'));
      if (!isAudioFullLoop && shouldShowPreviewLoop && (curOpacity > 0)) {
        loopOverlayHtml = `
          <div data-loop-overlay style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:5; opacity:${curOpacity}; filter:${this.previewLoopGrayscale ? 'grayscale(100%) contrast(106%)' : 'none'}; transition:filter 250ms ease, transform 250ms ease; transform:scale(${this.previewLoopFlipX ? -1 : 1}, ${this.previewLoopFlipY ? -1 : 1}) translate3d(0,0,0);">
            <video src="${loopSrcToPreview}" data-pv-loop-vid autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
          </div>
        `;
      }

      // [8] Kenar boşluğu dolgusu — LED'de ne görünecekse ön izlemede de aynısı
      const ledCfg = this.appState.getState().ledConfig || {};
      const ledW = ledCfg.width || 1536;
      const ledH = ledCfg.height || 768;
      const previewScale = ledCfg.scaleMode || 'contain';
      const previewFillMode = ledCfg.fillMode || 'blank';

      let previewFillHtml = '';
      if (previewScale === 'contain' || previewScale === 'original') {
        if (previewFillMode === 'color') {
          previewFillHtml = `<div style="position:absolute; inset:0; background:${ledCfg.fillColor || '#000'}; z-index:0;"></div>`;
        } else if (previewFillMode === 'blur') {
          const pBlur = Math.max(0, Math.min(60, ledCfg.blurAmount ?? 28));
          const src = (currentItem.type === 'presentation')
            ? ((currentItem.slides && currentItem.slides[currentItem.activeSlide || 0]) || currentItem.src)
            : currentItem.src;
          if (src && currentItem.type !== 'audio' && !currentItem.pending) {
            previewFillHtml = `
              <div style="position:absolute; inset:-8%; width:116%; height:116%; z-index:0;
                          background-image:url('${src}'); background-size:cover; background-position:center;
                          filter:blur(${pBlur}px) brightness(0.62) saturate(1.15);
                          transform:translate3d(0,0,0) scale(1.04); opacity:0.85;"></div>
            `;
          }
        }
      }

      // İçerik ölçeği: seçili moda göre object-fit
      const fitMap = { contain: 'contain', cover: 'cover', fill: 'fill', original: 'fill' };
      const previewFit = fitMap[previewScale] || 'contain';
      previewContentHtml = previewContentHtml.split('object-fit:contain').join(`object-fit:${previewFit}`);
      previewContentHtml = previewContentHtml.split('object-fit:cover').join(`object-fit:${previewFit}`);

      let bottomControlsHtml = '';
      if (currentItem.type === 'video') {
        bottomControlsHtml = `
          <div class="preview-media-bottom-controls" id="pv-media-controls">
            <button type="button" class="preview-media-btn" id="pv-video-toggle" title="Oynat / Duraklat">▶</button>
            <div class="preview-media-track">
              <span class="preview-media-time is-current" id="pv-video-cur">00:00</span>
              <input type="range" class="preview-media-seek" id="pv-video-seek" min="0" max="100" step="0.1" value="0" title="İleri / geri sar">
              <span class="preview-media-time" id="pv-video-dur">00:00</span>
            </div>
            <button type="button" class="preview-media-btn preview-media-mute-btn" id="pv-video-mute" title="Sesi Aç / Kapat">🔇</button>
            <span class="preview-media-badge">🎥 VİDEO</span>
          </div>
        `;
      } else if (currentItem.type === 'audio') {
        bottomControlsHtml = `
          <div class="preview-media-bottom-controls" id="pv-media-controls">
            <button type="button" class="preview-media-btn" id="pv-audio-toggle" title="Oynat / Duraklat">▶</button>
            <div class="preview-media-track">
              <span class="preview-media-time is-current" id="pv-audio-cur">00:00</span>
              <input type="range" class="preview-media-seek" id="pv-audio-seek" min="0" max="100" step="0.1" value="0" title="Ses içinde ileri / geri sar" disabled>
              <span class="preview-media-time" id="pv-audio-dur">00:00</span>
            </div>
            <button type="button" class="preview-media-btn preview-media-mute-btn" id="pv-audio-mute" title="Sesi Aç / Kapat">🔇</button>
            <span class="preview-media-badge" id="pv-audio-label">🎵 SES</span>
          </div>
        `;
      }

      this.mediaPreviewArea.innerHTML = `
        <!-- Büyük Ön Görünüm Ekranı — oran [8] EKRAN ayarından gelir -->
        <div class="staging-monitor-wrapper" style="aspect-ratio:${ledW} / ${ledH};">
          <div class="staging-monitor-content" style="position:relative; width:100%; height:100%; overflow:hidden;">
            <div class="pv-fill-host" style="position:absolute; inset:0; z-index:0; pointer-events:none; opacity:${_pvVisualEnabled ? 1 : 0};">${previewFillHtml}</div>
            <div class="pv-main-host" style="position:relative; width:100%; height:100%; z-index:1; opacity:${_pvVisualEnabled ? 1 : 0};">
              ${previewContentHtml}
            </div>
            ${loopOverlayHtml}
          </div>
        </div>
        ${bottomControlsHtml}
      `;

      // Slayt gezinme düğmeleri (yalnızca sunumlarda)
      if (currentItem.type === 'presentation' && Array.isArray(currentItem.slides) && currentItem.slides.length > 1) {
        this.mediaPreviewArea.querySelectorAll('[data-slide-nav]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dir = parseInt(btn.dataset.slideNav, 10) || 0;
            this.stepSlide(dir);
          });
        });
      }

      if (ledCfg.scaleMode === 'original') {
        this._syncOriginalMediaSize(currentItem, false);
      }

      // Ön görünümdeki loop videolar için de 800 ms Crossfade döngüsü bağla
      this.mediaPreviewArea.querySelectorAll('video[data-pv-loop-vid]').forEach((lv) => {
        const ctrl = attachSeamlessLoopCrossfade(lv, 800);
        if (ctrl) ctrl.play();
      });

      if (currentItem.type === 'video') {
        this._detachPreviewAudioPlayer();
        this._bindPreviewVideoPlayer(currentItem);
      } else if (currentItem.type === 'audio') {
        this._bindPreviewAudioPlayer(currentItem);
      } else {
        this._detachPreviewAudioPlayer();
      }
      } finally {
        this._isRenderingPreview = false;
      }
    }

    /**
     * Ön görünümdeki ses parçası için oynat/duraklat şeridi.
     *
     * Yayında olan ses parçası için kontrol CANLI yayını yönetir
     * (appState.pause/resume). Yayında değilse yerel bir <audio> ile
     * dinleme yapılır, böylece reji yayına almadan parçayı kontrol edebilir.
     */
    _bindPreviewVideoPlayer(item) {
      const vEl = document.getElementById('pv-video-el');
      const btn = document.getElementById('pv-video-toggle');
      const seek = document.getElementById('pv-video-seek');
      const cur = document.getElementById('pv-video-cur');
      const dur = document.getElementById('pv-video-dur');
      const muteBtn = document.getElementById('pv-video-mute');
      if (!vEl || !btn) return;

      if (this._previewVideoLiveSync) {
        clearInterval(this._previewVideoLiveSync);
        this._previewVideoLiveSync = null;
      }

      // Ön izlemede varsayılan olarak sessiz (muted) açılır
      vEl.muted = true;

      if (muteBtn) {
        muteBtn.textContent = vEl.muted ? '🔇' : '🔊';
        muteBtn.title = vEl.muted ? 'Sesi Aç' : 'Sesi Kapat';
        muteBtn.onclick = () => {
          vEl.muted = !vEl.muted;
          muteBtn.textContent = vEl.muted ? '🔇' : '🔊';
          muteBtn.title = vEl.muted ? 'Sesi Aç' : 'Sesi Kapat';
          if (!vEl.muted && vEl.volume === 0) vEl.volume = 1;
        };
      }

      const fmt = (s) => {
        if (!isFinite(s) || s < 0) return '00:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      };

      const updateDur = () => {
        if (vEl.duration && isFinite(vEl.duration)) {
          if (dur) dur.textContent = fmt(vEl.duration);
        }
      };
      vEl.addEventListener('loadedmetadata', updateDur);
      vEl.addEventListener('durationchange', updateDur);
      if (vEl.duration) updateDur();

      vEl.addEventListener('timeupdate', () => {
        if (cur && !seek?._dragging) cur.textContent = fmt(vEl.currentTime);
        if (seek && !seek._dragging && vEl.duration > 0) {
          seek.value = String((vEl.currentTime / vEl.duration) * 100);
        }
      });

      btn.onclick = () => {
        if (vEl.paused) {
          vEl.play().then(() => { btn.textContent = '⏸'; }).catch(() => {});
        } else {
          vEl.pause();
          btn.textContent = '▶';
        }
      };

      vEl.addEventListener('play', () => { btn.textContent = '⏸'; });
      vEl.addEventListener('pause', () => { btn.textContent = '▶'; });
      vEl.addEventListener('ended', () => { btn.textContent = '▶'; if (seek) seek.value = '0'; });

      if (seek) {
        seek.addEventListener('pointerdown', () => { seek._dragging = true; });
        seek.addEventListener('input', () => {
          if (vEl.duration > 0) {
            const t = (Number(seek.value) / 100) * vEl.duration;
            if (cur) cur.textContent = fmt(t);
            vEl.currentTime = t;
          }
        });
        const finishSeek = () => {
          if (!seek._dragging) return;
          seek._dragging = false;
          if (vEl.duration > 0) {
            vEl.currentTime = (Number(seek.value) / 100) * vEl.duration;
          }
        };
        seek.addEventListener('change', finishSeek);
        window.addEventListener('pointerup', finishSeek);
      }
    }

    _bindPreviewAudioPlayer(item) {
      const btn = document.getElementById('pv-audio-toggle');
      const seek = document.getElementById('pv-audio-seek');
      const cur = document.getElementById('pv-audio-cur');
      const dur = document.getElementById('pv-audio-dur');
      const label = document.getElementById('pv-audio-label');
      if (!btn) return;

      if (this._previewAudioLiveSync) {
        clearInterval(this._previewAudioLiveSync);
        this._previewAudioLiveSync = null;
      }

      if (label) label.textContent = '🎵 SES';

      const fmt = (secs) => {
        const s = Number(secs);
        if (!isFinite(s) || s < 0) return '00:00';
        const m = Math.floor(s / 60);
        const r = Math.floor(s % 60);
        return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
      };

      if (this._previewAudioSrc !== item.src) {
        this._detachPreviewAudioPlayer();
        this._previewAudioSrc = item.src;
        this._previewAudioEl = new Audio(item.src);
        this._previewAudioEl.preload = 'metadata';
        this._previewAudioEl.loop = false;
      }
      const el = this._previewAudioEl;
      if (!el) return;

      // Ön izlemede ses dosyası varsayılan olarak sessiz açılır
      const applyVolume = () => {
        const a = this.appState.getState().audio || {};
        el.volume = Math.max(0, Math.min(1, (a.masterVolume ?? 1) * (a.mediaVolume ?? 1)));
      };
      applyVolume();
      el.muted = true;
      const muteBtn = document.getElementById('pv-audio-mute');
      if (muteBtn) {
        muteBtn.textContent = el.muted ? '🔇' : '🔊';
        muteBtn.title = el.muted ? 'Sesi Aç' : 'Sesi Kapat';
        muteBtn.onclick = () => {
          el.muted = !el.muted;
          muteBtn.textContent = el.muted ? '🔇' : '🔊';
          muteBtn.title = el.muted ? 'Sesi Aç' : 'Sesi Kapat';
          if (!el.muted && el.volume === 0) el.volume = 1;
        };
      }

      const sync = () => {
        const playing = !el.paused && !el.ended;
        btn.textContent = playing ? '⏸' : '▶';
        btn.title = playing ? 'Duraklat' : 'Oynat';
        if (cur && !seek?._dragging) cur.textContent = fmt(el.currentTime);
        if (dur) dur.textContent = fmt(el.duration);
        if (seek && !seek._dragging) {
          const total = isFinite(el.duration) ? el.duration : 0;
          seek.disabled = !(total > 0);
          if (total > 0 && document.activeElement !== seek) {
            seek.value = String((el.currentTime / total) * 100);
          }
        }
      };
      sync();

      // Metadata geç geldiyse süre/seek bir kez daha eşitlenir.
      const resync = () => sync();
      el.addEventListener('loadedmetadata', resync);
      el.addEventListener('durationchange', resync);
      el.addEventListener('seeked', resync);
      el.addEventListener('timeupdate', resync);
      el.addEventListener('play', resync);
      el.addEventListener('pause', resync);
      el.addEventListener('ended', resync);

      btn.onclick = () => {
        if (el.paused) {
          applyVolume();
          el.play().then(sync).catch(() => this._toast?.('Ses açılamadı', 'warn'));
        } else {
          el.pause();
          sync();
        }
      };

      if (seek) {
        seek.addEventListener('pointerdown', () => { seek._dragging = true; });
        const doSeek = () => {
          const total = isFinite(el.duration) ? el.duration : 0;
          if (total <= 0) {
            el.addEventListener('loadedmetadata', () => {
              const t2 = isFinite(el.duration) ? el.duration : 0;
              if (t2 > 0) el.currentTime = (Number(seek.value) / 100) * t2;
            }, { once: true });
            return;
          }
          const t = (Number(seek.value) / 100) * total;
          if (cur) cur.textContent = fmt(t);
          el.currentTime = t;
          sync();
        };
        seek.oninput = doSeek;
        const finishAudioSeek = () => {
          if (!seek._dragging) return;
          seek._dragging = false;
          doSeek();
        };
        seek.onchange = finishAudioSeek;
        window.addEventListener('pointerup', finishAudioSeek);
      }
    }

    _detachPreviewAudioPlayer() {
      if (this._previewVideoLiveSync) {
        clearInterval(this._previewVideoLiveSync);
        this._previewVideoLiveSync = null;
      }
      if (this._previewAudioLiveSync) {
        clearInterval(this._previewAudioLiveSync);
        this._previewAudioLiveSync = null;
      }
      if (this._previewAudioEl) {
        try {
          this._previewAudioEl.pause();
          this._previewAudioEl.removeAttribute('src');
          this._previewAudioEl.load();
        } catch (e) {}
        this._previewAudioEl = null;
      }
      this._previewAudioSrc = null;
    }

    /** Seçili medya öğesi (akış listesinde tıklanan). */
    _selectedItem() {
      const playlist = this.appState.getState().playlist;
      return (this.selectedItemIndex >= 0 && this.selectedItemIndex < playlist.items.length)
        ? playlist.items[this.selectedItemIndex]
        : null;
    }

    /**
     * Sunumda bir slayt ileri/geri gider.
     * Ön görünümde gösterir; medya canlıdaysa LED ekranı da güncellenir.
     */

    stepSlide(delta) {
      const playlist = this.appState.getState().playlist;
      const item = (this.selectedItemIndex >= 0 && this.selectedItemIndex < playlist.items.length)
        ? playlist.items[this.selectedItemIndex]
        : null;
      if (!item || item.type !== 'presentation') return;

      const total = (item.slides && item.slides.length) || 1;
      if (total <= 1) return;

      const next = Math.max(0, Math.min(total - 1, (item.activeSlide || 0) + delta));
      if (next === (item.activeSlide || 0)) return;
      item.activeSlide = next;

      const state = this.appState.getState();
      const isLiveItem = state.liveItem && state.liveItem.id === item.id;
      if (isLiveItem) {
        // Canlı yayındaki sunum: LED ekranı da aynı slayta geçsin
        this.appState.setState({
          liveItem: { ...state.liveItem, activeSlide: next, src: item.slides[next] }
        });
      }
      this.renderMediaPreview();
      this.updateUI(this.appState.getState());
    }

    updateUI(state) {
      const isPlaying = (state.playbackState === 'playing');
      const liveIndex = (state.playbackState !== 'stopped' && state.liveItem) ? state.playlist.currentIndex : -1;
      const isSelectedDifferentFromLive = (this.selectedItemIndex >= 0 && this.selectedItemIndex !== liveIndex);
      const liveItem = state.liveItem;
      const isMediaWithTimeline = liveItem && (liveItem.type === 'video' || liveItem.type === 'audio');

      if (this.btnPlayPause) {
        let nextBtnMode = 'play';
        let nextBtnHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>OYNAT</span>`;
        let nextBtnPlaying = false;
        let nextBtnTitle = 'Medyayı canlı yayında oynat';

        if (isSelectedDifferentFromLive) {
          // Ön görünümde yeni bir medya seçildi -> Doğrudan canlıya aktarmaya hazır
          nextBtnMode = 'publish';
          nextBtnHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>YAYINA AL</span>`;
          nextBtnPlaying = false;
          nextBtnTitle = 'Ön görünümdeki seçili medyayı doğrudan canlı LED ekrana aktar';
        } else if (isPlaying) {
          if (isMediaWithTimeline) {
            nextBtnMode = 'pause';
            nextBtnHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>DURAKLAT</span>`;
            nextBtnPlaying = true;
            nextBtnTitle = 'Canlıdaki videoyu / sesi duraklat';
          } else {
            // Canlıda Resim veya Sunu
            nextBtnMode = 'live_static';
            nextBtnHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="7"></circle></svg><span>YAYINDA</span>`;
            nextBtnPlaying = true;
            nextBtnTitle = 'Görsel canlı yayında gösteriliyor';
          }
        } else if (state.playbackState === 'paused') {
          nextBtnMode = 'resume';
          nextBtnHtml = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>DEVAM ET</span>`;
          nextBtnPlaying = false;
          nextBtnTitle = 'Duraklatılan videoyu / sesi devam ettir';
        }

        if (this.btnPlayPause.dataset.btnMode !== nextBtnMode) {
          this.btnPlayPause.dataset.btnMode = nextBtnMode;
          this.btnPlayPause.innerHTML = nextBtnHtml;
          this.btnPlayPause.classList.toggle('is-playing', nextBtnPlaying);
          this.btnPlayPause.title = nextBtnTitle;
        }
      }

      if (state.duration > 0) {
        const remSec = Math.max(0, Math.ceil(state.remaining / 1000));
        const totSec = Math.max(1, Math.ceil(state.duration / 1000));
        const curSec = Math.max(0, Math.min(totSec, totSec - remSec));
        const strCur = this._fmt(curSec);
        const strTot = this._fmt(totSec);

        if (this.playbackTimer) this.playbackTimer.textContent = `${strCur} / ${strTot}`;
        if (this.scrubberCurTime && !this.isScrubbing) this.scrubberCurTime.textContent = strCur;
        if (this.scrubberTotalTime) this.scrubberTotalTime.textContent = strTot;

        const pct = Math.max(0, Math.min(100, (curSec / totSec) * 100));
        if (this.playbackProgressBar) this.playbackProgressBar.style.width = `${pct}%`;
        if (!this.isScrubbing) {
          if (this.scrubberSlider) this.scrubberSlider.value = pct;
          if (this.scrubberFill) this.scrubberFill.style.width = `${pct}%`;
        }
      } else if (isPlaying && state.liveItem) {
        // Canlıda Resim veya Sunu (Süresiz / Manuel Mod)
        if (state.liveItem.type === 'presentation') {
          const curSlide = (state.liveItem.activeSlide || 0) + 1;
          const totSlides = (state.liveItem.slides && state.liveItem.slides.length) || 1;
          const pct = Math.round((curSlide / totSlides) * 100);
          const startedAt = state.playRequestId || 0;
          const elapsedSec = startedAt > 0 ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
          const strElapsed = this._fmt(elapsedSec);

          if (this.playbackTimer) this.playbackTimer.textContent = `📊 Slayt ${curSlide} / ${totSlides} (${strElapsed})`;
          if (this.scrubberCurTime && !this.isScrubbing) this.scrubberCurTime.textContent = `Slayt ${curSlide}`;
          if (this.scrubberTotalTime) {
            this.scrubberTotalTime.textContent = strElapsed;
            this.scrubberTotalTime.title = `Geçen Süre (Toplam ${totSlides} Slayt)`;
          }
          if (this.playbackProgressBar) this.playbackProgressBar.style.width = `${pct}%`;
          if (!this.isScrubbing) {
            if (this.scrubberSlider) this.scrubberSlider.value = pct;
            if (this.scrubberFill) this.scrubberFill.style.width = `${pct}%`;
          }
        } else {
          // Görsel (Resim): Süre sınırı yok, geçen süreyi saniye saniye göster
          const startedAt = state.playRequestId || 0;
          const elapsedSec = startedAt > 0 ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
          const strElapsed = this._fmt(elapsedSec);

          if (this.playbackTimer) this.playbackTimer.textContent = `🖼️ CANLI (${strElapsed})`;
          if (this.scrubberCurTime && !this.isScrubbing) {
            this.scrubberCurTime.textContent = 'CANLI';
            this.scrubberCurTime.title = 'Görsel Canlı Yayında';
          }
          if (this.scrubberTotalTime) {
            this.scrubberTotalTime.textContent = strElapsed;
            this.scrubberTotalTime.title = 'Ekranda Geçen Süre';
          }
          if (this.playbackProgressBar) this.playbackProgressBar.style.width = '100%';
          if (!this.isScrubbing) {
            if (this.scrubberSlider) this.scrubberSlider.value = 100;
            if (this.scrubberFill) this.scrubberFill.style.width = '100%';
          }
        }
      } else {
        if (this.playbackTimer) this.playbackTimer.textContent = '00:00 / 00:00';
        if (this.scrubberCurTime && !this.isScrubbing) this.scrubberCurTime.textContent = '00:00';
        if (this.scrubberTotalTime) this.scrubberTotalTime.textContent = '00:00';
        if (!this.isScrubbing) {
          if (this.playbackProgressBar) this.playbackProgressBar.style.width = '0%';
          if (this.scrubberSlider) this.scrubberSlider.value = 0;
          if (this.scrubberFill) this.scrubberFill.style.width = '0%';
        }
      }

      if (this.btnPanic) this.btnPanic.classList.toggle('active', state.blackout);

      // [3] Başlıktaki YAYINLA butonu ve mod rozeti: seçili medya canlıdaysa "YAYINDA" göster
      const selectedIsLive = isPlaying && this.selectedItemIndex === liveIndex && Boolean(liveItem);
      if (this._lastSelectedIsLive !== selectedIsLive) {
        this._lastSelectedIsLive = selectedIsLive;
      }
      if (this.btnPublishPreview) {
        this.btnPublishPreview.style.opacity = selectedIsLive ? '0.55' : '1';
        this.btnPublishPreview.style.cursor = selectedIsLive ? 'default' : 'pointer';
        const label = this.btnPublishPreview.querySelector('span');
        if (label) label.textContent = selectedIsLive ? 'YAYINDA' : 'YAYINLA';
      }
      if (this.previewModeBadge) {
        if (selectedIsLive) {
          this.previewModeBadge.textContent = '● CANLIDA';
          this.previewModeBadge.classList.add('is-live');
          this.previewModeBadge.classList.remove('is-staged');
          this.previewModeBadge.style.background = '';
          this.previewModeBadge.style.color = '';
        } else {
          this.previewModeBadge.textContent = 'ÖN HAZIRLIK';
          this.previewModeBadge.classList.add('is-staged');
          this.previewModeBadge.classList.remove('is-live');
          this.previewModeBadge.style.background = '';
          this.previewModeBadge.style.color = '';
        }
      }

      // PDF düğmesi yalnızca sunumlarda görünür
      if (this.btnSavePdf) {
        const showPdf = Boolean(this._selectedItem() && this._selectedItem().type === 'presentation');
        this.btnSavePdf.style.display = showPdf ? 'flex' : 'none';
      }

      // DOM'u silip baştan oluşturma; sadece aktif satır stilini güncelle (tıklamayı engellememek için)
      this._updatePlaylistRowStyles();
      this._updateLoopButtonUi();
      this._updateBeatBgUi();
      this._updateMuteUi();
      this._syncMediaAudioSelect();
      this._syncMediaLoopSelect();
      this._updateScreenUi();
      this._updateAudioSettingsUi();
      this._updatePreviewMixBar();
      this._updateLiveMixBar(state);
    }

    /**
     * [4] Canlı Önizleme altındaki yatay Mix Çubuğu:
     * Canlı yayında o anda mixlenen tüm öğeleri (Medya, Loop Video, Beat/Fon Müziği, Logo, Karartma)
     * tek satırda şık çipler olarak gösterir.
     * Her bir çipin yanındaki 'X' butonuna tıklandığında yalnızca o katman yayından kaldırılır.
     */
    /**
     * [3] Ön Görünüm (Ön Hazırlık) Mix Katmanları Çubuğu:
     * Seçili medyanın görselini, bağlı loop videosunu, bağlı müziğini ve logoyu
     * yayına almadan önce listeler ve göz ikonuyla aktif/pasif yapmayı sağlar.
     */
    _updatePreviewMixBar() {
      const container = document.getElementById('preview-mix-strip');
      if (!container) return;

      const item = this._selectedItem();
      const countBadge = document.getElementById('preview-mix-count');
      if (!item && !this.previewLoopSrc) {
        this._lastPreviewMixSig = '';
        if (countBadge) countBadge.textContent = '0 Aktif';
        container.innerHTML = '<span class="live-mix-empty">Ön görünüm için bir medya seçin</span>';
        return;
      }

      const state = this.appState.getState();
      const items = [];

      // 1. Ön Görünüm Ana Medya / Görsel Katmanı
      if (item) {
        const isVisualActive = item.visualEnabled !== false;
        const icon = item.type === 'video' ? '🎥' : (item.type === 'presentation' ? '📊' : (item.type === 'audio' ? '🎵' : '🖼️'));
        const typeLabel = item.type === 'video' ? 'Video' : (item.type === 'presentation' ? 'Sunum' : (item.type === 'audio' ? 'Ses' : 'Görsel'));
        const rawTitle = item.title || item.fileName || 'Medya';
        items.push({
          id: 'pv-media',
          type: 'media',
          icon: icon,
          active: isVisualActive,
          title: `${typeLabel}: ${rawTitle}`,
          fullTitle: isVisualActive ? `${typeLabel} Açık: ${rawTitle}` : `${typeLabel} Gizli (Siyah Ekran): ${rawTitle}`,
          onToggle: () => {
            item.visualEnabled = !isVisualActive;
            this.renderMediaPreview();
            this._updatePreviewMixBar();
            this.saveCurrentPlaylist();
            this._toast?.(item.visualEnabled ? `${typeLabel} ön görünümü açıldı` : `${typeLabel} gizlendi (Siyah Ekran)`, item.visualEnabled ? 'ok' : 'info');
          },
          onRemove: () => {
            this.selectedItemIndex = -1;
            this.previewLoopSrc = null;
            this.previewLoopEnabled = false;
            this.renderMediaPreview();
            this._updatePreviewMixBar();
            this._updatePlaylistRowStyles?.();
            this._toast?.('Ön görünüm temizlendi', 'info');
          }
        });
      }

      // 2. Medyaya Bağlı veya Ön Görünümde Seçili Loop Video
      const hasManualLoop = Boolean(this.previewLoopSrc);
      const itemLoop = (!hasManualLoop && item && item.loopTrack && item.loopTrack.src) ? item.loopTrack : null;
      const pvLoopSrc = hasManualLoop ? this.previewLoopSrc : (itemLoop ? itemLoop.src : null);
      if (pvLoopSrc) {
        const isLoopActive = hasManualLoop ? Boolean(this.previewLoopEnabled) : (itemLoop.enabled !== false);
        let loopName = itemLoop?.name || '';
        if (!loopName) {
          const foundLv = (this.loopVideos || []).find(lv => lv.src === pvLoopSrc);
          if (foundLv) loopName = foundLv.label;
          else {
            const parts = pvLoopSrc.split(/[\\/]/);
            loopName = (parts[parts.length - 1] || 'Loop Video').replace(/\.[^/.]+$/, '');
          }
        }
        const loopOpPct = Math.round(((itemLoop && itemLoop.opacity !== undefined)
          ? Number(itemLoop.opacity)
          : (this.sliderLoopOpacity ? parseInt(this.sliderLoopOpacity.value, 10) / 100 : 0.35)) * 100);
        items.push({
          id: 'pv-loop',
          type: 'loop',
          icon: '🔄',
          active: isLoopActive,
          title: `Loop: ${loopName} (%${loopOpPct})`,
          fullTitle: isLoopActive ? `Loop Video Aktif (%${loopOpPct}): ${loopName}` : `Loop Video Pasif (%${loopOpPct}): ${loopName}`,
          onToggle: () => {
            if (hasManualLoop) {
              this.previewLoopEnabled = !isLoopActive;
            } else if (itemLoop) {
              itemLoop.enabled = !isLoopActive;
              this.saveCurrentPlaylist();
            }
            this.renderPlaylistDb();
            this.renderMediaPreview();
            this._updatePreviewMixBar();
            this._toast?.(!isLoopActive ? 'Ön izleme loop aktif' : 'Ön izleme loop pasif', !isLoopActive ? 'ok' : 'info');
          },
          onRemove: () => {
            if (item) {
              delete item.loopTrack;
              delete item.loopSrc;
              this.saveCurrentPlaylist();
            }
            this.previewLoopSrc = null;
            this.previewLoopEnabled = false;
            if (this.loopThumbsContainer) {
              this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
            }
            this.renderPlaylistDb();
            this._syncMediaLoopSelect?.();
            this.renderMediaPreview();
            this._updatePreviewMixBar();
            this._toast?.('Loop video katmanı kaldırıldı', 'info');
          }
        });
      }

      // 3. Medyaya Bağlı Müzik (item.audioTrack)
      if (item && item.type !== 'audio' && item.audioTrack && item.audioTrack.src) {
        const trk = item.audioTrack;
        const isAudioActive = trk.enabled !== false;
        let trkName = trk.name || '';
        if (!trkName) {
          const parts = trk.src.split(/[\\/]/);
          trkName = (parts[parts.length - 1] || 'Medya Müziği').replace(/\.[^/.]+$/, '');
        } else {
          trkName = trkName.replace(/\.[^/.]+$/, '');
        }
        items.push({
          id: 'pv-audio',
          type: 'beat',
          icon: '🎵',
          active: isAudioActive,
          title: `Medya Ses: ${trkName}`,
          fullTitle: isAudioActive ? `Medya Müziği Aktif: ${trkName}` : `Medya Müziği Pasif: ${trkName}`,
          onToggle: () => {
            const nextEnabled = !isAudioActive;
            trk.enabled = nextEnabled;
            this._updatePreviewMixBar();
            this.saveCurrentPlaylist();
            this._toast?.(nextEnabled ? `Medya müziği aktif: ${trkName}` : `Medya müziği pasife alındı: ${trkName}`, nextEnabled ? 'ok' : 'info');
          },
          onRemove: () => {
            delete item.audioTrack;
            this.saveCurrentPlaylist();
            this._updatePreviewMixBar();
            this._syncMediaAudioSelect?.();
            this._renderBeatList?.();
            this._toast?.(`Medya müziği kaldırıldı: ${trkName}`, 'info');
          }
        });
      }

      // 4. Logo Katmanı (Yalnızca Ön Görünüm Ayarı)
      const logo = state.logoConfig;
      const configuredLogos = (logo && Array.isArray(logo.logos))
        ? logo.logos.filter(l => l && l.src && l.visible !== false)
        : [];
      if (configuredLogos.length > 0 && (!item || item.logoRemoved !== true)) {
        const isLogoActive = (item && item.logoEnabled !== undefined) ? (item.logoEnabled !== false) : (this.previewLogoEnabled !== false);
        items.push({
          id: 'pv-logo',
          type: 'logo',
          icon: '🏷️',
          active: isLogoActive,
          title: isLogoActive ? `Logo (${configuredLogos.length})` : `Logo (${configuredLogos.length}) (Pasif)`,
          fullTitle: isLogoActive ? 'Ön Görünüm Logosu Aktif' : 'Ön Görünüm Logosu Pasif',
          onToggle: () => {
            const nextActive = !isLogoActive;
            if (item) item.logoEnabled = nextActive;
            this.previewLogoEnabled = nextActive;
            this._updatePreviewMixBar();
            this._toast?.(nextActive ? 'Ön izleme logosu aktif edildi' : 'Ön izleme logosu gizlendi', 'ok');
          },
          onRemove: () => {
            if (item) item.logoRemoved = true;
            this.previewLogoEnabled = false;
            this._updatePreviewMixBar();
            this._toast?.('Logo bu medyadan kaldırıldı', 'info');
          }
        });
      }

      const pvMixSig = items.map(it => `${it.id}|${it.type}|${it.title}|${it.active ? '1' : '0'}`).join('~');
      this._previewMixItems = items;
      if (this._lastPreviewMixSig === pvMixSig) return;
      this._lastPreviewMixSig = pvMixSig;

      const activeCount = items.filter(it => it.active !== false).length;
      if (countBadge) countBadge.textContent = `${activeCount} Aktif`;

      const eyeOpenSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const eyeClosedSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

      container.innerHTML = items.map(it => `
        <div class="live-mix-chip ${it.active === false ? 'is-inactive' : ''}" data-type="${it.type}" title="${it.fullTitle}">
          <div class="live-mix-chip-left">
            <span class="chip-dot">●</span>
            <span class="chip-icon">${it.icon}</span>
            <span class="chip-title">${it.title}</span>
          </div>
          <div class="live-mix-chip-actions">
            <button type="button" class="chip-eye-btn" data-pv-id="${it.id}" title="${it.active === false ? 'Aktif Et (Göster)' : 'Deaktif Et (Gizle)'}">${it.active === false ? eyeClosedSvg : eyeOpenSvg}</button>
            <button type="button" class="chip-remove-btn" data-pv-remove-id="${it.id}" title="Katmanı Ön İzlemeden Kaldır">✕</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.chip-eye-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.pvId;
          const currentItems = this._previewMixItems || items;
          const target = currentItems.find(x => x.id === id);
          if (target && typeof target.onToggle === 'function') {
            target.onToggle();
          }
        });
      });

      container.querySelectorAll('.chip-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.pvRemoveId;
          const currentItems = this._previewMixItems || items;
          const target = currentItems.find(x => x.id === id);
          if (target && typeof target.onRemove === 'function') {
            target.onRemove();
          }
        });
      });
    }

    _updateLiveMixBar(state) {
      const container = document.getElementById('live-mix-strip');
      if (!container) return;

      const items = [];

      // 1. Canlı Medya (Video, Görsel, Sunum veya Şarkı)
      if (state.liveItem && (state.playbackState !== 'stopped' || this._mixPausedMediaItem)) {
        if (state.playbackState !== 'stopped') {
          this._mixPausedMediaItem = null;
        }
        const item = state.liveItem;
        const isMediaVisualActive = !state.liveVisualHidden && (item.visualEnabled !== false) && (state.playbackState !== 'stopped');
        const icon = item.type === 'video' ? '🎥' : (item.type === 'presentation' ? '📊' : (item.type === 'audio' ? '🎵' : '🖼️'));
        const typeLabel = item.type === 'video' ? 'Video' : (item.type === 'presentation' ? 'Sunum' : (item.type === 'audio' ? 'Ses' : 'Görsel'));
        const rawTitle = item.title || item.fileName || 'Medya';
        items.push({
          id: 'media',
          type: 'media',
          icon: icon,
          active: isMediaVisualActive,
          title: `${typeLabel}: ${rawTitle}`,
          fullTitle: isMediaVisualActive ? `${typeLabel} Yayında: ${rawTitle}` : `${typeLabel} Gizlendi (Siyah Ekran): ${rawTitle}`,
          onToggle: () => {
            const nextHidden = isMediaVisualActive;
            const nextVisualEnabled = !nextHidden;
            this.appState.setState({
              liveVisualHidden: nextHidden,
              liveItem: { ...item, visualEnabled: nextVisualEnabled }
            });
            if (item.type === 'video' || item.type === 'audio') {
              if (nextHidden && state.playbackState === 'playing') {
                this.appState.pause();
              } else if (!nextHidden && state.playbackState === 'paused') {
                this.appState.resume();
              }
            }
            this._toast?.(nextHidden ? `${typeLabel} gizlendi (Siyah Ekran)` : `${typeLabel} ekrana verildi`, nextHidden ? 'info' : 'ok');
          },
          onRemove: () => {
            this.appState.stop();
            this._toast?.(`${typeLabel} yayından kaldırıldı`, 'info');
          }
        });
      }

      // 2. Loop Video Arka Planı
      const gBg = state.globalBackground;
      const itemLoopSrc = (state.liveItem && state.liveItem.loopTrack && state.liveItem.loopTrack.src) ? state.liveItem.loopTrack.src : null;
      const loopSrcForMix = (gBg && gBg.enabled && gBg.src) ? gBg.src : itemLoopSrc;
      if (loopSrcForMix) {
        const isLoopActive = Boolean(gBg && gBg.enabled);
        let loopName = 'Video';
        const parts = loopSrcForMix.split(/[\\/]/);
        loopName = (parts[parts.length - 1] || 'Video').replace(/\.[^/.]+$/, '');
        const opPct = Math.round(((gBg && gBg.opacity) ?? 0.35) * 100);
        items.push({
          id: 'loop',
          type: 'loop',
          icon: '🔄',
          active: isLoopActive,
          title: `Loop: ${loopName} (%${opPct})`,
          fullTitle: isLoopActive ? `Loop Video Aktif: ${loopName}` : `Loop Video Pasif: ${loopName}`,
          onToggle: () => {
            const nextEnabled = !isLoopActive;
            if (state.liveItem && state.liveItem.loopTrack) {
              state.liveItem.loopTrack.enabled = nextEnabled;
            }
            if (!nextEnabled) {
              this.appState.setGlobalBackground({ enabled: false });
              this._toast?.('Loop video pasife alındı', 'info');
            } else {
              this.appState.setGlobalBackground({ enabled: true, type: 'video', src: loopSrcForMix, loop: true });
              this._toast?.('Loop video aktif edildi', 'ok');
            }
            this._updateLoopButtonUi?.();
          },
          onRemove: () => {
            this._mixLastLoopSrc = null;
            if (state.liveItem && state.liveItem.loopTrack) {
              delete state.liveItem.loopTrack;
            }
            const pl = this.appState.getState().playlist;
            if (pl && pl.currentIndex >= 0 && pl.items[pl.currentIndex]) {
              delete pl.items[pl.currentIndex].loopTrack;
              delete pl.items[pl.currentIndex].loopSrc;
              this.saveCurrentPlaylist?.();
            }
            this.appState.setGlobalBackground({ enabled: false, src: null });
            this.renderPlaylistDb();
            this._syncMediaLoopSelect?.();
            this._updateLoopButtonUi?.();
            this._updateLiveMixBar(this.appState.getState());
            this._toast?.('Loop video yayından kaldırıldı', 'info');
          }
        });
      }

      // 2b. Medyaya Bağlı Müzik (liveItem.audioTrack)
      if (state.liveItem && state.liveItem.type !== 'audio' && state.liveItem.audioTrack && state.liveItem.audioTrack.src) {
        const trk = state.liveItem.audioTrack;
        const isMediaAudioActive = trk.enabled !== false;
        let trkName = trk.name;
        if (!trkName) {
          const parts = trk.src.split(/[\\/]/);
          trkName = (parts[parts.length - 1] || 'Medya Müziği').replace(/\.[^/.]+$/, '');
        } else {
          trkName = trkName.replace(/\.[^/.]+$/, '');
        }
        items.push({
          id: 'media-fx',
          type: 'beat',
          icon: '🎵',
          active: isMediaAudioActive,
          title: `Medya Ses: ${trkName}`,
          fullTitle: isMediaAudioActive ? `Medya Müziği Aktif: ${trkName}` : `Medya Müziği Sessizde: ${trkName}`,
          onToggle: () => {
            const nextEnabled = !isMediaAudioActive;
            const updatedTrack = { ...trk, enabled: nextEnabled };
            this.appState.setState({
              liveItem: { ...state.liveItem, audioTrack: updatedTrack }
            });
            this._toast?.(nextEnabled ? `Medya müziği devam ediyor: ${trkName}` : `Medya müziği sessize alındı: ${trkName}`, nextEnabled ? 'ok' : 'info');
          },
          onRemove: () => {
            if (state.liveItem) {
              const updated = { ...state.liveItem };
              delete updated.audioTrack;
              this.appState.setState({ liveItem: updated });
            }
            this._toast?.(`Medya müziği yayından kaldırıldı: ${trkName}`, 'info');
          }
        });
      }

      // 3. Beat / Fon Müziği
      if (gBg && gBg.audioSrc) {
        this._mixLastBeatSrc = gBg.audioSrc;
        this._mixLastBeatName = gBg.audioName || null;
      }
      const beatSrcForMix = (gBg && gBg.audioSrc) ? gBg.audioSrc : (this._mixLastBeatSrc || null);
      if (beatSrcForMix) {
        const isBeatActive = Boolean(gBg && gBg.audioSrc && gBg.audioEnabled !== false);
        let beatName = (gBg && gBg.audioName) || this._mixLastBeatName;
        if (!beatName) {
          const parts = beatSrcForMix.split(/[\\/]/);
          beatName = (parts[parts.length - 1] || 'Fon Müziği').replace(/\.[^/.]+$/, '');
        }
        items.push({
          id: 'beat',
          type: 'beat',
          icon: '🎧',
          active: isBeatActive,
          title: `Fon: ${beatName}`,
          fullTitle: isBeatActive ? `Fon Müziği Aktif: ${beatName}` : `Fon Müziği Sessizde: ${beatName}`,
          onToggle: () => {
            if (isBeatActive) {
              this.appState.setGlobalBackground({ audioEnabled: false });
              this._toast?.('Fon müziği sessize alındı', 'info');
            } else {
              this.appState.setGlobalBackground({ audioSrc: beatSrcForMix, audioName: beatName, audioEnabled: true });
              this._toast?.('Fon müziği kaldığı yerden devam ediyor', 'ok');
            }
            this._renderBeatList?.();
            this._updateBeatBgUi?.();
          },
          onRemove: () => {
            this._mixLastBeatSrc = null;
            this._mixLastBeatName = null;
            this.appState.setGlobalBackground({ audioSrc: null, audioName: null, audioEnabled: false });
            this._renderBeatList?.();
            this._updateBeatBgUi?.();
            this._toast?.('Fon müziği yayından kaldırıldı', 'info');
          }
        });
      }

      // 4. Logo Overlay (Canlı Yayında)
      const logo = state.logoConfig;
      const configuredLogos = (logo && Array.isArray(logo.logos))
        ? logo.logos.filter(l => l && l.src && l.visible !== false)
        : [];
      if (configuredLogos.length > 0) {
        const isLogoActive = logo.enabled !== false;
        items.push({
          id: 'logo',
          type: 'logo',
          icon: '🏷️',
          active: isLogoActive,
          title: isLogoActive ? `Logo (${configuredLogos.length})` : `Logo (${configuredLogos.length}) (Pasif)`,
          fullTitle: isLogoActive ? 'Ekran Logosu Aktif' : 'Ekran Logosu Gizli',
          onToggle: () => {
            const nextEnabled = !isLogoActive;
            this.appState.setLogoConfig({ enabled: nextEnabled });
            this._toast?.(nextEnabled ? 'Logo yayında aktif edildi' : 'Logo yayından gizlendi', 'ok');
          },
          onRemove: () => {
            this.appState.setLogoConfig({ enabled: false });
            this._toast?.('Logo yayından kaldırıldı', 'info');
          }
        });
      }

      // 5. Karartma (Blackout)
      if (state.blackout) {
        items.push({
          id: 'blackout',
          type: 'blackout',
          icon: '⬛',
          active: true,
          title: 'Karartma',
          fullTitle: 'Yayın Karartması Aktif',
          onToggle: () => {
            this.appState.setState({ blackout: false });
            this._toast?.('Karartma kaldırıldı', 'ok');
          },
          onRemove: () => {
            this.appState.setState({ blackout: false });
            this._toast?.('Karartma kaldırıldı', 'ok');
          }
        });
      }

      const mixSig = items.map(it => `${it.id}|${it.type}|${it.title}|${it.active ? '1' : '0'}`).join('~');
      this._liveMixItems = items;
      if (this._lastLiveMixSig === mixSig) {
        return;
      }
      this._lastLiveMixSig = mixSig;

      const activeCount = items.filter(it => it.active !== false).length;
      const countBadge = document.getElementById('live-mix-count');
      if (countBadge) countBadge.textContent = `${activeCount} Aktif`;

      if (items.length === 0) {
        container.innerHTML = '<span class="live-mix-empty">Yayında aktif katman yok</span>';
        return;
      }

      const eyeOpenSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const eyeClosedSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

      container.innerHTML = items.map(it => `
        <div class="live-mix-chip ${it.active === false ? 'is-inactive' : ''}" data-type="${it.type}" title="${it.fullTitle}">
          <div class="live-mix-chip-left">
            <span class="chip-dot">●</span>
            <span class="chip-icon">${it.icon}</span>
            <span class="chip-title">${it.title}</span>
          </div>
          <div class="live-mix-chip-actions">
            <button type="button" class="chip-eye-btn" data-close-id="${it.id}" title="${it.active === false ? 'Aktif Et (Göster)' : 'Deaktif Et (Gizle)'}">${it.active === false ? eyeClosedSvg : eyeOpenSvg}</button>
            <button type="button" class="chip-remove-btn" data-live-remove-id="${it.id}" title="Yayından Kaldır">✕</button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.chip-eye-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.closeId;
          const currentItems = this._liveMixItems || items;
          const target = currentItems.find(x => x.id === id);
          if (target && typeof target.onToggle === 'function') {
            target.onToggle();
          }
        });
      });

      container.querySelectorAll('.chip-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.liveRemoveId;
          const currentItems = this._liveMixItems || items;
          const target = currentItems.find(x => x.id === id);
          if (target && typeof target.onRemove === 'function') {
            target.onRemove();
          }
        });
      });
    }

    async _exportSlidesPdf() {
      const item = this._selectedItem();
      if (!item || item.type !== 'presentation') {
        this._toast?.('Önce bir sunum seçin', 'warn');
        return;
      }
      if (!MD.tauri) {
        // Tarayıcı: doğrudan indir
        if (item.slidesPdf) {
          const a = document.createElement('a');
          a.href = item.slidesPdf;
          a.download = (item.title || 'sunum') + '.pdf';
          a.click();
          return;
        }
        this._toast?.('PDF bulunamadı', 'warn');
        return;
      }

      try {
        this._toast?.('PDF hazırlanıyor…', 'info');

        // PDF yoksa üret
        if (!item.slidesPdfPath) {
          const built = await PresentationHandler._buildSlidesPdf(item);
          if (built) {
            item.slidesPdf = built.url;
            item.slidesPdfPath = built.path;
            await this.saveCurrentPlaylist();
          }
        }
        if (!item.slidesPdfPath) {
          this._toast?.('PDF üretilemedi', 'warn');
          return;
        }

        const dest = await window.__TAURI__.core.invoke('export_media_to_desktop', {
          source: item.slidesPdfPath,
          saveName: (item.title || 'sunum') + '.pdf'
        });
        const short = String(dest).split('\\').pop();
        this._toast?.(`✅ Masaüstüne kaydedildi: ${short}`, 'ok');
        console.info('[MD] PDF kaydedildi:', dest);
      } catch (e) {
        console.error('[MD] PDF dışa aktarma hatası:', e);
        this._toast?.('PDF kaydedilemedi', 'warn');
      }
    }

    /** HTML kaçışı (dosya/klasör adları için). */
    _escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    _fmt(s) {      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    async initPlaylist() {
      try {
        const saved = await this.storageService.loadPlaylist();
        this.appState.state.playlist.clear();
        if (saved && saved.length > 0) {
          saved.forEach(item => this.appState.state.playlist.addItem(item));
          this.selectedItemIndex = 0;
        } else {
          this.selectedItemIndex = -1;
        }
      } catch (e) {
        console.warn('Playlist yükleme hatası:', e);
        this.selectedItemIndex = -1;
      }
      this.renderPlaylistDb();
      this.renderMediaPreview();
      this.updateUI(this.appState.getState());

      // Önbellek dosyaları silinmişse IndexedDB'deki asıl kopyadan onar
      this._healPlaylistSources();
      // Afiş dosyaları da aynı şekilde onarılır (kırık görsel kalmasın)
      this._healPosters();
    }

    /**
     * Kayıtlı medya dosyaları diskte yoksa (önbellek temizliği, taşınmış klasör)
     * IndexedDB'de saklanan orijinal Blob'dan yeniden üretir.
     *
     * Belgelerin (PDF/PPTX) slayt görselleri de diskteki ayrı dosyalardır;
     * onlar da aynı yolla yeniden çizilir. Kullanıcı hiçbir şey yapmaz.
     */
    async _healPlaylistSources() {
      if (!MD.tauri) return;
      const items = this.appState.getState().playlist.items.slice();
      let healed = 0;
      let broken = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || item.pending) continue;

        const candidates = [];
        if (item.mdPath) candidates.push(item.mdPath);
        if (item.src && item.src.indexOf('asset.localhost') > -1) candidates.push(item.src);
        if (item.slidesPdfPath) candidates.push(item.slidesPdfPath);
        if (item.slidesPdf && item.slidesPdf.indexOf('asset.localhost') > -1) candidates.push(item.slidesPdf);
        if (Array.isArray(item.slides)) {
          item.slides.forEach(s => {
            if (typeof s === 'string' && s.indexOf('asset.localhost') > -1) candidates.push(s);
          });
        }
        if (candidates.length === 0) continue;

        let allOk = true;
        for (const c of candidates) {
          if (!(await MD.mediaExists(c))) { allOk = false; break; }
        }
        if (allOk) {
          // mdPath eksikse (eski kayıt) ilk adayı yaz
          if (!item.mdPath && item.src && item.src.indexOf('asset.localhost') > -1) {
            item.mdPath = item.src;
          }
          continue;
        }

        if (!item.fileBlob) { broken++; continue; }

        try {
          const name = item.fileName || (item.title + '.bin');
          const file = item.fileBlob instanceof File
            ? item.fileBlob
            : new File([item.fileBlob], name);
          item.pending = true;
          this.renderPlaylistDb();

          PresentationHandler._lastImportedPath = null;
          const fresh = await PresentationHandler.processFile(file);
          if (fresh) {
            const keepId = item.id;
            const keepTitle = item.title;
            const keepIndex = this.appState.getState().playlist.items.indexOf(item);
            Object.assign(item, fresh);
            item.id = keepId;
            item.title = keepTitle || fresh.title;
            item.mdPath = fresh.mdPath || PresentationHandler._lastImportedPath || item.mdPath || null;
            item.slidesPdf = fresh.slidesPdf || item.slidesPdf || null;
            item.slidesPdfPath = fresh.slidesPdfPath || item.slidesPdfPath || null;
            item.pending = false;
            healed++;
            if (keepIndex === this.appState.getState().playlist.currentIndex &&
                this.appState.getState().playbackState !== 'stopped') {
              // Yayındaysa yeni kaynakla tekrar başlat
              this.appState.play(keepIndex);
            }
          } else {
            item.pending = false;
            broken++;
          }
        } catch (e) {
          item.pending = false;
          broken++;
          console.warn('[MD] Medya onarılamadı:', item.title, e);
        }
        this.renderPlaylistDb();
      }

      if (healed > 0) {
        this.renderMediaPreview();
        this.updateUI(this.appState.getState());
        await this.saveCurrentPlaylist();
        this._toast?.(`${healed} medya dosyası yeniden hazırlandı`, 'ok');
        console.info('[MD] Onarılan medya sayısı:', healed);
      }
      if (broken > 0) {
        console.warn('[MD] Kaynağı bulunamayan medya sayısı:', broken);
        this._toast?.(`${broken} medya bulunamadı — yeniden ekleyin`, 'warn');
      }

      // Artık kullanılmayan önbellek dosyalarını temizle (disk şişmesin)
      await this._cleanupMediaCache();
    }

    /**
     * Kayıtlı akışta kullanılan medya yollarını koruyup gerisini siler.
     * (Her içe aktarma yeni dosya ürettiği için eskiler birikir.)
     */
    async _cleanupMediaCache() {
      // Kaydedilen .toren dosyalarındaki medyaların disk önbelleğinden silinmemesi için
      // otomatik önbellek silme devre dışı bırakıldı.
      if (true) return 0;
      if (!MD.tauri) return 0;
      try {
        const st = this.appState.getState();
        const items = st.playlist.items;
        // İçe aktarma sürüyorsa temizlik yapma: yeni yazılan dosyaların
        // URL'si henüz duruma işlenmemiş olabilir.
        if (items.some(it => it && it.pending)) return 0;

        const keep = [];
        for (const it of items) {
          if (!it) continue;
          if (it.mdPath) keep.push(it.mdPath);
          if (it.slidesPdfPath) keep.push(it.slidesPdfPath);
          if (it.slidesPdf && it.slidesPdf.indexOf('data:') !== 0) keep.push(it.slidesPdf);
          if (Array.isArray(it.slides)) {
            it.slides.forEach((s) => {
              if (typeof s === 'string' && s.indexOf('data:') !== 0) keep.push(s);
            });
          }
          if (it.src && typeof it.src === 'string' && it.src.indexOf('data:') !== 0) keep.push(it.src);
        }

        // Tören/ses afişleri ve ayarlardan eklenen loop dosyaları da önbellekte tutulur — SİLİNMEMELİ.
        // (Aksi hâlde ayarlardaki afiş veya özel loop dosyası temizlikte silinip
        //  LED ekranında kırık görsel/video olarak kalıyordu.)
        const cs = st.ceremonySettings || {};
        [cs.defaultPosterSrc, cs.posterSrc, cs.audioPosterSrc, cs.audioLoopSrc, cs.audioLoopMusicSrc].forEach((p) => {
          if (typeof p === 'string' && p && p.indexOf('data:') !== 0) keep.push(p);
        });
        if (Array.isArray(cs.audioLoopCustom)) {
          cs.audioLoopCustom.forEach((x) => {
            if (x && typeof x.src === 'string' && x.src && x.src.indexOf('data:') !== 0) keep.push(x.src);
          });
        }

        // Logo PNG'leri de aynı önbellekte tutulur — silinmemeli.
        const lc = st.logoConfig || {};
        (lc.logos || []).forEach((l) => {
          if (l && typeof l.src === 'string' && l.src && l.src.indexOf('data:') !== 0) keep.push(l.src);
        });

        const n = await MD.cleanupCache(keep);
        if (n > 0) console.info('[MD] Önbellekten silinen dosya:', n);
        return n;
      } catch (e) {
        return 0;
      }
    }

    async saveCurrentPlaylist() {
      try {
        const items = this.appState.getState().playlist.items;
        await this.storageService.savePlaylist(items);
        // Kayıt sonrası kullanılmayan önbellek dosyalarını da temizle
        if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
        this._cleanupTimer = setTimeout(() => this._cleanupMediaCache(), 4000);
      } catch (e) {
        console.warn('Playlist kaydetme hatası:', e);
      }
    }

    /** Mevcut tören akışını ve yapılandırmasını .toren dosyası olarak dışa aktarır ve kalıcı kaydeder. */
    async exportCeremony() {
      try {
        const state = this.appState.getState();
        const items = (state.playlist && Array.isArray(state.playlist.items))
          ? state.playlist.items.filter(it => it && !it.pending)
          : [];

        // Önce IndexedDB ve yerel depolamaya anında kaydet
        await this.saveCurrentPlaylist();

        const ceremonyData = {
          appName: 'Master-Display',
          fileType: 'toren_ceremony',
          version: '2.1',
          savedAt: new Date().toISOString(),
          items: items.map((it, idx) => {
            const diskPath = it.filePath || it.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(it.src) : '') || '';
            const pdfPath = it.slidesPdfPath || (MD.extractDiskPath ? MD.extractDiskPath(it.slidesPdf) : '') || '';

            let cleanAudioTrack = null;
            if (it.audioTrack) {
              const audioDiskPath = it.audioTrack.filePath || it.audioTrack.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(it.audioTrack.src) : '') || '';
              cleanAudioTrack = {
                ...it.audioTrack,
                filePath: audioDiskPath || it.audioTrack.filePath || '',
                mdPath: audioDiskPath || it.audioTrack.mdPath || '',
                src: (it.audioTrack.src && !it.audioTrack.src.startsWith('blob:'))
                  ? it.audioTrack.src
                  : (audioDiskPath || '')
              };
            }

            let cleanLoopTrack = null;
            if (it.loopTrack) {
              const loopDiskPath = it.loopTrack.filePath || it.loopTrack.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(it.loopTrack.src) : '') || '';
              cleanLoopTrack = {
                ...it.loopTrack,
                filePath: loopDiskPath || it.loopTrack.filePath || '',
                mdPath: loopDiskPath || it.loopTrack.mdPath || '',
                src: (it.loopTrack.src && !it.loopTrack.src.startsWith('blob:'))
                  ? it.loopTrack.src
                  : (loopDiskPath || '')
              };
            }

            const slideList = Array.isArray(it.slides) ? it.slides.map(s => {
              if (typeof s !== 'string') return '';
              if (s.startsWith('blob:')) return MD.extractDiskPath ? (MD.extractDiskPath(s) || '') : '';
              return s;
            }).filter(Boolean) : [];

            const slideDiskPaths = Array.isArray(it.slides) ? it.slides.map(s => {
              if (typeof s !== 'string') return '';
              return (MD.extractDiskPath ? MD.extractDiskPath(s) : '') || s;
            }).filter(Boolean) : [];

            return {
              id: it.id || `item_${Date.now()}_${idx}`,
              order: idx,
              title: it.title,
              type: it.type,
              duration: it.duration,
              autoNext: it.autoNext,
              fitMode: it.fitMode || 'contain',
              notes: it.notes || '',
              fileName: it.fileName || (diskPath ? diskPath.split(/[\\/]/).pop() : ''),
              filePath: diskPath,
              fileSize: it.fileSize || 0,
              mdPath: it.mdPath || diskPath,
              slides: slideList,
              slidePaths: slideDiskPaths,
              slidesPdf: (it.slidesPdf && !it.slidesPdf.startsWith('blob:')) ? it.slidesPdf : (pdfPath || ''),
              slidesPdfPath: pdfPath,
              activeSlide: it.activeSlide || 0,
              audioTrack: cleanAudioTrack,
              loopTrack: cleanLoopTrack,
              visualEnabled: it.visualEnabled !== false,
              src: (it.src && !it.src.startsWith('blob:')) ? it.src : (diskPath || '')
            };
          }),
          globalBackground: state.globalBackground ? { ...state.globalBackground } : null,
          transition: state.transition ? { ...state.transition } : null,
          ceremonySettings: state.ceremonySettings ? { ...state.ceremonySettings } : null,
          screenScale: state.screenScale ? { ...state.screenScale } : null
        };

        const jsonStr = JSON.stringify(ceremonyData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });

        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
        const fileName = `Toren_${stamp}.toren`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);

        try {
          localStorage.setItem('master_display_last_ceremony_backup', jsonStr);
        } catch (e) {}

        this._toast?.(`💾 Tören kaydedildi: ${fileName} (${items.length} medya)`, 'ok');
      } catch (err) {
        console.error('Tören kaydetme hatası:', err);
        this._toast?.('Tören kaydedilirken hata oluştu', 'err');
      }
    }

    /** Daha önce kaydedilmiş .toren veya .json dosyasını içeri aktarır ve yayını/akışı geri yükler. */
    async importCeremony(file) {
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : null);
        if (!rawItems) {
          this._toast?.('Geçersiz tören dosyası formatı!', 'err');
          return;
        }

        // Mevcut oturum ve IndexedDB'deki kayıtları yedek referans olarak hazırla
        // (Eski .toren dosyalarında yol eksikse veya tarayıcı modundaysa buradan kurtarılır)
        const existingMapById = new Map();
        const existingMapByName = new Map();
        try {
          const curItems = this.appState.getState().playlist?.items || [];
          const dbItems = await this.storageService.loadPlaylist();
          [...dbItems, ...curItems].forEach((ex) => {
            if (!ex) return;
            if (ex.id) existingMapById.set(ex.id, ex);
            if (ex.fileName) existingMapByName.set(`${ex.fileName}_${ex.fileSize || 0}`, ex);
            if (ex.title) existingMapByName.set(ex.title, ex);
          });
        } catch (e) {}

        // 1. Akıştaki tüm medya yollarını çözümle ve taze convertFileSrc URL'lerine bağla
        const restoredItems = [];
        for (let i = 0; i < rawItems.length; i++) {
          const raw = rawItems[i];
          if (!raw) continue;

          const fallback = (raw.id && existingMapById.get(raw.id))
            || (raw.fileName && existingMapByName.get(`${raw.fileName}_${raw.fileSize || 0}`))
            || (raw.title && existingMapByName.get(raw.title))
            || null;

          const diskPath = raw.filePath
            || raw.mdPath
            || (MD.extractDiskPath ? MD.extractDiskPath(raw.src) : '')
            || fallback?.filePath
            || fallback?.mdPath
            || (fallback?.src && MD.extractDiskPath ? MD.extractDiskPath(fallback.src) : '')
            || '';

          // Slayt görsellerini ve PDF'i dönüştür
          let liveSlidesPdf = raw.slidesPdf || fallback?.slidesPdf || '';
          const pdfPath = raw.slidesPdfPath
            || (MD.extractDiskPath ? MD.extractDiskPath(raw.slidesPdf) : '')
            || fallback?.slidesPdfPath
            || '';
          if (MD.tauri && pdfPath) {
            try {
              liveSlidesPdf = window.__TAURI__.core.convertFileSrc(pdfPath);
            } catch (e) {}
          }

          const rawSlideSource = (Array.isArray(raw.slidePaths) && raw.slidePaths.length > 0)
            ? raw.slidePaths
            : ((Array.isArray(raw.slides) && raw.slides.length > 0) ? raw.slides : (fallback?.slides || []));

          const liveSlides = rawSlideSource.map(s => {
            if (typeof s !== 'string') return '';
            const sDisk = MD.extractDiskPath ? MD.extractDiskPath(s) : '';
            if (MD.tauri && sDisk) {
              try {
                return window.__TAURI__.core.convertFileSrc(sDisk);
              } catch (e) { return s; }
            }
            return s;
          }).filter(Boolean);

          // Ana medya kaynağını (liveSrc) belirle
          let liveSrc = '';
          if (raw.type === 'presentation' && liveSlides.length > 0) {
            liveSrc = liveSlides[0];
          } else if (MD.tauri && diskPath) {
            try {
              liveSrc = window.__TAURI__.core.convertFileSrc(diskPath);
            } catch (e) {
              console.warn('[MD] convertFileSrc hatası:', e);
            }
          }

          if (!liveSrc) {
            if (raw.src && !raw.src.startsWith('blob:')) {
              liveSrc = raw.src;
            } else if (fallback?.src && !fallback.src.startsWith('blob:')) {
              liveSrc = fallback.src;
            } else if (fallback?.fileBlob) {
              try {
                liveSrc = URL.createObjectURL(fallback.fileBlob);
              } catch (e) {}
            } else if (raw.src) {
              liveSrc = raw.src;
            }
          }

          // Özel ses parçası varsa onun yolunu da canlandır
          let liveAudioTrack = null;
          if (raw.audioTrack) {
            const aDisk = raw.audioTrack.filePath || raw.audioTrack.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(raw.audioTrack.src) : '') || '';
            let aSrc = raw.audioTrack.src || '';
            if (MD.tauri && aDisk) {
              try {
                aSrc = window.__TAURI__.core.convertFileSrc(aDisk);
              } catch (e) {}
            }
            liveAudioTrack = {
              ...raw.audioTrack,
              src: aSrc,
              filePath: aDisk,
              mdPath: aDisk
            };
          }

          // Özel loop parçası varsa onun yolunu da canlandır
          let liveLoopTrack = null;
          if (raw.loopTrack) {
            const lDisk = raw.loopTrack.filePath || raw.loopTrack.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(raw.loopTrack.src) : '') || '';
            let lSrc = raw.loopTrack.src || '';
            if (MD.tauri && lDisk) {
              try {
                lSrc = window.__TAURI__.core.convertFileSrc(lDisk);
              } catch (e) {}
            } else if (lSrc && lSrc.indexOf('loop/') === 0 && typeof MD.loopSrc === 'function') {
              lSrc = MD.loopSrc(lSrc);
            }
            liveLoopTrack = {
              ...raw.loopTrack,
              src: lSrc,
              filePath: lDisk,
              mdPath: lDisk
            };
          }

          const finalDuration = (raw.duration !== undefined && raw.duration !== null)
            ? (Number(raw.duration) || 0)
            : ((raw.type === 'image' || raw.type === 'presentation') ? 0 : 8);

          const mediaItem = new MediaItem({
            id: raw.id || `item_${Date.now()}_${i}`,
            title: raw.title || (raw.fileName ? raw.fileName.replace(/\.[^/.]+$/, '') : `Medya ${i + 1}`),
            type: raw.type || 'image',
            src: liveSrc,
            fileName: raw.fileName || (diskPath ? diskPath.split(/[\\/]/).pop() : ''),
            filePath: diskPath,
            fileSize: raw.fileSize || fallback?.fileSize || 0,
            duration: finalDuration,
            autoNext: Boolean(raw.autoNext),
            fitMode: raw.fitMode || 'contain',
            notes: raw.notes || '',
            fileBlob: fallback?.fileBlob || null,
            mdPath: diskPath,
            slides: liveSlides,
            slidesPdf: liveSlidesPdf,
            slidesPdfPath: pdfPath,
            activeSlide: raw.activeSlide || 0,
            audioTrack: liveAudioTrack,
            loopTrack: liveLoopTrack,
            visualEnabled: raw.visualEnabled !== false
          });

          restoredItems.push(mediaItem);
        }

        // 2. Akış listesini temizle ve yeni öğeleri ekle
        this.appState.state.playlist.clear();
        restoredItems.forEach((it) => {
          this.appState.state.playlist.addItem(it);
        });
        this.selectedItemIndex = restoredItems.length > 0 ? 0 : -1;

        // 3. Global Arka Plan (Loop Müzik & Video) ayarlarını geri yükle
        if (data.globalBackground) {
          this.appState.setGlobalBackground(data.globalBackground);
          this._updateBeatBgUi?.();
        }

        // 4. Geçiş ayarlarını geri yükle
        if (data.transition) {
          this.appState.setTransition(data.transition);
          this._updateFadeModeUi?.();
        }

        // 5. Tören ayarları & afişleri geri yükle
        if (data.ceremonySettings) {
          this.appState.setCeremonySettings(data.ceremonySettings);
        }

        // 6. Ekran & ölçek ayarları
        if (data.screenScale) {
          this.appState.setState({ screenScale: data.screenScale });
        }

        // 7. Veritabanına ve UI'a yansıt
        await this.saveCurrentPlaylist();
        this.renderPlaylistDb();
        this.renderMediaPreview();
        this._syncMediaAudioSelect?.();
        this._renderBeatList?.();
        this._updatePreviewMixBar?.();
        this._updateLiveMixBar?.(this.appState.getState());
        this.updateUI(this.appState.getState());

        // Eksik önbellek dosyası varsa ve IndexedDB'de blob duruyorsa otomatik onar
        this._healPlaylistSources?.();

        this._toast?.(`📂 Tören açıldı: ${restoredItems.length} medya ve ayarlar yüklendi`, 'ok');
      } catch (err) {
        console.error('Tören açma hatası:', err);
        this._toast?.('Tören dosyası okunurken hata oluştu', 'err');
      }
    }

    async handleUploadedFiles(files) {
      if (!files || files.length === 0) return;

      const fileList = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      // Anında geri bildirim: her dosya önce hafif bir "yükleniyor" satırı olarak
      // listeye girer, içe aktarma (diske yazım) tamamlandıkça gerçek medyayla değişir.
      // Böylece büyük video/müzik eklerken liste donmaz.
      const queue = [];
      for (const file of fileList) {
        const type = MediaItem.detectType(file);
        if (type === 'ignore') continue;
        const rawNative = (file && typeof file.path === 'string') ? file.path.trim() : '';
        const realPath = (/^[a-zA-Z]:[\\/]/.test(rawNative) || rawNative.startsWith('\\\\')) ? rawNative : '';
        const pending = new MediaItem({
          title: file.name.replace(/\.[^/.]+$/, ''),
          type: type,
          src: '',
          duration: 0,
          notes: '',
          fileName: file.name,
          filePath: realPath,
          mdPath: realPath || null,
          fileSize: file.size
        });
        pending.pending = true;
        this.appState.state.playlist.addItem(pending);
        queue.push({ file, pending, realPath });
      }

      if (queue.length === 0) return;

      if (this.selectedItemIndex === null || this.selectedItemIndex === undefined || this.selectedItemIndex < 0) {
        this.selectedItemIndex = 0;
      }
      this.renderPlaylistDb();
      this.renderMediaPreview();

      let count = 0;
      for (const { file, pending, realPath } of queue) {
        const idx = this.appState.state.playlist.items.findIndex(i => i.id === pending.id);
        if (idx < 0) continue; // kullanıcı bu sırada satırı sildi
        const previewIdx = this.selectedItemIndex;
        try {
          PresentationHandler._lastImportedPath = null;
          // PPTX çizimi uzun sürebilir: satırda ilerleme göster
          window.__mdPptxProgress = (done, total, t) => {
            pending.notes = `Slayt ${done}/${total} çiziliyor…`;
            const row = this.playlistDbContainer?.querySelector(`.playlist-row[data-index="${idx}"] .playlist-status-badge`);
            if (row) row.innerHTML = `<span style="color:#f6ad55; font-weight:700; font-size:9px;">🎬 ${done}/${total}</span>`;
          };
          const item = await PresentationHandler.processFile(file);
          window.__mdPptxProgress = null;
          if (item) {
            const bestDiskPath = realPath || item.filePath || item.mdPath || (MD.extractDiskPath ? MD.extractDiskPath(item.src) : '') || '';
            if (bestDiskPath) {
              item.filePath = bestDiskPath;
              if (!item.mdPath) item.mdPath = bestDiskPath;
            }
            this.appState.state.playlist.items[idx] = item;
            count++;
          } else {
            this.appState.state.playlist.items.splice(idx, 1);
            if (previewIdx > idx) this.selectedItemIndex = previewIdx - 1;
          }
        } catch (err) {
          console.error('Dosya ekleme hatası:', err, file.name);
          this.appState.state.playlist.items.splice(idx, 1);
          if (previewIdx > idx) this.selectedItemIndex = previewIdx - 1;
        }
        this.renderPlaylistDb();
        // Sadece izlenen satır değiştiyse ön izlemeyi tazele (diğer ön izlemeyi bölmemek için)
        if (this.selectedItemIndex === idx) this.renderMediaPreview();
      }

      if (count > 0) {
        if (this.selectedItemIndex >= this.appState.state.playlist.items.length) {
          this.selectedItemIndex = Math.max(0, this.appState.state.playlist.items.length - 1);
        }
        this.renderPlaylistDb();
        this.renderMediaPreview();
        await this.saveCurrentPlaylist();
      }
    }

    /**
     * Afiş dosyasını IndexedDB'ye saklar (önbellek silinirse geri yazılır).
     */
    async _storePoster(kind, file) {
      try {
        if (!file) return;
        await this.storageService.putItem({
          id: '__poster_' + kind + '__',
          order: -1,
          title: 'poster_' + kind,
          type: 'poster',
          fileName: file.name,
          fileBlob: file,
          src: ''
        });
      } catch (e) {}
    }

    /**
     * Afiş dosyalarını denetler: diskteki kopya silinmişse IndexedDB'deki
     * orijinalden yeniden yazar. Aksi hâlde LED ekranında kırık görsel kalır.
     */
    async _healPosters() {
      if (!MD.tauri) return;
      const cs = this.appState.getState().ceremonySettings || {};
      const targets = [
        { kind: 'default', key: 'defaultPosterSrc' },
        { kind: 'audio', key: 'audioPosterSrc' }
      ];
      let changed = false;
      const patch = {};

      for (const t of targets) {
        const cur = cs[t.key];
        if (!cur || typeof cur !== 'string') continue;
        if (cur.indexOf('data:') === 0) continue;      // Base64: disk gerekmez
        if (await MD.mediaExists(cur)) continue;       // dosya yerinde

        // Ölü yol: IndexedDB'deki orijinalden yeniden üret
        const rec = await this.storageService.getItem('__poster_' + t.kind + '__');
        if (rec && rec.fileBlob) {
          try {
            const name = rec.fileName || (t.kind + '-afis.png');
            const file = rec.fileBlob instanceof File
              ? rec.fileBlob
              : new File([rec.fileBlob], name);
            const url = await MD.importFile(file);
            if (url) { patch[t.key] = url; changed = true; continue; }
          } catch (e) {}
        }
        // Kurtarılamadı: boş bırak (kırık görsel yerine nötr zemin çizilir)
        patch[t.key] = '';
        changed = true;
      }

      if (changed) {
        this.appState.setCeremonySettings(patch);
        this.renderMediaPreview();
      }
    }

    /**
     * Genel Uygulama Ayarları (Kilit, Uyanık Kalma / Caffeine) Modalı
     */
    _initAppSettingsModal() {
      const modal = document.getElementById('modal-app-settings');
      const btn = document.getElementById('btn-app-settings');
      const closeBtn = document.getElementById('btn-close-app-settings-modal');
      const footerCloseBtn = document.getElementById('btn-close-app-settings-footer');
      const chkLock = document.getElementById('chk-setting-lock-layout');
      const chkAwake = document.getElementById('chk-setting-keep-awake');
      const badgeLock = document.getElementById('badge-setting-lock-status');

      if (!modal) return;

      const refreshUi = () => {
        const layoutMgr = window.__LayoutSplitterManager;
        if (chkLock && layoutMgr) {
          chkLock.checked = Boolean(layoutMgr.isLocked);
        }
        if (badgeLock && layoutMgr) {
          badgeLock.textContent = layoutMgr.isLocked ? 'Kilitli' : 'Serbest';
          badgeLock.style.background = layoutMgr.isLocked ? '#ef444426' : 'var(--bg-card)';
          badgeLock.style.color = layoutMgr.isLocked ? '#f87171' : 'var(--text-dim)';
        }
        const awakeMgr = window.__KeepAwakeManager || window.__MasterApp?.keepAwakeManager;
        if (chkAwake && awakeMgr) {
          chkAwake.checked = Boolean(awakeMgr.isEnabled);
        }
      };

      const openModal = () => {
        refreshUi();
        modal.style.display = 'flex';
      };
      const closeModal = () => {
        modal.style.display = 'none';
      };

      btn?.addEventListener('click', openModal);
      closeBtn?.addEventListener('click', closeModal);
      footerCloseBtn?.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      chkLock?.addEventListener('change', () => {
        const layoutMgr = window.__LayoutSplitterManager;
        if (layoutMgr) {
          layoutMgr.toggleLock(true);
          refreshUi();
        }
      });

      chkAwake?.addEventListener('change', () => {
        const awakeMgr = window.__KeepAwakeManager || window.__MasterApp?.keepAwakeManager;
        if (awakeMgr) {
          awakeMgr.setEnabled(chkAwake.checked, true);
        }
      });

      // --- Otomatik Güncelleme (GitHub Releases) Mantığı ---
      const btnCheckUpdate = document.getElementById('btn-check-update');
      const btnCheckIcon = document.getElementById('btn-check-update-icon');
      const btnCheckText = document.getElementById('btn-check-update-text');
      const updateStatusMsg = document.getElementById('update-status-msg');
      const updateAvailableBox = document.getElementById('update-available-box');
      const updateNewTag = document.getElementById('update-new-tag');
      const updateAssetSize = document.getElementById('update-asset-size');
      const updateNotesPreview = document.getElementById('update-notes-preview');
      const btnDoUpdate = document.getElementById('btn-do-update');
      const linkGithubRelease = document.getElementById('link-github-release');
      const updateProgressBox = document.getElementById('update-download-progress-box');
      const updateProgressLabel = document.getElementById('update-progress-label');

      let latestDownloadUrl = null;

      const runCheckUpdate = async (isManual = true) => {
        if (isManual) {
          if (btnCheckIcon) btnCheckIcon.textContent = '⏳';
          if (btnCheckText) btnCheckText.textContent = 'Denetleniyor...';
          if (btnCheckUpdate) btnCheckUpdate.disabled = true;
          if (updateStatusMsg) {
            updateStatusMsg.textContent = 'GitHub sunucusu kontrol ediliyor...';
            updateStatusMsg.style.color = 'var(--text-muted)';
          }
        }

        try {
          let result = null;
          if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
            result = await window.__TAURI__.core.invoke('check_app_update');
          } else {
            const res = await fetch('https://api.github.com/repos/BeNKaYS/Master-Display/releases/latest', {
              headers: { 'User-Agent': 'Master-Display' }
            });
            if (res.ok) {
              const data = await res.json();
              const tag = data.tag_name || '';
              const cleanTag = tag.replace(/^v/i, '');
              const hasUp = cleanTag > '2.0.0';
              let dl = null, sz = 0;
              data.assets?.forEach(a => {
                if (a.name?.endsWith('.exe')) { dl = a.browser_download_url; sz = a.size; }
              });
              result = {
                has_update: hasUp,
                current_version: '2.0.0',
                latest_version: cleanTag,
                tag_name: tag,
                release_notes: data.body || '',
                download_url: dl,
                asset_size: sz,
                html_url: data.html_url
              };
            } else {
              result = { has_update: false, message: 'GitHub üzerinde yayınlanan sürüm bulunamadı.' };
            }
          }

          if (result?.has_update) {
            if (updateStatusMsg) {
              updateStatusMsg.textContent = `🎉 Yeni sürüm yayınlandı: ${result.tag_name || ('v' + result.latest_version)}`;
              updateStatusMsg.style.color = 'var(--accent-blue)';
            }
            if (updateAvailableBox) updateAvailableBox.style.display = 'flex';
            if (updateNewTag) updateNewTag.textContent = `Yeni Sürüm: ${result.tag_name || ('v' + result.latest_version)}`;
            if (updateAssetSize && result.asset_size) {
              updateAssetSize.textContent = `~${(result.asset_size / (1024 * 1024)).toFixed(1)} MB`;
            }
            if (updateNotesPreview) {
              updateNotesPreview.textContent = result.release_notes || 'Yenilik ve performans iyileştirmeleri içerir.';
            }
            if (linkGithubRelease) {
              linkGithubRelease.href = result.html_url || 'https://github.com/BeNKaYS/Master-Display/releases';
              linkGithubRelease.onclick = (e) => {
                e.preventDefault();
                const targetUrl = result.html_url || 'https://github.com/BeNKaYS/Master-Display/releases';
                if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                  window.__TAURI__.core.invoke('open_external_url', { url: targetUrl });
                } else {
                  window.open(targetUrl, '_blank');
                }
              };
            }
            latestDownloadUrl = result.download_url;

            // Ayarlar butonuna güncelleme noktası ekle
            if (btn && !btn.querySelector('.update-badge-dot')) {
              const dot = document.createElement('span');
              dot.className = 'update-badge-dot';
              dot.style.cssText = 'position:absolute; top:2px; right:2px; width:7px; height:7px; background:#10b981; border-radius:50%; box-shadow:0 0 6px #10b981;';
              btn.style.position = 'relative';
              btn.appendChild(dot);
            }
          } else {
            if (updateAvailableBox) updateAvailableBox.style.display = 'none';
            if (updateStatusMsg) {
              updateStatusMsg.textContent = result?.message || `✓ Uygulamanız en güncel sürümde (v${result?.current_version || '2.0.0'}).`;
              updateStatusMsg.style.color = '#10b981';
            }
          }
        } catch (err) {
          if (updateStatusMsg) {
            updateStatusMsg.textContent = `Kontrol edilemedi: ${err?.message || err || 'İnternet bağlantınızı kontrol edin.'}`;
            updateStatusMsg.style.color = 'var(--text-dim)';
          }
        } finally {
          if (btnCheckIcon) btnCheckIcon.textContent = '🔄';
          if (btnCheckText) btnCheckText.textContent = 'Güncellemeleri Denetle';
          if (btnCheckUpdate) btnCheckUpdate.disabled = false;
        }
      };

      btnCheckUpdate?.addEventListener('click', () => runCheckUpdate(true));

      btnDoUpdate?.addEventListener('click', async () => {
        if (!latestDownloadUrl) {
          alert('İndirilebilir kurulum dosyası bulunamadı. Lütfen GitHub sayfasından manuel indirin.');
          return;
        }
        btnDoUpdate.disabled = true;
        if (updateProgressBox) updateProgressBox.style.display = 'flex';
        if (updateProgressLabel) updateProgressLabel.textContent = 'Güncelleme paketi indiriliyor ve kuruluma hazırlanıyor...';

        try {
          if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
            await window.__TAURI__.core.invoke('download_and_install_update', { downloadUrl: latestDownloadUrl });
          } else {
            window.open(latestDownloadUrl, '_blank');
          }
        } catch (err) {
          alert('Güncelleme başlatılırken hata oluştu: ' + err);
          btnDoUpdate.disabled = false;
          if (updateProgressBox) updateProgressBox.style.display = 'none';
        }
      });

      if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
        window.__TAURI__.event.listen('update-status', (ev) => {
          const payload = ev.payload;
          if (payload?.message && updateProgressLabel) {
            updateProgressLabel.textContent = payload.message;
          }
        });
      }

      // Uygulama açılışından 3.5 sn sonra arka planda sessiz denetle
      setTimeout(() => {
        runCheckUpdate(false);
      }, 3500);
    }

    /**
     * Tören ve Sahne Ayarları Modalı Yönetimi
     */
    _initSettingsModal() {
      let tempSettings = { ...this.appState.getState().ceremonySettings };

      const openModal = () => {
        tempSettings = { ...this.appState.getState().ceremonySettings };

        // 1. Varsayılan Tören Sahne Resmi
        const defSrc = tempSettings.defaultPosterSrc || tempSettings.posterSrc || '';
        if (this.settingsPosterImg) {
          if (defSrc && defSrc !== 'assets/samples/ataturk_bayrak.svg') {
            this.settingsPosterImg.src = defSrc;
            this.settingsPosterImg.style.display = 'block';
          } else {
            this.settingsPosterImg.src = '';
            this.settingsPosterImg.style.display = 'none';
          }
        }
        if (this.chkAutoDefaultPoster) {
          this.chkAutoDefaultPoster.checked = (tempSettings.autoDefaultPosterOnIdle !== false);
        }

        // 2. Ses / Müzik Çalma Resmi
        const audSrc = tempSettings.audioPosterSrc || defSrc || '';
        if (this.settingsAudioPosterImg) {
          if (audSrc && audSrc !== 'assets/samples/ataturk_bayrak.svg') {
            this.settingsAudioPosterImg.src = audSrc;
            this.settingsAudioPosterImg.style.display = 'block';
          } else {
            this.settingsAudioPosterImg.src = '';
            this.settingsAudioPosterImg.style.display = 'none';
          }
        }

        // 3. Ses Ekran Modu Radio Kartları
        const currentMode = tempSettings.audioScreenMode || 'audio_poster';
        const radioCards = this.modalCeremonySettings?.querySelectorAll('.audio-mode-card');
        radioCards?.forEach(c => {
          const radio = c.querySelector('input[type="radio"]');
          const isActive = (c.dataset.mode === currentMode || (currentMode === 'poster' && c.dataset.mode === 'audio_poster'));
          if (radio) radio.checked = isActive;
          c.classList.toggle('active', isActive);
        });

        // 3b. Loop video + loop müziği seçicileri: mevcut arka plan beat sesini koru (yoksa kaydettiğinde silinmesin!)
        const curBgAudio = this.appState.getState().globalBackground || {};
        if (!tempSettings.audioLoopMusicSrc && curBgAudio.audioSrc) {
          tempSettings.audioLoopMusicSrc = curBgAudio.audioSrc;
          tempSettings.audioLoopMusicName = curBgAudio.audioName || '';
        }
        this._populateAudioLoopPickers(tempSettings);

        if (this.modalCeremonySettings) this.modalCeremonySettings.style.display = 'flex';
      };

      const closeModal = () => {
        if (this.modalCeremonySettings) this.modalCeremonySettings.style.display = 'none';
      };

      this.btnSettingsQuick?.addEventListener('click', openModal);
      this.menuSettings?.addEventListener('click', openModal);
      this.btnCloseSettingsModal?.addEventListener('click', closeModal);
      this.btnCancelSettings?.addEventListener('click', closeModal);

      this.modalCeremonySettings?.addEventListener('click', (e) => {
        if (e.target === this.modalCeremonySettings) closeModal();
      });

      // 1. Varsayılan Tören Sahne Resmi Yükleme
      this.btnUploadCeremonyPoster?.addEventListener('click', () => {
        this.ceremonyPosterFileInput?.click();
      });

      this.ceremonyPosterFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        // Tauri: diske yaz + asset URL (Base64 yok). Tarayıcı: eski Base64 yolu.
        const assetUrl = await MD.importFile(file);
        if (assetUrl) {
          tempSettings.defaultPosterSrc = assetUrl;
          tempSettings.defaultPosterTitle = file.name;
          if (this.settingsPosterImg) this.settingsPosterImg.src = assetUrl;
          // Afiş dosyasını IndexedDB'ye de sakla: önbellek temizliğinde
          // silinirse açılışta buradan geri yazılır.
          this._storePoster('default', file);
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          let res = ev.target.result;
          if (res && typeof res === 'string' && res.startsWith('data:application/octet-stream')) {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            if (ext === 'webp') res = res.replace('data:application/octet-stream', 'data:image/webp');
            else if (ext === 'png') res = res.replace('data:application/octet-stream', 'data:image/png');
            else if (ext === 'jpg' || ext === 'jpeg') res = res.replace('data:application/octet-stream', 'data:image/jpeg');
          }
          tempSettings.defaultPosterSrc = res;
          tempSettings.defaultPosterTitle = file.name;
          if (this.settingsPosterImg) this.settingsPosterImg.src = res;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      // 2. Ses / Müzik Özel Resmi Yükleme
      this.btnUploadAudioPoster?.addEventListener('click', () => {
        this.audioPosterFileInput?.click();
      });

      this.audioPosterFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        // Tauri: diske yaz + asset URL (Base64 yok). Tarayıcı: eski Base64 yolu.
        const assetUrl = await MD.importFile(file);
        if (assetUrl) {
          tempSettings.audioPosterSrc = assetUrl;
          tempSettings.audioPosterTitle = file.name;
          if (this.settingsAudioPosterImg) this.settingsAudioPosterImg.src = assetUrl;
          this._storePoster('audio', file);
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          let res = ev.target.result;
          if (res && typeof res === 'string' && res.startsWith('data:application/octet-stream')) {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            if (ext === 'webp') res = res.replace('data:application/octet-stream', 'data:image/webp');
            else if (ext === 'png') res = res.replace('data:application/octet-stream', 'data:image/png');
            else if (ext === 'jpg' || ext === 'jpeg') res = res.replace('data:application/octet-stream', 'data:image/jpeg');
          }
          tempSettings.audioPosterSrc = res;
          tempSettings.audioPosterTitle = file.name;
          if (this.settingsAudioPosterImg) this.settingsAudioPosterImg.src = res;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      // 3. Ses Ekran Modu Kartları
      const radioCards = this.modalCeremonySettings?.querySelectorAll('.audio-mode-card');
      radioCards?.forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('#audio-loop-picker')) {
            if (!card.classList.contains('active')) {
              radioCards.forEach(c => c.classList.remove('active'));
              card.classList.add('active');
              const radio = card.querySelector('input[type="radio"]');
              if (radio) radio.checked = true;
              tempSettings.audioScreenMode = card.dataset.mode;
            }
            return;
          }
          radioCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          tempSettings.audioScreenMode = card.dataset.mode;
        });
      });

      // 3b. Loop video + loop müziği
      const loopSel = document.getElementById('select-audio-loop');
      const musicSel = document.getElementById('select-audio-loop-music');
      const loopVideoInput = document.getElementById('audio-loop-file-input');
      const loopMusicInput = document.getElementById('audio-loop-music-file-input');

      const importLoopFile = async (file, kind) => {
        const assetUrl = await MD.importFile(file);
        if (!assetUrl) {
          this._setAudioLoopNote('Dosya eklenemedi. Farklı bir dosya deneyin.', 'warn');
          return;
        }
        const list = Array.isArray(tempSettings.audioLoopCustom) ? tempSettings.audioLoopCustom.slice() : [];
        if (!list.some(x => x.src === assetUrl)) {
          list.push({ name: file.name, src: assetUrl, kind });
        }
        tempSettings.audioLoopCustom = list;
        if (kind === 'audio') {
          tempSettings.audioLoopMusicSrc = assetUrl;
          tempSettings.audioLoopMusicName = file.name;
        } else {
          tempSettings.audioLoopSrc = assetUrl;
          tempSettings.audioLoopName = file.name;
        }
        this._populateAudioLoopPickers(tempSettings);
        this._setAudioLoopNote(`${file.name} eklendi ve seçildi.`, 'ok');
      };

      document.getElementById('btn-add-audio-loop')?.addEventListener('click', () => loopVideoInput?.click());
      document.getElementById('btn-add-audio-loop-music')?.addEventListener('click', () => loopMusicInput?.click());

      loopVideoInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await importLoopFile(file, 'video');
      });

      loopMusicInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await importLoopFile(file, 'audio');
      });

      document.getElementById('btn-clear-audio-loop')?.addEventListener('click', () => {
        tempSettings.audioLoopSrc = '';
        tempSettings.audioLoopName = '';
        tempSettings.audioLoopMusicSrc = '';
        tempSettings.audioLoopMusicName = '';
        if (loopSel) loopSel.value = '';
        if (musicSel) musicSel.value = '';
        this._setAudioLoopNote('Seçim temizlendi. Varsayılan loop kullanılacak.', 'ok');
      });

      loopSel?.addEventListener('change', () => {
        const opt = loopSel.selectedOptions && loopSel.selectedOptions[0];
        tempSettings.audioLoopSrc = loopSel.value || '';
        tempSettings.audioLoopName = (loopSel.value && opt) ? opt.textContent.trim() : '';
      });

      musicSel?.addEventListener('change', () => {
        const opt = musicSel.selectedOptions && musicSel.selectedOptions[0];
        tempSettings.audioLoopMusicSrc = musicSel.value || '';
        tempSettings.audioLoopMusicName = (musicSel.value && opt) ? opt.textContent.trim() : '';
      });

      this.btnSaveCeremonySettings?.addEventListener('click', () => {
        if (this.chkAutoDefaultPoster) {
          tempSettings.autoDefaultPosterOnIdle = this.chkAutoDefaultPoster.checked;
        }
        this.appState.setCeremonySettings(tempSettings);
        // Yalnızca ayarlardan açıkça bir loop müziği seçildiyse veya modalda select-audio-loop-music varsa arka plana yaz
        if (musicSel || tempSettings.audioLoopMusicSrc !== undefined) {
          const curBg = this.appState.getState().globalBackground || {};
          const nextAudioSrc = tempSettings.audioLoopMusicSrc || curBg.audioSrc || null;
          const nextAudioName = tempSettings.audioLoopMusicName || curBg.audioName || null;
          this.appState.setGlobalBackground({
            audioSrc: nextAudioSrc,
            audioName: nextAudioName
          });
        }
        closeModal();
        this.renderMediaPreview();
      });
    }

    /** Ayar modalındaki bilgi satırını günceller. */
    _setAudioLoopNote(text, tone) {
      const el = document.getElementById('audio-loop-picker-note');
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('is-ok', tone === 'ok');
      el.classList.toggle('is-warn', tone === 'warn');
    }

    /**
     * Ayar modalındaki loop video / loop müziği listelerini doldurur.
     *
     * Video listesi: `loop/` klasörü (this.loopVideos) + kullanıcının ekledikleri.
     * Müzik listesi: `Beat/` klasörü (this.beatFiles) + kullanıcının ekledikleri.
     * Eklenen dosyalar ceremonySettings.audioLoopCustom içinde saklanır ve
     * uygulama klasörüne kopyalandığı için yeniden başlatmada da görünür.
     */
    _populateAudioLoopPickers(settings) {
      const loopSel = document.getElementById('select-audio-loop');
      const musicSel = document.getElementById('select-audio-loop-music');
      if (!loopSel) return;

      const esc = (s) => this._escapeHtml(s);
      const custom = Array.isArray(settings.audioLoopCustom) ? settings.audioLoopCustom : [];
      const customVideos = custom.filter(x => x && x.kind === 'video');
      const customMusic = custom.filter(x => x && x.kind === 'audio');

      // --- Loop videoları ---
      const vOpts = ['<option value="">— Varsayılan loop (arka plan seçimi) —</option>'];
      (this.loopVideos || []).forEach((lv) => {
        vOpts.push(`<option value="${esc(lv.src)}">${esc(lv.label ? `${lv.label} — ${lv.name}` : lv.name)}</option>`);
      });
      if (customVideos.length) {
        vOpts.push('<optgroup label="Eklenen videolar">');
        customVideos.forEach(x => vOpts.push(`<option value="${esc(x.src)}">${esc(x.name)}</option>`));
        vOpts.push('</optgroup>');
      }
      loopSel.innerHTML = vOpts.join('');
      const wantVideo = settings.audioLoopSrc || '';
      const hasVideo = Array.prototype.some.call(loopSel.options, o => o.value === wantVideo);
      if (wantVideo && !hasVideo) {
        // Kayıtlı seçim listede yoksa (dosya taşınmış/silinmiş olsa bile)
        // seçimi kaybetmemek için geçici bir seçenek eklenir.
        const o = document.createElement('option');
        o.value = wantVideo;
        o.textContent = settings.audioLoopName || wantVideo;
        loopSel.appendChild(o);
      }
      loopSel.value = wantVideo || '';

      // --- Loop müzikleri ---
      if (musicSel) {
        const mOpts = ['<option value="">— Müzik yok —</option>'];
        const groups = new Map();
        (this.beatFiles || []).forEach((f) => {
          const key = f.folder || '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(f);
        });
        groups.forEach((files, key) => {
          if (key) mOpts.push(`<optgroup label="${esc(key)}">`);
          files.forEach((f) => {
            mOpts.push(`<option value="${esc(f.src)}">${esc(f.name.replace(/\.[^.]+$/, ''))}</option>`);
          });
          if (key) mOpts.push('</optgroup>');
        });
        if (customMusic.length) {
          mOpts.push('<optgroup label="Eklenen müzikler">');
          customMusic.forEach(x => mOpts.push(`<option value="${esc(x.src)}">${esc(x.name)}</option>`));
          mOpts.push('</optgroup>');
        }
        musicSel.innerHTML = mOpts.join('');
        const wantMusic = settings.audioLoopMusicSrc
          || this.appState.getState().globalBackground?.audioSrc
          || '';
        const hasMusic = Array.prototype.some.call(musicSel.options, o => o.value === wantMusic);
        if (wantMusic && !hasMusic) {
          const o = document.createElement('option');
          o.value = wantMusic;
          o.textContent = settings.audioLoopMusicName || wantMusic;
          musicSel.appendChild(o);
        }
        musicSel.value = wantMusic || '';
      }
    }
  }

  // --- 10. APP INIT ---
  /**
   * LED ekranının senkron durumunu köşede gösterir.
   * Amaç: "ekran neden boş / neden geç geliyor" sorusunu tahmine bırakmamak.
   */
  function _initDisplayStatusBadge(syncBus) {
    const badge = document.createElement('div');
    badge.id = 'md-sync-badge';
    badge.style.cssText = [
      'position:fixed', 'top:10px', 'right:50px', 'z-index:2147483647',
      'font:600 11px/1 system-ui,sans-serif', 'padding:7px 11px', 'border-radius:14px',
      'background:rgba(12,16,24,0.85)', 'border:1px solid #4a5568', 'color:#a0aec0',
      'pointer-events:none', 'transition:opacity .4s', 'letter-spacing:.3px'
    ].join(';');
    badge.textContent = '● BAĞLANIYOR…';
    document.body.appendChild(badge);

    let syncedSince = 0;
    const update = () => {
      const last = syncBus._lastStateAt || 0;
      const age = last ? Date.now() - last : Infinity;
      const ok = age < 4000;
      if (ok) {
        if (!syncedSince) syncedSince = Date.now();
      } else {
        syncedSince = 0;
      }
      badge.textContent = ok ? '● SENKRON' : '● BAĞLANTI YOK';
      badge.style.color = ok ? '#68d391' : '#fc8181';
      badge.style.borderColor = ok ? '#2f855a' : '#9b2c2c';
      // Senkron oturunca rozet kendini gizler (yayını kirletmesin), kopunca görünür kalır
      badge.style.opacity = ok ? (Date.now() - syncedSince > 5000 ? '0' : '1') : '1';

      // Bağımsız açılmış pencere: hiç state gelmedi ve açan pencere de yok
      if (last === 0 && !window.__mdOrphanShown && !MD.tauri && !window.opener && age > 4000) {
        window.__mdOrphanShown = true;
        const warn = document.createElement('div');
        warn.style.cssText = [
          'position:fixed', 'inset:0', 'z-index:2147483646', 'display:flex',
          'flex-direction:column', 'align-items:center', 'justify-content:center',
          'gap:12px', 'padding:32px', 'text-align:center', 'pointer-events:none',
          'background:rgba(8,10,16,0.94)', 'color:#e2e8f0', 'font:400 17px/1.5 system-ui,sans-serif'
        ].join(';');
        warn.innerHTML = `
          <div style="font-size:44px; opacity:.7;">🔌</div>
          <div style="font-weight:800; font-size:21px;">Bu pencere reji panelinden bağımsız açılmış</div>
          <div style="max-width:620px; color:#a0aec0;">
            LED çıkış ekranı ancak reji konsolundaki <strong style="color:#e2e8f0;">Ekran</strong>
            düğmesiyle açıldığında senkron çalışır. Bu sekme hiçbir reji paneline bağlı değil,
            bu yüzden ne görüntü ne ses alabilir.
            <br><br>Doğrusu: reji konsolunu açın → <strong style="color:#e2e8f0;">Ekran</strong> düğmesine basın.
            Pencere otomatik olarak ikinci monitöre tam ekran yerleşir.
          </div>
        `;
        document.body.appendChild(warn);
      }
    };
    update();
    setInterval(update, 1000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isDisplay = urlParams.get('screen') === '1';
    const isPreview = urlParams.get('preview') === '1';
    const role = isDisplay ? 'display' : 'master';

    // Tema: yalnızca reji konsolunda geçerli (LED çıkışı her zaman siyah zeminli).
    // Sayfa boyanmadan ÖNCE uygulanır ki koyu→açık geçişinde göz kırpmasın.
    if (role !== 'display') {
      try {
        if (localStorage.getItem('master_display_theme') === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      } catch (e) {}
    }

    const appState = new AppState();
    appState.setState({ role });
    window.appState = appState;

    const syncBus = new SyncBus(appState, role, isPreview);
    const audioManager = new AudioManager(appState, role, isPreview);

    if (isDisplay) {
      document.body.classList.add('display-mode');
      if (isPreview) document.body.classList.add('preview-mode');

      const displayContainer = document.getElementById('display-root');
      if (displayContainer) {
        displayContainer.style.display = 'flex';
        const renderer = new DisplayRenderer(displayContainer, appState, isPreview);
        window.__DisplayApp = { appState, syncBus, audioManager, renderer };
      }
      const masterContainer = document.getElementById('master-root');
      if (masterContainer) masterContainer.style.display = 'none';

      if (!isPreview) _initDisplayStatusBadge(syncBus);
    } else {
      const masterContainer = document.getElementById('master-root');
      if (masterContainer) masterContainer.style.display = 'flex';

      const displayContainer = document.getElementById('display-root');
      if (displayContainer) displayContainer.style.display = 'none';

      const controller = new MasterController(appState, syncBus, audioManager);
      const keepAwakeManager = new KeepAwakeManager();
      keepAwakeManager.init();
      window.__MasterApp = { appState, syncBus, audioManager, controller, keepAwakeManager };
      window.DisplayRenderer = DisplayRenderer;
      window.MediaItem = MediaItem;
      window.Playlist = Playlist;

      const previewContainer = document.getElementById('preview-iframe-wrapper');
      if (previewContainer) {
        const iframe = document.createElement('iframe');
        iframe.src = 'index.html?screen=1&preview=1';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.setAttribute('tabindex', '-1');
        iframe.setAttribute('allow', 'autoplay');
        iframe.onload = () => {
          if (iframe.contentWindow) {
            syncBus.addDisplayTarget(iframe.contentWindow);
            syncBus.broadcastState(appState.getState());
          }
        };
        previewContainer.appendChild(iframe);
      }

      // --- Açılış Bilgilendirme Popup'ı (Splash Modal) ---
      const welcomeModal = document.getElementById('modal-welcome-splash');
      const closeWelcomeBtn = document.getElementById('btn-close-welcome-modal');
      const aboutQuickBtn = document.getElementById('btn-about-quick');
      aboutQuickBtn?.addEventListener('click', () => {
        if (welcomeModal) welcomeModal.style.display = 'flex';
      });
      if (welcomeModal) {
        welcomeModal.style.display = 'flex';
        const closeWelcome = () => {
          welcomeModal.style.display = 'none';
        };
        closeWelcomeBtn?.addEventListener('click', closeWelcome);
        welcomeModal.addEventListener('click', (e) => {
          if (e.target === welcomeModal) closeWelcome();
        });

        // Link tıklamalarını hem Tauri (varsayılan tarayıcı) hem standart web desteğiyle aç
        welcomeModal.querySelectorAll('a[href], .welcome-squircle-box, .welcome-logo-link').forEach((link) => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.dataset.url || link.getAttribute('href');
            if (!url) return;
            if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
              window.__TAURI__.core.invoke('open_external_url', { url }).catch(() => {
                window.open(url, '_blank');
              });
            } else {
              window.open(url, '_blank');
            }
          });
        });
      }

      // ============================================================
      // --- LİSANS YÖNETİMİ & 3 AYLIK BAŞLANGIÇ LİSANSI ---
      // ============================================================
      const licenseManager = {
        info: null,
        modal: document.getElementById('modal-license'),
        badgeText: document.getElementById('badge-license-text'),
        btnQuick: document.getElementById('btn-license-quick'),
        btnOpenFromSettings: document.getElementById('btn-open-license-from-settings'),
        settingsLicBadge: document.getElementById('settings-lic-badge'),
        settingsLicSummary: document.getElementById('settings-lic-summary'),
        btnCloseModal: document.getElementById('btn-close-license-modal'),
        btnCloseFooter: document.getElementById('btn-close-license-footer'),
        displayStatus: document.getElementById('lic-display-status'),
        displayDetail: document.getElementById('lic-display-detail'),
        displayBadge: document.getElementById('lic-display-badge'),
        machineInput: document.getElementById('lic-machine-id-input'),
        btnCopyMid: document.getElementById('btn-copy-machine-id'),
        btnCopyMidText: document.getElementById('btn-copy-machine-id-text'),
        keyInput: document.getElementById('lic-key-input'),
        btnSubmit: document.getElementById('btn-submit-license-key'),
        errorEl: document.getElementById('lic-activation-error'),
        successEl: document.getElementById('lic-activation-success'),

        async init() {
          this.bindEvents();
          await this.checkLicense();
        },

        bindEvents() {
          this.btnQuick?.addEventListener('click', () => this.openModal());
          this.btnOpenFromSettings?.addEventListener('click', () => this.openModal());
          this.btnCloseModal?.addEventListener('click', () => this.closeModal());
          this.btnCloseFooter?.addEventListener('click', () => this.closeModal());
          this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal && this.info?.is_valid) {
              this.closeModal();
            }
          });

          this.btnCopyMid?.addEventListener('click', () => {
            if (!this.machineInput) return;
            navigator.clipboard.writeText(this.machineInput.value).then(() => {
              if (this.btnCopyMidText) this.btnCopyMidText.textContent = 'Kopyalandı!';
              setTimeout(() => {
                if (this.btnCopyMidText) this.btnCopyMidText.textContent = 'Kopyala';
              }, 2000);
            });
          });

          this.btnSubmit?.addEventListener('click', () => this.submitKey());
        },

        async checkLicense() {
          try {
            if (window.__TAURI__?.core?.invoke) {
              this.info = await window.__TAURI__.core.invoke('get_license_info');
            } else {
              this.info = {
                is_valid: true,
                status: 'trial_active',
                machine_id: 'MD-WEB-DEMO-0001',
                days_left: 90,
                expiry_date: '2026-08-04',
                owner: 'Deneme Kullanıcısı',
                license_type: '3 Aylık Başlangıç Denemesi',
                message: '3 Aylık Deneme Sürümü Aktif (90 gün kaldı)'
              };
            }
            this.updateUI();
          } catch (e) {
            console.error('Lisans denetim hatası:', e);
          }
        },

        updateUI() {
          if (!this.info) return;

          if (this.machineInput) {
            this.machineInput.value = this.info.machine_id;
          }

          if (this.badgeText) {
            if (this.info.is_valid) {
              this.badgeText.textContent = `Lisans (${this.info.days_left}g)`;
              this.badgeText.style.color = this.info.days_left <= 7 ? '#f59e0b' : '#10b981';
            } else {
              this.badgeText.textContent = 'Süresi Doldu!';
              this.badgeText.style.color = '#ef4444';
            }
          }

          if (this.displayStatus) {
            this.displayStatus.textContent = this.info.message;
            this.displayStatus.style.color = this.info.is_valid ? '#10b981' : '#ef4444';
          }

          if (this.displayDetail) {
            this.displayDetail.textContent = `Bitiş: ${this.info.expiry_date} • Sahip: ${this.info.owner}`;
          }

          if (this.displayBadge) {
            this.displayBadge.textContent = this.info.is_valid ? 'Aktif' : 'Süresi Doldu';
            this.displayBadge.style.color = this.info.is_valid ? '#10b981' : '#ef4444';
            this.displayBadge.style.background = this.info.is_valid ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
            this.displayBadge.style.borderColor = this.info.is_valid ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
          }

          if (this.settingsLicBadge) {
            this.settingsLicBadge.textContent = this.info.is_valid ? 'Aktif' : 'Süresi Doldu';
            this.settingsLicBadge.style.color = this.info.is_valid ? '#10b981' : '#ef4444';
            this.settingsLicBadge.style.background = this.info.is_valid ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
          }

          if (this.settingsLicSummary) {
            this.settingsLicSummary.textContent = `${this.info.message} • Bitiş: ${this.info.expiry_date} • Cihaz: ${this.info.machine_id}`;
          }

          if (!this.info.is_valid) {
            if (this.btnCloseModal) this.btnCloseModal.style.display = 'none';
            if (this.btnCloseFooter) this.btnCloseFooter.style.display = 'none';
            this.openModal();
          } else {
            if (this.btnCloseModal) this.btnCloseModal.style.display = '';
            if (this.btnCloseFooter) this.btnCloseFooter.style.display = '';
          }
        },

        openModal() {
          if (this.modal) this.modal.style.display = 'flex';
          if (this.errorEl) this.errorEl.style.display = 'none';
          if (this.successEl) this.successEl.style.display = 'none';
        },

        closeModal() {
          if (!this.info?.is_valid) return;
          if (this.modal) this.modal.style.display = 'none';
        },

        async submitKey() {
          const key = this.keyInput?.value?.trim();
          if (!key) {
            if (this.errorEl) {
              this.errorEl.textContent = 'Lütfen bir lisans anahtarı yapıştırın.';
              this.errorEl.style.display = 'block';
            }
            return;
          }

          if (this.btnSubmit) {
            this.btnSubmit.disabled = true;
            this.btnSubmit.textContent = 'Doğrulanıyor...';
          }
          if (this.errorEl) this.errorEl.style.display = 'none';
          if (this.successEl) this.successEl.style.display = 'none';

          try {
            if (window.__TAURI__?.core?.invoke) {
              const res = await window.__TAURI__.core.invoke('activate_license', { licenseKey: key });
              this.info = res;
              if (this.successEl) {
                this.successEl.textContent = `🎉 Tebrikler! ${res.message}`;
                this.successEl.style.display = 'block';
              }
              if (this.keyInput) this.keyInput.value = '';
              this.updateUI();
              setTimeout(() => {
                this.closeModal();
              }, 2500);
            } else {
              throw new Error('Tauri çalışma ortamı bulunamadı');
            }
          } catch (err) {
            if (this.errorEl) {
              this.errorEl.textContent = 'Hata: ' + (err || 'Lisans doğrulanamadı');
              this.errorEl.style.display = 'block';
            }
          } finally {
            if (this.btnSubmit) {
              this.btnSubmit.disabled = false;
              this.btnSubmit.textContent = '🔑 Lisansı Etkinleştir / Uzat';
            }
          }
        }
      };

      licenseManager.init();
    }
  });

})();
