## 1. Estado y sesión

- [x] 1.1 Agregar los estados `EDIT_FIELD_SELECT` y `EDIT_FIELD_VALUE` a `STATES` en `src/state.js`
- [x] 1.2 Agregar el campo `editingField` a `BASE_SESSION` en `src/state.js`

## 2. Validación reutilizable

- [x] 2.1 Extraer la validación de móvil (detección de `0` inicial y de `15`) de `AWAIT_MOBILE` a un helper reutilizable en `src/flow.js`
- [x] 2.2 Reemplazar el bloque inline de `AWAIT_MOBILE` por una llamada al helper (sin cambiar el comportamiento)

## 3. Menú de selección de campo

- [x] 3.1 Crear un constructor de mensaje `MSG.ASK_FIELD_TO_EDIT(session)` que liste SKU, nombre, email, móvil y descripción con su valor actual, más la opción cancelar
- [x] 3.2 En `AWAIT_CONFIRM`, cambiar la rama "Modificar" (input `2`) para que NO borre los valores y transicione a `EDIT_FIELD_SELECT` mostrando el menú de campos

## 4. Edición del campo elegido

- [x] 4.1 Implementar el `case EDIT_FIELD_SELECT`: mapear la selección al campo, guardarlo en `session.editingField`, pasar a `EDIT_FIELD_VALUE` y pedir solo ese campo (reutilizando los `MSG.ASK_*` existentes)
- [x] 4.2 Implementar el `case EDIT_FIELD_VALUE`: validar (móvil vía helper), guardar el nuevo valor en su campo de sesión sin tocar los demás
- [x] 4.3 Tras guardar, transicionar a `AWAIT_CONFIRM` y re-emitir `MSG.CONFIRM_TICKET` con los datos actualizados

## 5. Casos borde

- [x] 5.1 Permitir "cancelar" en `EDIT_FIELD_SELECT` y `EDIT_FIELD_VALUE` para volver al menú principal
- [x] 5.2 Manejar selección inválida en el menú de campos (re-mostrar el menú)
- [x] 5.3 Permitir modificar varios campos en sucesión antes de confirmar

## 6. Verificación

- [x] 6.1 Probar el flujo: cargar ticket → Modificar → editar campo → confirmar, verificando que el resto de los valores se conservan (verificado con prueba automatizada de la máquina de estados)
- [x] 6.2 Verificar que la validación de móvil sigue funcionando tanto en el wizard como en la edición (verificado: rechaza `0` inicial al editar)
- [x] 6.3 Ejecutar `openspec validate edit-ticket-fields-selectively` sin errores
