const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
process.env.NODE_ENV = 'test';
const app = require('../server/server');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

test('API REST: /api/status devuelve métricas y configuración de kiosko', async () => {
  const res = await fetch(`${baseUrl}/status`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.ok(typeof data.habitProgress === 'number');
  assert.ok(typeof data.urgentItemsCount === 'number');
  assert.ok(data.membersCount >= 4);
});

test('API REST: /api/members devuelve la lista de familiares', async () => {
  const res = await fetch(`${baseUrl}/members`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.length >= 4);
  assert.ok(data.some(m => m.name.includes('Guille')));
  assert.ok(data.some(m => m.name.includes('Samuel')));
});

test('API REST: /api/inventory y /api/recipes/recommendations funcionan coordinados', async () => {
  const resInv = await fetch(`${baseUrl}/inventory`);
  assert.strictEqual(resInv.status, 200);
  const inv = await resInv.json();
  assert.ok(Array.isArray(inv));

  const resRec = await fetch(`${baseUrl}/recipes/recommendations`);
  assert.strictEqual(resRec.status, 200);
  const recData = await resRec.json();
  assert.ok(Array.isArray(recData.recipes));
});

test('API REST: /api/menus permite consultar el menú semanal de la familia', async () => {
  const res = await fetch(`${baseUrl}/menus`);
  assert.strictEqual(res.status, 200);
  const menus = await res.json();
  assert.ok(menus.monday);
  assert.ok(menus.monday.guilleLunch);
  assert.ok(menus.monday.samuelLunch);
  assert.ok(menus.monday.kidsLunch);
  assert.ok(menus.monday.parentsLunch);
  assert.ok(menus.monday.dinner);
});

test('API REST: /api/assistant/query procesa consultas por voz y devuelve respuesta hablada y tarjeta', async () => {
  const res = await fetch(`${baseUrl}/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '¿Qué hay hoy de cenar?', currentDate: '2026-09-07T18:00:00Z' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.actionType, 'menu');
  assert.ok(typeof data.spokenResponse === 'string');
  assert.ok(data.spokenResponse.length > 5);
  assert.ok(data.card);
  assert.ok(data.card.title);
});

test('API REST: /api/vision/identify identifica a un miembro de la familia por imagen', async () => {
  const res = await fetch(`${baseUrl}/vision/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: 'data:image/jpeg;base64,sample_guille_camera_token_01234567890123456789',
      attemptNumber: 1
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.identified, true);
  assert.strictEqual(data.memberId, 'm3');
  assert.ok(typeof data.greeting === 'string');
});

test('API REST: /api/vision/identify detecta a una persona no identificada (desconocido) y alerta', async () => {
  const res = await fetch(`${baseUrl}/vision/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: 'data:image/jpeg;base64,sample_stranger_camera_token_01234567890123456789',
      attemptNumber: 2
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.identified, false);
  assert.strictEqual(data.isStranger, true);
  assert.ok(data.spokenPrompt.includes('no te reconozco') || data.spokenPrompt.includes('Quién eres'));
  assert.ok(data.captureUrl);
});

test('API REST: /api/security/alerts devuelve el listado de alertas de seguridad', async () => {
  const res = await fetch(`${baseUrl}/security/alerts`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.ok(Array.isArray(data.alerts));
  assert.ok(data.alerts.length > 0);
});


