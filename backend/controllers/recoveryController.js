import recoveryService from "../services/recoveryService.js";
import db from "../config/database.js";
import vaultService from "../services/vaultService.js";

function isInvolved(vault, userId) {
  if (!vault) return false;
  if (vault.ownerId === userId || vault.recoveryRecipient === userId) return true;
  return !!db.guardians.findByUserIdAndVaultId(userId, vault.id);
}

export function submitShare(req, res) {
  const { recoveryId, shareData } = req.body;
  // The submitting guardian is identified by the verified session, not by a
  // client-supplied guardianId.
  const guardianId = req.user.id;

  if (!recoveryId || !shareData) {
    return res.status(400).json({ error: "recoveryId and shareData are required" });
  }

  const result = recoveryService.submitShare({ recoveryId, guardianId, shareData });
  if (result.error) return res.status(400).json(result);
  return res.json(result);
}

export function getRecoveryStatus(req, res) {
  const recovery = db.recoveries.findById(req.params.id);
  if (!recovery) return res.status(404).json({ error: "Recovery not found" });
  const vault = db.vaults.findById(recovery.vaultId);
  if (!isInvolved(vault, req.user.id)) {
    return res.status(404).json({ error: "Recovery not found" });
  }
  const result = recoveryService.getRecoveryStatus(req.params.id);
  if (result.error) return res.status(404).json(result);
  return res.json(result);
}

export function getRecoveriesForUser(req, res) {
  // A user may only list their own recoveries, regardless of the URL param.
  const userId = req.user.id;
  return res.json({ recoveries: recoveryService.getRecoveriesForUser(userId) });
}

export async function completeRecovery(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const recovery = db.recoveries.findById(id);
  if (!recovery) return res.status(404).json({ error: "Recovery not found" });
  const vault = db.vaults.findById(recovery.vaultId);
  if (!isInvolved(vault, userId)) {
    return res.status(404).json({ error: "Recovery not found" });
  }

  const result = await recoveryService.completeRecovery({ recoveryId: id, userId });
  if (result.error) return res.status(400).json(result);
  return res.json(result);
}