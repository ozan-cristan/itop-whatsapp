const { STATES, getSession, wasSessionExpired, createSession, createPendingSession, updateSession, clearSession, endSession, getPendingReply, clearPendingReply } = require('./state');
const {
  findPersonByMobile, findPersonByCuil,
  getServicesForOrg,
  getSubcategoriesForService,
  createUserRequest, attachToTicket,
  getTicketsForPerson,
  getResolvedTicketsForPerson,
  getTicketDetail, addCommentToTicket,
} = require('./itop');


const TRIGGER_WORDS = ['hola', 'inicio', 'ticket', 'ayuda', 'help', 'start'];
// Palabras que cierran el modo conversación con ticket
const EXIT_KEYWORDS = [...TRIGGER_WORDS, 'menu', 'salir', 'fin', 'salir_conv'];

const GARANTIA_URL = process.env.GARANTIA_URL || '';

// ─── Constructores de respuesta ───────────────────────────────────────────────

function withButtons(text, buttons) { return { text, buttons }; }

function withList(text, rows, buttonLabel = 'Ver opciones') {
  return { text, list: { button: buttonLabel, rows } };
}

function withCancel(text) {
  return withButtons(text, [BTN_CANCEL]);
}

// ─── Constantes de botones ────────────────────────────────────────────────────

const BTN_CANCEL  = { id: 'cancelar', label: '❌ Cancelar' };
const BTN_CONFIRM = { id: '1',        label: '✅ Confirmar' };
const BTN_MODIFY  = { id: '2',        label: '✏️ Modificar' };
const CANCEL_ROW  = { id: 'cancelar', title: '❌ Volver al menú' };

// ─── Menú principal (carga servicios dinámicamente) ───────────────────────────

async function buildMainMenu(sessionKey, headerText) {
  const session  = getSession(sessionKey);
  const name     = session.person.friendlyname;
  const services = await getServicesForOrg(session.person.org_id);
  updateSession(sessionKey, { state: STATES.MAIN_MENU, services });

  const rows = [
    ...services.map((s, i) => ({ id: `sel_${i}`, title: s.name.slice(0, 24) })),
    { id: 'seguimiento', title: '📋 Seguimiento' },
    { id: 'cerrados',    title: '📁 Resueltos' },
    { id: 'garantia',    title: '📄 Políticas de garantía' },
    { id: 'salir',       title: '👋 Salir' },
  ];
  return withList(headerText || `👋 Hola *${name}*. ¿Qué necesitás?`, rows);
}

// ─── Helpers de selección ─────────────────────────────────────────────────────

function parseSelectionIndex(input) {
  if (input.startsWith('sel_')) return parseInt(input.slice(4), 10);
  const n = parseInt(input, 10);
  return isNaN(n) ? -1 : n - 1;
}

// ─── Labels de estado ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  new: 'Nuevo', assigned: 'Asignado', in_progress: 'En progreso', pending: 'Pendiente',
  waiting_for_approval: 'Esperando aprobación', resolved: 'Resuelto', closed: 'Cerrado',
  dispatched: 'Despachado', escalated_tto: 'Escalado (TTO)', escalated_ttr: 'Escalado (TTR)',
  frozen: 'Congelado',
};

const STATUS_EMOJI = {
  new: '🔴', assigned: '🟡', in_progress: '🔵', pending: '⏸️',
  waiting_for_approval: '🕐', resolved: '🟢', closed: '⚫',
  dispatched: '🟡', escalated_tto: '🔴', escalated_ttr: '🔴', frozen: '❄️',
};

// ─── Helper: listado paginado de tickets ──────────────────────────────────────
// WhatsApp limita las listas interactivas a 10 filas. Si hay más de 10 tickets,
// se muestran de a 9 con una fila "Ver más" que avanza de página (cicla al final).
// Hasta 10 tickets se muestran todos. La opción de cancelar va en el cuerpo del
// mensaje (escribir "cancelar") para no gastar una fila.
const TICKET_PAGE_SIZE = 9;

const SUBCATS_INVOICE_FLOW   = ['faltantes', 'producto incorrecto', 'mercadería/pack. dañado', 'mercadería/packaging dañado'];
const SUBCATS_INVOICE_NO_SKU = ['pedido incorrecto'];

