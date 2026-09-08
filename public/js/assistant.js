/**
 * NeveraVoice: Controlador del Asistente Virtual por Voz para el Kiosko de NeveraHub
 * Soporta tanto el puente nativo AndroidBridge (TextToSpeech + SpeechRecognizer)
 * como la Web Speech API del navegador en modo PWA/escritorio.
 */

(function () {
  'use strict';

  const NeveraVoice = {
    isListening: false,
    isSpeaking: false,
    recognition: null,
    synth: window.speechSynthesis || null,
    hasNativeBridge: false,
    activeUntil: 0,
    sessionInterval: null,
    restartTimeout: null,

    init() {
      this.hasNativeBridge = !!(window.AndroidBridge && typeof window.AndroidBridge.startListening === 'function');
      this.setupWebSpeechFallback();
      this.bindEvents();
      console.log('🎙️ NeveraVoice inicializado. Puente nativo Android:', this.hasNativeBridge);
    },

    setupWebSpeechFallback() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'es-ES';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
          this.consecutiveErrors = 0;
          this.onSpeechState('listening');
        };

        this.recognition.onend = () => {
          this.isListening = false;
          this.updateListeningUI(false);
          // Si la ventana de 2 minutos sigue activa y no estamos hablando ni bloqueados, reanudar escucha de fondo
          if (!this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking) {
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
              if (!this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking && !this.isListening) {
                this.startListening(false);
              }
            }, 350);
          } else if (this.isListening) {
            this.onSpeechState('processing');
          }
        };

        this.recognition.onerror = (e) => {
          console.warn('SpeechRecognition error:', e.error);
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            this.permissionBlocked = true;
            this.isListening = false;
            this.updateListeningUI(false);
          } else if (e.error === 'no-speech') {
            this.consecutiveErrors = 0;
            if (!this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking) {
              if (this.restartTimeout) clearTimeout(this.restartTimeout);
              this.restartTimeout = setTimeout(() => {
                if (!this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking && !this.isListening) {
                  this.startListening(false);
                }
              }, 400);
            }
          } else {
            this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
            if (this.consecutiveErrors <= 3 && !this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking) {
              if (this.restartTimeout) clearTimeout(this.restartTimeout);
              this.restartTimeout = setTimeout(() => {
                if (!this.permissionBlocked && Date.now() < this.activeUntil && !this.isSpeaking && !this.isListening) {
                  this.startListening(false);
                }
              }, 600);
            }
          }
        };

        this.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          this.onSpeechResult(transcript);
        };
      }
    },

    bindEvents() {
      // 1. Botón de micrófono en la cabecera (clic explícito: abre HUD interactivo)
      const btn = document.getElementById('btn-voice-assistant');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.isListening) {
            this.stopListening(true);
          } else {
            this.permissionBlocked = false;
            this.consecutiveErrors = 0;
            this.notifyInteraction('header_mic');
            this.startListening(true);
          }
        });
      }

      // 2. Botón de cerrar modal HUD
      const closeBtn = document.getElementById('btn-close-voice-hud');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeHud(true));
      }

      // 3. Atajo de teclado: Tecla "M" para activar micrófono
      document.addEventListener('keydown', (e) => {
        if (e.key === 'm' || e.key === 'M') {
          const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            this.permissionBlocked = false;
            this.consecutiveErrors = 0;
            if (this.isListening) {
              this.stopListening(true);
            } else {
              this.notifyInteraction('keyboard_m');
              this.startListening(true);
            }
          }
        }
      });

      // 4. Interacción en pantalla (toques, clics): Renueva la ventana de 2 minutos sin abrir popups
      let lastTouchThrottle = 0;
      const handleUserInteraction = (e) => {
        if (e.target && (e.target.closest('#btn-close-voice-hud') || e.target.closest('.voice-hud-close'))) {
          return;
        }
        const now = Date.now();
        if (now - lastTouchThrottle > 2500) {
          lastTouchThrottle = now;
          this.notifyInteraction('screen_interaction');
        } else {
          this.activeUntil = Math.max(this.activeUntil, now + 120000);
        }
      };

      window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
      window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    },

    // -------------------------------------------------------------
    // GESTIÓN DE SESIÓN ACTIVA DE 2 MINUTOS
    // -------------------------------------------------------------
    notifyInteraction(source = 'interaction') {
      const now = Date.now();
      this.activeUntil = now + 120000; // 120 segundos

      this.startSessionTimer();
      this.updateSessionBadge(true);

      // Iniciar escucha en segundo plano (sin abrir HUD que tape la pantalla)
      if (!this.isSpeaking && !this.isListening && !this.permissionBlocked) {
        this.startListening(false);
      }
    },

    startSessionTimer() {
      if (this.sessionInterval) return;
      this.updateTimerDisplay();

      this.sessionInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((this.activeUntil - Date.now()) / 1000));
        this.updateTimerDisplay(remaining);

        if (remaining <= 0) {
          this.onSessionExpired();
        }
      }, 1000);
    },

    updateTimerDisplay(secondsRemaining) {
      const remaining = typeof secondsRemaining === 'number'
        ? secondsRemaining
        : Math.max(0, Math.ceil((this.activeUntil - Date.now()) / 1000));

      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      const headerTimerEl = document.getElementById('voice-session-timer');
      if (headerTimerEl) headerTimerEl.textContent = formatted;

      const hudTimerEl = document.getElementById('voice-hud-session-timer');
      if (hudTimerEl) hudTimerEl.textContent = `🎙️ Activo: ${formatted}`;
    },

    updateSessionBadge(visible) {
      const badge = document.getElementById('badge-voice-session');
      if (badge) {
        badge.style.display = visible ? 'inline-flex' : 'none';
      }
      const hudPill = document.getElementById('voice-hud-session-pill');
      if (hudPill) {
        hudPill.style.display = visible ? 'inline-flex' : 'none';
      }
    },

    onSessionExpired() {
      console.log('🎙️ Sesión de 2 minutos de escucha finalizada.');
      if (this.sessionInterval) {
        clearInterval(this.sessionInterval);
        this.sessionInterval = null;
      }
      this.activeUntil = 0;
      this.updateSessionBadge(false);

      if (this.isListening) {
        this.stopListening(false);
      }

      const container = document.getElementById('voice-hud-container');
      const currentStatus = container ? container.getAttribute('data-status') : '';
      if (currentStatus === 'idle' || currentStatus === 'listening') {
        this.closeHud(false);
      }
    },

    toggleListening() {
      if (this.isListening) {
        this.stopListening(true);
      } else {
        this.startListening(true);
      }
    },

    startListening(showHud = false) {
      if (this.isSpeaking) return;
      if (this.permissionBlocked && !showHud) return;

      this.isListening = true;
      this.updateListeningUI(true);

      if (showHud) {
        this.openHud();
        this.updateHudState('listening', 'Te escucho... habla con naturalidad', '');
      }

      if (this.hasNativeBridge) {
        try {
          window.AndroidBridge.startListening();
          return;
        } catch (err) {
          console.warn('Error al invocar AndroidBridge.startListening:', err);
        }
      }

      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (err) {
          if (err.name !== 'InvalidStateError') {
            console.warn('SpeechRecognition start error:', err);
          }
        }
      } else if (showHud) {
        this.updateHudState('error', 'El reconocimiento de voz no está disponible en este navegador.', '');
      }
    },

    stopListening(explicitUserAction = false) {
      this.isListening = false;
      this.updateListeningUI(false);
      if (this.restartTimeout) {
        clearTimeout(this.restartTimeout);
        this.restartTimeout = null;
      }

      if (explicitUserAction) {
        this.activeUntil = 0;
        if (this.sessionInterval) {
          clearInterval(this.sessionInterval);
          this.sessionInterval = null;
        }
        this.updateSessionBadge(false);
      }

      if (this.hasNativeBridge) {
        try {
          window.AndroidBridge.stopListening();
        } catch (err) {}
      }
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (err) {}
      }
    },

    updateListeningUI(listening) {
      const btn = document.getElementById('btn-voice-assistant');
      if (btn) {
        btn.classList.toggle('listening-active', !!listening);
      }
    },

    onSpeechState(state) {
      console.log('🎙️ Estado de voz:', state);
      if (state === 'listening') {
        this.isListening = true;
        this.updateListeningUI(true);
        this.updateHudState('listening', 'Te escucho... di por ejemplo "Apunta el menú de Guille para el lunes"', '');
      } else if (state === 'processing') {
        this.isListening = false;
        this.updateListeningUI(false);
        this.updateHudState('processing', 'Pensando...', '');
      } else if (state === 'idle') {
        this.isListening = false;
        this.updateListeningUI(false);
        this.updateHudState('idle', 'Pulsa el micrófono para hablar', '');
      } else if (state === 'error') {
        this.isListening = false;
        this.updateListeningUI(false);
        this.updateHudState('error', 'No te he entendido bien. Prueba de nuevo o escribe abajo.', '');
      } else if (state === 'unsupported') {
        this.isListening = false;
        this.updateListeningUI(false);
        this.updateHudState('idle', 'Dicta con el micro del teclado o escribe tu consulta:', '');
        const inputEl = document.getElementById('voice-hud-input-text');
        if (inputEl) setTimeout(() => inputEl.focus(), 200);
      }
    },

    async onSpeechResult(transcript) {
      this.isListening = false;
      this.openHud(); // Mostrar HUD para ver qué se ha reconocido y la respuesta
      this.updateHudState('processing', 'Consultando con la nevera...', `"${transcript}"`);

      // Renovar ventana de 2 minutos tras recibir orden de voz
      this.notifyInteraction('speech_result');

      try {
        const authH = (window.NeveraSync && window.NeveraSync.getAuthHeaders) ? window.NeveraSync.getAuthHeaders() : {};
        const response = await fetch('/api/assistant/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authH },
          body: JSON.stringify({
            query: transcript,
            currentDate: new Date().toISOString()
          })
        });

        const data = await response.json();

        if (data.ok) {
          this.inConversationFlow = !!data.inConversationFlow;
          this.renderAssistantResponse(data, transcript);
          this.speak(data.spokenResponse);

          // Si se ejecutó una acción en la base de datos (menú, inventario, hábitos), refrescar app
          if (data.actionTaken && window.NeveraApp) {
            if (typeof window.NeveraApp.refreshAllData === 'function') {
              window.NeveraApp.refreshAllData();
            } else if (typeof window.NeveraApp.refreshData === 'function') {
              window.NeveraApp.refreshData();
            }
          }
        } else {
          this.inConversationFlow = false;
          this.updateHudState('error', data.spokenResponse || 'Ha ocurrido un error.', `"${transcript}"`);
          this.speak(data.spokenResponse || 'Ha ocurrido un error');
        }
      } catch (err) {
        this.inConversationFlow = false;
        console.error('Error al consultar el asistente:', err);
        const errMsg = 'No he podido conectar con el servicio del asistente.';
        this.updateHudState('error', errMsg, `"${transcript}"`);
        this.speak(errMsg);
      }
    },

    speak(text) {
      if (!text) return;
      this.stopListening(false); // Pausar reconocimiento para evitar auto-escucha
      this.isSpeaking = true;
      this.setWaveAnimation(true);

      const onSpeakingFinished = () => {
        this.isSpeaking = false;
        this.setWaveAnimation(false);

        if (this.inConversationFlow) {
          // En diálogo guiado: mantener HUD abierto y reanudar escucha de inmediato
          this.openHud();
          this.updateHudState('listening', 'Te escucho... responde ahora', '');
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (!this.isSpeaking) {
              this.startListening(true);
            }
          }, 300);
        } else {
          // Si la ventana de 2 minutos sigue activa, reanudar escucha en segundo plano
          if (Date.now() < this.activeUntil && !this.isListening) {
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
              if (Date.now() < this.activeUntil && !this.isSpeaking && !this.isListening) {
                this.startListening(false);
              }
            }, 350);
          }
          // Y programar autocierre del HUD
          setTimeout(() => {
            if (!this.inConversationFlow && !this.isSpeaking) {
              this.closeHud(false);
            }
          }, 3500);
        }
      };

      // 1. Prioridad: TextToSpeech nativo de Android
      if (this.hasNativeBridge && typeof window.AndroidBridge.speak === 'function') {
        try {
          window.AndroidBridge.speak(text);
          const wordCount = text.split(' ').length;
          const duration = Math.max(2000, wordCount * 320);
          setTimeout(onSpeakingFinished, duration);
          return;
        } catch (err) {
          console.warn('Error al invocar AndroidBridge.speak:', err);
        }
      }

      // 2. Fallback: Web Speech Synthesis del navegador
      if (this.synth) {
        try {
          this.synth.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'es-ES';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          const voices = this.synth.getVoices();
          const esVoice = voices.find(v => v.lang && v.lang.startsWith('es'));
          if (esVoice) utterance.voice = esVoice;

          utterance.onend = onSpeakingFinished;
          utterance.onerror = onSpeakingFinished;

          this.synth.speak(utterance);
        } catch (e) {
          console.warn('Error en SpeechSynthesis:', e);
          onSpeakingFinished();
        }
      } else {
        onSpeakingFinished();
      }
    },

    stopSpeaking() {
      this.isSpeaking = false;
      this.setWaveAnimation(false);
      if (this.synth) {
        try {
          this.synth.cancel();
        } catch (e) {}
      }
    },

    // -------------------------------------------------------------
    // GESTIÓN VISUAL DEL HUD
    // -------------------------------------------------------------
    openHud() {
      const hud = document.getElementById('voice-hud-modal');
      if (hud) {
        hud.classList.add('active');
      }
      this.updateTimerDisplay();
    },

    closeHud(explicit = true) {
      if (explicit) {
        this.inConversationFlow = false;
        this.stopListening(true);
        this.stopSpeaking();
        fetch('/api/assistant/cancel-flow', { method: 'POST' }).catch(() => {});
      } else {
        this.stopListening(false);
        this.stopSpeaking();
      }
      const hud = document.getElementById('voice-hud-modal');
      if (hud) {
        hud.classList.remove('active');
      }
    },

    updateHudState(status, message, transcript) {
      const statusEl = document.getElementById('voice-hud-status');
      const transcriptEl = document.getElementById('voice-hud-transcript');
      const hudContainer = document.getElementById('voice-hud-container');

      if (statusEl) statusEl.textContent = message;
      if (transcriptEl) transcriptEl.textContent = transcript || '';

      if (hudContainer) {
        hudContainer.setAttribute('data-status', status);
      }

      const wave = document.getElementById('voice-wave-bars');
      if (wave) {
        if (status === 'listening' || status === 'processing') {
          wave.classList.add('active');
        } else if (!this.isSpeaking) {
          wave.classList.remove('active');
        }
      }
    },

    renderAssistantResponse(data, userQuery) {
      const transcriptEl = document.getElementById('voice-hud-transcript');
      const responseCardEl = document.getElementById('voice-hud-response');

      if (transcriptEl) {
        transcriptEl.textContent = `🗣️ Tú: "${userQuery}"`;
      }

      if (responseCardEl) {
        const card = data.card || {};
        let chipsHtml = '';
        if (Array.isArray(data.suggestionChips) && data.suggestionChips.length > 0) {
          chipsHtml = `
            <div class="voice-suggestion-chips">
              ${data.suggestionChips.map(chip => `<button type="button" class="voice-chip-btn" data-chip="${chip}">${chip}</button>`).join('')}
            </div>
          `;
        }

        responseCardEl.innerHTML = `
          <div class="voice-response-bubble">
            <div class="voice-response-title">${card.title || 'NeveraBot'}</div>
            <div class="voice-response-text">${(card.text || data.spokenResponse || '').replace(/\n/g, '<br>')}</div>
            ${chipsHtml}
            ${data.actionTaken ? '<div class="voice-action-badge">✅ Acción realizada en la nevera</div>' : ''}
          </div>
        `;
        responseCardEl.style.display = 'block';

        const chipBtns = responseCardEl.querySelectorAll('.voice-chip-btn');
        chipBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const chipText = btn.getAttribute('data-chip');
            if (chipText) {
              this.sendManualQuery(chipText);
            }
          });
        });
      }
    },

    setWaveAnimation(active) {
      const wave = document.getElementById('voice-wave-bars');
      if (wave) {
        if (active) wave.classList.add('active');
        else if (!this.isListening) wave.classList.remove('active');
      }
    },

    // Método para disparar consultas de prueba rápidas desde la interfaz
    sendManualQuery(queryText) {
      this.openHud();
      this.onSpeechResult(queryText);
    },

    // Envío desde el campo de texto manual o dictado de teclado
    submitManualInput() {
      const inputEl = document.getElementById('voice-hud-input-text');
      if (!inputEl) return;
      const text = (inputEl.value || '').trim();
      if (!text) return;
      inputEl.value = '';
      this.sendManualQuery(text);
    }
  };

  window.NeveraVoice = NeveraVoice;

  document.addEventListener('DOMContentLoaded', () => {
    NeveraVoice.init();
  });
})();