## Context

El wizard de creación de tickets vive en `src/flow.js` como una máquina de estados sobre la sesión en memoria (`src/state.js`). Los campos se cargan en secuencia: `AWAIT_SKU → AWAIT_CUSTOMER_NAME → AWAIT_CUSTOMER_EMAIL → AWAIT_MOBILE → AWAIT_DESC → AWAIT_CONFIRM`. Cada paso guarda su valor en la sesión vía `updateSession`.

Hoy, en `AWAIT_CONFIRM`, la opción "Modificar" (input `2`) hace:

```js
updateSession(sessionKey, { state: STATES.AWAIT_SKU, sku: null, customerName: null,
  customerEmail: null, numeroMovil: null, title: null, description: null });
return MSG.ASK_SKU;
```

Es decir, borra todo y reinicia. Los valores ya viven en la sesión, así que técnicamente solo hace falta **no borrarlos** y enrutar a una edición puntual.

La UI de WhatsApp soporta listas interactivas (`withList`) y botones (`withButtons`), patrón ya usado en el menú principal y la confirmación.

## Goals / Non-Goals

**Goals:**
- Que "Modificar" abra un menú de campos en vez de reiniciar el wizard.
- Editar un solo campo a la vez preservando el resto.
- Reutilizar las validaciones existentes (móvil) y los mensajes (`MSG.*`).
- Volver a la confirmación tras cada edición.

**Non-Goals:**
- No cambia la integración con iTop (`itop.js`) ni el payload de creación.
- No se agrega edición de servicio/subcategoría (se eligen antes del SKU; quedan fuera del alcance de esta iteración).
- No se persiste la sesión fuera de memoria.

## Decisions

**1. Reutilizar los valores de sesión en lugar de borrarlos.** Los campos ya están en la sesión; la edición selectiva solo necesita enrutar al paso correcto sin limpiar. Alternativa descartada: snapshot/clon de los datos — innecesario porque la sesión ya es la fuente de verdad.

**2. Dos estados nuevos en `STATES`:**
- `EDIT_FIELD_SELECT`: se muestra el menú de campos; la entrada elige cuál editar.
- `EDIT_FIELD_VALUE`: se espera el nuevo valor del campo elegido; se guarda en `session.editingField` cuál es.

Alternativa considerada: reusar los estados `AWAIT_*` existentes con un flag "modo edición". Descartada porque esos estados avanzan al siguiente paso del wizard al terminar; en modo edición debemos volver a `AWAIT_CONFIRM`, lo que ensuciaría cada `case` con condicionales.

**3. Tras guardar el valor editado, transicionar a `AWAIT_CONFIRM` y re-emitir `MSG.CONFIRM_TICKET`.** Mantiene un único punto de confirmación y permite encadenar varias ediciones.

**4. Menú de campos con `withList`** (cinco filas + cancelar), cada fila con `title` del campo y el valor actual en `description`. Para el móvil se reutiliza el bloque de validación de `AWAIT_MOBILE` extrayéndolo a un helper compartido para no duplicar la lógica del `0`/`15`.

## Risks / Trade-offs

- **Duplicación de la validación de móvil** → Mitigación: extraer la validación a una función reutilizable usada tanto por `AWAIT_MOBILE` como por la edición.
- **El TTL de sesión (15 min) puede expirar a mitad de la edición** → Comportamiento existente del wizard; se mantiene igual (al expirar se pide CUIT de nuevo). No se introduce regresión.
- **`bot_baileys.js` comparte `flow.js`** → como la lógica está centralizada, ambos frontends heredan el cambio sin tocar el código de cada bot.

## Migration Plan

Cambio puramente aditivo en la lógica conversacional; no requiere migración de datos. Rollback = revertir el commit. Verificación manual recorriendo el wizard hasta la confirmación y probando editar cada campo.
