## 1. Estado

- [x] 1.1 Agregar el campo `ticketPage` a `BASE_SESSION` en `src/state.js`

## 2. Construcción del listado

- [x] 2.1 Implementar el helper `buildTicketList(headerBase, tickets, page)` que arma la lista seleccionable, con cancelar en el cuerpo del mensaje
- [x] 2.2 Paginar de a 9 con fila "Ver más" cuando hay más de 10 tickets; indicar "(página X de Y)"
- [x] 2.3 Usar `id = sel_<índice absoluto>` en cada fila
- [x] 2.4 Apuntar `SHOW_TICKETS` y `SHOW_RESOLVED_TICKETS` al helper

## 3. Navegación

- [x] 3.1 Manejar "ver_mas" en los estados `TICKET_LIST` y `CLOSED_TICKET_LIST` avanzando de página (cíclico)
- [x] 3.2 Resetear `ticketPage` al entrar al listado (seguimiento/resueltos) y al volver desde el detalle ("ver otra")

## 4. Verificación

- [x] 4.1 Prueba: tamaños 1/3/5/10 → lista seleccionable de una página; 23 → paginada con "Ver más"
- [x] 4.2 Prueba: "Ver más" avanza y cicla; la selección por índice absoluto abre el ticket correcto
- [x] 4.3 `node -c src/flow.js` sin errores y `openspec validate ticket-list-display` sin errores
