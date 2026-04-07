const express = require("express");

const router = express.Router();

router.post("/calcular", async (req, res) => {
  try {
    const taxaBase = 6;
    const valorKm = 2.5;
    const freteMinimo = 8;

    const distanceKm = 3; // fixo por enquanto, só para teste

    const freteBruto = taxaBase + distanceKm * valorKm;
    const freteFinal = Math.max(freteMinimo, freteBruto);

    return res.status(200).json({
      ok: true,
      distanceKm,
      taxaBase,
      valorKm,
      freteMinimo,
      frete: Number(freteFinal.toFixed(2)),
      mensagem: "Frete calculado com sucesso.",
    });
  } catch (error) {
    console.error("[FRETE] erro ao calcular frete:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro ao calcular frete.",
    });
  }
});

module.exports = router;