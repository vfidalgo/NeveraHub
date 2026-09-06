# NeveraHub: Arquitectura del Sistema y Rendimiento

## 1. Diagrama de Arquitectura

```
+-------------------------------------------------------------------------+
|                  DISPOSITIVOS EN LA RED FAMILIAR                        |
|                                                                         |
|  +--------------------------------+   +------------------------------+  |
|  | Tablet Nevera (Android 6.0)    |   | Smartphones Padres (iOS/And) |  |
|  | - Modo Kiosko Horizontal       |   | - Navegador Móvil / PWA      |  |
|  | - Pantalla táctil cocina       |   | - Consulta y alta rápida     |  |
|  | - Fallback offline en APK      |   |   de compra / eventos        |  |
|  +--------------------------------+   +------------------------------+  |
|                  |                                   |                  |
+------------------|-----------------------------------|------------------+
                   |                                   |
                   v                                   v
+-------------------------------------------------------------------------+
|                       SERVIDOR LOCAL NEVERAHUB                          |
|                       (Node.js / Express API)                           |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | API REST Endpoints                                                |  |
|  |  - /api/members      : Gestión de miembros familiares             |  |
|  |  - /api/events       : Calendario familiar por persona            |  |
|  |  - /api/habits       : Checklist y rutinas diarias                |  |
|  |  - /api/inventory    : Nevera, despensa y semáforo caducidad      |  |
|  |  - /api/recipes      : Motor anti-desperdicio de comidas          |  |
|  |  - /api/menus        : Planificador semanal (cole, papás, cenas)  |  |
|  |  - /api/kiosk        : Estado de pantalla, brillo y modo noche    |  |
|  +-------------------------------------------------------------------+  |
|                                  |                                      |
|  +-------------------------------+-----------------------------------+  |
|  | Persistencia Atómica Local (server/db.js -> data/neverahub_db.json)|  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. Decisiones de Rendimiento para Android 6.0 (Marshmallow API 23)

1. **Evitar Frameworks Pesados**:
   - Tablets de 2015-2016 suelen contar con 1GB a 1.5GB de RAM y procesadores Quad-Core Cortex-A7/A53 modestos.
   - El uso de frameworks pesados (Angular, Next.js, etc.) genera tiempos de hidratación lentos y alto consumo de memoria.
   - **Solución**: Vanilla JS con arquitectura modular orientada a componentes por pestañas, CSS Grid nativo (soportado desde Chromium 57, con polyfill/fallback Flexbox compatible con Chromium 44+ de Marshmallow).

2. **Touch Targets Amplios**:
   - Botones de navegación de al menos `60px` de altura.
   - Controles de selección y checkboxes táctiles de `36px` a `48px` con padding extendido.

3. **Prevención de Quemado de Pantalla (Screen Burn-In)**:
   - Modo noche automático con atenuación lumínica y cambio sutil de posición de elementos estáticos cada hora.

4. **Operabilidad Inmediata y Empaquetado**:
   - Frontend desacoplado en carpeta `public/`: puede ejecutarse directamente en cualquier navegador abriendo el servidor Node.js.
   - Envoltorio nativo Android en carpeta `android/`: carga el dashboard embebido con aceleración por hardware (`android:hardwareAccelerated="true"`).

---

## 3. Modelo de Datos Unificado

```json
{
  "members": [
    { "id": "m1", "name": "Papá", "role": "parent", "color": "#3B82F6", "avatar": "👨", "order": 1 },
    { "id": "m2", "name": "Mamá", "role": "parent", "color": "#EC4899", "avatar": "👩", "order": 2 },
    { "id": "m3", "name": "Lucas", "role": "child", "color": "#10B981", "avatar": "👦", "order": 3 },
    { "id": "m4", "name": "Sofía", "role": "child", "color": "#F59E0B", "avatar": "👧", "order": 4 }
  ],
  "events": [
    { "id": "e1", "title": "Pediatra Sofía", "memberId": "m4", "date": "2026-09-08", "startTime": "17:00", "endTime": "18:00", "notes": "Revisión anual" }
  ],
  "habits": [
    { "id": "h1", "memberId": "m3", "title": "Lavarse los dientes (Mañana)", "period": "morning", "active": true },
    { "id": "h2", "memberId": "m3", "title": "Deberes del cole", "period": "afternoon", "active": true },
    { "id": "h3", "memberId": "m3", "title": "Lavarse los dientes (Noche)", "period": "night", "active": true },
    { "id": "h4", "memberId": "m2", "title": "Hacer deporte 30 min", "period": "afternoon", "active": true }
  ],
  "habitLogs": {
    "2026-09-06": { "h1": true, "h2": false, "h3": false, "h4": true }
  },
  "inventory": [
    { "id": "i1", "name": "Pechugas de pollo", "category": "meat", "location": "fridge", "quantity": "500g", "addedDate": "2026-09-04", "expiryDate": "2026-09-07" },
    { "id": "i2", "name": "Yogures naturales", "category": "dairy", "location": "fridge", "quantity": "4 uds", "addedDate": "2026-09-01", "expiryDate": "2026-09-08" },
    { "id": "i3", "name": "Calabacines", "category": "vegetables", "location": "fridge", "quantity": "2 uds", "addedDate": "2026-09-03", "expiryDate": "2026-09-07" },
    { "id": "i4", "name": "Arroz redondo", "category": "pantry", "location": "pantry", "quantity": "1 kg", "addedDate": "2026-08-15", "expiryDate": "2027-01-01" }
  ],
  "menus": {
    "monday": { "kidsLunch": "Lentejas con verduras y fruta", "parentsLunch": "Ensalada completa con atún", "dinner": "Tortilla de calabacín y yogur" },
    "tuesday": { "kidsLunch": "Pollo asado con patatas", "parentsLunch": "Pechuga de pollo a la plancha con arroz", "dinner": "Crema de verduras y pescado al horno" }
  },
  "kioskSettings": {
    "nightModeEnabled": true,
    "nightStart": "23:00",
    "nightEnd": "07:00",
    "screenTimeout": 0,
    "language": "es"
  }
}
```
