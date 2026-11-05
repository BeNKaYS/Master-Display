/**
 * MediaItem - Oynatma Listesindeki Her Bir Medya Elemanı İçin Veri Modeli
 */

export class MediaItem {
  constructor({
    id = null,
    title = 'Yeni Medya',
    type = 'image', // 'image' | 'video' | 'audio' | 'presentation' | 'card'
    src = '',
    fileName = '',
    fileSize = 0,
    duration = 8, // Saniye cinsinden gösterim süresi (0: manuel veya video süresince)
    autoNext = false, // Otomatik sonraki medyaya geçmesin, bitince dursun
    fitMode = 'contain', // 'contain' | 'cover' | 'fill'
    background = {
      enabled: false,
      type: 'color', // 'color' | 'image' | 'video'
      value: '#000000', // hex color veya src
      loop: true
    },
    audioTrack = null, // { src: '', title: '', volume: 1.0, loop: false }
    slides = [], // PPTX / PDF slayt sayfaları (görsel url veya dataurl dizisi)
    activeSlide = 0,
    notes = '',
    fileBlob = null,
    createdAt = Date.now()
  } = {}) {
    this.id = id || `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.title = title;
    this.type = type;
    this.src = src;
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.duration = Number(duration) || 0;
    this.autoNext = Boolean(autoNext);
    this.fitMode = fitMode;
    this.background = background;
    this.audioTrack = audioTrack;
    this.slides = slides;
    this.activeSlide = activeSlide;
    this.notes = notes;
    this.fileBlob = fileBlob;
    this.createdAt = createdAt;
  }

  /**
   * JSON serileştirme (Senkronizasyon ve Kayıt için)
   */
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      src: this.src,
      fileName: this.fileName,
      fileSize: this.fileSize,
      duration: this.duration,
      autoNext: this.autoNext,
      fitMode: this.fitMode,
      background: this.background,
      audioTrack: this.audioTrack,
      slides: this.slides,
      activeSlide: this.activeSlide,
      notes: this.notes,
      createdAt: this.createdAt
    };
  }

  static fromJSON(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    return new MediaItem(json);
  }

  /**
   * Dosya türünü mime type veya uzantıya göre tespit eder
   */
  static detectType(file) {
    if (!file) return 'image';
    const mime = file.type || '';
    const name = (file.name || '').toLowerCase();

    // Sistem / gizli dosyaları yoksay
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
