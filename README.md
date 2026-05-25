# iTop WhatsApp Bot — Baileys

Bot de WhatsApp para el sistema **iTop ITSM** que permite a los usuarios crear y gestionar tickets de soporte directamente desde WhatsApp, usando la librería **Baileys** (WhatsApp Web API no oficial).

> ⚠️ Esta rama usa Baileys, que se conecta a WhatsApp Web mediante QR. Para la versión con la API oficial de Meta, ver la rama [`feature/meta-api`](../../tree/feature/meta-api).

---

## Características

- 🎫 Crear tickets (wizard guiado: familia → servicio → subcategoría → título → descripción)
- 📋 Consultar solicitudes activas y resueltas
- 📎 Adjuntar archivos (imágenes, documentos, audio, video)
- 💬 Agregar comentarios a tickets existentes
- ⏱️ Sesiones con TTL de 15 minutos
- 🌐 Soporte de proxy HTTPS/SOCKS
- 🇦🇷 Interfaz en español

---

## Requisitos

- Node.js 18+
- Cuenta de WhatsApp (para escanear el QR)
- Servidor iTop con REST API habilitada

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
ITOP_URL=https://tu-itop.ejemplo.com
ITOP_USER=usuario_api
ITOP_TOKEN=token_api
ITOP_ORG=1

# Opcional
HTTPS_PROXY=http://proxy:puerto
```

---

## Uso

```bash
npm start
```

Al iniciar, se muestra un QR en la terminal. Escanealo con WhatsApp en tu celular (**Configuración → Dispositivos vinculados → Vincular dispositivo**).

Una vez conectado, el bot responde a mensajes entrantes.

---

## Estructura

```
src/
├── bot.js      # Entrada principal — cliente Baileys
├── flow.js     # Máquina de estados conversacional
├── itop.js     # Cliente REST API de iTop
└── state.js    # Gestión de sesiones en memoria
```

---

## Flujo de conversación

```
Usuario escribe → bot pide CUIL → valida en iTop → muestra menú
  1. Nueva solicitud  → selección de servicio → título → descripción → confirmar → adjuntos
  2. Solicitudes activas → detalle → comentario
  3. Solicitudes resueltas → detalle
  4. Salir
```

---

## Limitaciones

- Usa la API no oficial de WhatsApp (puede dejar de funcionar con actualizaciones de WhatsApp)
- Requiere escanear QR cada vez que se reinicia (o al expirar la sesión)
- Sesiones solo en memoria (se pierden al reiniciar el servidor)
