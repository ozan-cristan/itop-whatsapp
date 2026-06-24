## ADDED Requirements

### Requirement: Listas de hasta tres tickets como botones directos
Cuando la cantidad de tickets a listar sea 3 o menos, el sistema SHALL mostrarlos como botones inline directos (sin requerir abrir el selector "Seleccionar"), e incluir en el cuerpo del mensaje la referencia y el título de cada ticket para dar contexto.

#### Scenario: Dos resueltos
- **WHEN** el usuario abre "Resueltos" y tiene 2 requerimientos
- **THEN** el sistema muestra 2 botones (uno por ticket) directamente, sin botón "Seleccionar"
- **AND** el cuerpo del mensaje lista la referencia y el título de cada uno

#### Scenario: Selección por botón
- **WHEN** el usuario toca uno de los botones
- **THEN** el sistema abre el detalle del ticket correspondiente

### Requirement: Listas de cuatro a diez tickets como lista seleccionable
Cuando la cantidad de tickets sea entre 4 y 10, el sistema SHALL mostrarlos como una lista seleccionable nativa de WhatsApp, sin omitir ninguno ni caer a texto numerado. La opción de cancelar SHALL ofrecerse en el cuerpo del mensaje.

#### Scenario: Listado de 10 tickets
- **WHEN** el usuario tiene 10 solicitudes activas
- **THEN** el sistema envía una lista seleccionable con las 10
- **AND** indica que se puede escribir *cancelar* para volver al menú

### Requirement: Más de diez tickets paginados con "Ver más"
Cuando la cantidad de tickets supere 10, el sistema SHALL paginar el listado en una lista seleccionable mostrando hasta 9 por página más una fila "Ver más". Al elegir "Ver más" SHALL avanzar a la página siguiente y, al pasar la última, SHALL volver a la primera (cíclico). SHALL indicar la página actual y el total.

#### Scenario: Avanzar de página
- **WHEN** el usuario tiene 23 solicitudes y elige "Ver más" en la página 1
- **THEN** el sistema muestra la página 2 con los siguientes tickets
- **AND** indica "(página 2 de 3)"

#### Scenario: Ciclo al final
- **WHEN** el usuario está en la última página y elige "Ver más"
- **THEN** el sistema vuelve a mostrar la primera página

### Requirement: Selección por índice absoluto
La selección de un ticket SHALL resolverse por su posición absoluta en la lista, de modo que elegir un ticket en cualquier página (o botón) abra el ticket correcto.

#### Scenario: Selección en una página posterior
- **WHEN** el usuario avanza a la página 2 y selecciona el primer ítem
- **THEN** el sistema abre el detalle del ticket que ocupa esa posición absoluta en la lista completa

### Requirement: Aplicación a activas y resueltas
El sistema SHALL aplicar las mismas reglas de presentación y paginación tanto al listado de solicitudes activas (seguimiento) como al de resueltas.

#### Scenario: Pocos resueltos
- **WHEN** el usuario abre "Resueltos" y tiene 3 o menos
- **THEN** el sistema los muestra como botones directos, igual que en seguimiento
