/**
 * SyncBus - Triple-Bus Çok Katmanlı Senkronizasyon Omurgası
 * Donanım Otomatik Algılama (Auto-Detection) ve LED En-Boy Oranı Senkronizasyonu
 */

import { APP_CONFIG } from './config.js';

export class SyncBus {
  constructor(appState, role = 'master') {
    this.appState = appState;
    this.role = role;
    this.displayWindowRef = null;
    this.displayTargets = new Set();
    this.heartbeatTimer = null;
    this.heartbeatChecker = null;

    // 1. BroadcastChannel Başlat
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(APP_CONFIG.SYNC_CHANNEL_NAME);
        this.channel.onmessage = (event) => this._handleMessage(event.data);
      } catch (e) {
        console.warn('BroadcastChannel kullanılamıyor:', e);
      }
    }

    // 2. window.postMessage Dinleyicisi
    window.addEventListener('message', (event) => {
      if (event.data && event.data.__type === 'MASTER_DISPLAY_MSG') {
        this._handleMessage(event.data);
      }
    });

    // 3. localStorage / storage Event Dinleyicisi
    window.addEventListener('storage', (event) => {
      if (event.key === APP_CONFIG.STORAGE_KEY && event.newValue) {
        try {
          const packet = JSON.parse(event.newValue);
          if (packet && packet.__type === 'MASTER_DISPLAY_MSG') {
            this._handleMessage(packet);
          }
        } catch (e) {
          console.error('Storage sync parse hatası:', e);
        }
      }
    });

    // Rol bazlı başlatma
    if (this.role === 'master') {
      this._initMaster();
    } else if (this.role === 'display') {
      this._initDisplay();
    }
  }

  _initMaster() {
    this.appState.subscribe((state) => {
      this.broadcastState(state);
    });

    // 2. Ekran veya yeni pencere açıldığında anında yakala
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
      } catch (e) {}
    }, 150);

    this.heartbeatChecker = setInterval(() => {
      const now = Date.now();
      const lastHb = this.appState.getState().lastHeartbeat;
      const isConnected = (now - lastHb) < APP_CONFIG.HEARTBEAT_TIMEOUT_MS;

      if (this.appState.getState().displayConnected !== isConnected) {
        this.appState.setState({ displayConnected: isConnected }, true);
      }
    }, 1500);
  }

  /**
   * Display Rolü: Donanım parametrelerini topla ve Master'a gönder
   */
  _initDisplay() {
    const getHardwareMetrics = () => ({
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      dpr: window.devicePixelRatio || 1,
      colorDepth: window.screen.colorDepth || 24,
      isExtended: Boolean(window.screen.isExtended)
    });

    this.heartbeatTimer = setInterval(() => {
      this.send({
        action: 'HEARTBEAT',
        timestamp: Date.now(),
        hardware: getHardwareMetrics()
      });
    }, APP_CONFIG.HEARTBEAT_INTERVAL_MS);

    // Açılış sinyali ve Master'ı anında uyandırma
    try { localStorage.setItem('MASTER_DISPLAY_PULSE', String(Date.now())); } catch(e) {}
    this.send({
      action: 'DISPLAY_READY',
      timestamp: Date.now(),
      hardware: getHardwareMetrics()
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'MASTER_DISPLAY_CMD' && e.newValue) {
        try {
          const cmd = JSON.parse(e.newValue);
          if (cmd.action === 'CMD_STOP' || cmd.type === 'CMD_STOP') {
            this.appState.stop();
            window.__DisplayRendererInstance?.stopAll();
            window.__AudioManagerInstance?.stopAllAudio();
          }
        } catch(err) {}
      }
    });
  }

  broadcastCommand(cmdName, data = {}) {
    this.send({
      action: cmdName,
      type: cmdName,
      ...data
    }, true);
    if (window.MD && window.MD.tauri) {
      try { window.__TAURI__.core.invoke('sync_broadcast', { payload: { action: cmdName, type: cmdName, sender: this.role, timestamp: Date.now(), ...data } }); } catch (e) {}
    }
    try { localStorage.setItem('MASTER_DISPLAY_CMD', JSON.stringify({ action: cmdName, type: cmdName, timestamp: Date.now() })); } catch(e) {}
  }

  addDisplayTarget(win) {
    if (!win) return;
    this.displayTargets.add(win);
    this.broadcastState(this.appState.getState());
  }

  send(payload, writeStorage = true) {
    const packet = {
      __type: 'MASTER_DISPLAY_MSG',
      senderRole: this.role,
      sentAt: Date.now(),
      ...payload
    };

    if (this.channel) {
      try {
        this.channel.postMessage(packet);
      } catch (e) {}
    }

    if (this.displayWindowRef && !this.displayWindowRef.closed) {
      try {
        this.displayWindowRef.postMessage(packet, '*');
      } catch (e) {}
    }

    if (this.role === 'display' && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(packet, '*');
      } catch (e) {}
    }

    if (this.role === 'display' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(packet, '*');
      } catch (e) {}
    }

    if (this.displayTargets) {
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
    }

    if (writeStorage) {
      try {
        localStorage.setItem(APP_CONFIG.STORAGE_KEY, JSON.stringify(packet));
      } catch (e) {}
    }
  }

  broadcastState(state) {
    if (this.role !== 'master') return;

    const currentSig = `${state.playbackState}_${state.liveItem?.id}_${state.blackout}_${state.stageLock}_${state.globalBackground?.enabled}_${state.globalBackground?.src}_${state.globalBackground?.opacity}`;
    const isStructuralChange = (currentSig !== this._lastBroadcastSig);
    this._lastBroadcastSig = currentSig;

    this.send({
      action: 'SYNC_STATE',
      state: {
        playbackState: state.playbackState,
        liveItem: state.liveItem,
        duration: state.duration,
        remaining: state.remaining,
        endAt: state.endAt,
        blackout: state.blackout,
        stageLock: state.stageLock,
        globalBackground: state.globalBackground,
        ceremonySettings: state.ceremonySettings,
        ledConfig: state.ledConfig,
        marquee: state.marquee,
        seekRequest: state.seekRequest || null,
        playRequestId: state.playRequestId || null,
        audio: {
          masterVolume: state.audio.masterVolume,
          mediaVolume: state.audio.mediaVolume,
          bgMusicVolume: state.audio.bgMusicVolume,
          bgMusicPlaying: state.audio.bgMusicPlaying,
          bgMusicTrack: state.audio.bgMusicTrack
        },
        rev: state.rev
      }
    }, isStructuralChange);
  }

  _handleMessage(packet) {
    if (!packet) return;
    const actual = packet.payload || packet;
    if (packet.senderRole === this.role && actual.senderRole === this.role) {
      return;
    }

    if (actual.action === 'CMD_STOP' || actual.type === 'CMD_STOP' || packet.action === 'CMD_STOP' || packet.type === 'CMD_STOP') {
      this.appState.stop();
      window.__DisplayRendererInstance?.stopAll();
      window.__AudioManagerInstance?.stopAllAudio();
      return;
    }

    // Heartbeat ve Donanım Bilgisi
    if (packet.action === 'HEARTBEAT' || packet.action === 'DISPLAY_READY') {
      if (this.role === 'master') {
        const partialUpdate = {
          lastHeartbeat: Date.now(),
          displayConnected: true
        };

        if (packet.hardware) {
          partialUpdate.displayHardwareInfo = packet.hardware;

          // Eğer kullanıcı 'auto' modunu seçmişse LED çözünürlüğünü algılanan donanıma eşitle
          if (this.appState.getState().ledConfig.preset === 'auto') {
            const detectedW = packet.hardware.availWidth || packet.hardware.width;
            const detectedH = packet.hardware.availHeight || packet.hardware.height;
            if (detectedW && detectedH) {
              partialUpdate.ledConfig = {
                ...this.appState.getState().ledConfig,
                width: detectedW,
                height: detectedH,
                detectedWidth: detectedW,
                detectedHeight: detectedH,
                dpr: packet.hardware.dpr || 1
              };
            }
          }
        }

        this.appState.setState(partialUpdate);

        if (packet.action === 'DISPLAY_READY') {
          this.broadcastState(this.appState.getState());
        }
      }
      return;
    }

    if (packet.action === 'CMD_STOP' || packet.type === 'CMD_STOP') {
      this.appState.stop();
      window.__DisplayRendererInstance?.stopAll();
      window.__AudioManagerInstance?.stopAllAudio();
      return;
    }

    // Display rolünde State alma
    if (packet.action === 'SYNC_STATE' && this.role !== 'master') {
      const incomingState = packet.state;
      this.appState.setState({
        playbackState: incomingState.playbackState,
        liveItem: incomingState.liveItem,
        duration: incomingState.duration,
        remaining: incomingState.remaining,
        endAt: incomingState.endAt,
        blackout: incomingState.blackout,
        stageLock: incomingState.stageLock,
        globalBackground: incomingState.globalBackground,
        ceremonySettings: incomingState.ceremonySettings || this.appState.getState().ceremonySettings,
        ledConfig: incomingState.ledConfig,
        marquee: incomingState.marquee,
        seekRequest: incomingState.seekRequest || null,
        playRequestId: incomingState.playRequestId || null,
        audio: incomingState.audio,
        rev: incomingState.rev
      });
    }

    if (this.role === 'master') {
      if (packet.action === 'CMD_NEXT') this.appState.playNext();
      if (packet.action === 'CMD_PREV') this.appState.playPrev();
      if (packet.action === 'CMD_PAUSE') this.appState.pause();
      if (packet.action === 'CMD_RESUME') this.appState.resume();
    }
  }

  /**
   * 2. Ekranı (Display) Yeni Pencere Olarak Aç
   * GKGD P2.5 LED Panel için boyut ve konumlandırma optimizasyonu
   */
  openDisplayWindow() {
    const ledConfig = this.appState.getState().ledConfig;
    const targetW = ledConfig.width || 1536;
    const targetH = ledConfig.height || 768;

    // Eğer 2. ekran varsa yan ekrana açılacak konum hesapla
    const screenLeft = (window.screen.availWidth || 1920) + 20;
    const screenTop = 0;

    const url = 'index.html?screen=1';
    const features = `width=${targetW},height=${targetH},left=${screenLeft},top=${screenTop},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
    
    if (this.displayWindowRef && !this.displayWindowRef.closed) {
      this.displayWindowRef.focus();
      return this.displayWindowRef;
    }

    this.displayWindowRef = window.open(url, 'MasterDisplayStage', features);
    if (!this.displayWindowRef) {
      alert('İkinci ekran açılır penceresi tarayıcı tarafından engellendi! Lütfen popup engelini kaldırın.');
    } else {
      this.addDisplayTarget(this.displayWindowRef);
    }
    return this.displayWindowRef;
  }
}
