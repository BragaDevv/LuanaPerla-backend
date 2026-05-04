require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pushRoutes = require("./routes/pushRoutes");
const freteRoutes = require("./routes/freteRoutes");
const pagamentoRoutes = require("./routes/pagamentoRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", pushRoutes);
app.use("/frete", freteRoutes);
app.use("/pagamentos", pagamentoRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend Luana Perla rodando!",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
