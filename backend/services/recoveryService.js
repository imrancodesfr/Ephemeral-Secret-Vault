import db from "../config/database.js";
import shamirService from "./shamirService.js";
import encryptionService from "./encryptionService.js";
import miner from "../blockchain/Miner.js";
import crypto from "crypto";
import notificationService from "./notificationService.js";
import { sha256 } from "../blockchain/sha256.js";

class RecoveryService {
  submitShare({ recoveryId, guardianId, shareData }) {
    const recovery = db.recoveries.findById(recoveryId);
    if (!recovery) return { error: "Recovery not found" };

    // guardianId is the user ID of the guardian submitting (caller-identified as themselves).
    const guardian = db.guardians.findByUserIdAndVaultId(guardianId, recovery.vaultId);
    if (!guardian) return { error: "Guardian not authorized for this vault" };

    if (recovery.submittedShares.find((s) => s.guardianId === guardianId)) {
      return { error: "Share already submitted by this guardian" };
    }

    if (!shareData || !shareData.x || !Array.isArray(shareData.y)) {
      return { error: "Invalid share data provided" };
    }

    // Verify against the stored commitment: the submitted share must hash to the
    // value recorded when the vault was created. The long-term record holds only
    // this one-way commitment, not the share itself.
    const commitment = sha256(JSON.stringify(shareData));
    if (guardian.shareCommitment && commitment !== guardian.shareCommitment) {
      return { error: "Share does not match the commitment recorded for this guardian" };
    }

    recovery.submittedShares.push({
      guardianId,
      shareIndex: guardian.shareIndex,
      shareData,
      submittedAt: Date.now(),
    });

    db.recoveries.updateShares(recoveryId, recovery.submittedShares);
    db.guardians.updateSubmitted(guardianId, recovery.vaultId);

    miner.addTransaction("SHARE_SUBMITTED", recovery.vaultId, guardianId, {
      shareIndex: guardian.shareIndex,
      totalSubmitted: recovery.submittedShares.length,
    });

    return {
      success: true,
      submittedCount: recovery.submittedShares.length,
      requiredCount: recovery.requiredShares,
      allSharesReady: recovery.submittedShares.length >= recovery.requiredShares,
    };
  }

  getRecoveryStatus(recoveryId) {
    const recovery = db.recoveries.findById(recoveryId);
    if (!recovery) return { error: "Recovery not found" };

    return {
      id: recovery.id,
      vaultId: recovery.vaultId,
      status: recovery.status,
      requiredShares: recovery.requiredShares,
      submittedShares: recovery.submittedShares.length,
      allSharesReady: recovery.submittedShares.length >= recovery.requiredShares,
      createdAt: recovery.createdAt,
      completedAt: recovery.completedAt,
    };
  }

  getRecoveriesForUser(userId) {
    if (!userId) return [];

    const vaultsWhereOwner = db.vaults
      .findAll()
      .filter((v) => v.ownerId === userId)
      .map((v) => v.id);
    const vaultsWhereRecipient = db.vaults
      .findAll()
      .filter((v) => v.recoveryRecipient === userId)
      .map((v) => v.id);
    const vaultsWhereGuardian = db.guardians
      .findAll()
      .filter((g) => g.userId === userId)
      .map((g) => g.vaultId);

    const relevantVaultIds = new Set([...vaultsWhereOwner, ...vaultsWhereRecipient, ...vaultsWhereGuardian]);

    const allRecoveries = db.recoveries.findAll();
    return allRecoveries
      .filter((r) => relevantVaultIds.has(r.vaultId))
      .map((r) => {
        const vault = db.vaults.findById(r.vaultId);
        const isRecipient = vault && vault.recoveryRecipient === userId;
        const isGuardian = db.guardians
          .findByVaultId(r.vaultId)
          .some((g) => g.userId === userId && !g.hasSubmitted);
        return {
          id: r.id,
          vaultId: r.vaultId,
          status: r.status,
          requiredShares: r.requiredShares,
          submittedShares: r.submittedShares.length,
          allSharesReady: r.submittedShares.length >= r.requiredShares,
          isRecipient: !!isRecipient,
          guardianStillNeedsToSubmit: isGuardian,
          createdAt: r.createdAt,
        };
      });
  }

