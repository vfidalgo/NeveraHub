const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const recipeEngine = require('./recipeEngine');
const assistantEngine = require('./assistantEngine');
const visionEngine = require('./visionEngine');
const notificationService = require('./notificationService');
const supabaseClient = require('./supabaseClient');
const authService = require('./authService');

// -------------------------------------------------------------
// AUTENTICACIÓN Y SEGURIDAD POR PIN FAMILIAR
// -------------------------------------------------------------
router.post('/auth/verify-pin', (req, res) => {
  const { pin } = req.body || {};
  const result = authService.verifyPin(pin);
  if (result.ok) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
});

router.get('/auth/check', (req, res) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-family-token']) {
    token = req.headers['x-family-token'];
  }

  const isValid = authService.validateToken(token);
  res.json({
    ok: true,
    authenticated: isValid,
    pinEnabled: authService.isPinSecurityEnabled()
  });
});

router.post('/auth/change-pin', (req, res) => {
  const { currentPin, newPin } = req.body || {};
  const result = authService.changePin(currentPin, newPin);
  if (result.ok) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// Proteger todas las rutas API siguientes con el middleware de PIN familiar
router.use(authService.getMiddleware());

// -------------------------------------------------------------
// ESTADO GENERAL (Para el Dashboard y dispositivos móviles)
// -------------------------------------------------------------
router.get('/status', (req, res) => {
  const members = db.get('members');
  const events = db.get('events');
  const habits = db.get('habits');
  const inventory = db.get('inventory');
  const kioskSettings = db.getAll().kioskSettings || {};
  
  const todayStr = new Date().toISOString().split('T')[0];
  const habitLogs = db.getHabitLogs(todayStr);

  const analyzedInventory = recipeEngine.analyzeInventory(inventory, todayStr);
  const urgentCount = analyzedInventory.filter(i => i.urgencyWeight >= 2).length;

  // Hábitos completados hoy
  const activeHabits = habits.filter(h => h.active !== false);
  const completedToday = activeHabits.filter(h => !!habitLogs[h.id]).length;
  const habitProgress = activeHabits.length > 0 ? Math.round((completedToday / activeHabits.length) * 100) : 100;

  // Eventos de hoy
  const todayEvents = events.filter(e => e.date === todayStr);

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    today: todayStr,
    membersCount: members.length,
    urgentItemsCount: urgentCount,
    habitProgress,
    activeHabitsCount: activeHabits.length,
    completedHabitsCount: completedToday,
    todayEvents,
    kioskSettings,
    notificationTopic: 'neverahub-familia-alerta'
  });
});

// -------------------------------------------------------------
// STREAM EN TIEMPO REAL (SSE) PARA SINCRONIZACIÓN FAMILIAR
// -------------------------------------------------------------
router.get('/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  notificationService.addClient(res);
  res.write(`data: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`);
});

// -------------------------------------------------------------
// ENVIAR NOTIFICACIÓN DE PRUEBA A LA FAMILIA
// -------------------------------------------------------------
router.post('/notifications/test', async (req, res) => {
  const { title, message } = req.body;
  const result = await notificationService.sendPushNotification({
    title: title || '🔔 Prueba de Notificación NeveraHub',
    message: message || '¡Si ves este aviso, la conexión entre tu móvil y la pantalla de la nevera funciona perfectamente!',
    tags: ['bell', 'family']
  });
  res.json({ ok: true, result });
});

// -------------------------------------------------------------
// MIEMBROS FAMILIARES
// -------------------------------------------------------------
router.get('/members', (req, res) => {
  const members = db.get('members');
  res.json(members);
});

router.post('/members', (req, res) => {
  const { name, role, color, avatar } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  const newMember = db.add('members', {
    name,
    role: role || 'child',
    color: color || '#3B82F6',
    avatar: avatar || '👤',
    order: (db.get('members').length || 0) + 1
  });
  res.status(201).json(newMember);
});

