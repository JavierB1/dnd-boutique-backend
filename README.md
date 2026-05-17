# 🌸 DND Boutique — Backend WhatsApp + IA

Backend para el CRM de DND Boutique. Conecta WhatsApp Business con Claude AI para atender clientes automáticamente.

---

## 🚀 Despliegue en Railway (paso a paso)

### 1. Subir a GitHub
1. Crea un repositorio nuevo en GitHub llamado `dnd-boutique-backend`
2. Sube todos estos archivos

### 2. Crear proyecto en Railway
1. Ve a [railway.app](https://railway.app) y crea cuenta con GitHub
2. Haz clic en **"New Project" → "Deploy from GitHub repo"**
3. Selecciona `dnd-boutique-backend`
4. Railway detecta Node.js automáticamente ✅

### 3. Configurar variables de entorno en Railway
En tu proyecto de Railway → **Variables**, agrega:

| Variable | Valor |
|---|---|
| `WHATSAPP_TOKEN` | Tu token permanente de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | `1005186782689308` |
| `WHATSAPP_VERIFY_TOKEN` | `dndtoken2026` |
| `WHATSAPP_APP_ID` | `1302534461971101` |
| `ANTHROPIC_API_KEY` | Tu API key de Claude |

### 4. Obtener tu URL de Railway
Después del deploy, Railway te da una URL como:
`https://dnd-boutique-backend-production.up.railway.app`

### 5. Configurar Webhook en Meta
1. Ve a Meta for Developers → Tu app → WhatsApp → Configuración
2. En **Webhook**, haz clic en **"Editar"**
3. URL: `https://TU-URL.railway.app/webhook`
4. Verify Token: `dndtoken2026`
5. Suscríbete a: `messages`

---

## 📁 Estructura del proyecto

```
dnd-backend/
├── src/
│   ├── index.js      # Servidor principal y webhook
│   ├── chatbot.js    # Lógica de IA con Claude
│   ├── whatsapp.js   # Funciones para enviar mensajes
│   └── catalogo.js   # Tus combos (actualizar aquí)
├── .env.example      # Plantilla de variables (no subir .env real)
├── .gitignore
└── package.json
```

---

## 🤖 ¿Cómo funciona el bot?

1. Cliente envía mensaje a tu WhatsApp
2. Meta llama a tu webhook (`/webhook`)
3. El backend procesa el mensaje con Claude AI
4. Claude responde como asistente de DND Boutique
5. El mensaje llega al cliente en segundos

## 👤 Modo humano

Si un cliente escribe "quiero hablar con una persona", el bot se pausa automáticamente y tú puedes responder manualmente.

Para reactivar el bot desde el CRM, usa la opción **"Activar bot"** en la conversación.

---

## 🛠️ Actualizar combos

Edita el archivo `src/catalogo.js` y sube los cambios a GitHub. Railway se actualiza automáticamente.
