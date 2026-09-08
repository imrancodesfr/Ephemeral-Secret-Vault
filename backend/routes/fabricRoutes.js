import { Router } from "express";
import {
  getNetworkStatus,
  getChaincodes,
  invokeChaincode,
  getChannelLedger,
} from "../controllers/fabricController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/status", requireAuth, getNetworkStatus);
router.get("/chaincodes", requireAuth, getChaincodes);
// Chaincode mutations are guarded per-function inside the controller (admin-only
// for createAsset/updateAsset/deleteAsset; reads remain open to any user).
router.post("/invoke", requireAuth, invokeChaincode);
router.get("/channel/:channel", requireAuth, getChannelLedger);

export default router;
