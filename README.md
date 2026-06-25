# iTop WhatsApp Bot — Meta API

Bot de WhatsApp para el sistema **iTop ITSM** que permite a los usuarios crear y gestionar tickets de soporte directamente desde WhatsApp, usando la **API oficial de WhatsApp Business de Meta**.

> Implementación con la **API oficial de Meta** (webhook + Graph API): `src/bot.js` (`npm start`). El núcleo conversacional está en `flow.js` / `itop.js` / `state.js`.

---

## Características

- 🎫 Crear tickets (wizard guiado: servicio → subcategoría → SKU → datos del cliente → descripción)
- 📋 Consultar solicitudes activas y resueltas
- 📎 Adjuntar archivos (imágenes, documentos, audio, video)
- 💬 Agregar comentarios a tickets existentes
- 🔔 Notificaciones de iTop → WhatsApp (ticket resuelto / actualización de bitácora, con imágenes) vía `POST /itop-notify`
- ⏱️ Sesiones con TTL de 15 minutos
- 🔘 Botones interactivos de WhatsApp (hasta 3 por mensaje)
- 🇦🇷 Interfaz en español

---

## Requisitos

- Node.js 18+
- Cuenta en **Meta Developers** con app de WhatsApp Business configurada
- Número de teléfono registrado en WhatsApp Business Platform
- Servidor iTop con REST API y Application Token habilitados
- URL pública HTTPS (para producción) o ngrok (para desarrollo)

---

## Instalación

```bash
git clone https://github.com/ozan-cristan/itop-whatsapp.git
cd itop-whatsapp
npm install
```

---

## Configuración

Copiá el archivo de ejemplo y completá los valores:

```bash
cp .env.example .env
```

```env
# Meta WhatsApp Business API
WHATSAPP_TOKEN=tu_token_de_acceso
PHONE_NUMBER_ID=id_del_numero_de_telefono
VERIFY_TOKEN=token_para_verificar_webhook
PORT=3000

# iTop REST API
ITOP_URL=https://tu-itop.ejemplo.com
ITOP_USER=api_user
ITOP_TOKEN=tu_application_token_de_itop

# Secreto para autenticar las notificaciones entrantes de iTop (POST /itop-notify). Vacío = sin validación.
ITOP_WEBHOOK_SECRET=

# URL del documento de políticas de garantía (opción del menú). Vacío = opción no disponible.
GARANTIA_URL=
```

> El listado completo y comentado está en [`.env.example`](.env.example) — copialo con `cp .env.example .env`.

### Obtener las credenciales de Meta

1. Crear app en [Meta Developers](https://developers.facebook.com) → tipo **Business**
2. Agregar producto **WhatsApp**
3. En **WhatsApp → API Setup**: copiar `Phone Number ID` y generar `Access Token` (idealmente **permanente**, vía System User con permiso `whatsapp_business_messaging`)
4. **Registrar el número en la Cloud API**: en *API Setup* registrar el número definiendo un **PIN de verificación en dos pasos** (6 dígitos). Sin este paso, los envíos fallan con `(#133010) Account not registered`.
5. Registrar el webhook con la **URL pública HTTPS** de tu servidor (`https://TU-DOMINIO/webhook`) y el `VERIFY_TOKEN`
6. Suscribirse al campo `messages`

> **Herramientas de diagnóstico** (en la raíz del proyecto):
> - `node diagnose.js` — valida token + número contra la Graph API y muestra el estado (`platform_type`, número asociado, etc.).
> - `node diagnose.js <numero_destino>` — hace además una prueba de envío real (plantilla `hello_world`).
> - `node register.js <PIN_6_DIGITOS>` — registra el número en la Cloud API (paso 4) si falta.

### Parámetros fijos (hardcodeados, no van en `.env`)

Estos valores están fijos en el código; si alguna vez hay que cambiarlos se editan ahí (no hay variable de entorno):

| Parámetro | Valor | Dónde |
|-----------|-------|-------|
| Versión de la Graph API de Meta | `v22.0` | `src/bot.js` (`META_MESSAGES_URL`, `META_MEDIA_URL` y descarga de medios) |
| TTL de la sesión conversacional | 15 min | `src/state.js` → `SESSION_TTL_MS` |
| Ventana para responder una notificación de iTop | 30 min | `src/state.js` → `REPLY_TTL_MS` |
| Límite de tamaño de imagen saliente | 5 MB | `src/bot.js` → `WHATSAPP_MAX_IMAGE_BYTES` |

---

## Uso

### Desarrollo (con ngrok)

```bash
# Terminal 1 — bot
npm start

# Terminal 2 — túnel público
ngrok http 3000
```

Registrar en Meta Developers la URL de ngrok como webhook:
```
https://xxxx.ngrok-free.app/webhook
```

### Producción (Ubuntu Server)

```bash
npm start
# Recomendado: usar PM2 o systemd para mantenerlo corriendo
pm2 start src/bot.js --name itop-bot
```

El servidor debe tener HTTPS habilitado (nginx + certbot recomendado).

---

## Estructura

```
src/
├── bot.js      # Servidor Express — webhook Meta + envío Graph API + /itop-notify
├── flow.js     # Máquina de estados conversacional
├── itop.js     # Cliente REST API de iTop
└── state.js    # Gestión de sesiones en memoria
diagnose.js     # Diagnóstico de credenciales/registro Meta (raíz)
register.js     # Registro del número en la Cloud API (raíz)
```

---

## Arquitectura

```
WhatsApp del usuario
       ↓
  Meta Servers
       ↓  POST /webhook
  Express Server (bot.js)
       ↓
  flow.js  ←→  itop.js
       ↓
  Meta Graph API  →  WhatsApp del usuario
```

---

## Flujo de conversación

```
Usuario escribe → bot pide CUIT → valida en iTop → muestra menú
  • Nueva solicitud  → servicio → subcategoría → SKU → nombre/email/móvil del cliente → descripción → confirmar → adjuntos
  • 📋 Seguimiento (solicitudes activas) → detalle → comentar
  • 📁 Resueltos → detalle
  • 📄 Políticas de garantía
  • 👋 Salir
```
