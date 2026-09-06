const test = require('node:test');
const assert = require('node:assert');
const recipeEngine = require('../server/recipeEngine');

test('Motor de Recetas: Cálculo de días restantes de caducidad', () => {
  const refDate = '2026-09-06';
  
  // Caduca hoy
  const todayExpiry = recipeEngine.calculateDaysRemaining('2026-09-06', refDate);
  assert.strictEqual(todayExpiry, 0);

  // Caducó ayer
  const pastExpiry = recipeEngine.calculateDaysRemaining('2026-09-05', refDate);
  assert.strictEqual(pastExpiry, -1);

  // Caduca en 3 días
  const futureExpiry = recipeEngine.calculateDaysRemaining('2026-09-09', refDate);
  assert.strictEqual(futureExpiry, 3);
});

test('Motor de Recetas: Clasificación de urgencia en inventario', () => {
  const refDate = '2026-09-06';
  const mockInventory = [
    { id: '1', name: 'Pechugas de pollo', expiryDate: '2026-09-07' }, // vence en 1 día -> urgente
    { id: '2', name: 'Yogur', expiryDate: '2026-09-06' },             // vence hoy -> expired_today
    { id: '3', name: 'Arroz', expiryDate: '2027-01-01' }              // seguro -> good
  ];

  const analyzed = recipeEngine.analyzeInventory(mockInventory, refDate);
  assert.strictEqual(analyzed.length, 3);

  const pollo = analyzed.find(i => i.id === '1');
  assert.strictEqual(pollo.status, 'urgent');
  assert.strictEqual(pollo.urgencyWeight, 2);

  const yogur = analyzed.find(i => i.id === '2');
  assert.strictEqual(yogur.status, 'expired_today');
  assert.strictEqual(yogur.urgencyWeight, 3);

  const arroz = analyzed.find(i => i.id === '3');
  assert.strictEqual(arroz.status, 'good');
  assert.strictEqual(arroz.urgencyWeight, 0);
});

test('Motor de Recetas: Recomendación priorizada por alimentos en riesgo de caducar', () => {
  const refDate = '2026-09-06';
  const mockInventory = [
    { id: '1', name: 'Calabacines frescos', expiryDate: '2026-09-07' }, // vence en 1 día
    { id: '2', name: 'Huevos de campo', expiryDate: '2026-09-25' },     // vence en 19 días
    { id: '3', name: 'Queso rallado', expiryDate: '2026-09-08' },       // vence en 2 días
    { id: '4', name: 'Pasta espaguetis', expiryDate: '2027-02-01' }     // despensa segura
  ];

  const result = recipeEngine.getRecommendedRecipes(mockInventory, refDate);
  
  assert.ok(result.recipes.length > 0, 'Debe devolver al menos una receta disponible');
  
  // La receta con mayor prioridad debe ser la que rescata calabacín y/o queso (como la tortilla de calabacín o la crema)
  const topRecipe = result.recipes[0];
  assert.ok(topRecipe.rescuedCount > 0, 'La receta superior debe rescatar alimentos urgentes');
  assert.ok(
    topRecipe.title.toLowerCase().includes('calabacín') || topRecipe.title.toLowerCase().includes('queso'),
    'La receta superior debe contener los ingredientes que caducan pronto'
  );
});
