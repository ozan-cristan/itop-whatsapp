require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ProxyAgent, setGlobalDispatcher } = require('undici');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { handleMessage } = require('./flow');
const { getSession } = require('./state');
const { Mutex } = require('async-mutex');

//const SESSION_DIR = path.join(__dirname, '../../sessions/itop-bot');
const SESSION_DIR = path.join(__dirname, '../sessions/itop-bot');
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || '';

// Aplicar proxy globalmente al fetch nativo (usado por Baileys para bajar media)
if (PROXY_URL) {
  setGlobalDispatcher(new ProxyAgent(PROXY_URL));
}

const FILE_TYPES = new Set(['image', 'document', 'audio', 'video', 'ptt', 'audioMessage']);

// Mutex por usuario: evita que dos mensajes del mismo usuario se procesen en paralelo
const userMutexes = new Map();
function getMutex(key) {
  if (!userMutexes.has(key)) userMutexes.set(key, new Mutex());
  return userMutexes.get(key);
}

// Store propio: lid → número real
const lidToPhone = new Map();

// Promesas pendientes esperando resolución de un LID
const lidResolvers = new Map(); // lid → [(phone) => void]

const CONTACTS_FILE = path.join(SESSION_DIR, 'contacts.json');

function loadContactsFromDisk() {
  try {
    if (!fs.existsSync(CONTACTS_FILE)) {
      console.log('[store] contacts.json no encontrado, se poblará con eventos.');
      return;
    }
    const saved = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
    let count = 0;
    for (const [lid, phone] of Object.entries(saved)) {
      lidToPhone.set(lid, phone);
      count++;
    }
    console.log(`[store] ${count} LIDs cargados desde contacts.json.`);
  } catch (err) {
    console.log('[store] Error leyendo contacts.json:', err.message);
  }
}

let saveContactsTimer = null;
function saveContactsToDisk() {
  // Debounce: evitar escrituras múltiples seguidas
  clearTimeout(saveContactsTimer);
  saveContactsTimer = setTimeout(() => {
    try {
      const obj = Object.fromEntries(lidToPhone);
      fs.writeFileSync(CONTACTS_FILE, JSON.stringify(obj));
      console.log(`[store] contacts.json guardado (${lidToPhone.size} entradas).`);
    } catch (err) {
      console.log('[store] Error guardando contacts.json:', err.message);
    }
  }, 2000);
}

function upsertContact(contact) {
  const lid = contact.lid;
  const phoneJid = contact.id;
  if (lid && phoneJid?.endsWith('@s.whatsapp.net')) {
    const phone = phoneJid.replace('@s.whatsapp.net', '');
    const isNew = !lidToPhone.has(lid);
    lidToPhone.set(lid, phone);
    if (isNew) {
      console.log(`[store] LID mapeado: ${lid} → ${phone}`);
      saveContactsToDisk();
    }

    const resolvers = lidResolvers.get(lid);
    if (resolvers) {
      lidResolvers.delete(lid);
      for (const fn of resolvers) fn(phone);
    }
  }
}

function resolveLidAsync(lid, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const list = lidResolvers.get(lid);
      if (list) {
        const filtered = list.filter(fn => fn !== resolver);
        if (filtered.length === 0) lidResolvers.delete(lid);
        else lidResolvers.set(lid, filtered);
      }
      resolve(null);
    }, timeoutMs);

    const resolver = (phone) => {
      clearTimeout(timer);
      resolve(phone);
    };

    if (!lidResolvers.has(lid)) lidResolvers.set(lid, []);
    lidResolvers.get(lid).push(resolver);
  });
}

