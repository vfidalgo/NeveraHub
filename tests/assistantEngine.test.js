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

  // Consulta menú infantil general
  const resNinos = assistantEngine.processQuery('¿Qué comen los niños en el colegio?', db, refDate);
  assert.strictEqual(resNinos.actionType, 'menu');
  assert.ok(resNinos.spokenResponse.toLowerCase().includes('lentejas') || resNinos.spokenResponse.toLowerCase().includes('guille'));

  // Consulta menú individual de Guille y Samuel
  const expectedGuilleMeal = db.getAll().menus.monday.guilleLunch;
  const resGuille = assistantEngine.processQuery('¿Qué come Guille hoy?', db, refDate);
  assert.strictEqual(resGuille.actionType, 'menu');
  assert.ok(resGuille.spokenResponse.includes('Guille'));
  assert.ok(resGuille.spokenResponse.includes(expectedGuilleMeal));

  const resSamuel = assistantEngine.processQuery('¿Qué come Samuel hoy?', db, refDate);
  assert.strictEqual(resSamuel.actionType, 'menu');
  assert.ok(resSamuel.spokenResponse.includes('Samuel'));
  assert.ok(resSamuel.spokenResponse.includes('guardería') || resSamuel.spokenResponse.includes('Puré'));
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

test('Asistente Virtual: Consumo parcial de unidades y consulta de stock', () => {
  const refDate = new Date('2026-09-06T12:00:00Z');
  
  // Limpiar cualquier residuo previo antes de empezar
  db.getAll().inventory = (db.getAll().inventory || []).filter(i => !i.name.includes('test'));
  db.saveData();

  // 1. Añadir 12 huevos para la prueba con nombre único
  const newItem = db.add('inventory', {
    name: 'Huevos de granja test',
    category: 'dairy',
    location: 'fridge',
    quantity: '12 huevos',
    totalUnits: 12,
    remainingUnits: 12,
    unitName: 'huevos',
    consumedHistory: [],
    addedDate: '2026-09-04',
    expiryDate: '2026-09-25'
  });

  try {
    // 2. "Ayer consumí 4 huevos de granja test"
    const res1 = assistantEngine.processQuery('Ayer consumí 4 huevos de granja test', db, refDate);
    assert.strictEqual(res1.actionTaken, true);
    assert.strictEqual(res1.actionType, 'inventory_consume_partial');
    assert.ok(res1.spokenResponse.includes('4'));
    assert.ok(res1.spokenResponse.includes('8')); // quedan 8
    assert.ok(res1.spokenResponse.includes('ayer'));

    // 3. "Hoy he consumido 2 huevos de granja test"
    const res2 = assistantEngine.processQuery('He consumido 2 huevos de granja test', db, refDate);
    assert.strictEqual(res2.actionTaken, true);
    assert.strictEqual(res2.actionType, 'inventory_consume_partial');
    assert.ok(res2.spokenResponse.includes('2'));
    assert.ok(res2.spokenResponse.includes('6')); // quedan 6

    // 4. "¿Cuántos huevos de granja test quedan?"
    const res3 = assistantEngine.processQuery('¿Cuántos huevos de granja test quedan?', db, refDate);
    assert.strictEqual(res3.actionTaken, false);
    assert.strictEqual(res3.actionType, 'inventory_stock');
    assert.ok(res3.spokenResponse.includes('6')); // quedan 6
    assert.ok(res3.spokenResponse.includes('12')); // de 12 iniciales
  } finally {
    // 5. Limpieza garantizada
    db.remove('inventory', newItem.id);
  }
});

test('Asistente Virtual: Actualización de Menú Infantil y Cenas por Voz', () => {
  const refDate = new Date('2026-09-07T12:00:00Z'); // Lunes
  const backupMenus = JSON.parse(JSON.stringify(db.getAll().menus || {}));

  try {
    // 1. "Apunta el menu de guillermo para el lunes, merluza y pasta"
    const resGuille = assistantEngine.processQuery('Apunta el menu de guillermo para el lunes, merluza y pasta', db, refDate);
    assert.strictEqual(resGuille.actionTaken, true);
    assert.strictEqual(resGuille.actionType, 'menu_update');
    assert.ok(resGuille.spokenResponse.includes('Guille'));
    assert.ok(resGuille.spokenResponse.includes('Merluza y pasta'));
    assert.ok(resGuille.spokenResponse.includes('lunes'));
    
    const mondayMenu = db.getAll().menus.monday;
    assert.strictEqual(mondayMenu.guilleLunch, 'Merluza y pasta');
    assert.ok(mondayMenu.kidsLunch.includes('Guille: Merluza y pasta'));

    // 2. "Apunta el menu de Samuel para el martes puré de verduras con pollo"
    const resSamu = assistantEngine.processQuery('Apunta el menu de Samuel para el martes puré de verduras con pollo', db, refDate);
    assert.strictEqual(resSamu.actionTaken, true);
    assert.strictEqual(resSamu.actionType, 'menu_update');
    assert.ok(resSamu.spokenResponse.includes('Samuel'));
    assert.ok(resSamu.spokenResponse.includes('Puré de verduras con pollo'));
    assert.ok(resSamu.spokenResponse.includes('martes'));

    const tuesdayMenu = db.getAll().menus.tuesday;
    assert.strictEqual(tuesdayMenu.samuelLunch, 'Puré de verduras con pollo');

    // 3. "Pon de cena el jueves tortilla de patatas"
    const resCena = assistantEngine.processQuery('Pon de cena el jueves tortilla de patatas', db, refDate);
    assert.strictEqual(resCena.actionTaken, true);
    assert.strictEqual(resCena.actionType, 'menu_update');
    assert.ok(resCena.spokenResponse.toLowerCase().includes('tortilla de patatas'));
    assert.ok(resCena.spokenResponse.includes('jueves'));

    const thursdayMenu = db.getAll().menus.thursday;
    assert.strictEqual(thursdayMenu.dinner, 'Tortilla de patatas');
  } finally {
    db.getAll().menus = backupMenus;
    db.saveData();
  }
});

