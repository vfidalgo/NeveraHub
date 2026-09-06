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

        this.recognition.onstart = () => this.onSpeechState('listening');
        this.recognition.onend = () => {
          if (this.isListening) {
            this.onSpeechState('processing');
          }
        };
        this.recognition.onerror = (e) => {
          console.warn('SpeechRecognition error:', e.error);
          this.onSpeechState('error');
        };
        this.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          this.onSpeechResult(transcript);
        };
      }
    },

    bindEvents() {
      const btn = document.getElementById('btn-voice-assistant');
      if (btn) {
        btn.addEventListener('click', () => this.toggleListening());
      }

      const closeBtn = document.getElementById('btn-close-voice-hud');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeHud());
      }

      // Atajo de teclado: Tecla "M" para activar micrófono
      document.addEventListener('keydown', (e) => {
        if (e.key === 'm' || e.key === 'M') {
          // Ignorar si está escribiendo en un input
          const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            this.toggleListening();
          }
        }
      });
    },

    toggleListening() {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    },

    startListening() {
      this.stopSpeaking();
      this.isListening = true;
      this.openHud();
      this.updateHudState('listening', 'Te escucho... habla con naturalidad', '');

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
          console.warn('Error al iniciar SpeechRecognition:', err);
          this.onSpeechState('listening');
        }
      } else {
        this.updateHudState('error', 'El reconocimiento de voz no está soportado en este navegador.', '');
      }
    },

    stopListening() {
      this.isListening = false;
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

    onSpeechState(state) {
      console.log('🎙️ Estado de voz:', state);
      if (state === 'listening') {
        this.isListening = true;
        this.updateHudState('listening', 'Te escucho... di por ejemplo "¿Qué hay de cenar?"', '');
      } else if (state === 'processing') {
        this.isListening = false;
        this.updateHudState('processing', 'Pensando...', '');
      } else if (state === 'idle') {
        this.isListening = false;
        this.updateHudState('idle', 'Pulsa el micrófono para hablar', '');
      } else if (state === 'error') {
        this.isListening = false;
        this.updateHudState('error', 'No te he entendido bien. Prueba a pulsar de nuevo.', '');
      }
    },

    async onSpeechResult(transcript) {
      this.isListening = false;
      this.updateHudState('processing', 'Consultando con la nevera...', `"${transcript}"`);

      try {
        const response = await fetch('/api/assistant/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: transcript,
            currentDate: new Date().toISOString()
          })
        });

        const data = await response.json();

        if (data.ok) {
          this.renderAssistantResponse(data, transcript);
          this.speak(data.spokenResponse);

          // Si se ejecutó una acción, refrescar vistas de la aplicación
          if (data.actionTaken && window.NeveraApp) {
            if (typeof window.NeveraApp.refreshData === 'function') {
              window.NeveraApp.refreshData();
            } else if (typeof window.NeveraApp.renderCurrentView === 'function') {
              window.NeveraApp.renderCurrentView();
            }
          }
        } else {
          this.updateHudState('error', data.spokenResponse || 'Ha ocurrido un error.', `"${transcript}"`);
          this.speak(data.spokenResponse || 'Ha ocurrido un error');
        }
      } catch (err) {
        console.error('Error al consultar el asistente:', err);
        const errMsg = 'No he podido conectar con el servicio del asistente.';
        this.updateHudState('error', errMsg, `"${transcript}"`);
        this.speak(errMsg);
      }
    },

    speak(text) {
      if (!text) return;
      this.isSpeaking = true;
      this.setWaveAnimation(true);

      // 1. Prioridad: TextToSpeech nativo de Android
      if (this.hasNativeBridge && typeof window.AndroidBridge.speak === 'function') {
        try {
          window.AndroidBridge.speak(text);
          // Simular tiempo de animación de voz
          const wordCount = text.split(' ').length;
          const duration = Math.max(2000, wordCount * 300);
          setTimeout(() => {
            this.isSpeaking = false;
            this.setWaveAnimation(false);
          }, duration);
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

          // Intentar elegir una voz en español
          const voices = this.synth.getVoices();
          const esVoice = voices.find(v => v.lang && v.lang.startsWith('es'));
          if (esVoice) utterance.voice = esVoice;

          utterance.onend = () => {
            this.isSpeaking = false;
            this.setWaveAnimation(false);
          };
          utterance.onerror = () => {
            this.isSpeaking = false;
            this.setWaveAnimation(false);
          };

          this.synth.speak(utterance);
        } catch (e) {
          console.warn('Error en SpeechSynthesis:', e);
          this.isSpeaking = false;
          this.setWaveAnimation(false);
        }
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
    },

    closeHud() {
      this.stopListening();
      this.stopSpeaking();
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
        responseCardEl.innerHTML = `
          <div class="voice-response-bubble">
            <div class="voice-response-title">${card.title || 'NeveraBot'}</div>
            <div class="voice-response-text">${(card.text || data.spokenResponse || '').replace(/\n/g, '<br>')}</div>
            ${data.actionTaken ? '<div class="voice-action-badge">✅ Acción realizada en la nevera</div>' : ''}
          </div>
        `;
        responseCardEl.style.display = 'block';
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
    }
  };

  window.NeveraVoice = NeveraVoice;

  document.addEventListener('DOMContentLoaded', () => {
    NeveraVoice.init();
  });
})();