router.put('/members/:id', (req, res) => {
  const updated = db.update('members', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Miembro no encontrado' });
  res.json(updated);
});

router.delete('/members/:id', (req, res) => {
  const success = db.remove('members', req.params.id);
  if (!success) return res.status(404).json({ error: 'Miembro no encontrado' });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// CALENDARIO FAMILIAR
// -------------------------------------------------------------
router.get('/events', (req, res) => {
  let events = db.get('events');
  const { memberId, date, fromDate, toDate } = req.query;

  if (memberId && memberId !== 'all') {
    events = events.filter(e => e.memberId === memberId || e.memberId === 'all');
  }
  if (date) {
    events = events.filter(e => e.date === date);
  }
  if (fromDate && toDate) {
    events = events.filter(e => e.date >= fromDate && e.date <= toDate);
  }

  // Ordenar por fecha y hora
  events.sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  res.json(events);
});

router.post('/events', (req, res) => {
  const { title, memberId, date, startTime, endTime, notes } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'Título y fecha son requeridos' });
  }
  const newEvent = db.add('events', {
    title,
    memberId: memberId || 'all',
    date,
    startTime: startTime || '09:00',
    endTime: endTime || '10:00',
    notes: notes || ''
  });

  // Notificar a todos los móviles de la familia
  const member = db.get('members').find(m => m.id === newEvent.memberId);
  const memberName = member ? member.name : 'Familia';
  notificationService.notifyNewEvent(newEvent, memberName);

  // Sincronizar en la nube si Supabase está conectado
  supabaseClient.syncEventToCloud(newEvent);

  res.status(201).json(newEvent);
});

