<?php

SetupWebPage::AddModule(
	__FILE__, // Path to the current file, all other file names are relative to the directory containing this file
	'baraldo-modify-person/1.0.0',
	array(
		// Identification
		//
		'label'    => 'Baraldo - Person Custom Fields',
		'category' => 'business',

		// Setup
		//
		'dependencies' => array(
			'itop-structure/2.7.1',
		),
		'mandatory' => false,
		'visible'   => true,

		// Components
		//
		'datamodel' => array(
			'model.baraldo-modify-person.php',
		),
		'webservice'  => array(),
		'data.struct' => array(),
		'data.sample' => array(),

		// Documentation
		//
		'doc.manual_setup'   => '',
		'doc.more_information' => '',

		// Default settings
		//
	)
);
