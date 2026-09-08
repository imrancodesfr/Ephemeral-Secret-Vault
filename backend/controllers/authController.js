import crypto from "crypto";
import db from "../config/database.js";
import { signToken, setSessionCookie } from "../middleware/auth.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

// Login protection: in-memory per (email+IP) attempt tracking with exponential
// backoff. Deliberately coarse and process-local — adequate for the academic
// setting, and swap-in ready for a real store like Redis.
const RATE_BASE_MS = 5 * 1000;
const RATE_MAX_MS = 15 * 60 * 1000;
const rateAttempts = new Map();

function rateKey(email, ip) {
  return `${String(email || "").toLowerCase().trim()}|${ip || ""}`;
}

function lockInfo(key) {
  const rec = rateAttempts.get(key) || { failCount: 0, lockedUntil: 0 };
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
    rec.failCount = 0;
    rec.lockedUntil = 0;
  }
  return rec;
}

// Doubling wait after consecutive failures: 5s, 10s, 20s, 40s … capped at 15m.
function recordFailure(key) {
  const rec = lockInfo(key);
  rec.failCount += 1;
  const wait = Math.min(RATE_MAX_MS, RATE_BASE_MS * Math.pow(2, rec.failCount - 1));
  rec.lockedUntil = Date.now() + wait;
  rateAttempts.set(key, rec);
  return wait;
}

function recordSuccess(key) {
  rateAttempts.delete(key);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, expectedHash] = stored.split("$");
  if (!salt || !expectedHash) return false;
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

// A throwaway, syntactically-valid hash used to keep scrypt cost identical when
// no account exists, so response timing cannot reveal whether an email is
// registered (the error message is also unified).
const DUMMY_HASH = `scrypt$${crypto.randomBytes(16).toString("hex")}$${"0".repeat(KEY_LEN * 2)}`;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletAddress: user.walletAddress || null,
  };
}

function issueSession(req, res, user) {
  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  setSessionCookie(res, token);
  return {
    success: true,
    token,
    user: publicUser(user),
  };
}

export function register(req, res) {
  const { name, email, password, role, walletAddress } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
    return res.status(400).json({ error: "Name must be 2–50 characters" });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== "string" || email.length > 254 || !emailPattern.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Strength rule: length + letter + number + special character. Weak
  // passwords like "abcdef" or "password1" are rejected.
  const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;
  if (typeof password !== "string" || !passwordPattern.test(password)) {
    return res.status(400).json({
      error: "Password must be 8–64 characters and include a letter, a number, and a special character",
    });
  }

  const allowedRoles = ["OWNER", "GUARDIAN", "RECIPIENT", "ADMIN"];
  const assignedRole = role || "OWNER";
  if (!allowedRoles.includes(assignedRole)) {
    return res.status(400).json({ error: "Invalid role. Allowed: OWNER, GUARDIAN, RECIPIENT, ADMIN" });
  }

  if (typeof walletAddress === "string" && walletAddress.length > 120) {
    return res.status(400).json({ error: "Wallet address is too long (max 120 characters)" });
  }

  if (db.users.findByEmail(email)) {
    return res.status(400).json({ error: "Email already registered" });
  }

  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role: assignedRole,
    walletAddress: walletAddress || null,
    createdAt: Date.now(),
  };

  db.users.push(user);

  return res.json(issueSession(req, res, user));
}

export function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const key = rateKey(normalizedEmail, req.ip);

  const info = lockInfo(key);
  if (info.lockedUntil > Date.now()) {
    const waitSec = Math.ceil((info.lockedUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(waitSec));
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${waitSec >= 60 ? `${Math.ceil(waitSec / 60)} minute(s)` : `${waitSec} second(s)`}.`,
    });
  }

  const user = db.users.findByEmail(normalizedEmail);

  // Unified verification: always pay scrypt cost, always return the same error.
  const ok = user ? verifyPassword(String(password), user.passwordHash) : verifyPassword(String(password), DUMMY_HASH);

  if (!user || !ok) {
    recordFailure(key);
    return res.status(401).json({ error: "Invalid email or password." });
  }

  recordSuccess(key);
  return res.json(issueSession(req, res, user));
}

export function logout(req, res) {
  res.setHeader("Set-Cookie", "ev_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  return res.json({ success: true });
}

export function me(req, res) {
  const user = db.users.findById(req.user.id);
  if (!user) return res.status(401).json({ error: "Session no longer valid" });
  return res.json({ user: publicUser(user) });
}

export function getUsers(req, res) {
  const users = db.users.findAll();
  return res.json({ users });
}