const axios = require('axios');
require('dotenv').config();

const ITOP_URL = process.env.ITOP_URL;
const ITOP_USER = process.env.ITOP_USER;
const ITOP_TOKEN = process.env.ITOP_TOKEN;

const axiosConfig = {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  timeout: 15000,
  proxy: false, // iTop es accesible directo, sin pasar por el proxy HTTPS
};

/**
 * Ejecuta una operación contra la REST API de iTop.
 */
async function itopRequest(operation, params) {
  const url = `${ITOP_URL}/webservices/rest.php?version=1.3`;
  const payload = {
    ...(ITOP_USER ? { auth_user: ITOP_USER } : {}),
    auth_token: ITOP_TOKEN,
    json_data: JSON.stringify({ operation, ...params }),
  };

  let response;
  try {
    response = await axios.post(url, new URLSearchParams(payload), axiosConfig);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : '(sin cuerpo)';
    console.error(`[itop] HTTP ${status ?? err.code ?? 'ERR'} → ${err.message} | body: ${body}`);
    throw err;
  }

  const data = response.data;

  if (data.code !== 0) {
    throw new Error(`iTop error ${data.code}: ${data.message}`);
  }

  return data;
}

/**
 * Busca una Person por mobile_phone.
 * Normaliza el número eliminando el prefijo '+' si existe.
 * Retorna { id, name, org_id } o null si no se encuentra.
 */
async function findPersonByMobile(rawNumber) {
  // Normalizar: quitar '+' y espacios
  const normalized = rawNumber.replace(/^\+/, '').replace(/\s/g, '');

  // iTop puede tener el número con o sin '+', probamos ambos
  const variants = [normalized, `+${normalized}`];

  for (const number of variants) {
    const oql = `SELECT Person WHERE mobile_phone = '${number}'`;

    const result = await itopRequest('core/get', {
      class: 'Person',
      key: oql,
      output_fields: 'id,friendlyname,org_id,org_name',
    });

    const objects = result.objects;
    if (objects && Object.keys(objects).length > 0) {
      const person = Object.values(objects)[0].fields;
      person.id = Object.values(objects)[0].key;
      return person;
    }
  }

  return null;
}

/**
 * Busca una Person por CUIT (campo cuit en iTop).
 * Retorna { id, friendlyname, org_id, org_name } o null.
 */
async function findPersonByCuil(cuit) {
  const result = await itopRequest('core/get', {
    class: 'Person',
    key: `SELECT Person WHERE cuit = '${cuit}'`,
    output_fields: 'id,friendlyname,org_id,org_name',
  });

  const objects = result.objects;
  if (objects && Object.keys(objects).length > 0) {
    const person = Object.values(objects)[0].fields;
    person.id = Object.values(objects)[0].key;
    return person;
  }
  return null;
}

/**
 * Obtiene las familias de servicios disponibles para una organización.
 * Solo devuelve familias que tienen al menos un servicio activo en los contratos de la org.
 * Retorna array de { id, name }.
 */
async function getFamiliesForOrg(orgId) {
  const oql = `SELECT ServiceFamily AS sf JOIN Service AS s ON s.servicefamily_id = sf.id JOIN lnkCustomerContractToService AS l ON l.service_id = s.id JOIN CustomerContract AS cc ON l.customercontract_id = cc.id WHERE cc.org_id = ${orgId} AND s.status != 'obsolete'`;

  const result = await itopRequest('core/get', {
    class: 'ServiceFamily',
    key: oql,
    output_fields: 'id,name',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    name: obj.fields.name,
  }));
}

/**
 * Obtiene los servicios de una familia para una organización via sus contratos de cliente activos.
 * Retorna array de { id, name }.
 */
async function getServicesForOrgAndFamily(orgId, familyId) {
  const oql = `SELECT Service AS s JOIN lnkCustomerContractToService AS l ON l.service_id = s.id JOIN CustomerContract AS cc ON l.customercontract_id = cc.id WHERE cc.org_id = ${orgId} AND s.servicefamily_id = ${familyId} AND s.status != 'obsolete'`;

  const result = await itopRequest('core/get', {
    class: 'Service',
    key: oql,
    output_fields: 'id,name',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    name: obj.fields.name,
  }));
}

/**
 * Obtiene los servicios disponibles para una organización via sus contratos de cliente activos.
 * Retorna array de { id, name }.
 */
async function getServicesForOrg(orgId) {
  const oql = `SELECT Service AS s JOIN lnkCustomerContractToService AS l ON l.service_id = s.id JOIN CustomerContract AS cc ON l.customercontract_id = cc.id WHERE cc.org_id = ${orgId} AND s.status != 'obsolete'`;

  const result = await itopRequest('core/get', {
    class: 'Service',
    key: oql,
    output_fields: 'id,name',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    name: obj.fields.name,
  }));
}

/**
 * Obtiene las subcategorías activas de un servicio.
 * Retorna array de { id, name }.
 */
