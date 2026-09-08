import blockchain from "../blockchain/Blockchain.js";
import Transaction from "../blockchain/Transaction.js";

export function getChain(req, res) {
  return res.json({ chain: blockchain.getFullChain(), length: blockchain.chain.length });
}

export function getBlock(req, res) {
  const block = blockchain.getBlock(parseInt(req.params.index));
  if (!block) return res.status(404).json({ error: "Block not found" });
  return res.json({ block: block.toJSON() });
}

export function addTransaction(req, res) {
  const { type, vaultId, data } = req.body;

  if (typeof type !== "string" || type.trim().length === 0 || type.length > 40) {
    return res.status(400).json({ error: "type is required (max 40 characters)" });
  }
  if (typeof vaultId !== "string" || vaultId.trim().length === 0 || vaultId.length > 64) {
    return res.status(400).json({ error: "vaultId is required (max 64 characters)" });
  }
  if (data !== undefined && (typeof data !== "object" || data === null || Array.isArray(data))) {
    return res.status(400).json({ error: "data must be a JSON object" });
  }

  // The actor of a hand-injected audit event is always the signed-in account —
  // a client-supplied actor is never honored, so nobody can write events into
  // the ledger under another account's identity.
  const tx = new Transaction({
    type,
    vaultId,
    actor: req.user.id,
    data: data || {},
  });
  blockchain.addTransaction(tx);

  return res.json({ success: true, transaction: { id: tx.id, type: tx.type, vaultId: tx.vaultId, actor: tx.actor, data: tx.data, timestamp: tx.timestamp, dataHash: tx.dataHash } });
}

export function validateChain(req, res) {
  const isValid = blockchain.isChainValid();
  return res.json({
    isValid,
    chainLength: blockchain.chain.length,
    message: isValid ? "Blockchain is valid" : "Blockchain has been tampered with",
  });
}

export function getMerkleRoot(req, res) {
  const result = blockchain.getMerkleRoot(parseInt(req.params.index));
  if (!result) return res.status(404).json({ error: "Block not found" });
  return res.json(result);
}

export function verifyMerkle(req, res) {
  const { index, hash } = req.body;
  if (index === undefined || !hash) {
    return res.status(400).json({ error: "index and hash are required" });
  }
  const result = blockchain.getMerkleRoot(parseInt(index));
  if (!result) return res.status(404).json({ error: "Block not found" });

  const verified = result.merkleRoot === hash;
  return res.json({
    verified,
    expectedMerkleRoot: result.merkleRoot,
    providedHash: hash,
  });
}
