import crypto from "crypto";
import db from "../config/database.js";
import miner from "../blockchain/Miner.js";
import { resolveUser } from "../services/partyService.js";

export function createProposal(req, res) {
  const { title, description, options, vaultId } = req.body;
  const actor = resolveUser(req.user.id);
  if (!actor) return res.status(401).json({ error: "Session no longer valid" });

  // The creator is always the signed-in account — client-supplied creatorId
  // is ignored so nobody can create a proposal on behalf of someone else.
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 120) {
    return res.status(400).json({ error: "title is required (max 120 characters)" });
  }
  if (description !== undefined && (typeof description !== "string" || description.length > 1000)) {
    return res.status(400).json({ error: "description is too long (max 1000 characters)" });
  }

  let finalOptions = options;
  if (finalOptions === undefined || finalOptions === null || finalOptions === "") {
    finalOptions = ["YES", "NO"];
  }
  if (
    !Array.isArray(finalOptions) ||
    finalOptions.length < 2 ||
    finalOptions.length > 10 ||
    new Set(finalOptions).size !== finalOptions.length
  ) {
    return res.status(400).json({ error: "Provide 2–10 distinct voting options" });
  }
  for (const o of finalOptions) {
    if (typeof o !== "string" || o.trim().length === 0 || o.length > 40) {
      return res.status(400).json({ error: "Each option must be 1–40 characters" });
    }
  }
  finalOptions = finalOptions.map((o) => o.trim());

  if (vaultId && !db.vaults.findById(vaultId)) {
    return res.status(400).json({ error: "Vault not found" });
  }

  const proposalId = "PROP-" + crypto.randomUUID().slice(0, 8).toUpperCase();

  const proposal = {
    id: proposalId,
    title,
    description: description || "",
    options: finalOptions,
    creatorId: actor.id,
    vaultId: vaultId || null,
    votes: [],
    status: "ACTIVE",
    createdAt: Date.now(),
  };

  db.voting.push(proposal);

  miner.addTransaction("VOTE_PROPOSAL_CREATED", proposalId, actor.id, { title });

  return res.json({ success: true, proposal });
}

export function castVote(req, res) {
  const { proposalId, option } = req.body;
  const actor = resolveUser(req.user.id);
  if (!actor) return res.status(401).json({ error: "Session no longer valid" });

  // Votes are recorded against the signed-in account — a client-supplied
  // voterId is never honored, so one account cannot vote as another person.
  if (!proposalId || !option) {
    return res.status(400).json({ error: "proposalId and option are required" });
  }

  const proposal = db.voting.findById(proposalId);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  if (proposal.status !== "ACTIVE") return res.status(400).json({ error: "Proposal is not active" });

  if (proposal.votes.find((v) => v.voterId === actor.id)) {
    return res.status(400).json({ error: "Voter has already voted" });
  }

  if (!proposal.options.includes(option)) {
    return res.status(400).json({ error: "Invalid option" });
  }

  const vote = {
    id: crypto.randomUUID(),
    proposalId,
    voterId: actor.id,
    voterName: actor.name,
    option,
    timestamp: Date.now(),
  };

  proposal.votes.push(vote);
  db.voting.updateVotes(proposalId, proposal.votes);

  miner.addTransaction("VOTE_RECORDED", proposalId, actor.id, { option, voterName: actor.name });

  return res.json({ success: true, vote, totalVotes: proposal.votes.length });
}

export function getAllProposals(req, res) {
  const proposals = db.voting.findAll().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ proposals });
}

export function getProposal(req, res) {
  const proposal = db.voting.findById(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  return res.json({ proposal });
}

export function getResult(req, res) {
  const proposal = db.voting.findById(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  const counts = {};
  proposal.options.forEach((opt) => {
    counts[opt] = proposal.votes.filter((v) => v.option === opt).length;
  });

  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return res.json({
    proposalId: proposal.id,
    title: proposal.title,
    status: proposal.status,
    totalVotes: proposal.votes.length,
    counts,
    winner: winner ? winner[0] : null,
    winnerCount: winner ? winner[1] : 0,
  });
}
