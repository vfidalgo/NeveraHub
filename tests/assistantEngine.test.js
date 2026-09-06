const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/db');
const assistantEngine = require('../server/assistantEngine');

test('Asistente Virtual: Saludo y Resumen del Día', () => {
  const refDate = new Date('2026-09-07T08:00:00Z'); // Lunes
  const res = assistantEngine.processQuery('Buenos días Nevera', db, refDate);
  
  assert.strictEqual(res.actionTaken, false);
  assert.strictEqual(res.actionType, 'summary');
  assert.ok(res.spokenResponse.includes('Buenos días'));
  assert.ok(res.spokenResponse.includes('lunes'));
  assert.ok(res.card.title.includes('Resumen'));
});

test('Asistente Virtual: Consulta de Menús (Comida y Cena)', () => {
  const refDate = new Date('2026-09-07T12:00:00Z'); // Lunes
  
  // Consulta de cena
  const resCena = assistantEngine.processQuery('¿Qué hay hoy de cenar?', db, refDate);
  assert.strictEqual(resCena.actionType, 'menu');
  assert.ok(resCena.spokenResponse.toLowerCase().includes('pechuga de pollo') || resCena.spokenResponse.toLowerCase().includes('cena'));

  // Consulta menú infantil
  const resNinos = assistantEngine.processQuery('¿Qué comen los niños en el colegio?', db, refDate);
  assert.strictEqual(resNinos.actionType, 'menu');
  assert.ok(resNinos.spokenResponse.toLowerCase().includes('lentejas') || resNinos.spokenResponse.toLowerCase().includes('niños'));
});

test('Asistente Virtual: Recomendación de Recetas Anti-Desperdicio', () => {
  const refDate = new Date('2026-09-06T12:00:00Z');
  const res = assistantEngine.processQuery('¿Qué receta me recomiendas para hoy?', db, refDate);
  
  assert.strictEqual(res.actionType, 'recipe');
  assert.ok(res.spokenResponse.length > 10);
  assert.ok(res.card.title.includes('Recomendación'));
});

test('Asistente Virtual: Consulta de Caducidades', () => {
  const refDate = new Date('2026-09-06T12:00:00Z');
  const res = assistantEngine.processQuery('¿Qué alimentos caducan pronto?', db, refDate);
  
  assert.strictEqual(res.actionType, 'expiry');
  assert.ok(res.spokenResponse.length > 5);
  assert.ok(res.card.title.includes('Alimentos') || res.card.title.includes('Inventario'));
});

test('Asistente Virtual: Añadir Alimento al Inventario por Voz', () => {
  const refDate = new Date('2026-09-06T12:00:00Z');
  const res = assistantEngine.processQuery('Añade manzanas a la nevera', db, refDate);
  
  assert.strictEqual(res.actionTaken, true);
  assert.strictEqual(res.actionType, 'inventory_add');
  assert.ok(res.spokenResponse.includes('Manzanas'));
  assert.ok(res.spokenResponse.includes('nevera'));
  assert.strictEqual(res.actionData.name, 'Manzanas');
  assert.strictEqual(res.actionData.location, 'fridge');

  // Limpiar para no ensuciar DB de tests
  db.remove('inventory', res.actionData.id);
});

test('Asistente Virtual: Marcar Hábito Completado por Voz', () => {
  const refDate = new Date('2026-09-06T09:00:00Z'); // Mañana
  const res = assistantEngine.processQuery('Guille se ha lavado los dientes', db, refDate);
  
  assert.strictEqual(res.actionTaken, true);
  assert.strictEqual(res.actionType, 'habit_toggle');
  assert.ok(res.spokenResponse.includes('Guille'));
  assert.ok(res.spokenResponse.includes('completado'));
});

test('Asistente Virtual: Añadir Evento al Calendario por Voz', () => {
  const refDate = new Date('2026-09-06T10:00:00Z');
  const res = assistantEngine.processQuery('Añade cita pediatra para Samuel mañana a las 11:30', db, refDate);
  
  assert.strictEqual(res.actionTaken, true);
  assert.strictEqual(res.actionType, 'calendar_add');
  assert.ok(res.spokenResponse.includes('11:30'));
  assert.strictEqual(res.actionData.startTime, '11:30');
  assert.strictEqual(res.actionData.memberId, 'm4'); // Samuel (2 años)

  // Limpiar
  db.remove('events', res.actionData.id);
});

test('Asistente Virtual: Consulta sin coincidencia (Fallback)', () => {
  const res = assistantEngine.processQuery('cuéntame un chiste de marcianos', db);
  assert.strictEqual(res.actionTaken, false);
  assert.strictEqual(res.actionType, 'help');
  assert.ok(res.spokenResponse.includes('no estoy seguro'));
});