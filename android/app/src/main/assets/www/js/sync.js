/**
 * Capa de Sincronización y Persistencia Híbrida (Offline-First)
 * Permite que NeveraHub funcione tanto conectado a su servidor local como 100% offline
 * dentro del WebView de la tablet Android.
 */

const NeveraSync = {
  isOnline: true,
  apiBase: '/api',

  // Detectar si el backend responde
  async checkConnection() {
    try {
      const res = await fetch(`${this.apiBase}/status`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      this.isOnline = res.ok;
      return res.ok;
    } catch (e) {
      this.isOnline = false;
      return false;
    }
  },

  async request(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      
      // Guardar respaldo en caché local
      if (options.method === undefined || options.method === 'GET') {
        localStorage.setItem(`cache_${endpoint}`, JSON.stringify(data));
      }
      return data;
    } catch (err) {
      console.warn(`Modo offline activo para ${endpoint}. Usando almacenamiento local.`, err);
      return this.handleOffline(endpoint, options);
    }
  },

  handleOffline(endpoint, options) {
    const cached = localStorage.getItem(`cache_${endpoint}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Error parseando caché offline', e);
      }
    }
    // Si no hay caché, retornar estructura mínima vacía
    if (endpoint.includes('status')) return { ok: true, offline: true, habitProgress: 0, urgentItemsCount: 0 };
    if (endpoint.includes('menus')) return {};
    return [];
  },

  // Métodos de conveniencia
  getStatus() {
    return this.request('/status');
  },
  getMembers() {
    return this.request('/members');
  },
  saveMember(member) {
    return this.request('/members', { method: 'POST', body: JSON.stringify(member) });
  },
  getEvents(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this.request(`/events?${params}`);
  },
  saveEvent(event) {
    return this.request('/events', { method: 'POST', body: JSON.stringify(event) });
  },
  deleteEvent(id) {
    return this.request(`/events/${id}`, { method: 'DELETE' });
  },
  getHabits(dateStr) {
    return this.request(`/habits?date=${dateStr || ''}`);
  },
  toggleHabit(habitId, dateStr) {
    return this.request('/habits/toggle', { method: 'POST', body: JSON.stringify({ habitId, date: dateStr }) });
  },
  saveHabit(habit) {
    return this.request('/habits', { method: 'POST', body: JSON.stringify(habit) });
  },
  deleteHabit(id) {
    return this.request(`/habits/${id}`, { method: 'DELETE' });
  },
  getInventory(filter = {}) {
    const params = new URLSearchParams(filter).toString();
    return this.request(`/inventory?${params}`);
  },
  saveInventoryItem(item) {
    return this.request('/inventory', { method: 'POST', body: JSON.stringify(item) });
  },
  deleteInventoryItem(id) {
    return this.request(`/inventory/${id}`, { method: 'DELETE' });
  },
  consumeInventoryItem(id, data = {}) {
    return this.request(`/inventory/${id}/consume`, { method: 'POST', body: JSON.stringify(data) });
  },
  getRecipeRecommendations() {
    return this.request('/recipes/recommendations');
  },
  getMenus() {
    return this.request('/menus');
  },
  saveMenus(menus) {
    return this.request('/menus', { method: 'PUT', body: JSON.stringify(menus) });
  },
  getKioskSettings() {
    return this.request('/kiosk');
  },
  saveKioskSettings(settings) {
    return this.request('/kiosk', { method: 'PUT', body: JSON.stringify(settings) });
  }
};
