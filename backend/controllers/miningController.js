import miner from "../blockchain/Miner.js";

export function mine(req, res) {
  const { minerAddress, difficulty } = req.body;

  if (minerAddress !== undefined && (typeof minerAddress !== "string" || minerAddress.length > 64)) {
    return res.status(400).json({ error: "minerAddress must be a string of at most 64 characters" });
  }
  if (difficulty !== undefined && difficulty !== null) {
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 8) {
      return res.status(400).json({ error: "difficulty must be an integer between 1 and 8" });
    }
  }

  const result = miner.mine(minerAddress || "demo-miner", difficulty === undefined || difficulty === null ? null : difficulty);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
}

export function getStatus(req, res) {
  return res.json(miner.getStatus());
}
