import { Router } from "express";
import { mine, getStatus } from "../controllers/miningController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/mine", requireAuth, mine);
router.get("/status", getStatus);

export default router;
