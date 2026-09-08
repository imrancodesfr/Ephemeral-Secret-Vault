import { Router } from "express";
import { createVault, getVault, renewVault, getVaultStatus, activateRecovery, getAllVaults, getGuardianShare } from "../controllers/vaultController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/create", createVault);
router.get("/", getAllVaults);
router.get("/:id", getVault);
router.post("/:id/renew", renewVault);
router.post("/renew/:id", renewVault);
router.get("/:id/status", getVaultStatus);
router.post("/:id/recovery", activateRecovery);
router.post("/recovery/:id", activateRecovery);
router.get("/:id/guardian/:guardianId/share", getGuardianShare);

export default router;