const { Expo } = require("expo-server-sdk");

const expo = new Expo();

async function sendPushNotifications(tokens, title, body, data = {}) {
  const validTokens = [...new Set(tokens)].filter((token) =>
    Expo.isExpoPushToken(token),
  );

  if (!validTokens.length) {
    return {
      success: false,
      message: "Nenhum token Expo válido encontrado.",
      tickets: [],
    };
  }

  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data,
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("[PUSH ERROR CHUNK]", error);
    }
  }

  return {
    success: true,
    message: "Push processado com sucesso.",
    tickets,
  };
}

async function enviarPushPagamentoAprovado({ db, pedidoId, pedido }) {
  try {
    const userId = pedido?.userId;

    if (!userId) {
      console.log("⚠️ Pedido sem userId para push pagamento:", pedidoId);
      return;
    }

    const usuarioSnap = await db
      .collection("usuarios")
      .doc(String(userId))
      .get();

    if (!usuarioSnap.exists) {
      console.log("⚠️ Usuário não encontrado para push:", userId);
      return;
    }

    const usuario = usuarioSnap.data();
    const tokens = [];

    // Estrutura nova: devices: [{ token }]
    if (Array.isArray(usuario.devices)) {
      usuario.devices.forEach((device) => {
        if (device?.token) tokens.push(device.token);
      });
    }

    // Estrutura antiga: expoPushToken direto no usuário
    if (usuario.expoPushToken) {
      tokens.push(usuario.expoPushToken);
    }

    // Outras possibilidades, caso você tenha salvo com outro nome
    if (usuario.pushToken) {
      tokens.push(usuario.pushToken);
    }

    const codigo =
      pedido.codigo || `#${String(pedidoId).slice(0, 6).toUpperCase()}`;

    const result = await sendPushNotifications(
      tokens,
      "Pagamento aprovado! 🎉",
      `Seu pagamento do pedido ${codigo} foi confirmado com sucesso.`,
      {
        screen: "MyOrders",
        pedidoId: String(pedidoId),
        tipo: "pagamento_aprovado",
      },
    );

    console.log("✅ Resultado push pagamento aprovado:", result);
  } catch (error) {
    console.log("❌ Erro ao enviar push pagamento aprovado:", error);
  }
}

module.exports = {
  sendPushNotifications,
  enviarPushPagamentoAprovado,
};
