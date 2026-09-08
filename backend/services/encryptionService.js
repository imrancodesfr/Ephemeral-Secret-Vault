import crypto from "crypto";
import env from "../config/environment.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

// Derive a stable 32-byte master key from the installation secret. The derived
// key only lives in memory for this process; the source secret is persisted in
// backend/data/.encryption-key (restricted file) unless set via the environment.
// NOTE: keep that key file separate from the database to preserve vault confidentiality.
class EncryptionService {
  constructor() {
    this.masterKey = this._deriveMasterKey();
  }

  _deriveMasterKey() {
    // If the env key is not a full 32-byte hex, hash it deterministically.
    const raw = env.ENCRYPTION_KEY || "default-insecure-key-change-me";
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "utf8");
    return crypto.createHash("sha256").update(buf).digest(); // 32 bytes
  }

  // Encrypt: random per-vault data key -> wrapped with master key; payload encrypted under data key.
  encrypt(text) {
    const dataKey = crypto.randomBytes(KEY_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dataKey, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    const wrappedIv = crypto.randomBytes(IV_LENGTH);
    const wrapCipher = crypto.createCipheriv(ALGORITHM, this.masterKey, wrappedIv);
    let wrapped = wrapCipher.update(dataKey, "binary", "hex");
    wrapped += wrapCipher.final("hex");
    const wrapTag = wrapCipher.getAuthTag().toString("hex");

    return {
      iv,
      encryptedData: encrypted,
      tag,
      wrappedKey: `${wrappedIv.toString("hex")}.${wrapped}.${wrapTag}`,
      algo: ALGORITHM,
    };
  }

  decrypt(encryptedObj) {
    const dataKey = this._unwrapKey(encryptedObj.wrappedKey);
    const decipher = crypto.createDecipheriv(ALGORITHM, dataKey, Buffer.from(encryptedObj.iv, "hex"));
    decipher.setAuthTag(Buffer.from(encryptedObj.tag, "hex"));
    let decrypted = decipher.update(encryptedObj.encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  _unwrapKey(wrappedKey) {
    const [ivHex, wrappedHex, tagHex] = String(wrappedKey || "").split(".");
    if (!ivHex || !wrappedHex || !tagHex) throw new Error("Invalid wrapped key format");
    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let key = decipher.update(wrappedHex, "hex", "binary");
    key += decipher.final("binary");
    return Buffer.from(key, "binary");
  }

  decryptFromString(encryptedString) {
    const obj = JSON.parse(encryptedString);
    return this.decrypt(obj);
  }

  encryptToString(text) {
    return JSON.stringify(this.encrypt(text));
  }
}

export default new EncryptionService();