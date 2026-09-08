import crypto from "crypto";
import db from "../config/database.js";
import miner from "../blockchain/Miner.js";
import {
  partyFromUser,
  partyName,
  currentHolder,
  requireRegisteredParty,
  resolveUser,
} from "../services/partyService.js";

export function createAsset(req, res) {
  const { assetId, name, description } = req.body;
  const actor = resolveUser(req.user.id);
  if (!actor) return res.status(401).json({ error: "Session no longer valid" });

  // The creator is always the signed-in account — client-supplied ownerId,
  // from and to are ignored so nobody can mint an asset for someone else.
  if (typeof assetId !== "string" || assetId.trim().length === 0 || assetId.length > 64) {
    return res.status(400).json({ error: "assetId is required (max 64 characters)" });
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 120) {
    return res.status(400).json({ error: "name is required (max 120 characters)" });
  }
  if (description !== undefined && typeof description !== "string") {
    return res.status(400).json({ error: "description must be a string" });
  }
  if (description && description.length > 500) {
    return res.status(400).json({ error: "description is too long (max 500 characters)" });
  }

  if (db.supplyChain.findByAssetId(assetId)) {
    return res.status(400).json({ error: "Asset already exists" });
  }

  const owner = partyFromUser(actor);

  const asset = {
    assetId,
    name,
    description: description || "",
    status: "CREATED",
    ownerId: actor.id,
    history: [
      {
        status: "CREATED",
        from: owner,
        to: owner,
        fromName: owner.name,
        toName: owner.name,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
  };

  db.supplyChain.push(asset);

  miner.addTransaction("SUPPLY_CHAIN_CREATED", assetId, actor.id, {
    name,
    status: "CREATED",
  });

  return res.json({ success: true, asset });
}

export function transferAsset(req, res) {
  const { assetId, to } = req.body;
  const actor = resolveUser(req.user.id);
  if (!actor) return res.status(401).json({ error: "Session no longer valid" });

  // Only the asset's current custodian (the signed-in user) may transfer it.
  if (!assetId || !to) {
    return res.status(400).json({ error: "assetId and to are required" });
  }
  if (typeof to !== "string" || to.length > 64) {
    return res.status(400).json({ error: "Recipient must be a registered account id (max 64 characters)" });
  }

  const asset = db.supplyChain.findByAssetId(assetId);
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  const holderId = currentHolder(asset);
  if (!holderId) {
    return res.status(400).json({ error: "Asset has no known custodian" });
  }
  if (holderId !== actor.id) {
    return res.status(403).json({ error: "Only the current custodian can transfer this asset" });
  }
  if (to === actor.id) {
    return res.status(400).json({ error: "Cannot transfer custody to yourself" });
  }

  // The recipient must be a registered account — never a free-typed name.
  const target = requireRegisteredParty(to, res, "Recipient");
  if (!target) return;

  const validTransitions = {
    CREATED: "ASSIGNED",
    ASSIGNED: "TRANSFERRED",
    TRANSFERRED: "RECEIVED",
    RECEIVED: "VERIFIED",
  };

  const nextStatus = validTransitions[asset.status];
  if (!nextStatus) {
    return res.status(400).json({ error: `Cannot transfer asset in status: ${asset.status}` });
  }

  const fromParty = partyFromUser(actor);
  const toParty = partyFromUser(target);

  asset.status = nextStatus;
  asset.history.push({
    status: nextStatus,
    from: fromParty,
    to: toParty,
    fromName: fromParty.name,
    toName: toParty.name,
    timestamp: Date.now(),
  });

  db.supplyChain.update(assetId, { status: nextStatus, history: asset.history });

  miner.addTransaction("SUPPLY_CHAIN_UPDATED", assetId, actor.id, {
    status: nextStatus,
    to: target.id,
    toName: target.name,
  });

  return res.json({ success: true, asset });
}

export function updateAsset(req, res) {
  const { assetId, status, from, to } = req.body;

  if (typeof assetId !== "string" || assetId.trim().length === 0 || assetId.length > 64) {
    return res.status(400).json({ error: "assetId is required (max 64 characters)" });
  }
  if (!status) {
    return res.status(400).json({ error: "assetId and status are required" });
  }

  const VALID_STATUSES = ["CREATED", "ASSIGNED", "TRANSFERRED", "RECEIVED", "VERIFIED"];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}` });
  }

  const asset = db.supplyChain.findByAssetId(assetId);
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  let fromParty = { id: "SYSTEM", name: "SYSTEM" };
  let toParty = { id: "SYSTEM", name: "SYSTEM" };

  if (from && from !== "SYSTEM") {
    const u = requireRegisteredParty(from, res, "From");
    if (!u) return;
    fromParty = partyFromUser(u);
  }
  if (to && to !== "SYSTEM") {
    const u = requireRegisteredParty(to, res, "To");
    if (!u) return;
    toParty = partyFromUser(u);
  }

  asset.status = status;
  asset.history.push({
    status,
    from: fromParty,
    to: toParty,
    fromName: fromParty.name,
    toName: toParty.name,
    timestamp: Date.now(),
  });

  db.supplyChain.update(assetId, { status, history: asset.history });

  return res.json({ success: true, asset });
}

export function getAssetHistory(req, res) {
  const asset = db.supplyChain.findByAssetId(req.params.id);
  if (!asset || !isInvolved(asset, req.user.id)) {
    return res.status(404).json({ error: "Asset not found" });
  }

  // Normalize display names for both new { id, name } rows and legacy strings.
  const history = (asset.history || []).map((h) => ({
    ...h,
    fromName: h.fromName || partyName(h.from),
    toName: h.toName || partyName(h.to),
  }));

  return res.json({ asset: { ...asset, history } });
}

export function getAllAssets(req, res) {
  // Each account only sees assets it is a party to (creator, custodian, or any
  // transfer it was involved in) — other accounts' assets never leak into the
  // list, so a new asset never appears "automatically transferred" to someone.
  const assets = db.supplyChain
    .findAll()
    .filter((a) => isInvolved(a, req.user.id))
    .map((a) => {
      const history = (a.history || []).map((h) => ({
        ...h,
        fromName: h.fromName || partyName(h.from),
        toName: h.toName || partyName(h.to),
      }));
      return { ...a, history };
    });
  return res.json({ assets });
}

function idOf(party) {
  if (party && typeof party === "object") return party.id || null;
  if (typeof party === "string" && party) return party;
  return null;
}

function isInvolved(asset, userId) {
  return (asset.history || []).some((h) => idOf(h.from) === userId || idOf(h.to) === userId);
}