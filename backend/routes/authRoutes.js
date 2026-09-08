import { Router } from "express";
import { register, login, logout, me, getUsers } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.get("/users", requireAuth, getUsers);

export default router;