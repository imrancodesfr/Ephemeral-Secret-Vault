import db from "../config/database.js";

// Shared "who is a party" rules for every custody / governance / notary event.
// Parties are never free text: they must resolve to a registered account, or
// be the special "SYSTEM" actor used for automated events.

export function resolveUser(id) {
  if (typeof id !== "string" || !id) return null;
  return db.users.findById(id) || null;
}

export function partyFromUser(user) {
  return user ? { id: user.id, name: user.name } : null;
}

// History rows may hold { id, name } (new format) or a plain legacy string.
export function partyName(party) {
  if (party && typeof party === "object") return party.name || party.id || "—";
  if (typeof party === "string" && party) {
    const u = db.users.findById(party);
    return u ? u.name : party;
  }
  return "—";
}

// The custodian of an asset is the `to` of its latest history entry.
export function currentHolder(asset) {
  const history = asset && Array.isArray(asset.history) ? asset.history : [];
  const last = history.length ? history[history.length - 1] : null;
  if (!last) return null;
  const to = last.to;
  if (to && typeof to === "object") return to.id || null;
  if (typeof to === "string" && to) return to;
  return null;
}

// Rejects made-up names / IDs that do not belong to a registered account.
export function requireRegisteredParty(id, res, label = "Party") {
  const user = resolveUser(id);
  if (!user) {
    res.status(400).json({
      error: `${label} must be an existing registered account. Made-up names, typos and unregistered IDs are not accepted.`,
    });
    return null;
  }
  return user;
}