/**
 * Master-Display Uygulama Giriş Noktası (Application Entrypoint)
 * Dual-Role Mimari: URL parametrelerine göre rol tespiti ve modül aktivasyonu
 */

import { AppState } from './state.js';
import { SyncBus } from './sync.js';
import { AudioManager } from './audio-manager.js';
import { DisplayRenderer } from './display-renderer.js';
import { MasterController } from './master-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isDisplay = urlParams.get('screen') === '1';
  const isPreview = urlParams.get('preview') === '1';

  // Rol belirle
  const role = isDisplay ? 'display' : 'master';

  // 1. Durum Motoru
  const appState = new AppState();
  appState.setState({ role });

  // 2. Senkronizasyon Omurgası (Triple-Bus)
  const syncBus = new SyncBus(appState, role);

  // 3. Ses Hakemliği ve Yönetimi
  const audioManager = new AudioManager(appState, role, isPreview);

  // 4. Role Göre Arayüzü Başlat
  if (isDisplay) {
    // === DISPLAY ROLÜ (LED Ekran veya Sanal Önizleme) ===
    document.body.classList.add('display-mode');
    if (isPreview) {
      document.body.classList.add('preview-mode');
    }

    const displayContainer = document.getElementById('display-root');
    if (displayContainer) {
      displayContainer.style.display = 'block';
      new DisplayRenderer(displayContainer, appState, isPreview);
    }

    // Master arayüzünü gizle
    const masterContainer = document.getElementById('master-root');
    if (masterContainer) masterContainer.style.display = 'none';

  } else {
    // === MASTER ROLÜ (Operatör Kontrol Paneli) ===
    const masterContainer = document.getElementById('master-root');
    if (masterContainer) masterContainer.style.display = 'flex';

    const displayContainer = document.getElementById('display-root');
    if (displayContainer) displayContainer.style.display = 'none';

    // Master Operatör Kontrolcüsünü Başlat
    new MasterController(appState, syncBus, audioManager);

    // Sağ taraftaki minyatür Sanal Önizleme Penceresini (Iframe) Kur
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
  }
});
