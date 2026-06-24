## Context

El wizard de carga de tickets vive en `src/flow.js`. El paso del email es el estado `AWAIT_CUSTOMER_EMAIL`, que hoy guarda el valor sin validar:

```js
case STATES.AWAIT_CUSTOMER_EMAIL: {
  if (!input) return MSG.ASK_CUSTOMER_EMAIL;
  updateSession(sessionKey, { state: STATES.AWAIT_MOBILE, customerEmail: input });
  return MSG.ASK_MOBILE;
}
```

Ya existe un patrón de validación para el móvil: el helper `validateMobile(input)` (devuelve un mensaje de error o `null`) y los mensajes `MSG.MOBILE_INVALID_*`. La edición de campos (`EDIT_FIELD_VALUE`) reutiliza `validateMobile` para el campo móvil; el email se guarda sin validar.

## Goals / Non-Goals

**Goals:**
- Validar el formato del email en el wizard y al editarlo.
- Reutilizar el patrón existente (helper + mensaje en `MSG`).
- Mensaje de error claro y opción de reintentar/cancelar.

**Non-Goals:**
- No se verifica que el email exista o sea entregable (solo formato).
- No se cambia la integración con iTop ni el estado en `state.js`.
- No se valida el nombre ni otros campos en esta iteración.

## Decisions

**1. Helper `validateEmail(input)` espejando `validateMobile`.** Devuelve el mensaje de error (`MSG.EMAIL_INVALID`) si el formato es inválido, o `null` si es válido. Mantiene la simetría del código y un único lugar de validación reutilizable por el wizard y la edición.

**2. Expresión regular simple y pragmática:** `/^\S+@\S+\.\S+$/` sobre el input recortado (`trim`). Alternativa descartada: regex exhaustiva tipo RFC 5322 — innecesariamente compleja y propensa a falsos negativos; para este caso basta con exigir local`@`dominio`.`tld sin espacios.

**3. Recortar espacios (`trim`) antes de validar y guardar**, ya que `handleMessage` recibe `input` ya trimmeado, pero el helper lo aplica igualmente por robustez.

**4. Reutilización en la edición:** en `EDIT_FIELD_VALUE`, para el campo `customerEmail` se llama a `validateEmail` igual que ya se hace con `numeroMovil` y `validateMobile`.

## Risks / Trade-offs

- **La regex puede aceptar algún email técnicamente inválido o rechazar casos raros válidos** (p. ej. TLD sin punto en intranets) → Mitigación: el patrón cubre el 99% de los casos reales de clientes; si aparece un falso negativo, se ajusta el regex en un único lugar.
- **`bot_baileys.js` comparte `flow.js`** → ambos frontends heredan la validación automáticamente.

## Migration Plan

Cambio aditivo en la lógica conversacional, sin migración de datos. Rollback = revertir el commit. Verificación con prueba automatizada de la máquina de estados (email válido/ inválido en wizard y en edición).
