const { STATES, getSession, wasSessionExpired, createSession, createPendingSession, updateSession, clearSession, endSession } = require('./state');
const {
  findPersonByCuil,
  getFamiliesForOrg, getServicesForOrgAndFamily,
  getSubcategoriesForService, getTemplateForSubcategory,
  createUserRequest, attachToTicket,
  getTicketsForPerson, getResolvedTicketsForPerson,
  getTicketDetail, addCommentToTicket,
} = require('./itop');

const TRIGGER_WORDS = ['hola', 'inicio', 'ticket', 'ayuda', 'help', 'start'];

const BTN_CANCEL = { id: 'cancelar', label: '❌ Cancelar' };
const BTN_CONFIRM = { id: '1', label: '✅ Confirmar' };
const BTN_MODIFY  = { id: '2', label: '✏️ Modificar' };

function withButtons(text, buttons) { return { text, buttons }; }
function withCancel(text) { return withButtons(text, [BTN_CANCEL]); }

const STATUS_LABELS = {
  new: 'Nuevo',
  assigned: 'Asignado',
  in_progress: 'En progreso',
  pending: 'Pendiente',
  waiting_for_approval: 'Esperando aprobación',
  resolved: 'Resuelto',
  closed: 'Cerrado',
  dispatched: 'Despachado',
  escalated_tto: 'Escalado (TTO)',
  escalated_ttr: 'Escalado (TTR)',
  frozen: 'Congelado',
};

const STATUS_EMOJI = {
  new: '🔴',
  assigned: '🟡',
  in_progress: '🔵',
  pending: '⏸️',
  waiting_for_approval: '🕐',
  resolved: '🟢',
  closed: '⚫',
  dispatched: '🟡',
  escalated_tto: '🔴',
  escalated_ttr: '🔴',
  frozen: '❄️',
};

const MENU_OPTIONS = '1. Nueva solicitud\n2. Consultar solicitudes activas\n3. Consultar solicitudes resueltas\n4. Salir';

