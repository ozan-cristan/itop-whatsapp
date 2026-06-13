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

// ─── Constructores de respuesta ───────────────────────────────────────────────

function withButtons(text, buttons) { return { text, buttons }; }

function withList(text, rows, buttonLabel = 'Ver opciones') {
  return { text, list: { button: buttonLabel, rows } };
}

function withCancel(text) {
  return withButtons(text, [BTN_CANCEL]);
}

// ─── Constantes de botones ────────────────────────────────────────────────────

const BTN_CANCEL  = { id: 'cancelar',  label: '❌ Cancelar' };
const BTN_CONFIRM = { id: '1',         label: '✅ Confirmar' };
const BTN_MODIFY  = { id: '2',         label: '✏️ Modificar' };
const CANCEL_ROW  = { id: 'cancelar',  title: '❌ Volver al menú' };

// ─── Menú principal como lista interactiva ────────────────────────────────────

function mainMenuList(promptText) {
  return withList(promptText, [
    { id: '1', title: '📝 Nueva solicitud' },
    { id: '2', title: '📋 Activas' },
    { id: '3', title: '📁 Resueltas' },
    { id: '4', title: '👋 Salir' },
  ]);
}

// ─── Helpers de selección ─────────────────────────────────────────────────────

// Interpreta IDs de lista (sel_0, sel_1…) o texto numérico (1, 2…)
function parseSelectionIndex(input) {
  if (input.startsWith('sel_')) return parseInt(input.slice(4), 10);
  const n = parseInt(input, 10);
  return isNaN(n) ? -1 : n - 1;
}

// Interpreta IDs de opciones de campo (opt_0, opt_1…) o texto numérico
function parseOptIndex(input) {
  if (input.startsWith('opt_')) return parseInt(input.slice(4), 10);
  const n = parseInt(input, 10);
  return isNaN(n) ? -1 : n - 1;
}

// ─── Labels de estado ─────────────────────────────────────────────────────────

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

// ─── Mensajes ─────────────────────────────────────────────────────────────────

