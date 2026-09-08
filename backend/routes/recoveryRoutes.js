import { Router } from "express";
import { submitShare, getRecoveryStatus, completeRecovery, getRecoveriesForUser } from "../controllers/recoveryController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/share", submitShare);
router.get("/user/:userId", getRecoveriesForUser);
router.get("/:id/status", getRecoveryStatus);
router.post("/:id/complete", completeRecovery);

export default router;