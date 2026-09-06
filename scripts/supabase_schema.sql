-- ==============================================================================
-- NeveraHub: Esquema SQL para Supabase (Gratuito con Realtime Habilitado)
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- ==============================================================================

-- 1. Miembros de la Familia
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'child',
  color TEXT DEFAULT '#3B82F6',
  avatar TEXT DEFAULT '👤',
  order_idx INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Calendario Familiar
CREATE TABLE IF NOT EXISTS family_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  member_id TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TEXT DEFAULT '09:00',
  end_time TEXT DEFAULT '10:00',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rutinas y Hábitos Diarios
CREATE TABLE IF NOT EXISTS family_habits (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  title TEXT NOT NULL,
  period TEXT DEFAULT 'morning',
  icon TEXT DEFAULT '⭐',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Registro de Cumplimiento de Hábitos
CREATE TABLE IF NOT EXISTS family_habit_logs (
  id BIGSERIAL PRIMARY KEY,
  habit_id TEXT NOT NULL,
  log_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, log_date)
);

-- 5. Inventario de Nevera y Despensa
CREATE TABLE IF NOT EXISTS family_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  location TEXT DEFAULT 'fridge',
  quantity TEXT DEFAULT '1 ud',
  added_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  urgent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Menú Semanal (Escolar, Papás, Cenas)
CREATE TABLE IF NOT EXISTS family_menus (
  day_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kids_lunch TEXT,
  parents_lunch TEXT,
  dinner TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. HABILITAR SUPABASE REALTIME PARA NOTIFICACIONES INSTANTÁNEAS
-- Permite que cualquier inserción en estas tablas viaje vía WebSockets a todos los móviles
ALTER PUBLICATION supabase_realtime ADD TABLE family_events;
ALTER PUBLICATION supabase_realtime ADD TABLE family_habits;
ALTER PUBLICATION supabase_realtime ADD TABLE family_inventory;

-- 8. Datos iniciales de demostración
INSERT INTO family_members (id, name, role, color, avatar, order_idx) VALUES
  ('m1', 'Papá', 'parent', '#2563EB', '👨', 1),
  ('m2', 'Mamá', 'parent', '#DB2777', '👩', 2),
  ('m3', 'Lucas (8 años)', 'child', '#059669', '👦', 3),
  ('m4', 'Sofía (5 años)', 'child', '#D97706', '👧', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO family_menus (day_key, name, kids_lunch, parents_lunch, dinner) VALUES
  ('monday', 'Lunes', 'Lentejas con verduras', 'Ensalada completa con atún', 'Pechuga de pollo con calabacín'),
  ('tuesday', 'Martes', 'Macarrones boloñesa', 'Lentejas sobrantes', 'Tortilla de calabacín y mozzarella'),
  ('wednesday', 'Miércoles', 'Merluza al vapor', 'Pechuga de pavo con arroz', 'Crema de calabacín y huevo poché'),
  ('thursday', 'Jueves', 'Pollo al horno', 'Arroz salteado con verduras', 'Sopa de fideos'),
  ('friday', 'Viernes', 'Arroz a la cubana', 'Comida de trabajo fuera', 'Pizza casera familiar'),
  ('saturday', 'Sábado', 'Paella familiar', 'Paella familiar', 'Hamburguesas caseras'),
  ('sunday', 'Domingo', 'Guiso con abuelos', 'Guiso con abuelos', 'Sándwiches calientes y fruta')
ON CONFLICT (day_key) DO NOTHING;