function buildTicketList(headerBase, tickets, page = 0) {
  const total = tickets.length;

  // 1 a 3 tickets: botones inline directos (única forma en WhatsApp de mostrar
  // las opciones sin el toque extra en "Seleccionar"; el límite es 3 botones).
  // El cuerpo lista ref + título para dar contexto de cada botón.
  if (total <= 3) {
    const buttons = tickets.map((t, i) => ({
      id: `sel_${i}`,
      label: `${STATUS_EMOJI[t.status] || '⚪'} ${t.ref}`.slice(0, 20),
    }));
    const detail = tickets.map((t) => {
      const emoji = STATUS_EMOJI[t.status] || '⚪';
      return `${emoji} *${t.ref}* — ${t.title.slice(0, 60)}`;
    }).join('\n');
    const body = `${headerBase}\n\n${detail}\n\n_Tocá un botón para abrir, o escribí *cancelar* para volver al menú._`;
    return withButtons(body, buttons);
  }

  // 4 o más: lista seleccionable nativa de WhatsApp. Hasta 10 en una sola
  // página; si supera 10 se pagina de a 9 con una fila "Ver más". (WhatsApp
  // colapsa la lista tras "Seleccionar"; no es posible mostrarla expandida.)
  const needsPaging = total > 10;
  const size = needsPaging ? TICKET_PAGE_SIZE : 10;
  const pages = Math.ceil(total / size) || 1;
  const safePage = ((page % pages) + pages) % pages;
  const start = safePage * size;
  const slice = tickets.slice(start, start + size);

  const rows = slice.map((t, i) => {
    const emoji = STATUS_EMOJI[t.status] || '⚪';
    return {
      id: `sel_${start + i}`,
      title: `${emoji} ${t.ref}`.slice(0, 24),
      description: t.title.slice(0, 72),
    };
  });
  if (needsPaging) rows.push({ id: 'ver_mas', title: '➕ Ver más solicitudes' });

  let header = headerBase;
  if (needsPaging) header += ` (página ${safePage + 1} de ${pages})`;
  header += '\n\n_Escribí *cancelar* para volver al menú._';
  return withList(header, rows, 'Seleccionar');
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

const MSG = {
  ASK_PHONE:       '👋 ¡Bienvenido! Para identificarte, ingresá tu *CUIT* (sin guiones ni espacios):',
  SESSION_EXPIRED: '⏱️ Tu sesión expiró por inactividad. Ingresá tu *CUIT* para identificarte nuevamente:',
  PHONE_NOT_FOUND: '❌ No encontramos ese CUIT en el sistema. Verificá e ingresalo de nuevo:',
  PHONE_ERROR:     '⚠️ No pudimos conectar con el sistema en este momento. Intentá de nuevo:',
  FAREWELL:        (name) => `👋 ¡Hasta luego, *${name}*! Si necesitás algo más, escribí *hola* para comenzar de nuevo.`,

  NO_SERVICES: '⚠️ No hay servicios disponibles para tu organización. Contactá a soporte.',
  NO_TICKETS:  '📭 No tenés solicitudes en el sistema.',

  ASK_SUBCAT: (subcats) => withList(
    '📂 Seleccioná la subcategoría:',
    [...subcats.map((s, i) => ({ id: `sel_${i}`, title: s.name.slice(0, 24) })), CANCEL_ROW]
  ),

  ASK_SKU:            withCancel('🏷️ Ingresá el *SKU o Código del Producto con Problemas* (si aplica):\n\n_Escribí *omitir* si no corresponde._\n_Escribí *cancelar* para volver al menú._'),
  ASK_INVOICE:        withCancel('🧾 *Paso 1 de 1* — Ingresá el *N° de factura* del problema:\n\n📎 _En el siguiente paso te voy a pedir que adjuntes la factura._\n\n_Escribí *cancelar* para volver al menú._'),
  ASK_CUSTOMER_NAME:  withCancel('👤 *Paso 1 de 4* — Ingresá el *nombre y apellido del consumidor final*:\n\n_Escribí *cancelar* para volver al menú._'),
  ASK_CUSTOMER_EMAIL: withCancel('📧 *Paso 2 de 4* — Ingresá el *correo electrónico* del consumidor final:\n\n_Escribí *cancelar* para volver al menú._'),
  ASK_MOBILE:         withCancel('📱 *Paso 3 de 4* — Ingresá el *número móvil* del consumidor final:\n\n⚠️ Sin el *0* de área y sin el *15*.\nEjemplo: `341 781-3171`\n(no `0341 15-781-3171`)\n\n_Escribí *cancelar* para volver al menú._'),
  ASK_DESC:           '📄 *Paso 4 de 4* — Ingresá la *descripción* del problema:\n\n_Escribí *cancelar* para volver al menú._',

  MOBILE_INVALID_0: withCancel(
    '⚠️ *No incluyas el 0* al inicio del código de área.\n\n' +
    'Ejemplo correcto: `341 781-3171`\n(no `0341 781-3171`)\n\n' +
    '_Volvé a ingresarlo, o escribí *cancelar* para volver al menú._'
  ),
  MOBILE_INVALID_15: withCancel(
    '⚠️ *No incluyas el 15* del celular.\n\n' +
    'Ejemplo correcto: `341 781-3171`\n(no `0341 15-781-3171`)\n\n' +
    '_Volvé a ingresarlo, o escribí *cancelar* para volver al menú._'
  ),
  EMAIL_INVALID: withCancel(
    '⚠️ El *correo electrónico* no tiene un formato válido.\n\n' +
    'Ejemplo correcto: `nombre@dominio.com`\n\n' +
    '_Volvé a ingresarlo, o escribí *cancelar* para volver al menú._'
  ),

  CONFIRM_TICKET: (serviceName, subcatName, sku, customerName, customerEmail, numeroMovil, desc) => {
    let msg = `📋 *Resumen de tu solicitud*\n\n`;
    msg += `🔧 Servicio: ${serviceName}\n`;
    if (subcatName)  msg += `📂 Subcategoría: ${subcatName}\n`;
    if (sku)         msg += `🏷️ SKU: ${sku}\n`;
    msg += `👤 Cliente: ${customerName}\n`;
    msg += `📧 Email: ${customerEmail}\n`;
    msg += `📱 Móvil: ${numeroMovil}\n`;
    msg += `📄 Descripción: ${desc}\n\n`;
    msg += `¿Confirmás la creación?`;
    return msg;
  },
  CONFIRM_TICKET_INVOICE: (subcatName, sku, invoice) => {
    let msg = `📋 *Resumen de tu solicitud*\n\n`;
    msg += `📂 Subcategoría: ${subcatName}\n`;
    if (sku) msg += `🏷️ SKU: ${sku}\n`;
    msg += `🧾 N° de factura: ${invoice}\n\n`;
    msg += `¿Confirmás la creación?`;
    return msg;
  },
  INVALID_CONFIRM: '⚠️ Respondé *1* para confirmar o *2* para modificar datos.',

  ASK_FIELD_TO_EDIT: (session) => {
    const fmt = (v) => (v ? String(v).slice(0, 40) : '—');
    let rows;
    if (!session.invoiceFlow) {
      rows = [
        { id: 'edit_sku',         title: '🏷️ SKU',          description: fmt(session.sku) },
        { id: 'edit_name',        title: '👤 Nombre',        description: fmt(session.customerName) },
        { id: 'edit_email',       title: '📧 Email',         description: fmt(session.customerEmail) },
        { id: 'edit_mobile',      title: '📱 Móvil',         description: fmt(session.numeroMovil) },
        { id: 'edit_description', title: '📄 Descripción',   description: fmt(session.description) },
        CANCEL_ROW,
      ];
    } else if (SUBCATS_INVOICE_NO_SKU.includes(session.subcategoryName.toLowerCase())) {
      rows = [
        { id: 'edit_description', title: '🧾 N° Factura',    description: fmt(session.description) },
        CANCEL_ROW,
      ];
    } else {
      rows = [
        { id: 'edit_sku',         title: '🏷️ SKU',          description: fmt(session.sku) },
        { id: 'edit_description', title: '🧾 N° Factura',    description: fmt(session.description) },
        CANCEL_ROW,
      ];
    }
    return withList('✏️ ¿Qué dato querés modificar?', rows, 'Elegir campo');
  },

  ASK_ATTACHMENT: (ref) => withButtons(
    `✅ Ticket *${ref}* creado.\n\n📎 Enviá un archivo para adjuntar, o tocá el botón para continuar sin adjunto.`,
    [{ id: 'no', label: '✔️ Sin adjunto' }]
  ),
  ASK_ANOTHER_ATTACHMENT: (ref) => withButtons(
    `✅ Archivo adjuntado al ticket *${ref}*. ¿Querés adjuntar otro?`,
    [{ id: 'no', label: '✔️ Terminar' }]
  ),

  SHOW_TICKETS: (tickets, page = 0) => buildTicketList('📋 Tus solicitudes activas:', tickets, page),

  SHOW_RESOLVED_TICKETS: (tickets, page = 0) => buildTicketList('📁 Tus requerimientos resueltos:', tickets, page),

  TICKET_DETAIL: (d) => {
    const status = STATUS_LABELS[d.status] || d.status;
    const emoji  = STATUS_EMOJI[d.status]  || '⚪';
    let msg = `📋 *${d.ref}* — ${d.title}\n\n${emoji} Estado: *${status}*\n🏢 Grupo: ${d.team}\n👤 Técnico: ${d.agent}`;
    if (d.lastLogMessage) {
      const text = d.lastLogMessage.replace(/<[^>]+>/g, '').trim();
      msg += `\n\n📝 Última nota pública (${d.lastLogDate}):\n${text}`;
    }
    return withButtons(msg + '\n\n¿Qué querés hacer?', [
      { id: '1', label: '🔙 Volver al menú' },
      { id: '2', label: '🔍 Ver otra' },
      { id: '3', label: '💬 Comentar' },
    ]);
  },

  ASK_COMMENT:   '💬 Ingresá el comentario que querés agregar al ticket:\n\n_Escribí *cancelar* para volver al menú._',
  COMMENT_ERROR: '⚠️ No se pudo agregar el comentario. Intentá nuevamente.',

  ERROR: '⚠️ Ocurrió un error al procesar tu solicitud. Intentá nuevamente.',
};

// ─── Edición de campos: selección → metadatos del campo ────────────────────────
// field: clave en la sesión; ask: mensaje para pedir el nuevo valor.
const EDITABLE_FIELDS = {
  edit_sku:         { field: 'sku',           ask: () => MSG.ASK_SKU },
  edit_name:        { field: 'customerName',  ask: () => MSG.ASK_CUSTOMER_NAME },
  edit_email:       { field: 'customerEmail', ask: () => MSG.ASK_CUSTOMER_EMAIL },
  edit_mobile:      { field: 'numeroMovil',   ask: () => MSG.ASK_MOBILE },
  edit_description: { field: 'description',   ask: () => withCancel(MSG.ASK_DESC) },
};

// ─── Helper: validar móvil ─────────────────────────────────────────────────────
// Retorna el mensaje de error correspondiente, o null si el número es válido.
function validateMobile(input) {
  const digits = input.replace(/\D/g, '');
  // Detectar 0 inicial de código de área (ej. 0341 → debe ser 341)
  if (digits.startsWith('0')) return MSG.MOBILE_INVALID_0;
  // Detectar 15 incluido en el número (ej. 34115781371 → debe ser 3417813171)
  if (/^\d{2,4}15\d{6,8}$/.test(digits)) return MSG.MOBILE_INVALID_15;
  return null;
}

// ─── Helper: validar email ─────────────────────────────────────────────────────
// Retorna el mensaje de error si el formato es inválido, o null si es válido.
function validateEmail(input) {
  if (!/^\S+@\S+\.\S+$/.test(input.trim())) return MSG.EMAIL_INVALID;
  return null;
}

// ─── Helper: ir al paso de SKU ────────────────────────────────────────────────

function goToSku(sessionKey, serviceId, serviceName, subcategoryId, subcategoryName) {
  const nameLC = subcategoryName.toLowerCase();
  const invoiceFlow = SUBCATS_INVOICE_FLOW.includes(nameLC) || SUBCATS_INVOICE_NO_SKU.includes(nameLC);
  const base = { serviceId, serviceName, subcategoryId, subcategoryName, invoiceFlow,
    sku: null, customerName: null, customerEmail: null, numeroMovil: null, title: null, description: null };
  if (SUBCATS_INVOICE_NO_SKU.includes(nameLC)) {
    updateSession(sessionKey, { ...base, state: STATES.AWAIT_DESC });
    return MSG.ASK_INVOICE;
  }
  updateSession(sessionKey, { ...base, state: STATES.AWAIT_SKU });
  return MSG.ASK_SKU;
}

// ─── Máquina de estados ────────────────────────────────────────────────────────

async function handleMessage(sessionKey, text, attachment = null) {
  const input = text.trim();

  try {
    // Si el usuario responde a una notificación de ticket y no tiene sesión activa,
    // mantener la conversación con ese ticket hasta que el usuario salga explícitamente.
    const pending = getPendingReply(sessionKey);
    if (pending && input) {
      const session = getSession(sessionKey);
      if (!session || session.state === STATES.IDLE || session.state === STATES.MAIN_MENU) {
        if (!EXIT_KEYWORDS.includes(input.toLowerCase())) {
          await addCommentToTicket(pending.ticketId, input, true);
          if (session) updateSession(sessionKey, {});
          // Solo confirmar el primer mensaje; los siguientes se agregan en silencio
          if (!pending.confirmed) {
            pending.confirmed = true;
            return withButtons(
              `✅ Mensaje agregado al ticket *${pending.ref}*.\n\nPodés seguir escribiendo. Cuando termines, tocá el botón.`,
              [{ id: 'salir_conv', label: '🏠 Ir al menú' }]
            );
          }
          return null;
        }
        // Palabra de salida: borrar pending reply e ir al menú
        clearPendingReply(sessionKey);
        // Si ya hay sesión con persona, ir al menú sin pedir CUIT
        if (session?.person) return buildMainMenu(sessionKey);
        // Sin sesión: buscar la persona usando el teléfono exacto que tiene iTop
        // (pending.callerPhone conserva el formato original, p.ej. "+54 9 341 6230202")
        try {
          const searchPhone = pending.callerPhone || sessionKey;
          const person = await findPersonByMobile(searchPhone);
          if (person) {
            createSession(sessionKey, person);
            return buildMainMenu(sessionKey);
          }
        } catch (err) {
          console.error('[flow:pending_exit] Error buscando persona por móvil:', err.message);
        }
        // No se pudo recuperar la sesión — pedir CUIT explícitamente
        createPendingSession(sessionKey);
        return MSG.ASK_PHONE;
      }
    }

    let session = getSession(sessionKey);

    if (!session) {
      const expired = wasSessionExpired(sessionKey);
      session = createPendingSession(sessionKey);
      return expired ? MSG.SESSION_EXPIRED : MSG.ASK_PHONE;
    }

    if (session.state === STATES.IDLE) {
      if (TRIGGER_WORDS.includes(input.toLowerCase())) {
        return buildMainMenu(sessionKey);
      }
      return null;
    }

    if (input.toLowerCase() === 'cancelar' &&
        session.state !== STATES.AWAIT_PHONE &&
        session.state !== STATES.AWAIT_ATTACHMENT) {
      return buildMainMenu(sessionKey, '↩️ Operación cancelada.');
    }

    switch (session.state) {

      case STATES.AWAIT_PHONE: {
        const normalized = input.replace(/\D/g, '');
        if (!normalized) return MSG.ASK_PHONE;
        try {
          const person = await findPersonByCuil(normalized);
          if (!person) return MSG.PHONE_NOT_FOUND;
          updateSession(sessionKey, { phone: normalized, person });
          return buildMainMenu(sessionKey);
        } catch (err) {
          console.error(`[flow:await_phone] Error buscando persona:`, err.message);
          return MSG.PHONE_ERROR;
        }
      }

      case STATES.MAIN_MENU: {
        if (input === 'seguimiento') {
          const tickets = await getTicketsForPerson(session.person.id);
          if (tickets.length === 0) return buildMainMenu(sessionKey, '📭 No tenés solicitudes activas.\n\n¿Qué querés hacer?');
          updateSession(sessionKey, { state: STATES.TICKET_LIST, tickets, ticketListType: 'active', ticketPage: 0 });
          return MSG.SHOW_TICKETS(tickets, 0);
        }
        if (input === 'cerrados') {
          const tickets = await getResolvedTicketsForPerson(session.person.id);
          if (tickets.length === 0) return buildMainMenu(sessionKey, '📭 No tenés requerimientos resueltos.\n\n¿Qué querés hacer?');
          updateSession(sessionKey, { state: STATES.CLOSED_TICKET_LIST, tickets, ticketListType: 'resolved', ticketPage: 0 });
          return MSG.SHOW_RESOLVED_TICKETS(tickets, 0);
        }
        if (input === 'garantia') {
          const menu = await buildMainMenu(sessionKey, '¿Qué más necesitás?');
          return GARANTIA_URL
            ? [`📄 *Políticas de garantía*\n\n${GARANTIA_URL}`, menu]
            : ['⚠️ El documento de políticas de garantía no está disponible en este momento.', menu];
        }
        if (input === 'salir') {
          const name = session.person.friendlyname;
          endSession(sessionKey);
          return MSG.FAREWELL(name);
        }
        if (!input) return null;
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= (session.services || []).length) {
          return buildMainMenu(sessionKey, '⚠️ Opción inválida. ¿Qué necesitás?');
        }
        const service = session.services[idx];
        const subcategories = await getSubcategoriesForService(service.id);
        if (subcategories.length === 0) return goToSku(sessionKey, service.id, service.name, null, null);
        if (subcategories.length === 1) return goToSku(sessionKey, service.id, service.name, subcategories[0].id, subcategories[0].name);
        updateSession(sessionKey, { state: STATES.SUBCAT_SELECT, serviceId: service.id, serviceName: service.name, subcategories });
        return MSG.ASK_SUBCAT(subcategories);
      }

      case STATES.TICKET_LIST: {
        if (input === 'ver_mas') {
          const page = (session.ticketPage || 0) + 1;
          updateSession(sessionKey, { ticketPage: page });
          return MSG.SHOW_TICKETS(session.tickets, page);
        }
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.tickets.length) return MSG.SHOW_TICKETS(session.tickets, session.ticketPage || 0);
        const ticket = session.tickets[idx];
        const detail = await getTicketDetail(ticket.id);
        updateSession(sessionKey, { state: STATES.TICKET_DETAIL_MENU, viewedTicketId: ticket.id, viewedTicketRef: ticket.ref });
        return MSG.TICKET_DETAIL(detail);
      }

      case STATES.CLOSED_TICKET_LIST: {
        if (input === 'ver_mas') {
          const page = (session.ticketPage || 0) + 1;
          updateSession(sessionKey, { ticketPage: page });
          return MSG.SHOW_RESOLVED_TICKETS(session.tickets, page);
        }
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.tickets.length) return MSG.SHOW_RESOLVED_TICKETS(session.tickets, session.ticketPage || 0);
        const ticket = session.tickets[idx];
        const detail = await getTicketDetail(ticket.id);
        updateSession(sessionKey, { state: STATES.TICKET_DETAIL_MENU, viewedTicketId: ticket.id, viewedTicketRef: ticket.ref });
        return MSG.TICKET_DETAIL(detail);
      }

      case STATES.TICKET_DETAIL_MENU: {
        if (input === '1') return buildMainMenu(sessionKey);
        if (input === '2') {
          if (session.ticketListType === 'resolved') {
            const tickets = await getResolvedTicketsForPerson(session.person.id);
            if (tickets.length === 0) return buildMainMenu(sessionKey, '📭 No tenés requerimientos resueltos.\n\n¿Qué querés hacer?');
            updateSession(sessionKey, { state: STATES.CLOSED_TICKET_LIST, tickets, ticketPage: 0 });
            return MSG.SHOW_RESOLVED_TICKETS(tickets, 0);
          }
          const tickets = await getTicketsForPerson(session.person.id);
          if (tickets.length === 0) return buildMainMenu(sessionKey, '📭 No tenés solicitudes activas.\n\n¿Qué querés hacer?');
          updateSession(sessionKey, { state: STATES.TICKET_LIST, tickets, ticketPage: 0 });
          return MSG.SHOW_TICKETS(tickets, 0);
        }
        if (input === '3') {
          updateSession(sessionKey, { state: STATES.AWAIT_COMMENT });
          return withCancel(MSG.ASK_COMMENT);
        }
        return MSG.TICKET_DETAIL(await getTicketDetail(session.viewedTicketId));
      }

      case STATES.AWAIT_COMMENT: {
        if (!input) return withCancel(MSG.ASK_COMMENT);
        const { viewedTicketId, viewedTicketRef } = session;
        try {
          await addCommentToTicket(viewedTicketId, input, true);
          updateSession(sessionKey, { viewedTicketId: null, viewedTicketRef: null });
          return buildMainMenu(sessionKey, `✅ Comentario agregado al ticket *${viewedTicketRef}*.\n\n¿Qué querés hacer ahora?`);
        } catch (err) {
          console.error(`[flow:await_comment] Error agregando comentario:`, err.message);
          return MSG.COMMENT_ERROR;
        }
      }

      case STATES.SUBCAT_SELECT: {
        const idx = parseSelectionIndex(input);
        if (idx < 0 || idx >= session.subcategories.length) return MSG.ASK_SUBCAT(session.subcategories);
        const subcat = session.subcategories[idx];
        return goToSku(sessionKey, session.serviceId, session.serviceName, subcat.id, subcat.name);
      }

      case STATES.AWAIT_SKU: {
        const skuValue = ['omitir', 'skip', 'no'].includes(input.toLowerCase()) ? null : input || null;
        if (session.invoiceFlow) {
          updateSession(sessionKey, { state: STATES.AWAIT_DESC, sku: skuValue });
          return MSG.ASK_INVOICE;
        }
        updateSession(sessionKey, { state: STATES.AWAIT_CUSTOMER_NAME, sku: skuValue });
        return MSG.ASK_CUSTOMER_NAME;
      }

      case STATES.AWAIT_CUSTOMER_NAME: {
        if (!input) return MSG.ASK_CUSTOMER_NAME;
        updateSession(sessionKey, { state: STATES.AWAIT_CUSTOMER_EMAIL, customerName: input });
        return MSG.ASK_CUSTOMER_EMAIL;
      }

      case STATES.AWAIT_CUSTOMER_EMAIL: {
        if (!input) return MSG.ASK_CUSTOMER_EMAIL;
        const emailError = validateEmail(input);
        if (emailError) return emailError;
        updateSession(sessionKey, { state: STATES.AWAIT_MOBILE, customerEmail: input });
        return MSG.ASK_MOBILE;
      }

      case STATES.AWAIT_MOBILE: {
        if (!input) return MSG.ASK_MOBILE;
        const mobileError = validateMobile(input);
        if (mobileError) return mobileError;
        updateSession(sessionKey, { state: STATES.AWAIT_DESC, numeroMovil: input });
        return withCancel(MSG.ASK_DESC);
      }

      case STATES.AWAIT_DESC: {
        if (session.invoiceFlow) {
          if (!input) return MSG.ASK_INVOICE;
          updateSession(sessionKey, { state: STATES.AWAIT_CONFIRM, description: input });
          return withButtons(MSG.CONFIRM_TICKET_INVOICE(session.subcategoryName, session.sku, input), [BTN_CONFIRM, BTN_MODIFY, BTN_CANCEL]);
        }
        if (!input) return withCancel(MSG.ASK_DESC);
        const { serviceName, subcategoryName, sku, customerName, customerEmail, numeroMovil } = session;
        updateSession(sessionKey, { state: STATES.AWAIT_CONFIRM, description: input });
        return withButtons(MSG.CONFIRM_TICKET(serviceName, subcategoryName, sku, customerName, customerEmail, numeroMovil, input), [BTN_CONFIRM, BTN_MODIFY, BTN_CANCEL]);
      }

      case STATES.AWAIT_CONFIRM: {
        if (['1', 'si', 'sí', 'yes'].includes(input.toLowerCase())) {
          const { person, serviceId, subcategoryId, customerName, customerEmail, numeroMovil, description, sku, invoiceFlow, subcategoryName } = session;
          const title = invoiceFlow ? subcategoryName : `${customerName} | ${customerEmail}`;
          const ticket = await createUserRequest(person, serviceId, subcategoryId, title, description, null, sku, invoiceFlow ? null : numeroMovil);
          updateSession(sessionKey, { state: STATES.AWAIT_ATTACHMENT, ticketId: ticket.id, ticketRef: ticket.ref });
          return MSG.ASK_ATTACHMENT(ticket.ref);
        }
        if (['2', 'no'].includes(input.toLowerCase())) {
          updateSession(sessionKey, { state: STATES.EDIT_FIELD_SELECT });
          return MSG.ASK_FIELD_TO_EDIT(session);
        }
        return MSG.INVALID_CONFIRM;
      }

      case STATES.EDIT_FIELD_SELECT: {
        const meta = EDITABLE_FIELDS[input];
        if (!meta) return MSG.ASK_FIELD_TO_EDIT(session);
        updateSession(sessionKey, { state: STATES.EDIT_FIELD_VALUE, editingField: meta.field });
        if (meta.field === 'description' && session.invoiceFlow) return MSG.ASK_INVOICE;
        return meta.ask();
      }

      case STATES.EDIT_FIELD_VALUE: {
        const field = session.editingField;
        // SKU es opcional: permite omitir para dejarlo vacío.
        if (field === 'sku') {
          const skuValue = ['omitir', 'skip', 'no'].includes(input.toLowerCase()) ? null : input || null;
          updateSession(sessionKey, { sku: skuValue });
        } else {
          if (!input) {
            // Re-pedir el mismo campo si llega vacío.
            if (field === 'description' && session.invoiceFlow) return MSG.ASK_INVOICE;
            const entry = Object.values(EDITABLE_FIELDS).find((m) => m.field === field);
            return entry ? entry.ask() : MSG.ASK_FIELD_TO_EDIT(session);
          }
          if (field === 'numeroMovil') {
            const mobileError = validateMobile(input);
            if (mobileError) return mobileError;
          }
          if (field === 'customerEmail') {
            const emailError = validateEmail(input);
            if (emailError) return emailError;
          }
          updateSession(sessionKey, { [field]: input });
        }
        // Volver a la confirmación con los datos actualizados.
        const s = getSession(sessionKey);
        updateSession(sessionKey, { state: STATES.AWAIT_CONFIRM, editingField: null });
        const confirmMsg = s.invoiceFlow
          ? MSG.CONFIRM_TICKET_INVOICE(s.subcategoryName, s.sku, s.description)
          : MSG.CONFIRM_TICKET(s.serviceName, s.subcategoryName, s.sku, s.customerName, s.customerEmail, s.numeroMovil, s.description);
        return withButtons(confirmMsg, [BTN_CONFIRM, BTN_MODIFY, BTN_CANCEL]);
      }

      case STATES.AWAIT_ATTACHMENT: {
        const { ticketId, ticketRef } = session;
        if (['no', 'omitir', 'saltar', 'skip'].includes(input.toLowerCase())) {
          return buildMainMenu(sessionKey, `✅ Ticket *${ticketRef}* listo. Un agente se pondrá en contacto a la brevedad.\n\n¿Qué querés hacer ahora?`);
        }
        if (attachment) {
          try {
            await attachToTicket(ticketId, attachment.filename, attachment.data, attachment.mimetype);
            return MSG.ASK_ANOTHER_ATTACHMENT(ticketRef);
          } catch (err) {
            console.error(`[flow] Error adjuntando archivo al ticket ${ticketRef}:`, err.message);
            return buildMainMenu(sessionKey, `⚠️ No se pudo adjuntar el archivo, pero el ticket *${ticketRef}* fue creado.\n\n¿Qué querés hacer ahora?`);
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
