/**
 * NeveraHub - Controlador Principal de la Aplicación Táctil Kiosko
 */

document.addEventListener('DOMContentLoaded', () => {
  NeveraApp.init();
});

const NeveraApp = {
  currentTab: 'dashboard',
  selectedMemberFilter: 'all',
  inventoryFilter: 'all',
  cachedMembers: [],
  cachedEvents: [],
  cachedHabits: [],
  cachedInventory: [],
  cachedMenus: {},
  cachedSettings: {},

  async init() {
    this.setupClock();
    this.setupNavigation();
    this.setupModals();
    this.setupNightMode();
    this.setupKioskMode();
    await this.refreshAllData();

    // Comprobar hash en la URL para navegación directa (ej. #calendar, #habits, #recipes)
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'calendar', 'habits', 'inventory', 'recipes', 'menus', 'settings'].includes(hash)) {
      this.switchTab(hash);
    }

    // Actualización periódica en segundo plano cada 60 segundos
    setInterval(() => {
      this.refreshAllData(true);
    }, 60000);
  },

  // -----------------------------------------------------------------
  // RELOJ Y FECHA DEL SISTEMA ANDROID
  // -----------------------------------------------------------------
  getSystemDate() {
    // Si corre en la app nativa de Android 6.0 con AndroidBridge
    if (window.AndroidBridge && typeof window.AndroidBridge.getDeviceTimeMillis === 'function') {
      return new Date(window.AndroidBridge.getDeviceTimeMillis());
    }
    // Hora local del sistema operativo
    return new Date();
  },

  formatSpanishDate(date) {
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const diaSemana = DIAS[date.getDay()];
    const diaNum = date.getDate();
    const mes = MESES[date.getMonth()];
    const anio = date.getFullYear();
    return `${diaSemana}, ${diaNum} de ${mes} de ${anio}`;
  },

  setupClock() {
    const clockEl = document.getElementById('header-clock');
    const dateEl = document.getElementById('header-date');

    const updateTime = () => {
      const now = this.getSystemDate();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      if (clockEl) clockEl.textContent = `${hours}:${minutes}:${seconds}`;
      if (dateEl) dateEl.textContent = this.formatSpanishDate(now);
    };

    updateTime();
    setInterval(updateTime, 1000);
  },

  // -----------------------------------------------------------------
  // NAVEGACIÓN POR PESTAÑAS
  // -----------------------------------------------------------------
  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-target');
        this.switchTab(target);
      });
    });

    // Clic en badge de alerta lleva a recetas / inventario
    const alertBadge = document.getElementById('badge-alert');
    if (alertBadge) {
      alertBadge.addEventListener('click', () => {
        this.switchTab('recipes');
      });
    }
  },

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-target') === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });

    if (tabId === 'calendar') this.renderCalendar();
    if (tabId === 'habits') this.renderHabits();
    if (tabId === 'inventory') this.renderInventory();
    if (tabId === 'recipes') this.renderRecipes();
    if (tabId === 'menus') this.renderMenus();
    if (tabId === 'settings') this.renderSettings();
  },

  switchView(tabId) {
    this.switchTab(tabId);
  },

  setActiveMemberFilter(memberId) {
    this.selectedMemberFilter = memberId;
    if (this.currentTab === 'dashboard') this.renderDashboard();
    if (this.currentTab === 'calendar') this.renderCalendar();
    if (this.currentTab === 'habits') this.renderHabits();
  },

  // -----------------------------------------------------------------
  // CARGA DE DATOS CENTRALIZADA
  // -----------------------------------------------------------------
  async refreshAllData(silent = false) {
    try {
      const [members, events, habitsData, inventory, menus, settings, status] = await Promise.all([
        NeveraSync.getMembers(),
        NeveraSync.getEvents(),
        NeveraSync.getHabits(),
        NeveraSync.getInventory(),
        NeveraSync.getMenus(),
        NeveraSync.getKioskSettings(),
        NeveraSync.getStatus()
      ]);

      this.cachedMembers = members || [];
      this.cachedEvents = events || [];
      this.cachedHabits = (habitsData && habitsData.habits) || [];
      this.cachedInventory = inventory || [];
      this.cachedMenus = menus || {};
      this.cachedSettings = settings || {};

      this.updateHeaderBadges(status);
      this.renderDashboard();

      if (!silent) {
        if (this.currentTab === 'calendar') this.renderCalendar();
        if (this.currentTab === 'habits') this.renderHabits();
        if (this.currentTab === 'inventory') this.renderInventory();
        if (this.currentTab === 'recipes') this.renderRecipes();
        if (this.currentTab === 'menus') this.renderMenus();
        if (this.currentTab === 'settings') this.renderSettings();
      }
    } catch (err) {
      console.error('Error actualizando datos de NeveraHub:', err);
    }
  },

  updateHeaderBadges(status) {
    const alertBadge = document.getElementById('badge-alert');
    const habitsBadge = document.getElementById('badge-habits');

    if (alertBadge) {
      const urgentCount = status ? status.urgentItemsCount : 0;
      if (urgentCount > 0) {
        alertBadge.style.display = 'flex';
        alertBadge.innerHTML = `⚠️ ${urgentCount} alimentos por caducar`;
      } else {
        alertBadge.style.display = 'none';
      }
    }

    if (habitsBadge) {
      const pct = status ? status.habitProgress : 0;
      habitsBadge.innerHTML = `✅ Hábitos hoy: ${pct}%`;
    }
  },

  // -----------------------------------------------------------------
  // 1. DASHBOARD PRINCIPAL (Resumen del Día)
  // -----------------------------------------------------------------
  renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    // Calcular día actual de la semana en español
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayIndex = new Date().getDay();
    const todayKey = days[todayIndex];
    const todayMenu = this.cachedMenus[todayKey] || {
      name: 'Hoy',
      kidsLunch: 'No definido',
      parentsLunch: 'No definido',
      dinner: 'No definido'
    };

    // Eventos de hoy
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEvents = this.cachedEvents.filter(e => e.date === todayStr);

    // Alimentos urgentes
    const urgentItems = this.cachedInventory.filter(i => i.urgencyWeight >= 2);

    container.innerHTML = `
      <div class="dashboard-grid">
        
        <!-- Tarjeta 1: Menú del Día -->
        <div class="kiosk-card">
          <div class="card-title">
            <span>🍽️ ¿Qué comemos hoy?</span>
            <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${todayMenu.name || 'Hoy'}</span>
          </div>
          <div style="flex:1 1 0; min-height:0; overflow-y:auto; margin-bottom:10px;">
            <div class="today-meal-box kids">
              <div class="meal-label">👦 Menú Guille (Colegio)</div>
              <div class="meal-name">${todayMenu.guilleLunch || todayMenu.kidsLunch || 'Sin definir'}</div>
            </div>
            <div class="today-meal-box samuel" style="margin-top: 6px;">
              <div class="meal-label">👶 Menú Samuel (Guardería)</div>
              <div class="meal-name">${todayMenu.samuelLunch || 'Sin definir'}</div>
            </div>
            <div class="today-meal-box">
              <div class="meal-label">💼 Comida Papás</div>
              <div class="meal-name">${todayMenu.parentsLunch || 'Sin definir'}</div>
            </div>
            <div class="today-meal-box dinner">
              <div class="meal-label">🌙 Cena Familiar</div>
              <div class="meal-name">${todayMenu.dinner || 'Sin definir'}</div>
            </div>
          </div>
          <button class="btn-primary btn-touch-card" onclick="NeveraApp.switchTab('menus')">Ver Menú Semanal Completo</button>
        </div>

        <!-- Tarjeta 2: Eventos Familiares de Hoy -->
        <div class="kiosk-card">
          <div class="card-title">
            <span>📅 Agenda Familiar</span>
            <button class="btn-primary" style="padding:4px 10px; font-size:0.82rem; min-height:32px;" onclick="NeveraApp.openAddEventModal()">+ Añadir</button>
          </div>
          <div class="event-list" style="margin-bottom:10px;">
            ${todayEvents.length === 0 ? '<p style="color:var(--text-muted); padding:16px 0; text-align:center;">No hay eventos para hoy.<br>¡Día despejado!</p>' : ''}
            ${todayEvents.map(ev => {
              const member = this.cachedMembers.find(m => m.id === ev.memberId);
              const color = member ? member.color : '#3b82f6';
              const name = member ? member.name : 'Toda la familia';
              return `
                <div class="event-item" style="background-color: ${color};">
                  <div class="event-time">${ev.startTime} - ${ev.endTime} | ${name}</div>
                  <div class="event-title">${ev.title}</div>
                  ${ev.notes ? `<div style="font-size:0.75rem; opacity:0.88; margin-top:2px;">${ev.notes}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <button class="btn-secondary btn-touch-card" onclick="NeveraApp.switchTab('calendar')">Ver Calendario Completo</button>
        </div>

        <!-- Tarjeta 3: Alimentos en Riesgo & Recetas -->
        <div class="kiosk-card">
          <div class="card-title">
            <span>🚨 Alerta de Caducidad</span>
            <span style="font-size:0.82rem; color:${urgentItems.length > 0 ? 'var(--warning)' : 'var(--success)'}; font-weight:bold;">${urgentItems.length} por caducar</span>
          </div>
          
          <div style="flex:1 1 0; min-height:0; overflow-y:auto; margin-bottom:10px;">
            ${urgentItems.length === 0 ? '<p style="color:var(--success); font-weight:600; padding:16px 0; text-align:center;">✅ ¡Todo en orden!<br>Sin productos por caducar.</p>' : ''}
            ${urgentItems.map(item => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; margin-bottom:6px; background:rgba(10,14,23,0.5); border:1px solid var(--border-color); border-radius:8px;">
                <div style="min-width:0; flex:1; padding-right:8px;">
                  <div style="font-weight:700; font-size:0.92rem; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(${item.quantity})</span></div>
                  <div style="font-size:0.75rem; color:${item.daysLeft <= 0 ? 'var(--danger)' : 'var(--warning)'}; font-weight:bold;">
                    ${item.daysLeft <= 0 ? '¡Caduca HOY o caducado!' : `Vence en ${item.daysLeft} d (${item.expiryDate})`}
                  </div>
                </div>
                <button class="btn-consume" style="flex:none; padding:4px 10px; font-size:0.8rem; min-height:32px;" onclick="NeveraApp.consumeItem('${item.id}')">Consumido</button>
              </div>
            `).join('')}
          </div>

          <button class="btn-primary btn-touch-card" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); box-shadow: 0 2px 10px var(--purple-glow);" onclick="NeveraApp.switchTab('recipes')">
            🍳 ¿Qué cocino con esto?
          </button>
        </div>

      </div>
    `;
  },

  // -----------------------------------------------------------------
  // 2. CALENDARIO FAMILIAR
  // -----------------------------------------------------------------
  renderCalendar() {
    const filtersContainer = document.getElementById('calendar-member-filters');
    const gridContainer = document.getElementById('calendar-week-grid');
    if (!filtersContainer || !gridContainer) return;

    // Chips de filtrado por persona
    filtersContainer.innerHTML = `
      <div class="filter-chip ${this.selectedMemberFilter === 'all' ? 'active' : ''}" onclick="NeveraApp.filterCalendarMember('all')">
        <span>👨‍👩‍👧‍👦</span> Toda la familia
      </div>
      ${this.cachedMembers.map(m => `
        <div class="filter-chip ${this.selectedMemberFilter === m.id ? 'active' : ''}" 
             style="${this.selectedMemberFilter === m.id ? `background-color:${m.color}; border-color:#fff;` : ''}"
             onclick="NeveraApp.filterCalendarMember('${m.id}')">
          <span>${m.avatar}</span> ${m.name}
        </div>
      `).join('')}
    `;

    // Generar los 7 días de la semana actual (Lunes a Domingo)
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Lunes
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDays.push(d);
    }

    const todayStr = now.toISOString().split('T')[0];

    gridContainer.innerHTML = weekDays.map(dateObj => {
      const dateStr = dateObj.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
      const dayNumber = dateObj.getDate();

      // Filtrar eventos del día
      let dayEvents = this.cachedEvents.filter(e => e.date === dateStr);
      if (this.selectedMemberFilter !== 'all') {
        dayEvents = dayEvents.filter(e => e.memberId === this.selectedMemberFilter || e.memberId === 'all');
      }

      return `
        <div class="calendar-day-col ${isToday ? 'today' : ''}">
          <div class="day-header">
            <div class="day-name">${dayName}</div>
            <div class="day-number">${dayNumber}</div>
          </div>
          <div class="event-list">
            ${dayEvents.map(ev => {
              const member = this.cachedMembers.find(m => m.id === ev.memberId);
              const color = member ? member.color : '#3b82f6';
              const name = member ? member.name : 'Familia';
              return `
                <div class="event-item" style="background-color: ${color}; position:relative;">
                  <div class="event-time">${ev.startTime} | ${name}</div>
                  <div class="event-title">${ev.title}</div>
                  <button onclick="NeveraApp.deleteEvent('${ev.id}')" style="position:absolute; top:4px; right:4px; background:none; border:none; color:rgba(255,255,255,0.7); cursor:pointer; font-size:0.8rem;">✕</button>
                </div>
              `;
            }).join('')}
          </div>
          <button class="btn-secondary" style="margin-top:auto; padding:6px; font-size:0.8rem;" onclick="NeveraApp.openAddEventModal('${dateStr}')">+ Añadir</button>
        </div>
      `;
    }).join('');
  },

  filterCalendarMember(memberId) {
    this.selectedMemberFilter = memberId;
    this.renderCalendar();
  },

  async deleteEvent(id) {
    if (confirm('¿Eliminar este evento familiar?')) {
      await NeveraSync.deleteEvent(id);
      await this.refreshAllData();
    }
  },

  // -----------------------------------------------------------------
  // 3. HÁBITOS Y RUTINAS DIARIAS
  // -----------------------------------------------------------------
  renderHabits() {
    const container = document.getElementById('habits-container');
    if (!container) return;

    const todayStr = new Date().toISOString().split('T')[0];

    container.innerHTML = this.cachedMembers.map(member => {
      const memberHabits = this.cachedHabits.filter(h => h.memberId === member.id);
      const completedCount = memberHabits.filter(h => h.completed).length;
      const pct = memberHabits.length > 0 ? Math.round((completedCount / memberHabits.length) * 100) : 100;

      return `
        <div class="member-habit-card" style="border-top: 3px solid ${member.color};">
          <div class="member-habit-header">
            <div class="member-title-info">
              <span class="member-avatar-badge">${member.avatar}</span>
              <div>
                <span class="member-name-label">${member.name}</span>
                <span class="member-role-badge">${member.role === 'parent' ? 'Padre/Madre' : 'Hijo/a'}</span>
              </div>
            </div>
            <div class="member-habit-pct ${pct === 100 ? 'complete' : ''}">
              ${completedCount}/${memberHabits.length} (${pct}%)
            </div>
          </div>

          <div class="habit-progress-bar">
            <div class="habit-progress-fill" style="width: ${pct}%; background-color: ${member.color};"></div>
          </div>

          <div class="habit-checklist">
            ${memberHabits.length === 0 ? '<p style="color:var(--text-muted); font-size:0.85rem; padding:12px 0; text-align:center;">Sin rutinas asignadas.</p>' : ''}
            ${memberHabits.map(habit => `
              <div class="habit-row ${habit.completed ? 'completed' : ''}" onclick="NeveraApp.toggleHabit('${habit.id}')">
                <div class="habit-checkbox">${habit.completed ? '✓' : ''}</div>
                <div class="habit-icon-wrap">${habit.icon || '⭐'}</div>
                <div class="habit-title">${habit.title}</div>
              </div>
            `).join('')}
          </div>

          <button class="btn-secondary btn-touch-card" onclick="NeveraApp.openAddHabitModal('${member.id}')">
            + Añadir tarea
          </button>
        </div>
      `;
    }).join('');
  },

  async toggleHabit(habitId) {
    const todayStr = new Date().toISOString().split('T')[0];
    await NeveraSync.toggleHabit(habitId, todayStr);
    await this.refreshAllData();
  },

  // -----------------------------------------------------------------
  // 4. INVENTARIO DE NEVERA & DESPENSA
  // -----------------------------------------------------------------
  renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;

    let items = [...this.cachedInventory];
    if (this.inventoryFilter !== 'all') {
      items = items.filter(i => i.location === this.inventoryFilter);
    }

    grid.innerHTML = items.map(item => {
      let badgeClass = 'good';
      let badgeText = `Quedan ${item.daysLeft} días`;

      if (item.daysLeft <= 0) {
        badgeClass = 'expired';
        badgeText = 'HOY / CADUCADO';
      } else if (item.daysLeft <= 3) {
        badgeClass = 'urgent';
        badgeText = `URGENTE (${item.daysLeft} d)`;
      }

      const locIcon = item.location === 'fridge' ? '🧊 Nevera' : (item.location === 'pantry' ? '🥫 Despensa' : '❄️ Congelador');

      return `
        <div class="item-card status-${item.status}">
          <div class="item-top">
            <div class="item-name">${item.name}</div>
            <div class="item-badge ${badgeClass}">${badgeText}</div>
          </div>
          <div class="item-meta">
            <div>📦 Cantidad: <strong>${item.quantity}</strong></div>
            <div>📍 Ubicación: ${locIcon}</div>
            <div>🗓️ Caducidad: ${item.expiryDate}</div>
          </div>
          <div class="item-actions">
            <button class="btn-consume" onclick="NeveraApp.consumeItem('${item.id}')">✓ Consumido</button>
            <button class="btn-secondary" style="flex:none; padding:8px 12px;" onclick="NeveraApp.deleteItem('${item.id}')">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  },

  filterInventoryLocation(loc) {
    this.inventoryFilter = loc;
    document.querySelectorAll('.inventory-filters button').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-loc') === loc);
    });
    this.renderInventory();
  },

  async consumeItem(id) {
    await NeveraSync.deleteInventoryItem(id);
    await this.refreshAllData();
  },

  async deleteItem(id) {
    if (confirm('¿Eliminar este producto del inventario?')) {
      await NeveraSync.deleteInventoryItem(id);
      await this.refreshAllData();
    }
  },

  // -----------------------------------------------------------------
  // 5. RECETAS ANTI-DESPERDICIO
  // -----------------------------------------------------------------
  async renderRecipes() {
    const container = document.getElementById('recipes-container');
    if (!container) return;

    container.innerHTML = '<p style="color:var(--text-muted); padding:20px;">Calculando recetas óptimas según caducidad de alimentos...</p>';

    const recData = await NeveraSync.getRecipeRecommendations();
    const recipes = (recData && recData.recipes) || [];

    if (recipes.length === 0) {
      container.innerHTML = `
        <div class="kiosk-card" style="text-align:center; padding:32px;">
          <div style="font-size:3rem; margin-bottom:12px;">🥦</div>
          <div style="font-size:1.3rem; font-weight:700;">¡No hay alimentos en riesgo inmediato de caducar!</div>
          <p style="color:var(--text-muted); margin-top:8px;">Todo lo que hay en la nevera y despensa está fresco y en fecha óptima.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="recipe-grid">
        ${recipes.map(recipe => `
          <div class="recipe-card">
            ${recipe.rescuedCount > 0 ? `
              <div class="recipe-urgent-tag">
                🔥 ¡Salva ${recipe.rescuedCount} producto(s) a punto de caducar!
              </div>
            ` : ''}
            <div class="recipe-title">${recipe.icon} ${recipe.title}</div>
            <div class="recipe-info-row">
              <span>⏱️ ${recipe.timeMinutes} min</span>
              <span>⭐ ${recipe.difficulty}</span>
              <span>🏷️ ${recipe.category}</span>
              <span style="color:var(--success); font-weight:bold;">${recipe.coveragePercent}% ingredientes listos</span>
            </div>

            <div class="recipe-ingredients-matched">
              <strong>Ingredientes aprovechados:</strong><br>
              ${recipe.matchedRequired.map(m => `✅ ${m.item.name}`).join(', ')}
              ${recipe.matchedOptional.length > 0 ? `<br>➕ Opcionales: ${recipe.matchedOptional.map(m => m.item.name).join(', ')}` : ''}
            </div>

            <div class="recipe-instructions">
              <strong>Preparación rápida:</strong><br>
              ${recipe.instructions}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // -----------------------------------------------------------------
  // 6. MENÚ SEMANAL
  // -----------------------------------------------------------------
  renderMenus() {
    const tableBody = document.getElementById('menu-table-body');
    if (!tableBody) return;

    const dayKeys = [
      { key: 'monday', name: 'Lunes' },
      { key: 'tuesday', name: 'Martes' },
      { key: 'wednesday', name: 'Miércoles' },
      { key: 'thursday', name: 'Jueves' },
      { key: 'friday', name: 'Viernes' },
      { key: 'saturday', name: 'Sábado' },
      { key: 'sunday', name: 'Domingo' }
    ];

    tableBody.innerHTML = dayKeys.map(d => {
      const data = this.cachedMenus[d.key] || { guilleLunch: '', samuelLunch: '', kidsLunch: '', parentsLunch: '', dinner: '' };
      return `
        <tr>
          <td style="font-weight:700; width:110px; font-size:1.05rem;">${d.name}</td>
          <td>
            <div class="menu-kid-subslot">
              <div class="menu-subslot-badge guille">👦 Guille (5 años)</div>
              <textarea class="menu-input-area" id="menu-${d.key}-guille" placeholder="Comida colegio Guille..." onchange="NeveraApp.saveMenuField('${d.key}', 'guilleLunch', this.value)">${data.guilleLunch || (data.kidsLunch || '')}</textarea>
            </div>
            <div class="menu-kid-subslot" style="margin-top: 8px;">
              <div class="menu-subslot-badge samuel">👶 Samuel (2 años)</div>
              <textarea class="menu-input-area" id="menu-${d.key}-samuel" placeholder="Comida guardería Samuel..." onchange="NeveraApp.saveMenuField('${d.key}', 'samuelLunch', this.value)">${data.samuelLunch || ''}</textarea>
            </div>
          </td>
          <td>
            <div class="menu-slot-title">💼 Papás (Trabajo / Casa)</div>
            <textarea class="menu-input-area" style="min-height: 104px;" id="menu-${d.key}-parents" onchange="NeveraApp.saveMenuField('${d.key}', 'parentsLunch', this.value)">${data.parentsLunch || ''}</textarea>
          </td>
          <td>
            <div class="menu-slot-title">🌙 Cena Familiar</div>
            <textarea class="menu-input-area" style="min-height: 104px;" id="menu-${d.key}-dinner" onchange="NeveraApp.saveMenuField('${d.key}', 'dinner', this.value)">${data.dinner || ''}</textarea>
          </td>
        </tr>
      `;
    }).join('');
  },

  async saveMenuField(dayKey, field, value) {
    if (!this.cachedMenus[dayKey]) {
      this.cachedMenus[dayKey] = {};
    }
    this.cachedMenus[dayKey][field] = value;
    if (field === 'guilleLunch' || field === 'samuelLunch') {
      const g = this.cachedMenus[dayKey].guilleLunch || '';
      const s = this.cachedMenus[dayKey].samuelLunch || '';
      this.cachedMenus[dayKey].kidsLunch = (g && s) ? `Guille: ${g} | Samuel: ${s}` : (g || s);
    }
    await NeveraSync.saveMenus(this.cachedMenus);
  },

  // -----------------------------------------------------------------
  // 7. AJUSTES Y MODO NOCHE
  // -----------------------------------------------------------------
  setupNightMode() {
    const btn = document.getElementById('btn-night-mode');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('night-mode');
        const isNight = document.body.classList.contains('night-mode');
        btn.textContent = isNight ? '☀️ Modo Día' : '🌙 Modo Noche';
      });
    }

    // Comprobar automáticamente si es horario nocturno (23:00 a 07:00)
    const checkNightSchedule = () => {
      const hour = new Date().getHours();
      const isNightTime = hour >= 23 || hour < 7;
      if (isNightTime && !document.body.classList.contains('night-mode')) {
        document.body.classList.add('night-mode');
        if (btn) btn.textContent = '☀️ Modo Día';
      }
    };
    checkNightSchedule();
    setInterval(checkNightSchedule, 300000);
  },

  setupKioskMode() {
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          btn.textContent = '🗗 Salir Kiosko';
        } else {
          document.exitFullscreen().catch(() => {});
          btn.textContent = '🖥️ Kiosko';
        }
      });
    }
  },

  renderSettings() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; height:100%; width:100%;">
        <div class="kiosk-card">
          <div class="card-title">👨‍👩‍👧‍👦 Miembros de la Familia</div>
          <div style="flex:1 1 0; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${this.cachedMembers.map(m => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(10,14,23,0.5); border:1px solid var(--border-color); border-radius:8px; border-left:4px solid ${m.color};">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:1.4rem;">${m.avatar}</span>
                  <div>
                    <div style="font-weight:700; color:#fff; font-size:0.95rem;">${m.name}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">${m.role === 'parent' ? 'Padre / Madre' : 'Hijo / Hija'}</div>
                  </div>
                </div>
                <div style="width:20px; height:20px; border-radius:50%; background-color:${m.color}; box-shadow:0 0 8px ${m.color};"></div>
              </div>
            `).join('')}
          </div>
          <button class="btn-primary btn-touch-card" onclick="NeveraApp.openAddMemberModal()">+ Añadir Miembro</button>
        </div>

        <div class="kiosk-card">
          <div class="card-title">📱 Conectar Móviles Familiares & Notificaciones</div>
          <div style="flex:1 1 0; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
            <p style="color:var(--text-muted); line-height:1.4; font-size:0.88rem;">
              Para que toda la familia reciba notificaciones cuando alguien añade un evento en la nevera o caduca un alimento:
            </p>
            <div style="background:rgba(10,14,23,0.8); border:1px solid var(--border-color-hover); padding:10px; border-radius:8px; font-family:monospace; font-size:1.05rem; color:#60a5fa; text-align:center; font-weight:700;">
              http://${window.location.host}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button class="btn-primary" style="background:#10b981; font-size:0.85rem; padding:8px;" onclick="NeveraNotify.requestPermission()">
                🔔 Activar Notificaciones en este móvil
              </button>
              <button class="btn-secondary" style="font-size:0.85rem; padding:8px;" onclick="NeveraApp.triggerFamilyTestNotification()">
                🚀 Enviar Notificación de Prueba a Todos
              </button>
            </div>
            <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); padding:8px; border-radius:8px; font-size:0.8rem; color:#cbd5e1; line-height:1.3;">
              📲 <strong>Canal Push Android (ntfy)</strong>: Abre en la app gratuita ntfy:<br>
              <code style="color:#60a5fa;">https://ntfy.sh/neverahub-familia-alerta</code>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // -----------------------------------------------------------------
  // MODALES
  // -----------------------------------------------------------------
  setupModals() {
    // Cerrar modales al tocar el fondo
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    });
  },

  openAddEventModal(presetDate) {
    const modal = document.getElementById('modal-add-event');
    const memberSelect = document.getElementById('event-member');
    const dateInput = document.getElementById('event-date');
    if (!modal) return;

    if (memberSelect) {
      memberSelect.innerHTML = `
        <option value="all">👨‍👩‍👧‍👦 Toda la Familia</option>
        ${this.cachedMembers.map(m => `<option value="${m.id}">${m.avatar} ${m.name}</option>`).join('')}
      `;
    }

    if (dateInput) {
      dateInput.value = presetDate || new Date().toISOString().split('T')[0];
    }

    modal.style.display = 'flex';
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  },

  async submitAddEvent() {
    const title = document.getElementById('event-title').value;
    const memberId = document.getElementById('event-member').value;
    const date = document.getElementById('event-date').value;
    const startTime = document.getElementById('event-start').value || '09:00';
    const endTime = document.getElementById('event-end').value || '10:00';
    const notes = document.getElementById('event-notes').value || '';

    if (!title || !date) {
      alert('Por favor indica un título y fecha');
      return;
    }

    await NeveraSync.saveEvent({ title, memberId, date, startTime, endTime, notes });
    this.closeModal('modal-add-event');
    document.getElementById('event-title').value = '';
    await this.refreshAllData();
  },

  openAddInventoryModal() {
    const modal = document.getElementById('modal-add-inventory');
    const expiryInput = document.getElementById('inv-expiry');
    if (!modal) return;

    if (expiryInput) {
      // Por defecto en 4 días
      const d = new Date();
      d.setDate(d.getDate() + 4);
      expiryInput.value = d.toISOString().split('T')[0];
    }

    modal.style.display = 'flex';
  },

  setQuickExpiry(days) {
    const expiryInput = document.getElementById('inv-expiry');
    if (expiryInput) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiryInput.value = d.toISOString().split('T')[0];
    }
  },

  async submitAddInventory() {
    const name = document.getElementById('inv-name').value;
    const location = document.getElementById('inv-location').value;
    const category = document.getElementById('inv-category').value;
    const quantity = document.getElementById('inv-quantity').value || '1 ud';
    const expiryDate = document.getElementById('inv-expiry').value;

    if (!name || !expiryDate) {
      alert('El nombre y la fecha de caducidad son obligatorios');
      return;
    }

    await NeveraSync.saveInventoryItem({ name, location, category, quantity, expiryDate });
    this.closeModal('modal-add-inventory');
    document.getElementById('inv-name').value = '';
    await this.refreshAllData();
  },

  openAddHabitModal(memberId) {
    const modal = document.getElementById('modal-add-habit');
    const memberSelect = document.getElementById('habit-member');
    if (!modal) return;

    if (memberSelect) {
      memberSelect.innerHTML = this.cachedMembers.map(m => `
        <option value="${m.id}" ${m.id === memberId ? 'selected' : ''}>${m.avatar} ${m.name}</option>
      `).join('');
    }

    modal.style.display = 'flex';
  },

  async submitAddHabit() {
    const memberId = document.getElementById('habit-member').value;
    const title = document.getElementById('habit-title').value;
    const period = document.getElementById('habit-period').value;
    const icon = document.getElementById('habit-icon').value || '⭐';

    if (!title) {
      alert('Por favor introduce el nombre del hábito o rutina');
      return;
    }

    await NeveraSync.saveHabit({ memberId, title, period, icon });
    this.closeModal('modal-add-habit');
    document.getElementById('habit-title').value = '';
    await this.refreshAllData();
  },

  openAddMemberModal() {
    const modal = document.getElementById('modal-add-member');
    if (modal) modal.style.display = 'flex';
  },

  async submitAddMember() {
    const name = document.getElementById('member-name').value;
    const role = document.getElementById('member-role').value;
    const avatar = document.getElementById('member-avatar').value || '👤';
    const color = document.getElementById('member-color').value || '#3B82F6';

    if (!name) {
      alert('El nombre es obligatorio');
      return;
    }

    await NeveraSync.saveMember({ name, role, avatar, color });
    this.closeModal('modal-add-member');
    document.getElementById('member-name').value = '';
    await this.refreshAllData();
  },

  async triggerFamilyTestNotification() {
    const success = await NeveraNotify.sendTestNotification();
    if (success) {
      NeveraNotify.displayInAppToast('🔔 Notificación Enviada', 'Aviso enviado a todos los móviles familiares conectados.');
    } else {
      NeveraNotify.displayInAppToast('ℹ️ Modo Local', 'Aviso distribuido por la red local familiar.');
    }
  }
};