const MSG = {
  ASK_PHONE:      '👋 ¡Bienvenido! Para identificarte, ingresá tu *CUIT* (sin guiones ni espacios):',
  SESSION_EXPIRED:'⏱️ Tu sesión expiró por inactividad. Ingresá tu *CUIT* para identificarte nuevamente:',
  PHONE_NOT_FOUND:'❌ No encontramos ese CUIT en el sistema. Verificá e ingresalo de nuevo:',
  PHONE_ERROR:    '⚠️ No pudimos conectar con el sistema en este momento. Intentá de nuevo:',

  WELCOME:    (name) => mainMenuList(`👋 Hola *${name}*. ¿Qué querés hacer?`),
  CANCEL_MSG: (name) => mainMenuList(`↩️ Operación cancelada. ¿Qué querés hacer, *${name}*?`),
  FAREWELL:   (name) => `👋 ¡Hasta luego, *${name}*! Si necesitás algo más, escribí *hola* para comenzar de nuevo.`,
  INVALID_MENU: ()  => mainMenuList('⚠️ Opción inválida. ¿Qué querés hacer?'),

  NO_FAMILIES:         '⚠️ No hay familias de servicios disponibles para tu organización. Contactá a soporte.',
  NO_SERVICES:         '⚠️ No hay servicios disponibles para esa familia. Contactá a soporte.',
  NO_TICKETS:          '📭 No tenés solicitudes activas en el sistema.',
  NO_RESOLVED_TICKETS: '📭 No tenés solicitudes resueltas en el sistema.',

  ASK_FAMILY: (families) => withList(
    '🗂️ Seleccioná la *familia de servicios*:',
    [...families.map((f, i) => ({ id: `sel_${i}`, title: f.name.slice(0, 24) })), CANCEL_ROW]
  ),

  ASK_SERVICE: (services) => withList(
    '📋 Seleccioná el *servicio*:',
    [...services.map((s, i) => ({ id: `sel_${i}`, title: s.name.slice(0, 24) })), CANCEL_ROW]
  ),

  ASK_SUBCAT: (subcats) => withList(
    '📂 Seleccioná la subcategoría:',
    [...subcats.map((s, i) => ({ id: `sel_${i}`, title: s.name.slice(0, 24) })), CANCEL_ROW]
  ),

  ASK_SKU:   withCancel('🏷️ Ingresá el *SKU* o código del producto (si aplica):\n\n_Escribí *omitir* si no corresponde._\n_Escribí *cancelar* para volver al menú._'),
  ASK_TITLE: '📝 *Paso 1 de 2* — Ingresá el *título* del reporte:\n\n_Escribí *cancelar* para volver al menú._',
  ASK_DESC:  '📄 *Paso 2 de 2* — Ingresá la *descripción* del problema:\n\n_Escribí *cancelar* para volver al menú._',

  CONFIRM_TICKET: (serviceName, subcatName, sku, title, desc, templateFields, templateValues) => {
    let msg = `📋 *Resumen de tu solicitud*\n\n`;
    msg += `🔧 Servicio: ${serviceName}\n`;
    if (subcatName) msg += `📂 Subcategoría: ${subcatName}\n`;
    if (sku)        msg += `🏷️ SKU: ${sku}\n`;
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
    msg += `¿Confirmás la creación?`;
    return msg;
  },
  INVALID_CONFIRM: '⚠️ Respondé *1* para confirmar o *2* para modificar datos.',

  ASK_ATTACHMENT: (ref) => withButtons(
    `✅ Ticket *${ref}* creado.\n\n📎 Enviá un archivo para adjuntar, o tocá el botón para continuar sin adjunto.`,
    [{ id: 'no', label: '✔️ Sin adjunto' }]
  ),
  ASK_ANOTHER_ATTACHMENT: (ref) => withButtons(
    `✅ Archivo adjuntado al ticket *${ref}*. ¿Querés adjuntar otro?`,
    [{ id: 'no', label: '✔️ Terminar' }]
  ),
  TICKET_DONE: (ref) =>
    mainMenuList(`✅ Ticket *${ref}* listo. Un agente se pondrá en contacto a la brevedad.\n\n¿Qué querés hacer ahora?`),
  ATTACHMENT_ERROR: (ref) =>
    mainMenuList(`⚠️ No se pudo adjuntar el archivo, pero el ticket *${ref}* fue creado.\n\n¿Qué querés hacer ahora?`),

  SHOW_TICKETS: (tickets, resolved = false) => {
    const label = resolved ? '📁 Tus solicitudes resueltas:' : '📋 Tus solicitudes activas:';
    const rows = tickets.map((t, i) => {
      const emoji = STATUS_EMOJI[t.status] || '⚪';
      return {
        id: `sel_${i}`,
        title: `${emoji} ${t.ref}`.slice(0, 24),
        description: t.title.slice(0, 72),
      };
    });
    rows.push(CANCEL_ROW);
    return withList(label, rows, 'Seleccionar');
  },

  TICKET_DETAIL: (d) => {
    const status = STATUS_LABELS[d.status] || d.status;
    const emoji = STATUS_EMOJI[d.status] || '⚪';
    let msg = `📋 *${d.ref}* — ${d.title}\n\n${emoji} Estado: *${status}*\n🏢 Grupo: ${d.team}\n👤 Técnico: ${d.agent}`;
    if (d.lastLogMessage) {
      const text = d.lastLogMessage.replace(/<[^>]+>/g, '').trim();
      msg += `\n\n📝 Última nota pública (${d.lastLogDate}):\n${text}`;
    }
    return withButtons(msg + '\n\n¿Qué querés hacer?', [
      { id: '1', label: '📝 Nueva solicitud' },
      { id: '2', label: '🔍 Ver otra' },
      { id: '3', label: '💬 Comentar' },
    ]);
  },
  TICKET_DETAIL_INVALID: '⚠️ Tocá una de las opciones o respondé *1*, *2* o *3*.',

  ASK_COMMENT: '💬 Ingresá el comentario que querés agregar al ticket:\n\n_Escribí *cancelar* para volver al menú._',
  COMMENT_ADDED: (ref) =>
    mainMenuList(`✅ Comentario agregado al ticket *${ref}*.\n\n¿Qué querés hacer ahora?`),
  COMMENT_ERROR: '⚠️ No se pudo agregar el comentario. Intentá nuevamente.',

  ERROR: '⚠️ Ocurrió un error al procesar tu solicitud. Intentá nuevamente.',
};

// ─── Helpers para plantillas ───────────────────────────────────────────────────

