/**
 * Motor Inteligente de Recomendaciones de Comidas Anti-Desperdicio
 * Prioriza recetas basadas en los ingredientes que están más próximos a caducar.
 */

const RECIPE_CATALOG = [
  {
    id: 'rec_crema_calabacin',
    title: 'Crema suave de calabacín y quesitos',
    timeMinutes: 20,
    difficulty: 'Fácil',
    icon: '🥣',
    category: 'Cena ligera',
    requiredKeywords: ['calabacín', 'calabacines'],
    optionalKeywords: ['queso', 'leche', 'patata'],
    instructions: 'Trocear los calabacines, cocer con un vaso de agua o leche 12 min. Batir con queso y una pizca de sal.'
  },
  {
    id: 'rec_pollo_salteado',
    title: 'Salteado de pollo jugoso con verduras',
    timeMinutes: 25,
    difficulty: 'Fácil',
    icon: '🍗',
    category: 'Comida / Cena',
    requiredKeywords: ['pollo', 'pechuga'],
    optionalKeywords: ['calabacín', 'tomate', 'arroz', 'guisantes'],
    instructions: 'Cortar la pechuga en tiras. Dorar en sartén con aceite y saltear con verduras en tiras finas. Servir con arroz o ensalada.'
  },
  {
    id: 'rec_tortilla_calabacin',
    title: 'Tortilla jugosa de calabacín y queso',
    timeMinutes: 15,
    difficulty: 'Fácil',
    icon: '🍳',
    category: 'Cena rápida',
    requiredKeywords: ['huevos', 'calabacín'],
    optionalKeywords: ['queso', 'cebolla'],
    instructions: 'Rallar o picar fino el calabacín, pochar 6 min en la sartén. Batir los huevos con queso, verter y cuajar al gusto.'
  },
  {
    id: 'rec_arroz_pollo_verduras',
    title: 'Arroz salteado con pollo, verduras y guisantes',
    timeMinutes: 30,
    difficulty: 'Media',
    icon: '🍚',
    category: 'Comida familiar',
    requiredKeywords: ['arroz'],
    optionalKeywords: ['pollo', 'guisantes', 'tomate', 'calabacín'],
    instructions: 'Sofreír el pollo y verduras. Añadir el arroz, sofreír 2 min, verter el doble de agua caliente o caldo y cocer 18 minutos.'
  },
  {
    id: 'rec_pasta_tomate_queso',
    title: 'Espaguetis con salsa de tomate casera y mozzarella',
    timeMinutes: 20,
    difficulty: 'Fácil',
    icon: '🍝',
    category: 'Comida niños / Cena',
    requiredKeywords: ['pasta', 'espaguetis', 'macarrones'],
    optionalKeywords: ['tomate', 'tomates', 'queso'],
    instructions: 'Cocer la pasta al dente. En otra sartén reducir los tomates picados con sal y orégano. Mezclar y coronar con queso fundido.'
  },
  {
    id: 'rec_ensalada_tomate_queso',
    title: 'Ensalada fresca de tomates maduros y queso',
    timeMinutes: 10,
    difficulty: 'Muy fácil',
    icon: '🥗',
    category: 'Entrante / Cena',
    requiredKeywords: ['tomate', 'tomates'],
    optionalKeywords: ['queso', 'huevo', 'atún'],
    instructions: 'Cortar los tomates maduros en rodajas. Añadir queso, un toque de orégano, aceite de oliva virgen extra y sal en escamas.'
  },
  {
    id: 'rec_tortilla_francesa_completa',
    title: 'Tortilla francesa esponjosa con queso fundido',
    timeMinutes: 10,
    difficulty: 'Muy fácil',
    icon: '🍳',
    category: 'Cena exprés',
    requiredKeywords: ['huevos'],
    optionalKeywords: ['queso', 'jamón', 'tomate'],
    instructions: 'Batir 2 huevos con una pizca de leche y sal. Cuajar en sartén antiadherente y rellenar con queso rallado antes de doblar.'
  },
  {
    id: 'rec_guisantes_jamon_huevo',
    title: 'Guisantes salteados con huevo escalfado',
    timeMinutes: 15,
    difficulty: 'Fácil',
    icon: '🍲',
    category: 'Cena saludable',
    requiredKeywords: ['guisantes'],
    optionalKeywords: ['huevos', 'cebolla', 'jamón'],
    instructions: 'Rehogar los guisantes en sartén 8 min. Añadir un huevo encima, tapar a fuego suave hasta que la clara cuaje.'
  },
  {
    id: 'rec_postre_yogur_fruta',
    title: 'Copa de yogur cremoso con fruta o frutos secos',
    timeMinutes: 5,
    difficulty: 'Muy fácil',
    icon: '🍧',
    category: 'Desayuno / Postre',
    requiredKeywords: ['yogur', 'yogures'],
    optionalKeywords: ['fruta', 'leche', 'miel'],
    instructions: 'Servir el yogur en un vaso o bol. Añadir fruta fresca troceada y un toque de canela o miel.'
  }
];

