/**
 * Gestor de Notificaciones y Sincronización en Tiempo Real
 */

const NeveraNotify = {
  eventSource: null,

  init() {
    this.registerServiceWorker();
    this.initSSE();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service Worker no registrado:', err);
      });
    }
  },

  // Sincronización en tiempo real con la pantalla de la nevera
  initSSE() {
    if (!window.EventSource) return;
    try {
      const streamUrl = window.getNeveraApiUrl ? window.getNeveraApiUrl('/api/notifications/stream') : '/api/notifications/stream';
      this.eventSource = new EventSource(streamUrl);
      this.eventSource.addEventListener('notification', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.displayInAppToast(data.title, data.message);

          // Si corre en la App Nativa de Android, disparar notificación en la barra de Android
          if (window.AndroidBridge && typeof window.AndroidBridge.showNotification === 'function') {
            window.AndroidBridge.showNotification(data.title, data.message);
          }

          // Refrescar datos en pantalla automáticamente
          if (window.NeveraApp) {
            window.NeveraApp.refreshAllData(true);
          }
        } catch (err) {
          console.error('Error parseando notificación SSE:', err);
        }
      });

      this.eventSource.addEventListener('security_alert', (e) => {
        try {
          const alert = JSON.parse(e.data);
          this.displayInAppToast('🚨 ALERTA DE SEGURIDAD', 'Persona no identificada en la nevera. Foto capturada.');
          if (window.AndroidBridge && typeof window.AndroidBridge.showNotification === 'function') {
            window.AndroidBridge.showNotification('🚨 Alerta Nevera: Persona no identificada', 'Se ha tomado una foto de seguridad');
          }
        } catch (err) {
          console.error('Error parseando security_alert SSE:', err);
        }
      });
    } catch (e) {
      console.warn('SSE no disponible en este entorno.');
    }
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      alert('Este navegador no soporta notificaciones de escritorio/móvil.');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('🧊 NeveraHub Conectado', {
        body: '¡Notificaciones activadas en este dispositivo!',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>'
      });
      return true;
    }
    return false;
  },

  async sendTestNotification() {
    try {
      const testUrl = window.getNeveraApiUrl ? window.getNeveraApiUrl('/api/notifications/test') : '/api/notifications/test';
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔 Notificación Familiar de Prueba',
          message: '¡Prueba exitosa! Este aviso llega a todos los móviles conectados a NeveraHub.'
        })
      });
      const data = await res.json();
      return data.ok;
    } catch (err) {
      console.error('Error enviando test push:', err);
      return false;
    }
  },

  displayInAppToast(title, message) {
    const toast = document.createElement('div');
    toast.className = 'kiosk-toast';
    toast.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px;">${title}</div>
      <div style="font-size:0.9rem; opacity:0.9;">${message}</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  NeveraNotify.init();
});