function evaluateDisplayCondition(condition, values) {
  if (!condition) return true;
  const eqMatch  = condition.match(/:template->(\w+)\s*=\s*'([^']*)'/);
  const neqMatch = condition.match(/:template->(\w+)\s*!=\s*'([^']*)'/);
  if (eqMatch)  return (values[eqMatch[1]]  || '') === eqMatch[2];
  if (neqMatch) return (values[neqMatch[1]] || '') !== neqMatch[2];
  return true;
}

function findNextFieldIndex(fields, startIndex, values) {
  for (let i = startIndex; i < fields.length; i++) {
    const f = fields[i];
    if (f.input_type === 'read_only' || f.input_type === 'hidden') continue;
    if (f.display_condition && !evaluateDisplayCondition(f.display_condition, values)) continue;
    return i;
  }
  return -1;
}

function autoFillRemainingFields(fields, values) {
  const result = { ...values };
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(result, f.code)) {
      result[f.code] = f.initial_value || '';
    }
  }
  return result;
}

function countUserFields(fields) {
  return fields.filter(f => f.input_type !== 'read_only' && f.input_type !== 'hidden').length;
}

function userFieldPosition(fields, fieldIndex) {
  let count = 0;
  for (let i = 0; i <= fieldIndex; i++) {
    const f = fields[i];
    if (f.input_type !== 'read_only' && f.input_type !== 'hidden') count++;
  }
  return count;
}

function presentField(fields, idx) {
  const field   = fields[idx];
  const current = userFieldPosition(fields, idx);
  const total   = countUserFields(fields);
  const req     = field.mandatory === 'yes' ? '_(requerido)_' : '_(opcional)_';

  let msg = `📋 *Campo ${current} de ${total}* ${req}\n\n*${field.label}*`;

  // Campo con opciones → lista interactiva
  if (field.options && field.options.length > 0) {
    const rows = field.options.map((o, i) => ({ id: `opt_${i}`, title: o.label.slice(0, 24) }));
    rows.push(CANCEL_ROW);
    return withList(msg, rows);
  }

  if (field.input_type === 'date')          msg += '\n\n_Formato: DD/MM/AAAA_';
  else if (field.input_type === 'date_and_time') msg += '\n\n_Formato: DD/MM/AAAA HH:MM_';

  if (field.mandatory !== 'yes') msg += '\n_Escribí *omitir* para saltear._';
  msg += '\n_Escribí *cancelar* para volver al menú._';
  return withCancel(msg);
}

async function startTemplateOrTitle(sessionKey, baseUpdate, serviceId, serviceName, subcategoryId, subcategoryName) {
  if (subcategoryId) {
    try {
      const template = await getTemplateForSubcategory(serviceId, subcategoryId);
      if (template && template.fields.length > 0) {
        const name = getSession(sessionKey)?.person?.friendlyname || '';
        updateSession(sessionKey, { state: STATES.MAIN_MENU });
        return mainMenuList(`⚠️ La subcategoría *${subcategoryName}* requiere datos adicionales que no se pueden ingresar por WhatsApp.\n\nPor favor, creá el ticket desde el *portal web*.\n\n¿Qué querés hacer, *${name}*?`);
      }
    } catch (err) {
      console.error('[flow] Error buscando plantilla:', err.message);
    }
  }

  updateSession(sessionKey, {
    ...baseUpdate,
    serviceId, serviceName, subcategoryId, subcategoryName,
    state: STATES.AWAIT_SKU,
    sku: null,
    templateId: null, templateFields: [], templateFieldIndex: 0, templateValues: {},
  });
  return MSG.ASK_SKU;
}

// ─── Máquina de estados ────────────────────────────────────────────────────────

