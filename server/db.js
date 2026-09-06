const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'neverahub_db.json');

const INITIAL_DATA = {
  members: [
    { id: 'm1', name: 'Papá', role: 'parent', color: '#2563EB', avatar: '👨', order: 1 },
    { id: 'm2', name: 'Mamá', role: 'parent', color: '#DB2777', avatar: '👩', order: 2 },
    { id: 'm3', name: 'Guille (5 años)', role: 'child', color: '#059669', avatar: '👦', order: 3 },
    { id: 'm4', name: 'Samuel (2 años)', role: 'child', color: '#D97706', avatar: '👶', order: 4 }
  ],
  events: [
    { id: 'e1', title: 'Fútbol iniciación Guille', memberId: 'm3', date: '2026-09-07', startTime: '17:30', endTime: '18:45', notes: 'Llevar zapatillas de deporte' },
    { id: 'e2', title: 'Pediatra revisión 2 años Samuel', memberId: 'm4', date: '2026-09-08', startTime: '16:30', endTime: '17:15', notes: 'Centro de Salud' },
    { id: 'e3', title: 'Dentista Papá', memberId: 'm1', date: '2026-09-09', startTime: '19:00', endTime: '19:45', notes: 'Clínica Dental Dentalia' },
    { id: 'e4', title: 'Cumpleaños abuela (Cena familiar)', memberId: 'all', date: '2026-09-11', startTime: '20:30', endTime: '23:00', notes: 'Restaurante El Rincón' }
  ],
  habits: [
    { id: 'h1', memberId: 'm3', title: 'Lavarse los dientes (Mañana)', period: 'morning', icon: '🪥', active: true },
    { id: 'h2', memberId: 'm3', title: 'Recoger mochila y abrigo', period: 'morning', icon: '🎒', active: true },
    { id: 'h3', memberId: 'm3', title: 'Dibujar o mirar cuento 15m', period: 'afternoon', icon: '🎨', active: true },
    { id: 'h4', memberId: 'm3', title: 'Pijama y dientes (Noche)', period: 'night', icon: '🪥', active: true },
    
    { id: 'h5', memberId: 'm4', title: 'Lavarse los dientes con ayuda', period: 'morning', icon: '🪥', active: true },
    { id: 'h6', memberId: 'm4', title: 'Siesta de la tarde', period: 'afternoon', icon: '💤', active: true },
    { id: 'h7', memberId: 'm4', title: 'Recoger juguetes en la cesta', period: 'afternoon', icon: '🧸', active: true },
    { id: 'h8_samuel', memberId: 'm4', title: 'Ponerse el pijama y cuento', period: 'night', icon: '📖', active: true },

    { id: 'h8', memberId: 'm2', title: 'Hacer ejercicio / Yoga 30m', period: 'morning', icon: '🧘‍♀️', active: true },
    { id: 'h9', memberId: 'm2', title: 'Beber 2L de agua', period: 'afternoon', icon: '💧', active: true },
    { id: 'h10', memberId: 'm1', title: 'Pasear al perro 30m', period: 'morning', icon: '🐕', active: true },
    { id: 'h11', memberId: 'm1', title: 'Revisar tareas de casa', period: 'night', icon: '🏠', active: true }
  ],
  habitLogs: {},
  securityAlerts: [],
  inventory: [
    { id: 'i1', name: 'Pechugas de pollo', category: 'meat', location: 'fridge', quantity: '600g', addedDate: '2026-09-04', expiryDate: '2026-09-07', urgent: true },
    { id: 'i2', name: 'Calabacines frescos', category: 'vegetables', location: 'fridge', quantity: '3 uds', addedDate: '2026-09-02', expiryDate: '2026-09-08', urgent: true },
    { id: 'i3', name: 'Yogures naturales', category: 'dairy', location: 'fridge', quantity: '4 uds', addedDate: '2026-09-01', expiryDate: '2026-09-08', urgent: true },
    { id: 'i4', name: 'Huevos de campo', category: 'dairy', location: 'fridge', quantity: '8 uds', addedDate: '2026-09-03', expiryDate: '2026-09-18', urgent: false },
    { id: 'i5', name: 'Tomates maduros', category: 'vegetables', location: 'fridge', quantity: '5 uds', addedDate: '2026-09-02', expiryDate: '2026-09-07', urgent: true },
    { id: 'i6', name: 'Arroz bomba', category: 'pantry', location: 'pantry', quantity: '1 kg', addedDate: '2026-08-10', expiryDate: '2027-02-01', urgent: false },
    { id: 'i7', name: 'Pasta espaguetis', category: 'pantry', location: 'pantry', quantity: '500g', addedDate: '2026-08-20', expiryDate: '2027-04-01', urgent: false },
    { id: 'i8', name: 'Leche entera', category: 'dairy', location: 'fridge', quantity: '2 bricks', addedDate: '2026-09-05', expiryDate: '2026-09-20', urgent: false },
    { id: 'i9', name: 'Queso rallado mozzarella', category: 'dairy', location: 'fridge', quantity: '200g', addedDate: '2026-09-03', expiryDate: '2026-09-09', urgent: true },
    { id: 'i10', name: 'Guisantes congelados', category: 'vegetables', location: 'freezer', quantity: '450g', addedDate: '2026-08-25', expiryDate: '2027-03-01', urgent: false }
  ],
  menus: {
    monday: {
      name: 'Lunes',
      guilleLunch: 'Lentejas con verduras y compota de manzana',
      samuelLunch: 'Puré suave de lentejas con calabaza y pera',
      kidsLunch: 'Guille: Lentejas con verduras | Samuel: Puré suave',
      parentsLunch: 'Ensalada de pasta fría con atún y tomate',
      dinner: 'Pechuga de pollo a la plancha con calabacín salteado'
    },
    tuesday: {
      name: 'Martes',
      guilleLunch: 'Macarrones boloñesa y plátano',
      samuelLunch: 'Sopa de estrellitas con pollo desmigado y plátano',
      kidsLunch: 'Guille: Macarrones boloñesa | Samuel: Sopa estrellitas',
      parentsLunch: 'Lentejas sobrantes del lunes',
      dinner: 'Tortilla francesa con ensalada de tomate y mozzarella'
    },
    wednesday: {
      name: 'Miércoles',
      guilleLunch: 'Merluza al vapor con patatas panadera y pera',
      samuelLunch: 'Crema suave de calabacín con merluza desmigada',
      kidsLunch: 'Guille: Merluza al vapor | Samuel: Crema de calabacín',
      parentsLunch: 'Pechuga de pavo con verduras al vapor',
      dinner: 'Crema de calabacín casera y huevo poché'
    },
    thursday: {
      name: 'Jueves',
      guilleLunch: 'Pollo asado al horno con patatas y yogur',
      samuelLunch: 'Pollo deshilachado con zanahoria al vapor y yogur',
      kidsLunch: 'Guille: Pollo asado con patatas | Samuel: Pollo tierno',
      parentsLunch: 'Arroz salteado con verduras y pollo',
      dinner: 'Sopa de fideos con verduras y taquitos de jamón'
    },
    friday: {
      name: 'Viernes',
      guilleLunch: 'Arroz a la cubana con huevo frito y naranja',
      samuelLunch: 'Arrocito meloso con tomate casero, huevo revuelto y compota',
      kidsLunch: 'Guille: Arroz a la cubana | Samuel: Arrocito meloso',
      parentsLunch: 'Menú del día con compañeros de trabajo',
      dinner: 'Noche de Pizza casera familiar y peli'
    },
    saturday: {
      name: 'Sábado',
      guilleLunch: 'Comida familiar: Arroz caldoso o paella',
      samuelLunch: 'Comida familiar: Arroz tierno con verduritas y pollo',
      kidsLunch: 'Guille: Arroz caldoso | Samuel: Arroz con verduritas',
      parentsLunch: 'Comida familiar: Arroz caldoso o paella',
      dinner: 'Hamburguesas caseras completas'
    },
    sunday: {
      name: 'Domingo',
      guilleLunch: 'Guiso tradicional en casa de los abuelos',
      samuelLunch: 'Guiso suave adaptado en casa de los abuelos',
      kidsLunch: 'Guiso tradicional en casa de los abuelos',
      parentsLunch: 'Guiso tradicional en casa de los abuelos',
      dinner: 'Cena ligera: Sándwiches calientes y fruta'
    }
  },
  kioskSettings: {
    nightModeEnabled: true,
    nightStart: '23:00',
    nightEnd: '07:00',
    currentTheme: 'dark',
    fridgeName: 'Nevera Familiar',
    weatherCity: 'Madrid',
    screenAlwaysOn: true
  }
};

