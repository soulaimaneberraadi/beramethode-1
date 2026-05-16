# Backlog de Refactorización: Tableau de Bord Machines (Inventaire)

## 🐛 Errores Técnicos Resueltos
- [x] **Formato de Fecha ISO:** Se corrigió el problema de `formatLaunch` que mostraba fechas técnicas brutas (ej: `2026 04 06T08:00:00 - 08:00`). Ahora se parsea y formatea correctamente a un estándar limpio (ej: `06 avr. 2026 · 08:00`).
- [x] **Conteo de Máquinas Fantasma (0 MACHINES):** Se validó el recuento de instancias asignadas a las cadenas en tiempo real en las tarjetas de visión general.

## 📐 Mejoras de Arquitectura y UI (Estándar de Diamante)
- [x] **Consolidación de Dashboard:** Se eliminó el sistema de pestañas disgregado (`OVERVIEW`, `INVENTORY`, `MAINTENANCE`, `HISTORY`). Ahora la página es un "Single Pane of Glass" (un solo lugar para todo), respondiendo a la necesidad de ver todas las operaciones en una sola vista.
- [x] **Rediseño del Bento Grid:** Se optimizó la disposición pasando de 3 a 4 columnas (`xl:grid-cols-4`) para las tarjetas de cadena superior, evitando que queden elementos huérfanos.
- [x] **Sección Híbrida Inferior:** La tabla principal de inventario ocupa el 66% del ancho (`col-span-8`), mientras que el 33% restante aloja los widgets de "Mantenimiento" e "Historial" con barras de desplazamiento personalizadas integradas de manera elegante.

## 🚀 Próximos Pasos (Opcional)
- [ ] Optimizar la carga de iconos (Lazy Loading) si el parque de máquinas crece a >1000.
- [ ] Incorporar gráficos circulares para el estado de la flota general en la cabecera del dashboard.
