const test = require('node:test');
const assert = require('node:assert');
const db = require('../server/db');

test('Base de Datos Local: CRUD de eventos familiares', () => {
  const newEvent = db.add('events', {
    title: 'Test Fiesta Colegio',
    memberId: 'm3',
    date: '2026-09-15',
    startTime: '16:00',
    endTime: '18:00'
  });

  assert.ok(newEvent.id, 'El evento debe recibir un ID único');
  
  const fetched = db.get('events').find(e => e.id === newEvent.id);
  assert.strictEqual(fetched.title, 'Test Fiesta Colegio');

  // Actualizar
  const updated = db.update('events', newEvent.id, { title: 'Test Fiesta Actualizada' });
  assert.strictEqual(updated.title, 'Test Fiesta Actualizada');

  // Eliminar
  const deleted = db.remove('events', newEvent.id);
  assert.strictEqual(deleted, true);
  const checkRemoved = db.get('events').find(e => e.id === newEvent.id);
  assert.strictEqual(checkRemoved, undefined);
});

test('Base de Datos Local: Conmutación de hábitos diarios y persistencia', () => {
  const today = '2026-09-06';
  const habitId = 'h1';

  if (db.data.habitLogs && db.data.habitLogs[today]) {
    delete db.data.habitLogs[today][habitId];
  }

  const res1 = db.toggleHabitLog(habitId, today);
  assert.strictEqual(res1.completed, true);

  let logs = db.getHabitLogs(today);
  assert.strictEqual(logs[habitId], true);

  const res2 = db.toggleHabitLog(habitId, today);
  assert.strictEqual(res2.completed, false);

  logs = db.getHabitLogs(today);
  assert.strictEqual(logs[habitId], false);
});
