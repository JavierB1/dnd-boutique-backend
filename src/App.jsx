import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, addDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";

const BACKEND = "https://dnd-boutique-backend-production.up.railway.app";

const STATUS_COLORS = {
  "Nuevo": { bg: "#0f2a4a", text: "#60a5fa", dot: "#3b82f6" },
  "Interesado": { bg: "#3b2a00", text: "#fbbf24", dot: "#f59e0b" },
  "Cotizado": { bg: "#1a1a3e", text: "#a78bfa", dot: "#7c3aed" },
  "Cerrado": { bg: "#0d3320", text: "#34d399", dot: "#10b981" },
  "Perdido": { bg: "#3b1a1a", text: "#f87171", dot: "#ef4444" },
};
const STATUSES = ["Nuevo", "Interesado", "Cotizado", "Cerrado", "Perdido"];

export default function CRM() {
  const [section, setSection] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [combos, setCombos] = useState([]);
  const [conversations, setConversations] = useState({});
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [newMsg, setNewMsg] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddCombo, setShowAddCombo] = useState(false);
  const [newClient, setNewClient] = useState({ nombre: "", telefono: "", status: "Nuevo", notas: "" });
  const [newCombo, setNewCombo] = useState({ nombre: "", descripcion: "", precio: "", stock: "" });
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef(null);

  // ─── FIRESTORE LISTENERS ──────────────────────────────────────
  useEffect(() => {
    // Combos
    const unsubCombos = onSnapshot(collection(db, "combos"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (data.length === 0) seedCombos();
      else setCombos(data);
      setLoading(false);
    });

    // Clientes
    const unsubClients = onSnapshot(collection(db, "clientes"), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Conversaciones
    const unsubConvs = onSnapshot(collection(db, "conversaciones"), (snap) => {
      const convs = {};
      snap.docs.forEach(d => { convs[d.id] = d.data(); });
      setConversations(convs);
    });

    return () => { unsubCombos(); unsubClients(); unsubConvs(); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, selectedPhone]);

  // Seed combos iniciales
  const seedCombos = async () => {
    const defaults = [
      { nombre: "Combo Dúo", descripcion: "2 perfumes a elegir", precio: 25, stock: 15, activo: true },
      { nombre: "Combo Trío", descripcion: "3 perfumes a elegir", precio: 35, stock: 10, activo: true },
      { nombre: "Combo Premium", descripcion: "2 perfumes línea premium", precio: 45, stock: 8, activo: true },
    ];
    for (const combo of defaults) {
      await addDoc(collection(db, "combos"), combo);
    }
  };

  // ─── COMBOS ───────────────────────────────────────────────────
  const addCombo = async () => {
    if (!newCombo.nombre) return;
    await addDoc(collection(db, "combos"), {
      nombre: newCombo.nombre,
      descripcion: newCombo.descripcion,
      precio: parseFloat(newCombo.precio) || 0,
      stock: parseInt(newCombo.stock) || 0,
      activo: true,
    });
    setNewCombo({ nombre: "", descripcion: "", precio: "", stock: "" });
    setShowAddCombo(false);
  };

  const toggleCombo = async (id, activo) => {
    await updateDoc(doc(db, "combos", id), { activo: !activo });
  };

  const deleteCombo = async (id) => {
    await deleteDoc(doc(db, "combos", id));
  };

  // ─── CLIENTES ─────────────────────────────────────────────────
  const addClient = async () => {
    if (!newClient.nombre) return;
    await addDoc(collection(db, "clientes"), { ...newClient, totalGastado: 0, createdAt: serverTimestamp() });
    setNewClient({ nombre: "", telefono: "", status: "Nuevo", notas: "" });
    setShowAddClient(false);
  };

  const updateClientStatus = async (id, status) => {
    await updateDoc(doc(db, "clientes", id), { status });
  };

  // ─── MENSAJES ─────────────────────────────────────────────────
  const enviarMensaje = async () => {
    if (!newMsg.trim() || !selectedPhone) return;
    const tiempo = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const conv = conversations[selectedPhone] || { nombre: selectedPhone, mensajes: [], botActivo: true };
    const mensajes = [...(conv.mensajes || []), { from: "user", texto: newMsg, tiempo }];

    await setDoc(doc(db, "conversaciones", selectedPhone), {
      ...conv, mensajes, ultimoMsg: newMsg, ultimoTiempo: tiempo
    });

    // Enviar via WhatsApp API
    try {
      await fetch(`${BACKEND}/api/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono: selectedPhone, mensaje: newMsg }),
      });
    } catch (e) { console.error("Error enviando:", e); }

    setNewMsg("");
  };

  const toggleBot = async (telefono) => {
    const conv = conversations[telefono] || {};
    await setDoc(doc(db, "conversaciones", telefono), {
      ...conv, botActivo: !conv.botActivo
    }, { merge: true });

    // Notificar al backend
    try {
      await fetch(`${BACKEND}/api/modo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, humano: !conv.botActivo }),
      });
    } catch (e) { }
  };

  const marcarLeido = async (telefono) => {
    const conv = conversations[telefono];
    if (!conv) return;
    await setDoc(doc(db, "conversaciones", telefono), { ...conv, sinLeer: 0 }, { merge: true });
  };

  // ─── STATS ────────────────────────────────────────────────────
  const totalUnread = Object.values(conversations).reduce((a, c) => a + (c.sinLeer || 0), 0);
  const totalVentas = clients.filter(c => c.status === "Cerrado").reduce((a, c) => a + (c.totalGastado || 0), 0);
  const conversion = clients.length ? Math.round((clients.filter(c => c.status === "Cerrado").length / clients.length) * 100) : 0;
  const convList = Object.entries(conversations).map(([tel, conv]) => {
    const client = clients.find(c => c.telefono === `+${tel}` || c.id === tel);
    return { telefono: tel, nombre: conv.nombre || client?.nombre || tel, ...conv };
  });

  const navItems = [
    { id: "dashboard", icon: "⬡", label: "Dashboard" },
    { id: "conversations", icon: "◈", label: "Conversaciones", badge: totalUnread },
    { id: "clients", icon: "◉", label: "Clientes" },
    { id: "combos", icon: "▦", label: "Combos" },
    { id: "pipeline", icon: "▤", label: "Pipeline" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#060c18", color: "#3b82f6", fontFamily: "sans-serif", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 40 }}>🌸</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Cargando DND Boutique CRM...</div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#060c18", fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 4px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
        @keyframes slideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
        .anim { animation: fadeUp 0.3s ease; }
        .nav-item { transition:all 0.2s; cursor:pointer; border-radius:10px; }
        .nav-item:hover { background:#0d1f38; }
        .nav-item.active { background:#0f2847; border-left:2px solid #3b82f6; }
        .card { background:#0a1628; border:1px solid #0f2040; border-radius:14px; transition:all 0.2s; }
        .card:hover { border-color:#1e3a5f; }
        .btn-p { background:#1d4ed8; color:white; border:none; border-radius:8px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s; }
        .btn-p:hover { background:#2563eb; transform:translateY(-1px); }
        .btn-g { background:transparent; color:#94a3b8; border:1px solid #1e3a5f; border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; transition:all 0.2s; }
        .btn-g:hover { background:#0d1f38; color:#e2e8f0; }
        .btn-r { background:transparent; color:#f87171; border:1px solid #3b1a1a; border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; transition:all 0.2s; }
        .btn-r:hover { background:#3b1a1a; }
        .input { background:#07111f; border:1px solid #1e3a5f; border-radius:8px; padding:9px 12px; color:#e2e8f0; font-size:13px; width:100%; transition:all 0.2s; outline:none; }
        .input:focus { border-color:#3b82f6; }
        .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.75); display:flex; align-items:center; justify-content:center; z-index:100; backdrop-filter:blur(6px); }
        .modal { background:#0a1628; border:1px solid #1e3a5f; border-radius:16px; padding:24px; width:360px; animation:fadeUp 0.2s ease; }
        .conv-row { padding:12px 16px; cursor:pointer; border-bottom:1px solid #0a1628; transition:background 0.15s; }
        .conv-row:hover { background:#0a1628; }
        .conv-row.sel { background:#0f2847; }
        .bubble { max-width:72%; padding:10px 14px; border-radius:14px; font-size:13px; line-height:1.5; white-space:pre-wrap; }
        .notif { position:fixed; bottom:24px; right:24px; background:#0f2847; border:1px solid #1e3a5f; border-radius:12px; padding:14px 18px; z-index:200; animation:slideIn 0.3s ease; max-width:280px; }
        select { appearance:none; }
      `}</style>

      {notification && (
        <div className="notif">
          <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700, marginBottom: 4 }}>📩 NUEVO MENSAJE</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{notification.nombre}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{notification.texto}</div>
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width: sidebar ? 220 : 64, background: "#060c18", borderRight: "1px solid #0a1628", display: "flex", flexDirection: "column", transition: "width 0.25s", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #0a1628" }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✦</div>
          {sidebar && <div>
            <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 14 }}>DND Boutique</div>
            <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 600 }}>CRM · WhatsApp IA</div>
          </div>}
        </div>
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}
              style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0, opacity: section === item.id ? 1 : 0.5 }}>{item.icon}</span>
              {sidebar && <>
                <span style={{ fontSize: 13, fontWeight: section === item.id ? 600 : 400, color: section === item.id ? "#e2e8f0" : "#475569", flex: 1 }}>{item.label}</span>
                {item.badge > 0 && <span style={{ background: "#ef4444", color: "white", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 6px" }}>{item.badge}</span>}
              </>}
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 10px", borderTop: "1px solid #0a1628" }}>
          <div className="nav-item" onClick={() => setSidebar(!sidebar)} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, opacity: 0.4 }}>{sidebar ? "◂" : "▸"}</span>
            {sidebar && <span style={{ fontSize: 12, color: "#334155" }}>Colapsar</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #0a1628", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18 }}>{navItems.find(n => n.id === section)?.label}</h1>
            <p style={{ fontSize: 11, color: "#334155", marginTop: 1 }}>{new Date().toLocaleDateString("es-SV", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>Firebase + N8N conectados</span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: section === "conversations" ? 0 : "22px" }} className="anim">

          {/* DASHBOARD */}
          {section === "dashboard" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Clientes", value: clients.length, icon: "◉", color: "#3b82f6" },
                  { label: "Ventas cerradas", value: clients.filter(c => c.status === "Cerrado").length, icon: "✦", color: "#10b981" },
                  { label: "Ingresos", value: `$${totalVentas}`, icon: "▦", color: "#f59e0b" },
                  { label: "Conversión", value: `${conversion}%`, icon: "⬡", color: "#8b5cf6" },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 10, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</span>
                      <span style={{ color: s.color, fontSize: 16 }}>{s.icon}</span>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Syne'", color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Pipeline</h3>
                  {STATUSES.map(status => {
                    const count = clients.filter(c => c.status === status).length;
                    const pct = clients.length ? (count / clients.length) * 100 : 0;
                    const s = STATUS_COLORS[status];
                    return (
                      <div key={status} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: s.text }}>{status}</span>
                          <span style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>{count}</span>
                        </div>
                        <div style={{ height: 3, background: "#07111f", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: s.dot, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Conversaciones recientes</h3>
                  {convList.length === 0 && <div style={{ fontSize: 13, color: "#334155", textAlign: "center", padding: "20px 0" }}>Sin conversaciones aún</div>}
                  {convList.slice(0, 4).map(conv => (
                    <div key={conv.telefono} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}
                      onClick={() => { setSection("conversations"); setSelectedPhone(conv.telefono); }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{conv.nombre[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{conv.nombre}</div>
                        <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.ultimoMsg || "Sin mensajes"}</div>
                      </div>
                      {conv.sinLeer > 0 && <span style={{ background: "#ef4444", color: "white", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 6px" }}>{conv.sinLeer}</span>}
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Combos activos</h3>
                  {combos.filter(c => c.activo).map(combo => (
                    <div key={combo.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "10px 12px", background: "#07111f", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{combo.nombre}</div>
                        <div style={{ fontSize: 11, color: "#334155" }}>{combo.descripcion}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>${combo.precio}</div>
                        <div style={{ fontSize: 11, color: "#334155" }}>stock: {combo.stock}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONVERSACIONES */}
          {section === "conversations" && (
            <div style={{ display: "flex", height: "100%" }}>
              <div style={{ width: 280, borderRight: "1px solid #0a1628", overflowY: "auto", flexShrink: 0 }}>
                <div style={{ padding: 14, borderBottom: "1px solid #0a1628" }}>
                  <input className="input" placeholder="Buscar..." />
                </div>
                {convList.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "#334155", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
                    Los mensajes de WhatsApp aparecerán aquí automáticamente.
                  </div>
                )}
                {convList.map(conv => (
                  <div key={conv.telefono} className={`conv-row ${selectedPhone === conv.telefono ? "sel" : ""}`}
                    onClick={() => { setSelectedPhone(conv.telefono); marcarLeido(conv.telefono); }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{conv.nombre[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{conv.nombre}</span>
                          <span style={{ fontSize: 10, color: "#334155" }}>{conv.ultimoTiempo || ""}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{conv.ultimoMsg || "Sin mensajes"}</span>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            {conv.botActivo && <span style={{ fontSize: 9, color: "#3b82f6", background: "#0f2847", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>BOT</span>}
                            {conv.sinLeer > 0 && <span style={{ background: "#ef4444", color: "white", fontSize: 10, fontWeight: 700, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{conv.sinLeer}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedPhone ? (() => {
                const conv = conversations[selectedPhone] || { mensajes: [], botActivo: true };
                const client = clients.find(c => c.telefono === `+${selectedPhone}`);
                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 20px", borderBottom: "1px solid #0a1628", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{(conv.nombre || selectedPhone)[0]}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{conv.nombre || selectedPhone}</div>
                          <div style={{ fontSize: 11, color: "#334155" }}>+{selectedPhone}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: conv.botActivo ? "#0f2847" : "#3b2a00", color: conv.botActivo ? "#3b82f6" : "#f59e0b" }}>
                          {conv.botActivo ? "🤖 Bot activo" : "👤 Tú atiendes"}
                        </span>
                        <button className="btn-g" style={{ fontSize: 11 }} onClick={() => toggleBot(selectedPhone)}>
                          {conv.botActivo ? "Tomar control" : "Activar bot"}
                        </button>
                        {client && (
                          <select className="input" value={client.status || "Nuevo"} style={{ width: 130, fontSize: 12 }}
                            onChange={e => updateClientStatus(client.id, e.target.value)}>
                            {STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                      {(conv.mensajes || []).length === 0 && <div style={{ textAlign: "center", color: "#334155", fontSize: 13, marginTop: 40 }}>Sin mensajes aún</div>}
                      {(conv.mensajes || []).map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.from === "client" ? "flex-start" : "flex-end" }}>
                          <div className="bubble" style={{
                            background: msg.from === "client" ? "#0a1628" : msg.from === "bot" ? "#0f2847" : "#1d4ed8",
                            border: `1px solid ${msg.from === "client" ? "#0f2040" : msg.from === "bot" ? "#1e3a8a" : "#2563eb"}`,
                            color: "#e2e8f0"
                          }}>
                            {msg.from === "bot" && <div style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>BOT · N8N</div>}
                            {msg.texto}
                            <div style={{ fontSize: 10, color: "#334155", marginTop: 4, textAlign: "right" }}>{msg.tiempo}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <div style={{ padding: "12px 20px", borderTop: "1px solid #0a1628", display: "flex", gap: 10 }}>
                      <input className="input" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && enviarMensaje()}
                        placeholder="Escribe un mensaje..." style={{ flex: 1 }} />
                      <button className="btn-p" onClick={enviarMensaje}>Enviar →</button>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#334155" }}>
                  <div style={{ fontSize: 48 }}>◈</div>
                  <div style={{ fontSize: 14 }}>Selecciona una conversación</div>
                </div>
              )}
            </div>
          )}

          {/* CLIENTES */}
          {section === "clients" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <input className="input" placeholder="Buscar cliente..." style={{ width: 260 }} />
                <button className="btn-p" onClick={() => setShowAddClient(true)}>+ Nuevo cliente</button>
              </div>
              {clients.map(client => {
                const s = STATUS_COLORS[client.status || "Nuevo"];
                return (
                  <div key={client.id} className="card" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{client.nombre[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{client.nombre}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{client.telefono}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {client.totalGastado > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>${client.totalGastado}</span>}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />{client.status || "Nuevo"}
                      </span>
                      <select className="input" value={client.status || "Nuevo"} style={{ width: 130, fontSize: 12 }}
                        onChange={e => updateClientStatus(client.id, e.target.value)}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
              {showAddClient && (
                <div className="modal-bg" onClick={() => setShowAddClient(false)}>
                  <div className="modal" onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontFamily: "'Syne'", fontWeight: 800, marginBottom: 18 }}>Nuevo cliente</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input className="input" placeholder="Nombre" value={newClient.nombre} onChange={e => setNewClient({ ...newClient, nombre: e.target.value })} />
                      <input className="input" placeholder="Teléfono (+503...)" value={newClient.telefono} onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} />
                      <select className="input" value={newClient.status} onChange={e => setNewClient({ ...newClient, status: e.target.value })}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                      <textarea className="input" placeholder="Notas..." rows={3} style={{ resize: "none" }} value={newClient.notas} onChange={e => setNewClient({ ...newClient, notas: e.target.value })} />
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button className="btn-g" onClick={() => setShowAddClient(false)} style={{ flex: 1 }}>Cancelar</button>
                        <button className="btn-p" onClick={addClient} style={{ flex: 1 }}>Agregar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMBOS */}
          {section === "combos" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <p style={{ fontSize: 13, color: "#475569" }}>{combos.filter(c => c.activo).length} activos · {combos.length} total</p>
                <button className="btn-p" onClick={() => setShowAddCombo(true)}>+ Nuevo combo</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14 }}>
                {combos.map(combo => (
                  <div key={combo.id} className="card" style={{ padding: 20, opacity: combo.activo ? 1 : 0.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>🌸</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: combo.activo ? "#0d3320" : "#1a1a2e", color: combo.activo ? "#10b981" : "#475569" }}>
                        {combo.activo ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </div>
                    <h3 style={{ fontFamily: "'Syne'", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{combo.nombre}</h3>
                    <p style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>{combo.descripcion}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Syne'", color: "#10b981" }}>${combo.precio}</span>
                      <span style={{ fontSize: 12, color: "#334155" }}>stock: {combo.stock}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-g" style={{ flex: 1, fontSize: 12 }} onClick={() => toggleCombo(combo.id, combo.activo)}>
                        {combo.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button className="btn-r" style={{ fontSize: 12 }} onClick={() => deleteCombo(combo.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
              {showAddCombo && (
                <div className="modal-bg" onClick={() => setShowAddCombo(false)}>
                  <div className="modal" onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontFamily: "'Syne'", fontWeight: 800, marginBottom: 18 }}>Nuevo combo</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input className="input" placeholder="Nombre del combo" value={newCombo.nombre} onChange={e => setNewCombo({ ...newCombo, nombre: e.target.value })} />
                      <input className="input" placeholder="Descripción" value={newCombo.descripcion} onChange={e => setNewCombo({ ...newCombo, descripcion: e.target.value })} />
                      <input className="input" placeholder="Precio ($)" type="number" value={newCombo.precio} onChange={e => setNewCombo({ ...newCombo, precio: e.target.value })} />
                      <input className="input" placeholder="Stock disponible" type="number" value={newCombo.stock} onChange={e => setNewCombo({ ...newCombo, stock: e.target.value })} />
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button className="btn-g" onClick={() => setShowAddCombo(false)} style={{ flex: 1 }}>Cancelar</button>
                        <button className="btn-p" onClick={addCombo} style={{ flex: 1 }}>Agregar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PIPELINE */}
          {section === "pipeline" && (
            <div>
              <p style={{ fontSize: 13, color: "#475569", marginBottom: 18 }}>Vista kanban de clientes por etapa</p>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                {STATUSES.map(status => {
                  const s = STATUS_COLORS[status];
                  const statusClients = clients.filter(c => c.status === status);
                  return (
                    <div key={status} style={{ minWidth: 160, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "7px 12px", background: s.bg, borderRadius: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.text }}>{status}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: s.text, opacity: 0.7 }}>{statusClients.length}</span>
                      </div>
                      {statusClients.map(client => (
                        <div key={client.id} style={{ background: "#0a1628", border: "1px solid #0f2040", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{client.nombre[0]}</div>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{client.nombre}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{client.telefono}</div>
                        </div>
                      ))}
                      {statusClients.length === 0 && <div style={{ padding: "18px 12px", textAlign: "center", color: "#1e3a5f", fontSize: 12 }}>Vacío</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
