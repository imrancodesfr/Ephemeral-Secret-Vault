import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

// Minimal .env loader (key=value, # comments, quotes stripped, never overrides
// an env var that is already set, e.g. from the shell or a secrets manager).
function loadDotEnv() {
  const filePath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(filePath)) return;
  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (key in process.env) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore unreadable/malformed .env; rely on environment
  }
}
loadDotEnv();

// Legacy location where older versions of this project persisted the key.
const LEGACY_KEY_PATH = path.join(DATA_DIR, ".encryption-key");
const legacyEncryptionKeyFilePresent = fs.existsSync(LEGACY_KEY_PATH);

// ── ENCRYPTION_KEY ───────────────────────────────────────────────────────────
// Security rule: the master key must NEVER be persisted automatically beside the
// database. It is read from the environment (ENCRYPTION_KEY, or a .env file you
// create yourself, or a secrets manager). If it is not set, the process uses an
// ephemeral per-boot key: every vault created in that boot becomes undecryptable
// after the process exits. That is a safe default, not a silent data-loss trap:
// we log it loudly, and ephemeral mode is clearly exposed via /api/health.
let encryptionKeySource;
let ENCRYPTION_KEY;
if (process.env.ENCRYPTION_KEY) {
  ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  encryptionKeySource = "environment";
} else {
  ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  encryptionKeySource = "ephemeral";
}

// JWT_SECRET: sign/verify HS256 tokens. Random at boot if not configured.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

const simulationMode = process.env.SIMULATION_MODE !== "false";

const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET,
  ENCRYPTION_KEY,
  simulationMode,
  encryptionKeySource,
  legacyEncryptionKeyFilePresent,
  GANACHE_URL: process.env.GANACHE_URL || "http://127.0.0.1:7545",
  VAULT_EXPIRY_MINUTES: parseInt(process.env.VAULT_EXPIRY_MINUTES) || 2,
  DEFAULT_DIFFICULTY: parseInt(process.env.DEFAULT_DIFFICULTY) || 4,
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, "vault.db"),
  EXPIRY_CHECK_INTERVAL_MS: parseInt(process.env.EXPIRY_CHECK_INTERVAL_MS) || 30000,
  SMTP_ENABLED: process.env.SMTP_ENABLED === "true",
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "ephemeral-vault@example.com",
  ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL || "",
  ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD || "",
  // Comma-separated allowlist of browser origins that may call this API.
  // Defaults to local development origins; tighten for any deployed site.
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (process.env.NODE_ENV !== "test") {
  if (legacyEncryptionKeyFilePresent) {
    console.warn(
      `\n[SECURITY] Found legacy encryption-key file at "${LEGACY_KEY_PATH}".\n` +
        `            It will NOT be read or used. Keeping a master key on the same disk as the\n` +
        `            database weakens protection of encrypted vaults. Please delete that file and\n` +
        `            provide the key through ENCRYPTION_KEY (environment or .env) instead.\n`
    );
  }
  if (encryptionKeySource === "ephemeral") {
    console.warn(
      `\n[SECURITY] ENCRYPTION_KEY is NOT set. This process created an ephemeral key that exists\n` +
        `            only in memory. Any vaults you create now will NOT be decryptable after this\n` +
        `            process exits. For persistent, safe use: create a .env file (see .env.example)\n` +
        `            and set ENCRYPTION_KEY to a long random value. Never store it beside the database.\n`
    );
  }
}

export default env;