import crypto from "crypto";
import env from "../config/environment.js";

// Minimal, standards-compliant HS256 JWT. Digital signing/verification is done
// with Node's built-in HMAC-SHA256 (no homemade crypto) and constant-time
// signature comparison. Sessions are bearer tokens presented by the frontend.
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign64(data) {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(data).digest("base64url");
}

export function signToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + Math.max(1, ttlSeconds) }));
  return `${header}.${body}.${sign64(`${header}.${body}`)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign64(`${header}.${body}`);
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || Date.now() / 1000 >= payload.exp) return null;
  return payload;
}

function readToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookieMatch = (req.headers.cookie || "").match(/(?:^|;\s*)ev_token=([^;]+)/);
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
}

export function requireAuth(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }
  req.user = { id: payload.sub, email: payload.email || null, role: payload.role || "OWNER" };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required. Please sign in." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: your role does not permit this action" });
    }
    next();
  };
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `ev_token=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL_SECONDS}; SameSite=Lax`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "ev_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}