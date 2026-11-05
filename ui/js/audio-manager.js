/**
 * AudioManager - Çift Kanallı Ses Mikseri & Ses Hakemliği Motoru
 * - Medya Sesi (Video vb.)
 * - Bağımsız Fon Müziği (Saygı Duruşu Ti sesi, İstiklal Marşı, Arka Plan Müzikleri)
 * - Donanımsal Web Audio Sentezleyici (Gong, Siren, Bip tonları)
 * - Ses Hakemliği: 2. ekran açıksa ses salondan (ekran 2), tekse yöneticiden; önizlemede sessiz.
 */

export class AudioManager {
  constructor(appState, role = 'master', isPreview = false) {
    this.appState = appState;
    this.role = role;
    this.isPreview = isPreview;

    this.audioCtx = null;
    this.bgMusicAudio = new Audio();
    this.bgMusicAudio.preload = 'auto';

    // Medya için bağımsız ses elementi (ses dosyaları çalındığında)
    this.mediaAudio = new Audio();
    this.mediaAudio.preload = 'auto';
    this.mediaAudio.addEventListener('ended', () => {
      this.appState.handleItemTimeUp();
    });

    this._currentBgMusicSrc = null;
    this._currentMediaAudioSrc = null;
    this._lastAudioSeek = null;
    this._lastAudioPlayRequestId = null;

    window.__AudioManagerInstance = this;

    // Ses hakemliğini dinle
    this.appState.subscribe(state => this.updateAudioOutputs(state));
  }

  stopAllAudio() {
    if (this.mediaAudio) {
      try {
        this.mediaAudio.pause();
        this.mediaAudio.currentTime = 0;
        this.mediaAudio.src = '';
      } catch (e) {}
      this._currentMediaAudioSrc = null;
    }
    if (this.bgMusicAudio) {
      try {
        this.bgMusicAudio.pause();
        this.bgMusicAudio.currentTime = 0;
      } catch (e) {}
    }
  }

  _initContext() {
    if (!this.audioCtx && typeof window.AudioContext !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn('Web Audio başlatılamadı:', e);
      }
    }
  }

  /**
   * Ses Hakemliği Kontrolü: Bu pencere ses çalmalı mı?
   */
  shouldPlaySound() {
    if (this.isPreview) return false; // Önizleme kesinlikle sessiz!

    const state = this.appState.getState();

    // Eğer Display ekranındaysak, ses daima buradan çıkar
    if (this.role === 'display') return true;

    // Eğer Master ekranındaysak: Sadece 2. ekran bağlı DEĞİLSE buradan çıkar.
    if (this.role === 'master') {
      return !state.displayConnected;
    }

    return false;
  }

  /**
   * Durum değiştikçe sesleri güncelle
   */
  updateAudioOutputs(state) {
    if (!state.liveItem || state.playbackState === 'stopped') {
      this.stopAllAudio();
      return;
    }
    const canPlay = this.shouldPlaySound();
    const masterVol = state.audio.masterVolume;
    const mediaVol = state.audio.mediaVolume;
    const bgVol = state.audio.bgMusicVolume;

    // 1. Fon Müziği Yönetimi
    if (state.audio.bgMusicTrack && state.audio.bgMusicTrack.src) {
      if (this._currentBgMusicSrc !== state.audio.bgMusicTrack.src) {
        this._currentBgMusicSrc = state.audio.bgMusicTrack.src;
        this.bgMusicAudio.src = state.audio.bgMusicTrack.src;
        this.bgMusicAudio.loop = Boolean(state.audio.bgMusicTrack.loop);
      }

      this.bgMusicAudio.volume = canPlay ? (masterVol * bgVol) : 0;

      if (state.audio.bgMusicPlaying && canPlay) {
        if (this.bgMusicAudio.paused) {
          this.bgMusicAudio.play().catch(() => {});
        }
      } else {
        if (!this.bgMusicAudio.paused) {
          this.bgMusicAudio.pause();
        }
      }
    } else {
      if (!this.bgMusicAudio.paused) {
        this.bgMusicAudio.pause();
        this.bgMusicAudio.src = '';
      }
      this._currentBgMusicSrc = null;
    }

    // 2. Medya Ses Seviyesi ve Çalma
    const liveItem = state.liveItem;
    if (liveItem && liveItem.type === 'audio' && liveItem.src) {
      if (this._currentMediaAudioSrc !== liveItem.src) {
        this._currentMediaAudioSrc = liveItem.src;
        this.mediaAudio.src = liveItem.src;
        this.mediaAudio.loop = Boolean(liveItem.loop);
      }
      this.mediaAudio.volume = canPlay ? (masterVol * mediaVol) : 0;
      if (state.playRequestId && this._lastAudioPlayRequestId !== state.playRequestId) {
        this._lastAudioPlayRequestId = state.playRequestId;
        this._lastAudioSeek = null;
        try { this.mediaAudio.currentTime = 0; } catch(e) {}
      }
      if (state.playbackState === 'playing' && canPlay) {
        if (this.mediaAudio.paused) {
          this.mediaAudio.play().catch(() => {});
        }
      } else {
        if (!this.mediaAudio.paused) {
          this.mediaAudio.pause();
        }
      }
      if (state.seekRequest && this._lastAudioSeek !== state.seekRequest.timestamp) {
        this._lastAudioSeek = state.seekRequest.timestamp;
        try { this.mediaAudio.currentTime = state.seekRequest.time; } catch(e) {}
      }
    } else {
      if (this.mediaAudio && !this.mediaAudio.paused) {
        this.mediaAudio.pause();
        this.mediaAudio.src = '';
      }
      this._currentMediaAudioSrc = null;
    }
  }

  /**
   * Donanımsal Sentezleyici: Saygı Duruşu / Tören Ti Borusu ve Gong Sesi
   * Sıfır dosya boyutu, tarayıcının osilatörü ile anında üretilir.
   */
  playBuzzer(freq = 440, duration = 0.5, type = 'sine') {
    if (!this.shouldPlaySound()) return;
    this._initContext();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Synth hatası:', e);
    }
  }

  /**
   * Tören Gongu (3 Katmanlı Rezonans)
   */
  playChime() {
    this.playBuzzer(523.25, 1.2, 'triangle'); // C5
    setTimeout(() => this.playBuzzer(659.25, 1.0, 'sine'), 150); // E5
    setTimeout(() => this.playBuzzer(783.99, 1.5, 'sine'), 300); // G5
  }
}
