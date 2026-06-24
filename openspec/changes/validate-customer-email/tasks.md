## 1. Validación reutilizable

- [x] 1.1 Agregar el mensaje `MSG.EMAIL_INVALID` en `src/flow.js` (con instrucción de reintentar / cancelar, estilo de los `MOBILE_INVALID_*`)
- [x] 1.2 Agregar el helper `validateEmail(input)` que devuelve `MSG.EMAIL_INVALID` si el formato es inválido o `null` si es válido (regex `^\S+@\S+\.\S+$` sobre el input trimmeado)

## 2. Validación en el wizard

- [x] 2.1 En el estado `AWAIT_CUSTOMER_EMAIL`, validar con `validateEmail` antes de guardar; si falla, devolver el error y no avanzar

## 3. Validación en la edición

- [x] 3.1 En `EDIT_FIELD_VALUE`, para el campo `customerEmail` aplicar `validateEmail` igual que se hace con el móvil

## 4. Verificación

- [x] 4.1 Prueba automatizada: email inválido en el wizard se rechaza y vuelve a pedir; email válido avanza
- [x] 4.2 Prueba automatizada: email inválido al editar se rechaza conservando los demás datos; email válido vuelve a confirmación actualizado
- [x] 4.3 `node -c src/flow.js` sin errores y `openspec validate validate-customer-email` sin errores
