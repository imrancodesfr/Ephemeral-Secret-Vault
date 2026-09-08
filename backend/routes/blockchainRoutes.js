import { Router } from "express";
import { getChain, getBlock, addTransaction, validateChain, getMerkleRoot, verifyMerkle } from "../controllers/blockchainController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", getChain);
router.get("/validate", validateChain);
router.get("/block/:index", getBlock);
router.post("/transaction", requireAuth, addTransaction);
router.get("/block/:index/merkle", getMerkleRoot);
router.post("/verify-merkle", verifyMerkle);

export default router;
