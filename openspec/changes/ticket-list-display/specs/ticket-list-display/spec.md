## ADDED Requirements

### Requirement: Listado como lista seleccionable
El listado de tickets SHALL presentarse siempre como una lista seleccionable nativa de WhatsApp, nunca como texto numerado. La opción de cancelar SHALL ofrecerse en el cuerpo del mensaje (escribir *cancelar*) en lugar de ocupar una fila de la lista.

#### Scenario: Listado de 5 tickets
- **WHEN** el usuario abre el seguimiento y tiene 5 solicitudes activas
- **THEN** el sistema envía una lista seleccionable con las 5 solicitudes
- **AND** indica que se puede escribir *cancelar* para volver al menú

#### Scenario: Listado de 10 tickets
- **WHEN** el usuario tiene 10 solicitudes activas
- **THEN** el sistema envía una lista seleccionable con las 10, sin caer a texto numerado

### Requirement: Paginación con más de diez tickets
Cuando la cantidad de tickets supere 10, el sistema SHALL paginar el listado mostrando hasta 9 por página más una fila "Ver más". Al elegir "Ver más" SHALL avanzar a la página siguiente y, al pasar la última, SHALL volver a la primera (cíclico). SHALL indicar la página actual y el total.

#### Scenario: Avanzar de página
- **WHEN** el usuario tiene 23 solicitudes y elige "Ver más" en la página 1
- **THEN** el sistema muestra la página 2 con los siguientes tickets
- **AND** indica "(página 2 de 3)"

#### Scenario: Ciclo al final
- **WHEN** el usuario está en la última página y elige "Ver más"
- **THEN** el sistema vuelve a mostrar la primera página

### Requirement: Selección por índice absoluto
La selección de un ticket SHALL resolverse por su posición absoluta en la lista, de modo que elegir un ticket en cualquier página abra el ticket correcto.

#### Scenario: Selección en una página posterior
- **WHEN** el usuario avanza a la página 2 y selecciona el primer ítem
- **THEN** el sistema abre el detalle del ticket que ocupa esa posición absoluta en la lista completa

### Requirement: Aplicación a activas y resueltas
El sistema SHALL aplicar las mismas reglas de presentación y paginación tanto al listado de solicitudes activas (seguimiento) como al de resueltas.

#### Scenario: Listado de resueltas
- **WHEN** el usuario abre "Resueltos"
- **THEN** el sistema muestra el listado con las mismas reglas (lista seleccionable, paginada si supera 10)
