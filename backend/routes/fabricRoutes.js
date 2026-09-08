import { Router } from "express";
import {
  getNetworkStatus,
  getChaincodes,
  invokeChaincode,
  getChannelLedger,
} from "../controllers/fabricController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/status", getNetworkStatus);
router.get("/chaincodes", getChaincodes);
router.post("/invoke", requireAuth, invokeChaincode);
router.get("/channel/:channel", getChannelLedger);

export default router;
