const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const app = require('../server/server');
const authService = require('../server/authService');

let server;
let baseUrl;

test.before((t, done) => {
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
    done();
  });
});

test.after((t, done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

test('Auth: Verificación de PIN incorrecto devuelve 401', async () => {
  const res = await fetch(`${baseUrl}/auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '9999' })
  });

  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.ok, false);
  assert.ok(data.error.includes('incorrecto'));
});

test('Auth: Verificación de PIN correcto devuelve 200 y token de sesión', async () => {
  const correctPin = authService.getFamilyPin();
  const res = await fetch(`${baseUrl}/auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: correctPin })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.ok(data.token);
  assert.ok(typeof data.token === 'string');
  assert.ok(data.expiresAt > Date.now());

  // Probar validación de token
  const checkRes = await fetch(`${baseUrl}/auth/check`, {
    headers: { 'Authorization': `Bearer ${data.token}` }
  });
  const checkData = await checkRes.json();
  assert.strictEqual(checkData.authenticated, true);
});

test('Auth: Token no válido o ausente devuelve authenticated: false', async () => {
  const checkRes = await fetch(`${baseUrl}/auth/check`, {
    headers: { 'Authorization': `Bearer token_invalido_123` }
  });
  const checkData = await checkRes.json();
  assert.strictEqual(checkData.authenticated, false);
});

test('Auth: Middleware bloquea rutas protegidas si se exige autenticación y no hay token', async () => {
  const res = await fetch(`${baseUrl}/inventory`, {
    headers: { 'x-require-auth-test': 'true' }
  });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.code, 'PIN_REQUIRED');
});

test('Auth: Middleware permite acceso a rutas protegidas con Bearer token válido', async () => {
  const correctPin = authService.getFamilyPin();
  const authRes = await fetch(`${baseUrl}/auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: correctPin })
  });
  const { token } = await authRes.json();

  const res = await fetch(`${baseUrl}/inventory`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-require-auth-test': 'true'
    }
  });
  assert.strictEqual(res.status, 200);
  const items = await res.json();
  assert.ok(Array.isArray(items));
});
