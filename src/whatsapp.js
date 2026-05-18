const axios = require("axios");

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

// Enviar mensaje de texto simple
const enviarMensaje = async (telefono, texto) => {
  try {
    await axios.post(
      API_URL,
      {
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: texto },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`✅ Mensaje enviado a ${telefono}`);
  } catch (error) {
    console.error(
      "❌ Error enviando mensaje:",
      error.response?.data || error.message
    );
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
  } catch (error) {
    // No crítico si falla
  }
};

module.exports = { enviarMensaje, marcarLeido };