const MSG = {
  ASK_PHONE: '👋 ¡Bienvenido! Para identificarte, ingresá tu *CUIT* (sin guiones ni espacios):',
  SESSION_EXPIRED: '⏱️ Tu sesión expiró por inactividad. Ingresá tu *CUIT* para identificarte nuevamente:',
  PHONE_NOT_FOUND: '❌ No encontramos ese CUIT en el sistema. Verificá e ingresalo de nuevo:',
  PHONE_ERROR: '⚠️ No pudimos conectar con el sistema en este momento. Intentá de nuevo:',

  WELCOME: (name) => `👋 Hola *${name}*. ¿Qué querés hacer?\n\n${MENU_OPTIONS}`,
  CANCEL_MSG: (name) => `↩️ Operación cancelada. ¿Qué querés hacer, *${name}*?\n\n${MENU_OPTIONS}`,
  FAREWELL: (name) => `👋 ¡Hasta luego, *${name}*! Si necesitás algo más, escribí *hola* para comenzar de nuevo.`,
  INVALID_MENU: `⚠️ Respondé con una de las opciones:\n\n${MENU_OPTIONS}`,

  NO_FAMILIES: '⚠️ No hay familias de servicios disponibles para tu organización. Contactá a soporte.',
  NO_SERVICES: '⚠️ No hay servicios disponibles para esa familia. Contactá a soporte.',
  NO_TICKETS: '📭 No tenés solicitudes activas en el sistema.',
  NO_RESOLVED_TICKETS: '📭 No tenés solicitudes resueltas en el sistema.',

  ASK_FAMILY: (families) => {
    const lista = families.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    return `🗂️ Seleccioná la *familia de servicios*:\n\n${lista}\n\n_Escribí *cancelar* para volver al menú._`;
  },
  INVALID_FAMILY: (total) => `⚠️ Respondé con un número entre *1* y *${total}*.`,

  ASK_SERVICE: (services) => {
    const lista = services.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    return `📋 Seleccioná el *servicio*:\n\n${lista}\n\n_Escribí *cancelar* para volver al menú._`;
  },
  INVALID_SERVICE: (total) => `⚠️ Respondé con un número entre *1* y *${total}*.`,

  ASK_SUBCAT: (subcats) => {
    const lista = subcats.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    return `📂 Seleccioná la subcategoría:\n\n${lista}\n\n_Escribí *cancelar* para volver al menú._`;
  },
  INVALID_SUBCAT: (total) => `⚠️ Respondé con un número entre *1* y *${total}*.`,

  ASK_TITLE: '📝 *Paso 1 de 2* — Ingresá el *título* del reporte:\n\n_Escribí *cancelar* para volver al menú._',
  ASK_DESC: '📄 *Paso 2 de 2* — Ingresá la *descripción* del problema:\n\n_Escribí *cancelar* para volver al menú._',

  CONFIRM_TICKET: (serviceName, subcatName, title, desc, templateFields, templateValues) => {
    let msg = `📋 *Resumen de tu solicitud*\n\n`;
    msg += `🔧 Servicio: ${serviceName}\n`;
    if (subcatName) msg += `📂 Subcategoría: ${subcatName}\n`;
    if (templateFields && templateFields.length > 0 && templateValues) {
      const userFields = templateFields.filter(f => f.input_type !== 'read_only' && f.input_type !== 'hidden');
      for (const f of userFields) {
        const val = templateValues[f.code];
        if (val !== undefined && val !== '') {
          const display = f.options ? (f.options.find(o => o.id === val)?.label || val) : val;
          msg += `📌 ${f.label}: ${display}\n`;
        }
      }
    }
    msg += `📝 Título: ${title}\n`;
    msg += `📄 Descripción: ${desc}\n\n`;
    msg += `¿Confirmás la creación?\n\n1. Sí, crear ticket\n2. No, modificar datos`;
    return msg;
  },
  INVALID_CONFIRM: '⚠️ Respondé *1* para confirmar o *2* para modificar datos.',

  ASK_ATTACHMENT: (ref) =>
    `✅ Ticket *${ref}* creado.\n\n📎 ¿Querés adjuntar un archivo? Envialo ahora o respondé *no* para terminar.`,
  ASK_ANOTHER_ATTACHMENT: (ref) =>
    `✅ Archivo adjuntado. ¿Querés adjuntar otro al ticket *${ref}*? Envialo o respondé *no* para terminar.`,
  TICKET_DONE: (ref) =>
    `✅ Ticket *${ref}* listo. Un agente se pondrá en contacto a la brevedad.\n\n¿Qué querés hacer ahora?\n\n${MENU_OPTIONS}`,
  ATTACHMENT_ERROR: (ref) =>
    `⚠️ No se pudo adjuntar el archivo, pero el ticket *${ref}* fue creado.\n\n¿Qué querés hacer ahora?\n\n${MENU_OPTIONS}`,

  SHOW_TICKETS: (tickets, resolved = false) => {
    const label = resolved ? 'Solicitudes resueltas' : 'Solicitudes activas';
    const lista = tickets.map((t, i) => {
      const emoji = STATUS_EMOJI[t.status] || '⚪';
      return `${i + 1}. ${emoji} *${t.ref}* — ${t.title}`;
    }).join('\n');
    return `📋 ${label}:\n\n${lista}\n\nRespondé con el número para ver el detalle.\n_Escribí *cancelar* para volver al menú._`;
  },
  INVALID_TICKET: (total) => `⚠️ Respondé con un número entre *1* y *${total}*.`,

  TICKET_DETAIL: (d) => {
    const status = STATUS_LABELS[d.status] || d.status;
    const emoji = STATUS_EMOJI[d.status] || '⚪';
    let msg = `📋 *${d.ref}* — ${d.title}\n\n${emoji} Estado: *${status}*\n🏢 Grupo: ${d.team}\n👤 Técnico: ${d.agent}`;
    if (d.lastLogMessage) {
      const text = d.lastLogMessage.replace(/<[^>]+>/g, '').trim();
      msg += `\n\n📝 Última nota pública (${d.lastLogDate}):\n${text}`;
    }
    msg += '\n\n¿Qué querés hacer?\n\n1. Nueva solicitud\n2. Consultar otra solicitud\n3. Agregar comentario a este ticket';
    return msg;
  },
  TICKET_DETAIL_INVALID: '⚠️ Respondé *1*, *2* o *3*.',

  ASK_COMMENT: '💬 Ingresá el comentario que querés agregar al ticket:\n\n_Escribí *cancelar* para volver al menú._',
  COMMENT_ADDED: (ref) =>
    `✅ Comentario agregado al ticket *${ref}*.\n\n¿Qué querés hacer ahora?\n\n${MENU_OPTIONS}`,
  COMMENT_ERROR: '⚠️ No se pudo agregar el comentario. Intentá nuevamente.',

  ERROR: '⚠️ Ocurrió un error al procesar tu solicitud. Intentá nuevamente.',
};

