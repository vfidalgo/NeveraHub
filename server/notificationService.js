const https = require('https');
const http = require('http');

/**
 * Servicio de Notificaciones Familiares de NeveraHub
 * Soporta:
 * 1. Canal Push Instantáneo para móviles Android (ntfy / webhook sin registro ni costes)
 * 2. Server-Sent Events (SSE) para sincronización en tiempo real entre pantalla de nevera y móviles
 * 3. Notificaciones locales en PWA
 */
class NotificationService {
  constructor() {
    this.sseClients = [];
    // Canal familiar único por defecto (configurable en kioskSettings)
    this.defaultTopic = 'neverahub-familia-alerta';
  }

  // Registrar cliente SSE (móviles o tablet conectados)
  addClient(res) {
    this.sseClients.push(res);
    res.on('close', () => {
      this.sseClients = this.sseClients.filter(client => client !== res);
    });
  }

  // Enviar a todos los clientes SSE conectados
  broadcastSSE(eventType, data) {
    let eventName = eventType;
    let eventData = data;
    if (typeof eventType === 'object' && !data) {
      eventName = eventType.type || 'notification';
      eventData = eventType;
    }
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(eventData)}\n\n`;
    this.sseClients.forEach(client => {
      try {
        client.write(payload);
      } catch (err) {
        // Ignorar clientes desconectados
      }
    });
  }

  /**
   * Enviar notificación Push a los móviles Android de la familia
   * @param {Object} notification { title, message, priority, tags, clickUrl }
   */
  async sendPushNotification({ title, message, priority = 'default', tags = ['house'], topic = null }) {
    const targetTopic = topic || this.defaultTopic;
    const body = JSON.stringify({
      topic: targetTopic,
      title: title || 'NeveraHub Familiar',
      message: message || '',
      priority: priority === 'high' ? 4 : 3,
      tags: tags,
      actions: [
        {
          action: 'view',
          label: 'Abrir NeveraHub',
          url: 'http://localhost:3030'
        }
      ]
    });

    // 1. Notificar en vivo a todos los dispositivos abiertos por SSE
    this.broadcastSSE('notification', { title, message, priority, tags, timestamp: new Date().toISOString() });

    // 2. Enviar notificación push al canal de móviles Android
    return new Promise((resolve) => {
      const options = {
        hostname: 'ntfy.sh',
        port: 443,
        path: `/${targetTopic}`,
        method: 'POST',
        headers: {
          'Title': encodeURIComponent(title),
          'Priority': priority === 'high' ? 'high' : 'default',
          'Tags': tags.join(','),
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(message, 'utf8')
        },
        timeout: 3000
      };

      const req = https.request(options, (res) => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
      });

      req.on('error', (err) => {
        console.warn('Aviso: No se pudo conectar con servicio push externo (modo offline):', err.message);
        resolve({ ok: false, error: err.message, offline: true });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout ntfy push', offline: true });
      });

      req.write(message);
      req.end();
    });
  }

  // Notificación de nuevo evento de calendario
  notifyNewEvent(event, memberName) {
    return this.sendPushNotification({
      title: `📅 Nuevo evento familiar: ${event.title}`,
      message: `${memberName} añadió para el ${event.date} a las ${event.startTime}: "${event.title}".`,
      priority: 'default',
      tags: ['calendar', 'family']
    });
  }

  // Notificación de hábito o rutina completada
  notifyHabitCompleted(habitTitle, memberName) {
    return this.sendPushNotification({
      title: `⭐ ¡Hábito completado!`,
      message: `${memberName} ha completado "${habitTitle}" en la pantalla de la nevera.`,
      priority: 'default',
      tags: ['star', 'tada']
    });
  }

  // Notificación de producto a punto de caducar
  notifyUrgentExpiry(item) {
    return this.sendPushNotification({
      title: `🚨 Alimento por caducar en la nevera`,
      message: `¡Atención! "${item.name}" caduca el ${item.expiryDate}. ¡Aprovechad para cocinarlo!`,
      priority: 'high',
      tags: ['warning', 'knife_fork_plate']
    });
  }
}

module.exports = new NotificationService();
