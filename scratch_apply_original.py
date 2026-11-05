import sys

with open('ui/js/bundle.js', 'rb') as f:
    content = f.read().decode('utf-8')

# 1. Update _applyLedConfigInPlace in DisplayRenderer
old_apply_led = '''      // 1. Ana medya elemanının ölçek sınıfını anında değiştir (videoyu yeniden yüklemez)
      const mediaEls = this.mediaContent.querySelectorAll('.media-wrapper > img, .media-wrapper > video');
      mediaEls.forEach((el) => {
        el.classList.remove('fit-contain', 'fit-cover', 'fit-fill', 'fit-original');
        el.classList.add(scaleClass);
      });'''

new_apply_led = '''      // 1. Ana medya elemanının ölçek sınıfını anında değiştir (videoyu yeniden yüklemez)
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
      });'''

assert old_apply_led.replace('\r\n', '\n') in content.replace('\r\n', '\n')

# 2. Update edge fill check in _applyLedConfigInPlace:
old_fill_check = "if (scaleMode !== 'contain' || (cfg.fillMode || 'blank') === 'blank' || isAudioLoopOrBlackout) {"
new_fill_check = "if ((scaleMode !== 'contain' && scaleMode !== 'original') || (cfg.fillMode || 'blank') === 'blank' || isAudioLoopOrBlackout) {"
assert old_fill_check in content

# 3. Update _renderMedia in DisplayRenderer for video/image metadata loading
old_video_swap = '''          const initialTarget = getExactMasterTime();
          vEl.addEventListener('loadedmetadata', () => {'''

new_video_swap = '''          const initialTarget = getExactMasterTime();
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
            }'''

assert old_video_swap.replace('\r\n', '\n') in content.replace('\r\n', '\n')

# 4. Update _syncOriginalMediaSize to NEVER modify ledConfig.width/height
old_sync_start = '''    /**
     * "Orijinal" ölçek modunda seçili veya yayındaki medyanın kendi doğal piksel
     * boyutlarını (videoWidth×videoHeight / naturalWidth×naturalHeight) okur ve
     * ekran boyutunu (Genişlik × Yükseklik ve Oran) medyanın orijinal haline eşitler.
     */
    _syncOriginalMediaSize(item, showToast = false) {
      if (!item || item.pending) return;

      const applyDimensions = (w, h) => {
        const nw = Math.round(Number(w) || 0);
        const nh = Math.round(Number(h) || 0);
        if (nw < 64 || nh < 64) return;
        const cur = this.appState.getState().ledConfig || {};
        if (cur.scaleMode !== 'original') return;
        if (cur.width !== nw || cur.height !== nh) {
          this.appState.setLedConfig({ width: nw, height: nh, scaleMode: 'original' });
          this._updateScreenUi();
        }
        if (showToast) {
          this._toast?.(`Orijinal medya boyutu: ${nw} × ${nh}`, 'ok');
        }
      };'''

new_sync_start = '''    /**
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
      };'''

assert old_sync_start.replace('\r\n', '\n') in content.replace('\r\n', '\n')

# 5. In renderMediaPreview, update live switch of fit class
old_pv_fit_switch = '''      const previewScale = ledCfg.scaleMode || 'contain';
      const fitMap = { contain: 'contain', cover: 'cover', fill: 'fill', original: 'contain' };
      const previewFit = fitMap[previewScale] || 'contain';

      const mainHost = wrapper.querySelector('.pv-main-host');
      if (mainHost) {
        const mediaEl = mainHost.querySelector('#pv-video-el, img');
        if (mediaEl) {
          mediaEl.style.objectFit = previewFit;
        }
      }'''

new_pv_fit_switch = '''      const previewScale = ledCfg.scaleMode || 'contain';
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
      }'''

assert old_pv_fit_switch.replace('\r\n', '\n') in content.replace('\r\n', '\n')

# 6. In renderMediaPreview, update previewScale fill condition
old_pv_fill_cond = "if (previewScale === 'contain') {"
new_pv_fill_cond = "if (previewScale === 'contain' || previewScale === 'original') {"
# There are 2 occurrences (one in quick update, one in full render)
content = content.replace(old_pv_fill_cond, new_pv_fill_cond)

# Apply replacements
def rep(src, target, repl):
    if '\r\n' in src:
        target = target.replace('\r\n', '\n').replace('\n', '\r\n')
        repl = repl.replace('\r\n', '\n').replace('\n', '\r\n')
    else:
        target = target.replace('\r\n', '\n')
        repl = repl.replace('\r\n', '\n')
    return src.replace(target, repl, 1)

content = rep(content, old_apply_led, new_apply_led)
content = content.replace(old_fill_check, new_fill_check, 1)
content = rep(content, old_video_swap, new_video_swap)
content = rep(content, old_sync_start, new_sync_start)
content = rep(content, old_pv_fit_switch, new_pv_fit_switch)

with open('ui/js/bundle.js', 'wb') as f:
    f.write(content.encode('utf-8'))

print('ALL REPLACEMENTS SUCCESSFUL')

