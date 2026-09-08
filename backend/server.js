import app from "./app.js";
import env from "./config/environment.js";
import expiryMonitor from "./blockchain/ExpiryMonitor.js";

const PORT = env.PORT;

// Dead man's switch: periodic checks plus a boot-time catch-up scan for any
// vault that expired while the process was down. Both are idempotent.
expiryMonitor.start();

app.listen(PORT, () => {
  console.log(`Ephemeral Secret Vault server running on http://localhost:${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Default Difficulty: ${env.DEFAULT_DIFFICULTY}`);
  console.log(`Key custody: ${env.encryptionKeySource}${env.legacyEncryptionKeyFilePresent ? " (legacy key file IGNORED)" : ""}`);
});
