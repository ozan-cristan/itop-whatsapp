require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { handleMessage } = require('./flow');
const { getSession } = require('./state');

const SESSION_DIR = '../sessions/itop-bot';

const FILE_TYPES = new Set(['image', 'document', 'audio', 'video', 'ptt', 'audioMessage']);

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['iTop Bot', 'Chrome', '1.0.0'],
    getMessage: async () => ({ conversation: '' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n=== Escaneá este QR con WhatsApp ===\n');
      qrcode.generate(qr, { small: true });
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
    }
  });

  const START_TIME = Date.now();
  console.log(`[bot] START_TIME: ${new Date(START_TIME).toISOString()}`);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      try {
        // Filtros básicos
        if (message.key.fromMe) continue;
        if (message.key.remoteJid === 'status@broadcast') continue;
        if (message.key.remoteJid.endsWith('@g.us')) continue;

        // Filtrar históricos
        const msgTime = (message.messageTimestamp || 0) * 1000;
        if (msgTime < START_TIME) {
          console.log(`[filter:timestamp] ${message.key.remoteJid} → descartado`);
          continue;
        }

        // Extraer número limpio
        const phone = message.key.remoteJid.replace('@s.whatsapp.net', '');

        // Determinar tipo de contenido
        const msgContent = message.message || {};
        const msgType = detectMessageType(msgContent);

        // Extraer texto
        const text = msgContent.conversation
          || msgContent.extendedTextMessage?.text
          || msgContent.imageMessage?.caption
          || msgContent.documentMessage?.caption
          || '';

        console.log(`[bot] Mensaje de ${phone}: tipo=${msgType} texto="${text}"`);

        // Procesar adjunto si corresponde
        let attachment = null;
        const session = getSession(phone);
        console.log(`[debug] session.state=${session?.state} msgType=${msgType}`);

        if (session?.state === 'await_attachment' && FILE_TYPES.has(msgType)) {
          attachment = await extractAttachment(message, msgContent, msgType, sock);
        }

        // Procesar con el flujo conversacional
        const response = await handleMessage(phone, text, attachment);
        if (response) {
          await sock.sendMessage(message.key.remoteJid, { text: response });
        }

      } catch (err) {
        console.error(`[bot] Error procesando mensaje:`, err.message);
      }
    }
  });
}

/**
 * Detecta el tipo de mensaje a partir del contenido.
 */
function detectMessageType(msgContent) {
  if (msgContent.conversation || msgContent.extendedTextMessage) return 'text';
  if (msgContent.imageMessage) return 'image';
  if (msgContent.documentMessage) return 'document';
  if (msgContent.audioMessage) return 'audioMessage';
  if (msgContent.videoMessage) return 'video';
  if (msgContent.pttMessage) return 'ptt';
  return 'unknown';
}

/**
 * Descarga y retorna el adjunto como base64.
 * Retorna { data, filename, mimetype } o null si falla.
 */
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

    // Descargar buffer del media
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
