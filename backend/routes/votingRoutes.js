import { Router } from "express";
import { createProposal, castVote, getProposal, getResult, getAllProposals } from "../controllers/votingController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/proposal", requireAuth, createProposal);
router.post("/vote", requireAuth, castVote);
router.get("/", getAllProposals);
router.get("/:id", getProposal);
router.get("/:id/result", getResult);

export default router;