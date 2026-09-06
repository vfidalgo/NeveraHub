/**
 * Motor NLU y Procesador de Intenciones del Asistente Virtual para NeveraHub
 * Maneja comandos por voz en español para cocina, hábitos, calendario e inventario.
 */

const recipeEngine = require('./recipeEngine');

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAYS_KEY_MAP = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

const DAY_NAMES_TO_INDEX = {
  'domingo': 0,
  'lunes': 1,
  'martes': 2,
  'miercoles': 3,
  'miércoles': 3,
  'jueves': 4,
  'viernes': 5,
  'sabado': 6,
  'sábado': 6
};

class AssistantEngine {
  /**
   * Procesa una consulta en lenguaje natural
   * @param {string} query Texto hablado por el usuario
   * @param {object} db Instancia de Base de Datos
   * @param {Date|string} [currentDate] Fecha de referencia
   * @returns {object} { spokenResponse, actionTaken, actionType, actionData, card }
   */
  processQuery(query, db, currentDate = new Date()) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        spokenResponse: 'Hola, ¿en qué te puedo ayudar en la cocina?',
        actionTaken: false,
        actionType: 'none',
        card: { title: 'NeveraBot', text: 'Di algo como: "¿Qué hay de comer hoy?" o "Añade leche a la nevera".' }
      };
    }

    const refDate = (typeof currentDate === 'string') ? new Date(currentDate) : currentDate;
    const clean = query.trim().toLowerCase();
    const todayStr = refDate.toISOString().split('T')[0];
    const dayOfWeek = refDate.getDay();
    const dayNameEs = DAYS_ES[dayOfWeek];

    // 1. Saludo / Resumen general del día
    if (clean.includes('buenos días') || clean.includes('buenos dias') || clean.includes('hola') || clean.includes('resumen del día') || clean.includes('resumen del dia') || clean.includes('cómo estamos') || clean === 'nevera') {
      return this.handleGeneralSummary(clean, db, refDate);
    }

    // 2. Actualización de Menús por Voz (Guille, Samuel, Niños, Cenas, Papás)
    const isCalendarEvent = /(evento|cita|cumpleaños|partido|m[eé]dico|pediatra|reuni[oó]n|dentista)/i.test(clean);
    const isUpdateVerb = /(apunta|apuntar|añade|anade|añadir|pon\b|poner|agrega|agregar|guarda|guardar|cambia|cambiar|actualiza|actualizar|registra|registrar|escribe|escribir|modifica|modificar)/i.test(clean);
    const mentionsMenuOrMeal = /(men[uú]|cena\b|cenar\b|almuerzo\b|comida\b)/i.test(clean);
    const mentionsDay = /(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo|hoy|mañana|manana)/i.test(clean);
    const mentionsChildOrMember = /(guillermo|guille|samuel|samu|niñ[oa]s?|hijos?|infantil|colegio|guarder[ií]a|padres|pap[aá]s?)/i.test(clean);

    if (!isCalendarEvent && isUpdateVerb) {
      if (mentionsMenuOrMeal && (mentionsDay || mentionsChildOrMember || clean.includes('para') || clean.includes('de'))) {
        return this.handleMenuUpdate(clean, db, refDate);
      }
      if (mentionsChildOrMember && mentionsDay && !clean.includes('nevera') && !clean.includes('despensa') && !clean.includes('congelador')) {
        return this.handleMenuUpdate(clean, db, refDate);
      }
    }

    // 3. Consulta de Menús
    if (clean.includes('menú') || clean.includes('menu') || clean.includes('comer') || clean.includes('comen') || clean.includes('come') || clean.includes('cenar') || clean.includes('cenan') || clean.includes('comida') || clean.includes('cena') || clean.includes('almuerzo')) {
      if (clean.includes('receta') || clean.includes('recomiendas') || clean.includes('puedo cocinar')) {
        return this.handleRecipeRecommendation(db, refDate);
      }
      return this.handleMenuQuery(clean, db, refDate);
    }

    // 3. Recomendación de recetas anti-desperdicio
    if (clean.includes('receta') || clean.includes('recomiendas') || clean.includes('qué cocino') || clean.includes('que cocino') || clean.includes('qué preparo') || clean.includes('cocinar')) {
      return this.handleRecipeRecommendation(db, refDate);
    }

    // 4. Inventario: Caducidades urgentes
    if (clean.includes('caduca') || clean.includes('caducidad') || clean.includes('vence') || clean.includes('urgente')) {
      return this.handleExpiryQuery(db, refDate);
    }

    // 5. Inventario: Añadir producto
    if (clean.startsWith('añade') || clean.startsWith('anade') || clean.startsWith('apunta') || clean.startsWith('agrega') || clean.startsWith('pon ') || clean.includes('añadir') || clean.includes('apuntar')) {
      if (clean.includes('evento') || clean.includes('cita') || clean.includes('cumpleaños') || clean.includes('partido') || clean.includes('médico') || clean.includes('reunión')) {
        return this.handleAddEvent(clean, db, refDate);
      }
      return this.handleAddInventory(clean, db, refDate);
    }

    // 6. Inventario: Consumir producto
    if (clean.includes('consum') || clean.includes('comí') || clean.includes('comi') || clean.includes('comido') || clean.includes('gast') || clean.includes('ya no queda') || clean.includes('se ha acabado') || clean.includes('se han acabado') || clean.includes('elimina')) {
      return this.handleConsumeInventory(clean, db, refDate);
    }

    // 7. Inventario: Consultar stock / cuántos quedan
    if (clean.includes('cuántos') || clean.includes('cuantos') || clean.includes('cuántas') || clean.includes('cuantas') || clean.includes('cuánto queda') || clean.includes('cuanto queda') || clean.includes('cuántos quedan') || clean.includes('cuantos quedan')) {
      return this.handleInventoryStockQuery(clean, db);
    }

    // 8. Inventario: Consultar qué hay
    if (clean.includes('qué hay en la nevera') || clean.includes('que hay en la nevera') || clean.includes('qué tenemos en la nevera') || clean.includes('qué hay en la despensa') || clean.includes('ver inventario')) {
      return this.handleListInventory(clean, db);
    }

    // 8. Hábitos: Marcar hábito
    if (clean.includes('lavado los dientes') || clean.includes('dientes') || clean.includes('hecho la cama') || clean.includes('cama') || clean.includes('deberes') || clean.includes('juguetes') || clean.includes('yoga') || clean.includes('ejercicio') || clean.includes('agua') || clean.includes('perro') || clean.includes('completado')) {
      const habitResult = this.handleCompleteHabit(clean, db, refDate);
      if (habitResult) return habitResult;
    }

    // 9. Hábitos: Consultar estado de hábitos
    if (clean.includes('hábito') || clean.includes('habito') || clean.includes('hábitos') || clean.includes('habitos') || clean.includes('rutina') || clean.includes('rutinas') || clean.includes('tareas')) {
      return this.handleHabitsStatus(clean, db, refDate);
    }

    // 10. Calendario: Consultar eventos
    if (clean.includes('evento') || clean.includes('eventos') || clean.includes('plan') || clean.includes('planes') || clean.includes('calendario') || clean.includes('agenda') || clean.includes('qué tiene') || clean.includes('que tiene')) {
      return this.handleCalendarQuery(clean, db, refDate);
    }

    // 11. Respuesta de cortesía o ayuda
    return {
      spokenResponse: 'Te he escuchado, pero no estoy seguro de qué acción realizar. Puedes preguntarme por el menú de hoy, qué alimentos van a caducar, o decirme por ejemplo "Añade leche a la nevera" o "Guille se ha lavado los dientes".',
      actionTaken: false,
      actionType: 'help',
      card: {
        title: 'Comandos Sugeridos',
        text: '• "¿Qué hay hoy de comer o cenar?"\n• "¿Qué alimentos caducan pronto?"\n• "Añade tomates a la nevera"\n• "Guille se ha lavado los dientes"\n• "¿Qué planes hay hoy?"'
      }
    };
  }

  handleGeneralSummary(query, db, currentDate) {
    const todayStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay();
    const dayKey = DAYS_KEY_MAP[dayOfWeek] || 'monday';
    const dayName = DAYS_ES[dayOfWeek];

    const menus = db.get('menus') || {};
    const todayMenu = menus[dayKey] || {};

    const inventory = db.get('inventory') || [];
    const analyzed = recipeEngine.analyzeInventory(inventory, todayStr);
    const urgentItems = analyzed.filter(i => i.urgencyWeight >= 2);

    const events = db.get('events') || [];
    const todayEvents = events.filter(e => e.date === todayStr);

    let spoken = '¡Buenos días familia! Hoy es ' + dayName + '. ';
    if (todayEvents.length > 0) {
      spoken += 'Tenéis ' + todayEvents.length + ' eventos programados para hoy, entre ellos ' + todayEvents[0].title + '. ';
    } else {
      spoken += 'No hay eventos programados para hoy en el calendario. ';
    }

    if (todayMenu.dinner) {
      spoken += 'Para cenar tenéis previsto: ' + todayMenu.dinner + '. ';
    }

    if (urgentItems.length > 0) {
      spoken += 'Atención: hay ' + urgentItems.length + ' alimentos que vencen muy pronto, como ' + urgentItems[0].name + '. ';
    }

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'summary',
      card: {
        title: 'Resumen de hoy (' + dayName + ')',
        text: '📅 Eventos: ' + todayEvents.length + '\n🍲 Cena: ' + (todayMenu.dinner || 'Sin planificar') + '\n⚠️ Alimentos urgentes: ' + urgentItems.length
      }
    };
  }

  handleMenuQuery(query, db, currentDate) {
    const menus = db.get('menus') || {};
    let targetDay = currentDate.getDay();
    let isTomorrow = false;

    if (query.includes('mañana') || query.includes('manana')) {
      targetDay = (targetDay + 1) % 7;
      isTomorrow = true;
    } else {
      for (const [name, idx] of Object.entries(DAY_NAMES_TO_INDEX)) {
        if (query.includes(name)) {
          targetDay = idx;
          break;
        }
      }
    }

    const dayKey = DAYS_KEY_MAP[targetDay] || 'monday';
    const dayName = DAYS_ES[targetDay];
    const dayMenu = menus[dayKey];

    if (!dayMenu) {
      return {
        spokenResponse: 'No hay ningún menú configurado para el ' + dayName + '.',
        actionTaken: false,
        actionType: 'menu',
        card: { title: 'Menú ' + dayName, text: 'Sin planificación.' }
      };
    }

    const prefix = isTomorrow ? 'Mañana' : (targetDay === currentDate.getDay() ? 'Hoy' : 'El ' + dayName);
    let spoken = '';

    const guilleMeal = dayMenu.guilleLunch || dayMenu.kidsLunch || 'Sin planificar';
    const samuelMeal = dayMenu.samuelLunch || dayMenu.kidsLunch || 'Sin planificar';

    if (query.includes('cena') || query.includes('cenar')) {
      spoken = prefix + ' para cenar toca: ' + dayMenu.dinner + '.';
    } else if (query.includes('guille')) {
      spoken = prefix + ' Guille come en el colegio: ' + guilleMeal + '.';
    } else if (query.includes('samuel') || query.includes('samu')) {
      spoken = prefix + ' Samuel come en la guardería: ' + samuelMeal + '.';
    } else if (query.includes('niño') || query.includes('nino') || query.includes('colegio') || query.includes('escolar') || query.includes('guarderia') || query.includes('guardería')) {
      if (dayMenu.guilleLunch && dayMenu.samuelLunch) {
        spoken = prefix + ': Guille come en el colegio ' + dayMenu.guilleLunch + ', y Samuel come en la guardería ' + dayMenu.samuelLunch + '.';
      } else {
        spoken = prefix + ' en el colegio los niños comen: ' + (dayMenu.kidsLunch || guilleMeal) + '.';
      }
    } else if (query.includes('papá') || query.includes('papa') || query.includes('padres') || query.includes('trabajo')) {
      spoken = prefix + ' los padres comen: ' + dayMenu.parentsLunch + '.';
    } else {
      if (dayMenu.guilleLunch && dayMenu.samuelLunch) {
        spoken = prefix + ': Guille tiene ' + dayMenu.guilleLunch + ', Samuel ' + dayMenu.samuelLunch + ', los papás ' + dayMenu.parentsLunch + ', y para cenar en familia toca ' + dayMenu.dinner + '.';
      } else {
        spoken = prefix + ': En el cole hay ' + dayMenu.kidsLunch + ', los papás comen ' + dayMenu.parentsLunch + ', y para cenar en familia toca ' + dayMenu.dinner + '.';
      }
    }

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'menu',
      card: {
        title: 'Menú de ' + dayName,
        text: '👦 Menú Guille: ' + guilleMeal + '\n👶 Menú Samuel: ' + samuelMeal + '\n💼 Menú padres: ' + dayMenu.parentsLunch + '\n🌙 Cena familiar: ' + dayMenu.dinner
      }
    };
  }

  extractDishFromMenuQuery(clean) {
    let dish = '';
    // 1. Si hay dos puntos o coma separando la instrucción del plato:
    const colonOrCommaMatch = clean.match(/[:,-]\s*([^:,]+)$/);
    if (colonOrCommaMatch && colonOrCommaMatch[1].trim().length >= 2) {
      dish = colonOrCommaMatch[1].trim();
    } else {
      // 2. Extracción semántica eliminando metadatos de la frase
      dish = clean
        .replace(/^(apunta|apuntar|añade|anade|añadir|pon\b|poner|agrega|agregar|guarda|guardar|cambia|cambiar|actualiza|actualizar|registra|registrar|escribe|escribir)\s+/i, '')
        .replace(/(en\s+)?(el\s+)?men[uú](\s+infantil|\s+escolar|\s+semanal)?/gi, '')
        .replace(/(de\s+|para\s+)?(guillermo|guille|samuel|samu|los\s+niños|los\s+ninos|los\s+hijos|los\s+padres|los\s+pap[aá]s|las\s+mam[aá]s|la\s+familia)/gi, '')
        .replace(/(el\s+|para\s+el\s+|del\s+|para\s+)?(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo|hoy|mañana|manana)/gi, '')
        .replace(/\b(que\s+sea|que\s+haya|toca|hay|de\s+comer|de\s+cenar|comer[aá]n?|cenar[aá]n?|comida|cena|almuerzo)\b/gi, '')
        .replace(/^[:,\s-]+|[:,\s-]+$/g, '')
        .trim();
    }

    // Quitar conectores iniciales sobrantes
    dish = dish.replace(/^(que\s+|de\s+|un\s+|una\s+)/i, '').trim();

    if (!dish || dish.length < 2) {
      dish = 'Plato del día';
    } else {
      dish = dish.charAt(0).toUpperCase() + dish.slice(1);
    }
    return dish;
  }

  handleMenuUpdate(query, db, currentDate) {
    const menus = db.getAll().menus || {};
    let targetDay = currentDate.getDay();
    let isTomorrow = false;

    if (query.includes('mañana') || query.includes('manana')) {
      targetDay = (targetDay + 1) % 7;
      isTomorrow = true;
    } else if (query.includes('hoy')) {
      targetDay = currentDate.getDay();
    } else {
      for (const [name, idx] of Object.entries(DAY_NAMES_TO_INDEX)) {
        if (query.includes(name)) {
          targetDay = idx;
          break;
        }
      }
    }

    const dayKey = DAYS_KEY_MAP[targetDay] || 'monday';
    const dayName = DAYS_ES[targetDay];

    if (!menus[dayKey]) {
      menus[dayKey] = {
        name: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        guilleLunch: '',
        samuelLunch: '',
        kidsLunch: '',
        parentsLunch: '',
        dinner: ''
      };
    }

    const dayMenu = menus[dayKey];
    const dish = this.extractDishFromMenuQuery(query);

    const isGuille = query.includes('guillermo') || query.includes('guille');
    const isSamuel = query.includes('samuel') || query.includes('samu');
    const isKids = !isGuille && !isSamuel && (query.includes('niño') || query.includes('niña') || query.includes('nino') || query.includes('infantil') || query.includes('hijo') || query.includes('colegio') || query.includes('guarderia') || query.includes('guardería'));
    const isDinner = query.includes('cena') || query.includes('cenar');
    const isParents = query.includes('padre') || query.includes('papá') || query.includes('papa') || query.includes('mama') || query.includes('mamá');

    let spoken = '';
    let targetField = '';

    if (isGuille) {
      targetField = 'guilleLunch';
      dayMenu.guilleLunch = dish;
      const sLunch = (dayMenu.samuelLunch || '').trim();
      dayMenu.kidsLunch = sLunch
        ? `Guille: ${dish} | Samuel: ${sLunch}`
        : `Guille: ${dish}`;
      spoken = `He apuntado en el menú del ${dayName} para Guille: ${dish}.`;
    } else if (isSamuel) {
      targetField = 'samuelLunch';
      dayMenu.samuelLunch = dish;
      const gLunch = (dayMenu.guilleLunch || '').trim();
      dayMenu.kidsLunch = gLunch
        ? `Guille: ${gLunch} | Samuel: ${dish}`
        : `Samuel: ${dish}`;
      spoken = `He apuntado en el menú del ${dayName} para Samuel: ${dish}.`;
    } else if (isKids) {
      targetField = 'kidsLunch';
      dayMenu.guilleLunch = dish;
      dayMenu.samuelLunch = dish;
      dayMenu.kidsLunch = dish;
      spoken = `He apuntado en el menú infantil del ${dayName} para Guille y Samuel: ${dish}.`;
    } else if (isDinner) {
      targetField = 'dinner';
      dayMenu.dinner = dish;
      spoken = `He apuntado para cenar el ${dayName}: ${dish}.`;
    } else if (isParents) {
      targetField = 'parentsLunch';
      dayMenu.parentsLunch = dish;
      spoken = `He apuntado en la comida de los papás del ${dayName}: ${dish}.`;
    } else {
      // Default: menú escolar infantil de la semana
      targetField = 'kidsLunch';
      dayMenu.guilleLunch = dish;
      dayMenu.samuelLunch = dish;
      dayMenu.kidsLunch = dish;
      spoken = `He apuntado en el menú del ${dayName}: ${dish}.`;
    }

    db.getAll().menus = menus;
    db.saveData();

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'menu_update',
      actionData: {
        day: dayKey,
        dayName: dayName,
        dish: dish,
        field: targetField,
        menu: dayMenu
      },
      card: {
        title: `Menú de ${dayName} Actualizado 📋`,
        text: `👦 Menú Guille: ${dayMenu.guilleLunch || 'Sin planificar'}\n👶 Menú Samuel: ${dayMenu.samuelLunch || 'Sin planificar'}\n💼 Menú papás: ${dayMenu.parentsLunch || 'Sin planificar'}\n🌙 Cena familiar: ${dayMenu.dinner || 'Sin planificar'}`
      }
    };
  }

  handleRecipeRecommendation(db, currentDate) {
    const inventory = db.get('inventory') || [];
    const dateStr = currentDate.toISOString().split('T')[0];
    const { recipes } = recipeEngine.getRecommendedRecipes(inventory, dateStr);

    if (!recipes || recipes.length === 0) {
      return {
        spokenResponse: 'Tienes suficiente variedad en la nevera, pero no hay ninguna receta destacada con ingredientes a punto de caducar.',
        actionTaken: false,
        actionType: 'recipe',
        card: { title: 'Sin recetas urgentes', text: 'Todos los productos están en buen estado.' }
      };
    }

    const top = recipes[0];
    const expiringNote = top.rescuedCount > 0 ? ('aprovecha ' + top.rescuedCount + ' ingredientes que están próximos a caducar') : 'utiliza ingredientes que tienes disponibles';
    const spoken = 'Te sugiero preparar "' + top.title + '". Es una receta ' + top.difficulty.toLowerCase() + ' de ' + top.timeMinutes + ' minutos y ' + expiringNote + '.';

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'recipe',
      actionData: top,
      card: {
        title: 'Recomendación: ' + top.title + ' ' + (top.icon || '🍳'),
        text: '⏱️ ' + top.timeMinutes + ' min | Dificultad: ' + top.difficulty + '\n📝 ' + top.instructions
      }
    };
  }

  handleExpiryQuery(db, currentDate) {
    const inventory = db.get('inventory') || [];
    const dateStr = currentDate.toISOString().split('T')[0];
    const analyzed = recipeEngine.analyzeInventory(inventory, dateStr);

    const urgent = analyzed.filter(i => i.urgencyWeight >= 2);

    if (urgent.length === 0) {
      return {
        spokenResponse: '¡Buenas noticias! No hay ningún alimento próximo a caducar en los próximos días.',
        actionTaken: false,
        actionType: 'expiry',
        card: { title: 'Inventario Fresco', text: 'Todos los productos tienen buena fecha de caducidad.' }
      };
    }

    const itemsList = urgent.slice(0, 3).map(i => {
      const daysText = i.daysLeft <= 0 ? 'que vence hoy' : ('que vence en ' + i.daysLeft + (i.daysLeft === 1 ? ' día' : ' días'));
      return i.name + ' (' + daysText + ')';
    }).join(', ');

    const spoken = 'Tienes ' + urgent.length + ' productos que requieren atención: ' + itemsList + '.';

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'expiry',
      actionData: urgent,
      card: {
        title: 'Alimentos Urgentes ⚠️',
        text: urgent.map(i => '• ' + i.name + ' - ' + (i.daysLeft <= 0 ? 'Vence hoy' : i.daysLeft + ' días restantes')).join('\n')
      }
    };
  }

  handleAddInventory(query, db, currentDate) {
    let clean = query;
    ['añade', 'anade', 'apunta', 'agrega', 'pon '].forEach(prefix => {
      if (clean.startsWith(prefix)) {
        clean = clean.replace(prefix, '').trim();
      }
    });

    let location = 'fridge';
    if (clean.includes('despensa')) {
      location = 'pantry';
      clean = clean.replace(/a la despensa|en la despensa/gi, '');
    } else if (clean.includes('congelador')) {
      location = 'freezer';
      clean = clean.replace(/al congelador|en el congelador/gi, '');
    } else {
      clean = clean.replace(/a la nevera|en la nevera|al frigorífico|al frigorifico|en el frigorífico|en el frigorifico/gi, '');
    }

    let itemName = clean.trim()
      .replace(/^(un|una|unos|unas|el|la|los|las)\s+/i, '')
      .trim();

    if (!itemName || itemName.length < 2) {
      return {
        spokenResponse: 'No he entendido qué producto quieres añadir. Por favor di por ejemplo "Añade leche a la nevera".',
        actionTaken: false,
        actionType: 'none'
      };
    }

    itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);

    const defaultDays = location === 'freezer' ? 90 : (location === 'pantry' ? 60 : 7);
    const expDate = new Date(currentDate.getTime() + defaultDays * 24 * 60 * 60 * 1000);
    const expStr = expDate.toISOString().split('T')[0];
    const addedStr = currentDate.toISOString().split('T')[0];

    let category = 'other';
    const lowerName = itemName.toLowerCase();
    if (/pollo|carne|ternera|cerdo|pavo|salmón|salmon|merluza|pescado/i.test(lowerName)) category = 'meat';
    else if (/leche|yogur|queso|mantequilla|nata|huevo/i.test(lowerName)) category = 'dairy';
    else if (/tomate|lechuga|calabacín|calabacin|zanahoria|manzana|plátano|platano|fruta|verdura/i.test(lowerName)) category = 'vegetables';
    else if (/arroz|pasta|galletas|harina|pan|legumbres/i.test(lowerName)) category = 'pantry';

    const newItem = {
      name: itemName,
      category: category,
      location: location,
      quantity: '1 ud',
      addedDate: addedStr,
      expiryDate: expStr,
      urgent: false
    };

    const created = db.add('inventory', newItem);
    const locEs = location === 'fridge' ? 'la nevera' : (location === 'pantry' ? 'la despensa' : 'el congelador');
    const spoken = 'He añadido ' + itemName + ' a ' + locEs + '.';

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'inventory_add',
      actionData: created,
      card: {
        title: 'Añadido a ' + locEs,
        text: '📦 ' + itemName + '\n📅 Caducidad estimada: ' + expStr
      }
    };
  }

  handleConsumeInventory(query, db, currentDate = new Date()) {
    const inventory = db.get('inventory') || [];
    let match = null;

    // Detectar si se menciona una fecha (hoy, ayer)
    let consumeDate = currentDate.toISOString().split('T')[0];
    if (query.includes('ayer')) {
      const yest = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
      consumeDate = yest.toISOString().split('T')[0];
    }

    // Detectar cantidad numérica o palabras numéricas en español
    const wordNums = { 'un': 1, 'una': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'ocho': 8, 'diez': 10, 'doce': 12, 'media docena': 6, 'una docena': 12 };
    let amountSpecified = null;

    const numMatch = query.match(/\b(\d+)\b/);
    if (numMatch) {
      amountSpecified = parseInt(numMatch[1], 10);
    } else {
      for (const [w, val] of Object.entries(wordNums)) {
        const r = new RegExp(`\\b${w}\\b`, 'i');
        if (r.test(query)) {
          amountSpecified = val;
          break;
        }
      }
    }

    match = this.findBestMatchingInventoryItem(query, inventory);

    if (!match) {
      return {
        spokenResponse: 'No encontré ningún producto en el inventario que coincida con lo que has mencionado.',
        actionTaken: false,
        actionType: 'none'
      };
    }

    // Obtener información de unidades
    let totalUnits = typeof match.totalUnits === 'number' ? match.totalUnits : null;
    let remainingUnits = typeof match.remainingUnits === 'number' ? match.remainingUnits : null;
    let unitName = match.unitName || 'uds';

    if (totalUnits === null || remainingUnits === null) {
      const parsed = recipeEngine.parseQuantityUnits ? recipeEngine.parseQuantityUnits(match.quantity) : { totalUnits: 1, remainingUnits: 1, unitName: 'uds' };
      totalUnits = parsed.totalUnits;
      remainingUnits = parsed.remainingUnits;
      unitName = parsed.unitName;
    }

    if (!Array.isArray(match.consumedHistory)) {
      match.consumedHistory = [];
    }

    // Si tiene unidades múltiples (> 1) y se especificó una cantidad menor a las restantes:
    if (remainingUnits > 1 && amountSpecified && amountSpecified < remainingUnits) {
      const actualConsumed = amountSpecified;
      const newRemaining = remainingUnits - actualConsumed;

      const logEntry = {
        id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        date: consumeDate,
        amount: actualConsumed,
        note: 'Consumo por voz'
      };
      match.consumedHistory.push(logEntry);
      match.totalUnits = totalUnits;
      match.remainingUnits = newRemaining;
      match.unitName = unitName;
      match.quantity = `${newRemaining} ${unitName} (de ${totalUnits})`;

      db.update('inventory', match.id, match);

      const locEs = match.location === 'fridge' ? 'la nevera' : (match.location === 'pantry' ? 'la despensa' : 'el congelador');
      const dayLabel = query.includes('ayer') ? 'de ayer' : 'de hoy';
      const spoken = `Anotado el consumo ${dayLabel}: has consumido ${actualConsumed} ${unitName} de ${match.name}. Te quedan ${newRemaining} disponibles en ${locEs}.`;

      return {
        spokenResponse: spoken,
        actionTaken: true,
        actionType: 'inventory_consume_partial',
        actionData: match,
        card: {
          title: `Consumo Parcial: ${match.name}`,
          text: `📉 Consumidas: ${actualConsumed} ${unitName} (${dayLabel})\n📦 Quedan: ${newRemaining} / ${totalUnits} ${unitName}`
        }
      };
    }

    // Si se consumió todo lo que quedaba o no se especificó cantidad menor:
    const consumedAmount = (amountSpecified && amountSpecified >= remainingUnits) ? remainingUnits : (remainingUnits || 1);
    const logEntry = {
      id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: consumeDate,
      amount: consumedAmount,
      note: 'Consumo total'
    };
    match.consumedHistory.push(logEntry);
    db.remove('inventory', match.id);

    const spoken = 'De acuerdo, he retirado ' + match.name + ' del inventario porque se ha terminado.';

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'inventory_consume',
      actionData: match,
      card: {
        title: 'Producto Consumido',
        text: '🗑️ ' + match.name + ' retirado del inventario.'
      }
    };
  }

  findBestMatchingInventoryItem(query, inventory) {
    let bestMatch = null;
    let bestScore = 0;
    const cleanQ = query.toLowerCase();

    for (const item of inventory) {
      const lower = item.name.toLowerCase();
      if (cleanQ.includes(lower)) {
        const score = lower.length * 10;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      } else {
        const words = lower.split(' ').filter(w => w.length > 3);
        const matchWords = words.filter(w => cleanQ.includes(w));
        if (matchWords.length > 0) {
          const score = matchWords.length * 5 + matchWords.reduce((acc, w) => acc + w.length, 0);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
          }
        }
      }
    }
    return bestMatch;
  }

  handleInventoryStockQuery(query, db) {
    const inventory = db.get('inventory') || [];
    const match = this.findBestMatchingInventoryItem(query, inventory);

    if (!match) {
      return {
        spokenResponse: 'No encontré ese producto en la nevera ni en la despensa.',
        actionTaken: false,
        actionType: 'inventory_stock'
      };
    }

    const totalUnits = typeof match.totalUnits === 'number' ? match.totalUnits : (recipeEngine.parseQuantityUnits(match.quantity).totalUnits || 1);
    const remainingUnits = typeof match.remainingUnits === 'number' ? match.remainingUnits : (recipeEngine.parseQuantityUnits(match.quantity).remainingUnits || 1);
    const unitName = match.unitName || 'uds';
    const history = match.consumedHistory || [];

    const locEs = match.location === 'fridge' ? 'la nevera' : (match.location === 'pantry' ? 'la despensa' : 'el congelador');

    let historyText = '';
    if (history.length > 0) {
      const parts = history.slice(-3).map(h => `${h.amount} el día ${h.date}`);
      historyText = ` Se han consumido ${parts.join(' y ')}.`;
    }

    const spoken = totalUnits > 1
      ? `Te quedan ${remainingUnits} ${unitName} de ${match.name} (de los ${totalUnits} iniciales) en ${locEs}.${historyText}`
      : `Tienes ${match.quantity} de ${match.name} en ${locEs}.`;

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'inventory_stock',
      actionData: match,
      card: {
        title: `Stock: ${match.name}`,
        text: `📦 Disponibles: ${remainingUnits} / ${totalUnits} ${unitName}\n📍 Ubicación: ${locEs}\n🗓️ Caducidad: ${match.expiryDate}`
      }
    };
  }

  handleListInventory(query, db) {
    const inventory = db.get('inventory') || [];
    const isPantry = query.includes('despensa');
    const targetLoc = isPantry ? 'pantry' : 'fridge';
    const locName = isPantry ? 'la despensa' : 'la nevera';

    const filtered = inventory.filter(i => i.location === targetLoc);
    if (filtered.length === 0) {
      return {
        spokenResponse: 'No hay productos registrados en ' + locName + '.',
        actionTaken: false,
        actionType: 'inventory_list'
      };
    }

    const names = filtered.slice(0, 5).map(i => i.name).join(', ');
    const spoken = 'En ' + locName + ' tienes registrados ' + filtered.length + ' productos, entre ellos: ' + names + '.';

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'inventory_list',
      card: {
        title: 'Productos en ' + locName,
        text: filtered.map(i => '• ' + i.name + ' (' + (i.quantity || '1') + ')').join('\n')
      }
    };
  }

  handleCompleteHabit(query, db, currentDate) {
    const members = db.get('members') || [];
    const habits = db.get('habits') || [];
    const todayStr = currentDate.toISOString().split('T')[0];

    let targetMember = null;
    for (const m of members) {
      const mName = m.name.toLowerCase().split(' ')[0];
      if (query.includes(mName)) {
        targetMember = m;
        break;
      }
    }

    const candidateHabits = targetMember
      ? habits.filter(h => h.memberId === targetMember.id)
      : habits;

    let matchedHabit = null;
    for (const h of candidateHabits) {
      const hTitle = h.title.toLowerCase();
      if (query.includes('dientes') && hTitle.includes('dientes')) {
        const hour = currentDate.getHours();
        if (hour >= 18 && hTitle.includes('noche')) {
          matchedHabit = h;
          break;
        } else if (hour < 18 && hTitle.includes('mañana')) {
          matchedHabit = h;
          break;
        } else {
          matchedHabit = h;
        }
      } else if (query.includes('cama') && hTitle.includes('cama')) {
        matchedHabit = h;
        break;
      } else if (query.includes('juguetes') && hTitle.includes('juguetes')) {
        matchedHabit = h;
        break;
      } else if (query.includes('deberes') && hTitle.includes('deberes')) {
        matchedHabit = h;
        break;
      } else if (query.includes('yoga') && hTitle.includes('yoga')) {
        matchedHabit = h;
        break;
      } else if (query.includes('perro') && hTitle.includes('perro')) {
        matchedHabit = h;
        break;
      } else if (query.includes('siesta') && hTitle.includes('siesta')) {
        matchedHabit = h;
        break;
      } else if (query.includes('cuento') && hTitle.includes('cuento')) {
        matchedHabit = h;
        break;
      } else if (query.includes('mochila') && hTitle.includes('mochila')) {
        matchedHabit = h;
        break;
      }
    }

    if (!matchedHabit) {
      return null;
    }

    const member = members.find(m => m.id === matchedHabit.memberId) || { name: 'Familiar' };
    const logs = db.getHabitLogs(todayStr);
    const wasCompleted = !!logs[matchedHabit.id];

    if (!wasCompleted) {
      db.toggleHabitLog(matchedHabit.id, todayStr);
    }

    const memberShortName = member.name.split(' ')[0];
    const spoken = '¡Muy bien ' + memberShortName + '! He marcado como completado: ' + matchedHabit.title + '. ¡Sigue así!';

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'habit_toggle',
      actionData: { habitId: matchedHabit.id, date: todayStr, completed: true },
      card: {
        title: 'Hábito Completado ⭐',
        text: '👤 ' + member.name + '\n✅ ' + matchedHabit.title + ' completado hoy.'
      }
    };
  }

  handleHabitsStatus(query, db, currentDate) {
    const members = db.get('members') || [];
    const habits = db.get('habits') || [];
    const todayStr = currentDate.toISOString().split('T')[0];
    const logs = db.getHabitLogs(todayStr);

    const total = habits.length;
    const completed = habits.filter(h => !!logs[h.id]).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    let spoken = 'Hoy la familia lleva completado el ' + percent + '% de sus hábitos diarios, ' + completed + ' de ' + total + '. ';
    if (percent === 100) {
      spoken += '¡Enhorabuena, todos los hábitos de hoy están cumplidos!';
    } else {
      spoken += '¡Ánimo para completar los que faltan!';
    }

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'habits_status',
      card: {
        title: 'Progreso de Hábitos Hoy: ' + percent + '%',
        text: 'Completados: ' + completed + '/' + total + ' hábitos diarios.'
      }
    };
  }

  handleCalendarQuery(query, db, currentDate) {
    const events = db.get('events') || [];
    const members = db.get('members') || [];
    const todayStr = currentDate.toISOString().split('T')[0];

    let filterMember = null;
    for (const m of members) {
      const mName = m.name.toLowerCase().split(' ')[0];
      if (query.includes(mName)) {
        filterMember = m;
        break;
      }
    }

    let todayEvents = events.filter(e => e.date === todayStr);
    if (filterMember) {
      todayEvents = todayEvents.filter(e => e.memberId === filterMember.id || e.memberId === 'all');
    }

    if (todayEvents.length === 0) {
      const spoken = filterMember
        ? filterMember.name.split(' ')[0] + ' no tiene ningún evento anotado para hoy.'
        : 'No hay eventos anotados para hoy en el calendario familiar.';
      return {
        spokenResponse: spoken,
        actionTaken: false,
        actionType: 'calendar_list',
        card: { title: 'Agenda de hoy', text: 'Sin eventos programados.' }
      };
    }

    const desc = todayEvents.map(e => e.title + ' a las ' + e.startTime).join(', ');
    const spoken = 'Hoy hay ' + todayEvents.length + ' eventos: ' + desc + '.';

    return {
      spokenResponse: spoken,
      actionTaken: false,
      actionType: 'calendar_list',
      actionData: todayEvents,
      card: {
        title: 'Eventos de Hoy (' + todayEvents.length + ')',
        text: todayEvents.map(e => '⏰ ' + e.startTime + ' - ' + e.title).join('\n')
      }
    };
  }

  handleAddEvent(query, db, currentDate) {
    const members = db.get('members') || [];
    let memberId = 'all';

    for (const m of members) {
      const mName = m.name.toLowerCase().split(' ')[0];
      if (query.includes(mName)) {
        memberId = m.id;
        break;
      }
    }

    let targetDate = new Date(currentDate);
    if (query.includes('mañana') || query.includes('manana')) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else {
      for (const [dayName, idx] of Object.entries(DAY_NAMES_TO_INDEX)) {
        if (query.includes(dayName)) {
          const currentDayIdx = targetDate.getDay();
          const diff = (idx - currentDayIdx + 7) % 7;
          targetDate.setDate(targetDate.getDate() + (diff === 0 ? 7 : diff));
          break;
        }
      }
    }
    const dateStr = targetDate.toISOString().split('T')[0];

    let startTime = '18:00';
    const timeMatch = query.match(/a las\s+(\d{1,2})(?::(\d{2}))?/i);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? timeMatch[2] : '00';
      startTime = (h < 10 ? '0' + h : h) + ':' + m;
    }

    let title = query
      .replace(/^(añade|anade|apunta|agrega|crea)\s+(evento|cita|recordatorio)?/i, '')
      .replace(/a las\s+\d{1,2}(?::\d{2})?/i, '')
      .replace(/el\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|mañana|manana|hoy)/i, '')
      .replace(/para\s+(papá|papa|mamá|mama|guille|samuel|lucas|sofía|sofia|todos|la familia)/i, '')
      .trim();

    if (!title || title.length < 2) {
      title = 'Cita / Evento Familiar';
    }
    title = title.charAt(0).toUpperCase() + title.slice(1);

    const newEvent = {
      title: title,
      memberId: memberId,
      date: dateStr,
      startTime: startTime,
      endTime: '',
      notes: 'Añadido por voz con NeveraBot'
    };

    const created = db.add('events', newEvent);
    const memberName = members.find(m => m.id === memberId)?.name || 'Toda la familia';
    const spoken = 'He anotado el evento: "' + title + '" para el día ' + dateStr + ' a las ' + startTime + ' asignado a ' + memberName + '.';

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'calendar_add',
      actionData: created,
      card: {
        title: 'Evento Añadido 📅',
        text: '📌 ' + title + '\n🗓️ ' + dateStr + ' | ⏰ ' + startTime + '\n👤 ' + memberName
      }
    };
  }
}

module.exports = new AssistantEngine();