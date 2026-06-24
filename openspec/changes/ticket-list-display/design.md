## Context

El listado de tickets se arma en `src/flow.js`. Las respuestas conversacionales se modelan como `{ text, list }` (lista seleccionable) o `{ text, buttons }` (botones), y `src/bot.js` los traduce al payload de la API de Meta.

Restricciones de WhatsApp relevantes:
- Botones inline (`interactive.type = "button"`): máximo **3**.
- Lista interactiva (`interactive.type = "list"`): máximo **10 filas**, y **siempre** se muestra colapsada detrás de un botón ("Seleccionar"/"Ver opciones"); no hay forma de mostrarla expandida.

El menú principal ya es una lista, por lo que al elegir "Seguimiento"/"Resueltos" el usuario llega a un segundo listado. Para listas chicas, ese segundo listado como lista implicaba otro toque en "Seleccionar".

## Goals / Non-Goals

**Goals:**
- Minimizar pasos en listas chicas mostrando las opciones directamente.
- Soportar cualquier cantidad de tickets sin perder ninguno ni caer a texto plano.
- Selección robusta independientemente de la página/botón.

**Non-Goals:**
- No se usa texto numerado como mecanismo de listado.
- No se intenta expandir la lista automáticamente (no lo permite WhatsApp).

## Decisions

**1. Tres niveles según cantidad:**
- **≤ 3 → botones inline.** Única forma de mostrar opciones sin el toque "Seleccionar". El cuerpo lista ref + título porque la etiqueta del botón (máx. 20 chars) solo muestra la referencia.
- **4 a 10 → lista seleccionable** en una sola página.
- **> 10 → lista seleccionable paginada** de a 9 + fila "Ver más" (cíclica).

Alternativa descartada: botones para más de 3 (imposible por el límite de WhatsApp) y texto numerado (rechazado por legibilidad/consistencia).

**2. Cancelar por texto** en lugar de fila/botón, para maximizar el espacio de tickets y respetar los límites.

**3. `id = sel_<índice absoluto>`** en botones y filas: la selección mapea directo a `session.tickets` sin recalcular offset por página. `ticketPage` (en `state.js`) recuerda la página actual.

## Risks / Trade-offs

- **Salto de estilo en el borde 3→4** (botones vs lista) → asumido: es el único modo de lograr lo "directo" en listas chicas dentro de WhatsApp.
- **El botón solo muestra la referencia** → mitigado listando ref + título en el cuerpo del mensaje.
- **`bot_baileys.js` comparte `flow.js`** → hereda el comportamiento automáticamente.

## Migration Plan

Cambio de presentación, sin migración de datos. Rollback = revertir el commit. Verificación con prueba de la máquina de estados (tamaños 1/2/3/4/10/23 y navegación "Ver más").