test('Asistente Virtual: Flujo Conversacional Multi-Turno para Menús (pregunta día y comida)', () => {
  const refDate = new Date('2026-09-07T12:00:00Z'); // Lunes
  const backupMenus = JSON.parse(JSON.stringify(db.getAll().menus || {}));
  assistantEngine.resetConversation();

  try {
    // Turno 1: "Apunta menú para Samuel" -> Pregunta el día
    const res1 = assistantEngine.processQuery('Apunta menú para Samuel', db, refDate);
    assert.strictEqual(res1.actionTaken, false);
    assert.strictEqual(res1.inConversationFlow, true);
    assert.strictEqual(res1.expectedInput, 'day');
    assert.ok(res1.spokenResponse.includes('Samuel'));
    assert.ok(res1.spokenResponse.includes('día'));
    assert.ok(Array.isArray(res1.suggestionChips));
    assert.ok(res1.suggestionChips.includes('Martes'));

    // Turno 2: "Para el martes" -> Pregunta el plato
    const res2 = assistantEngine.processQuery('Para el martes', db, refDate);
    assert.strictEqual(res2.actionTaken, false);
    assert.strictEqual(res2.inConversationFlow, true);
    assert.strictEqual(res2.expectedInput, 'dish');
    assert.ok(res2.spokenResponse.includes('Samuel'));
    assert.ok(res2.spokenResponse.includes('martes'));

    // Turno 3: "Puré de calabacín con lenguado" -> Guarda en base de datos y confirma
    const res3 = assistantEngine.processQuery('Puré de calabacín con lenguado', db, refDate);
    assert.strictEqual(res3.actionTaken, true);
    assert.strictEqual(res3.actionType, 'menu_update');
    assert.strictEqual(res3.inConversationFlow, false);
    assert.ok(res3.spokenResponse.includes('Puré de calabacín con lenguado'));
    assert.ok(res3.spokenResponse.includes('Samuel'));
    assert.ok(res3.spokenResponse.includes('martes'));

    const tuesdayMenu = db.getAll().menus.tuesday;
    assert.strictEqual(tuesdayMenu.samuelLunch, 'Puré de calabacín con lenguado');
  } finally {
    assistantEngine.resetConversation();
    db.getAll().menus = backupMenus;
    db.saveData();
  }
});

test('Asistente Virtual: Flujo Conversacional Cancelación por el usuario', () => {
  const refDate = new Date('2026-09-07T12:00:00Z');
  assistantEngine.resetConversation();

  // Iniciar flujo
  const res1 = assistantEngine.processQuery('Apunta la cena', db, refDate);
  assert.strictEqual(res1.inConversationFlow, true);
  assert.strictEqual(assistantEngine.isConversationActive(), true);

  // Cancelar
  const resCancel = assistantEngine.processQuery('cancela', db, refDate);
  assert.strictEqual(resCancel.actionType, 'conversation_cancel');
  assert.strictEqual(resCancel.inConversationFlow, false);
  assert.strictEqual(assistantEngine.isConversationActive(), false);
  assert.ok(resCancel.spokenResponse.includes('cancelado'));
});

test('Asistente Virtual: Flujo Conversacional para Consumo de Inventario con Unidades Múltiples', () => {
  const refDate = new Date('2026-09-06T12:00:00Z');
  assistantEngine.resetConversation();

  db.getAll().inventory = (db.getAll().inventory || []).filter(i => !i.name.includes('test'));
  db.saveData();

  const newItem = db.add('inventory', {
    name: 'Huevos ecológicos multi-test',
    category: 'dairy',
    location: 'fridge',
    quantity: '12 huevos',
    totalUnits: 12,
    remainingUnits: 12,
    unitName: 'huevos',
    consumedHistory: [],
    addedDate: '2026-09-04',
    expiryDate: '2026-09-25'
  });

  try {
    // Turno 1: "He consumido huevos ecológicos multi-test" (sin especificar cantidad) -> Pregunta cuántas unidades
    const res1 = assistantEngine.processQuery('He consumido huevos ecológicos multi-test', db, refDate);
    assert.strictEqual(res1.actionTaken, false);
    assert.strictEqual(res1.inConversationFlow, true);
    assert.strictEqual(res1.expectedInput, 'amount');
    assert.ok(res1.spokenResponse.includes('unidades'));
    assert.ok(res1.spokenResponse.includes('12'));

    // Turno 2: "2" -> Descuenta 2 unidades
    const res2 = assistantEngine.processQuery('2', db, refDate);
    assert.strictEqual(res2.actionTaken, true);
    assert.strictEqual(res2.actionType, 'inventory_consume_partial');
    assert.strictEqual(res2.inConversationFlow, false);
    assert.ok(res2.spokenResponse.includes('2'));
    assert.ok(res2.spokenResponse.includes('10')); // quedan 10
  } finally {
    assistantEngine.resetConversation();
    db.remove('inventory', newItem.id);
  }
});