require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { enviarMensaje, marcarLeido } = require("./whatsapp");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
const PORT = process.env.PORT || 3000;

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

const ahora = () => new Date().toLocaleTimeString("es-SV", { hour:"2-digit", minute:"2-digit" });

// ─── GUARDAR MENSAJE ──────────────────────────────────────────
const guardarMensaje = async (telefono, from, texto, nombre="") => {
  try {
    const ref = db.collection("conversaciones").doc(telefono);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const mensajes = data.mensajes || [];
    mensajes.push({ from, texto, tiempo: ahora() });
    const mensajesLimitados = mensajes.slice(-100);
    await ref.set({
      nombre: nombre || data.nombre || telefono,
      mensajes: mensajesLimitados,
      ultimoMsg: texto,
      ultimoTiempo: ahora(),
      botActivo: data.botActivo !== undefined ? data.botActivo : true,
      sinLeer: from === "client" ? (data.sinLeer || 0) + 1 : (data.sinLeer || 0),
    }, { merge: true });
  } catch (e) {
    console.error("❌ Error guardando:", e.message);
  }
};

// ─── HEALTH ───────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status:"✅ DND Boutique Backend", timestamp:new Date().toISOString() }));

// ─── WEBHOOK META ─────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const { "hub.mode":mode, "hub.verify_token":token, "hub.challenge":challenge } = req.query;
  if (mode==="subscribe" && token===process.env.WHATSAPP_VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
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
        if (message.from_me || message.from === process.env.WHATSAPP_PHONE_NUMBER_ID) {
          await marcarLeido(message.id);
          continue;
        }
        console.log(`📩 [WhatsApp] ${nombre}: ${texto}`);
        await guardarMensaje(telefono, "client", texto, nombre);
        await marcarLeido(message.id);
      }
    }
  }
});

// ─── N8N: guardar mensaje entrante ────────────────────────────
app.post("/api/mensaje-entrante", async (req, res) => {
  const { from, nombre, texto } = req.body;
  if (!from || !texto) return res.status(400).json({ error:"Faltan campos" });
  await guardarMensaje(from, "client", texto.replace(/\n/g," ").replace(/\r/g," "), nombre);
  console.log(`📩 [N8N] ${nombre||from}: ${texto}`);
  res.json({ ok:true });
});

// ─── N8N: respuesta del bot ───────────────────────────────────
app.post("/api/mensaje-bot", async (req, res) => {
  const { telefono, texto } = req.body;
  if (!telefono || !texto) return res.status(400).json({ error:"Faltan campos" });
  await guardarMensaje(telefono, "bot", texto.replace(/\n/g," "));
  console.log(`🤖 [Bot] ${telefono}: ${texto}`);
  res.json({ ok:true });
});

// ─── CRM: enviar mensaje manual ───────────────────────────────
app.post("/api/enviar", async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) {
    console.error("❌ [CRM] Intento de envío fallido: Faltan campos", { telefono, mensaje });
    return res.status(400).json({ error: "Faltan campos" });
  }
  try {
    console.log(`📤 [CRM] Iniciando envío manual a ${telefono}...`);
    const respuestaMeta = await enviarMensaje(telefono, mensaje);
    await guardarMensaje(telefono, "user", mensaje);
    
    // --- AVISO A N8N PARA FILTRADO MANUAL ---
    try {
      await axios.post("https://n8n-production-9ae2.up.railway.app/webhook-test/crm-manual", {
        isManual: true,
        telefono: telefono,
        mensaje: mensaje
      });
      console.log("✅ [CRM] Aviso enviado a n8n correctamente.");
    } catch (n8nError) {
      console.error("⚠️ [CRM] Error al avisar a n8n (no crítico):", n8nError.message);
    }
    // ----------------------------------------

    console.log(`✅ [CRM] Mensaje enviado correctamente a ${telefono}.`);
    res.json({ ok: true, metaResponse: respuestaMeta, isManual: true });
  } catch(e) {
    console.error("❌ [CRM] Error fatal en enviarMensaje:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── N8N: verificar si bot está activo ────────────────────────
app.get("/api/bot-activo/:telefono", async (req, res) => {
  const { telefono } = req.params;
  try {
    const snap = await db.collection("conversaciones").doc(telefono).get();
    if (!snap.exists) return res.json({ botActivo:true });
    const botActivo = snap.data().botActivo !== false;
    res.json({ botActivo });
  } catch(e) {
    res.json({ botActivo:true });
  }
});

// ─── DEBOUNCE ─────────────────────────────────────────────────
app.post("/api/debounce", async (req, res) => {
  const { telefono, timestamp } = req.body;
  if (!telefono || !timestamp) return res.status(400).json({ error:"Faltan campos" });
  await db.collection("debounce").doc(telefono).set({ timestamp, updatedAt:Date.now() });
  res.json({ ok:true, timestamp });
});

app.get("/api/debounce/:telefono/:timestamp", async (req, res) => {
  const { telefono, timestamp } = req.params;
  const snap = await db.collection("debounce").doc(telefono).get();
  if (!snap.exists) return res.json({ esUltimo:false });
  res.json({ esUltimo: snap.data().timestamp === timestamp });
});

// ─── GET combos activos ───────────────────────────────────────
app.get("/api/combos", async (req, res) => {
  try {
    const snapshot = await db.collection("combos").where("activo","==",true).get();
    if (snapshot.empty) {
      const { getCombosActivos } = require("./catalogo");
      return res.json({ combos:getCombosActivos() });
    }
    res.json({ combos: snapshot.docs.map(d => ({ id:d.id, ...d.data() })) });
  } catch(e) {
    const { getCombosActivos } = require("./catalogo");
    res.json({ combos:getCombosActivos() });
  }
});

// ─── Modo bot/humano ──────────────────────────────────────────
app.post("/api/modo", async (req, res) => {
  const { telefono, humano } = req.body;
  if (!telefono) return res.status(400).json({ error:"Falta telefono" });
  await db.collection("conversaciones").doc(telefono).set({ botActivo:!humano }, { merge:true });
  res.json({ ok:true, modo: humano?"humano":"bot" });
});

app.listen(PORT, () => console.log(`🚀 DND Boutique Backend en puerto ${PORT}`));
