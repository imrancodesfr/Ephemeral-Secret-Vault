import vaultService from "../services/vaultService.js";
import db from "../config/database.js";

function isInvolved(vault, userId) {
  if (!vault) return false;
  if (vault.ownerId === userId) return true;
  if (vault.recoveryRecipient === userId) return true;
  const guardian = db.guardians.findByUserIdAndVaultId(userId, vault.id);
  return !!guardian;
}

export function createVault(req, res) {
  // Identity is taken from the verified session — never from the client.
  const ownerId = req.user.id;
  const { secret, totalShares, requiredShares, expiryMinutes, guardians, recoveryRecipient } = req.body;

  if (!secret) {
    return res.status(400).json({ error: "secret is required" });
  }
  if (typeof secret !== "string" || secret.length === 0) {
    return res.status(400).json({ error: "secret must be a non-empty string" });
  }
  if (secret.length > 100000) {
    return res.status(400).json({ error: "secret is too large (max 100KB) — protects against memory exhaustion" });
  }
  if (!Number.isInteger(totalShares) || totalShares < 2) {
    return res.status(400).json({ error: "totalShares must be an integer >= 2" });
  }
  if (!Number.isInteger(requiredShares) || requiredShares < 2) {
    return res.status(400).json({ error: "requiredShares must be an integer >= 2" });
  }
  if (requiredShares > totalShares) {
    return res.status(400).json({ error: "requiredShares cannot exceed totalShares" });
  }

  const providedExpiry = expiryMinutes !== undefined ? Number(expiryMinutes) : 2;
  if (!Number.isFinite(providedExpiry) || providedExpiry < 0.02) {
    return res.status(400).json({ error: "expiryMinutes must be a positive number (min 0.02 minutes)" });
  }

  if (!Array.isArray(guardians)) {
    return res.status(400).json({ error: "guardians must be an array" });
  }
  if (guardians.length !== totalShares) {
    return res.status(400).json({
      error: `Exactly ${totalShares} guardians are required — one guardian must hold each of the ${totalShares} shares`,
    });
  }

  const seen = new Set();
  for (const g of guardians) {
    if (!g || !g.userId) {
      return res.status(400).json({ error: "Each guardian must have a userId" });
    }
    const guardianUser = db.users.findById(g.userId);
    if (!guardianUser) {
      return res.status(400).json({ error: "Guardian userId does not match a registered user" });
    }
    if (g.userId === ownerId) {
      return res.status(400).json({ error: "The vault owner cannot also hold a share as guardian" });
    }
    if (seen.has(g.userId)) {
      return res.status(400).json({ error: "Each guardian must be a different account" });
    }
    seen.add(g.userId);
  }

  const finalRecipient = recoveryRecipient || ownerId;
  const recipientUser = db.users.findById(finalRecipient);
  if (!recipientUser) {
    return res.status(400).json({ error: "recoveryRecipient does not match a registered user" });
  }

  let result;
  try {
    result = vaultService.createVault({
      secret,
      totalShares,
      requiredShares,
      expiryMinutes: providedExpiry,
      ownerId,
      guardians,
      recoveryRecipient: finalRecipient,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create vault" });
  }
  const vault = result.vault;
  const oneTimeShares = result.shares;

  const guardiansForResponse = db.guardians.findByVaultId(vault.id);

  return res.json({
    success: true,
    vault: {
      id: vault.id,
      ownerId: vault.ownerId,
      totalShares: vault.totalShares,
      requiredShares: vault.requiredShares,
      expiryTimestamp: vault.expiryTimestamp,
      status: vault.status,
      createdAt: vault.createdAt,
      recoveryRecipient: vault.recoveryRecipient,
    },
    guardians: guardiansForResponse.map((g) => ({
      id: g.id,
      userId: g.userId,
      walletAddress: g.walletAddress,
      shareIndex: g.shareIndex,
    })),
    // One-time share delivery so the owner can pass each guardian their share.
    // Shares are NOT stored server-side; guardians must keep them.
    oneTimeShares,
  });
}

export function getVault(req, res) {
  const vault = vaultService.getVault(req.params.id);
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (!isInvolved(vault, req.user.id)) {
    return res.status(404).json({ error: "Vault not found" });
  }
  return res.json({ vault });
}

export function renewVault(req, res) {
  const result = vaultService.renewVault(req.params.id, req.user.id);
  if (result.error) return res.status(400).json(result);
  return res.json(result);
}

export function getVaultStatus(req, res) {
  const vault = db.vaults.findById(req.params.id);
  if (!vault) return res.status(404).json({ error: "Vault not found" });
  if (!isInvolved(vault, req.user.id)) {
    return res.status(404).json({ error: "Vault not found" });
  }
  const status = vaultService.getVaultStatus(req.params.id);
  if (status.error) return res.status(404).json(status);
  return res.json(status);
}

export async function activateRecovery(req, res) {
  const vault = db.vaults.findById(req.params.id);
  if (!vault) return res.status(404).json({ error: "Vault not found" });

  const userId = req.user.id;
  const isOwner = vault.ownerId === userId;
  const isRecipient = vault.recoveryRecipient === userId;
  const isGuardian = !!db.guardians.findByUserIdAndVaultId(userId, vault.id);
  const now = Date.now();
  const isExpired = now > vault.expiryTimestamp || vault.status === "RECOVERY_MODE";

  if (!isOwner && !isRecipient && !(isGuardian && isExpired)) {
    return res.status(403).json({ error: "Only the vault owner, recovery recipient, or an authorized guardian (upon expiry) may trigger recovery" });
  }

  const result = await vaultService.activateRecovery(req.params.id);
  if (result.error) {
    if (result.recoveryId) {
      return res.json({
        success: true,
        alreadyActive: true,
        message: result.error,
        recoveryId: result.recoveryId,
        recovery: db.recoveries.findById(result.recoveryId),
      });
    }
    return res.status(400).json(result);
  }
  return res.json(result);
}

export function getAllVaults(req, res) {
  // Scoped to the authenticated user's own involvement; the client cannot ask
  // for another user's vaults.
  const vaults = vaultService.getAllVaults(req.user.id);
  return res.json({ vaults });
}

export function getGuardianShare(req, res) {
  const vaultId = req.params.id;
  // A guardian may only look up their OWN share record.
  const guardianUserId = req.params.guardianId;
  if (guardianUserId !== req.user.id) {
    return res.status(403).json({ error: "You can only retrieve your own guardian record" });
  }
  const guardian = db.guardians.findByUserIdAndVaultId(guardianUserId, vaultId);
  if (!guardian) return res.status(404).json({ error: "Guardian not found for this vault" });
  // The server deliberately does NOT store shares at rest.
  // We return the commitment only, so a guardian can verify their share without the server holding it.
  return res.json({
    guardianId: guardian.id,
    userId: guardian.userId,
    shareIndex: guardian.shareIndex,
    shareCommitment: guardian.shareCommitment,
    note: "Server stores share commitments only. Provide your own share when submitting.",
  });
}