const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

class SupabaseService {
  constructor() {
    this.client = null;
    this.isEnabled = false;
    this.init();
  }

  init() {
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 10 } }
        });
        this.isEnabled = true;
        console.log('⚡ Conexión con Supabase en la nube ACTIVA (Realtime habilitado)');
      } catch (err) {
        console.warn('No se pudo inicializar Supabase, funcionando en modo local:', err.message);
        this.isEnabled = false;
      }
    } else {
      console.log('ℹ️ Supabase no configurado (SUPABASE_URL vacío). Funcionando en almacenamiento local.');
    }
  }

  async syncEventToCloud(event) {
    if (!this.isEnabled) return null;
    try {
      const { data, error } = await this.client
        .from('family_events')
        .upsert({
          id: event.id,
          title: event.title,
          member_id: event.memberId,
          date: event.date,
          start_time: event.startTime,
          end_time: event.endTime,
          notes: event.notes || ''
        });
      if (error) console.error('Error sincronizando evento a Supabase:', error.message);
      return data;
    } catch (e) {
      console.warn('Fallo en sincronización con Supabase:', e.message);
      return null;
    }
  }

  async syncInventoryToCloud(item) {
    if (!this.isEnabled) return null;
    try {
      const { data, error } = await this.client
        .from('family_inventory')
        .upsert({
          id: item.id,
          name: item.name,
          category: item.category,
          location: item.location,
          quantity: item.quantity,
          total_units: item.totalUnits || 1,
          remaining_units: item.remainingUnits || 1,
          unit_name: item.unitName || 'uds',
          consumed_history: item.consumedHistory || [],
          added_date: item.addedDate,
          expiry_date: item.expiryDate,
          urgent: item.urgent || false
        });
      if (error) console.error('Error sincronizando inventario a Supabase:', error.message);
      return data;
    } catch (e) {
      console.warn('Fallo en sincronización con Supabase:', e.message);
      return null;
    }
  }

  async syncMenuToCloud(dayKey, menu) {
    if (!this.isEnabled || !menu) return null;
    try {
      const { data, error } = await this.client
        .from('family_menus')
        .upsert({
          day_key: dayKey,
          name: menu.name || dayKey,
          guille_lunch: menu.guilleLunch || '',
          samuel_lunch: menu.samuelLunch || '',
          kids_lunch: menu.kidsLunch || '',
          parents_lunch: menu.parentsLunch || '',
          dinner: menu.dinner || '',
          updated_at: new Date().toISOString()
        });
      if (error) console.error('Error sincronizando menú a Supabase:', error.message);
      return data;
    } catch (e) {
      console.warn('Fallo en sincronización de menú con Supabase:', e.message);
      return null;
    }
  }
}

module.exports = new SupabaseService();
