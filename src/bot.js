require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Mutex } = require('async-mutex');
const { handleMessage } = require('./flow');
const { getSession } = require('./state');

const VERIFY_TOKEN    = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT            = process.env.PORT || 3000;

const META_MESSAGES_URL = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
const META_HEADERS = {
  Authorization: `Bearer ${WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
};

// Mutex por usuario: evita que dos mensajes del mismo usuario se procesen en paralelo
const userMutexes = new Map();
function getMutex(key) {
  if (!userMutexes.has(key)) userMutexes.set(key, new Mutex());
  return userMutexes.get(key);
}

const app = express();
app.use(express.json());

// ── Verificación del webhook (Meta llama esto al registrar el webhook) ──────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Verificación exitosa');
    res.status(200).send(challenge);
  } else {
    console.warn('[webhook] Verificación fallida');
    res.sendStatus(403);
  }
});

// ── Recepción de mensajes ────────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  // Responder 200 inmediatamente para que Meta no reintente
  res.sendStatus(200);
  processWebhook(req.body).catch(err =>
    console.error('[webhook] Error no capturado:', err.message)
  );
});

async function processWebhook(body) {
  if (body.object !== 'whatsapp_business_account') return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) return;

  const message = value.messages[0];
  const from    = message.from; // número de teléfono del remitente

  const release = await getMutex(from).acquire();
  try {
    const { text, attachment } = await extractMessage(message, from);

    console.log(`[bot] Mensaje de ${from}: tipo=${message.type} texto="${text}"`);

    const response = await handleMessage(from, text, attachment);
    if (response) await sendMessage(from, response);

  } catch (err) {
    console.error(`[bot] Error procesando mensaje de ${from}:`, err.message);
  } finally {
    release();
  }
}

// ── Extracción de texto y adjuntos del payload de Meta ──────────────────────
async function extractMessage(message, from) {
  let text = '';
  let attachment = null;

  switch (message.type) {
    case 'text':
      text = message.text?.body || '';
      break;

    case 'interactive':
      text = message.interactive?.button_reply?.id
          || message.interactive?.list_reply?.id
          || '';
      break;

    case 'image':
    case 'document':
    case 'audio':
    case 'video': {
      const mediaObj = message[message.type];
      text = mediaObj?.caption || '';

      const session = getSession(from);
      if (session?.state === 'await_attachment') {
        attachment = await downloadMedia(mediaObj, message.type);
      }
      break;
    }

    default:
      console.log(`[bot] Tipo de mensaje ignorado: ${message.type}`);
  }

  return { text, attachment };
}

// ── Descarga de medios desde la API de Meta ──────────────────────────────────
async function downloadMedia(mediaObj, type) {
  try {
    const mediaId  = mediaObj.id;
    const mime     = mediaObj.mime_type || 'application/octet-stream';
    const ext      = mime.split('/')[1]?.split(';')[0] || 'bin';
    const filename = mediaObj.filename || `adjunto.${ext}`;

    // 1. Obtener la URL del archivo
    const { data: mediaInfo } = await axios.get(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );

    // 2. Descargar el binario
    const { data: buffer } = await axios.get(mediaInfo.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      responseType: 'arraybuffer',
    });

    const base64 = Buffer.from(buffer).toString('base64');
    console.log(`[bot] Adjunto descargado: ${filename} (${mime}) ${buffer.byteLength} bytes`);
    return { data: base64, filename, mimetype: mime };

  } catch (err) {
    console.error('[bot] Error descargando adjunto:', err.message);
    return null;
  }
}

// ── Envío de mensajes a través de la API de Meta ─────────────────────────────
async function sendMessage(to, response) {
  try {
    const payload = buildPayload(to, response);
    await axios.post(META_MESSAGES_URL, payload, { headers: META_HEADERS });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[bot] Error enviando mensaje:', detail);
  }
}

function buildPayload(to, response) {
  const base = { messaging_product: 'whatsapp', to };

  // Respuesta de texto simple
  if (typeof response === 'string') {
    return { ...base, type: 'text', text: { body: response, preview_url: false } };
  }

  const { text, buttons, list } = response;

  // Mensaje interactivo tipo lista (selector nativo de WhatsApp)
  if (list) {
    // Meta permite máximo 10 filas en total; si hay más, cae a texto numerado
    const dataRows = list.rows.filter(r => r.id !== 'cancelar');
    const cancelRow = list.rows.find(r => r.id === 'cancelar');
    const allRows = cancelRow ? [...dataRows, cancelRow] : dataRows;

    if (allRows.length > 10) {
      const textFallback = dataRows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
      const suffix = cancelRow ? '\n\n_Escribí *cancelar* para volver al menú._' : '';
      return { ...base, type: 'text', text: { body: `${text}\n\n${textFallback}${suffix}`, preview_url: false } };
    }

    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text },
        action: {
          button: (list.button || 'Ver opciones').slice(0, 20),
          sections: [{
            title: 'Opciones',
            rows: allRows.map(r => {
              const row = { id: r.id, title: r.title.slice(0, 24) };
              if (r.description) row.description = r.description.slice(0, 72);
              return row;
            }),
          }],
        },
      },
    };
  }

  // Sin botones o demasiados: texto plano (con opciones anexadas si las hay)
  if (!buttons?.length || buttons.length > 3) {
    const suffix = buttons?.length > 3
      ? '\n\n' + buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n')
      : '';
    return { ...base, type: 'text', text: { body: text + suffix, preview_url: false } };
  }

  // Mensaje interactivo con botones (1–3, Meta limita títulos a 20 chars)
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: {
            id:    b.id,
            title: b.label.slice(0, 20),
          },
        })),
      },
    },
  };
}

app.listen(PORT, () => {
  console.log(`[bot] Servidor escuchando en puerto ${PORT}`);
  console.log(`[bot] Registrá el webhook en Meta Developers → POST /webhook`);
});
