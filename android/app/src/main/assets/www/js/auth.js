/**
 * NeveraAuth: Gestor de Seguridad y Autenticación por PIN Familiar
 * Protege tanto el acceso Web en Vercel como el panel en APK.
 */
const NeveraAuth = {
  TOKEN_KEY: 'neverahub_pin_token',
  EXPIRES_KEY: 'neverahub_pin_expires',
  currentPinInput: '',
  isLocked: false,

  init() {
    this.bindKeypad();
    this.checkSession();
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY) || '';
  },

  hasToken() {
    const token = this.getToken();
    const expires = parseInt(localStorage.getItem(this.EXPIRES_KEY) || sessionStorage.getItem(this.EXPIRES_KEY) || '0', 10);
    if (!token) return false;
    if (expires && expires < Date.now()) {
      this.clearSession();
      return false;
    }
    return true;
  },

  async checkSession() {
    if (this.hasToken()) {
      try {
        const res = await fetch('/api/auth/check', {
          headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await res.json();
        if (data.authenticated) {
          this.unlockUI();
          return true;
        }
      } catch (e) {
        // En caso de fallo de red o modo offline en la tablet, si hay token local válido, permitir acceso
        if (this.hasToken()) {
          this.unlockUI();
          return true;
        }
      }
    }

    // No autenticado: bloquear UI y solicitar PIN
    this.lockUI();
    return false;
  },

  lockUI() {
    this.isLocked = true;
    this.currentPinInput = '';
    this.updateDots();
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.remove('hidden');
    }
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.style.display = 'none';
    const statusEl = document.getElementById('pin-status-text');
    if (statusEl) statusEl.textContent = 'Introduce el PIN familiar para acceder';
  },

  unlockUI() {
    this.isLocked = false;
    this.currentPinInput = '';
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => {
        if (!this.isLocked) overlay.style.display = 'none';
      }, 300);
    }
  },

  bindKeypad() {
    window.addEventListener('keydown', (e) => {
      if (!this.isLocked) return;
      if (e.key >= '0' && e.key <= '9') {
        this.pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        this.deleteDigit();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        this.clearDigits();
      }
    });
  },

  pressDigit(digit) {
    if (this.currentPinInput.length >= 6) return;
    this.currentPinInput += String(digit);
    this.updateDots();

    // Si alcanza 4 dígitos, verificar automáticamente
    if (this.currentPinInput.length === 4) {
      setTimeout(() => this.submitPin(), 120);
    }
  },

  deleteDigit() {
    if (this.currentPinInput.length > 0) {
      this.currentPinInput = this.currentPinInput.slice(0, -1);
      this.updateDots();
    }
  },

  clearDigits() {
    this.currentPinInput = '';
    this.updateDots();
    const errEl = document.getElementById('pin-error-msg');
    if (errEl) errEl.style.display = 'none';
  },

  updateDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
      if (idx < this.currentPinInput.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  },

  async submitPin() {
    const pin = this.currentPinInput;
    const rememberCheckbox = document.getElementById('pin-remember-device');
    const remember = rememberCheckbox ? rememberCheckbox.checked : true;

    const statusEl = document.getElementById('pin-status-text');
    const errEl = document.getElementById('pin-error-msg');

    if (statusEl) statusEl.textContent = 'Verificando código...';

    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        if (remember) {
          localStorage.setItem(this.TOKEN_KEY, data.token);
          localStorage.setItem(this.EXPIRES_KEY, String(data.expiresAt));
        } else {
          sessionStorage.setItem(this.TOKEN_KEY, data.token);
          sessionStorage.setItem(this.EXPIRES_KEY, String(data.expiresAt));
        }

        if (statusEl) statusEl.textContent = '¡Acceso concedido!';
        this.unlockUI();

        // Refrescar datos autorizados
        if (window.NeveraApp && typeof window.NeveraApp.refreshAllData === 'function') {
          window.NeveraApp.refreshAllData();
        }
      } else {
        this.showError(data.error || 'PIN incorrecto. Inténtalo de nuevo.');
      }
    } catch (err) {
      this.showError('Error al contactar con el servidor. Inténtalo de nuevo.');
    } finally {
      if (statusEl && this.isLocked) {
        statusEl.textContent = 'Introduce el PIN familiar para acceder';
      }
    }
  },

  showError(msg) {
    const errEl = document.getElementById('pin-error-msg');
    const keypad = document.getElementById('pin-keypad-box');

    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    if (keypad) {
      keypad.classList.add('shake');
      setTimeout(() => keypad.classList.remove('shake'), 500);
    }

    this.currentPinInput = '';
    this.updateDots();
  },

  lock() {
    this.clearSession();
    this.lockUI();
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXPIRES_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.EXPIRES_KEY);
  }
};

window.NeveraAuth = NeveraAuth;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NeveraAuth.init());
} else {
  NeveraAuth.init();
}
