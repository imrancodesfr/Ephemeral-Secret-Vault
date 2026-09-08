import { Router } from "express";
import { createAsset, transferAsset, updateAsset, getAssetHistory, getAllAssets } from "../controllers/supplyChainController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/create", requireAuth, createAsset);
router.post("/transfer", requireAuth, transferAsset);
router.post("/update", requireAuth, updateAsset);
router.get("/all", requireAuth, getAllAssets);
router.get("/:id/history", requireAuth, getAssetHistory);

export default router;