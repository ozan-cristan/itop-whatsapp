<?php
Dict::Add('ES CR', 'Spanish', 'Español', [
	'Class:Person/Attribute:cuit'              => 'CUIT',
	'Class:Person/Attribute:cuit+'             => 'Clave Única de Identificación Tributaria, sin guiones ni espacios',
	'Class:Person/UniquenessRule:cuit_unique'  => 'El CUIT debe ser único',
	'Class:Person/UniquenessRule:cuit_unique+' => 'Ya existe una persona con este CUIT en el sistema',
]);
