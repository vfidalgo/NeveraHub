const crypto = require('crypto');
const db = require('./db');

const DEFAULT_PIN = '1234';
const TOKEN_EXPIRY_DAYS = 90;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Secreto para firmar tokens (persistente por variable o fallback estable)
const TOKEN_SECRET = process.env.AUTH_SECRET || process.env.FAMILY_PIN || 'neverahub_secret_family_key_2026';

class AuthService {
  getFamilyPin() {
    return process.env.FAMILY_PIN || (db.getAll().kioskSettings && db.getAll().kioskSettings.familyPin) || DEFAULT_PIN;
  }

  isPinSecurityEnabled() {
    return process.env.FAMILY_PIN_DISABLED !== 'true';
  }

  getSecret() {
    return `${TOKEN_SECRET}_${this.getFamilyPin()}`;
  }

  // Genera un token HMAC sin estado (stateless)
  // Inmune a reinicios de servidor y reciclado de funciones Serverless en Vercel
  generateToken(expiresAt) {
    const createdAt = Date.now();
    const payload = `${expiresAt}.${createdAt}`;
    const hmac = crypto.createHmac('sha256', this.getSecret()).update(payload).digest('hex');
    return `${payload}.${hmac}`;
  }

  verifyPin(inputPin) {
    if (!inputPin) return { ok: false, error: 'Se requiere introducir un PIN' };
    const cleanInput = String(inputPin).trim();
    const correctPin = String(this.getFamilyPin()).trim();

    if (cleanInput !== correctPin) {
      return { ok: false, error: 'PIN incorrecto. Inténtalo de nuevo.' };
    }

    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    const token = this.generateToken(expiresAt);

    return {
      ok: true,
      token,
      expiresAt,
      message: 'PIN verificado correctamente'
    };
  }

  validateToken(token) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.trim();

    // 1. Validación de token criptográfico HMAC sin estado
    try {
      const parts = cleanToken.split('.');
      if (parts.length === 3) {
        const [expiresAtStr, createdAtStr, signature] = parts;
        const expiresAt = parseInt(expiresAtStr, 10);

        // Comprobar si ha expirado
        if (isNaN(expiresAt) || expiresAt <= Date.now()) {
          return false;
        }

        // Comprobar firma criptográfica
        const payload = `${expiresAtStr}.${createdAtStr}`;
        const expectedHmac = crypto.createHmac('sha256', this.getSecret()).update(payload).digest('hex');

        if (signature.length === expectedHmac.length &&
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
          return true;
        }
      }
    } catch (e) {
      // Continuar con comprobación de respaldo
    }

    // 2. Comprobación de respaldo para tokens heredados en base de datos local
    try {
      const all = db.getAll();
      if (all.authTokens && all.authTokens[cleanToken]) {
        const info = all.authTokens[cleanToken];
        if (info.expiresAt > Date.now()) {
          return true;
        }
      }
    } catch (e) {}

    return false;
  }

  changePin(currentPin, newPin) {
    const currentCorrect = String(this.getFamilyPin()).trim();
    if (String(currentPin).trim() !== currentCorrect) {
      return { ok: false, error: 'El PIN actual es incorrecto' };
    }
    const cleanNew = String(newPin).trim();
    if (!/^\d{4,6}$/.test(cleanNew)) {
      return { ok: false, error: 'El nuevo PIN debe contener entre 4 y 6 dígitos numéricos' };
    }

    const all = db.getAll();
    if (!all.kioskSettings) all.kioskSettings = {};
    all.kioskSettings.familyPin = cleanNew;
    db.saveData();

    return { ok: true, message: 'PIN familiar actualizado con éxito' };
  }

  // Middleware para Express
  getMiddleware() {
    return (req, res, next) => {
      // Si la seguridad está desactivada explícitamente
      if (!this.isPinSecurityEnabled()) {
        return next();
      }

      // Rutas públicas de autenticación
      if (req.path.startsWith('/auth')) {
        return next();
      }

      // Extraer token de las cabeceras
      let token = null;
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (req.headers['x-family-token']) {
        token = req.headers['x-family-token'];
      }

      // Validar token
      if (token && this.validateToken(token)) {
        req.isAuthenticated = true;
        return next();
      }

      // En tests automáticos permitir bypass si no se exige explícitamente en el test
      if (process.env.NODE_ENV === 'test' && !req.headers['x-require-auth-test']) {
        return next();
      }

      return res.status(401).json({
        ok: false,
        error: 'Se requiere PIN familiar para acceder a NeveraHub',
        code: 'PIN_REQUIRED'
      });
    };
  }
}

module.exports = new AuthService();