async function handleMessage(sessionKey, text, attachment = null) {
  const input = text.trim();

  try {
    let session = getSession(sessionKey);

    if (!session) {
      const expired = wasSessionExpired(sessionKey);
      session = createPendingSession(sessionKey);
      return expired ? MSG.SESSION_EXPIRED : MSG.ASK_PHONE;
    }

    if (session.state === STATES.IDLE) {
      if (TRIGGER_WORDS.includes(input.toLowerCase())) {
        updateSession(sessionKey, { state: STATES.MAIN_MENU });
        return MSG.WELCOME(session.person.friendlyname);
      }
      return null;
    }

    if (input.toLowerCase() === 'cancelar' && session.state !== STATES.AWAIT_PHONE) {
      updateSession(sessionKey, {
        state: STATES.MAIN_MENU,
        sku: null, templateId: null, templateFields: [], templateFieldIndex: 0, templateValues: {},
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
            return MSG.ASK_SERVICE(services);
          }
          updateSession(sessionKey, { state: STATES.FAMILY_SELECT, families });
          return MSG.ASK_FAMILY(families);
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
        return MSG.INVALID_MENU();
      }

      case STATES.TICKET_LIST:
      case STATES.CLOSED_TICKET_LIST: {
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.tickets.length) {
          return MSG.SHOW_TICKETS(session.tickets, session.state === STATES.CLOSED_TICKET_LIST);
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
            return MSG.ASK_SERVICE(services);
          }
          updateSession(sessionKey, { state: STATES.FAMILY_SELECT, families });
          return MSG.ASK_FAMILY(families);
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
        if (!input) return withCancel(MSG.ASK_COMMENT);
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
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.families.length) {
          return MSG.ASK_FAMILY(session.families);
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
          return MSG.ASK_SUBCAT(subcategories);
        }
        updateSession(sessionKey, { state: STATES.SERVICE_SELECT });
        return MSG.ASK_SERVICE(services);
      }

      case STATES.SERVICE_SELECT: {
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.services.length) {
          return MSG.ASK_SERVICE(session.services);
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
        return MSG.ASK_SUBCAT(subcategories);
      }

      case STATES.SUBCAT_SELECT: {
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.subcategories.length) {
          return MSG.ASK_SUBCAT(session.subcategories);
        }
        const subcat = session.subcategories[idx];
        return startTemplateOrTitle(sessionKey, {}, session.serviceId, session.serviceName, subcat.id, subcat.name);
      }

      case STATES.AWAIT_TEMPLATE_FIELD: {
        const { templateFields, templateFieldIndex, templateValues } = session;
        const field = templateFields[templateFieldIndex];

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

        let value;

        if (field.options && field.options.length > 0) {
          const optIdx = parseOptIndex(input);
          if (optIdx < 0 || optIdx >= field.options.length) {
            return presentField(templateFields, templateFieldIndex);
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

        if (!value && field.mandatory === 'yes') {
          return presentField(templateFields, templateFieldIndex);
        }

        if (value && field.format) {
          try {
            if (!new RegExp(field.format).test(value)) {
              return withCancel(`⚠️ El valor no tiene el formato requerido para *${field.label}*. Intentá de nuevo.\n_Escribí *cancelar* para volver al menú._`);
            }
          } catch (_) {}
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

      case STATES.AWAIT_SKU: {
        const skuValue = ['omitir', 'skip', 'no'].includes(input.toLowerCase()) ? null : input || null;
        updateSession(sessionKey, { state: STATES.AWAIT_TITLE, sku: skuValue });
        return withCancel(MSG.ASK_TITLE);
      }

      case STATES.AWAIT_TITLE: {
        if (!input) return withCancel(MSG.ASK_TITLE);
        updateSession(sessionKey, { state: STATES.AWAIT_DESC, title: input });
        return withCancel(MSG.ASK_DESC);
      }

      case STATES.AWAIT_DESC: {
        if (!input) return withCancel(MSG.ASK_DESC);
        const { serviceName, subcategoryName, sku, templateFields, templateValues, title } = session;
        updateSession(sessionKey, { state: STATES.AWAIT_CONFIRM, description: input });
        return withButtons(MSG.CONFIRM_TICKET(serviceName, subcategoryName, sku, title, input, templateFields, templateValues), [BTN_CONFIRM, BTN_MODIFY, BTN_CANCEL]);
      }

      case STATES.AWAIT_CONFIRM: {
        if (['1', 'si', 'sí', 'yes'].includes(input.toLowerCase())) {
          const { person, serviceId, subcategoryId, title, description, sku, templateId, templateValues } = session;
          const serviceDetails = templateId
            ? { template_id: String(templateId), values: templateValues || {} }
            : null;
          const ticket = await createUserRequest(person, serviceId, subcategoryId, title, description, serviceDetails, sku);
          updateSession(sessionKey, { state: STATES.AWAIT_ATTACHMENT, ticketId: ticket.id, ticketRef: ticket.ref });
          return MSG.ASK_ATTACHMENT(ticket.ref);
        }
        if (['2', 'no'].includes(input.toLowerCase())) {
          updateSession(sessionKey, { state: STATES.AWAIT_SKU, sku: null, title: null, description: null });
          return MSG.ASK_SKU;
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
