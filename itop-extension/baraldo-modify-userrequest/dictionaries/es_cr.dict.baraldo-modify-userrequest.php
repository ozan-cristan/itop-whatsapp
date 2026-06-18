<?php
Dict::Add('ES CR', 'Spanish', 'Español', [
	'Class:UserRequest/Attribute:sku'          => 'SKU',
	'Class:UserRequest/Attribute:sku+'         => 'Código o SKU del producto relacionado con esta solicitud',
	'Class:UserRequest/Attribute:numero_movil'  => 'Móvil del cliente',
	'Class:UserRequest/Attribute:numero_movil+' => 'Número de teléfono móvil del cliente informado al crear el ticket',
	 // Ticket (clase base — aplica a UserRequest, Incident, Problem, Change, etc.)
    'Class:Ticket/Attribute:public_log'    => 'Bitácora Interna',
    'Class:Ticket/Attribute:public_log+'   => 'Mensajes internos visibles para el equipo de soporte',
    'Class:Ticket/Attribute:private_log'   => 'Bitácora Cliente',
    'Class:Ticket/Attribute:private_log+'  => 'Mensajes visibles para el cliente en el portal',

    // UserRequest (sobreescribir también a nivel subclase por si está redefinido)
    'Class:UserRequest/Attribute:public_log'   => 'Bitácora Interna',
    'Class:UserRequest/Attribute:public_log+'  => 'Mensajes internos visibles para el equipo de soporte',
    'Class:UserRequest/Attribute:private_log'  => 'Bitácora Cliente',
    'Class:UserRequest/Attribute:private_log+' => 'Mensajes visibles para el cliente en el portal',

    // Incident
    'Class:Incident/Attribute:public_log'   => 'Bitácora Interna',
    'Class:Incident/Attribute:public_log+'  => 'Mensajes internos visibles para el equipo de soporte',
    'Class:Incident/Attribute:private_log'  => 'Bitácora Cliente',
    'Class:Incident/Attribute:private_log+' => 'Mensajes visibles para el cliente en el portal',
]);
