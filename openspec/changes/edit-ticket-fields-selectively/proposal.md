## Why

Durante la creación de un ticket, cuando el usuario llega a la pantalla de confirmación y elige **✏️ Modificar**, el bot descarta todos los datos cargados y reinicia el wizard desde el SKU, obligándolo a re-tipear nombre, email, móvil y descripción aunque solo quisiera corregir un campo. Esto genera fricción, abandono del flujo y errores al re-ingresar datos que ya estaban bien.

## What Changes

- Al elegir **✏️ Modificar** en la confirmación, el bot ya **no** reinicia el wizard ni borra los valores cargados.
- En su lugar, muestra un **menú de campos editables** (SKU, nombre, email, móvil, descripción) con el valor actual de cada uno, y el usuario elige **cuál** quiere modificar.
- El bot pide **solo ese campo**, conservando el resto de los valores. Tras editarlo, vuelve a la pantalla de confirmación con los datos actualizados.
- El usuario puede modificar varios campos en sucesión antes de confirmar.
- Las validaciones existentes (p. ej. formato de móvil sin `0` ni `15`) se reutilizan al editar el campo correspondiente.
- **BREAKING** (comportamiento, no API): la opción "Modificar" cambia su significado de "reiniciar carga" a "editar campo a campo".

## Capabilities

### New Capabilities
- `ticket-field-edit`: Edición selectiva, campo a campo, de los datos de un ticket en curso desde la pantalla de confirmación, preservando los valores ya ingresados.

### Modified Capabilities
<!-- No existen specs previas en openspec/specs/; el flujo de creación de tickets aún no está especificado, por lo que el comportamiento se introduce como capability nueva. -->

## Impact

- **Código**: `src/flow.js` — estado `AWAIT_CONFIRM` (rama "Modificar"), nuevos estados de selección/edición de campo; `src/state.js` — nuevo estado en `STATES` y, si hace falta, campo para recordar a qué paso volver.
- **Sin cambios** en `src/itop.js` ni en la integración con la API de iTop (los datos se envían igual al confirmar).
- **Compatibilidad**: aplica a la versión activa (Meta API, `src/`) y al núcleo compartido que usa también `bot_baileys.js`.
- **Sin nuevas dependencias.**
