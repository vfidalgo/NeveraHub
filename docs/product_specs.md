# NeveraHub: Especificación Funcional de Producto (PM & PO)

## 1. Visión del Producto
Transformar una tablet Android 6.0 (Marshmallow) en desuso en el centro neurálgico inteligente para la cocina familiar (montada en la nevera de forma horizontal). El sistema debe funcionar de manera 100% autónoma y offline en la tablet, permitiendo además la interacción en red local desde los teléfonos de los miembros de la familia.

---

## 2. Personas y Casos de Uso

| Rol / Persona | Necesidades Clave | Casos de Uso Típicos |
|---|---|---|
| **Papá / Mamá** | Organización familiar, planificación de comidas, reducción de desperdicio de alimentos. | Consultar qué alimentos caducan pronto, ver qué cenar en función de lo que hay en la nevera, cargar el menú escolar del mes, revisar el calendario semanal. |
| **Hijos (Niños/Jóvenes)** | Rutinas claras, autonomía, ludificación de tareas. | Marcar "Lavarme los dientes", "Hacer la cama", "Deberes hechos" en la pantalla táctil de la nevera con satisfacción visual inmediata. |
| **Familia en Conjunto** | Visión unificada de la semana. | Visualizar los eventos del día de cada persona organizados por colores y avatares al pasar por la cocina. |

---

## 3. Requerimientos Funcionales por Módulo

### 3.1. Módulo Calendario Familiar
- **RF-CAL-01**: Cada evento debe estar asignado a uno o varios miembros de la familia (o a "Toda la familia").
- **RF-CAL-02**: Cada miembro tiene un color temático distintivo y un avatar (ej. Mamá = Morado/Rosa, Papá = Azul, Niño 1 = Verde, Niña 2 = Naranja).
- **RF-CAL-03**: Dos vistas principales:
  - **Vista Semanal**: Columnas por día con bloques de eventos coloreados según el miembro asignado.
  - **Vista Mensual**: Calendario tradicional con indicadores de eventos por día.
- **RF-CAL-04**: Filtro dinámico para ver la agenda de una persona en particular o la agregación de toda la familia.
- **RF-CAL-05**: Creación rápida de eventos desde la pantalla táctil (Título, Fecha, Hora inicio/fin, Asignado a, Ubicación/Notas).

### 3.2. Módulo Hábitos y Rutinas Diarias (Daily Checklist)
- **RF-HAB-01**: Tareas configurables agrupadas por miembro de la familia.
- **RF-HAB-02**: Clasificación por momentos del día: Mañana ☀️, Tarde ⛅, Noche 🌙.
- **RF-HAB-03**: Checkbox táctil grande (touch target mínimo 48x48 dp) con sonido sutil/animación de satisfacción al completarse.
- **RF-HAB-04**: Barra de progreso diario por persona y barra de progreso global del hogar (% de hábitos completados hoy).
- **RF-HAB-05**: Reseteo automático cada medianoche para empezar el nuevo día limpio sin borrar el historial.
- **RF-HAB-06**: Editor de hábitos para añadir, pausar o eliminar tareas por cada miembro.

### 3.3. Módulo Inventario de Nevera & Despensa + Motor Anti-Desperdicio
- **RF-INV-01**: Registro de alimentos con los siguientes campos:
  - Nombre del producto (ej. "Yogures naturales", "Pechuga de pollo", "Tomates").
  - Ubicación: `Nevera`, `Despensa`, `Congelador`.
  - Categoría: `Lácteos`, `Carnes/Pescados`, `Frutas/Verduras`, `Cereales/Legumbres`, `Bebidas`, `Otros`.
  - Cantidad y unidad (ej. "4 unidades", "500 gr").
  - Fecha de entrada / compra.
  - Fecha de consumo preferente / caducidad.
- **RF-INV-02**: Semáforo visual de frescura:
  - 🔴 **Caducado o Vence Hoy** (días restantes <= 0).
  - 🟡 **Consumo Urgente** (vence en 1 a 3 días).
  - 🟢 **En buen estado** (vence en 4 o más días).
- **RF-INV-03**: Contador de alertas destacado en la barra superior (ej. "¡3 productos caducan pronto!").
- **RF-INV-04**: **Motor de Recomendaciones Gastronómicas**:
  - Analiza los productos con estado 🔴 y 🟡.
  - Sugiere recetas y combinaciones de comida que aprovechan prioritariamente esos ingredientes en riesgo.
  - Generador de sugerencia con 1 toque: "¿Qué cocino hoy con lo que caduca?".
- **RF-INV-05**: Marcado rápido de "Consumido" o "Desechado" con botón táctil directo.

### 3.4. Módulo Planificador de Menús Semanales
- **RF-MEN-01**: Matriz semanal (Lunes a Domingo) con 3 franjas diarias:
  1. **Comida Niños / Menú Escolar**: Para transcribir o planificar lo que comen en el colegio y no repetir platos en la cena.
  2. **Comida Adultos / Trabajo**: Para tuppers, comidas fuera o en casa de los padres.
  3. **Cena Familiar**: El plato compartido de la noche para todos los miembros.
- **RF-MEN-02**: Indicador destacado del "Menú de Hoy" para visualización inmediata en la pantalla principal.
- **RF-MEN-03**: Edición inline rápida con autocompletado y botón para copiar menús o sugerir según el inventario.

### 3.5. Módulo Panel Principal (Kitchen Dashboard Kiosk)
- **RF-DSH-01**: Reloj digital de gran tamaño (visible desde cualquier punto de la cocina).
- **RF-DSH-02**: Fecha en español con santo/festividad o mensaje motivador del día.
- **RF-DSH-03**: Widgets de resumen rápido:
  - Próximos 3 eventos familiares del día.
  - Progreso de hábitos de hoy.
  - Qué toca para cenar hoy.
  - Alerta de productos perecederos urgentes.
- **RF-DSH-04**: Modo Nocturno / Ahorro de brillo: Atenuación de pantalla programable (ej. de 23:00 a 07:00) con reloj tenue negro OLED-friendly para no iluminar la cocina de noche.

---

## 4. Requerimientos No Funcionales

1. **Rendimiento en Hardware Antiguo (Android 6.0 Marshmallow)**:
   - Tiempo de carga inicial < 1.5 segundos.
   - Consumo de RAM < 70 MB.
   - Sin animaciones CSS pesadas que provoquen *jank* en GPUs antiguas (Snapdragon 400 / MediaTek de 2015-2016).
2. **Resiliencia y Funcionamiento Autónomo**:
   - Si el router WiFi se apaga o la conexión a internet cae, la pantalla de la nevera sigue operando al 100% de forma local.
3. **Ergonomía Táctil de Cocina**:
   - Objetivos táctiles amplios para interactuar incluso con dedos húmedos mientras se cocina.
   - Tipografía sans-serif con alto contraste (cumplimiento WCAG AA).