// ─── Helpers para plantillas ───────────────────────────────────────────────

function evaluateDisplayCondition(condition, values) {
  if (!condition) return true;
  const eqMatch = condition.match(/:template->(\w+)\s*=\s*'([^']*)'/);
  const neqMatch = condition.match(/:template->(\w+)\s*!=\s*'([^']*)'/);
  if (eqMatch) return (values[eqMatch[1]] || '') === eqMatch[2];
  if (neqMatch) return (values[neqMatch[1]] || '') !== neqMatch[2];
  return true;
}

// Devuelve el índice del próximo campo que necesita input del usuario
function findNextFieldIndex(fields, startIndex, values) {
  for (let i = startIndex; i < fields.length; i++) {
    const f = fields[i];
    if (f.input_type === 'read_only' || f.input_type === 'hidden') continue;
    if (f.display_condition && !evaluateDisplayCondition(f.display_condition, values)) continue;
    return i;
  }
  return -1;
}

// Rellena automáticamente todos los campos que el usuario no ve
function autoFillRemainingFields(fields, values) {
  const result = { ...values };
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(result, f.code)) {
      result[f.code] = f.initial_value || '';
    }
  }
  return result;
}

// Cuenta los campos visibles al usuario (sin hidden/read_only)
function countUserFields(fields) {
  return fields.filter(f => f.input_type !== 'read_only' && f.input_type !== 'hidden').length;
}

// Posición del campo visible actual (1-based)
function userFieldPosition(fields, fieldIndex) {
  let count = 0;
  for (let i = 0; i <= fieldIndex; i++) {
    const f = fields[i];
    if (f.input_type !== 'read_only' && f.input_type !== 'hidden') count++;
  }
  return count;
}

function presentField(fields, idx) {
  const field = fields[idx];
  const current = userFieldPosition(fields, idx);
  const total = countUserFields(fields);
  const req = field.mandatory === 'yes' ? '_(requerido)_' : '_(opcional)_';

  let msg = `📋 *Campo ${current} de ${total}* ${req}\n\n*${field.label}*`;

  if (field.options && field.options.length > 0) {
    msg += '\n\n' + field.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    msg += '\n\n_Respondé con el número._';
  } else if (field.input_type === 'date') {
    msg += '\n\n_Formato: DD/MM/AAAA_';
  } else if (field.input_type === 'date_and_time') {
    msg += '\n\n_Formato: DD/MM/AAAA HH:MM_';
  }

  if (field.mandatory !== 'yes') msg += '\n_Escribí *omitir* para saltear._';
  msg += '\n_Escribí *cancelar* para volver al menú._';

  return withCancel(msg);
}

