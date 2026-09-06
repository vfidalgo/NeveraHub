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

-- 5. Inventario de Nevera y Despensa (con soporte para unidades individualizadas)
CREATE TABLE IF NOT EXISTS family_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  location TEXT DEFAULT 'fridge',
  quantity TEXT DEFAULT '1 ud',
  total_units INTEGER DEFAULT 1,
  remaining_units INTEGER DEFAULT 1,
  unit_name TEXT DEFAULT 'uds',
  consumed_history JSONB DEFAULT '[]'::jsonb,
  added_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  urgent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Menú Semanal (Guille 5 años, Samuel 2 años, Papás, Cenas)
CREATE TABLE IF NOT EXISTS family_menus (
  day_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  guille_lunch TEXT,
  samuel_lunch TEXT,
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
ALTER PUBLICATION supabase_realtime ADD TABLE family_menus;

-- 8. Datos iniciales de la familia
INSERT INTO family_members (id, name, role, color, avatar, order_idx) VALUES
  ('m1', 'Papá', 'parent', '#2563EB', '👨', 1),
  ('m2', 'Mamá', 'parent', '#DB2777', '👩', 2),
  ('m3', 'Guille (5 años)', 'child', '#059669', '👦', 3),
  ('m4', 'Samuel (2 años)', 'child', '#D97706', '👶', 4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  color = EXCLUDED.color,
  avatar = EXCLUDED.avatar;

INSERT INTO family_menus (day_key, name, guille_lunch, samuel_lunch, kids_lunch, parents_lunch, dinner) VALUES
  ('monday', 'Lunes', 'Lentejas con verduras y fruta', 'Puré suave de lentejas con calabaza', 'Guille: Lentejas con verduras | Samuel: Puré suave de lentejas', 'Ensalada completa con atún y huevo duro', 'Pechuga de pollo a la plancha con calabacín'),
  ('tuesday', 'Martes', 'Macarrones boloñesa y plátano', 'Puré de verduras con ternera', 'Guille: Macarrones boloñesa | Samuel: Puré de verduras con ternera', 'Lentejas sobrantes del lunes', 'Tortilla francesa con ensalada de tomate y mozzarella'),
  ('wednesday', 'Miércoles', 'Merluza al vapor con patatas', 'Puré de merluza con zanahoria y patata', 'Guille: Merluza al vapor | Samuel: Puré de merluza con patata', 'Pechuga de pavo con arroz basmati', 'Crema casera de calabacín y huevo poché'),
  ('thursday', 'Jueves', 'Pollo asado con arroz blanco', 'Arroz triturado con pollo y calabaza', 'Guille: Pollo asado con arroz | Samuel: Puré de pollo con arroz', 'Arroz salteado con verduras y pollo', 'Sopa de fideos con verduras y taquitos de jamón'),
  ('friday', 'Viernes', 'Arroz a la cubana con huevo y tomate', 'Puré de arroz con tomate casero y huevo cocido', 'Guille: Arroz a la cubana | Samuel: Puré de arroz y huevo', 'Comida de trabajo / Menú fuera', 'Pizza casera familiar de jamón, queso y champiñones'),
  ('saturday', 'Sábado', 'Paella familiar de pollo y verduras', 'Paella adaptada suave (arroz con pollo sin sofrito fuerte)', 'Paella familiar adaptada', 'Paella familiar de pollo y verduras', 'Hamburguesas caseras de ternera con patatas al horno'),
  ('sunday', 'Domingo', 'Guiso suave de ternera con verduras', 'Puré de guiso de ternera', 'Guiso familiar de ternera', 'Guiso familiar de ternera con verduras', 'Sándwiches calientes de pavo y queso con fruta fresca')
ON CONFLICT (day_key) DO UPDATE SET
  guille_lunch = EXCLUDED.guille_lunch,
  samuel_lunch = EXCLUDED.samuel_lunch,
  kids_lunch = EXCLUDED.kids_lunch,
  parents_lunch = EXCLUDED.parents_lunch,
  dinner = EXCLUDED.dinner;
