## Why

Durante la carga de un ticket, el bot acepta cualquier texto como correo electrónico del cliente: no valida el formato. Esto permite que se creen tickets con emails inválidos (typos, texto sin `@`, etc.), lo que rompe las notificaciones posteriores y obliga a corregir manualmente en iTop.

## What Changes

- Al ingresar el correo en el wizard (paso "email"), el bot SHALL validar que tenga formato de email; si no, lo rechaza con un mensaje claro y vuelve a pedirlo.
- La misma validación SHALL aplicarse al **editar** el email desde la pantalla de confirmación (capability `ticket-field-edit`).
- Se reutiliza el patrón de validación ya existente para el móvil (helper + mensaje en `MSG`), por consistencia.

## Capabilities

### New Capabilities
- `customer-email-validation`: Validación del formato del correo electrónico del cliente cuando se ingresa en el wizard de carga y cuando se edita desde la confirmación.

### Modified Capabilities
<!-- ticket-field-edit aún no está archivada en openspec/specs/, por lo que la
     validación al editar se cubre como parte de la capability nueva. -->

## Impact

- **Código**: `src/flow.js` — nuevo helper `validateEmail`, nuevo mensaje `MSG.EMAIL_INVALID`, validación en el estado `AWAIT_CUSTOMER_EMAIL` y en la edición (`EDIT_FIELD_VALUE` para el campo email).
- **Sin cambios** en `src/itop.js` ni en `src/state.js`.
- **Sin nuevas dependencias** (validación con expresión regular).
- Aplica a la versión activa (Meta API, `src/`) y, por compartir `flow.js`, también a `bot_baileys.js`.
