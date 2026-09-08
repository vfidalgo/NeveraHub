/**
 * NeveraVision: Controlador de Identificación Facial para el Kiosko de NeveraHub
 * Integra captura de cámara (AndroidBridge nativo o WebRTC getUserMedia)
 * y flujo de reintento asistido por voz con Gemini Flash Vision.
 */

(function () {
  'use strict';

  const NeveraVision = {
    isScanning: false,
    currentAttempt: 1,
    lastScanTime: 0,
    hasNativeBridge: false,
    webVideoTrack: null,
    activeMemberId: null,

    init() {
      this.hasNativeBridge = !!(window.AndroidBridge && typeof window.AndroidBridge.captureSnapshot === 'function');
      this.bindEvents();
      console.log('📷 NeveraVision inicializado. Puente nativo de cámara:', this.hasNativeBridge);
    },

    bindEvents() {
      const btnScan = document.getElementById('btn-face-id');
      if (btnScan) {
        btnScan.addEventListener('click', () => this.triggerIdentification('manual'));
      }

      // Disparador al tocar la pantalla tras periodo de reposo (mínimo 45 segundos entre escaneos automáticos)
      let touchCooldown = false;
      document.addEventListener('touchstart', () => {
        if (!touchCooldown && Date.now() - this.lastScanTime > 45000) {
          touchCooldown = true;
          setTimeout(() => { touchCooldown = false; }, 3000);
          this.triggerIdentification('wake');
        }
      }, { passive: true });
    },

    triggerIdentification(source = 'manual') {
      if (this.isScanning) return;
      console.log(`📷 Disparando identificación facial (${source})...`);

      // La interacción FaceID activa la escucha de voz por 2 minutos para recibir órdenes
      if (window.NeveraVoice && typeof window.NeveraVoice.notifyInteraction === 'function') {
        window.NeveraVoice.notifyInteraction(`faceid_${source}`);
      }

      this.currentAttempt = 1;
      this.lastScanTime = Date.now();
      this.startScanAttempt(1);
    },

    startScanAttempt(attemptNumber) {
      this.isScanning = true;
      this.currentAttempt = attemptNumber;
      this.showScanHud(attemptNumber);

      if (this.hasNativeBridge) {
        try {
          window.AndroidBridge.captureSnapshot();
          return;
        } catch (e) {
          console.warn('Error al invocar AndroidBridge.captureSnapshot:', e);
        }
      }

      // Fallback navegador Web / PWA
      this.captureFromWebRTC();
    },

    // Callback invocado por AndroidBridge en MainActivity.java
    onPhotoCaptured(base64Data) {
      if (!base64Data) {
        console.warn('📷 Captura nativa vacía. Intentando captura WebRTC...');
        this.captureFromWebRTC();
        return;
      }
      // Mostrar la foto capturada en el recuadro HUD derecho
      const imgEl = document.getElementById('face-scan-snapshot-img');
      const videoEl = document.getElementById('face-scan-video');
      if (imgEl) {
        imgEl.src = base64Data;
        imgEl.style.display = 'block';
      }
      if (videoEl) {
        videoEl.style.display = 'none';
      }
      this.sendImageForAnalysis(base64Data, this.currentAttempt);
    },

    async captureFromWebRTC() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia no disponible');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });

        this.webVideoTrack = stream.getVideoTracks()[0];
        const videoEl = document.getElementById('face-scan-video');
        const imgEl = document.getElementById('face-scan-snapshot-img');

        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.style.display = 'block';
          if (imgEl) imgEl.style.display = 'none';
          await videoEl.play().catch(() => {});
        }

        // Mostrar el feed de cámara en vivo durante 1.2 segundos para que el usuario se vea
        await new Promise(r => setTimeout(r, 1200));

        const canvas = document.createElement('canvas');
        canvas.width = (videoEl && videoEl.videoWidth) ? videoEl.videoWidth : 640;
        canvas.height = (videoEl && videoEl.videoHeight) ? videoEl.videoHeight : 480;
        const ctx = canvas.getContext('2d');
        if (videoEl) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        }

        const base64Data = canvas.toDataURL('image/jpeg', 0.82);

        // Congelar fotograma capturado en el recuadro mientras Gemini analiza
        if (imgEl) {
          imgEl.src = base64Data;
          imgEl.style.display = 'block';
          if (videoEl) videoEl.style.display = 'none';
        }

        // Detener cámara para no gastar recursos
        stream.getTracks().forEach(t => t.stop());
        this.webVideoTrack = null;

        this.sendImageForAnalysis(base64Data, this.currentAttempt);
      } catch (err) {
        console.warn('Cámara WebRTC no disponible:', err.message);
        this.handleScanFailure(this.currentAttempt, 'No se pudo acceder a la cámara. Pulsa tu avatar arriba para elegir tu perfil.');
      }
    },

    async sendImageForAnalysis(imageBase64, attemptNumber) {
      this.updateScanHudStatus('Analizando rostro con Gemini...');

      try {
        const authH = (window.NeveraSync && window.NeveraSync.getAuthHeaders) ? window.NeveraSync.getAuthHeaders() : {};
        const response = await fetch('/api/vision/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authH },
          body: JSON.stringify({
            imageBase64: imageBase64,
            attemptNumber: attemptNumber
          })
        });

        const data = await response.json();

        if (data.ok && data.identified) {
          this.handleIdentifiedSuccess(data);
        } else if (data.isStranger) {
          this.handleStrangerDetected(data);
        } else {
          this.handleScanFailure(attemptNumber, data.spokenPrompt);
        }
      } catch (err) {
        console.error('Error al analizar imagen con el servidor:', err);
        this.handleScanFailure(attemptNumber, 'Error de conexión con el motor de visión.');
      }
    },

    handleIdentifiedSuccess(data) {
      this.isScanning = false;
      this.activeMemberId = data.memberId;
      this.hideScanHud();

      console.log(`✅ Miembro identificado: ${data.memberName} (${data.role})`);

      // Mantener activo el sistema de audio por 2 minutos tras identificación para recibir órdenes
      if (window.NeveraVoice && typeof window.NeveraVoice.notifyInteraction === 'function') {
        window.NeveraVoice.notifyInteraction('faceid_identified');
      }

      // Mostrar toast de bienvenida personalizada
      this.showIdentificationBanner(data);

      // Saludar por voz al familiar
      if (window.NeveraVoice && typeof window.NeveraVoice.speak === 'function') {
        window.NeveraVoice.speak(data.greeting);
      }

      // Adaptar el dashboard para el miembro identificado
      if (window.NeveraApp) {
        if (typeof window.NeveraApp.setActiveMemberFilter === 'function') {
          window.NeveraApp.setActiveMemberFilter(data.memberId);
        }

        // Si es un niño, mostrar automáticamente la pestaña de hábitos/rutinas
        if (data.suggestedView && typeof window.NeveraApp.switchView === 'function') {
          setTimeout(() => {
            window.NeveraApp.switchView(data.suggestedView);
          }, 800);
        }
      }

      this.updateMemberSelectorUI(data.memberId);
    },

    handleScanFailure(attemptNumber, spokenPrompt) {
      if (attemptNumber === 1) {
        console.log('⚠️ Intento 1 no concluyente. Iniciando reintento guiado por voz...');
        this.updateScanHudStatus('Reintentando: Mira a la cámara...');

        const promptText = spokenPrompt || 'No te he reconocido bien. Por favor, colócate delante de la pantalla y mira a la cámara.';
        if (window.NeveraVoice && typeof window.NeveraVoice.speak === 'function') {
          window.NeveraVoice.speak(promptText);
        }

        // Esperar 2,8 segundos y realizar la segunda captura
        setTimeout(() => {
          this.startScanAttempt(2);
        }, 2800);
      } else {
        console.log('⚠️ Intento 2 fallido. Finalizando escaneo.');
        this.isScanning = false;
        this.updateScanHudStatus('No reconocido');
        setTimeout(() => this.hideScanHud(), 2000);

        const promptText = spokenPrompt || 'No he podido identificarte. Puedes pulsar tu avatar arriba para elegir tu perfil.';
        if (window.NeveraVoice && typeof window.NeveraVoice.speak === 'function') {
          window.NeveraVoice.speak(promptText);
        }

        // Animar el selector de miembros superior para llamar la atención
        this.highlightMemberSelector();
      }
    },

    // -------------------------------------------------------------
    // UI Y RETÍCULA VISUAL
    // -------------------------------------------------------------
    showScanHud(attempt) {
      const hud = document.getElementById('face-scan-hud');
      if (hud) {
        hud.classList.add('active');
        const reticle = hud.querySelector('.scan-reticle');
        if (reticle) reticle.classList.add('pulsing');
        const text = document.getElementById('face-scan-text');
        if (text) text.textContent = attempt === 1 ? 'Escaneando rostro...' : '2º Intento: Mira a la cámara...';

        // Reset vista previa
        const videoEl = document.getElementById('face-scan-video');
        const imgEl = document.getElementById('face-scan-snapshot-img');
        if (imgEl) {
          imgEl.src = '';
          imgEl.style.display = 'none';
        }
        if (videoEl) {
          videoEl.style.display = 'block';
        }
      }
    },

    updateScanHudStatus(msg) {
      const text = document.getElementById('face-scan-text');
      if (text) text.textContent = msg;
    },

    hideScanHud() {
      const hud = document.getElementById('face-scan-hud');
      if (hud) {
        hud.classList.remove('active');
        const reticle = hud.querySelector('.scan-reticle');
        if (reticle) reticle.classList.remove('pulsing');
      }

      if (this.webVideoTrack) {
        try {
          this.webVideoTrack.stop();
        } catch (e) {}
        this.webVideoTrack = null;
      }
      const videoEl = document.getElementById('face-scan-video');
      if (videoEl) {
        videoEl.srcObject = null;
      }
    },

    showIdentificationBanner(data) {
      let banner = document.getElementById('identification-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'identification-banner';
        banner.className = 'identification-banner';
        document.body.appendChild(banner);
      }

      banner.innerHTML = `
        <div class="banner-avatar" style="background-color: ${data.color || '#3b82f6'};">${data.avatar || '👤'}</div>
        <div class="banner-info">
          <div class="banner-name">¡Hola, ${data.shortName}!</div>
          <div class="banner-detail">${data.detailText || 'Perfil adaptado'}</div>
        </div>
      `;

      banner.classList.add('show');
      setTimeout(() => {
        banner.classList.remove('show');
      }, 5000);
    },

    updateMemberSelectorUI(memberId) {
      document.querySelectorAll('.member-chip-btn').forEach(btn => {
        if (btn.getAttribute('data-id') === memberId) {
          btn.classList.add('active-user');
        } else {
          btn.classList.remove('active-user');
        }
      });
    },

    highlightMemberSelector() {
      const bar = document.getElementById('header-members-bar');
      if (bar) {
        bar.classList.add('highlight-glow');
        setTimeout(() => bar.classList.remove('highlight-glow'), 3000);
      }
    },

    handleStrangerDetected(data) {
      this.isScanning = false;
      this.hideScanHud();

      console.warn('🚨 PERSONA NO IDENTIFICADA DETECTADA:', data);

      // Mostrar banner de seguridad con alerta y captura en pantalla
      this.showStrangerAlertBanner(data);

      // Hablar al desconocido: "Hola, no te reconozco. ¿Quién eres? He avisado a la familia."
      const promptText = data.spokenPrompt || 'Hola, no te reconozco. ¿Quién eres? He avisado a la familia.';
      if (window.NeveraVoice && typeof window.NeveraVoice.speak === 'function') {
        window.NeveraVoice.speak(promptText);
      }

      // Animar selector de perfiles por si es un familiar que no miró de frente
      this.highlightMemberSelector();
    },

    showStrangerAlertBanner(data) {
      let banner = document.getElementById('security-stranger-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'security-stranger-banner';
        banner.className = 'security-stranger-banner';
        document.body.appendChild(banner);
      }

      const captureHtml = data.captureUrl
        ? `<img src="${data.captureUrl}" alt="Captura seguridad" class="stranger-photo-thumb" onerror="this.style.display='none'">`
        : `<div class="stranger-photo-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🕵️</div>`;

      banner.innerHTML = `
        ${captureHtml}
        <div class="stranger-alert-content">
          <div class="stranger-alert-title">🚨 Persona no identificada</div>
          <div class="stranger-alert-desc">Se ha tomado una foto y notificado a los móviles de la familia.</div>
          <div class="stranger-alert-hint">¿Eres de la familia? Toca tu avatar arriba en la barra.</div>
        </div>
        <button class="btn-dismiss-alert" onclick="this.parentElement.classList.remove('show')" style="background:transparent;border:none;color:#ef4444;font-size:1.4rem;cursor:pointer;padding:4px 8px;line-height:1;" title="Cerrar aviso">✕</button>
      `;

      banner.classList.add('show');
      setTimeout(() => {
        banner.classList.remove('show');
      }, 9000);
    },

    // Selección manual táctil de perfil
    selectMemberManually(memberId) {
      if (window.NeveraVoice && typeof window.NeveraVoice.notifyInteraction === 'function') {
        window.NeveraVoice.notifyInteraction('manual_member_select');
      }
      if (memberId === 'all') {
        this.activeMemberId = null;
        this.updateMemberSelectorUI('all');
        if (window.NeveraApp && typeof window.NeveraApp.setActiveMemberFilter === 'function') {
          window.NeveraApp.setActiveMemberFilter('all');
        }
        return;
      }
      fetch('/api/members')
        .then(r => r.json())
        .then(members => {
          const m = members.find(item => item.id === memberId);
          if (m) {
            this.handleIdentifiedSuccess({
              identified: true,
              memberId: m.id,
              memberName: m.name,
              shortName: m.name.split(' ')[0],
              role: m.role,
              avatar: m.avatar,
              color: m.color,
              greeting: `Hola ${m.name.split(' ')[0]}. Perfil activado manualmente.`,
              detailText: 'Seleccionado con un toque',
              suggestedView: m.role === 'child' ? 'habits' : 'dashboard'
            });
          }
        });
    }
  };

  window.NeveraVision = NeveraVision;

  document.addEventListener('DOMContentLoaded', () => {
    NeveraVision.init();
  });
})();