const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (!MERCADO_PAGO_ACCESS_TOKEN) {
  console.warn("⚠️ MERCADO_PAGO_ACCESS_TOKEN não encontrado no ambiente.");
}

async function criarPagamentoPix({
  pedidoId,
  valor,
  nome,
  email,
  telefone,
  backendUrl,
}) {
  const body = {
    transaction_amount: Number(Number(valor).toFixed(2)),
    description: `Pedido Luana Perla #${pedidoId}`,
    payment_method_id: "pix",
    external_reference: String(pedidoId),
    notification_url: `${backendUrl}/pagamentos/webhook/mercadopago`,
    payer: {
      email: email || "cliente@luanaperla.com.br",
      first_name: nome || "Cliente",
    },
  };

  if (telefone) {
    body.payer.phone = {
      number: String(telefone).replace(/\D/g, ""),
    };
  }

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pedido-${pedidoId}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Erro Mercado Pago ao criar Pix:", data);
    throw {
      status: response.status,
      message: "Erro ao criar Pix no Mercado Pago.",
      details: data,
    };
  }

  return data;
}

async function consultarPagamento(paymentId) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Erro Mercado Pago ao consultar pagamento:", data);
    throw {
      status: response.status,
      message: "Erro ao consultar pagamento no Mercado Pago.",
      details: data,
    };
  }

  return data;
}

module.exports = {
  criarPagamentoPix,
  consultarPagamento,
};
