const express = require("express");
const router = express.Router();

const {
  geocodificarEndereco,
  calcularRota,
  calcularValorFrete,
} = require("../services/freteService");

router.post("/calcular", async (req, res) => {
  try {
    const {
      cep,
      rua,
      numero,
      bairro,
      cidade,
      estado,
      complemento,
      freteMinimo,
      taxaBase,
      valorKm,
    } = req.body;

    if (!cep || !rua || !numero || !bairro || !cidade || !estado) {
      return res.status(400).json({
        ok: false,
        message: "Endereço incompleto para calcular o frete.",
      });
    }

    const enderecoCompleto = [
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      "Brasil",
    ]
      .filter(Boolean)
      .join(", ");

    const origemLat = Number(process.env.LOJA_LAT);
    const origemLng = Number(process.env.LOJA_LNG);

    if (Number.isNaN(origemLat) || Number.isNaN(origemLng)) {
      return res.status(500).json({
        ok: false,
        message: "Coordenadas da loja não configuradas corretamente.",
      });
    }

    console.log("[FRETE] origem loja:", {
      origemLat,
      origemLng,
    });

    console.log("[FRETE] endereço recebido:", {
      cep,
      rua,
      numero,
      bairro,
      cidade,
      estado,
      complemento,
      freteMinimo,
      taxaBase,
      valorKm,
    });

    console.log("[FRETE] endereço montado:", enderecoCompleto);

    const destino = await geocodificarEndereco(enderecoCompleto);

    console.log("[FRETE] destino geocodificado:", destino);

    const rota = await calcularRota({
      origemLat,
      origemLng,
      destinoLat: destino.lat,
      destinoLng: destino.lng,
    });

    const freteInfo = calcularValorFrete(rota.distanceMeters, {
      freteMinimo,
      taxaBase,
      valorKm,
    });

    return res.status(200).json({
      ok: true,
      enderecoFormatado: destino.enderecoFormatado,
      distanceMeters: rota.distanceMeters,
      duration: rota.duration,
      detalhesGeocoding: destino.detalhes,
      ...freteInfo,
    });
  } catch (error) {
    console.error("[FRETE] erro ao calcular frete:", error);

    const message = error?.message || "Erro ao calcular frete.";

    const isErroEndereco =
      message.includes("Endereço incompleto") ||
      message.includes("Endereço não encontrado") ||
      message.includes("Não foi possível localizar") ||
      message.includes("Coordenadas não encontradas") ||
      message.includes("Erro no Geocoding") ||
      message.includes("Configuração de frete inválida");

    return res.status(isErroEndereco ? 400 : 500).json({
      ok: false,
      message,
    });
  }
});

module.exports = router;
