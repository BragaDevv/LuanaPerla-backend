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
      data || {},
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
      },
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
    const { clienteId, pedidoId, status, codigoPedido } = req.body;

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

    const codigoLabel = codigoPedido ? `Pedido ${codigoPedido}` : "Seu pedido";

    const mensagens = {
      recebido: {
        title: "📥 Pedido recebido!",
        body: `${codigoLabel} foi recebido com sucesso 🙌`,
      },

      em_preparo: {
        title: "👨‍🍳 Em preparo",
        body: `${codigoLabel} já está sendo preparado 😋`,
      },

      pronto: {
        title: "✅ Pedido pronto!",
        body: `${codigoLabel} está pronto 🎉`,
      },

      entregue: {
        title: "🚚 Entregue!",
        body: `${codigoLabel} foi entregue 🧡`,
      },

      cancelado: {
        title: "❌ Pedido cancelado",
        body: `${codigoLabel} foi cancelado. Se precisar, fale com a gente 🙂`,
      },
    };

    const mensagem = mensagens[status] || {
      title: "Pedido atualizado",
      body: `${codigoLabel} foi atualizado para: ${status}`,
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
      },
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

router.post("/notify-admins-stock-alert", async (req, res) => {
  try {
    const { nomeProduto, quantidade, minimo, tipoAlerta } = req.body;

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

    let title = "📦 Alerta de estoque";
    let body = `${nomeProduto} está com estoque baixo.`;

    if (tipoAlerta === "zerado") {
      title = "🚨 Estoque zerado";
      body = `${nomeProduto} zerou no estoque.`;
    }

    if (tipoAlerta === "minimo") {
      title = "⚠️ Estoque no mínimo";
      body = `${nomeProduto} chegou ao mínimo (${quantidade}/${minimo}).`;
    }

    const result = await sendPushNotifications(tokens, title, body, {
      screen: "AdminStock",
      nomeProduto,
      quantidade,
      minimo,
      tipoAlerta,
    });

    return res.json(result);
  } catch (error) {
    console.error("[STOCK ALERT ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao notificar alerta de estoque",
    });
  }
});

router.post("/update-order-status", async (req, res) => {
  try {
    const { pedidoId, novoStatus } = req.body;

    if (!pedidoId || !novoStatus) {
      return res.status(400).json({
        error: "pedidoId e novoStatus são obrigatórios",
      });
    }

    const db = getDb();

    const pedidoRef = db.collection("pedidos").doc(pedidoId);
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    const pedido = pedidoSnap.data();

    // 🔥 1. Atualiza status
    await pedidoRef.update({
      status: novoStatus,
      updatedAt: new Date(),
    });

    // 🔥 2. Se for recebido → baixa estoque
    if (novoStatus === "recebido" && pedido.itens?.length) {
      for (const item of pedido.itens) {
        if (!item.productId) continue;

        const estoqueRef = db
          .collection("estoque")
          .where("produtoId", "==", item.productId);

        const estoqueSnap = await estoqueRef.get();

        if (!estoqueSnap.empty) {
          const estoqueDoc = estoqueSnap.docs[0];
          const estoqueData = estoqueDoc.data();

          const novaQuantidade = Math.max(
            0,
            Number(estoqueData.quantidade || 0) -
              Number(item.quantidade || 0),
          );

          await estoqueDoc.ref.update({
            quantidade: novaQuantidade,
            updatedAt: new Date(),
          });
        }
      }
    }

    return res.json({
      success: true,
      message: "Status atualizado e estoque ajustado",
    });
  } catch (error) {
    console.log("[UPDATE ORDER ERROR]", error);
    return res.status(500).json({
      error: "Erro ao atualizar pedido",
    });
  }
});

module.exports = router;
