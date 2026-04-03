const express = require("express");
const { getDb } = require("../config/firebase");
const { sendPushNotifications } = require("../services/pushService");

const router = express.Router();

router.get("/health", async (_req, res) => {
  return res.json({
    ok: true,
    message: "Backend online",
  });
});

router.post("/send-test", async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "token é obrigatório",
      });
    }

    const result = await sendPushNotifications(
      [token],
      title || "Teste",
      body || "Push funcionando",
      data || {}
    );

    return res.json(result);
  } catch (error) {
    console.error("[SEND TEST ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao enviar push de teste",
    });
  }
});

router.post("/notify-admins-new-order", async (req, res) => {
  try {
    const { pedidoId, clienteNome } = req.body;

    if (!pedidoId) {
      return res.status(400).json({
        success: false,
        error: "pedidoId é obrigatório",
      });
    }

    const db = getDb();
    const adminsSnap = await db
      .collection("usuarios")
      .where("role", "==", "admin")
      .get();

    const tokens = [];

    adminsSnap.forEach((doc) => {
      const data = doc.data();
      if (data?.expoPushToken) {
        tokens.push(data.expoPushToken);
      }
    });

    const result = await sendPushNotifications(
      tokens,
      "Novo pedido",
      clienteNome
        ? `${clienteNome} acabou de fazer um pedido`
        : "Um novo pedido acabou de chegar",
      {
        type: "new_order",
        pedidoId,
        screen: "AdminOrders",
      }
    );

    return res.json(result);
  } catch (error) {
    console.error("[NOTIFY ADMINS ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao notificar admins",
    });
  }
});

router.post("/notify-client-order-status", async (req, res) => {
  try {
    const { clienteId, pedidoId, status } = req.body;

    if (!clienteId || !pedidoId || !status) {
      return res.status(400).json({
        success: false,
        error: "clienteId, pedidoId e status são obrigatórios",
      });
    }

    const db = getDb();
    const clienteDoc = await db.collection("usuarios").doc(clienteId).get();

    if (!clienteDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Cliente não encontrado",
      });
    }

    const cliente = clienteDoc.data();
    const token = cliente?.expoPushToken;

    const mensagens = {
      aceito: {
        title: "Pedido aceito",
        body: "Seu pedido foi aceito e entrou em preparação.",
      },
      preparando: {
        title: "Pedido em preparo",
        body: "Seu pedido está sendo preparado.",
      },
      saiu_entrega: {
        title: "Saiu para entrega",
        body: "Seu pedido saiu para entrega.",
      },
      entregue: {
        title: "Pedido entregue",
        body: "Seu pedido foi finalizado com sucesso.",
      },
      cancelado: {
        title: "Pedido cancelado",
        body: "Seu pedido foi cancelado.",
      },
    };

    const mensagem = mensagens[status] || {
      title: "Pedido atualizado",
      body: `Seu pedido foi atualizado para: ${status}`,
    };

    const result = await sendPushNotifications(
      token ? [token] : [],
      mensagem.title,
      mensagem.body,
      {
        type: "order_status",
        pedidoId,
        status,
        screen: "MyOrders",
      }
    );

    return res.json(result);
  } catch (error) {
    console.error("[NOTIFY CLIENT ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao notificar cliente",
    });
  }
});

module.exports = router;