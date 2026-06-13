<?php

SetupWebPage::AddModule(
	__FILE__,
	'baraldo-modify-userrequest/1.0.0',
	array(
		'label'    => 'Baraldo - UserRequest Custom Fields',
		'category' => 'business',

		'dependencies' => array(
			'itop-request-mgmt-itil/3.0.0',
		),
		'mandatory' => false,
		'visible'   => true,

		'datamodel' => array(
			'model.baraldo-modify-userrequest.php',
		),
		'webservice'  => array(),
		'data.struct' => array(),
		'data.sample' => array(),

		'doc.manual_setup'    => '',
		'doc.more_information' => '',
	)
);
