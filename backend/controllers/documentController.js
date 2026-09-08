import documentService from "../services/documentService.js";
import { resolveUser } from "../services/partyService.js";

export function registerDocument(req, res) {
  const { documentName, documentContent } = req.body;
  const actor = resolveUser(req.user.id);
  if (!actor) return res.status(401).json({ error: "Session no longer valid" });

  // The notarizing party is always the signed-in account — a client-supplied
  // ownerId is ignored so nobody can notarize documents for another account.
  if (typeof documentName !== "string" || documentName.trim().length === 0 || documentName.length > 120) {
    return res.status(400).json({ error: "documentName is required (max 120 characters)" });
  }
  if (typeof documentContent !== "string" || documentContent.length === 0) {
    return res.status(400).json({ error: "documentContent is required" });
  }
  if (documentContent.length > 5000000) {
    return res.status(400).json({ error: "documentContent is too large (max 5,000,000 characters)" });
  }

  const doc = documentService.registerDocument({ documentName, documentContent, ownerId: actor.id });
  return res.json({ success: true, document: doc });
}

export function verifyDocument(req, res) {
  const { documentContent, documentId } = req.body;

  if (!documentContent || !documentId) {
    return res.status(400).json({ error: "documentContent and documentId are required" });
  }

  const doc = documentService.getDocument(documentId);
  if (!doc || doc.ownerId !== req.user.id) {
    return res.status(404).json({ error: "Document not found" });
  }

  const result = documentService.verifyDocument({ documentContent, documentId });
  return res.json(result);
}

export function getDocument(req, res) {
  const doc = documentService.getDocument(req.params.id);
  if (!doc || doc.ownerId !== req.user.id) return res.status(404).json({ error: "Document not found" });
  return res.json({ document: doc });
}

export function getAllDocuments(req, res) {
  // Documents are private to the account that notarized them — nobody else's
  // documents appear in this list.
  const docs = documentService.getAllDocuments().filter((d) => d.ownerId === req.user.id);
  return res.json({ documents: docs });
}
