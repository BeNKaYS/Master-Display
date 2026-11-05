/**
 * Tören ve Sahne Sunum Yönetim Uygulaması (Master-Display)
 * Sistem Konfigürasyonu, LED Donanım Sabitleri ve Kısayollar
 */

export const APP_CONFIG = {
  APP_NAME: 'Tören ve Sahne Sunum Yöneticisi',
  VERSION: '1.1.0',
  HARDWARE_TARGET: 'GKGD P2.5 Indoor LED Panel',
  SYNC_CHANNEL_NAME: 'master_display_sync_bus_v1',
  STORAGE_KEY: 'master_display_app_state',
  HEARTBEAT_INTERVAL_MS: 1500,
  HEARTBEAT_TIMEOUT_MS: 4000,
  
  // Desteklenen dosya tipleri
  SUPPORTED_FORMATS: {
    IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    VIDEO: ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'],
    AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a'],
    PRESENTATION: ['.pptx', '.ppt', '.pdf']
  },

  DEFAULT_IMAGE_DURATION_SEC: 8,
  DEFAULT_TRANSITION_MS: 400,

  // GKGD P2.5 LED Panel Popüler Çözünürlük Ön Ayarları (Piksel Boyutları)
  LED_RESOLUTION_PRESETS: {
    '1536x768': { name: 'P2.5 Geniş Sahne (1536 × 768 - 2:1)', width: 1536, height: 768, aspect: '2:1' },
    '1280x768': { name: 'P2.5 Standart LED (1280 × 768 - 5:3)', width: 1280, height: 768, aspect: '5:3' },
    '1920x1080': { name: 'Standart Full HD (1920 × 1080 - 16:9)', width: 1920, height: 1080, aspect: '16:9' },
    '1920x640': { name: 'P2.5 Sahne Arkası Bant (1920 × 640 - 3:1)', width: 1920, height: 640, aspect: '3:1' },
    '1024x512': { name: 'P2.5 Kompakt LED (1024 × 512 - 2:1)', width: 1024, height: 512, aspect: '2:1' },
    '2048x1024': { name: 'P2.5 Dev Sahne (2048 × 1024 - 2:1)', width: 2048, height: 1024, aspect: '2:1' },
    'auto': { name: '🖥️ İkinci Ekranı Otomatik Algıla (Auto-Detect)', width: 0, height: 0, aspect: 'auto' },
    'custom': { name: '⚙️ Özel Çözünürlük (Manuel Giriş)', width: 1536, height: 768, aspect: 'custom' }
  },

  // Ölçeklendirme Seçenekleri (Scaling Modes)
  SCALING_MODES: {
    CONTAIN: { id: 'contain', label: 'Fit (Oranı Koru, Sığdır)', desc: 'Görüntü bozulmaz, gerekirse siyah kenarlık bırakır' },
    COVER: { id: 'cover', label: 'Fill (Oranı Koru, Doldur)', desc: 'Ekranı tamamen doldurur, taşan kısımları kırpar' },
    STRETCH: { id: 'fill', label: 'Stretch (Tam Esnet)', desc: 'Görüntüyü LED panelin tam çözünürlüğüne gerer' }
  },

  // Donanım Hızlandırma ve Yırtılma (Tearing) Önleme Ayarları
  HARDWARE_ACCELERATION: {
    ENABLED: true,
    VSYNC_LOCKED: true,
    COMPOSITING_MODE: 'gpu-accelerated', // will-change, translate3d, webgl
    TARGET_FPS: 60 // 60Hz / 120Hz adaptif
  },

  // Klavye Kısayolları (Operatör İçin)
  SHORTCUTS: {
    PLAY_PAUSE: 'Space',
    STOP: 'KeyS',
    NEXT_ITEM: 'ArrowRight',
    PREV_ITEM: 'ArrowLeft',
    PANIC_BLACKOUT: 'KeyP', // veya Escape
    STAGE_LOCK: 'KeyL',
    FULLSCREEN: 'F11'
  }
};
