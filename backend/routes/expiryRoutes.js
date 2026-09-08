import { Router } from "express";
import expiryMonitor from "../blockchain/ExpiryMonitor.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/status", (req, res) => {
  return res.json(expiryMonitor.getStatus());
});

router.post("/check", (req, res) => {
  expiryMonitor.checkExpiredVaults();
  return res.json({ success: true, status: expiryMonitor.getStatus() });
});

export default router;