const axios = require("axios");

// Configuracion de variables de entorno
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

/**
 * Enviar mensaje de texto simple
 * Ajustado para mayor compatibilidad con las llamadas desde el CRM
 */
const enviarMensaje = async (telefono, texto) => {
  if (!telefono || !texto) {
    console.error("❌ Error: Faltan campos obligatorios para enviar el mensaje (telefono o texto).");
    return;
  }

  try {
    const payload = {
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: texto },
    };

    console.log(`🚀 Intentando enviar mensaje a ${telefono}:`, JSON.stringify(payload));

    const response = await axios.post(
      API_URL,
      payload,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    console.log(`✅ Mensaje enviado exitosamente a ${telefono}. ID: ${response.data.messages[0].id}`);
    return response.data;
  } catch (error) {
    // Log detallado del error de la API de Facebook
    console.error(
      "❌ Error detallado enviando mensaje a WhatsApp:",
      error.response?.data ? JSON.stringify(error.response.data) : error.message
    );
    throw error; // Propagamos el error para que el endpoint de express lo capture
  }
};

// Marcar mensaje como leído
const marcarLeido = async (messageId) => {
  try {
    await axios.post(
      API_URL.replace("/messages", "/messages"),
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`👁️ Mensaje ${messageId} marcado como leído.`);
  } catch (error) {
    console.warn("⚠️ Advertencia: No se pudo marcar el mensaje como leído (No crítico).");
  }
};

module.exports = { enviarMensaje, marcarLeido };
