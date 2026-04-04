const express = require("express");
const { getDb } = require("../config/firebase");
const { sendPushNotifications } = require("../services/pushService");

const router = express.Router();

function getTipoAlertaEstoque(quantidade, minimo) {
  if (quantidade === 0) return "zerado";
  if (minimo > 0 && quantidade > 0 && quantidade <= minimo) return "minimo";
  return null;
}

function getActiveDeviceToken(usuario) {
  if (!usuario) return null;

  const devices = Array.isArray(usuario.devices) ? usuario.devices : [];

  const activeDevice = devices.find(
    (device) =>
      device &&
      device.ativo === true &&
      typeof device.token === "string" &&
      device.token.trim(),
  );

  if (activeDevice?.token) {
    return activeDevice.token;
  }

  // fallback temporário para não quebrar usuários antigos
  if (
    typeof usuario.expoPushToken === "string" &&
    usuario.expoPushToken.trim()
  ) {
    return usuario.expoPushToken;
  }

  return null;
}

function getAllAdminActiveTokens(adminDocs) {
  const tokens = [];

  adminDocs.forEach((docItem) => {
    const data = docItem.data();
    const token = getActiveDeviceToken(data);

    if (token) {
      tokens.push(token);
    }
  });

  return [...new Set(tokens)];
}

async function getAdminTokens() {
  const db = getDb();

  const adminsSnap = await db
    .collection("usuarios")
    .where("role", "==", "admin")
    .get();

  return getAllAdminActiveTokens(adminsSnap.docs);
}

async function notifyAdminsStockAlert({
  nomeProduto,
  quantidade,
  minimo,
  tipoAlerta,
}) {
  const tokens = await getAdminTokens();

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

  return sendPushNotifications(tokens, title, body, {
    screen: "AdminStock",
    nomeProduto,
    quantidade,
    minimo,
    tipoAlerta,
  });
}

async function notifyClientOrderStatus({
  clienteId,
  pedidoId,
  status,
  codigoPedido,
}) {
  const db = getDb();
  const clienteDoc = await db.collection("usuarios").doc(clienteId).get();

  if (!clienteDoc.exists) {
    return {
      success: false,
      error: "Cliente não encontrado",
    };
  }

  const cliente = clienteDoc.data();
  const token = getActiveDeviceToken(cliente);
  const codigoLabel = codigoPedido ? `Pedido ${codigoPedido}` : "Seu pedido";

  const mensagens = {
    recebido: {
      title: "📥 Pedido Aceito!",
      body: `${codigoLabel} foi aceito com sucesso 🙌`,
    },
    em_preparo: {
      title: "👨‍🍳 Em preparo",
      body: `${codigoLabel} já está sendo preparado 😋`,
    },
    rota_entrega: {
      title: "🚀​ Em rota",
      body: `${codigoLabel} está em rota para entrega 🚚`,
    },
    pronto: {
      title: "✅ Pedido pronto!",
      body: `${codigoLabel} está pronto 🎉`,
    },
    entregue: {
      title: "🚚 Entregue!",
      body: `${codigoLabel} foi entregue 😋`,
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

  return sendPushNotifications(
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
}

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

    const tokens = await getAdminTokens();

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

    const result = await notifyClientOrderStatus({
      clienteId,
      pedidoId,
      status,
      codigoPedido,
    });

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

    const result = await notifyAdminsStockAlert({
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
        success: false,
        error: "pedidoId e novoStatus são obrigatórios",
      });
    }

    const db = getDb();

    const pedidoRef = db.collection("pedidos").doc(pedidoId);
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) {
      return res.status(404).json({
        success: false,
        error: "Pedido não encontrado",
      });
    }

    const pedido = pedidoSnap.data();

    await pedidoRef.update({
      status: novoStatus,
      updatedAt: new Date(),
    });

    const estoqueLogs = [];

    if (novoStatus === "recebido" && pedido?.itens?.length) {
      for (const item of pedido.itens) {
        if (!item.productId) continue;

        const estoqueSnap = await db
          .collection("estoque")
          .where("produtoId", "==", item.productId)
          .get();

        if (estoqueSnap.empty) {
          console.log(`[ESTOQUE] produtoId não encontrado: ${item.productId}`);
          continue;
        }

        const estoqueDoc = estoqueSnap.docs[0];
        const estoqueData = estoqueDoc.data();

        const quantidadeAtual = Number(estoqueData.quantidade || 0);
        const minimo = Number(estoqueData.minimo || 0);
        const quantidadePedido = Number(item.quantidade || 0);

        const novaQuantidade = Math.max(0, quantidadeAtual - quantidadePedido);

        const alertaAntes = getTipoAlertaEstoque(quantidadeAtual, minimo);
        const alertaDepois = getTipoAlertaEstoque(novaQuantidade, minimo);

        await estoqueDoc.ref.update({
          quantidade: novaQuantidade,
          updatedAt: new Date(),
        });

        estoqueLogs.push({
          produtoId: item.productId,
          nome: item.nome,
          antes: quantidadeAtual,
          depois: novaQuantidade,
          minimo,
        });

        const entrouEmAlerta =
          (!alertaAntes && !!alertaDepois) || alertaAntes !== alertaDepois;

        if (alertaDepois && entrouEmAlerta) {
          await notifyAdminsStockAlert({
            nomeProduto: item.nome,
            quantidade: novaQuantidade,
            minimo,
            tipoAlerta: alertaDepois,
          });
        }
      }
    }

    if (pedido?.userId) {
      await notifyClientOrderStatus({
        clienteId: pedido.userId,
        pedidoId,
        status: novoStatus,
        codigoPedido: pedido.codigo,
      });
    }

    return res.json({
      success: true,
      message: "Status atualizado, estoque ajustado e notificações processadas",
      estoqueLogs,
    });
  } catch (error) {
    console.log("[UPDATE ORDER ERROR]", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao atualizar pedido",
    });
  }
});

module.exports = router;
