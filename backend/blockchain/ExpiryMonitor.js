import db from "../config/database.js";
import env from "../config/environment.js";
import notificationService from "../services/notificationService.js";
import miner from "../blockchain/Miner.js";
import crypto from "crypto";

class ExpiryMonitor {
  constructor() {
    this.timer = null;
    this.checking = false;
    this.totalAutoRecoveries = 0;
  }

  start() {
    if (this.timer) return;
    const interval = env.EXPIRY_CHECK_INTERVAL_MS || 30000;
    this.timer = setInterval(() => this.checkExpiredVaults(), interval);
    this.timer.unref?.();
    console.log(`[ExpiryMonitor] Started - checking every ${interval}ms for expired vaults`);
    // Boot-time catch-up: any vault that expired while the process was down
    // must enter recovery immediately, not only at the next tick.
    this.runBootCatchUp();
  }

  // Dead man's switch catch-up scan, run synchronously at boot.
  runBootCatchUp() {
    const before = this.totalAutoRecoveries;
    this.checkExpiredVaults();
    const created = this.totalAutoRecoveries - before;
    if (created > 0) {
      console.log(`[ExpiryMonitor] Boot catch-up: ${created} expired vault(s) entered recovery mode.`);
    }
    return created;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  createRecoveryForVault(vault) {
    const recovery = {
      id: crypto.randomUUID(),
      vaultId: vault.id,
      status: "AWAITING_SHARES",
      requiredShares: vault.requiredShares,
      submittedShares: [],
      votes: [],
      createdAt: Date.now(),
      completedAt: null,
    };
    db.recoveries.push(recovery);
    return recovery;
  }

  checkExpiredVaults() {
    if (this.checking) return;
    this.checking = true;
    try {
      const now = Date.now();
      const allVaults = db.vaults.findAll();

      for (const vault of allVaults) {
        if (vault.status !== "ACTIVE" || now <= vault.expiryTimestamp) continue;

        // Idempotency: repeated scans (tick, manual /expiry/check, boot catch-up)
        // must never create a duplicate recovery or duplicate notifications.
        const alreadyRecovered = db.vaults.findById(vault.id).status !== "ACTIVE";
        const existing = db.recoveries.findByVaultId(vault.id);
        if (alreadyRecovered || existing) {
          if (vault.status === "ACTIVE" && existing) {
            // A recovery already exists but the vault still says ACTIVE — align it
            // without emitting a second RECOVERY_STARTED.
            db.vaults.update(vault.id, { status: "RECOVERY_MODE" });
          }
          continue;
        }

        db.vaults.update(vault.id, { status: "RECOVERY_MODE" });

        const recovery = this.createRecoveryForVault(vault);

        miner.addTransaction("VAULT_EXPIRED", vault.id, vault.ownerId, {
          expiredAt: now,
          autoRecoveryId: recovery.id,
          reason: "owner-unresponsive-dead-mans-switch",
        });
        miner.addTransaction("RECOVERY_STARTED", vault.id, vault.ownerId, {
          requiredShares: vault.requiredShares,
          autoTriggered: true,
        });

        console.log(`[ExpiryMonitor] Vault ${vault.id} EXPIRED -> RECOVERY_MODE. Recovery ${recovery.id} created.`);

        notificationService.notifyVaultExpired(vault, recovery.id);
        notificationService.notifyRecoveryStarted(vault, recovery.id);

        this.totalAutoRecoveries += 1;
      }
    } catch (error) {
      console.error("[ExpiryMonitor] Error during expiry check:", error.message);
    } finally {
      this.checking = false;
    }
  }

  getStatus() {
    return {
      running: !!this.timer,
      checkIntervalMs: env.EXPIRY_CHECK_INTERVAL_MS || 30000,
      totalAutoRecoveries: this.totalAutoRecoveries,
      now: Date.now(),
    };
  }
}

export default new ExpiryMonitor();
