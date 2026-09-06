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
  constructor() {
    this.conversationSession = null;
  }

  isConversationActive() {
    if (!this.conversationSession) return false;
    if (Date.now() > this.conversationSession.expiresAt) {
      this.conversationSession = null;
      return false;
    }
    return true;
  }

  resetConversation() {
    this.conversationSession = null;
  }

  getConversationState() {
    if (!this.isConversationActive()) return null;
    return this.conversationSession;
  }

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

    // 0. Si hay una conversación guiada activa (multi-turno)
    if (this.isConversationActive()) {
      const isCancel = /^(cancela|cancelar|olv[ií]dalo|olvidalo|d[eé]jalo|dejalo|para|parar|salir|anula|anular|no nada)$/i.test(clean) || /\b(cancela|cancelar|olv[ií]dalo|olvidalo|d[eé]jalo|dejalo|anula|anular|no nada|para ya|detente)\b/i.test(clean);
      if (isCancel) {
        this.resetConversation();
        return {
          spokenResponse: 'De acuerdo, he cancelado la acción.',
          actionTaken: false,
          actionType: 'conversation_cancel',
          inConversationFlow: false,
          card: { title: 'Acción Cancelada', text: 'Operación cancelada. ¿En qué más puedo ayudarte?' }
        };
      }

      const isGreeting = clean.includes('buenos días') || clean.includes('buenos dias') || clean.includes('hola');
      if (!isGreeting) {
        return this.handleConversationTurn(clean, db, refDate);
      } else {
        this.resetConversation();
      }
    }

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
      if (mentionsMenuOrMeal || (mentionsChildOrMember && (clean.includes('para') || clean.includes('de') || mentionsDay))) {
        if (!clean.includes('nevera') && !clean.includes('despensa') && !clean.includes('congelador')) {
          return this.handleMenuUpdate(clean, db, refDate);
        }
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

  detectMenuTarget(clean) {
    if (clean.includes('guillermo') || clean.includes('guille')) {
      return { target: 'guille', targetName: 'Guille' };
    }
    if (clean.includes('samuel') || clean.includes('samu')) {
      return { target: 'samuel', targetName: 'Samuel' };
    }
    if (clean.includes('niño') || clean.includes('niña') || clean.includes('nino') || clean.includes('infantil') || clean.includes('colegio') || clean.includes('guarderia') || clean.includes('guardería') || clean.includes('ambos') || clean.includes('los dos')) {
      return { target: 'kids', targetName: 'los niños (Guille y Samuel)' };
    }
    if (clean.includes('cena') || clean.includes('cenar') || clean.includes('noche')) {
      return { target: 'dinner', targetName: 'la cena' };
    }
    if (clean.includes('padre') || clean.includes('papá') || clean.includes('papa') || clean.includes('mama') || clean.includes('mamá') || clean.includes('adultos') || clean.includes('trabajo')) {
      return { target: 'parents', targetName: 'los papás' };
    }
    return null;
  }

  detectDay(clean, refDate = new Date()) {
    if (clean.includes('mañana') || clean.includes('manana')) {
      const idx = (refDate.getDay() + 1) % 7;
      return { dayIndex: idx, dayName: DAYS_ES[idx] };
    }
    if (clean.includes('hoy')) {
      const idx = refDate.getDay();
      return { dayIndex: idx, dayName: DAYS_ES[idx] };
    }
    for (const [name, idx] of Object.entries(DAY_NAMES_TO_INDEX)) {
      const r = new RegExp(`\\b${name}\\b`, 'i');
      if (r.test(clean)) {
        return { dayIndex: idx, dayName: DAYS_ES[idx] };
      }
    }
    return null;
  }

  extractDishCandidate(clean) {
    let dish = '';
    const colonOrCommaMatch = clean.match(/[:,-]\s*([^:,]+)$/);
    if (colonOrCommaMatch && colonOrCommaMatch[1].trim().length >= 2) {
      const cand = colonOrCommaMatch[1].trim();
      const isOnlyMeta = /^(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo|guillermo|guille|samuel|samu|los\s+niños|los\s+padres|la\s+cena)$/i.test(cand);
      if (!isOnlyMeta) {
        dish = cand;
      }
    }

    if (!dish) {
      dish = clean
        .replace(/^(apunta|apuntar|añade|anade|añadir|pon\b|poner|agrega|agregar|guarda|guardar|cambia|cambiar|actualiza|actualizar|registra|registrar|escribe|escribir|modifica|modificar)\s+/i, '')
        .replace(/(en\s+)?(el\s+)?men[uú](\s+infantil|\s+escolar|\s+semanal)?/gi, '')
        .replace(/(de\s+|para\s+)?(guillermo|guille|samuel|samu|los\s+niños|los\s+ninos|los\s+hijos|los\s+padres|los\s+pap[aá]s|las\s+mam[aá]s|la\s+familia)/gi, '')
        .replace(/(el\s+|para\s+el\s+|del\s+|para\s+)?(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo|hoy|mañana|manana)/gi, '')
        .replace(/\b(que\s+sea|que\s+haya|toca|hay|de\s+comer|de\s+cenar|comer[aá]n?|cenar[aá]n?|comida|cena|almuerzo)\b/gi, '')
        .replace(/^[:,\s-]+|[:,\s-]+$/g, '')
        .trim();
    }

    dish = dish.replace(/^(que\s+|de\s+|un\s+|una\s+)/i, '').trim();

    if (!dish || dish.length < 2) {
      return null;
    }

    const fillerRegex = /^(menu|menú|comida|cena|almuerzo|para|de|el|la|los|un|una|plato)$/i;
    if (fillerRegex.test(dish)) return null;

    return dish.charAt(0).toUpperCase() + dish.slice(1);
  }

  cleanUpDishInput(clean) {
    let dish = clean
      .replace(/^(pues\s+|va a comer\s+|van a comer\s+|vamos a cenar\s+|ponle\s+|pon\s+|toca\s+|comerán?\s+|cenarán?\s+|de comer\s+|de cena\s+|para comer\s+|para cenar\s+)/i, '')
      .replace(/^(que sea\s+|que haya\s+|un plato de\s+|un\s+|una\s+|de\s+|el\s+|la\s+)/i, '')
      .replace(/^[:,\s-]+|[:,\s-]+$/g, '')
      .trim();

    if (!dish || dish.length < 2) return null;
    return dish.charAt(0).toUpperCase() + dish.slice(1);
  }

  executeMenuSave(slots, db) {
    const menus = db.getAll().menus || {};
    const dayKey = DAYS_KEY_MAP[slots.dayIndex] || 'monday';
    const dayName = slots.dayName || DAYS_ES[slots.dayIndex] || 'lunes';

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
    const dish = slots.dish;
    const target = slots.target;
    let spoken = '';
    let targetField = '';

    if (target === 'guille') {
      targetField = 'guilleLunch';
      dayMenu.guilleLunch = dish;
      const sLunch = (dayMenu.samuelLunch || '').trim();
      dayMenu.kidsLunch = sLunch
        ? `Guille: ${dish} | Samuel: ${sLunch}`
        : `Guille: ${dish}`;
      spoken = `He apuntado en el menú del ${dayName} para Guille: ${dish}.`;
    } else if (target === 'samuel') {
      targetField = 'samuelLunch';
      dayMenu.samuelLunch = dish;
      const gLunch = (dayMenu.guilleLunch || '').trim();
      dayMenu.kidsLunch = gLunch
        ? `Guille: ${gLunch} | Samuel: ${dish}`
        : `Samuel: ${dish}`;
      spoken = `He apuntado en el menú del ${dayName} para Samuel: ${dish}.`;
    } else if (target === 'kids') {
      targetField = 'kidsLunch';
      dayMenu.guilleLunch = dish;
      dayMenu.samuelLunch = dish;
      dayMenu.kidsLunch = dish;
      spoken = `He apuntado en el menú escolar del ${dayName} para Guille y Samuel: ${dish}.`;
    } else if (target === 'dinner') {
      targetField = 'dinner';
      dayMenu.dinner = dish;
      spoken = `He apuntado para cenar el ${dayName}: ${dish}.`;
    } else if (target === 'parents') {
      targetField = 'parentsLunch';
      dayMenu.parentsLunch = dish;
      spoken = `He apuntado en la comida de los papás del ${dayName}: ${dish}.`;
    } else {
      targetField = 'kidsLunch';
      dayMenu.guilleLunch = dish;
      dayMenu.samuelLunch = dish;
      dayMenu.kidsLunch = dish;
      spoken = `He apuntado en el menú del ${dayName}: ${dish}.`;
    }

    db.getAll().menus = menus;
    db.saveData();
    this.resetConversation();

    return {
      spokenResponse: spoken,
      actionTaken: true,
      actionType: 'menu_update',
      inConversationFlow: false,
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

  handleConversationTurn(clean, db, refDate) {
    const session = this.conversationSession;
    if (!session) return this.processQuery(clean, db, refDate);

    session.expiresAt = Date.now() + 60000;

    if (session.flow === 'menu') {
      return this.handleMenuConversationTurn(clean, db, refDate, session);
    } else if (session.flow === 'consume') {
      return this.handleConsumeConversationTurn(clean, db, refDate, session);
    } else if (session.flow === 'inventory_add') {
      return this.handleInventoryAddConversationTurn(clean, db, refDate, session);
    }

    this.resetConversation();
    return this.processQuery(clean, db, refDate);
  }

  handleMenuConversationTurn(clean, db, refDate, session) {
    const slots = session.slots;

    // 1. Esperando destinatario
    if (session.step === 'awaiting_target') {
      const detectedTarget = this.detectMenuTarget(clean);
      if (detectedTarget) {
        slots.target = detectedTarget.target;
        slots.targetName = detectedTarget.targetName;
      } else {
        return {
          spokenResponse: '¿Para quién es el menú? Puedes decir: Guille, Samuel, los padres o la cena familiar.',
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'target',
          suggestionChips: ['Guille', 'Samuel', 'Padres', 'Cena familiar'],
          card: {
            title: '¿Para quién es el menú? 👤',
            text: 'Indica si es para Guille, Samuel, los papás o la cena familiar.'
          }
        };
      }

      if (slots.dayIndex === null) {
        session.step = 'awaiting_day';
        return {
          spokenResponse: `¿Para qué día de la semana quieres apuntar el menú de ${slots.targetName}?`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'day',
          suggestionChips: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Hoy', 'Mañana'],
          card: {
            title: `Menú de ${slots.targetName} 📅`,
            text: `¿Para qué día de la semana quieres apuntarlo?`
          }
        };
      }

      if (!slots.dish) {
        session.step = 'awaiting_dish';
        return {
          spokenResponse: `Perfecto, ¿qué va a comer ${slots.targetName} el ${slots.dayName}?`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'dish',
          suggestionChips: [],
          card: {
            title: `Menú de ${slots.targetName} (${slots.dayName}) 🍽️`,
            text: `¿Qué comida o plato quieres apuntar?`
          }
        };
      }

      return this.executeMenuSave(slots, db);
    }

    // 2. Esperando día
    if (session.step === 'awaiting_day') {
      const detectedDay = this.detectDay(clean, refDate);
      if (detectedDay) {
        slots.dayIndex = detectedDay.dayIndex;
        slots.dayName = detectedDay.dayName;
      }

      const candidateDish = this.extractDishCandidate(clean);
      if (candidateDish) {
        slots.dish = candidateDish;
      }

      if (slots.dayIndex === null) {
        return {
          spokenResponse: `No he reconocido el día. ¿Es para el lunes, martes, miércoles, jueves, viernes, sábado o domingo?`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'day',
          suggestionChips: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
          card: {
            title: `Día de la semana para ${slots.targetName} 📅`,
            text: 'Por favor, di un día (ej. Martes o Mañana)'
          }
        };
      }

      if (!slots.dish) {
        session.step = 'awaiting_dish';
        return {
          spokenResponse: `Perfecto, ¿qué va a comer ${slots.targetName} el ${slots.dayName}?`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'dish',
          suggestionChips: [],
          card: {
            title: `Menú de ${slots.targetName} (${slots.dayName}) 🍽️`,
            text: `¿Qué comida o plato quieres apuntar?`
          }
        };
      }

      return this.executeMenuSave(slots, db);
    }

    // 3. Esperando plato
    if (session.step === 'awaiting_dish') {
      const dish = this.cleanUpDishInput(clean);
      if (dish && dish.length >= 2) {
        slots.dish = dish;
        return this.executeMenuSave(slots, db);
      } else {
        return {
          spokenResponse: `No te he entendido bien el plato. ¿Qué va a comer ${slots.targetName} el ${slots.dayName}?`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'dish',
          suggestionChips: [],
          card: {
            title: `Menú de ${slots.targetName} (${slots.dayName}) 🍽️`,
            text: 'Di el nombre del plato (ej. Puré de calabacín y merluza)'
          }
        };
      }
    }

    this.resetConversation();
    return this.processQuery(clean, db, refDate);
  }

  handleConsumeConversationTurn(clean, db, refDate, session) {
    const slots = session.slots;
    if (session.step === 'awaiting_amount') {
      const wordNums = { 'un': 1, 'una': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'ocho': 8, 'diez': 10, 'doce': 12, 'media docena': 6, 'una docena': 12 };
      let amount = null;
      const numMatch = clean.match(/\b(\d+)\b/);
      if (numMatch) {
        amount = parseInt(numMatch[1], 10);
      } else {
        for (const [w, val] of Object.entries(wordNums)) {
          const r = new RegExp(`\\b${w}\\b`, 'i');
          if (r.test(clean)) {
            amount = val;
            break;
          }
        }
      }

      if (clean.includes('todo') || clean.includes('toda') || clean.includes('todas') || clean.includes('todos')) {
        amount = slots.remainingUnits;
      }

      if (!amount || amount <= 0) {
        return {
          spokenResponse: `No he reconocido la cantidad. Por favor, dime cuántas unidades has consumido de ${slots.itemName} (por ejemplo: 1, 2, o todas).`,
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'amount',
          suggestionChips: [`1 ${slots.unitName}`, `2 ${slots.unitName}`, 'Todo lo que queda'],
          card: {
            title: `Consumo: ${slots.itemName}`,
            text: `Quedan ${slots.remainingUnits} ${slots.unitName}. Indica una cantidad válida.`
          }
        };
      }

      const inventory = db.get('inventory') || [];
      const item = inventory.find(i => i.id === slots.itemId);
      if (!item) {
        this.resetConversation();
        return {
          spokenResponse: 'El producto ya no se encuentra en el inventario.',
          actionTaken: false,
          actionType: 'none',
          inConversationFlow: false
        };
      }

      const actualConsumed = Math.min(amount, item.remainingUnits || slots.remainingUnits);
      const newRemaining = (item.remainingUnits || slots.remainingUnits) - actualConsumed;

      if (!Array.isArray(item.consumedHistory)) item.consumedHistory = [];
      item.consumedHistory.push({
        id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        date: slots.consumeDate,
        amount: actualConsumed,
        note: 'Consumo por diálogo guiado'
      });

      this.resetConversation();

      if (newRemaining <= 0) {
        db.remove('inventory', item.id);
        return {
          spokenResponse: `De acuerdo, has consumido ${actualConsumed} ${slots.unitName} de ${item.name} y lo he retirado del inventario porque se ha terminado.`,
          actionTaken: true,
          actionType: 'inventory_consume',
          inConversationFlow: false,
          actionData: item,
          card: {
            title: 'Producto Consumido',
            text: `🗑️ ${item.name} retirado del inventario tras consumir sus últimas ${actualConsumed} unidades.`
          }
        };
      } else {
        item.remainingUnits = newRemaining;
        item.quantity = `${newRemaining} ${slots.unitName} (de ${item.totalUnits || slots.totalUnits})`;
        db.update('inventory', item.id, item);

        const locEs = item.location === 'fridge' ? 'la nevera' : (item.location === 'pantry' ? 'la despensa' : 'el congelador');
        return {
          spokenResponse: `Anotado el consumo: has consumido ${actualConsumed} ${slots.unitName} de ${item.name}. Te quedan ${newRemaining} disponibles en ${locEs}.`,
          actionTaken: true,
          actionType: 'inventory_consume_partial',
          inConversationFlow: false,
          actionData: item,
          card: {
            title: `Consumo Parcial: ${item.name}`,
            text: `📉 Consumidas: ${actualConsumed} ${slots.unitName}\n📦 Quedan: ${newRemaining} / ${item.totalUnits || slots.totalUnits} ${slots.unitName}`
          }
        };
      }
    }

    this.resetConversation();
    return this.processQuery(clean, db, refDate);
  }

  handleInventoryAddConversationTurn(clean, db, refDate, session) {
    const slots = session.slots;
    if (session.step === 'awaiting_item') {
      let itemName = clean.trim()
        .replace(/^(un|una|unos|unas|el|la|los|las)\s+/i, '')
        .trim();

      if (!itemName || itemName.length < 2) {
        return {
          spokenResponse: 'No he entendido el nombre del producto. ¿Qué alimento quieres añadir?',
          actionTaken: false,
          actionType: 'conversation_prompt',
          inConversationFlow: true,
          expectedInput: 'item'
        };
      }

      this.resetConversation();
      return this.handleAddInventory(`añade ${itemName} en ${slots.location === 'pantry' ? 'la despensa' : (slots.location === 'freezer' ? 'el congelador' : 'la nevera')}`, db, refDate);
    }

    this.resetConversation();
    return this.processQuery(clean, db, refDate);
  }

  handleMenuUpdate(query, db, currentDate) {
    const clean = query.trim().toLowerCase();
    const targetObj = this.detectMenuTarget(clean);
    const dayObj = this.detectDay(clean, currentDate);
    const dishCandidate = this.extractDishCandidate(clean);

    // Caso 1: Falta el destinatario
    if (!targetObj) {
      this.conversationSession = {
        flow: 'menu',
        step: 'awaiting_target',
        slots: {
          target: null,
          targetName: null,
          dayIndex: dayObj ? dayObj.dayIndex : null,
          dayName: dayObj ? dayObj.dayName : null,
          dish: dishCandidate || null
        },
        expiresAt: Date.now() + 60000
      };

      const dayMention = dayObj ? ` para el ${dayObj.dayName}` : '';
      const dishMention = dishCandidate ? ` (${dishCandidate})` : '';

      return {
        spokenResponse: `¿Para quién es el menú${dayMention}${dishMention}? ¿Para Guille, Samuel, los padres o la cena familiar?`,
        actionTaken: false,
        actionType: 'conversation_prompt',
        inConversationFlow: true,
        expectedInput: 'target',
        suggestionChips: ['Guille', 'Samuel', 'Padres', 'Cena familiar'],
        card: {
          title: 'Apunta Menú 📋',
          text: `¿Para quién quieres apuntar el menú${dayMention}?\n(Guille, Samuel, Padres o Cena)`
        }
      };
    }

    // Caso 2: Falta el día de la semana
    if (!dayObj) {
      this.conversationSession = {
        flow: 'menu',
        step: 'awaiting_day',
        slots: {
          target: targetObj.target,
          targetName: targetObj.targetName,
          dayIndex: null,
          dayName: null,
          dish: dishCandidate || null
        },
        expiresAt: Date.now() + 60000
      };

      const dishMention = dishCandidate ? ` (${dishCandidate})` : '';
      return {
        spokenResponse: `¿Para qué día de la semana quieres apuntar el menú de ${targetObj.targetName}${dishMention}?`,
        actionTaken: false,
        actionType: 'conversation_prompt',
        inConversationFlow: true,
        expectedInput: 'day',
        suggestionChips: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Hoy', 'Mañana'],
        card: {
          title: `Menú: ${targetObj.targetName} 📋`,
          text: `¿Para qué día de la semana quieres apuntarlo?`
        }
      };
    }

    // Caso 3: Falta el plato
    if (!dishCandidate) {
      this.conversationSession = {
        flow: 'menu',
        step: 'awaiting_dish',
        slots: {
          target: targetObj.target,
          targetName: targetObj.targetName,
          dayIndex: dayObj.dayIndex,
          dayName: dayObj.dayName,
          dish: null
        },
        expiresAt: Date.now() + 60000
      };

      return {
        spokenResponse: `Perfecto, ¿qué va a comer ${targetObj.targetName} el ${dayObj.dayName}?`,
        actionTaken: false,
        actionType: 'conversation_prompt',
        inConversationFlow: true,
        expectedInput: 'dish',
        suggestionChips: [],
        card: {
          title: `Menú de ${targetObj.targetName}: ${dayObj.dayName} 🍽️`,
          text: `¿Qué comida o plato quieres apuntar?`
        }
      };
    }

    // Caso 4: Todo presente en una sola orden
    return this.executeMenuSave({
      target: targetObj.target,
      targetName: targetObj.targetName,
      dayIndex: dayObj.dayIndex,
      dayName: dayObj.dayName,
      dish: dishCandidate
    }, db);
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

    // Si tiene unidades múltiples (> 1) y NO se especificó cantidad, iniciar diálogo guiado:
    if (remainingUnits > 1 && !amountSpecified) {
      this.conversationSession = {
        flow: 'consume',
        step: 'awaiting_amount',
        slots: {
          itemId: match.id,
          itemName: match.name,
          remainingUnits: remainingUnits,
          totalUnits: totalUnits,
          unitName: unitName,
          consumeDate: consumeDate,
          location: match.location
        },
        expiresAt: Date.now() + 60000
      };

      const chips = [
        `1 ${unitName}`,
        `2 ${unitName}`,
        Math.min(4, remainingUnits) + ` ${unitName}`,
        'Todo lo que queda'
      ];

      return {
        spokenResponse: `¿Cuántas unidades has consumido de ${match.name}? Actualmente quedan ${remainingUnits} disponibles.`,
        actionTaken: false,
        actionType: 'conversation_prompt',
        inConversationFlow: true,
        expectedInput: 'amount',
        suggestionChips: chips,
        card: {
          title: `Consumo: ${match.name}`,
          text: `Quedan ${remainingUnits} ${unitName}.\n¿Cuántas unidades has consumido?`
        }
      };
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