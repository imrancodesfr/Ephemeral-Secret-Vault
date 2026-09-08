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

// Strict CORS: only allowlisted browser origins may call this API. Requests
// with a disallowed Origin are rejected; non-browser (curl/CLI) clients are
// unaffected. Never use the wildcard in production — it would let any site
// read or submit authenticated requests.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
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

// 404 for unknown API routes (JSON), keep SPA file serving for root.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler — never leak stack traces to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error("[Error]", err.stack || err);
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message,
  });
});

export default app;