// Verifica si hay plantilla y transiciona al estado correcto
async function startTemplateOrTitle(sessionKey, baseUpdate, serviceId, serviceName, subcategoryId, subcategoryName) {
  if (subcategoryId) {
    try {
      const template = await getTemplateForSubcategory(serviceId, subcategoryId);
      if (template && template.fields.length > 0) {
        const name = getSession(sessionKey)?.person?.friendlyname || '';
        updateSession(sessionKey, { state: STATES.MAIN_MENU });
        return `⚠️ La subcategoría *${subcategoryName}* requiere datos adicionales que no se pueden ingresar por WhatsApp.\n\nPor favor, creá el ticket desde el *portal web*.\n\n¿Qué querés hacer, *${name}*?\n\n${MENU_OPTIONS}`;
      }
    } catch (err) {
      console.error('[flow] Error buscando plantilla:', err.message);
    }
  }

  updateSession(sessionKey, {
    ...baseUpdate,
    serviceId, serviceName, subcategoryId, subcategoryName,
    state: STATES.AWAIT_TITLE,
    templateId: null, templateFields: [], templateFieldIndex: 0, templateValues: {},
  });
  return withCancel(MSG.ASK_TITLE);
}

// ──────────────────────────────────────────────────────────────────────────

async function handleMessage(sessionKey, text, attachment = null) {
  const input = text.trim();

  try {
    let session = getSession(sessionKey);

    // Sin sesión: pedir CUIL directamente
    if (!session) {
      const expired = wasSessionExpired(sessionKey);
      session = createPendingSession(sessionKey);
      return expired ? MSG.SESSION_EXPIRED : MSG.ASK_PHONE;
    }

    // Usuario que cerró sesión voluntariamente: reactivar con trigger word
    if (session.state === STATES.IDLE) {
      if (TRIGGER_WORDS.includes(input.toLowerCase())) {
        updateSession(sessionKey, { state: STATES.MAIN_MENU });
        return MSG.WELCOME(session.person.friendlyname);
      }
      return null;
    }

    // Comando cancelar (excepto identificación)
    if (input.toLowerCase() === 'cancelar' && session.state !== STATES.AWAIT_PHONE) {
      updateSession(sessionKey, {
        state: STATES.MAIN_MENU,
        templateId: null, templateFields: [], templateFieldIndex: 0, templateValues: {},
      });
      return MSG.CANCEL_MSG(session.person.friendlyname);
    }

    switch (session.state) {

      case STATES.AWAIT_PHONE: {
        const normalized = input.replace(/\D/g, '');
        if (!normalized) return MSG.ASK_PHONE;
        try {
          const person = await findPersonByCuil(normalized);
          if (!person) return MSG.PHONE_NOT_FOUND;
          updateSession(sessionKey, { state: STATES.MAIN_MENU, phone: normalized, person });
          return MSG.WELCOME(person.friendlyname);
        } catch (err) {
          console.error(`[flow:await_phone] Error buscando persona:`, err.message);
          return MSG.PHONE_ERROR;
        }
      }

      case STATES.MAIN_MENU: {
        if (input === '1') {
          const families = await getFamiliesForOrg(session.person.org_id);
          if (families.length === 0) return MSG.NO_FAMILIES;
          if (families.length === 1) {
            const services = await getServicesForOrgAndFamily(session.person.org_id, families[0].id);
            if (services.length === 0) return MSG.NO_SERVICES;
            updateSession(sessionKey, { families, familyId: families[0].id, familyName: families[0].name, services });
            if (services.length === 1) {
              return startTemplateOrTitle(sessionKey, {}, services[0].id, services[0].name, null, null);
            }
            updateSession(sessionKey, { state: STATES.SERVICE_SELECT });
            return withCancel(MSG.ASK_SERVICE(services));
          }
          updateSession(sessionKey, { state: STATES.FAMILY_SELECT, families });
          return withCancel(MSG.ASK_FAMILY(families));
        }
        if (input === '2') {
          const tickets = await getTicketsForPerson(session.person.id);
          if (tickets.length === 0) return MSG.NO_TICKETS;
          updateSession(sessionKey, { state: STATES.TICKET_LIST, tickets, ticketListType: 'active' });
          return MSG.SHOW_TICKETS(tickets, false);
        }
        if (input === '3') {
          const tickets = await getResolvedTicketsForPerson(session.person.id);
          if (tickets.length === 0) return MSG.NO_RESOLVED_TICKETS;
          updateSession(sessionKey, { state: STATES.CLOSED_TICKET_LIST, tickets, ticketListType: 'resolved' });
          return MSG.SHOW_TICKETS(tickets, true);
        }
        if (input === '4') {
          const name = session.person.friendlyname;
          endSession(sessionKey);
          return MSG.FAREWELL(name);
        }
        return MSG.INVALID_MENU;
      }

      case STATES.TICKET_LIST:
      case STATES.CLOSED_TICKET_LIST: {
        const idx = parseInt(input, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= session.tickets.length) {
          return MSG.INVALID_TICKET(session.tickets.length);
        }
        const ticket = session.tickets[idx];
        const detail = await getTicketDetail(ticket.id);
        updateSession(sessionKey, {
          state: STATES.TICKET_DETAIL_MENU,
          viewedTicketId: ticket.id,
          viewedTicketRef: ticket.ref,
        });
        return MSG.TICKET_DETAIL(detail);
      }

      case STATES.TICKET_DETAIL_MENU: {
        if (input === '1') {
          const families = await getFamiliesForOrg(session.person.org_id);
          if (families.length === 0) return MSG.NO_FAMILIES;
          if (families.length === 1) {
            const services = await getServicesForOrgAndFamily(session.person.org_id, families[0].id);
            if (services.length === 0) return MSG.NO_SERVICES;
            updateSession(sessionKey, { families, familyId: families[0].id, familyName: families[0].name, services });
            if (services.length === 1) {
              return startTemplateOrTitle(sessionKey, {}, services[0].id, services[0].name, null, null);
            }
            updateSession(sessionKey, { state: STATES.SERVICE_SELECT });
            return withCancel(MSG.ASK_SERVICE(services));
          }
          updateSession(sessionKey, { state: STATES.FAMILY_SELECT, families });
          return withCancel(MSG.ASK_FAMILY(families));
        }
        if (input === '2') {
          const resolved = session.ticketListType === 'resolved';
          const tickets = resolved
            ? await getResolvedTicketsForPerson(session.person.id)
            : await getTicketsForPerson(session.person.id);
          if (tickets.length === 0) return resolved ? MSG.NO_RESOLVED_TICKETS : MSG.NO_TICKETS;
          const nextState = resolved ? STATES.CLOSED_TICKET_LIST : STATES.TICKET_LIST;
          updateSession(sessionKey, { state: nextState, tickets });
          return MSG.SHOW_TICKETS(tickets, resolved);
        }
        if (input === '3') {
          updateSession(sessionKey, { state: STATES.AWAIT_COMMENT });
          return withCancel(MSG.ASK_COMMENT);
        }
        return MSG.TICKET_DETAIL_INVALID;
      }

      case STATES.AWAIT_COMMENT: {
        if (!input) return MSG.ASK_COMMENT;
        const { viewedTicketId, viewedTicketRef } = session;
        try {
          await addCommentToTicket(viewedTicketId, input);
          updateSession(sessionKey, { state: STATES.MAIN_MENU, viewedTicketId: null, viewedTicketRef: null });
          return MSG.COMMENT_ADDED(viewedTicketRef);
        } catch (err) {
          console.error(`[flow:await_comment] Error agregando comentario:`, err.message);
          return MSG.COMMENT_ERROR;
        }
      }

      case STATES.FAMILY_SELECT: {
        const idx = parseInt(input, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= session.families.length) {
          return MSG.INVALID_FAMILY(session.families.length);
        }
        const family = session.families[idx];
        const services = await getServicesForOrgAndFamily(session.person.org_id, family.id);
        if (services.length === 0) return MSG.NO_SERVICES;
        updateSession(sessionKey, { familyId: family.id, familyName: family.name, services });
        if (services.length === 1) {
          const subcategories = await getSubcategoriesForService(services[0].id);
          if (subcategories.length === 0) {
            return startTemplateOrTitle(sessionKey, {}, services[0].id, services[0].name, null, null);
          }
          if (subcategories.length === 1) {
            return startTemplateOrTitle(sessionKey, {}, services[0].id, services[0].name, subcategories[0].id, subcategories[0].name);
          }
          updateSession(sessionKey, { state: STATES.SUBCAT_SELECT, serviceId: services[0].id, serviceName: services[0].name, subcategories });
          return withCancel(MSG.ASK_SUBCAT(subcategories));
        }
        updateSession(sessionKey, { state: STATES.SERVICE_SELECT });
        return withCancel(MSG.ASK_SERVICE(services));
      }

      case STATES.SERVICE_SELECT: {
        const idx = parseInt(input, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= session.services.length) {
          return MSG.INVALID_SERVICE(session.services.length);
        }
        const service = session.services[idx];
        const subcategories = await getSubcategoriesForService(service.id);
        if (subcategories.length === 0) {
          return startTemplateOrTitle(sessionKey, {}, service.id, service.name, null, null);
        }
        if (subcategories.length === 1) {
          return startTemplateOrTitle(sessionKey, {}, service.id, service.name, subcategories[0].id, subcategories[0].name);
        }
        updateSession(sessionKey, { state: STATES.SUBCAT_SELECT, serviceId: service.id, serviceName: service.name, subcategories });
        return withCancel(MSG.ASK_SUBCAT(subcategories));
      }

      case STATES.SUBCAT_SELECT: {
        const idx = parseInt(input, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= session.subcategories.length) {
          return MSG.INVALID_SUBCAT(session.subcategories.length);
        }
        const subcat = session.subcategories[idx];
        return startTemplateOrTitle(sessionKey, {}, session.serviceId, session.serviceName, subcat.id, subcat.name);
      }

      case STATES.AWAIT_TEMPLATE_FIELD: {
        const { templateFields, templateFieldIndex, templateValues } = session;
        const field = templateFields[templateFieldIndex];

        // Omitir campo opcional
        if (input.toLowerCase() === 'omitir' && field.mandatory !== 'yes') {
          const newValues = { ...templateValues, [field.code]: field.initial_value || '' };
          const nextIdx = findNextFieldIndex(templateFields, templateFieldIndex + 1, newValues);
          if (nextIdx === -1) {
            updateSession(sessionKey, { state: STATES.AWAIT_TITLE, templateValues: autoFillRemainingFields(templateFields, newValues), templateFieldIndex: templateFields.length });
            return withCancel(MSG.ASK_TITLE);
          }
          updateSession(sessionKey, { templateFieldIndex: nextIdx, templateValues: newValues });
          return presentField(templateFields, nextIdx);
        }

        // Validar y parsear según tipo
        let value;

        if (field.options && field.options.length > 0) {
          const optIdx = parseInt(input, 10) - 1;
          if (isNaN(optIdx) || optIdx < 0 || optIdx >= field.options.length) {
            return withCancel(`⚠️ Respondé con un número entre *1* y *${field.options.length}*.\n\n` +
              field.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n'));
          }
          value = field.options[optIdx].id;
        } else if (field.input_type === 'date') {
          const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (!m) return withCancel(`⚠️ Formato inválido. Usá *DD/MM/AAAA*.\n_Escribí *cancelar* para volver al menú._`);
          value = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        } else if (field.input_type === 'date_and_time') {
          const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
          if (!m) return withCancel(`⚠️ Formato inválido. Usá *DD/MM/AAAA HH:MM*.\n_Escribí *cancelar* para volver al menú._`);
          value = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${m[4].padStart(2, '0')}:${m[5]}:00`;
        } else {
          value = input;
        }

        // Campo requerido vacío
        if (!value && field.mandatory === 'yes') {
          return presentField(templateFields, templateFieldIndex);
        }

        // Validar formato regex si existe
        if (value && field.format) {
          try {
            if (!new RegExp(field.format).test(value)) {
              return withCancel(`⚠️ El valor no tiene el formato requerido para *${field.label}*. Intentá de nuevo.\n_Escribí *cancelar* para volver al menú._`);
            }
          } catch (_) { /* regex inválida en template, ignorar */ }
        }

        const newValues = { ...templateValues, [field.code]: value };
        const nextIdx = findNextFieldIndex(templateFields, templateFieldIndex + 1, newValues);

        if (nextIdx === -1) {
          updateSession(sessionKey, { state: STATES.AWAIT_TITLE, templateValues: autoFillRemainingFields(templateFields, newValues), templateFieldIndex: templateFields.length });
          return withCancel(MSG.ASK_TITLE);
        }
        updateSession(sessionKey, { templateFieldIndex: nextIdx, templateValues: newValues });
        return presentField(templateFields, nextIdx);
      }

      case STATES.AWAIT_TITLE: {
        if (!input) return withCancel(MSG.ASK_TITLE);
        updateSession(sessionKey, { state: STATES.AWAIT_DESC, title: input });
        return withCancel(MSG.ASK_DESC);
      }

      case STATES.AWAIT_DESC: {
        if (!input) return withCancel(MSG.ASK_DESC);
        const { serviceName, subcategoryName, templateFields, templateValues, title } = session;
        updateSession(sessionKey, { state: STATES.AWAIT_CONFIRM, description: input });
        return withButtons(MSG.CONFIRM_TICKET(serviceName, subcategoryName, title, input, templateFields, templateValues), [BTN_CONFIRM, BTN_MODIFY, BTN_CANCEL]);
      }

      case STATES.AWAIT_CONFIRM: {
        if (['1', 'si', 'sí', 'yes'].includes(input.toLowerCase())) {
          const { person, serviceId, subcategoryId, title, description, templateId, templateValues } = session;
          const serviceDetails = templateId
            ? { template_id: String(templateId), values: templateValues || {} }
            : null;
          const ticket = await createUserRequest(person, serviceId, subcategoryId, title, description, serviceDetails);
          updateSession(sessionKey, { state: STATES.AWAIT_ATTACHMENT, ticketId: ticket.id, ticketRef: ticket.ref });
          return MSG.ASK_ATTACHMENT(ticket.ref);
        }
        if (['2', 'no'].includes(input.toLowerCase())) {
          updateSession(sessionKey, { state: STATES.AWAIT_TITLE, title: null, description: null });
          return withCancel(MSG.ASK_TITLE);
        }
        return MSG.INVALID_CONFIRM;
      }

      case STATES.AWAIT_ATTACHMENT: {
        const { ticketId, ticketRef } = session;
        if (['no', 'omitir', 'saltar', 'skip'].includes(input.toLowerCase())) {
          updateSession(sessionKey, { state: STATES.MAIN_MENU });
          return MSG.TICKET_DONE(ticketRef);
        }
        if (attachment) {
          try {
            await attachToTicket(ticketId, attachment.filename, attachment.data, attachment.mimetype);
            return MSG.ASK_ANOTHER_ATTACHMENT(ticketRef);
          } catch (err) {
            console.error(`[flow] Error adjuntando archivo al ticket ${ticketRef}:`, err.message);
            updateSession(sessionKey, { state: STATES.MAIN_MENU });
            return MSG.ATTACHMENT_ERROR(ticketRef);
          }
        }
        return MSG.ASK_ATTACHMENT(ticketRef);
      }

      default: {
        clearSession(sessionKey);
        return MSG.ERROR;
      }
    }

  } catch (err) {
    console.error(`[flow] Error procesando mensaje de ${sessionKey}:`, err.message);
    clearSession(sessionKey);
    return MSG.ERROR;
  }
}

module.exports = { handleMessage };
