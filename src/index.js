require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { enviarMensaje, marcarLeido } = require("./whatsapp");

const app = express();
const PORT = process.env.PORT || 3000;

const modoHumano = new Set();
const conversaciones = {};

app.use(cors());
app.use(express.json());

const ahora = () => new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });

const guardarMensaje = (telefono, from, texto, nombre = "") => {
  if (!conversaciones[telefono]) {
    conversaciones[telefono] = { nombre: nombre || telefono, mensajes: [] };
  }
  if (nombre) conversaciones[telefono].nombre = nombre;
  conversaciones[telefono].mensajes.push({ id: Date.now().toString(), from, texto, tiempo: ahora() });
  if (conversaciones[telefono].mensajes.length > 100) {
    conversaciones[telefono].mensajes = conversaciones[telefono].mensajes.slice(-100);
  }
};

app.get("/", (req, res) => {
  res.json({ status: "✅ DND Boutique Backend corriendo", timestamp: new Date().toISOString() });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== "whatsapp_business_account") return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      for (const message of value.messages) {
        if (message.type !== "text") continue;
        const telefono = message.from;
        const texto = message.text.body;
        const nombre = value.contacts?.[0]?.profile?.name || telefono;
        console.log(`📩 [WhatsApp] ${nombre} (${telefono}): ${texto}`);
        guardarMensaje(telefono, "client", texto, nombre);
        await marcarLeido(message.id);
        if (modoHumano.has(telefono)) continue;
        if (/persona|humano|encargad|dueñ|hablar con/i.test(texto)) {
          modoHumano.add(telefono);
          const msg = "Claro, en un momento te atiende nuestra encargada 🙏 Por favor espera unos minutos.";
          guardarMensaje(telefono, "bot", msg);
          await enviarMensaje(telefono, msg);
        }
      }
    }
  }
});

// N8N notifica mensajes entrantes
app.post("/api/mensaje-entrante", (req, res) => {
  const { from, nombre, texto } = req.body;
  if (!from || !texto) return res.status(400).json({ error: "Faltan campos" });
  guardarMensaje(from, "client", texto, nombre);
  console.log(`📩 [N8N] ${nombre||from}: ${texto}`);
  res.json({ ok: true });
});

// N8N notifica respuesta del bot
app.post("/api/mensaje-bot", (req, res) => {
  const { telefono, texto } = req.body;
  if (!telefono || !texto) return res.status(400).json({ error: "Faltan campos" });
  guardarMensaje(telefono, "bot", texto);
  console.log(`🤖 [Bot] ${telefono}: ${texto}`);
  res.json({ ok: true });
});

// CRM obtiene conversaciones
app.get("/api/conversaciones", (req, res) => {
  res.json({ conversaciones });
});

// CRM envía mensaje manual
app.post("/api/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ error: "Faltan campos" });
  await enviarMensaje(telefono, mensaje);
  guardarMensaje(telefono, "user", mensaje);
  console.log(`📤 [CRM] ${telefono}: ${mensaje}`);
  res.json({ ok: true });
});

// Modo bot/humano
app.post("/api/modo", (req, res) => {
  const { telefono, humano } = req.body;
  if (!telefono) return res.status(400).json({ error: "Falta telefono" });
  if (humano) { modoHumano.add(telefono); } else { modoHumano.delete(telefono); }
  res.json({ ok: true, telefono, modo: humano ? "humano" : "bot" });
});

app.get("/api/modo", (req, res) => {
  res.json({ modoHumano: [...modoHumano] });
});

app.listen(PORT, () => {
  console.log(`🚀 DND Boutique Backend corriendo en puerto ${PORT}`);
});
