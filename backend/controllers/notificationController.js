import db from "../config/database.js";
import notificationService from "../services/notificationService.js";

export function getNotifications(req, res) {
  // The recipient is the authenticated user. A URL-supplied recipientId that
  // differs is ignored — notifications can never be read as another user.
  const recipientId = req.user.id;
  const notifications = db.notifications.findByRecipient(recipientId);

  // Share notifications are delivered once: the first read returns the payload,
  // then the stored copy is destroyed and subsequent reads show the marker.
  for (const n of notifications) notificationService.consumeOnRead(n);

  return res.json({ notifications, count: notifications.length });
}

export function getUnreadNotifications(req, res) {
  const recipientId = req.user.id;
  const notifications = db.notifications.findUnread(recipientId);
  for (const n of notifications) notificationService.consumeOnRead(n);
  return res.json({ notifications, count: notifications.length });
}

export function markNotificationRead(req, res) {
  const { id } = req.params;
  const changes = db.notifications.markRead(id, req.user.id);
  if (!changes) return res.status(404).json({ error: "Notification not found" });
  return res.json({ success: true });
}

export function markAllRead(req, res) {
  const changes = db.notifications.markAllRead(req.user.id);
  return res.json({ success: true, updated: changes });
}

export function getSimulatedEmailLog(req, res) {
  // ADMIN-only (enforced at the route). Always redacts any share fragment.
  return res.json({
    simulationOnly: true,
    note: "SIMULATION ONLY — no real email was sent. This log is demo-only and share payloads are stripped after delivery.",
    emails: notificationService.redactedOutboxEmails(),
  });
}