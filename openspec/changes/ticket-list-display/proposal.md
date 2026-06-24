## Why

El listado de solicitudes (activas y resueltas) tenía dos problemas de presentación en WhatsApp:
1. Con 10 o más tickets, la fila de "Cancelar" hacía superar el límite de 10 filas de las listas interactivas y el listado caía a texto numerado plano.
2. Con listas chicas, la lista quedaba colapsada detrás del botón "Seleccionar", obligando a un toque extra para ver siquiera los tickets.

Este change documenta las reglas de presentación que resuelven ambos casos dentro de los límites de la plataforma.

> Nota: la implementación ya está realizada y verificada; este change documenta de forma retroactiva el comportamiento (tareas marcadas como completas).

## What Changes

- **1 a 3 tickets**: se muestran como **botones inline directos** (sin el toque "Seleccionar"); el cuerpo lista ref + título de cada uno. Es la única forma en WhatsApp de mostrar las opciones sin abrir el selector.
- **4 a 10 tickets**: lista seleccionable nativa de WhatsApp (botón "Seleccionar"), sin omitir ninguno ni caer a texto.
- **Más de 10 tickets**: lista seleccionable paginada de a 9, con fila "➕ Ver más solicitudes" que avanza y cicla; indica "(página X de Y)".
- La opción de cancelar se ofrece por texto ("escribí *cancelar*") en lugar de gastar una fila/botón.
- La selección usa índice absoluto: elegir un ticket en cualquier página o botón abre el correcto.
- Aplica por igual a solicitudes **activas** (seguimiento) y **resueltas**.

## Capabilities

### New Capabilities
- `ticket-list-display`: Reglas de presentación y navegación del listado de tickets según la cantidad de elementos.

### Modified Capabilities
<!-- ninguna -->

## Impact

- **Código**: `src/flow.js` — helper `buildTicketList`, mensajes `SHOW_TICKETS` / `SHOW_RESOLVED_TICKETS`, manejo de "ver_mas" y reset de página en los estados `TICKET_LIST` / `CLOSED_TICKET_LIST` y al volver desde el detalle. `src/state.js` — campo `ticketPage`.
- **Restricción de plataforma**: WhatsApp permite máx. 3 botones inline y máx. 10 filas por lista interactiva, que siempre se muestra colapsada tras "Seleccionar" (no se puede expandir automáticamente). Las reglas se diseñan dentro de esos límites.
- **Sin cambios** en `src/itop.js`. **Sin nuevas dependencias.**
- Aplica a la versión activa (Meta API, `src/`) y, por compartir `flow.js`, a `bot_baileys.js`.
