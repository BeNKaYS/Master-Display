/**
 * State Engine - Single Source of Truth
 * Uygulamanın anlık durumu, oynatma makinesi, LED donanım çözünürlük
 * ve kayan yazı (Marquee) yöneticisi
 */

import { Playlist } from './models/Playlist.js';
import { APP_CONFIG } from './config.js';

export class AppState {
  constructor() {
    this.listeners = new Set();

    this.state = {
      role: 'master', // 'master' | 'display' | 'preview'
      playbackState: 'stopped', // 'stopped' | 'playing' | 'paused'
      
      // Oynatma listesi
      playlist: new Playlist(),

      // Canlı oynatılan anlık medya verisi
      liveItem: null,
      
      // Zamanlayıcı (Timestamp tabanlı)
      duration: 0,
      remaining: 0,
      endAt: 0,

      // Sahne Güvenliği ve Kilit Modları
      stageLock: true,
      blackout: false,
      blankScreen: false,

      // GKGD P2.5 LED Panel Çözünürlük ve Ölçekleme Konfigürasyonu
      ledConfig: {
        preset: '1536x768',
        width: 1536,
        height: 768,
        scaleMode: 'contain', // 'contain' (Fit) | 'cover' (Fill) | 'fill' (Stretch)
        autoDetect: false,
        detectedWidth: 0,
        detectedHeight: 0,
        dpr: 1.0,
        hardwareAccelerated: true
      },

      // LED Alt Kayan Yazı / Tören Altyazı Bandı (Marquee Ticker)
      marquee: {
        enabled: false,
        text: 'TÖRENİMİZE HOŞ GELDİNİZ • 2026-2027 EĞİTİM ÖĞRETİM YILI',
        speed: 15, // animasyon süresi saniye cinsinden
        fontSize: 28,
        textColor: '#ffffff',
        bgColor: 'rgba(0, 0, 0, 0.85)'
      },

      // Global Arka Plan Katmanı (Varsayılan Türk Bayrağı Video Loop - Başlangıçta Kapalı, %35 Opaklık)
      globalBackground: {
        enabled: false,
        type: 'video',
        src: 'loop/16871-276488572_medium.mp4',
        loop: true,
        opacity: 0.35
      },

      // Ses Mikseri & Fon Müziği
      audio: {
        masterVolume: 1.0,
        mediaVolume: 1.0,
        bgMusicVolume: 0.7,
        bgMusicPlaying: false,
        bgMusicTrack: null
      },

      // 2. Ekran Canlılık ve Donanım Bilgisi (Display Heartbeat)
      displayConnected: false,
      lastHeartbeat: 0,
      displayHardwareInfo: null, // { width, height, availWidth, availHeight, dpr }

      // Tören ve Sahne Ayarları (Ses çalarken ekranda ne gösterilecek vb.)
      ceremonySettings: this._loadCeremonySettings(),

      // Revizyon sayacı
      rev: 0
    };

    // Zamanlayıcı RAF referansı
    this._rafId = null;
    this._startTicker();
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
          autoDefaultPosterOnIdle: parsed.autoDefaultPosterOnIdle !== false
        };
      }
    } catch(e) {}
    return {
      defaultPosterSrc: '',
      defaultPosterTitle: 'Varsayılan Tören Sahnesi',
      audioPosterSrc: '',
      audioPosterTitle: 'Ses ve Müzik Resmi',
      audioScreenMode: 'audio_poster',
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
    } catch(e) {}
    this.setState({ ceremonySettings: updated });
  }

  setState(partialState, notify = true) {
    this.state = {
      ...this.state,
      ...partialState,
      rev: this.state.rev + 1
    };

    if (notify) {
      this._notifyListeners();
    }
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('State listener error:', err);
      }
    }
  }

  /**
   * Timestamp Tabanlı Sayaç Motoru (Hafifletilmiş Throttled Loop)
   * Saniyede 60 kez DOM ve disk I/O tetiklenmesini önler; 250ms (4 FPS) akış sağlar.
   */
  _startTicker() {
    let lastTickNotify = 0;
    const tick = () => {
      if (this.state.playbackState === 'playing' && this.state.endAt > 0) {
        const now = Date.now();
        const remaining = Math.max(0, this.state.endAt - now);

        if (remaining === 0) {
          this.state.remaining = 0;
          this.handleItemTimeUp();
        } else if (now - lastTickNotify >= 250) {
          this.state.remaining = remaining;
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

  // --- LED Çözünürlük ve Ölçekleme Fonksiyonları ---

  setLedResolution(presetKey, customW = null, customH = null) {
    const presets = APP_CONFIG.LED_RESOLUTION_PRESETS;
    let width = this.state.ledConfig.width;
    let height = this.state.ledConfig.height;

    if (presetKey === 'auto') {
      if (this.state.displayHardwareInfo) {
        width = this.state.displayHardwareInfo.availWidth || this.state.displayHardwareInfo.width || 1920;
        height = this.state.displayHardwareInfo.availHeight || this.state.displayHardwareInfo.height || 1080;
      }
    } else if (presetKey === 'custom' && customW && customH) {
      width = parseInt(customW, 10);
      height = parseInt(customH, 10);
    } else if (presets[presetKey]) {
      width = presets[presetKey].width;
      height = presets[presetKey].height;
    }

    this.setState({
      ledConfig: {
        ...this.state.ledConfig,
        preset: presetKey,
        width,
        height
      }
    });
  }

  setLedScaleMode(scaleMode) {
    this.setState({
      ledConfig: {
        ...this.state.ledConfig,
        scaleMode
      }
    });
  }

  setMarqueeConfig(marqueePartial) {
    this.setState({
      marquee: {
        ...this.state.marquee,
        ...marqueePartial
      }
    });
  }

  toggleMarquee() {
    this.setState({
      marquee: {
        ...this.state.marquee,
        enabled: !this.state.marquee.enabled
      }
    });
  }

  // --- Oynatma Kontrol Fonksiyonları ---

  play(index = null) {
    if (index !== null) {
      this.state.playlist.setCurrentIndex(index);
    } else if (this.state.playlist.currentIndex === -1 && this.state.playlist.items.length > 0) {
      this.state.playlist.setCurrentIndex(0);
    }

    const currentItem = this.state.playlist.getCurrentItem();
    if (!currentItem) {
      this.setState({ playbackState: 'stopped', liveItem: null, remaining: 0, endAt: 0 });
      return false;
    }

    // Akıllı Medya Süre Algılama: Sadece video ve ses zaman kısıtlıdır; resim ve sunular süresizdir (manuel kalır)
    const isTimeBounded = (currentItem.type === 'video' || currentItem.type === 'audio') && (currentItem.duration > 0);
    const durationMs = isTimeBounded ? ((currentItem.duration || 0) * 1000) : 0;
    const now = Date.now();

    this.setState({
      stageLock: false,
      blackout: false,
      playbackState: 'playing',
      liveItem: currentItem.toJSON ? currentItem.toJSON() : currentItem,
      duration: durationMs,
      remaining: durationMs,
      endAt: durationMs > 0 ? now + durationMs : 0,
      seekRequest: null,
      playRequestId: now
    });

    return true;
  }

  pause() {
    if (this.state.playbackState !== 'playing') return;
    const now = Date.now();
    const remaining = Math.max(0, this.state.endAt - now);
    this.setState({
      playbackState: 'paused',
      remaining: remaining,
      endAt: 0
    });
  }

  resume() {
    if (this.state.playbackState !== 'paused') return;
    const now = Date.now();
    const endAt = this.state.remaining > 0 ? now + this.state.remaining : 0;
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
      return true;
    } else {
      this.stop();
      return false;
    }
  }

  playPrev() {
    const prevItem = this.state.playlist.prev();
    if (prevItem) {
      this.play(this.state.playlist.currentIndex);
      return true;
    }
    return false;
  }

  toggleBlackout() {
    this.setState({ blackout: !this.state.blackout });
  }

  toggleStageLock() {
    this.setState({ stageLock: !this.state.stageLock });
  }

  setVolume(type, value) {
    const val = Math.max(0, Math.min(1, Number(value)));
    const audio = { ...this.state.audio };
    if (type === 'master') audio.masterVolume = val;
    if (type === 'media') audio.mediaVolume = val;
    if (type === 'bgMusic') audio.bgMusicVolume = val;
    this.setState({ audio });
  }

  setGlobalBackground(bgConfig) {
    this.setState({
      globalBackground: {
        ...this.state.globalBackground,
        ...bgConfig
      }
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
      globalBackground: {
        ...this.state.globalBackground,
        opacity
      }
    });
  }

  setBgMusicTrack(track) {
    const audio = { ...this.state.audio, bgMusicTrack: track, bgMusicPlaying: Boolean(track) };
    this.setState({ audio });
  }

  toggleBgMusic() {
    const audio = { ...this.state.audio, bgMusicPlaying: !this.state.audio.bgMusicPlaying };
    this.setState({ audio });
  }
}
