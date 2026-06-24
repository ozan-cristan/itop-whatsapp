## Why

El listado de solicitudes (activas y resueltas) tenía un problema de presentación: con 10 o más tickets, la fila de "Cancelar" hacía superar el límite de 10 filas de las listas interactivas de WhatsApp y el listado caía a un texto numerado plano, perdiendo la lista seleccionable. Este change documenta las reglas de presentación del listado que garantizan una lista seleccionable consistente y paginada.

> Nota: la implementación ya está realizada y verificada; este change documenta de forma retroactiva el comportamiento (tareas marcadas como completas).

## What Changes

- El listado de tickets SHALL presentarse siempre como **lista seleccionable nativa de WhatsApp** (no como texto numerado ni botones), tanto en solicitudes **activas** como **resueltas**.
- Hasta 10 tickets entran en una sola página.
- Con más de 10, el listado SHALL paginarse de a 9 con una fila "➕ Ver más solicitudes" que avanza de página y cicla al inicio; SHALL indicar "(página X de Y)".
- La opción de cancelar se ofrece por texto ("escribí *cancelar*") en lugar de gastar una fila de la lista.
- La selección usa índice absoluto, de modo que elegir un ticket de cualquier página abre el correcto.

## Capabilities

### New Capabilities
- `ticket-list-display`: Reglas de presentación y navegación del listado de tickets (activos y resueltos) según la cantidad de elementos.

### Modified Capabilities
<!-- ninguna -->

## Impact

- **Código**: `src/flow.js` — helper `buildTicketList`, mensajes `SHOW_TICKETS` / `SHOW_RESOLVED_TICKETS`, manejo de "ver_mas" y reset de página en los estados `TICKET_LIST` / `CLOSED_TICKET_LIST` y al volver desde el detalle. `src/state.js` — campo `ticketPage`.
- **Restricción de plataforma**: WhatsApp limita las listas interactivas a 10 filas y siempre las muestra colapsadas detrás del botón "Seleccionar" (no es posible expandirlas automáticamente); los botones inline están limitados a 3. Estas reglas se diseñan dentro de esos límites.
- **Sin cambios** en `src/itop.js`. **Sin nuevas dependencias.**
- Aplica a la versión activa (Meta API, `src/`) y, por compartir `flow.js`, a `bot_baileys.js`.
