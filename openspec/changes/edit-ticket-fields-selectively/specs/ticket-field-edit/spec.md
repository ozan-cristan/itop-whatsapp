## ADDED Requirements

### Requirement: Menú de selección de campo al modificar
Cuando el usuario elija modificar durante la confirmación de un ticket, el sistema SHALL presentar un menú con los campos editables (SKU, nombre del cliente, email, móvil, descripción) mostrando el valor actual de cada uno, en lugar de reiniciar la carga del ticket.

#### Scenario: El usuario pide modificar desde la confirmación
- **WHEN** el ticket está en estado de confirmación y el usuario elige "✏️ Modificar"
- **THEN** el sistema muestra un menú con cada campo editable y su valor actual
- **AND** no descarta ninguno de los valores ya ingresados

#### Scenario: Campo opcional sin valor
- **WHEN** se muestra el menú de campos y el SKU no fue cargado (omitido)
- **THEN** el sistema lista el campo SKU indicando que está vacío o sin definir

### Requirement: Edición de un único campo preservando el resto
Al seleccionar un campo del menú, el sistema SHALL solicitar únicamente ese campo y, al recibir el nuevo valor, SHALL conservar sin cambios todos los demás valores del ticket.

#### Scenario: Modificar la descripción
- **WHEN** el usuario selecciona "Descripción" e ingresa un texto nuevo
- **THEN** el sistema actualiza solo la descripción
- **AND** mantiene intactos SKU, nombre, email y móvil

#### Scenario: Reutilización de validaciones existentes
- **WHEN** el usuario selecciona "Móvil" e ingresa un número con un `0` de área inicial o el `15`
- **THEN** el sistema rechaza el valor con el mismo mensaje de validación que el wizard original
- **AND** mantiene los demás valores y permite reintentar

### Requirement: Retorno a la confirmación tras editar
Después de editar un campo, el sistema SHALL volver a mostrar la pantalla de confirmación con el resumen actualizado, permitiendo confirmar o seguir modificando.

#### Scenario: Confirmar tras una edición
- **WHEN** el usuario edita un campo y vuelve a la confirmación
- **THEN** el resumen refleja el valor actualizado
- **AND** el usuario puede confirmar la creación del ticket o elegir modificar otro campo

#### Scenario: Modificar varios campos en sucesión
- **WHEN** el usuario edita un campo y vuelve a la confirmación y elige "✏️ Modificar" de nuevo
- **THEN** el sistema vuelve a mostrar el menú de campos con los valores actuales (incluyendo el recién editado)

### Requirement: Cancelación durante la edición
Durante la selección o edición de un campo, el sistema SHALL permitir cancelar y volver al menú principal con la palabra "cancelar", de forma consistente con el resto del wizard.

#### Scenario: Cancelar desde el menú de campos
- **WHEN** el usuario escribe "cancelar" mientras se muestra el menú de campos o se solicita un campo
- **THEN** el sistema descarta la operación y vuelve al menú principal
