<?php
Dict::Add('EN US', 'English', 'English', [
	'Class:Person/Attribute:cuit'              => 'CUIT',
	'Class:Person/Attribute:cuit+'             => 'Tax identification number (CUIT), without dashes or spaces',
	'Class:Person/UniquenessRule:cuit_unique'  => 'CUIT must be unique',
	'Class:Person/UniquenessRule:cuit_unique+' => 'A person with this CUIT already exists in the system',
]);
