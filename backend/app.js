import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import env from "./config/environment.js";

import authRoutes from "./routes/authRoutes.js";
import vaultRoutes from "./routes/vaultRoutes.js";
import recoveryRoutes from "./routes/recoveryRoutes.js";
import blockchainRoutes from "./routes/blockchainRoutes.js";
import miningRoutes from "./routes/miningRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import supplyChainRoutes from "./routes/supplyChainRoutes.js";
import votingRoutes from "./routes/votingRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import expiryRoutes from "./routes/expiryRoutes.js";
import fabricRoutes from "./routes/fabricRoutes.js";
import ethereumRoutes from "./routes/ethereumRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use("/api/auth", authRoutes);
app.use("/api/vault", vaultRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/blockchain", blockchainRoutes);
app.use("/api/mining", miningRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/supply-chain", supplyChainRoutes);
app.use("/api/voting", votingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/expiry", expiryRoutes);
app.use("/api/fabric", fabricRoutes);
app.use("/api/ethereum", ethereumRoutes);

// Public health + security-status report. Never reveals secrets — the key is
// reported only by its custody source (environment or ephemeral) so operators
// and the dashboard can warn when it is missing or incorrectly persisted.
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: Date.now(),
    message: "Ephemeral Secret Vault API is running",
    simulationMode: env.simulationMode,
    encryption: {
      persistent: env.encryptionKeySource === "environment",
      source: env.encryptionKeySource,
      legacyKeyFilePresent: env.legacyEncryptionKeyFilePresent,
    },
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

export default app;
