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

test('API REST: /api/inventory/:id/consume permite consumo individualizado y guarda historial de consumo', async () => {
  // 1. Crear producto con 12 huevos
  const createRes = await fetch(`${baseUrl}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Huevos de prueba',
      category: 'dairy',
      location: 'fridge',
      quantity: '12 huevos',
      expiryDate: '2026-09-30'
    })
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert.strictEqual(created.totalUnits, 12);
  assert.strictEqual(created.remainingUnits, 12);

  // 2. Consumo parcial 1: Ayer consumí 4 huevos
  const consumeRes1 = await fetch(`${baseUrl}/inventory/${created.id}/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 4,
      date: '2026-09-05',
      note: 'Tortilla familiar'
    })
  });
  assert.strictEqual(consumeRes1.status, 200);
  const data1 = await consumeRes1.json();
  assert.strictEqual(data1.ok, true);
  assert.strictEqual(data1.finished, false);
  assert.strictEqual(data1.remainingUnits, 8);
  assert.strictEqual(data1.item.consumedHistory.length, 1);
  assert.strictEqual(data1.item.consumedHistory[0].amount, 4);
  assert.strictEqual(data1.item.consumedHistory[0].date, '2026-09-05');

  // 3. Consumo parcial 2: Hoy consumí 2 huevos
  const consumeRes2 = await fetch(`${baseUrl}/inventory/${created.id}/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 2,
      date: '2026-09-06'
    })
  });
  assert.strictEqual(consumeRes2.status, 200);
  const data2 = await consumeRes2.json();
  assert.strictEqual(data2.ok, true);
  assert.strictEqual(data2.finished, false);
  assert.strictEqual(data2.remainingUnits, 6);
  assert.strictEqual(data2.item.consumedHistory.length, 2);

  // 4. Consumo total del restante: 6 huevos
  const consumeRes3 = await fetch(`${baseUrl}/inventory/${created.id}/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 6,
      date: '2026-09-06'
    })
  });
  assert.strictEqual(consumeRes3.status, 200);
  const data3 = await consumeRes3.json();
  assert.strictEqual(data3.ok, true);
  assert.strictEqual(data3.finished, true);
  assert.strictEqual(data3.remainingUnits, 0);

  // 5. Verificar que ya no está en el inventario activo
  const checkRes = await fetch(`${baseUrl}/inventory`);
  const allInv = await checkRes.json();
  assert.ok(!allInv.some(i => i.id === created.id));
});