function calculateDaysRemaining(expiryDateStr, referenceDateStr) {
  if (!expiryDateStr) return 999;
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  ref.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  const diffTime = exp.getTime() - ref.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function normalize(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function itemMatchesKeyword(itemName, keyword) {
  const normItem = normalize(itemName);
  const normKw = normalize(keyword);
  return normItem.includes(normKw) || normKw.includes(normItem);
}

function parseQuantityUnits(quantityStr) {
  if (typeof quantityStr === 'number') {
    return { totalUnits: quantityStr, remainingUnits: quantityStr, unitName: 'uds' };
  }
  if (!quantityStr || typeof quantityStr !== 'string') {
    return { totalUnits: 1, remainingUnits: 1, unitName: 'ud' };
  }
  const str = quantityStr.trim();
  
  // Docenas (1 docena = 12 unidades)
  const matchDocena = str.match(/(\d+)?\s*docenas?/i);
  if (matchDocena) {
    const dCount = matchDocena[1] ? parseInt(matchDocena[1], 10) : 1;
    return { totalUnits: dCount * 12, remainingUnits: dCount * 12, unitName: 'huevos' };
  }

  // Media docena = 6
  if (/media\s+docena/i.test(str)) {
    return { totalUnits: 6, remainingUnits: 6, unitName: 'huevos' };
  }

  // Número al inicio: ej. "24 huevos", "12 uds", "2 bricks", "4 latas", "6", etc.
  const matchNum = str.match(/^(\d+)\s*(.*)$/);
  if (matchNum) {
    const num = parseInt(matchNum[1], 10);
    const unitPart = (matchNum[2] || '').trim();
    const isWeightVolumeSingle = /^(kg|kilos?|g|gramos?|l|litros?|ml|bote|paquete|tarro|bolsa)\b/i.test(unitPart);
    if (isWeightVolumeSingle && num === 1) {
      return { totalUnits: 1, remainingUnits: 1, unitName: unitPart || 'ud' };
    }
    return { totalUnits: num, remainingUnits: num, unitName: unitPart || 'uds' };
  }

  return { totalUnits: 1, remainingUnits: 1, unitName: 'ud' };
}

function analyzeInventory(inventory, referenceDateStr) {
  return inventory.map(item => {
    const daysLeft = calculateDaysRemaining(item.expiryDate, referenceDateStr);
    let status = 'good'; // bueno
    let urgencyWeight = 0;

    if (daysLeft <= 0) {
      status = 'expired_today'; // Caducado o vence hoy
      urgencyWeight = 3;
    } else if (daysLeft <= 3) {
      status = 'urgent'; // Vence en 1-3 días
      urgencyWeight = 2;
    } else if (daysLeft <= 7) {
      status = 'soon'; // Vence en una semana
      urgencyWeight = 1;
    }

    let totalUnits = typeof item.totalUnits === 'number' ? item.totalUnits : null;
    let remainingUnits = typeof item.remainingUnits === 'number' ? item.remainingUnits : null;
    let unitName = item.unitName || null;
    const consumedHistory = Array.isArray(item.consumedHistory) ? item.consumedHistory : [];

    if (totalUnits === null || remainingUnits === null) {
      const parsed = parseQuantityUnits(item.quantity);
      if (totalUnits === null) totalUnits = parsed.totalUnits;
      if (remainingUnits === null) remainingUnits = parsed.remainingUnits;
      if (!unitName) unitName = parsed.unitName;
    }

    return {
      ...item,
      totalUnits,
      remainingUnits,
      unitName: unitName || 'uds',
      consumedHistory,
      daysLeft,
      status,
      urgencyWeight
    };
  });
}

function getRecommendedRecipes(inventory, referenceDateStr) {
  const analyzedItems = analyzeInventory(inventory, referenceDateStr);

  const recommendations = RECIPE_CATALOG.map(recipe => {
    const matchedRequired = [];
    const matchedOptional = [];
    let rescuedUrgentItems = [];
    let totalScore = 0;

    // Verificar ingredientes requeridos
    recipe.requiredKeywords.forEach(kw => {
      const match = analyzedItems.find(item => itemMatchesKeyword(item.name, kw));
      if (match) {
        matchedRequired.push({ keyword: kw, item: match });
        if (match.urgencyWeight >= 2) {
          rescuedUrgentItems.push(match);
          totalScore += match.urgencyWeight * 15;
        } else {
          totalScore += 5;
        }
      }
    });

    // Verificar ingredientes opcionales
    recipe.optionalKeywords.forEach(kw => {
      const match = analyzedItems.find(item => itemMatchesKeyword(item.name, kw));
      if (match) {
        matchedOptional.push({ keyword: kw, item: match });
        if (match.urgencyWeight >= 2) {
          rescuedUrgentItems.push(match);
          totalScore += match.urgencyWeight * 10;
        } else {
          totalScore += 3;
        }
      }
    });

    const isAvailable = matchedRequired.length === recipe.requiredKeywords.length;
    const allKeywordsCount = recipe.requiredKeywords.length + recipe.optionalKeywords.length;
    const matchedCount = matchedRequired.length + matchedOptional.length;
    const coveragePercent = Math.round((matchedCount / allKeywordsCount) * 100);

    // Quitar duplicados en rescatados
    const uniqueRescued = Array.from(new Set(rescuedUrgentItems.map(i => i.id)))
      .map(id => rescuedUrgentItems.find(i => i.id === id));

    return {
      ...recipe,
      isAvailable,
      matchedRequired,
      matchedOptional,
      rescuedUrgentItems: uniqueRescued,
      rescuedCount: uniqueRescued.length,
      coveragePercent,
      totalScore
    };
  });

  // Filtrar solo las que tienen al menos los ingredientes obligatorios y ordenar
  const availableRecipes = recommendations.filter(r => r.isAvailable);

  availableRecipes.sort((a, b) => {
    // 1. Mayor cantidad de ingredientes urgentes que rescata
    if (b.rescuedCount !== a.rescuedCount) {
      return b.rescuedCount - a.rescuedCount;
    }
    // 2. Mayor puntuación de urgencia
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // 3. Mayor porcentaje de ingredientes de la despensa
    return b.coveragePercent - a.coveragePercent;
  });

  return {
    urgentItemsCount: analyzedItems.filter(i => i.urgencyWeight >= 2).length,
    urgentItems: analyzedItems.filter(i => i.urgencyWeight >= 2),
    recipes: availableRecipes
  };
}

module.exports = {
  RECIPE_CATALOG,
  calculateDaysRemaining,
  normalize,
  parseQuantityUnits,
  analyzeInventory,
  getRecommendedRecipes
};
