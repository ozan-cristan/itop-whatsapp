#!/usr/bin/env node
/**
 * Registra el número en la WhatsApp Cloud API (paso que falta cuando da (#133010) Account not registered).
 * Usa el token del .env vía dotenv (mismo que valida diagnose.js), evitando problemas de copiar/pegar.
 *
 * Uso:  node register.js <PIN_6_DIGITOS>
 *   ej: node register.js 482913
 */
require('dotenv').config();

const GRAPH = 'https://graph.facebook.com/v22.0';
const TOKEN = (process.env.WHATSAPP_TOKEN || '').trim();
const PNID  = (process.env.PHONE_NUMBER_ID || '').trim();
const PIN   = String(process.argv[2] || '').replace(/\D/g, '');

(async () => {
  if (!TOKEN || !PNID) { console.error('Falta WHATSAPP_TOKEN o PHONE_NUMBER_ID en .env'); process.exit(1); }
  if (PIN.length !== 6) { console.error('El PIN debe tener 6 dígitos.  Uso: node register.js 482913'); process.exit(1); }

  console.log(`Registrando el número (PHONE_NUMBER_ID ${PNID}) con PIN ${PIN}…\n`);
  try {
    const res = await fetch(`${GRAPH}/${PNID}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: PIN }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      console.log('\x1b[32m✓ OK: el número quedó REGISTRADO en la Cloud API.\x1b[0m');
      console.log('  Guardá el PIN (' + PIN + '). Ahora probá:  node diagnose.js <tu_numero_real>');
      return;
    }
    const e = data.error || {};
    console.log(`\x1b[31m✗ Error HTTP ${res.status}\x1b[0m: code=${e.code} subcode=${e.error_subcode || '-'}  ${e.message || JSON.stringify(data)}`);
    if (e.code === 190) {
      console.log('  → El token llegó inválido/corrupto. Corré primero  node diagnose.js  (sin argumentos):');
      console.log('     si ESO también falla con 190, el token del .env quedó mal (revisá que no tenga ">" ni esté cortado).');
    } else if (e.code === 200 || e.code === 10 || /permission/i.test(e.message || '')) {
      console.log('  → El token no tiene permiso whatsapp_business_management. Registralo desde el dashboard (WhatsApp → API Setup).');
    } else if (/already|two-step|pin|verification/i.test(e.message || '')) {
      console.log('  → El número ya tiene verificación en dos pasos. Usá el PIN existente, o desactivá la 2FA y reintentá.');
    }
  } catch (err) {
    console.error('No se pudo contactar Meta:', err.message);
  }
})();