async function getSubcategoriesForService(serviceId) {
  const result = await itopRequest('core/get', {
    class: 'ServiceSubcategory',
    key: `SELECT ServiceSubcategory WHERE service_id = ${serviceId} AND status != 'obsolete'`,
    output_fields: 'id,name',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    name: obj.fields.name,
  }));
}

/**
 * Resuelve las opciones de un campo de plantilla.
 * Si es CSV retorna array de { id, label }. Si es OQL ejecuta la query.
 * Retorna null si no hay valores o falla.
 */
async function resolveFieldOptions(valuesSpec) {
  if (!valuesSpec || !valuesSpec.trim()) return null;
  const trimmed = valuesSpec.trim();

  if (trimmed.toUpperCase().startsWith('SELECT ')) {
    const match = trimmed.match(/SELECT\s+(\w+)/i);
    if (!match) return null;
    try {
      const result = await itopRequest('core/get', {
        class: match[1],
        key: trimmed,
        output_fields: 'id,friendlyname,name',
      });
      if (!result.objects) return [];
      return Object.values(result.objects).map(obj => ({
        id: obj.key,
        label: obj.fields.friendlyname || obj.fields.name || obj.key,
      }));
    } catch (err) {
      console.error('[itop] Error resolviendo opciones OQL del campo:', err.message);
      return null;
    }
  }

  return trimmed.split(',').map(v => ({ id: v.trim(), label: v.trim() })).filter(o => o.id);
}

/**
 * Verifica si existe una plantilla (RequestTemplate) para un servicio + subcategoría.
 * Retorna { id, fields: [] } si existe, null si no hay plantilla.
 */
async function getTemplateForSubcategory(serviceId, subcategoryId) {
  const tplResult = await itopRequest('core/get', {
    class: 'RequestTemplate',
    key: `SELECT RequestTemplate WHERE service_id = ${serviceId} AND servicesubcategory_id = ${subcategoryId}`,
    output_fields: 'id,name',
  });

  if (!tplResult.objects || Object.keys(tplResult.objects).length === 0) return null;

  const templateId = Object.values(tplResult.objects)[0].key;
  return { id: templateId, fields: [{ code: '_exists' }] };
}

/**
 * Crea un UserRequest en iTop.
 * serviceDetails: { template_id, values: { code: value } } o null.
 * Retorna { id, ref } del ticket creado.
 */
async function createUserRequest(person, serviceId, subcategoryId, title, description, serviceDetails = null, sku = null, numeroMovil = null) {
  const fields = {
    org_id: `SELECT Organization WHERE id = ${person.org_id}`,
    caller_id: `SELECT Person WHERE id = ${person.id}`,
    service_id: `SELECT Service WHERE id = ${serviceId}`,
    servicesubcategory_id: `SELECT ServiceSubcategory WHERE id = ${subcategoryId}`,
    title,
    description,
    origin: 'chat',
  };
  if (serviceDetails) fields.service_details = serviceDetails;
  if (sku) fields.sku = sku;
  if (numeroMovil) fields.numero_movil = numeroMovil;

  const result = await itopRequest('core/create', {
    class: 'UserRequest',
    comment: 'Creado via WhatsApp Bot',
    fields,
    output_fields: 'id,ref',
  });

  const obj = Object.values(result.objects)[0];
  return { id: obj.key, ref: obj.fields.ref };
}

/**
 * Adjunta un archivo a un ticket existente.
 */
async function attachToTicket(ticketId, filename, base64Data, mimetype) {
  const result = await itopRequest('core/create', {
    class: 'Attachment',
    comment: 'Adjunto via WhatsApp Bot',
    fields: {
      item_class: 'UserRequest',
      item_id: ticketId,
      contents: {
        data: base64Data,
        filename,
        mimetype,
      },
    },
    output_fields: 'id',
  });
  return Object.values(result.objects)[0].key;
}

/**
 * Obtiene los tickets activos (no cerrados) de una persona.
 * Retorna array de { id, ref, title, status }.
 */
async function getTicketsForPerson(personId) {
  const oql = `SELECT UserRequest AS ur JOIN Person AS p ON ur.caller_id = p.id WHERE p.id = ${personId} AND ur.status NOT IN ('closed', 'resolved')`;

  const result = await itopRequest('core/get', {
    class: 'UserRequest',
    key: oql,
    output_fields: 'id,ref,title,status',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    ref: obj.fields.ref,
    title: obj.fields.title,
    status: obj.fields.status,
  }));
}

/**
 * Obtiene el detalle de un ticket: estado, grupo, técnico y última nota pública.
 */
