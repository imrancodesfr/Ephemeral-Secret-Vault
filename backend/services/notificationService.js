import crypto from "crypto";
import db from "../config/database.js";
import env from "../config/environment.js";

let transporter = null;
let mailerAvailable = false;

async function initMailer() {
  if (!env.SMTP_ENABLED) return false;
  try {
    const nodemailer = (await import("nodemailer")).default;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    mailerAvailable = true;
    return true;
  } catch (error) {
    console.warn(`[Notifications] Real SMTP unavailable (${error.message}). Falling back to simulated email.`);
    mailerAvailable = false;
    return false;
  }
}

function buildMessage(type, { vaultId, recoveryId, role, shareData }) {
  const point = shareData ? `\n\nYour one-time secret share (KEEP PRIVATE — delivered here only once and removed from storage the first time you view it):\n${JSON.stringify(shareData)}` : "";
  const messages = {
    VAULT_EXPIRED: {
      subject: `[Ephemeral Vault] Vault ${vaultId} has expired`,
      body: `The vault ${vaultId} has reached its expiry time and no renewal was received. Recovery mode has been activated automatically. If you are a guardian or the designated recovery recipient, you may now submit your share to reconstruct the secret.${
        recoveryId ? ` Recovery ID: ${recoveryId}` : ""
      }${point}`,
    },
    RECOVERY_STARTED: {
      subject: `[Ephemeral Vault] Recovery started for vault ${vaultId}`,
      body: `Recovery mode has been activated for vault ${vaultId} because the owner did not renew it before expiry.${
        recoveryId ? ` Recovery ID: ${recoveryId}` : ""
      } If you are a guardian, please submit your share. If you are the recovery recipient, you will receive the reconstructed secret once the required shares are gathered.${point}`,
    },
    SHARE_SUBMITTED: {
      subject: `[Ephemeral Vault] A guardian submitted a share for vault ${vaultId}`,
      body: `A guardian has submitted a share for the recovery of vault ${vaultId}. Keep going until the required threshold is reached.${point}`,
    },
    RECOVERY_COMPLETED: {
      subject: `[Ephemeral Vault] Recovery completed for vault ${vaultId}`,
      body: `Recovery for vault ${vaultId} completed successfully. The secret has been delivered to the designated recovery recipient and the vault is now permanently sealed.${point}`,
    },
    OWNER_RESPONDED: {
      subject: `[Ephemeral Vault] Owner renewed vault ${vaultId}`,
      body: `The owner renewed vault ${vaultId} before expiry. No recovery is needed.${point}`,
    },
    SHARE_ISSUED: {
      subject: `[Ephemeral Vault] You are a guardian for vault ${vaultId}`,
      body: `You have been chosen as a guardian for vault ${vaultId}. Keep this share private — it is delivered to you only once and removed from storage the first time you view it, or when recovery completes, whichever comes first.${point}`,
    },
  };
  return (
    messages[type] || {
      subject: `[Ephemeral Vault] Update on vault ${vaultId}`,
      body: `A notification was generated for vault ${vaultId}.${point}`,
    }
  );
}

const SHARE_FRAGMENT = /\{"x":\d+,"y":\[[\d,\s]*\]\}/g;
const CONSUMED_MARKER = "[share delivered once — removed from storage]";

class NotificationService {
  constructor() {
    this.simulatedEmails = [];
    initMailer();
  }

  // Delivery-once semantics for share notifications: the share is returned to
  // the current reader, but immediately scrubbed from persistent storage and
  // from the in-memory simulated outbox. A later read can never retrieve it.
  consumeOnRead(notification) {
    if (!notification || notification.type !== "SHARE_ISSUED") return notification;
    const taken = db.notifications.takeShareBody(notification.id);
    if (!taken) return notification; // already consumed or nothing to consume
    for (const email of this.simulatedEmails) {
      if (email.body && email.body.includes(taken)) {
        email.body = email.body.replace(taken, CONSUMED_MARKER);
      }
    }
    notification.read = true;
    return notification;
  }

  // The outbox is a demo aid. Whatever it displays never contains a share
  // fragment (defense in depth on top of consume-on-read).
  redactedOutboxEmails() {
    return this.simulatedEmails.map((e) => ({
      ...e,
      body: (e.body || "").replace(SHARE_FRAGMENT, CONSUMED_MARKER),
    }));
  }

  async send({ recipientId, recipientEmail, role, vaultId, recoveryId, type, shareData }) {
    const { subject, body } = buildMessage(type, { vaultId, recoveryId, role, shareData });
    const createdAt = Date.now();

    db.notifications.push({
      id: crypto.randomUUID(),
      recipientId: recipientId || "",
      recipientEmail,
      role,
      vaultId,
      recoveryId,
      type,
      subject,
      body,
      channels: "inapp,email",
      read: 0,
      createdAt,
    });

    const to = recipientEmail || (recipientId ? recipientId : "unknown");
    this.simulatedEmails.push({ to, subject, body, type, vaultId, createdAt });
    console.log(`[Notifications] -> ${to} [${type}] ${subject}`);

    if (mailerAvailable && recipientEmail) {
      try {
        await transporter.sendMail({
          from: env.SMTP_FROM,
          to: recipientEmail,
          subject,
          text: body,
        });
        console.log(`[Notifications] Real email delivered to ${recipientEmail}`);
      } catch (error) {
        console.warn(`[Notifications] Real email to ${recipientEmail} failed: ${error.message}`);
      }
    }

    return { id: null, recipientId, type, subject, body };
  }

  notifyVaultExpired(vault, recoveryId, additional = {}) {
    return this.notifyAll(vault, "VAULT_EXPIRED", recoveryId, additional);
  }

  notifyRecoveryStarted(vault, recoveryId, additional = {}) {
    return this.notifyAll(vault, "RECOVERY_STARTED", recoveryId, additional);
  }

  notifyRecoveryCompleted(vault, recoveryId, recipientId, recipientEmail, additional = {}) {
    return this.send({
      recipientId,
      recipientEmail,
      role: "RECIPIENT",
      vaultId: vault.id,
      recoveryId,
      type: "RECOVERY_COMPLETED",
    });
  }

  async notifyAll(vault, type, recoveryId, additional = {}) {
    if (!vault) return;

    const recipients = new Map();

    const guardianRows = db.guardians.findByVaultId(vault.id);
    for (const g of guardianRows) {
      const user = g.userId ? db.users.findById(g.userId) : null;
      const email = user?.email || additional.guardianEmails?.[g.userId];
      if (!recipients.has(g.userId)) {
        recipients.set(g.userId, { recipientId: g.userId, recipientEmail: email, role: "GUARDIAN" });
      }
    }

    const recipientId = vault.recoveryRecipient;
    if (recipientId) {
      const recipientUser = db.users.findById(recipientId);
      const email = recipientUser?.email || additional.recipientEmail;
      recipients.set(recipientId, {
        recipientId,
        recipientEmail: email,
        role: "RECIPIENT",
      });
    }

    for (const info of recipients.values()) {
      await this.send({
        recipientId: info.recipientId,
        recipientEmail: info.recipientEmail,
        role: info.role,
        vaultId: vault.id,
        recoveryId,
        type,
      });
    }

    return [...recipients.values()].map((r) => r.recipientId);
  }

  sendToRecipient(vault, recoveryId, recipientId, recipientEmail, type) {
    return this.send({
      recipientId,
      recipientEmail,
      role: "RECIPIENT",
      vaultId: vault.id,
      recoveryId,
      type,
    });
  }
}

export default new NotificationService();
