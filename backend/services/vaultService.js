import crypto from "crypto";
import db from "../config/database.js";
import encryptionService from "./encryptionService.js";
import shamirService from "./shamirService.js";
import miner from "../blockchain/Miner.js";
import env from "../config/environment.js";
import { sha256 } from "../blockchain/sha256.js";
import notificationService from "./notificationService.js";

class VaultService {
  createVault({ secret, totalShares, requiredShares, expiryMinutes, ownerId, guardians, recoveryRecipient }) {
    // Service-level guards mirror the controller's checks so any caller is safe.
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("secret must be a non-empty string");
    }
    const tShares = Number(totalShares);
    const rShares = Number(requiredShares);
    if (!Number.isInteger(tShares) || tShares < 2) {
      throw new Error("totalShares must be an integer >= 2");
    }
    if (!Number.isInteger(rShares) || rShares < 2 || rShares > tShares) {
      throw new Error("requiredShares must satisfy 2 <= requiredShares <= totalShares");
    }
    const expiryNum = Number(expiryMinutes);
    if (!Number.isFinite(expiryNum) || expiryNum <= 0) {
      throw new Error("expiryMinutes must be a positive number");
    }

    const vaultId = "VLT-" + crypto.randomUUID().slice(0, 8).toUpperCase();

    const encryptedSecret = encryptionService.encryptToString(secret);

    const { shares, threshold, prime, chunkLengths } = shamirService.split(encryptedSecret, tShares, rShares);

    const expiryTimestamp = Date.now() + expiryNum * 60 * 1000;

    const vault = {
      id: vaultId,
      ownerId,
      totalShares: tShares,
      requiredShares: rShares,
      expiryTimestamp,
      recoveryRecipient,
      status: "ACTIVE",
      createdAt: Date.now(),
      lastRenewal: Date.now(),
      prime,
      chunkLengths,
      encryptedSecret,
    };

    db.vaults.push(vault);

    if (guardians && guardians.length > 0) {
      if (guardians.length !== tShares) {
        throw new Error(`Expected exactly ${tShares} guardians, received ${guardians.length}`);
      }
      guardians.forEach((g, i) => {
        const guardianId = crypto.randomUUID();
        const shareCommitment = sha256(JSON.stringify(shares[i]));
        db.guardians.push({
          id: guardianId,
          vaultId,
          userId: g.userId,
          walletAddress: g.walletAddress || null,
          email: g.email || null,
          shareIndex: i + 1,
          shareCommitment,
          hasSubmitted: false,
        });

        // Deliver the guardian's own share once via notification (temporary in-app copy; long-term record holds only the commitment hash).
        notificationService.send({
          recipientId: g.userId,
          recipientEmail: g.email || (g.userId ? db.users.findById(g.userId)?.email : undefined),
          role: "GUARDIAN",
          vaultId,
          recoveryId: null,
          type: "SHARE_ISSUED",
          shareData: shares[i],
        });
      });
    }

    miner.addTransaction("VAULT_CREATED", vaultId, ownerId, {
      totalShares,
      requiredShares,
      expiryMinutes,
      guardianCount: guardians ? guardians.length : 0,
    });

    return { vault, shares };
  }

  getVault(vaultId) {
    const vault = db.vaults.findById(vaultId);
    if (!vault) return null;
    return {
      id: vault.id,
      ownerId: vault.ownerId,
      totalShares: vault.totalShares,
      requiredShares: vault.requiredShares,
      expiryTimestamp: vault.expiryTimestamp,
      status: vault.status,
      createdAt: vault.createdAt,
      lastRenewal: vault.lastRenewal,
      recoveryRecipient: vault.recoveryRecipient,
    };
  }

  renewVault(vaultId, userId) {
    const vault = db.vaults.findById(vaultId);
    if (!vault) return { error: "Vault not found" };
    if (vault.ownerId !== userId) return { error: "Not authorized" };
    if (vault.status !== "ACTIVE") return { error: "Vault is not active" };

    const renewalMinutes = env.VAULT_EXPIRY_MINUTES || 2;
    const newExpiry = Date.now() + renewalMinutes * 60 * 1000;
    db.vaults.update(vaultId, { lastRenewal: Date.now(), expiryTimestamp: newExpiry });

    miner.addTransaction("VAULT_RENEWED", vaultId, userId, {
      newExpiry,
    });

    return { success: true, vault: this.getVault(vaultId) };
  }

  getVaultStatus(vaultId) {
    const vault = db.vaults.findById(vaultId);
    if (!vault) return { error: "Vault not found" };

    const now = Date.now();
    let currentStatus = vault.status;

    if (currentStatus === "ACTIVE" && now > vault.expiryTimestamp) {
      db.vaults.update(vaultId, { status: "RECOVERY_MODE" });
      currentStatus = "RECOVERY_MODE";
      miner.addTransaction("VAULT_EXPIRED", vaultId, vault.ownerId, {
        expiredAt: now,
      });
    }

    return {
      id: vaultId,
      status: currentStatus,
      expiryTimestamp: vault.expiryTimestamp,
      lastRenewal: vault.lastRenewal,
      isExpired: now > vault.expiryTimestamp,
      timeRemaining: vault.expiryTimestamp - now,
    };
  }

  async activateRecovery(vaultId) {
    const vault = db.vaults.findById(vaultId);
    if (!vault) return { error: "Vault not found" };

    const now = Date.now();
    if (vault.status === "RECOVERED") {
      return { error: "Vault has already been recovered" };
    }
    if (vault.status !== "RECOVERY_MODE" && vault.status !== "ACTIVE") {
      return { error: `Vault is not in a recoverable state (${vault.status})` };
    }
    if (vault.status === "ACTIVE" && now <= vault.expiryTimestamp) {
      return { error: "Vault has not expired yet - only the owner may renew it before expiry" };
    }

    const existing = db.recoveries.findByVaultId(vaultId);
    if (existing && existing.status !== "COMPLETED") {
      return { error: "A recovery is already in progress for this vault", recoveryId: existing.id };
    }

    db.vaults.update(vaultId, { status: "RECOVERY_MODE" });

    const recovery = {
      id: crypto.randomUUID(),
      vaultId,
      status: "AWAITING_SHARES",
      requiredShares: vault.requiredShares,
      submittedShares: [],
      votes: [],
      createdAt: Date.now(),
      completedAt: null,
    };

    db.recoveries.push(recovery);

    miner.addTransaction("RECOVERY_STARTED", vaultId, vault.ownerId, {
      requiredShares: vault.requiredShares,
    });

    const { default: notificationService } = await import("./notificationService.js");
    notificationService.notifyRecoveryStarted(vault, recovery.id);

    return { success: true, recovery };
  }

  getGuardians(vaultId) {
    return db.guardians.findByVaultId(vaultId);
  }

  checkExpiry(vaultId) {
    const vault = db.vaults.findById(vaultId);
    if (!vault) return { error: "Vault not found" };
    const now = Date.now();
    return {
      isExpired: now > vault.expiryTimestamp,
      expiryTimestamp: vault.expiryTimestamp,
      currentTime: now,
      status: vault.status,
    };
  }

  getAllVaults(userId) {
    let vaults = db.vaults.findAll();

    if (userId) {
      const guardianVaultIds = db.guardians
        .findAll()
        .filter((g) => g.userId === userId)
        .map((g) => g.vaultId);
      vaults = vaults.filter(
        (v) => v.ownerId === userId || v.recoveryRecipient === userId || guardianVaultIds.includes(v.id)
      );
    }

    return vaults.map((v) => this.getVault(v.id));
  }
}

export default new VaultService();