router.put('/events/:id', (req, res) => {
  const updated = db.update('events', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json(updated);
});

router.delete('/events/:id', (req, res) => {
  const success = db.remove('events', req.params.id);
  if (!success) return res.status(404).json({ error: 'Evento no encontrado' });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// HÁBITOS Y CHECKLIST DIARIO
// -------------------------------------------------------------
router.get('/habits', (req, res) => {
  const habits = db.get('habits');
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];
  const logs = db.getHabitLogs(targetDate);

  const habitsWithStatus = habits.map(h => ({
    ...h,
    completed: !!logs[h.id]
  }));

  res.json({
    date: targetDate,
    habits: habitsWithStatus
  });
});

router.post('/habits/toggle', (req, res) => {
  const { habitId, date } = req.body;
  if (!habitId) return res.status(400).json({ error: 'habitId es requerido' });
  const targetDate = date || new Date().toISOString().split('T')[0];
  const result = db.toggleHabitLog(habitId, targetDate);

  // Si se completó, emitir felicitación / aviso
  if (result.completed) {
    const habit = db.get('habits').find(h => h.id === habitId);
    if (habit) {
      const member = db.get('members').find(m => m.id === habit.memberId);
      const memberName = member ? member.name : 'Alguien';
      notificationService.notifyHabitCompleted(habit.title, memberName);
    }
  }

  res.json(result);
});

router.post('/habits', (req, res) => {
  const { memberId, title, period, icon } = req.body;
  if (!memberId || !title) return res.status(400).json({ error: 'Miembro y título son requeridos' });
  const newHabit = db.add('habits', {
    memberId,
    title,
    period: period || 'morning',
    icon: icon || '⭐',
    active: true
  });
  res.status(201).json(newHabit);
});

router.put('/habits/:id', (req, res) => {
  const updated = db.update('habits', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Hábito no encontrado' });
  res.json(updated);
});

router.delete('/habits/:id', (req, res) => {
  const success = db.remove('habits', req.params.id);
  if (!success) return res.status(404).json({ error: 'Hábito no encontrado' });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// INVENTARIO DE NEVERA & DESPENSA
// -------------------------------------------------------------
router.get('/inventory', (req, res) => {
  const inventory = db.get('inventory');
  const todayStr = req.query.date || new Date().toISOString().split('T')[0];
  const analyzed = recipeEngine.analyzeInventory(inventory, todayStr);

  const { location, category, urgency } = req.query;
  let filtered = analyzed;

  if (location) {
    filtered = filtered.filter(i => i.location === location);
  }
  if (category) {
    filtered = filtered.filter(i => i.category === category);
  }
  if (urgency === 'urgent') {
    filtered = filtered.filter(i => i.urgencyWeight >= 2);
  }

  // Ordenar por fecha de caducidad más cercana
  filtered.sort((a, b) => a.daysLeft - b.daysLeft);

  res.json(filtered);
});

router.post('/inventory', (req, res) => {
  const { name, category, location, quantity, expiryDate } = req.body;
  if (!name || !expiryDate) {
    return res.status(400).json({ error: 'Nombre y fecha de caducidad son obligatorios' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const unitInfo = recipeEngine.parseQuantityUnits ? recipeEngine.parseQuantityUnits(quantity || '1 ud') : { totalUnits: 1, remainingUnits: 1, unitName: 'ud' };

  const newItem = db.add('inventory', {
    name,
    category: category || 'other',
    location: location || 'fridge',
    quantity: quantity || '1 ud',
    totalUnits: typeof req.body.totalUnits === 'number' ? req.body.totalUnits : unitInfo.totalUnits,
    remainingUnits: typeof req.body.remainingUnits === 'number' ? req.body.remainingUnits : unitInfo.remainingUnits,
    unitName: req.body.unitName || unitInfo.unitName,
    consumedHistory: Array.isArray(req.body.consumedHistory) ? req.body.consumedHistory : [],
    addedDate: todayStr,
    expiryDate
  });

  // Si vence en 2 días o menos, emitir alerta inmediata a la familia
  const days = recipeEngine.calculateDaysRemaining(expiryDate, todayStr);
  if (days <= 2) {
    notificationService.notifyUrgentExpiry(newItem);
  }

  // Sincronizar en la nube si Supabase está conectado
  supabaseClient.syncInventoryToCloud(newItem);

  res.status(201).json(newItem);
});

// Endpoint de consumo individualizado / parcial
router.post('/inventory/:id/consume', (req, res) => {
  const inventory = db.get('inventory');
  const item = inventory.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Producto no encontrado en el inventario' });

  let unitInfo = {
    totalUnits: typeof item.totalUnits === 'number' ? item.totalUnits : 1,
    remainingUnits: typeof item.remainingUnits === 'number' ? item.remainingUnits : 1,
    unitName: item.unitName || 'uds'
  };

  if (typeof item.totalUnits !== 'number' || typeof item.remainingUnits !== 'number') {
    const parsed = recipeEngine.parseQuantityUnits ? recipeEngine.parseQuantityUnits(item.quantity) : { totalUnits: 1, remainingUnits: 1, unitName: 'ud' };
    unitInfo.totalUnits = parsed.totalUnits;
    unitInfo.remainingUnits = parsed.remainingUnits;
    if (!item.unitName) unitInfo.unitName = parsed.unitName;
  }

  const amountRequested = typeof req.body.amount === 'number' ? req.body.amount : parseInt(req.body.amount || '1', 10);
  const amountToConsume = Math.max(1, isNaN(amountRequested) ? 1 : amountRequested);
  const consumeDate = req.body.date || new Date().toISOString().split('T')[0];
  const note = req.body.note || '';

  const actualConsumed = Math.min(amountToConsume, unitInfo.remainingUnits);
  const newRemaining = Math.max(0, unitInfo.remainingUnits - actualConsumed);

  if (!Array.isArray(item.consumedHistory)) {
    item.consumedHistory = [];
  }

  const logEntry = {
    id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    date: consumeDate,
    amount: actualConsumed,
    note: note
  };
  item.consumedHistory.push(logEntry);

  item.totalUnits = unitInfo.totalUnits;
  item.remainingUnits = newRemaining;
  item.unitName = unitInfo.unitName;

  if (newRemaining <= 0) {
    // Si ya no quedan unidades, retirar del inventario activo
    db.remove('inventory', item.id);
    return res.json({
      ok: true,
      finished: true,
      message: `Producto ${item.name} completamente consumido.`,
      consumedEntry: logEntry,
      remainingUnits: 0,
      totalUnits: unitInfo.totalUnits,
      item
    });
  } else {
    // Actualizar cantidad textual descriptiva y persistir
    item.quantity = `${newRemaining} ${unitInfo.unitName} (de ${unitInfo.totalUnits})`;
    const updated = db.update('inventory', item.id, item);
    return res.json({
      ok: true,
      finished: false,
      message: `Se han consumido ${actualConsumed} ${unitInfo.unitName} de ${item.name}. Quedan ${newRemaining}.`,
      consumedEntry: logEntry,
      remainingUnits: newRemaining,
      totalUnits: unitInfo.totalUnits,
      item: updated
    });
  }
});

router.put('/inventory/:id', (req, res) => {
  const updated = db.update('inventory', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(updated);
});

router.delete('/inventory/:id', (req, res) => {
  const success = db.remove('inventory', req.params.id);
  if (!success) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// MOTOR DE RECOMENDACIONES DE RECETAS
// -------------------------------------------------------------
router.get('/recipes/recommendations', (req, res) => {
  const inventory = db.get('inventory');
  const refDate = req.query.date || new Date().toISOString().split('T')[0];
  const recommendations = recipeEngine.getRecommendedRecipes(inventory, refDate);
  res.json(recommendations);
});

// -------------------------------------------------------------
// MENÚ SEMANAL (Escolar, Padres, Cenas)
// -------------------------------------------------------------
router.get('/menus', (req, res) => {
  const menus = db.getAll().menus || {};
  res.json(menus);
});

router.put('/menus', (req, res) => {
  const all = db.getAll();
  all.menus = { ...all.menus, ...req.body };
  db.saveData();
  if (req.body) {
    for (const [dayKey, menu] of Object.entries(req.body)) {
      supabaseClient.syncMenuToCloud(dayKey, menu);
    }
  }
  res.json(all.menus);
});

// -------------------------------------------------------------
// AJUSTES KIOSKO (Modo nocturno, brillo, etc.)
// -------------------------------------------------------------
router.get('/kiosk', (req, res) => {
  const settings = db.getAll().kioskSettings || {};
  res.json(settings);
});

router.put('/kiosk', (req, res) => {
  const all = db.getAll();
  all.kioskSettings = { ...all.kioskSettings, ...req.body };
  db.saveData();
  res.json(all.kioskSettings);
});

// -------------------------------------------------------------
// ASISTENTE VIRTUAL POR VOZ ("NeveraBot")
// -------------------------------------------------------------

router.post('/assistant/query', async (req, res) => {
  try {
    const { query, currentDate } = req.body;
    const refDate = currentDate ? new Date(currentDate) : new Date();
    const result = assistantEngine.processQuery(query, db, refDate);

    // Si el asistente ejecutó una acción, emitir evento SSE y Push a la familia
    if (result.actionTaken) {
      if (result.actionType === 'inventory_add' || result.actionType === 'inventory_consume') {
        notificationService.broadcastSSE({
          type: 'inventory_change',
          action: result.actionType,
          item: result.actionData
        });
      } else if (result.actionType === 'habit_toggle') {
        notificationService.broadcastSSE({
          type: 'habit_toggle',
          habitId: result.actionData.habitId,
          completed: result.actionData.completed
        });
      } else if (result.actionType === 'menu_update') {
        if (result.actionData && result.actionData.day && result.actionData.menu) {
          supabaseClient.syncMenuToCloud(result.actionData.day, result.actionData.menu);
        }
        notificationService.broadcastSSE({
          type: 'menu_updated',
          day: result.actionData.day,
          menu: result.actionData.menu
        });
      } else if (result.actionType === 'calendar_add') {
        notificationService.broadcastSSE({
          type: 'event_created',
          event: result.actionData
        });
        notificationService.sendPushNotification({
          title: '📅 Nuevo Evento desde la Nevera',
          message: `${result.actionData.title} (${result.actionData.date} a las ${result.actionData.startTime})`,
          tags: ['calendar', 'family']
        }).catch(() => {});
      }
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Error en asistente virtual:', err);
    res.status(500).json({
      ok: false,
      error: 'Error al procesar la consulta del asistente',
      spokenResponse: 'Ha ocurrido un error al procesar tu petición. Por favor, inténtalo de nuevo.'
    });
  }
});

router.post('/assistant/cancel-flow', (req, res) => {
  assistantEngine.resetConversation();
  res.json({ ok: true, message: 'Flujo conversacional cancelado' });
});

// -------------------------------------------------------------
// IDENTIFICACIÓN FACIAL CON GEMINI FLASH VISION
// -------------------------------------------------------------
router.post('/vision/identify', async (req, res) => {
  try {
    const { imageBase64, attemptNumber } = req.body;
    const result = await visionEngine.identifyMember(
      imageBase64,
      db,
      attemptNumber || 1,
      process.env.GEMINI_API_KEY
    );

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Error en identificación visual:', err);
    res.status(500).json({
      ok: false,
      error: 'Error al procesar la identificación visual',
      identified: false,
      spokenPrompt: 'Ha ocurrido un error con la cámara. Puedes seleccionar tu perfil tocando tu avatar arriba.'
    });
  }
});

// -------------------------------------------------------------
// ALERTAS DE SEGURIDAD Y FOTOS DE PERSONAS DESCONOCIDAS
// -------------------------------------------------------------
router.get('/security/alerts', (req, res) => {
  const alerts = db.get('securityAlerts') || [];
  res.json({ ok: true, alerts });
});

router.get('/security/captures/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '..', 'data', 'security_captures', safeFilename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Captura no encontrada' });
  }
});

module.exports = router;



