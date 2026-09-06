const test = require('node:test');
const assert = require('node:assert');
const notificationService = require('../server/notificationService');

test('Servicio de Notificaciones: Broadcast SSE registra y emite datos', () => {
  let writtenData = '';
  const mockClient = {
    write: (data) => {
      writtenData += data;
    },
    on: () => {}
  };

  notificationService.addClient(mockClient);
  assert.strictEqual(notificationService.sseClients.length, 1);

  notificationService.broadcastSSE('test-event', { msg: 'Hola Familia' });
  assert.ok(writtenData.includes('test-event'));
  assert.ok(writtenData.includes('Hola Familia'));

  // Limpiar
  notificationService.sseClients = [];
});

test('Servicio de Notificaciones: Envío push a canal familiar (formato y resiliencia)', async () => {
  const result = await notificationService.sendPushNotification({
    title: 'Test Familiar',
    message: 'Mensaje de verificación',
    tags: ['test']
  });

  // Debe responder o manejarlo con elegancia si no hay conexión externa
  assert.ok(result !== null);
  assert.ok(typeof result.ok === 'boolean');
});