async function startBot() {
  // Asegurar que el directorio de sesión existe
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  console.log(`[bot] Directorio de sesión: ${SESSION_DIR}`);

  loadContactsFromDisk();

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const version = [2, 3000, 1039097315];

  const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;
  if (proxyAgent) console.log(`[bot] Usando proxy: ${PROXY_URL}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['iTop Bot', 'Chrome', '1.0.0'],
    getMessage: async () => ({ conversation: '' }),
    fetchAgent: proxyAgent,
    agent: proxyAgent,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('contacts.upsert', (contacts) => {
    console.log(`[store:upsert] ${contacts.length} contactos. Muestra:`, JSON.stringify(contacts.slice(0, 3)));
    for (const contact of contacts) upsertContact(contact);
    console.log(`[store] lidToPhone size: ${lidToPhone.size}`);
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const update of updates) upsertContact(update);
  });

  sock.ev.on('messaging-history.set', ({ contacts }) => {
    if (!contacts?.length) return;
    console.log(`[history] ${contacts.length} contactos en history. Muestra:`, JSON.stringify(contacts.slice(0, 3)));
    for (const contact of contacts) upsertContact(contact);
    console.log(`[store] lidToPhone size tras history: ${lidToPhone.size}`);
  });

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n=== Escaneá este QR con WhatsApp ===\n');
      qrcode.generate(qr, { small: true });
      const qrPath = '/tmp/wa-qr.html';
      QRCode.toDataURL(qr, { width: 400, margin: 2 }, (err, url) => {
        if (!err) {
          fs.writeFileSync(qrPath, `<html><body style="background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><img src="${url}" style="width:400px;height:400px"></body></html>`);
          console.log(`\n>>> QR también guardado en: ${qrPath}`);
          console.log('>>> Abrilo en el navegador con: xdg-open /tmp/wa-qr.html\n');
        }
      });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[bot] Conexión cerrada. Código: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.error('[bot] Sesión cerrada remotamente. Borrá sessions/itop-bot y reiniciá.');
        process.exit(1);
      } else {
        console.log('[bot] Reconectando...');
        startBot();
      }
    }

    if (connection === 'open') {
      console.log('[bot] Conectado. Esperando mensajes...');
      // Intentar poblar lidToPhone desde sock.contacts (disponible tras la sesión)
      setTimeout(() => {
        const entries = Object.entries(sock.contacts || {});
        console.log(`[sock.contacts] ${entries.length} contactos disponibles`);
        for (const [cjid, contact] of entries) {
          upsertContact({ ...contact, id: cjid });
        }
        console.log(`[store] lidToPhone size tras sock.contacts: ${lidToPhone.size}`);
      }, 2000);
    }
  });

  const START_TIME = Date.now();
  console.log(`[bot] START_TIME: ${new Date(START_TIME).toISOString()}`);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[raw] messages.upsert type="${type}" count=${messages.length}`);
    if (type !== 'notify') return;

    for (const message of messages) {
      try {
        const jid = message.key.remoteJid;
        const ts = message.messageTimestamp;
        console.log(`[raw:msg] fromMe=${message.key.fromMe} jid=${jid} ts=${ts}`);

        if (message.key.fromMe) continue;
        if (jid === 'status@broadcast') continue;
        if (jid.endsWith('@g.us')) continue;

        const msgTime = (ts || 0) * 1000;
        if (msgTime < START_TIME) {
          console.log(`[filter:timestamp] ${jid} ts=${ts} → descartado`);
          continue;
        }

        const msgContent = message.message || {};
        const msgType = detectMessageType(msgContent);
        console.log(`[raw:content] type=${msgType} keys=${Object.keys(msgContent).join(',')}`);
        if (msgType === 'unknown') {
          console.log(`[filter:unknown] ${jid} keys=${Object.keys(msgContent).join(',')} → descartado`);
          continue;
        }

        const text = msgContent.conversation
          || msgContent.extendedTextMessage?.text
          || msgContent.buttonsResponseMessage?.selectedButtonId
          || msgContent.imageMessage?.caption
          || msgContent.documentMessage?.caption
          || '';

        // Usar número de teléfono si está disponible, o el JID directo como clave
        const sessionKey = resolvePhone(jid, sock.contacts) || jid;

        // Serializar mensajes del mismo usuario para evitar race conditions
        const release = await getMutex(sessionKey).acquire();
        let response;
        try {
          console.log(`[bot] Mensaje de ${sessionKey}: tipo=${msgType} texto="${text}"`);

          let attachment = null;
          const session = getSession(sessionKey);
          console.log(`[debug] session.state=${session?.state} msgType=${msgType}`);

          if (session?.state === 'await_attachment' && FILE_TYPES.has(msgType)) {
            attachment = await extractAttachment(message, msgContent, msgType, sock);
          }

          response = await handleMessage(sessionKey, text, attachment);
        } finally {
          release();
        }
        if (response) {
          if (typeof response === 'object' && response.buttons) {
            await sock.sendMessage(message.key.remoteJid, {
              text: response.text,
              buttons: response.buttons.map(b => ({
                buttonId: b.id,
                buttonText: { displayText: b.label },
                type: 1,
              })),
              headerType: 1,
            });
          } else {
            await sock.sendMessage(message.key.remoteJid, { text: typeof response === 'string' ? response : response.text });
          }
        }

      } catch (err) {
        console.error(`[bot] Error procesando mensaje:`, err.message);
      }
    }
  });
}

function resolvePhone(jid, sockContacts) {
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }
  if (jid.endsWith('@lid')) {
    if (lidToPhone.has(jid)) return lidToPhone.get(jid);
    // Buscar en sock.contacts: la entrada del LID puede tener el JID telefónico como clave
    if (sockContacts) {
      for (const [cjid, contact] of Object.entries(sockContacts)) {
        if (cjid.endsWith('@s.whatsapp.net') && contact.lid === jid) {
          const phone = cjid.replace('@s.whatsapp.net', '');
          lidToPhone.set(jid, phone);
          console.log(`[store] LID resuelto via sock.contacts: ${jid} → ${phone}`);
          return phone;
        }
      }
    }
    return null;
  }
  return null;
}

function detectMessageType(msgContent) {
  if (msgContent.conversation || msgContent.extendedTextMessage || msgContent.buttonsResponseMessage) return 'text';
  if (msgContent.imageMessage) return 'image';
  if (msgContent.documentMessage) return 'document';
  if (msgContent.audioMessage) return 'audioMessage';
  if (msgContent.videoMessage) return 'video';
  if (msgContent.pttMessage) return 'ptt';
  return 'unknown';
}

async function extractAttachment(message, msgContent, msgType, sock) {
  try {
    const mediaMsg = msgContent.imageMessage
      || msgContent.documentMessage
      || msgContent.audioMessage
      || msgContent.videoMessage
      || msgContent.pttMessage;

    if (!mediaMsg) return null;

    const mimetype = mediaMsg.mimetype || 'application/octet-stream';
    const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin';
    const filename = msgContent.documentMessage?.fileName || `adjunto.${ext}`;

    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );

    if (!buffer) return null;

    const base64 = buffer.toString('base64');
    console.log(`[bot] Adjunto descargado: ${filename} (${mimetype}) ${buffer.length} bytes`);

    return { data: base64, filename, mimetype };

  } catch (err) {
    console.error(`[bot] Error descargando adjunto:`, err.message);
    return null;
  }
}

startBot();