# iTop WhatsApp Bot — Meta API

Bot de WhatsApp para el sistema **iTop ITSM** que permite a los usuarios crear y gestionar tickets de soporte directamente desde WhatsApp, usando la **API oficial de WhatsApp Business de Meta**.

> Implementación con la **API oficial de Meta** (webhook + Graph API): `src/bot.js` (`npm start`). El núcleo conversacional está en `flow.js` / `itop.js` / `state.js`.

---

## Características

- 🎫 Crear tickets (wizard guiado: servicio → subcategoría → SKU → datos del cliente → descripción)
- 📋 Consultar solicitudes activas y resueltas
- 📎 Adjuntar archivos (imágenes, documentos, audio, video)
- 💬 Agregar comentarios a tickets existentes
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
ITOP_TOKEN=tu_application_token_de_itop
```

### Obtener las credenciales de Meta

1. Crear app en [Meta Developers](https://developers.facebook.com) → tipo **Business**
2. Agregar producto **WhatsApp**
3. En **WhatsApp → API Setup**: copiar `Phone Number ID` y generar `Access Token`
4. Registrar el webhook con la URL de tu servidor y el `VERIFY_TOKEN`
5. Suscribirse al campo `messages`

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
├── bot.js      # Servidor Express — webhook Meta
├── flow.js     # Máquina de estados conversacional
├── itop.js     # Cliente REST API de iTop
└── state.js    # Gestión de sesiones en memoria
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
