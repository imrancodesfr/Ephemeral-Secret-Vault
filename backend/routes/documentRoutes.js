import { Router } from "express";
import { registerDocument, verifyDocument, getDocument, getAllDocuments } from "../controllers/documentController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", requireAuth, registerDocument);
router.post("/verify", requireAuth, verifyDocument);
router.get("/all", requireAuth, getAllDocuments);
router.get("/:id", requireAuth, getDocument);

export default router;