const express = require("express");
const router = express.Router();

const {
  criarPagamentoPix,
  consultarPagamento,
} = require("../services/mercadoPagoService");

const { enviarPushPagamentoAprovado } = require("../services/pushService");

const { getDb } = require("../config/firebase");
const db = getDb();

function getBackendUrl(req) {
  if (process.env.BACKEND_PUBLIC_URL) {
    return process.env.BACKEND_PUBLIC_URL;
  }

  return `${req.protocol}://${req.get("host")}`;
}

async function notificarClienteSePagamentoAprovou({ pedidoId, statusNovo }) {
  if (statusNovo !== "approved") return;

  const pedidoRef = db.collection("pedidos").doc(String(pedidoId));

  const pedidoSnap = await pedidoRef.get();

  if (!pedidoSnap.exists) {
    console.log("⚠️ Pedido não encontrado para push:", pedidoId);
    return;
  }

  const pedido = pedidoSnap.data();

  const pushJaEnviado = pedido?.pushPagamentoAprovadoEnviado === true;

  if (pushJaEnviado) {
    console.log("ℹ️ Push de pagamento já enviado:", pedidoId);
    return;
  }

  // Marca ANTES de enviar, para evitar duplicidade se webhook e consulta rodarem juntos
  await pedidoRef.set(
    {
      pushPagamentoAprovadoEnviado: true,
      pushPagamentoAprovadoEnviadoEm: new Date(),
    },
    { merge: true },
  );

  await enviarPushPagamentoAprovado({
    db,
    pedidoId: String(pedidoId),
    pedido,
  });
}

// Criar Pix
router.post("/pix/criar", async (req, res) => {
  try {
    const { pedidoId, valor, nome, email, telefone } = req.body;

    if (!pedidoId) {
      return res.status(400).json({
        success: false,
        error: "pedidoId é obrigatório.",
      });
    }

    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({
        success: false,
        error: "valor inválido.",
      });
    }

    const backendUrl = getBackendUrl(req);

    const pagamento = await criarPagamentoPix({
      pedidoId,
      valor,
      nome,
      email,
      telefone,
      backendUrl,
    });

    const paymentId = String(pagamento.id);

    const qrCode =
      pagamento?.point_of_interaction?.transaction_data?.qr_code || null;

    const qrCodeBase64 =
      pagamento?.point_of_interaction?.transaction_data?.qr_code_base64 || null;

    const ticketUrl =
      pagamento?.point_of_interaction?.transaction_data?.ticket_url || null;

    const status = pagamento.status || "pending";

    await db
      .collection("pedidos")
      .doc(String(pedidoId))
      .set(
        {
          status: "aguardando_pagamento",
          statusPagamento: status,
          pago: false,
          pagamento: {
            metodo: "pix",
            gateway: "mercado_pago",
            paymentId,
            status,
            valor: Number(Number(valor).toFixed(2)),
            qrCode,
            qrCodeBase64,
            ticketUrl,
            criadoEm: new Date(),
            atualizadoEm: new Date(),
          },
        },
        { merge: true },
      );

    return res.status(201).json({
      success: true,
      pedidoId,
      paymentId,
      status,
      qrCode,
      qrCodeBase64,
      ticketUrl,
    });
  } catch (error) {
    console.error("❌ Erro ao criar Pix:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Erro interno ao criar Pix.",
      details: error.details || null,
    });
  }
});

// Consultar status manualmente
router.get("/:paymentId/status", async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: "paymentId é obrigatório.",
      });
    }

    const payment = await consultarPagamento(paymentId);

    const pedidoId = payment.external_reference;
    const status = payment.status;

    if (pedidoId) {
      const pedidoRef = db.collection("pedidos").doc(String(pedidoId));
      const pedidoSnapAntes = await pedidoRef.get();
      const pedidoAntes = pedidoSnapAntes.exists
        ? pedidoSnapAntes.data()
        : null;

      const updateData = {
        statusPagamento: status,
        "pagamento.status": status,
        "pagamento.atualizadoEm": new Date(),
        "pagamento.statusDetail": payment.status_detail || null,
      };

      if (status === "approved") {
        updateData.pago = true;
        updateData.pagoEm = new Date();
        updateData.status = "pendente";
      }

      if (status === "rejected" || status === "cancelled") {
        updateData.pago = false;
        updateData.status = "pagamento_recusado";
      }

      await pedidoRef.set(updateData, {
        merge: true,
      });

      await notificarClienteSePagamentoAprovou({
        pedidoId,
        statusNovo: status,
      });
    }

    return res.json({
      success: true,
      paymentId,
      pedidoId,
      status,
      statusDetail: payment.status_detail,
      valor: payment.transaction_amount,
      aprovado: status === "approved",
    });
  } catch (error) {
    console.error("❌ Erro ao consultar status Pix:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Erro ao consultar pagamento.",
      details: error.details || null,
    });
  }
});

// Webhook Mercado Pago
router.post("/webhook/mercadopago", async (req, res) => {
  try {
    console.log("📩 Webhook Mercado Pago recebido:", JSON.stringify(req.body));

    const paymentId =
      req.body?.data?.id ||
      req.body?.id ||
      req.query?.id ||
      req.query?.["data.id"];

    if (!paymentId) {
      console.log("⚠️ Webhook sem paymentId.");
      return res.sendStatus(200);
    }

    const payment = await consultarPagamento(paymentId);

    const pedidoId = payment.external_reference;
    const status = payment.status;

    if (!pedidoId) {
      console.log("⚠️ Pagamento sem external_reference:", paymentId);
      return res.sendStatus(200);
    }

    const updateData = {
      statusPagamento: status,
      "pagamento.status": status,
      "pagamento.paymentId": String(paymentId),
      "pagamento.atualizadoEm": new Date(),
      "pagamento.statusDetail": payment.status_detail || null,
      "pagamento.valorRecebido": payment.transaction_amount || null,
    };

    if (status === "approved") {
      updateData.pago = true;
      updateData.pagoEm = new Date();
      updateData.status = "pendente";
    }

    if (status === "rejected" || status === "cancelled") {
      updateData.pago = false;
      updateData.status = "pagamento_recusado";
    }

    const pedidoRef = db.collection("pedidos").doc(String(pedidoId));
    const pedidoSnapAntes = await pedidoRef.get();
    const pedidoAntes = pedidoSnapAntes.exists ? pedidoSnapAntes.data() : null;

    await pedidoRef.set(updateData, {
      merge: true,
    });

    await notificarClienteSePagamentoAprovou({
      pedidoId,
      statusNovo: status,
    });

    console.log(`✅ Pedido ${pedidoId} atualizado. Pagamento: ${status}`);

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Erro no webhook Mercado Pago:", error);
    return res.sendStatus(500);
  }
});

module.exports = router;