class Database {
  constructor() {
    this.ensureDataDir();
    this.loadData();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadData() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        this.saveData();
      }
    } catch (err) {
      console.error('Error al cargar base de datos, inicializando datos por defecto:', err);
      this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.saveData();
    }
  }

  saveData() {
    const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_FILE);
      return true;
    } catch (err) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return true;
      } catch (fallbackErr) {
        console.error('Error al guardar datos:', fallbackErr);
        return false;
      }
    }
  }

  get(collection) {
    return this.data[collection] || [];
  }

  getAll() {
    return this.data;
  }

  set(collection, items) {
    this.data[collection] = items;
    this.saveData();
    return this.data[collection];
  }

  add(collection, item) {
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    if (!item.id) {
      item.id = `${collection[0]}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    this.data[collection].push(item);
    this.saveData();
    return item;
  }

  update(collection, id, updates) {
    if (!this.data[collection]) return null;
    const index = this.data[collection].findIndex(item => item.id === id);
    if (index === -1) return null;
    this.data[collection][index] = { ...this.data[collection][index], ...updates };
    this.saveData();
    return this.data[collection][index];
  }

  remove(collection, id) {
    if (!this.data[collection]) return false;
    const initialLen = this.data[collection].length;
    this.data[collection] = this.data[collection].filter(item => item.id !== id);
    if (this.data[collection].length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  toggleHabitLog(habitId, dateStr) {
    if (!this.data.habitLogs) {
      this.data.habitLogs = {};
    }
    if (!this.data.habitLogs[dateStr]) {
      this.data.habitLogs[dateStr] = {};
    }
    const current = !!this.data.habitLogs[dateStr][habitId];
    this.data.habitLogs[dateStr][habitId] = !current;
    this.saveData();
    return { habitId, date: dateStr, completed: !current };
  }

  getHabitLogs(dateStr) {
    return (this.data.habitLogs && this.data.habitLogs[dateStr]) || {};
  }
}

module.exports = new Database();
