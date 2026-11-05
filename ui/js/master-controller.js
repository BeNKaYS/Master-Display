/**
 * MasterController - Ceremony & Stage Presentation Manager
 * Sol Panel: Tut-Bırak Akış Listesi, Klasör ve Dosya Ekleme
 * Orta Panel: Büyük Medya Ön Görünüm Sahnesi (Staging / Preview)
 * Sağ Panel: Canlı LED Ekran Önizleme
 */

import { PresentationHandler } from './pptx-handler.js';
import { MediaItem } from './models/MediaItem.js';
import { APP_CONFIG } from './config.js';

/**
 * StorageService - IndexedDB & LocalStorage Kalıcı Medya ve Playlist Deposu
 * Sayfa yenilendiğinde (F5) son yüklenen medya listesini birebir geri yükler.
 */
export class StorageService {
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
    if (!this.db) {
      try {
        const simple = items.map((it, idx) => ({
          id: it.id,
          order: idx,
          title: it.title,
          type: it.type,
          src: (it.src && !it.src.startsWith('blob:')) ? it.src : '',
          duration: it.duration,
          autoNext: it.autoNext,
          notes: it.notes
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

        items.forEach((item, index) => {
          store.put({
            id: item.id || `item_${Date.now()}_${index}`,
            order: index,
            title: item.title,
            type: item.type,
            duration: item.duration,
            autoNext: item.autoNext,
            fitMode: item.fitMode || 'contain',
            notes: item.notes || '',
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
          const rawItems = req.result || [];
          rawItems.sort((a, b) => (a.order || 0) - (b.order || 0));

          const items = rawItems.map(raw => {
            let src = raw.src;
            if (raw.fileBlob) {
              try {
                src = URL.createObjectURL(raw.fileBlob);
              } catch (e) {
                console.error('Blob URL oluşturulamadı:', e);
              }
            }

            return new MediaItem({
              id: raw.id,
              title: raw.title,
              type: raw.type,
              src: src || '',
              duration: raw.duration,
              autoNext: raw.autoNext,
              fitMode: raw.fitMode,
              notes: raw.notes,
              fileBlob: raw.fileBlob || null,
              slides: src ? [src] : []
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
}

/**
 * LayoutSplitterManager - Paneller Arası Tut-Sürükle Boyutlandırıcı
 */
export class LayoutSplitterManager {
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
          toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için üst çubuktaki Kilit düğmesine tıklayın.', 'info');
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
          toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için üst çubuktaki Kilit düğmesine tıklayın.', 'info');
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
          toastFn?.('🔒 Panel ayraçları kilitli. Kilidi açmak için üst çubuktaki Kilit düğmesine tıklayın.', 'info');
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

export class MasterController {
  constructor(appState, syncBus, audioManager) {
    this.appState = appState;
    this.syncBus = syncBus;
    this.audioManager = audioManager;

    this.fadeSpeed = 400;
    this.selectedItemIndex = 0; // Sol listede seçili (Ön Görünümde olan) öğe
    this.draggedIndex = null;
    this.previewLoopSrc = null;
    this.previewLoopEnabled = false;

    this.storageService = new StorageService();
    this.layoutSplitter = new LayoutSplitterManager();
    this._bindDomElements();
    this._initEvents();
    this._initKeyboardShortcuts();

    // State dinle
    this.appState.subscribe(state => this.updateUI(state));

    // Kalıcı çalma listesini yükle (Son yüklenen liste neyse o gelir, mock veriler gelmez)
    this.initPlaylist();
    this.updateUI(this.appState.getState());
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

    // [2] Akış Listesi & Klasör / Dosya Ekleme
    this.playlistDbContainer = document.getElementById('playlist-db-container');
    this.btnAddFolder = document.getElementById('btn-add-folder');
    this.btnAddFiles = document.getElementById('btn-add-files');
    this.folderInput = document.getElementById('folder-input');
    this.fileInput = document.getElementById('file-input');
    this.btnDeleteItem = document.getElementById('btn-delete-item');
    this.btnClearAll = document.getElementById('btn-clear-all');
    this.playlistCountLabel = document.getElementById('playlist-count-label');

    // [3] Medya Ön Görünüm Sahnesi (Staging Area)
    this.mediaPreviewArea = document.getElementById('media-flow-list');
    this.previewModeBadge = document.getElementById('preview-mode-badge');

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
    this.previewLoopGrayscale = false;

    // [7] Geçiş (Fade)
    this.sliderFadeSpeed = document.getElementById('slider-fade-speed');
    this.fadeSpeedDisplay = document.getElementById('fade-speed-display');
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

    // Üst Bar YAYINLA Butonu
    this.btnBroadcastLive?.addEventListener('click', () => {
      this.publishSelectedItem();
    });

    // Klasör Ekleme
    this.btnAddFolder?.addEventListener('click', () => this.folderInput?.click());
    this.folderInput?.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        this.handleUploadedFiles(e.target.files);
        e.target.value = '';
      }
    });

    // Dosya Ekleme
    this.btnAddFiles?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        this.handleUploadedFiles(e.target.files);
        e.target.value = '';
      }
    });

    // Dışarıdan (Windows Explorer / Masaüstü) Medya Sürükleyip Bırakma
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
        dropTarget.addEventListener(name, (e) => {
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
        const row = e.target.closest('.playlist-row');
        if (!row) return;
        const idx = parseInt(row.dataset.index, 10);
        if (isNaN(idx)) return;

        // Kullanıcı Kuralı: Akıştan herhangi bir öğeye tıklandığında var olan akış (video/ses) kesinlikle durdurulur!
        const state = this.appState.getState();
        if (state.playbackState !== 'stopped') {
          this.appState.stop();
        }

        // Tıklanan öğeyi seç ve derhal yayına al (LED ekrana yansıt)
        this.selectedItemIndex = idx;
        this.publishSelectedItem();
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
      const state = this.appState.getState();
      const liveIndex = (state.playbackState !== 'stopped' && state.liveItem) ? state.playlist.currentIndex : -1;
      const isSelectedDifferentFromLive = (this.selectedItemIndex >= 0 && this.selectedItemIndex !== liveIndex);

      // Eğer Ön Görünümde seçilen öğe, canlıdaki öğeden farklıysa -> Doğrudan YAYINA AL!
      if (isSelectedDifferentFromLive) {
        this.publishSelectedItem();
        return;
      }

      // Aynı öğe canlıdaysa:
      if (state.playbackState === 'playing') {
        const liveItem = state.liveItem;
        // Video veya ses ise duraklat
        if (liveItem && (liveItem.type === 'video' || liveItem.type === 'audio')) {
          this.appState.pause();
        } else {
          // Resim/sunu ise yayını tazele / yayında tut
          this.publishSelectedItem();
        }
      } else if (state.playbackState === 'paused') {
        this.appState.resume();
      } else {
        this.publishSelectedItem();
      }
    });

    this.btnNext?.addEventListener('click', () => {
      this.appState.playNext();
      this.selectedItemIndex = this.appState.getState().playlist.currentIndex;
      this.renderPlaylistDb();
      this.renderMediaPreview();
      this.updateUI(this.appState.getState());
    });

    this.btnPrev?.addEventListener('click', () => {
      this.appState.playPrev();
      this.selectedItemIndex = this.appState.getState().playlist.currentIndex;
      this.renderPlaylistDb();
      this.renderMediaPreview();
      this.updateUI(this.appState.getState());
    });

    this.btnStop?.addEventListener('click', () => {
      // 1. Durum motorunda oynatmayı tamamen sıfırla
      this.appState.stop();

      // 2. Ekranlara ve önizleme pencerelerine acil durdurma emri gönder
      this.syncBus.broadcastCommand('CMD_STOP');
      this.syncBus.broadcastState(this.appState.getState());

      // 3. Tüm sesleri ve arkaplan loop videolarını derhal sustur
      this.audioManager?.stopAllAudio();
      this.previewLoopEnabled = false;
      this.previewLoopSrc = null;
      if (this.loopThumbsContainer) {
        this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
      }
      this._updateLoopButtonUi();

      // 4. Orta panel önizlemesindeki video oynatıcısını da kesin olarak durdur
      const prevVideo = this.mediaPreviewArea?.querySelector('video');
      if (prevVideo) {
        try {
          prevVideo.pause();
          prevVideo.currentTime = 0;
        } catch (e) {}
      }

      // 5. Iframe önizlemesini doğrudan durdur
      try {
        const iframe = this.previewIframeWrapper?.querySelector('iframe');
        if (iframe?.contentWindow?.__DisplayRendererInstance) {
          iframe.contentWindow.__DisplayRendererInstance.stopAll();
        }
      } catch (e) {}

      // 6. Global örnekler varsa doğrudan durdur
      window.__DisplayRendererInstance?.stopAll();
      window.__AudioManagerInstance?.stopAllAudio();

      // 7. Arayüzü güncelle
      this.renderPlaylistDb();
      this.renderMediaPreview();
      this.updateUI(this.appState.getState());
    });

    // İnteraktif İleri-Geri Sarma (Scrubber) Olayları
    if (this.scrubberSlider) {
      let scrubRaf = null;
      const handleScrubInput = (immediate = false) => {
        const percent = parseFloat(this.scrubberSlider.value) || 0;
        if (this.scrubberFill) this.scrubberFill.style.width = `${percent}%`;

        const totalSec = (this.appState.getState().duration || 0) / 1000;
        const curSec = Math.round((percent / 100) * totalSec);
        if (this.scrubberCurTime) this.scrubberCurTime.textContent = this._fmt(curSec);

        const targetTime = (percent / 100) * totalSec;
        if (immediate) {
          if (scrubRaf) cancelAnimationFrame(scrubRaf);
          this.appState.seekTo(targetTime);
        } else {
          if (scrubRaf) cancelAnimationFrame(scrubRaf);
          scrubRaf = requestAnimationFrame(() => {
            this.appState.seekTo(targetTime);
            scrubRaf = null;
          });
        }
      };

      this.scrubberSlider.addEventListener('pointerdown', () => {
        this.isScrubbing = true;
      });

      this.scrubberSlider.addEventListener('input', () => {
        handleScrubInput(false);
      });

      this.scrubberSlider.addEventListener('change', () => {
        handleScrubInput(true);
        this.isScrubbing = false;
      });

      window.addEventListener('pointerup', () => {
        if (this.isScrubbing) {
          handleScrubInput(true);
          this.isScrubbing = false;
        }
      });
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

    // Loop Video ve Transparanlık Yöneticisi Başlat
    this._initLoopVideos();

    // Tören Ayarları Modalı Başlat
    this._initSettingsModal();

    // Geçiş Hızı ve Fade Butonları
    this.sliderFadeSpeed?.addEventListener('input', (e) => {
      this.fadeSpeed = parseInt(e.target.value, 10);
      if (this.fadeSpeedDisplay) this.fadeSpeedDisplay.textContent = `${this.fadeSpeed} ms`;
    });

    this.btnFadeBlack?.addEventListener('click', () => {
      this.appState.toggleBlackout();
    });

    this.btnFadeCut?.addEventListener('click', () => {
      this.publishSelectedItem();
    });

    this.btnFadeCross?.addEventListener('click', () => {
      this.publishSelectedItem();
    });
  }

  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
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
      } else if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.btnStop?.click();
      }
    });
  }

  /**
   * Ön görünümdeki seçili öğeyi CANLI LED EKRANA AKTAR
   */
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
   * [2] SOL PANEL: TUT-BIRAK (DRAG & DROP) DESTEKLİ AKIŞ LİSTESİ
   * - Tek Tık: Orta panelde ÖN GÖRÜNÜM (Yayınlamaz!)
   * - Çift Tık: Doğrudan CANLI YAYINLA
   * - Tut-Bırak: Sıralamayı anında düzenler
   */
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
          Liste boş.<br>Yukarıdaki <strong>"📁 Klasör Ekle"</strong> veya <strong>"➕ Dosya Ekle"</strong> butonlarını kullanarak medyalarınızı yükleyin.
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

      // İkonlar
      let typeIcon = '📄';
      if (item.type === 'video') typeIcon = '🎥';
      else if (item.type === 'image') typeIcon = '🖼️';
      else if (item.type === 'audio') typeIcon = '🎵';
      else if (item.type === 'presentation') typeIcon = '📊';

      let statusBadge = '';
      if (isLive) statusBadge = `<span class="status-live-text">● CANLI</span>`;
      else if (isPreview) statusBadge = `<span class="status-preview-text">👁️ ÖN GÖRÜNÜM</span>`;

      return `
        <div class="${rowClass}" data-index="${index}" draggable="false" title="Tek tık: Ön Görünüm • Çift tık: Yayına Ver • Tutamaçtan Sürükle: Sırala">
          <div class="playlist-row-left">
            <span class="drag-handle" title="Sıralamak için buradan tutup sürükleyin">⋮⋮</span>
            <span style="font-size:12px;">${typeIcon}</span>
            <span class="playlist-name">#${index + 1} ${item.title}</span>
          </div>
          <div class="playlist-row-icons">
            <span class="playlist-status-badge">${statusBadge}</span>
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
        if (isLive) {
          badge.innerHTML = `<span class="status-live-text">● CANLI</span>`;
        } else if (isPreview) {
          badge.innerHTML = `<span class="status-preview-text">👁️ ÖN GÖRÜNÜM</span>`;
        } else {
          badge.innerHTML = '';
        }
      }
    });
  }

  /**
   * Tut-Bırak (Drag & Drop) Sıralama Olayları
   * Yalnızca .drag-handle üzerine fare geldiğinde taşımaya izin verir
   */
  _bindPlaylistDragEvents() {
    const rows = this.playlistDbContainer.querySelectorAll('.playlist-row');

    rows.forEach(row => {
      const handle = row.querySelector('.drag-handle');
      if (handle) {
        handle.addEventListener('mouseenter', () => {
          row.setAttribute('draggable', 'true');
        });
        handle.addEventListener('mouseleave', () => {
          if (!row.classList.contains('dragging')) {
            row.setAttribute('draggable', 'false');
          }
        });
        handle.addEventListener('pointerdown', () => {
          row.setAttribute('draggable', 'true');
        });
      }

      row.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.drag-handle')) {
          row.setAttribute('draggable', 'false');
        }
      });

      row.addEventListener('dragstart', (e) => {
        if (row.getAttribute('draggable') !== 'true') {
          e.preventDefault();
          return false;
        }
        this.draggedIndex = parseInt(row.dataset.index, 10);
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(this.draggedIndex)); } catch(err) {}
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        row.setAttribute('draggable', 'false');
        this.draggedIndex = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        row.setAttribute('draggable', 'false');
        const targetIndex = parseInt(row.dataset.index, 10);

        if (this.draggedIndex !== null && this.draggedIndex !== targetIndex) {
          this.appState.state.playlist.moveItem(this.draggedIndex, targetIndex);
          // Seçili öğe indeksini koru
          if (this.selectedItemIndex === this.draggedIndex) {
            this.selectedItemIndex = targetIndex;
          }
          this.renderPlaylistDb();
          this.renderMediaPreview();
          this.saveCurrentPlaylist();
        }
      });
    });
  }

  /**
   * [3] ORTA PANEL: MEDYA ÖN GÖRÜNÜM ALANI (PREVIEW & STAGING SAHNESİ)
   * Liste değildir! Sol tarafta seçili olan medyanın büyük, net ön görünümünü gösterir.
   */
  renderMediaPreview() {
    const playlist = this.appState.getState().playlist;
    const currentItem = playlist.getItem(this.selectedItemIndex);

    if (!currentItem) {
      this.mediaPreviewArea.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-dim); gap:8px;">
          <span style="font-size:36px; opacity:0.4;">👁️</span>
          <span>Ön görünüm için sol taraftaki akış listesinden bir medya seçin</span>
        </div>
      `;
      return;
    }

    const isLive = (this.selectedItemIndex === playlist.currentIndex && this.appState.getState().playbackState === 'playing');

    let previewContentHtml = '';
    if (currentItem.type === 'video') {
      previewContentHtml = `
        <video id="pv-video-el" src="${currentItem.src}" playsinline style="width:100%; height:100%; object-fit:contain;"></video>
      `;
    } else if (currentItem.type === 'presentation') {
      const activeSlideUrl = (currentItem.slides && currentItem.slides.length > 0)
        ? currentItem.slides[currentItem.activeSlide || 0]
        : currentItem.src;
      previewContentHtml = `
        <img src="${activeSlideUrl}" alt="${currentItem.title}" style="width:100%; height:100%; object-fit:contain;">
        <div style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.8); color:#fff; padding:4px 10px; border-radius:12px; font-size:11px;">
          Slayt: ${(currentItem.activeSlide || 0) + 1} / ${currentItem.slides?.length || 1}
        </div>
      `;
    } else if (currentItem.type === 'audio') {
      // Ses dosyalarında asla dosya adı veya yabancı linkler ekrana yansıtılmaz!
      // Tören ayarlarındaki tören resmi veya loop video gösterilir.
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
        const loopSrcToPreview = this.previewLoopSrc || currentBg.src || 'loop/16871-276488572_medium.mp4';
        visualHtml = `
          <video src="${loopSrcToPreview}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
        `;
      } else if (mode === 'blackout') {
        visualHtml = `<div style="background:#000000; width:100%; height:100%;"></div>`;
      } else {
        visualHtml = `
          <img src="${visualSrc}" alt="Tören Sahnesi" style="width:100%; height:100%; object-fit:contain;">
        `;
      }

      previewContentHtml = `
        <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden;">
          ${visualHtml}
        </div>
      `;
    } else {
      previewContentHtml = `
        <img src="${currentItem.src}" alt="${currentItem.title}" style="width:100%; height:100%; object-fit:contain;">
      `;
    }

    const currentBg = this.appState.getState().globalBackground;
    const opSlider = this.sliderLoopOpacity;
    const curOpacity = opSlider ? (parseInt(opSlider.value, 10) / 100) : (currentBg.opacity !== undefined ? currentBg.opacity : 0.35);
    const loopSrcToPreview = this.previewLoopSrc || (currentBg.enabled ? currentBg.src : null);
    const shouldShowPreviewLoop = Boolean(loopSrcToPreview && (this.previewLoopEnabled === true || (currentBg && currentBg.enabled)));

    let loopOverlayHtml = '';
    if (currentItem.type !== 'audio' && shouldShowPreviewLoop && (curOpacity > 0)) {
      loopOverlayHtml = `
        <video src="${loopSrcToPreview}" autoplay loop muted playsinline style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; pointer-events:none; z-index:5; opacity:${curOpacity};"></video>
      `;
    }

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
      <!-- Büyük 16:9 Ön Görünüm Ekranı (Sadece div[1]) -->
      <div class="staging-monitor-wrapper">
        <div class="staging-monitor-content" style="position:relative; width:100%; height:100%; overflow:hidden;">
          <div style="position:relative; width:100%; height:100%; z-index:1;">
            ${previewContentHtml}
          </div>
          ${loopOverlayHtml}
        </div>
      </div>
      ${bottomControlsHtml}
    `;
  }

  /**
   * Durum Güncellemeleri
   */
  updateUI(state) {
    const isPlaying = (state.playbackState === 'playing');
    const liveIndex = (state.playbackState !== 'stopped' && state.liveItem) ? state.playlist.currentIndex : -1;
    const isSelectedDifferentFromLive = (this.selectedItemIndex >= 0 && this.selectedItemIndex !== liveIndex);
    const liveItem = state.liveItem;
    const isMediaWithTimeline = liveItem && (liveItem.type === 'video' || liveItem.type === 'audio');

    if (this.btnPlayPause) {
      if (isSelectedDifferentFromLive) {
        // Ön görünümde yeni bir medya seçildi -> Doğrudan canlıya aktarmaya hazır
        this.btnPlayPause.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>YAYINA AL</span>`;
        this.btnPlayPause.classList.remove('is-playing');
        this.btnPlayPause.title = 'Ön görünümdeki seçili medyayı doğrudan canlı LED ekrana aktar';
      } else if (isPlaying) {
        if (isMediaWithTimeline) {
          this.btnPlayPause.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>DURAKLAT</span>`;
          this.btnPlayPause.classList.add('is-playing');
          this.btnPlayPause.title = 'Canlıdaki videoyu / sesi duraklat';
        } else {
          // Canlıda Resim veya Sunu
          this.btnPlayPause.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="7"></circle></svg><span>YAYINDA</span>`;
          this.btnPlayPause.classList.add('is-playing');
          this.btnPlayPause.title = 'Görsel canlı yayında gösteriliyor';
        }
      } else if (state.playbackState === 'paused') {
        this.btnPlayPause.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>DEVAM ET</span>`;
        this.btnPlayPause.classList.remove('is-playing');
        this.btnPlayPause.title = 'Duraklatılan videoyu / sesi devam ettir';
      } else {
        this.btnPlayPause.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>OYNAT</span>`;
        this.btnPlayPause.classList.remove('is-playing');
        this.btnPlayPause.title = 'Medyayı canlı yayında oynat';
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
        if (this.playbackTimer) this.playbackTimer.textContent = `📊 Slayt ${curSlide} / ${totSlides} (Manuel)`;
        if (this.scrubberCurTime && !this.isScrubbing) this.scrubberCurTime.textContent = `Slayt ${curSlide}`;
        if (this.scrubberTotalTime) this.scrubberTotalTime.textContent = `${totSlides} Slayt`;
        if (this.playbackProgressBar) this.playbackProgressBar.style.width = `${pct}%`;
        if (!this.isScrubbing) {
          if (this.scrubberSlider) this.scrubberSlider.value = pct;
          if (this.scrubberFill) this.scrubberFill.style.width = `${pct}%`;
        }
      } else {
        // Görsel (Resim): Süre saymaz, operatör değiştirene kadar ekranda kalır
        if (this.playbackTimer) this.playbackTimer.textContent = '🖼️ CANLI (Süresiz / Manuel)';
        if (this.scrubberCurTime && !this.isScrubbing) this.scrubberCurTime.textContent = 'CANLI';
        if (this.scrubberTotalTime) this.scrubberTotalTime.textContent = 'SÜRESİZ';
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

    // DOM'u silip baştan oluşturma; sadece aktif satır stilini güncelle (tıklamayı engellememek için)
    this._updatePlaylistRowStyles();
    this._updateLoopButtonUi();
  }

  _fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Kalıcı Tören Akışını Yükle (IndexedDB üzerinden son kaydedilen listeyi çeker)
   */
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
  }

