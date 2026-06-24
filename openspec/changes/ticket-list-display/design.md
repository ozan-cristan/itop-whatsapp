## Context

El listado de tickets se arma en `src/flow.js`. Las respuestas conversacionales se modelan como objetos `{ text, list }` (lista seleccionable) o `{ text, buttons }` (botones), y `src/bot.js` los traduce al payload de la API de Meta. La lista seleccionable se envía como `interactive.type = "list"`.

Restricciones de WhatsApp relevantes:
- Una lista interactiva admite como máximo **10 filas** en total.
- La lista **siempre** se muestra colapsada detrás de un botón ("Seleccionar"/"Ver opciones"); no hay forma de mostrarla expandida.
- Los botones inline (`interactive.type = "button"`) están limitados a **3**.

## Goals / Non-Goals

**Goals:**
- Presentar siempre el listado como lista seleccionable consistente.
- Soportar más de 10 tickets sin perder ninguno ni caer a texto plano.
- Selección robusta independientemente de la página.

**Non-Goals:**
- No se usa texto numerado como mecanismo de listado.
- No se usan botones inline (no permiten mostrar más de 3 ítems).
- No se intenta "expandir" la lista automáticamente (no lo permite WhatsApp).

## Decisions

**1. Lista seleccionable para todos los tamaños.** Se descartó el texto numerado (ilegible/inconsistente) y los botones inline (máx. 3 ítems). La lista nativa es la única que escala a varios ítems mostrando título + descripción por fila.

**2. Paginación de a 9 + fila "Ver más" cuando hay más de 10.** Se reserva una fila para "Ver más" dentro del límite de 10. "Ver más" avanza con módulo sobre el total de páginas (cicla), garantizando acceso a todos los tickets.

**3. Cancelar por texto en lugar de fila.** Así se maximizan las filas disponibles para tickets (hasta 10 en una sola página) y se evita superar el límite.

**4. `id = sel_<índiceAbsoluto>` en cada fila.** La selección mapea directo a `session.tickets`, sin necesidad de recalcular offset por página. El estado `ticketPage` (en `state.js`) recuerda la página actual.

## Risks / Trade-offs

- **El toque en "Seleccionar" es inevitable** para listas en WhatsApp → no es posible "achicar" ese paso sin usar botones (máx. 3); se asume como límite de la plataforma.
- **`bot_baileys.js` comparte `flow.js`** → hereda el comportamiento automáticamente.

## Migration Plan

Cambio de presentación, sin migración de datos. Rollback = revertir el commit. Verificación con prueba de la máquina de estados (tamaños 1/3/5/10/23 y navegación "Ver más").
