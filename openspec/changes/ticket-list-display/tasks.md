## 1. Estado

- [x] 1.1 Agregar el campo `ticketPage` a `BASE_SESSION` en `src/state.js`

## 2. Construcción del listado (3 niveles)

- [x] 2.1 ≤ 3 tickets: botones inline (`sel_<i>`) con ref + título en el cuerpo
- [x] 2.2 4 a 10 tickets: lista seleccionable en una sola página, con cancelar en el cuerpo
- [x] 2.3 Más de 10: paginar de a 9 con fila "Ver más" e indicar "(página X de Y)"
- [x] 2.4 Usar `id = sel_<índice absoluto>` en botones y filas
- [x] 2.5 Apuntar `SHOW_TICKETS` y `SHOW_RESOLVED_TICKETS` al helper `buildTicketList`

## 3. Navegación

- [x] 3.1 Manejar "ver_mas" en los estados `TICKET_LIST` y `CLOSED_TICKET_LIST` avanzando de página (cíclico)
- [x] 3.2 Resetear `ticketPage` al entrar al listado (seguimiento/resueltos) y al volver desde el detalle ("ver otra")

## 4. Verificación

- [x] 4.1 Prueba: 1/2/3 → botones; 4/10 → lista seleccionable; 23 → paginada con "Ver más"
- [x] 4.2 Prueba: "Ver más" avanza y cicla; la selección por índice absoluto abre el ticket correcto
- [x] 4.3 `node -c src/flow.js` sin errores y `openspec validate ticket-list-display` sin errores
