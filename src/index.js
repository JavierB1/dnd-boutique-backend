require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { enviarMensaje, marcarLeido } = require("./whatsapp");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── FIREBASE ADMIN ───────────────────────────────────────────
const firebaseApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(firebaseApp);

app.use(cors());
app.use(express.json());

const ahora = () => new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });

// ─── GUARDAR MENSAJE EN FIREBASE ──────────────────────────────
const guardarMensaje = async (telefono, from, texto, nombre = "") => {
  try {
    const ref = db.collection("conversaciones").doc(telefono);
    const doc = await ref.get();
    const mensajes = doc.exists ? (doc.data().mensajes || []) : [];
    
    const nuevoMensaje = { from, texto, tiempo: ahora() };
    mensajes.push(nuevoMensaje);
    
    // Limitar a 100 mensajes
    const mensajesLimitados = mensajes.slice(-100);
    
    await ref.set({
      nombre: nombre || (doc.exists ? doc.data().nombre : telefono) || telefono,
      mensajes: mensajesLimitados,
      ultimoMsg: texto,
      ultimoTiempo: ahora(),
      botActivo: doc.exists ? (doc.data().botActivo !== undefined ? doc.data().botActivo : true) : true,
      sinLeer: from === "client" ? (doc.exists ? (doc.data().sinLeer || 0) + 1 : 1) : 0,
    }, { merge: true });
  } catch (error) {
    console.error("❌ Error guardando en Firebase:", error.message);
  }
};

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "✅ DND Boutique Backend corriendo", timestamp: new Date().toISOString() });
});

// ─── WEBHOOK META ─────────────────────────────────────────────
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
        console.log(`📩 [WhatsApp] ${nombre}: ${texto}`);
        await guardarMensaje(telefono, "client", texto, nombre);
        await marcarLeido(message.id);
      }
    }
  }
});

// ─── N8N notifica mensaje entrante ────────────────────────────
app.post("/api/mensaje-entrante", async (req, res) => {
  const { from, nombre, texto } = req.body;
  if (!from || !texto) return res.status(400).json({ error: "Faltan campos" });
  await guardarMensaje(from, "client", texto, nombre);
  console.log(`📩 [N8N] ${nombre||from}: ${texto}`);
  res.json({ ok: true });
});

// ─── N8N notifica respuesta del bot ───────────────────────────
app.post("/api/mensaje-bot", async (req, res) => {
  const { telefono, texto } = req.body;
  if (!telefono || !texto) return res.status(400).json({ error: "Faltan campos" });
  await guardarMensaje(telefono, "bot", texto);
  console.log(`🤖 [Bot] ${telefono}: ${texto}`);
  res.json({ ok: true });
});

// ─── CRM envía mensaje manual ─────────────────────────────────
app.post("/api/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ error: "Faltan campos" });
  await enviarMensaje(telefono, mensaje);
  await guardarMensaje(telefono, "user", mensaje);
  console.log(`📤 [CRM] ${telefono}: ${mensaje}`);
  res.json({ ok: true });
});

// ─── Modo bot/humano ──────────────────────────────────────────
app.post("/api/modo", async (req, res) => {
  const { telefono, humano } = req.body;
  if (!telefono) return res.status(400).json({ error: "Falta telefono" });
  await db.collection("conversaciones").doc(telefono).set({ botActivo: !humano }, { merge: true });
  res.json({ ok: true, telefono, modo: humano ? "humano" : "bot" });
});

app.listen(PORT, () => {
  console.log(`🚀 DND Boutique Backend corriendo en puerto ${PORT}`);
});
