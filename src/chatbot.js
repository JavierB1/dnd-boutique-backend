const Anthropic = require("@anthropic-ai/sdk");
const { getCombosTexto } = require("./catalogo");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Historial de conversaciones por número de teléfono (en memoria)
// En producción avanzada esto iría a una base de datos
const historialConversaciones = new Map();

const SYSTEM_PROMPT = `Eres el asistente virtual de *DND Boutique*, una tienda de perfumes en El Salvador. Tu objetivo es atender clientes por WhatsApp, responder sus preguntas y CERRAR VENTAS de forma natural y amigable.

PERSONALIDAD:
- Amigable, cálida y profesional
- Usas emojis con moderación 😊
- Escribes en español salvadoreño natural (no muy formal, no muy informal)
- Eres proactiva: siempre guías al cliente hacia la compra

COMBOS DISPONIBLES HOY:
${getCombosTexto()}

PROCESO DE VENTA (sigue este flujo):
1. Saluda y pregunta en qué puedes ayudar
2. Presenta los combos disponibles con precios
3. Responde dudas sobre los perfumes
4. Cuando el cliente muestre interés, pregunta:
   - ¿Para quién es? (dama, caballero, unisex)
   - ¿Cuál combo le interesa?
   - ¿Cuál es su dirección para la entrega?
5. Confirma el pedido con resumen
6. Informa métodos de pago: transferencia bancaria o efectivo en entrega
7. Agradece y da seguimiento

INFORMACIÓN IMPORTANTE:
- Envíos a todo El Salvador
- El costo de envío varía según zona (consultar)
- Aceptamos: transferencia, efectivo en entrega
- Si el cliente hace una pregunta muy específica que no puedes responder, di: "Déjame consultar con mi encargada y te confirmo en un momento 🙏"

REGLAS:
- NUNCA inventes información que no tienes
- Si el cliente está enojado o hay un problema, sé empática y ofrece solución
- Mantén las respuestas cortas y directas (máximo 3-4 líneas)
- Si el cliente dice "quiero hablar con una persona", responde que en breve le atienden`;

const procesarMensaje = async (telefono, mensajeCliente) => {
  // Obtener o crear historial de conversación
  if (!historialConversaciones.has(telefono)) {
    historialConversaciones.set(telefono, []);
  }

  const historial = historialConversaciones.get(telefono);

  // Agregar mensaje del cliente al historial
  historial.push({
    role: "user",
    content: mensajeCliente,
  });

  // Limitar historial a últimos 20 mensajes para no exceder contexto
  if (historial.length > 20) {
    historial.splice(0, historial.length - 20);
  }

  try {
    const respuesta = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: historial,
    });

    const textoRespuesta = respuesta.content[0].text;

    // Agregar respuesta del bot al historial
    historial.push({
      role: "assistant",
      content: textoRespuesta,
    });

    return textoRespuesta;
  } catch (error) {
    console.error("❌ Error con Claude AI:", error.message);
    return "Hola! En este momento tenemos un problema técnico. Por favor escríbenos en unos minutos 🙏";
  }
};

// Limpiar historial de conversación (útil si quieres resetear)
const limpiarHistorial = (telefono) => {
  historialConversaciones.delete(telefono);
};

module.exports = { procesarMensaje, limpiarHistorial };
