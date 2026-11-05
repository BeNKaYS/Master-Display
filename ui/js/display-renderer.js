/**
 * DisplayRenderer - GKGD P2.5 LED Panel ve Önizleme Çizim Motoru
 * Özel Çözünürlük, Aspect Ratio Hesaplama, GPU Hızlandırma ve Canlı Marquee
 */

function attachSeamlessLoopCrossfade(primaryVideo, fadeMs = 800) {
  if (!primaryVideo || primaryVideo._seamlessLoopBound) return null;
  primaryVideo._seamlessLoopBound = true;
  primaryVideo.loop = false;
  primaryVideo.muted = true;

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
  cloneVideo.setAttribute('data-loop-clone', '1');
  cloneVideo.loop = false;
  cloneVideo.muted = true;
  cloneVideo.playsInline = true;

  const baseTransition = `opacity ${fadeMs}ms ease-in-out`;
  primaryVideo.style.position = 'absolute';
  primaryVideo.style.top = '0';
  primaryVideo.style.left = '0';
  primaryVideo.style.width = '100%';
  primaryVideo.style.height = '100%';
  primaryVideo.style.transition = baseTransition;
  primaryVideo.style.opacity = '1';

  cloneVideo.style.position = 'absolute';
  cloneVideo.style.top = '0';
  cloneVideo.style.left = '0';
  cloneVideo.style.width = '100%';
  cloneVideo.style.height = '100%';
  cloneVideo.style.objectFit = primaryVideo.style.objectFit || 'cover';
  cloneVideo.style.pointerEvents = 'none';
  cloneVideo.style.transition = baseTransition;
  cloneVideo.style.opacity = '0';

  parent.insertBefore(cloneVideo, primaryVideo.nextSibling);

  let activeVid = primaryVideo;
  let standbyVid = cloneVideo;
  let isCrossfading = false;
  let fadeTimer = null;
  let currentSrc = primaryVideo.getAttribute('src') || '';
  const fadeSec = fadeMs / 1000;

  const triggerCrossfade = () => {
    if (isCrossfading) return;
    const src = activeVid.getAttribute('src') || currentSrc;
    if (!src) return;
    isCrossfading = true;

    if (standbyVid.getAttribute('src') !== src) {
      standbyVid.setAttribute('src', src);
      standbyVid.load();
    }
    try { standbyVid.currentTime = 0; } catch (e) {}
    standbyVid.muted = true;

    const startFade = () => {
      standbyVid.style.transition = baseTransition;
      activeVid.style.transition = baseTransition;
      standbyVid.style.opacity = '1';
      activeVid.style.opacity = '0';

      const prevActive = activeVid;
      activeVid = standbyVid;
      standbyVid = prevActive;

      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        try {
          standbyVid.pause();
          standbyVid.currentTime = 0;
        } catch (e) {}
        isCrossfading = false;
      }, fadeMs + 60);
    };

    const p = standbyVid.play();
    if (p && typeof p.then === 'function') {
      p.then(startFade).catch(() => startFade());
    } else {
      startFade();
    }
  };

  const onTimeUpdate = (e) => {
    const v = e.currentTarget;
    if (v !== activeVid || isCrossfading) return;
    const dur = v.duration;
    if (!dur || !Number.isFinite(dur)) return;
    const threshold = Math.min(fadeSec + 0.08, dur * 0.45);
    if (dur - v.currentTime <= threshold) {
      triggerCrossfade();
    }
  };

  const onEnded = (e) => {
    const v = e.currentTarget;
    if (v !== activeVid) return;
    if (!isCrossfading) triggerCrossfade();
  };

  primaryVideo.addEventListener('timeupdate', onTimeUpdate);
  cloneVideo.addEventListener('timeupdate', onTimeUpdate);
  primaryVideo.addEventListener('ended', onEnded);
  cloneVideo.addEventListener('ended', onEnded);

  const controller = {
    setSrc(newSrc) {
      if (!newSrc) return;
      if (currentSrc === newSrc && activeVid.getAttribute('src') === newSrc) return;
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
        cloneVideo.setAttribute('src', newSrc);
        cloneVideo.load();
      } catch (e) {}

      try {
        primaryVideo.style.transition = 'none';
        primaryVideo.style.opacity = '1';
        primaryVideo.setAttribute('src', newSrc);
        primaryVideo.load();
        void primaryVideo.offsetWidth;
        primaryVideo.style.transition = baseTransition;
        cloneVideo.style.transition = baseTransition;
      } catch (e) {}
    },
    play() {
      primaryVideo.style.display = 'block';
      cloneVideo.style.display = 'block';
      if (activeVid.paused) activeVid.play().catch(() => {});
    },
    pause() {
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
    }
  };

  primaryVideo._seamlessLoopCtrl = controller;
  return controller;
}

