const sessions = new Map();
const expiredKeys = new Set();

const STATES = {
  IDLE: 'idle',
  AWAIT_PHONE: 'await_phone',
  MAIN_MENU: 'main_menu',
  FAMILY_SELECT: 'family_select',
  SERVICE_SELECT: 'service_select',
  SUBCAT_SELECT: 'subcat_select',
  AWAIT_TEMPLATE_FIELD: 'await_template_field',
  AWAIT_SKU: 'await_sku',
  AWAIT_CUSTOMER_NAME: 'await_customer_name',
  AWAIT_CUSTOMER_EMAIL: 'await_customer_email',
  AWAIT_MOBILE: 'await_mobile',
  AWAIT_DESC: 'await_desc',
  AWAIT_CONFIRM: 'await_confirm',
  EDIT_FIELD_SELECT: 'edit_field_select',
  EDIT_FIELD_VALUE: 'edit_field_value',
  AWAIT_ATTACHMENT: 'await_attachment',
  TICKET_LIST: 'ticket_list',
  CLOSED_TICKET_LIST: 'closed_ticket_list',
  TICKET_DETAIL_MENU: 'ticket_detail_menu',
  AWAIT_COMMENT: 'await_comment',
};

const SESSION_TTL_MS = 15 * 60 * 1000;

const BASE_SESSION = {
  phone: null,
  person: null,
  families: [],
  familyId: null,
  familyName: null,
  services: [],
  serviceId: null,
  serviceName: null,
  subcategories: [],
  subcategoryId: null,
  subcategoryName: null,
  templateId: null,
  templateFields: [],
  templateFieldIndex: 0,
  templateValues: {},
  tickets: [],
  ticketListType: 'active',
  sku: null,
  customerName: null,
  customerEmail: null,
  numeroMovil: null,
  title: null,
  description: null,
  editingField: null,
  ticketId: null,
  ticketRef: null,
  viewedTicketId: null,
  viewedTicketRef: null,
};

function getSession(key) {
  const session = sessions.get(key);
  if (!session) return null;

  if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
    sessions.delete(key);
    expiredKeys.add(key);
    return null;
  }

  return session;
}

function wasSessionExpired(key) {
  return expiredKeys.has(key);
}

function createPendingSession(key) {
  expiredKeys.delete(key);
  const session = { ...BASE_SESSION, state: STATES.AWAIT_PHONE, lastActivity: Date.now() };
  sessions.set(key, session);
  return session;
}

function createSession(key, person) {
  expiredKeys.delete(key);
  const session = { ...BASE_SESSION, phone: key, person, state: STATES.MAIN_MENU, lastActivity: Date.now() };
  sessions.set(key, session);
  return session;
}

function updateSession(key, updates) {
  const session = sessions.get(key);
  if (!session) return null;
  Object.assign(session, updates, { lastActivity: Date.now() });
  return session;
}

function clearSession(key) {
  sessions.delete(key);
}

// Finaliza la sesión voluntariamente: conserva la persona para re-greeting sin CUIL
function endSession(key) {
  const session = sessions.get(key);
  if (!session?.person) { sessions.delete(key); return; }
  sessions.set(key, {
    ...BASE_SESSION,
    person: session.person,
    phone: session.phone,
    state: STATES.IDLE,
    lastActivity: Date.now(),
  });
}

// ── Respuestas pendientes a notificaciones ────────────────────────────────────
// Cuando el bot notifica al usuario sobre un ticket, guarda el ticket temporalmente
// para que la siguiente respuesta del usuario se agregue como comentario.

const pendingReplies = new Map();
const REPLY_TTL_MS = 30 * 60 * 1000; // 30 minutos

function setPendingReply(phone, ticketId, ref, callerPhone = null) {
  pendingReplies.set(phone, { ticketId, ref, callerPhone, expiresAt: Date.now() + REPLY_TTL_MS });
}

function getPendingReply(phone) {
  const entry = pendingReplies.get(phone);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { pendingReplies.delete(phone); return null; }
  return entry;
}

function clearPendingReply(phone) {
  pendingReplies.delete(phone);
}

module.exports = { STATES, getSession, wasSessionExpired, createSession, createPendingSession, updateSession, clearSession, endSession, setPendingReply, getPendingReply, clearPendingReply };
