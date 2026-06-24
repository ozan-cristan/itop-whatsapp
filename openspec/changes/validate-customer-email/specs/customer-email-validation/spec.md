## ADDED Requirements

### Requirement: Validación de formato del email en el wizard
Cuando el usuario ingrese el correo electrónico del cliente durante la carga de un ticket, el sistema SHALL aceptarlo solo si tiene formato de email válido (texto local, `@`, dominio con al menos un punto). Si el formato es inválido, el sistema SHALL rechazarlo con un mensaje claro y volver a solicitar el correo, sin avanzar al siguiente paso.

#### Scenario: Email válido
- **WHEN** el usuario ingresa `juan.perez@dominio.com`
- **THEN** el sistema acepta el valor y avanza al siguiente paso del wizard

#### Scenario: Email sin arroba
- **WHEN** el usuario ingresa `juanperez.dominio.com`
- **THEN** el sistema rechaza el valor con un mensaje de formato inválido
- **AND** vuelve a pedir el correo electrónico

#### Scenario: Texto que no es un email
- **WHEN** el usuario ingresa `no tengo`
- **THEN** el sistema rechaza el valor con un mensaje de formato inválido
- **AND** vuelve a pedir el correo electrónico

#### Scenario: Email con espacios alrededor
- **WHEN** el usuario ingresa `  juan@dominio.com  `
- **THEN** el sistema acepta el valor (recortando espacios) y avanza

### Requirement: Validación del email al editarlo desde la confirmación
Cuando el usuario edite el campo email desde la pantalla de confirmación, el sistema SHALL aplicar la misma validación de formato que en el wizard. Si el valor es inválido, SHALL rechazarlo, volver a pedir el email y conservar los demás datos del ticket sin cambios.

#### Scenario: Edición con email inválido
- **WHEN** el usuario elige editar el email e ingresa `correo-malo`
- **THEN** el sistema rechaza el valor con el mensaje de formato inválido
- **AND** mantiene el resto de los datos del ticket
- **AND** permite reintentar el ingreso del email

#### Scenario: Edición con email válido
- **WHEN** el usuario elige editar el email e ingresa `nuevo@dominio.com`
- **THEN** el sistema acepta el valor y vuelve a la pantalla de confirmación con el email actualizado