  async completeRecovery({ recoveryId, userId }) {
    const recovery = db.recoveries.findById(recoveryId);
    if (!recovery) return { error: "Recovery not found" };

    // A recovery completes exactly once. After completion the vault is sealed:
    // even with a valid share set, the ciphertext no longer exists to be rebuilt.
    if (recovery.status === "COMPLETED") {
      return { error: "This recovery has already been completed and the vault is permanently sealed" };
    }

    if (recovery.submittedShares.length < recovery.requiredShares) {
      return { error: "Not enough shares submitted" };
    }

    const vault = db.vaults.findById(recovery.vaultId);
    if (!vault) return { error: "Vault not found" };

    if (vault.status === "RECOVERED") {
      return { error: "Vault has already been recovered and its material destroyed" };
    }

    if (vault.status !== "RECOVERY_MODE") {
      return { error: "Vault is not in recovery mode" };
    }

    const isRecipient = userId && vault.recoveryRecipient === userId;
    const isGuardian = userId
      ? db.guardians.findByVaultId(vault.id).some((g) => g.userId === userId)
      : false;
    const isOwner = userId && vault.ownerId === userId;

    if (userId && !isRecipient && !isGuardian && !isOwner) {
      return { error: "Only the recovery recipient, a guardian, or the owner may complete recovery" };
    }

    const cryptoRow = db.vaultCrypto.findByVaultId(recovery.vaultId);
    if (!cryptoRow) return { error: "Vault crypto data not found" };

    const chunkLengths = JSON.parse(cryptoRow.chunkLengths || "[]");

    const sharesToUse = recovery.submittedShares.slice(0, vault.requiredShares);
    const shareObjects = sharesToUse.map((s) => s.shareData);

    const encryptedSecret = shamirService.reconstruct(
      shareObjects,
      cryptoRow.prime,
      chunkLengths,
      vault.requiredShares
    );
    const originalSecret = encryptionService.decryptFromString(encryptedSecret);

    // Ephemeral seal — the decrypted secret is returned to this caller exactly
    // once, then every recovery material is destroyed at rest:
    //   * the ciphertext, IV, auth tag and wrapped key are deleted from the DB,
    //   * the submitted share copies are scrubbed to metadata only,
    //   * the share notifications are wiped.
    // This is why a completed recovery can never be replayed.
    db.vaultCrypto.destroyForVault(recovery.vaultId);
    db.recoveries.updateStatus(recoveryId, "COMPLETED", Date.now());
    db.vaults.update(recovery.vaultId, { status: "RECOVERED" });

    // One-time semantics: destroy the retained share copies now that the secret
    // has been reconstructed. Only validation metadata (guardian, index, time)
    // remains for the audit trail.
    db.recoveries.clearShareData(recoveryId);
    db.notifications.wipeShareBodies(recovery.vaultId);

    miner.addTransaction("RECOVERY_COMPLETED", recovery.vaultId, userId, {
      recoveredAt: Date.now(),
    });

    const recipientUser = db.users.findById(vault.recoveryRecipient);
    try {
      await notificationService.notifyRecoveryCompleted(
        vault,
        recoveryId,
        vault.recoveryRecipient,
        recipientUser?.email
      );
    } catch (notifyErr) {
      console.warn("[Recovery] Notification after completion failed:", notifyErr.message);
    }

    return {
      success: true,
      message: "Secret recovered successfully",
      secret: originalSecret,
      recoveryRecipient: vault.recoveryRecipient,
      recoveredAt: Date.now(),
    };
  }
}

export default new RecoveryService();