async function getTicketDetail(ticketId) {
  const result = await itopRequest('core/get', {
    class: 'UserRequest',
    key: `SELECT UserRequest WHERE id = ${ticketId}`,
    output_fields: 'ref,title,status,team_id_friendlyname,agent_id_friendlyname,public_log',
  });

  if (!result.objects) return null;
  const fields = Object.values(result.objects)[0].fields;

  const entries = fields.public_log?.entries || [];
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  return {
    ref: fields.ref,
    title: fields.title,
    status: fields.status,
    team: fields.team_id_friendlyname || 'Sin asignar',
    agent: fields.agent_id_friendlyname || 'Sin asignar',
    lastLogMessage: lastEntry?.message_html || lastEntry?.message || null,
    lastLogDate: lastEntry?.date || null,
  };
}

/**
 * Obtiene los tickets resueltos de una persona.
 * Retorna array de { id, ref, title, status }.
 */
async function getResolvedTicketsForPerson(personId) {
  const oql = `SELECT UserRequest AS ur JOIN Person AS p ON ur.caller_id = p.id WHERE p.id = ${personId} AND ur.status = 'resolved'`;

  const result = await itopRequest('core/get', {
    class: 'UserRequest',
    key: oql,
    output_fields: 'id,ref,title,status',
  });

  if (!result.objects) return [];
  return Object.values(result.objects).map(obj => ({
    id: obj.key,
    ref: obj.fields.ref,
    title: obj.fields.title,
    status: obj.fields.status,
  }));
}

/**
 * Devuelve el teléfono móvil y nombre del solicitante de un ticket.
 * Retorna { phone, name } o null.
 */
async function getCallerForTicket(ticketId) {
  const ticketResult = await itopRequest('core/get', {
    class: 'UserRequest',
    key: `SELECT UserRequest WHERE id = ${ticketId}`,
    output_fields: 'caller_id,caller_id_friendlyname',
  });
  if (!ticketResult.objects) return null;

  const fields = Object.values(ticketResult.objects)[0].fields;
  const personId = fields.caller_id;
  const name = fields.caller_id_friendlyname;

  const personResult = await itopRequest('core/get', {
    class: 'Person',
    key: `SELECT Person WHERE id = ${personId}`,
    output_fields: 'mobile_phone',
  });
  if (!personResult.objects) return null;

  const phone = Object.values(personResult.objects)[0].fields.mobile_phone;
  return phone ? { phone, name } : null;
}

/**
 * Agrega un comentario público a un ticket existente.
 */
// isPrivate=true escribe en private_log (visible solo para agentes, no dispara el webhook de iTop)
async function addCommentToTicket(ticketId, comment, isPrivate = false) {
  const logField = isPrivate ? 'private_log' : 'public_log';
  await itopRequest('core/update', {
    class: 'UserRequest',
    key: `SELECT UserRequest WHERE id = ${ticketId}`,
    comment: 'Comentario agregado via WhatsApp Bot',
    fields: {
      [logField]: {
        add_item: {
          message: comment,
          format: 'text',
        },
      },
    },
    output_fields: 'id',
  });
}

/**
 * Extrae las imágenes embebidas (InlineImage de iTop) de un HTML de bitácora.
 * Detecta las imágenes propias de iTop por su atributo data-img-id="N" o por el
 * src .../download_inlineimage?id=N y trae el binario de cada una por REST.
 * Retorna array de { data(base64), mimetype, filename }. Best-effort: ante error
 * en una imagen la omite y sigue. No incluye imágenes externas ni data:base64.
 */
async function getInlineImagesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];

  // Recolectar ids únicos de InlineImage referenciados en el HTML
  const ids = new Set();
  let m;
  const reDataId = /data-img-id="(\d+)"/gi;
  while ((m = reDataId.exec(html)) !== null) ids.add(m[1]);
  const reSrcId = /download_inlineimage[^"']*?[?&]id=(\d+)/gi;
  while ((m = reSrcId.exec(html)) !== null) ids.add(m[1]);

  if (ids.size === 0) return [];

  const images = [];
  for (const id of ids) {
    try {
      const result = await itopRequest('core/get', {
        class: 'InlineImage',
        key: `SELECT InlineImage WHERE id = ${id}`,
        output_fields: 'contents',
      });
      const obj = result.objects && Object.values(result.objects)[0];
      const blob = obj?.fields?.contents;
      if (blob?.data && typeof blob.mimetype === 'string' && blob.mimetype.startsWith('image/')) {
        images.push({
          data: blob.data,
          mimetype: blob.mimetype,
          filename: blob.filename || `imagen-${id}`,
        });
      }
    } catch (err) {
      console.error(`[itop] No se pudo traer InlineImage ${id}:`, err.message);
    }
  }
  return images;
}

module.exports = { findPersonByMobile, findPersonByCuil, getFamiliesForOrg, getServicesForOrgAndFamily, getServicesForOrg, getSubcategoriesForService, getTemplateForSubcategory, createUserRequest, attachToTicket, getTicketsForPerson, getResolvedTicketsForPerson, getTicketDetail, getCallerForTicket, addCommentToTicket, getInlineImagesFromHtml };
