import { Router } from "express";
import {
  getNotifications,
  getUnreadNotifications,
  markNotificationRead,
  markAllRead,
  getSimulatedEmailLog,
} from "../controllers/notificationController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/simulated-emails/outbox", requireRole("ADMIN"), getSimulatedEmailLog);
router.get("/:recipientId", getNotifications);
router.get("/:recipientId/unread", getUnreadNotifications);
router.post("/:id/:recipientId/read", markNotificationRead);
router.post("/:recipientId/read-all", markAllRead);

export default router;