  /**
   * Mevcut Akış Listesini Kalıcı Olarak Kaydet
   */
  async saveCurrentPlaylist() {
    try {
      const items = this.appState.getState().playlist.items;
      await this.storageService.savePlaylist(items);
    } catch (e) {
      console.warn('Playlist kaydetme hatası:', e);
    }
  }

  /**
   * Loop Video ve Transparanlık Yöneticisi
   * "C:\Users\serca\Desktop\DeVWin_Folder\Master-Display\loop" klasöründeki videoları yönetir
   */
  _initLoopVideos() {
    this.loopVideos = [
      { id: 'flag1', name: '🇹🇷 Türk Bayrağı (Dalgalanan - Varsayılan)', src: 'loop/16871-276488572_medium.mp4' },
      { id: 'flag2', name: '🇹🇷 Türk Bayrağı 2 (Göklerde Dalgalanan)', src: 'loop/14320-685293368_medium.mp4' },
      { id: 'flag3', name: '🇹🇷 Türk Bayrağı 3 (Işıltılı Bayrak)', src: 'loop/82427-578641022_medium.mp4' },
      { id: 'flag4', name: '🇹🇷 Tören & Sahne Bayrak Loop', src: 'loop/gemini_generated_video_280bd631.mp4' },
      { id: 'loop1', name: 'Loop 1 (Işık Parıltısı)', src: 'loop/12716-241674181_medium.mp4' },
      { id: 'loop2', name: 'Loop 2 (Mavi Hüzme)', src: 'loop/138556-769988117_medium.mp4' },
      { id: 'loop3', name: 'Loop 3 (Dinamik Dalga)', src: 'loop/138558-770009759_medium.mp4' },
      { id: 'loop4', name: 'Loop 4 (Soyut Akış)', src: 'loop/161561-823944363_medium.mp4' },
      { id: 'loop5', name: 'Loop 5 (Parçacık Yağmuru)', src: 'loop/185365-875417518_medium.mp4' },
      { id: 'loop6', name: 'Loop 6 (Nebula Atmosfer)', src: 'loop/185366-875417525_medium.mp4' },
      { id: 'loop7', name: 'Loop 7 (Tören Teması)', src: 'loop/43027-434334088_medium.mp4' },
      { id: 'loop8', name: 'Loop 8 (Derinlik Tüneli)', src: 'loop/4968-181688475_medium.mp4' },
      { id: 'loop9', name: 'Loop 9 (Işık Süzmesi)', src: 'loop/5192-183786490_medium.mp4' },
      { id: 'loop10', name: 'Loop 10 (Sahne Görkemi)', src: 'loop/71122-537102350_medium.mp4' }
    ];

    // Dropdown listesini doldur
    if (this.loopVideoSelect) {
      this.loopVideoSelect.innerHTML = this.loopVideos.map((lv) => `
        <option value="${lv.src}">${lv.name}</option>
      `).join('');

      this.loopVideoSelect.addEventListener('change', (e) => {
        this.selectLoopVideo(e.target.value, true, false);
      });
    }

    // Küçük önizleme kartlarını oluştur
    if (this.loopThumbsContainer) {
      this.loopThumbsContainer.innerHTML = this.loopVideos.map((lv, idx) => {
        const isFlag = lv.id.startsWith('flag');
        const badgeText = isFlag ? '🇹🇷 Bayrak' : `#${idx + 1} Loop`;
        return `
          <div class="loop-card-thumb" data-src="${lv.src}" title="${lv.name}">
            <video src="${lv.src}" muted preload="metadata" playsinline></video>
            <span class="loop-card-label" style="${isFlag ? 'background:rgba(197,48,48,0.85); color:#fff; font-weight:700;' : ''}">${badgeText}</span>
          </div>
        `;
      }).join('');

      const cards = this.loopThumbsContainer.querySelectorAll('.loop-card-thumb');
      cards.forEach(card => {
        card.addEventListener('click', () => {
          const src = card.dataset.src;
          this.selectLoopVideo(src, true, false);
        });
      });
    }

    // Transparanlık / Opaklık Slider Ayarı (%0 - %100)
    const opSlider = this.sliderLoopOpacity;
    if (opSlider) {
      opSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const opacity = isNaN(val) ? 1.0 : (val / 100);
        if (this.opacityValDisplay) this.opacityValDisplay.textContent = `%${val}`;
        this.appState.setLoopOpacity(opacity);
        this.renderMediaPreview();
      });

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
      this.btnLoopBw.addEventListener('click', () => {
        this.previewLoopGrayscale = !this.previewLoopGrayscale;
        const curBg = this.appState.getState().globalBackground || {};
        if (curBg.enabled) {
          this.appState.setGlobalBackground({ grayscale: this.previewLoopGrayscale });
        }
        this.btnLoopBw.classList.toggle('is-active', this.previewLoopGrayscale);
        const overlay = this.mediaPreviewArea ? this.mediaPreviewArea.querySelector('[data-loop-overlay]') : null;
        if (overlay) {
          overlay.style.filter = this.previewLoopGrayscale ? 'grayscale(100%) contrast(106%)' : 'none';
        }
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
          // Canlıda aktif olan bu videoyu kapat
          this.appState.setGlobalBackground({ enabled: false });
          this.previewLoopEnabled = false;
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
            opacity: isNaN(opacity) ? 0.35 : opacity
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
        this.appState.setGlobalBackground({ enabled: false });
        if (this.loopThumbsContainer) {
          this.loopThumbsContainer.querySelectorAll('.loop-card-thumb').forEach(c => c.classList.remove('active-loop'));
        }
        if (this.loopVideoSelect) {
          this.loopVideoSelect.selectedIndex = -1;
        }
        this._updateLoopButtonUi();
        this.renderMediaPreview();
      });
    }

    // Başlangıçta loop video kapalı başlar; kullanıcı tıklayana kadar ön görünüm ve canlı temizdir
    this.previewLoopSrc = null;
    this.previewLoopEnabled = false;
    this._updateLoopButtonUi();
  }

  _updateLoopButtonUi() {
    if (!this.btnCheckLoop) return;
    const currentBg = this.appState.getState().globalBackground;
    const isLiveActive = Boolean(currentBg && currentBg.enabled);
    const isLiveSameSrc = (currentBg && currentBg.src === this.previewLoopSrc);

    if (isLiveActive && isLiveSameSrc) {
      this.btnCheckLoop.dataset.state = 'live';
      this.btnCheckLoop.textContent = '✓';
      this.btnCheckLoop.title = 'Loop video şu an canlı yayında aktif. Kapatmak için tıklayın.';
    } else if (this.previewLoopEnabled && this.previewLoopSrc && (!isLiveActive || !isLiveSameSrc)) {
      this.btnCheckLoop.dataset.state = 'preview';
      this.btnCheckLoop.textContent = '✓';
      this.btnCheckLoop.title = 'Seçilen loop videoyu canlı yayına aktarmak için onaylayın (Canlıya Ver)';
    } else {
      this.btnCheckLoop.dataset.state = 'off';
      this.btnCheckLoop.textContent = '✕';
      this.btnCheckLoop.title = 'Loop video kapalı. Açmak için tıklayın.';
    }
  }

  selectLoopVideo(src, commitToLive = false) {
    this.previewLoopSrc = src;
    this.previewLoopEnabled = true;

    if (this.loopVideoSelect) this.loopVideoSelect.value = src;

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
  }

  /**
   * Klasörden veya Dosya Seçiciden Gelen Medyaları İşle ve Akışa Ekle
   */
  async handleUploadedFiles(files) {
    if (!files || files.length === 0) return;

    let count = 0;
    // Dosya adına göre sıralı ekleme
    const fileList = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const file of fileList) {
      try {
        const item = await PresentationHandler.processFile(file);
        if (item) {
          this.appState.state.playlist.addItem(item);
          count++;
        }
      } catch (err) {
        console.error('Dosya ekleme hatası:', err, file.name);
      }
    }

    if (count > 0) {
      if (this.selectedItemIndex === null || this.selectedItemIndex === undefined || this.selectedItemIndex < 0) {
        this.selectedItemIndex = 0;
      }
      this.renderPlaylistDb();
      this.renderMediaPreview();
      await this.saveCurrentPlaylist();
    }
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

      if (this.modalCeremonySettings) this.modalCeremonySettings.style.display = 'flex';
    };

    const closeModal = () => {
      if (this.modalCeremonySettings) this.modalCeremonySettings.style.display = 'none';
    };

    this.btnSettingsQuick?.addEventListener('click', openModal);
    this.menuSettings?.addEventListener('click', openModal);
    this.btnCloseSettingsModal?.addEventListener('click', closeModal);
    this.btnCancelSettings?.addEventListener('click', closeModal);

    // Dışarı tıklayınca kapat
    this.modalCeremonySettings?.addEventListener('click', (e) => {
      if (e.target === this.modalCeremonySettings) closeModal();
    });

    // 1. Varsayılan Tören Resmi Yükleme
    this.btnUploadCeremonyPoster?.addEventListener('click', () => {
      this.ceremonyPosterFileInput?.click();
    });

    this.ceremonyPosterFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
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

    // 2. Ses / Müzik İçin Özel Resim Yükleme
    this.btnUploadAudioPoster?.addEventListener('click', () => {
      this.audioPosterFileInput?.click();
    });

    this.audioPosterFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
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

    // Ses Ekran Modu Kartları
    const radioCards = this.modalCeremonySettings?.querySelectorAll('.audio-mode-card');
    radioCards?.forEach(card => {
      card.addEventListener('click', () => {
        radioCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        tempSettings.audioScreenMode = card.dataset.mode;
      });
    });

    // Kaydet ve Uygula
    this.btnSaveCeremonySettings?.addEventListener('click', () => {
      if (this.chkAutoDefaultPoster) {
        tempSettings.autoDefaultPosterOnIdle = this.chkAutoDefaultPoster.checked;
      }
      this.appState.setCeremonySettings(tempSettings);
      closeModal();
      this.renderMediaPreview();
    });
  }
}
