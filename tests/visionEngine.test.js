const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/db');
const visionEngine = require('../server/visionEngine');

test('Visión: Identificación sin imagen o imagen inválida (Intento 1)', async () => {
  const res = await visionEngine.identifyMember('', db, 1);
  assert.strictEqual(res.identified, false);
  assert.strictEqual(res.attemptNumber, 1);
  assert.strictEqual(res.retryRequired, true);
  assert.ok(res.spokenPrompt.includes('mira a la cámara') || res.spokenPrompt.includes('ponte delante'));
});

test('Visión: Identificación sin imagen (Intento 2 - Sugerencia táctil)', async () => {
  const res = await visionEngine.identifyMember('noface_sample', db, 2);
  assert.strictEqual(res.identified, false);
  assert.strictEqual(res.attemptNumber, 2);
  assert.strictEqual(res.retryRequired, false);
  assert.ok(res.spokenPrompt.includes('avatar') || res.spokenPrompt.includes('perfil'));
});

test('Visión: Identificación de Niño (Guille - m3)', async () => {
  const res = await visionEngine.identifyMember('data:image/jpeg;base64,sample_guille_face_test_token_12345678901234567890', db, 1);
  assert.strictEqual(res.identified, true);
  assert.strictEqual(res.memberId, 'm3');
  assert.strictEqual(res.role, 'child');
  assert.strictEqual(res.suggestedView, 'habits');
  assert.ok(res.greeting.includes('Guille'));
});

test('Visión: Identificación de Niño pequeño (Samuel - m4)', async () => {
  const res = await visionEngine.identifyMember('data:image/jpeg;base64,sample_samuel_face_test_token_12345678901234567890', db, 1);
  assert.strictEqual(res.identified, true);
  assert.strictEqual(res.memberId, 'm4');
  assert.strictEqual(res.role, 'child');
  assert.strictEqual(res.suggestedView, 'habits');
  assert.ok(res.greeting.includes('Samuel'));
});

test('Visión: Identificación de Padre (Papá - m1)', async () => {
  const res = await visionEngine.identifyMember('data:image/jpeg;base64,sample_papa_face_test_token_12345678901234567890', db, 1);
  assert.strictEqual(res.identified, true);
  assert.strictEqual(res.memberId, 'm1');
  assert.strictEqual(res.role, 'parent');
  assert.strictEqual(res.suggestedView, 'dashboard');
  assert.ok(res.greeting.includes('Papá'));
});

test('Visión: Detección de persona desconocida (Alerta de Seguridad + Foto + Push)', async () => {
  const initialAlerts = (db.get('securityAlerts') || []).length;
  const res = await visionEngine.identifyMember('data:image/jpeg;base64,sample_stranger_face_token_12345678901234567890', db, 2);
  assert.strictEqual(res.identified, false);
  assert.strictEqual(res.isStranger, true);
  assert.ok(res.spokenPrompt.includes('no te reconozco') || res.spokenPrompt.includes('Quién eres'));
  assert.ok(res.captureUrl);
  
  const finalAlerts = db.get('securityAlerts') || [];
  assert.strictEqual(finalAlerts.length, initialAlerts + 1);
  assert.strictEqual(finalAlerts[finalAlerts.length - 1].id, res.alertId);
});