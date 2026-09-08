import crypto from "crypto";
import db from "../config/database.js";
import { sha256 } from "../blockchain/sha256.js";
import miner from "../blockchain/Miner.js";

class DocumentService {
  registerDocument({ documentName, documentContent, ownerId }) {
    const documentHash = sha256(documentContent);
    const docId = "DOC-" + crypto.randomUUID().slice(0, 8).toUpperCase();

    const doc = {
      id: docId,
      documentName,
      documentHash,
      ownerId,
      timestamp: Date.now(),
      blockchainTransaction: null,
    };

    db.documents.push(doc);

    const tx = miner.addTransaction("DOCUMENT_REGISTERED", docId, ownerId, {
      documentName,
      documentHash,
    });

    db.documents.updateBlockchainTx(docId, tx.id);
    doc.blockchainTransaction = tx.id;

    return doc;
  }

  verifyDocument({ documentContent, documentId }) {
    const currentHash = sha256(documentContent);
    const doc = db.documents.findById(documentId);

    if (!doc) {
      return { verified: false, message: "Document not found in registry", hash: currentHash };
    }

    const verified = doc.documentHash === currentHash;
    return {
      verified,
      message: verified ? "Document integrity verified" : "Document has been modified",
      storedHash: doc.documentHash,
      currentHash,
      documentName: doc.documentName,
      timestamp: doc.timestamp,
    };
  }

  getDocument(docId) {
    const doc = db.documents.findById(docId);
    if (!doc) return null;
    return doc;
  }

  getAllDocuments() {
    return db.documents.findAll();
  }
}

export default new DocumentService();
