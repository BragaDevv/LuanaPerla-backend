const express = require("express");
const router = express.Router();

const {
  geocodificarEndereco,
  calcularRota,
  calcularValorFrete,
} = require("../services/freteService");

router.post("/calcular", async (req, res) => {
  try {
    const { cep, rua, numero, bairro, cidade, estado, complemento } = req.body;

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

    const destino = await geocodificarEndereco(enderecoCompleto);

    const origemLat = Number(process.env.LOJA_LAT);
    const origemLng = Number(process.env.LOJA_LNG);

    if (!origemLat || !origemLng) {
      return res.status(500).json({
        ok: false,
        message: "Coordenadas da loja não configuradas.",
      });
    }

    const rota = await calcularRota({
      origemLat,
      origemLng,
      destinoLat: destino.lat,
      destinoLng: destino.lng,
    });

    const freteInfo = calcularValorFrete(rota.distanceMeters);

    return res.status(200).json({
      ok: true,
      enderecoFormatado: destino.enderecoFormatado,
      distanceMeters: rota.distanceMeters,
      duration: rota.duration,
      ...freteInfo,
    });
  } catch (error) {
    console.error("[FRETE] erro ao calcular frete:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Erro ao calcular frete.",
    });
  }
});

module.exports = router;
