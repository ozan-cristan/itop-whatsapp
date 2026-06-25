#!/usr/bin/env node
/**
 * Diagnóstico de credenciales de Meta WhatsApp Cloud API.
 *
 * Uso (en el servidor del cliente, en la carpeta del bot):
 *   node diagnose.js
 *
 * Valida el .env contra la Graph API SIN exponer los secretos:
 *  - que las variables existan y no tengan comillas/espacios pegados,
 *  - que WHATSAPP_TOKEN + PHONE_NUMBER_ID sean válidos y correspondan al mismo número,
 *  - muestra el número real asociado (display_phone_number) y su estado.
 * No envía mensajes ni modifica nada.
 */
require('dotenv').config();

const GRAPH = 'https://graph.facebook.com/v22.0';
const ok   = (s) => console.log('  \x1b[32m✓\x1b[0m ' + s);
const bad  = (s) => console.log('  \x1b[31m✗\x1b[0m ' + s);
const warn = (s) => console.log('  \x1b[33m!\x1b[0m ' + s);
const mask = (v) => (!v ? '(vacío)' : v.length <= 8 ? '****' : v.slice(0, 4) + '…' + v.slice(-4));

function checkRaw(name, val) {
  if (val === undefined || val === '') { bad(`${name} está vacío o no existe en .env`); return false; }
  let issue = false;
  if (/^["'].*["']$/.test(val)) { warn(`${name} tiene comillas alrededor del valor — sacalas (dotenv no las necesita)`); issue = true; }
  if (val !== val.trim())        { warn(`${name} tiene espacios al inicio/fin — limpialos`); issue = true; }
  if (/\s/.test(val.trim()) && name !== 'VERIFY_TOKEN') { warn(`${name} contiene un espacio en el medio — probablemente esté mal pegado`); issue = true; }
  if (!issue) ok(`${name} presente (${mask(val)})`);
  return true;
}

(async () => {
  console.log('\n=== Diagnóstico Meta WhatsApp Cloud API ===\n');

  const TOKEN = process.env.WHATSAPP_TOKEN;
  const PNID  = process.env.PHONE_NUMBER_ID;
  const VTOK  = process.env.VERIFY_TOKEN;
  const PORT  = process.env.PORT || 3000;

  console.log('1) Variables en .env:');
  const hasToken = checkRaw('WHATSAPP_TOKEN', TOKEN);
  const hasPnid  = checkRaw('PHONE_NUMBER_ID', PNID);
  checkRaw('VERIFY_TOKEN', VTOK);

  if (hasPnid && !/^\d+$/.test((PNID || '').trim())) {
    bad(`PHONE_NUMBER_ID="${PNID}" NO es numérico. Debe ser el «Phone Number ID» (un número largo de`);
    console.log('     WhatsApp → API Setup), NO el número de teléfono ni el WhatsApp Business Account ID.');
  }

  if (!hasToken || !hasPnid) {
    console.log('\nFaltan credenciales mínimas. Completá el .env y volvé a correr.\n');
    process.exit(1);
  }

  // 2) Validar token + phone number id juntos contra la Graph API
  console.log('\n2) Validación contra la Graph API (token + número):');
  const fields = 'display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,name_status';
  try {
    const url = `${GRAPH}/${PNID.trim()}?fields=${fields}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN.trim()}` } });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      ok('Token y PHONE_NUMBER_ID válidos y correspondientes al mismo número.');
      console.log(`     Número asociado : ${data.display_phone_number}  (${data.verified_name || 's/nombre'})`);
      console.log(`     Verificación    : ${data.code_verification_status}`);
      console.log(`     Calidad         : ${data.quality_rating || 'n/d'}   Plataforma: ${data.platform_type || 'n/d'}`);
      console.log('     → Confirmá con el cliente que ESE es el número que esperaban asociar.');
    } else {
      const e = data.error || {};
      bad(`La Graph API devolvió error (HTTP ${res.status}).`);
      console.log(`     code=${e.code} subcode=${e.error_subcode || '-'} type=${e.type}`);
      console.log(`     message: ${e.message}`);
      console.log('     Interpretación:');
      if (e.code === 190) {
        console.log('       → TOKEN inválido o EXPIRADO. Si es el token temporal de «API Setup» dura 24 h:');
        console.log('         generá un token PERMANENTE (System User) con permiso whatsapp_business_messaging.');
      } else if (e.code === 100 || /does not exist|Unsupported|nonexisting field|Object with ID/i.test(e.message || '')) {
        console.log('       → PHONE_NUMBER_ID incorrecto, O el token pertenece a OTRA app que no tiene acceso a');
        console.log('         ese número. Verificá que el token y el Phone Number ID sean de la MISMA app/WABA.');
      } else if (e.code === 10 || e.code === 200 || /permission/i.test(e.message || '')) {
        console.log('       → El token no tiene el permiso whatsapp_business_messaging, o el usuario/app no tiene');
        console.log('         rol sobre la WABA. Revisá permisos del System User y asignación de assets.');
      } else {
        console.log('       → Revisá el mensaje de arriba; copialo tal cual para analizarlo.');
      }
    }
  } catch (err) {
    bad('No se pudo contactar la Graph API: ' + err.message);
    console.log('     (¿el servidor tiene salida a internet / DNS hacia graph.facebook.com?)');
  }

  // 3) Recordatorio del webhook (no se puede validar desde acá sin la URL pública)
  console.log('\n3) Webhook (esto se valida en Meta, no con este script):');
  console.log(`   - En Meta → WhatsApp → Configuration → Webhook, la "Callback URL" debe ser:`);
  console.log(`       https://TU-DOMINIO/webhook   (HTTPS, público, terminando en /webhook)`);
  console.log(`   - El "Verify token" que escribís en Meta debe ser EXACTAMENTE igual a VERIFY_TOKEN del .env.`);
  console.log(`   - Suscribir el campo  messages  (Webhook fields → messages).`);
  console.log(`   - Probar la verificación localmente (debe devolver "test123"):`);
  console.log(`       curl "http://localhost:${PORT}/webhook?hub.mode=subscribe&hub.verify_token=${VTOK || '<VERIFY_TOKEN>'}&hub.challenge=test123"`);

  console.log('\n=== Fin del diagnóstico ===\n');
})();