export class DisplayRenderer {
  constructor(containerEl, appState, isPreview = false) {
    this.container = containerEl;
    this.appState = appState;
    this.isPreview = isPreview;

    this.currentRenderedId = null;
    this.currentActiveSlide = -1;
    this._lastSeekTimestamp = null;
    this._lastPlayRequestId = null;

    this._buildDom();
    this._initFullscreenShortcut();
    this._initAlwaysOnTopPin();
    this._startSyncClock();

    window.__DisplayRendererInstance = this;

    this.appState.subscribe(state => this.render(state));
    this.render(this.appState.getState());
  }

  stopAll() {
    const runningVideos = this.container ? this.container.querySelectorAll('video') : [];
    runningVideos.forEach(v => {
      try {
        v.pause();
        v.currentTime = 0;
        if (!v.classList.contains('bg-video')) {
          v.removeAttribute('src');
          v.load();
        }
      } catch (e) {}
    });
    const runningAudios = this.container ? this.container.querySelectorAll('audio') : [];
    runningAudios.forEach(a => {
      try {
        a.pause();
        a.currentTime = 0;
        a.removeAttribute('src');
        a.load();
      } catch (e) {}
    });
    if (this.bgVideo) {
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
        <div class="media-wrapper">
          <img src="${defPoster}" alt="Tören Sahnesi" class="fit-contain" decoding="async" />
        </div>
      `;
    } else if (this.mediaContent) {
      this.mediaContent.innerHTML = '';
    }
  }

  /**
   * Yüksek Hassasiyetli Donanım Saati & Kare Kilidi (60 FPS / RAF Tabanlı)
   * stage-viewport ile screen=1 ekranının milisaniyesi milisaniyesine birebir aynı karede akmasını sağlar
   */
  _startSyncClock() {
    let lastCheck = 0;
    const loop = () => {
      const now = Date.now();
      if (now - lastCheck >= 50) {
        lastCheck = now;
        const state = this.appState.getState();

        // 1. Ses Güvenliği: Eğer önizleme ise (stage-viewport) ASLA ses çıkarmaz!
        if (this.isPreview) {
          const v = this.mediaContent?.querySelector('video');
          if (v && (!v.muted || v.volume !== 0)) {
            v.muted = true;
            v.volume = 0;
          }
          if (this.bgVideo && (!this.bgVideo.muted || this.bgVideo.volume !== 0)) {
            this.bgVideo.muted = true;
            this.bgVideo.volume = 0;
          }
        }

        // 2. Canlı Medya Video Faz-Kilidi (PLL) Senkronizasyonu (Yalnızca 'video' öğelerinde; playbackRate sabit 1.0 tutularak ses paraziti önlenir!)
        if (state && state.playbackState === 'playing' && state.liveItem && state.liveItem.type === 'video') {
          const activeVideo = this.mediaContent?.querySelector('.media-wrapper > video') || this.mediaContent?.querySelector('video');
          if (activeVideo && activeVideo.duration > 0 && !activeVideo.seeking) {
            if (activeVideo.playbackRate !== 1.0) activeVideo.playbackRate = 1.0;
            const targetTime = (state.duration > 0 && state.endAt > 0)
              ? Math.max(0, (state.duration - Math.max(0, state.endAt - now)) / 1000)
              : (state.duration > 0 && state.remaining >= 0 ? (state.duration - state.remaining) / 1000 : 0);
            if (targetTime >= 0) {
              const absDiff = Math.abs(activeVideo.currentTime - targetTime);
              if (absDiff > (this.isPreview ? 0.65 : 1.2)) {
                activeVideo.currentTime = targetTime;
              }
            }
          }
        }

        // 3. Arka Plan Loop Video: 800 ms Crossfade ile kendi döngüsünde kesintisiz akar.
      }
      this._syncRafId = requestAnimationFrame(loop);
    };
    this._syncRafId = requestAnimationFrame(loop);
  }

  _buildDom() {
    this.container.innerHTML = `
      <div class="stage-viewport" id="stage-viewport">
        <!-- Katman 1: Ana Medya Katmanı (Resim, Video, Slayt, Metin - Tabanda) -->
        <div class="stage-layer media-layer" id="media-layer">
          <div class="media-container" id="media-content">
            <!-- Dinamik Medya Elemanları Buraya Basılır -->
          </div>
        </div>

        <!-- Katman 2: Loop Video Overlay & Mikser Katmanı (Görüntünün ÜSTÜNDE) -->
        <div class="stage-layer background-layer" id="bg-layer">
          <video class="bg-media bg-video" id="bg-video" loop muted playsinline decoding="async" style="display:none;"></video>
          <div class="bg-media bg-image" id="bg-image" style="display:none;"></div>
        </div>

        <!-- Katman 3: Canlı Altyazı / Marquee Katmanı -->
        <div class="marquee-layer" id="marquee-layer" style="display:none;">
          <div class="marquee-content marquee-anim" id="marquee-content"></div>
        </div>

        <!-- Katman 4: Sahne Kilit & Karşılama Katmanı -->
        <div class="stage-layer lock-layer" id="lock-layer" style="display:none;">
          <div class="lock-card">
            <div class="lock-badge">SAHNE BEKLEMEDE</div>
            <div class="lock-title">Tören ve Sahne Sunum Sistemi</div>
            <div class="lock-subtitle">Yayın operatör komutunu bekliyor</div>
            <div class="lock-hw-badge" id="lock-hw-info">Hedef Panel: GKGD P2.5 Indoor LED</div>
          </div>
        </div>

        <!-- Katman 5: Karartma & Panik Katmanı (Blackout) -->
        <div class="stage-layer blackout-layer" id="blackout-layer" style="display:none;"></div>
      </div>
    `;

    this.viewport = this.container.querySelector('#stage-viewport');
    this.bgLayer = this.container.querySelector('#bg-layer');
    this.bgVideo = this.container.querySelector('#bg-video');
    this.bgImage = this.container.querySelector('#bg-image');
    this.mediaContent = this.container.querySelector('#media-content');
    this.marqueeLayer = this.container.querySelector('#marquee-layer');
    this.marqueeContent = this.container.querySelector('#marquee-content');
    this.lockLayer = this.container.querySelector('#lock-layer');
    this.blackoutLayer = this.container.querySelector('#blackout-layer');
    this.lockHwInfo = this.container.querySelector('#lock-hw-info');

    this._currentBgVideoSrc = null;
    if (this.bgVideo) {
      this._bgLoopCtrl = attachSeamlessLoopCrossfade(this.bgVideo, 800);
    }
  }

  /**
   * Çift Tıklama veya F11 ile Kenarlıksız Tam Ekran (Borderless Fullscreen)
   */
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

      const renderPinState = (pinned) => {
        isPinned = pinned;
        if (pinned) {
          pinBtn.style.borderColor = '#ecc94b';
          pinBtn.style.background = 'rgba(26, 32, 44, 0.92)';
          pinBtn.style.color = '#ecc94b';
          pinBtn.style.boxShadow = '0 0 12px rgba(236, 201, 75, 0.45)';
          pinBtn.style.opacity = '0.9';
          pinBtn.title = 'Daima Üstte: AÇIK (Sabitlemeyi kaldırmak için tıkla)';
        } else {
          pinBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          pinBtn.style.background = 'rgba(15, 20, 30, 0.75)';
          pinBtn.style.color = '#a0aec0';
          pinBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
          pinBtn.style.opacity = '0.35';
          pinBtn.title = 'Daima Üstte: KAPALI (Pencereyi sabitlemek için tıkla)';
        }
      };

      pinBtn.addEventListener('mouseenter', () => {
        pinBtn.style.opacity = '1';
        pinBtn.style.transform = 'scale(1.08)';
      });
      pinBtn.addEventListener('mouseleave', () => {
        pinBtn.style.transform = 'scale(1)';
        pinBtn.style.opacity = isPinned ? '0.9' : '0.35';
      });

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

    window.addEventListener('dblclick', () => {
      this.toggleFullscreen();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /**
   * State değiştikçe ekranı güncelle
   */
  render(state) {
    // 1. LED En-Boy Oranı ve Çözünürlük Boyutlandırması
    this._applyLedViewportGeometry(state.ledConfig);

    // 2. Panik / Blackout Kontrolü
    this.blackoutLayer.style.display = state.blackout ? 'block' : 'none';

    // 3. Sahne Kilidi Kontrolü
    if (state.stageLock && state.playbackState === 'stopped') {
      this.lockLayer.style.display = 'flex';
      const w = state.ledConfig?.width || 1536;
      const h = state.ledConfig?.height || 768;
      if (this.lockHwInfo) {
        this.lockHwInfo.textContent = `GKGD P2.5 LED Panel • ${w} × ${h} px • GPU Hızlandırma Aktif`;
      }
    } else {
      this.lockLayer.style.display = 'none';
    }

    // 4. Canlı Marquee / Kayan Yazı Katmanı
    this._renderMarquee(state.marquee);

    // 5. Global Arka Plan Render
    this._renderBackground(state.globalBackground);

    // 6. Medya Katmanı Render (Ölçekleme modu ile)
    this._renderMedia(state);
  }

  /**
   * LED Panel Boyut ve Aspect Ratio Geometrisi
   */
  _applyLedViewportGeometry(ledConfig) {
    if (!ledConfig || !this.viewport) return;

    const targetW = ledConfig.width || 1536;
    const targetH = ledConfig.height || 768;
    const targetAspect = targetW / targetH;

    // Viewport'un CSS aspect-ratio ve max boyutlandırması
    if (!this.isPreview) {
      // Gerçek LED ekranda tam ekran yayılır
      this.viewport.style.width = '100vw';
      this.viewport.style.height = '100vh';
      this.viewport.style.aspectRatio = `${targetW} / ${targetH}`;
    } else {
      // Önizleme kutusunda oran korunarak ölçeklenir
      this.viewport.style.width = '100%';
      this.viewport.style.height = '100%';
      this.viewport.style.aspectRatio = `${targetW} / ${targetH}`;
    }
  }

  _renderMarquee(marquee) {
    if (!marquee || !marquee.enabled || !marquee.text.trim()) {
      this.marqueeLayer.style.display = 'none';
      return;
    }

    this.marqueeLayer.style.display = 'flex';
    this.marqueeLayer.style.backgroundColor = marquee.bgColor || 'rgba(0,0,0,0.85)';
    this.marqueeContent.style.color = marquee.textColor || '#ffffff';
    this.marqueeContent.style.fontSize = `${marquee.fontSize || 28}px`;
    this.marqueeContent.style.padding = `${Math.round((marquee.fontSize || 28) * 0.35)}px 0`;
    this.marqueeContent.style.animationDuration = `${marquee.speed || 15}s`;

    if (this.marqueeContent.textContent !== marquee.text) {
      this.marqueeContent.textContent = marquee.text;
    }
  }

  _renderBackground(bg) {
    if (!bg || !bg.enabled) {
      this.bgLayer.style.display = 'none';
      if (this.bgVideo && !this.bgVideo.paused) {
        this.bgVideo.pause();
      }
      return;
    }

    this.bgLayer.style.display = 'block';
    this.bgLayer.style.zIndex = '20';
    this.bgLayer.style.pointerEvents = 'none';
    this.bgLayer.style.willChange = 'opacity, transform';
    this.bgLayer.style.backfaceVisibility = 'hidden';
    this.bgLayer.style.opacity = bg.opacity !== undefined ? bg.opacity : 0.35;
    const blur = bg.blur || 0;
    this.bgLayer.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    this.bgLayer.style.transform = blur > 0 ? 'scale(1.06) translate3d(0,0,0)' : 'translate3d(0,0,0)';

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
        if (this.bgVideo.paused) {
          this.bgVideo.play().catch(() => {});
        }
      }
    } else if (bg.type === 'image' && bg.src) {
      this._currentBgVideoSrc = null;
      this.bgVideo.style.display = 'none';
      this.bgVideo.pause();
      this.bgImage.style.display = 'block';
      this.bgImage.style.backgroundImage = `url('${bg.src}')`;
      this.bgImage.style.backgroundColor = 'transparent';
    } else {
      this._currentBgVideoSrc = null;
      this.bgVideo.style.display = 'none';
      this.bgVideo.pause();
      this.bgImage.style.display = 'block';
      this.bgImage.style.backgroundImage = 'none';
      this.bgImage.style.backgroundColor = bg.src || '#0a0d14';
    }
  }

  _renderMedia(state) {
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
        try {
          v.pause();
          v.currentTime = 0;
          v.removeAttribute('src');
          v.load();
        } catch (e) {}
      });
      const runningAudios = this.mediaContent.querySelectorAll('audio');
      runningAudios.forEach(a => {
        try {
          a.pause();
          a.currentTime = 0;
          a.removeAttribute('src');
          a.load();
        } catch (e) {}
      });

      const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
      if (settings.autoDefaultPosterOnIdle !== false && defPoster) {
        if (this.currentRenderedId === '__ceremony_idle_poster__') {
          return;
        }
        this.currentRenderedId = '__ceremony_idle_poster__';
        this.currentActiveSlide = -1;

        const currentImg = this.mediaContent.querySelector('img');
        if (currentImg) {
          currentImg.src = defPoster;
          currentImg.className = scaleClass;
        } else {
          this.mediaContent.innerHTML = `
            <div class="media-wrapper">
              <img src="${defPoster}" alt="${settings.defaultPosterTitle || 'Tören Sahnesi'}" class="${scaleClass}" decoding="async" />
            </div>
          `;
        }
      } else {
        this.mediaContent.innerHTML = '';
        this.currentRenderedId = null;
        this.currentActiveSlide = -1;
      }
      return;
    }

    const isSameMedia = (this.currentRenderedId === liveItem.id);
    const isSameSlide = (this.currentActiveSlide === liveItem.activeSlide);

    const getExactMasterTime = () => (state.duration > 0 && state.endAt > 0)
      ? Math.max(0, (state.duration - Math.max(0, state.endAt - Date.now())) / 1000)
      : (state.duration > 0 && state.remaining >= 0 ? (state.duration - state.remaining) / 1000 : 0);

    if (isSameMedia && isSameSlide) {
      const activeVideo = this.mediaContent.querySelector('video');
      if (activeVideo) {
        // Yeni bir OYNAT komutu geldiyse videoyu başa sar ve oynat
        if (state.playRequestId && this._lastPlayRequestId !== state.playRequestId) {
          this._lastPlayRequestId = state.playRequestId;
          this._lastSeekTimestamp = null;
          try {
            activeVideo.currentTime = 0;
          } catch(e) {}
        }

        // Ses Hakemliği: stage-viewport (önizleme) ASLA ses çıkarmaz! Ses YALNIZCA screen=1 Display ekranından çıkar!
        const shouldMute = this.isPreview;
        const targetVol = this.isPreview ? 0 : Math.max(0, Math.min(1, (state.audio?.masterVolume ?? 1.0) * (state.audio?.mediaVolume ?? 1.0)));
        if (activeVideo.muted !== shouldMute) {
          activeVideo.muted = shouldMute;
        }
        if (activeVideo.volume !== targetVol) {
          activeVideo.volume = targetVol;
        }

        if (state.playbackState === 'playing') {
          if (activeVideo.paused) {
            activeVideo.play().catch(() => {});
          }
          // Sürekli Faz Kilidi (Continuous Time-Sync - Pürüzsüz & Takılmasız)
          const targetTime = getExactMasterTime();
          if (targetTime > 0) {
            const diff = activeVideo.currentTime - targetTime;
            if (Math.abs(diff) > 1.5) {
              activeVideo.currentTime = targetTime;
              activeVideo.playbackRate = 1.0;
            }
          }
        } else if (state.playbackState === 'paused') {
          if (!activeVideo.paused) {
            activeVideo.pause();
          }
          const targetTime = getExactMasterTime();
          if (Math.abs(activeVideo.currentTime - targetTime) > 0.08) {
            activeVideo.currentTime = targetTime;
          }
        }

        // İleri / Geri Sarma (Seek) İsteği Kontrolü
        if (state.seekRequest && this._lastSeekTimestamp !== state.seekRequest.timestamp) {
          this._lastSeekTimestamp = state.seekRequest.timestamp;
          try {
            activeVideo.currentTime = state.seekRequest.time;
          } catch(e) {}
        }
      }
      // Sınıf güncellemesi (Fit/Fill/Stretch değişmiş olabilir)
      const mediaEl = this.mediaContent.querySelector('img, video');
      if (mediaEl && !mediaEl.classList.contains(scaleClass)) {
        mediaEl.className = scaleClass;
      }
      return;
    }

    // Önceki medyadan kalan çalışan tüm video ve sesleri derhal durdur ve arabelleği temizle
    const prevVideos = this.mediaContent.querySelectorAll('video');
    prevVideos.forEach(v => {
      try {
        v.pause();
        v.currentTime = 0;
        v.removeAttribute('src');
        v.load();
      } catch (e) {}
    });
    const prevAudios = this.mediaContent.querySelectorAll('audio');
    prevAudios.forEach(a => {
      try {
        a.pause();
        a.currentTime = 0;
        a.removeAttribute('src');
        a.load();
      } catch (e) {}
    });

    this.currentRenderedId = liveItem.id;
    this.currentActiveSlide = liveItem.activeSlide || 0;
    this._lastSeekTimestamp = null;
    if (state.playRequestId) {
      this._lastPlayRequestId = state.playRequestId;
    }

    let src = liveItem.src;
    if ((!src || src.startsWith('blob:')) && this.storageService) {
      try {
        const stored = await this.storageService.getItem(liveItem.id);
        if (stored && stored.fileBlob) {
          src = URL.createObjectURL(stored.fileBlob);
        }
      } catch (e) {}
    }

    if (liveItem.type === 'image') {
      this.mediaContent.innerHTML = `
        <div class="media-wrapper fade-in">
          <img src="${src || liveItem.src}" alt="${liveItem.title}" class="${scaleClass}" decoding="async" />
        </div>
      `;
    } else if (liveItem.type === 'video') {
      const shouldMute = this.isPreview;
      const targetVol = this.isPreview ? 0 : Math.max(0, Math.min(1, (state.audio?.masterVolume ?? 1.0) * (state.audio?.mediaVolume ?? 1.0)));

      this.mediaContent.innerHTML = `
        <div class="media-wrapper fade-in">
          <video src="${src || liveItem.src}" class="${scaleClass}" ${shouldMute ? 'muted' : ''} autoplay playsinline decoding="async"></video>
        </div>
      `;
      const videoEl = this.mediaContent.querySelector('video');
      if (videoEl) {
        videoEl.muted = shouldMute;
        videoEl.volume = targetVol;

        const tryPlayVideo = () => {
          if (state.playbackState === 'playing') {
            const p = videoEl.play();
            if (p !== undefined) {
              p.catch((err) => {
                console.warn('[DisplayRenderer] Video oynatma kısıtlandı, sessiz deneniyor:', err);
                if (!videoEl.muted) {
                  videoEl.muted = true;
                  videoEl.play().catch(() => {});
                  if (!shouldMute) {
                    const unlock = () => {
                      videoEl.muted = false;
                      videoEl.volume = targetVol;
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

        videoEl.addEventListener('ended', () => {
          this.appState.handleItemTimeUp();
        });



        const initialTarget = getExactMasterTime();
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.muted = shouldMute;
          videoEl.volume = targetVol;
          if (videoEl.duration && (!state.duration || Math.abs(state.duration - videoEl.duration * 1000) > 1000)) {
            this.appState.setState({ duration: Math.round(videoEl.duration * 1000) });
          }
          const curTarget = getExactMasterTime();
          if (curTarget > 0.1) {
            try { videoEl.currentTime = curTarget; } catch(e) {}
          }
          if (state.playbackState === 'playing' && videoEl.paused) {
            tryPlayVideo();
          }
        });

        if (state.seekRequest && state.seekRequest.timestamp && this._lastSeekTimestamp !== state.seekRequest.timestamp) {
          this._lastSeekTimestamp = state.seekRequest.timestamp;
          try { videoEl.currentTime = state.seekRequest.time; } catch(e) {}
        } else if (initialTarget > 0) {
          try { videoEl.currentTime = initialTarget; } catch(e) {}
        } else {
          videoEl.currentTime = 0;
        }

        tryPlayVideo();
      }
    } else if (liveItem.type === 'presentation') {
      const activeSlideUrl = (liveItem.slides && liveItem.slides.length > 0)
        ? liveItem.slides[liveItem.activeSlide || 0]
        : liveItem.src;

      this.mediaContent.innerHTML = `
        <div class="media-wrapper fade-in">
          <img src="${activeSlideUrl}" alt="Slayt ${(liveItem.activeSlide || 0) + 1}" class="${scaleClass}" decoding="async" />
          <div class="slide-indicator">Slayt: ${(liveItem.activeSlide || 0) + 1} / ${liveItem.slides ? liveItem.slides.length : 1}</div>
        </div>
      `;
    } else if (liveItem.type === 'audio') {
      // Ses dosyalarında ekrana ASLA alakasız dosya adı, link, süre veya nota ikonu yansıtılmaz!
      // Sadece ses hoparlörden çalınır, sahnede ise tören ayarlarındaki görsel veya loop video kalır.
      const mode = settings.audioScreenMode || 'audio_poster';
      const defPoster = settings.defaultPosterSrc || settings.posterSrc || '';
      const audioVisualSrc = (mode === 'default_poster')
        ? defPoster
        : (settings.audioPosterSrc || defPoster);

      if (mode === 'loop') {
        // Loop video arka planda çalışıyor, medya katmanını tertemiz tut
        this.mediaContent.innerHTML = '';
        this.currentRenderedId = '__audio_loop__';
      } else if (mode === 'blackout') {
        this.mediaContent.innerHTML = `
          <div class="media-wrapper" style="background:#000000; width:100%; height:100%;"></div>
        `;
        this.currentRenderedId = '__audio_blackout__';
      } else {
        const currentImg = this.mediaContent.querySelector('img');
        if (currentImg && this.currentRenderedId === `__audio_${liveItem.id}__` && currentImg.getAttribute('src') === audioVisualSrc) {
          return;
        }
        this.currentRenderedId = `__audio_${liveItem.id}__`;
        if (currentImg) {
          currentImg.src = audioVisualSrc;
          currentImg.className = scaleClass;
        } else {
          this.mediaContent.innerHTML = `
            <div class="media-wrapper">
              <img src="${audioVisualSrc}" alt="Tören Sahnesi" class="${scaleClass}" decoding="async" />
            </div>
          `;
        }
      }
    }
  }
}
