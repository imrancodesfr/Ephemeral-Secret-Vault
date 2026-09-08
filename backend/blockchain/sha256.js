import crypto from "crypto";

export function sha256(data) {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return crypto.createHash("sha256").update(str).digest("hex");
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
