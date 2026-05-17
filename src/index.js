require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { enviarMensaje, marcarLeido } = require("./whatsapp");
const { procesarMensaje, limpiarHistorial } = require("./chatbot");

const app = express();
const PORT = process.env.PORT || 3000;

// Números en modo "humano" (bot desactivado temporalmente)
const modoHumano = new Set();

app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "✅ DND Boutique Backend corriendo",
    timestamp: new Date().toISOString(),
  });
});

// ─── WEBHOOK VERIFICACIÓN (Meta lo llama 1 vez al configurar) ─
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Token de verificación incorrecto");
    res.sendStatus(403);
  }
});

// ─── WEBHOOK MENSAJES ENTRANTES ────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Responder inmediatamente a Meta (evita timeouts)
  res.sendStatus(200);

  const body = req.body;

  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      for (const message of value.messages) {
        // Solo procesamos mensajes de texto por ahora
        if (message.type !== "text") continue;

        const telefono = message.from;
        const texto = message.text.body;
        const messageId = message.id;

        console.log(`📩 Mensaje de ${telefono}: ${texto}`);

        // Marcar como leído
        await marcarLeido(messageId);

        // Si está en modo humano, no responde el bot
        if (modoHumano.has(telefono)) {
          console.log(`👤 ${telefono} en modo humano, bot pausado`);
          continue;
        }

        // Detectar si el cliente quiere hablar con persona
        const quiereHumano = /persona|humano|encargad|dueñ|hablar con/i.test(texto);
        if (quiereHumano) {
          modoHumano.add(telefono);
          await enviarMensaje(
            telefono,
            "Claro, en un momento te atiende nuestra encargada 🙏 Por favor espera unos minutos."
          );
          console.log(`🔔 ALERTA: ${telefono} solicita atención humana`);
          continue;
        }

        // Procesar con IA y responder
        const respuesta = await procesarMensaje(telefono, texto);
        await enviarMensaje(telefono, respuesta);
      }
    }
  }
});

// ─── API PARA EL CRM ───────────────────────────────────────────

// Enviar mensaje manual desde el CRM
app.post("/api/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) {
    return res.status(400).json({ error: "Faltan campos: telefono, mensaje" });
  }
  await enviarMensaje(telefono, mensaje);
  res.json({ ok: true, mensaje: "Mensaje enviado" });
});

// Activar/desactivar bot para un número
app.post("/api/modo", (req, res) => {
  const { telefono, humano } = req.body;
  if (!telefono) return res.status(400).json({ error: "Falta telefono" });

  if (humano) {
    modoHumano.add(telefono);
    console.log(`👤 Bot DESACTIVADO para ${telefono}`);
  } else {
    modoHumano.delete(telefono);
    limpiarHistorial(telefono);
    console.log(`🤖 Bot ACTIVADO para ${telefono}`);
  }

  res.json({ ok: true, telefono, modo: humano ? "humano" : "bot" });
});

// Ver qué números están en modo humano
app.get("/api/modo", (req, res) => {
  res.json({ modoHumano: [...modoHumano] });
});

// ─── INICIAR SERVIDOR ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 DND Boutique Backend corriendo en puerto ${PORT}`);
  console.log(`📡 Webhook URL: https://TU-DOMINIO.railway.app/webhook`);
});
