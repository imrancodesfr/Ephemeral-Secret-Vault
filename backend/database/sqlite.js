import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import env from "../config/environment.js";

class DatabaseService {
  constructor() {
    const dir = path.dirname(env.DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(env.DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT DEFAULT 'OWNER',
        walletAddress TEXT,
        createdAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS vaults (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        totalShares INTEGER NOT NULL,
        requiredShares INTEGER NOT NULL,
        expiryTimestamp INTEGER NOT NULL,
        recoveryRecipient TEXT,
        status TEXT DEFAULT 'ACTIVE',
        createdAt INTEGER,
        lastRenewal INTEGER
      );

      CREATE TABLE IF NOT EXISTS vault_crypto (
        vaultId TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
        prime INTEGER,
        chunkLengths TEXT,
        encryptedSecret TEXT
      );

      CREATE TABLE IF NOT EXISTS guardians (
        id TEXT PRIMARY KEY,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        userId TEXT NOT NULL,
        walletAddress TEXT,
        email TEXT,
        shareIndex INTEGER,
        shareCommitment TEXT,
        hasSubmitted INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        documentName TEXT NOT NULL,
        documentHash TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        timestamp INTEGER,
        blockchainTransaction TEXT
      );

      CREATE TABLE IF NOT EXISTS recoveries (
        id TEXT PRIMARY KEY,
        vaultId TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'AWAITING_SHARES',
        requiredShares INTEGER NOT NULL,
        submittedShares TEXT DEFAULT '[]',
        votes TEXT DEFAULT '[]',
        createdAt INTEGER,
        completedAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS supply_chain (
        assetId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'CREATED',
        history TEXT DEFAULT '[]',
        createdAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS voting (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        options TEXT DEFAULT '["YES","NO"]',
        creatorId TEXT NOT NULL,
        vaultId TEXT,
        votes TEXT DEFAULT '[]',
        status TEXT DEFAULT 'ACTIVE',
        createdAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipientId TEXT NOT NULL,
        recipientEmail TEXT,
        role TEXT,
        vaultId TEXT,
        recoveryId TEXT,
        type TEXT,
        subject TEXT,
        body TEXT,
        channels TEXT DEFAULT 'inapp',
        read INTEGER DEFAULT 0,
        createdAt INTEGER
      );
    `);

    const guardianCols = this.db.prepare(`PRAGMA table_info(guardians)`).all().map((c) => c.name);
    if (!guardianCols.includes("email")) {
      this.db.exec(`ALTER TABLE guardians ADD COLUMN email TEXT;`);
    }
    if (!guardianCols.includes("shareCommitment")) {
      this.db.exec(`ALTER TABLE guardians ADD COLUMN shareCommitment TEXT;`);
    }
    if (guardianCols.includes("shareData")) {
      // No longer store raw shares at rest. Drop stale column if present.
      this.db.exec(`ALTER TABLE guardians DROP COLUMN shareData;`);
    }
    this.db.exec(`DROP TABLE IF EXISTS vault_shares;`);
  }

  // ── Users ──────────────────────────────────────────────

  users = {
    push: (user) => {
      this.db.prepare(
        "INSERT INTO users (id, name, email, passwordHash, role, walletAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(user.id, user.name, user.email, user.passwordHash, user.role || "OWNER", user.walletAddress || null, user.createdAt);
    },

    findByEmail: (email) => {
      return this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) || null;
    },

    findById: (id) => {
      return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
    },

    findAll: () => {
      return this.db.prepare("SELECT id, name, email, role, walletAddress, createdAt FROM users").all();
    },
  };

  // ── Vaults ─────────────────────────────────────────────

  vaults = {
    push: (vault) => {
      this.db.prepare(
        "INSERT INTO vaults (id, ownerId, totalShares, requiredShares, expiryTimestamp, recoveryRecipient, status, createdAt, lastRenewal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(vault.id, vault.ownerId, vault.totalShares, vault.requiredShares, vault.expiryTimestamp, vault.recoveryRecipient, vault.status || "ACTIVE", vault.createdAt, vault.lastRenewal);

      if (vault.prime !== undefined) {
        this.db.prepare(
          "INSERT INTO vault_crypto (vaultId, prime, chunkLengths, encryptedSecret) VALUES (?, ?, ?, ?)"
        ).run(vault.id, vault.prime, JSON.stringify(vault.chunkLengths), vault.encryptedSecret);
      }
    },

    findById: (id) => {
      return this.db.prepare("SELECT * FROM vaults WHERE id = ?").get(id) || null;
    },

    update: (id, fields) => {
      const keys = Object.keys(fields);
      if (keys.length === 0) return;
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => fields[k]);
      this.db.prepare(`UPDATE vaults SET ${sets} WHERE id = ?`).run(...values, id);
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM vaults").all();
    },
  };

  // ── Vault Crypto ───────────────────────────────────────

  vaultCrypto = {
    findByVaultId: (vaultId) => {
      return this.db.prepare("SELECT * FROM vault_crypto WHERE vaultId = ?").get(vaultId) || null;
    },

    destroyForVault: (vaultId) => {
      return this.db.prepare("DELETE FROM vault_crypto WHERE vaultId = ?").run(vaultId).changes;
    },
  };

  // ── Guardians ──────────────────────────────────────────

  guardians = {
    push: (g) => {
      this.db.prepare(
        "INSERT INTO guardians (id, vaultId, userId, walletAddress, email, shareIndex, shareCommitment, hasSubmitted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(g.id, g.vaultId, g.userId, g.walletAddress || null, g.email || null, g.shareIndex, g.shareCommitment || null, g.hasSubmitted ? 1 : 0);
    },

    findByVaultId: (vaultId) => {
      return this.db.prepare("SELECT * FROM guardians WHERE vaultId = ?").all(vaultId);
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM guardians").all();
    },

    findByIdAndVaultId: (id, vaultId) => {
      return this.db.prepare("SELECT * FROM guardians WHERE id = ? AND vaultId = ?").get(id, vaultId) || null;
    },

    findByUserIdAndVaultId: (userId, vaultId) => {
      return this.db.prepare("SELECT * FROM guardians WHERE userId = ? AND vaultId = ?").get(userId, vaultId) || null;
    },

    updateSubmitted: (id, vaultId) => {
      this.db.prepare("UPDATE guardians SET hasSubmitted = 1 WHERE id = ? AND vaultId = ?").run(id, vaultId);
    },
  };

  // ── Documents ──────────────────────────────────────────

  documents = {
    push: (doc) => {
      this.db.prepare(
        "INSERT INTO documents (id, documentName, documentHash, ownerId, timestamp, blockchainTransaction) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(doc.id, doc.documentName, doc.documentHash, doc.ownerId, doc.timestamp, doc.blockchainTransaction || null);
    },

    findById: (id) => {
      return this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) || null;
    },

    updateBlockchainTx: (id, txId) => {
      this.db.prepare("UPDATE documents SET blockchainTransaction = ? WHERE id = ?").run(txId, id);
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM documents").all();
    },
  };

  // ── Recoveries ─────────────────────────────────────────

  recoveries = {
    push: (r) => {
      this.db.prepare(
        "INSERT INTO recoveries (id, vaultId, status, requiredShares, submittedShares, votes, createdAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(r.id, r.vaultId, r.status || "AWAITING_SHARES", r.requiredShares, JSON.stringify(r.submittedShares || []), JSON.stringify(r.votes || []), r.createdAt, r.completedAt || null);
    },

    findById: (id) => {
      const row = this.db.prepare("SELECT * FROM recoveries WHERE id = ?").get(id);
      if (!row) return null;
      row.submittedShares = JSON.parse(row.submittedShares || "[]");
      row.votes = JSON.parse(row.votes || "[]");
      return row;
    },

    findByVaultId: (vaultId) => {
      const row = this.db.prepare("SELECT * FROM recoveries WHERE vaultId = ? ORDER BY createdAt DESC").get(vaultId);
      if (!row) return null;
      row.submittedShares = JSON.parse(row.submittedShares || "[]");
      row.votes = JSON.parse(row.votes || "[]");
      return row;
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM recoveries ORDER BY createdAt DESC").all().map((r) => {
        r.submittedShares = JSON.parse(r.submittedShares || "[]");
        r.votes = JSON.parse(r.votes || "[]");
        return r;
      });
    },

    updateShares: (id, submittedShares) => {
      this.db.prepare("UPDATE recoveries SET submittedShares = ? WHERE id = ?").run(JSON.stringify(submittedShares), id);
    },

    updateStatus: (id, status, completedAt) => {
      this.db.prepare("UPDATE recoveries SET status = ?, completedAt = ? WHERE id = ?").run(status, completedAt, id);
    },

    clearShareData: (id) => {
      const row = this.db.prepare("SELECT submittedShares FROM recoveries WHERE id = ?").get(id);
      if (!row) return 0;
      const shares = JSON.parse(row.submittedShares || "[]");
      const scrubbed = shares.map((s) => ({ guardianId: s.guardianId, shareIndex: s.shareIndex, submittedAt: s.submittedAt }));
      this.db.prepare("UPDATE recoveries SET submittedShares = ? WHERE id = ?").run(JSON.stringify(scrubbed), id);
      return shares.length;
    },
  };

  // ── Notifications ────────────────────────────────────

  notifications = {
    push: (n) => {
      this.db.prepare(
        "INSERT INTO notifications (id, recipientId, recipientEmail, role, vaultId, recoveryId, type, subject, body, channels, read, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(n.id, n.recipientId || "", n.recipientEmail || null, n.role || null, n.vaultId || null, n.recoveryId || null, n.type || "INFO", n.subject || "", n.body || "", n.channels || "inapp", n.read ? 1 : 0, n.createdAt);
    },

    findByRecipient: (recipientId) => {
      return this.db.prepare("SELECT * FROM notifications WHERE recipientId = ? ORDER BY createdAt DESC").all(recipientId).map((r) => {
        r.read = !!r.read;
        return r;
      });
    },

    findUnread: (recipientId) => {
      return this.db.prepare("SELECT * FROM notifications WHERE recipientId = ? AND read = 0 ORDER BY createdAt DESC").all(recipientId).map((r) => {
        r.read = !!r.read;
        return r;
      });
    },

    markRead: (id, recipientId) => {
      return this.db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND recipientId = ?").run(id, recipientId).changes;
    },

    markAllRead: (recipientId) => {
      return this.db.prepare("UPDATE notifications SET read = 1 WHERE recipientId = ?").run(recipientId).changes;
    },

    wipeShareBodies: (vaultId) => {
      const rows = this.db.prepare("SELECT id FROM notifications WHERE vaultId = ? AND type = 'SHARE_ISSUED'").all(vaultId);
      const strip = (body) => (body || "").replace(/\{"x":\d+,"y":\[[\d,\s]*\]\}/g, "[share consumed — removed after recovery]");
      const stmt = this.db.prepare("UPDATE notifications SET body = ? WHERE id = ?");
      for (const r of rows) {
        const b = this.db.prepare("SELECT body FROM notifications WHERE id = ?").get(r.id);
        stmt.run(strip(b ? b.body : ""), r.id);
      }
      return rows.length;
    },

    // Consume-on-read: strictly "delivered once". If the notification still
    // carries a plaintext share, remove it from storage and mark the
    // notification read, so a later read cannot retrieve the share again.
    // Returns the extracted share JSON fragment (without surrounding quotes),
    // or null when there is nothing left to consume.
    takeShareBody: (id) => {
      const row = this.db.prepare("SELECT body, read FROM notifications WHERE id = ?").get(id);
      if (!row) return null;
      const match = /\{"x":\d+,"y":\[[\d,\s]*\]\}/.exec(row.body || "");
      if (!match) return null;
      const shareJson = match[0];
      const replacement = "[share delivered once — removed from storage]";
      const newBody = (row.body || "").replace(shareJson, replacement);
      this.db.prepare("UPDATE notifications SET body = ?, read = 1 WHERE id = ?").run(newBody, id);
      return shareJson;
    },

    countByRecipient: (recipientId) => {
      return this.db.prepare("SELECT COUNT(*) AS total, SUM(read = 0) AS unread FROM notifications WHERE recipientId = ?").get(recipientId) || { total: 0, unread: 0 };
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM notifications ORDER BY createdAt DESC").all().map((r) => {
        r.read = !!r.read;
        return r;
      });
    },
  };

  // ── Supply Chain ───────────────────────────────────────

  supplyChain = {
    push: (asset) => {
      this.db.prepare(
        "INSERT INTO supply_chain (assetId, name, description, status, history, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(asset.assetId, asset.name, asset.description || "", asset.status || "CREATED", JSON.stringify(asset.history || []), asset.createdAt);
    },

    findByAssetId: (assetId) => {
      const row = this.db.prepare("SELECT * FROM supply_chain WHERE assetId = ?").get(assetId);
      if (!row) return null;
      row.history = JSON.parse(row.history || "[]");
      return row;
    },

    update: (assetId, fields) => {
      const keys = Object.keys(fields);
      if (keys.length === 0) return;
      const sets = keys.map((k) => {
        const val = fields[k];
        return `${k} = ?`;
      }).join(", ");
      const values = keys.map((k) => {
        const val = fields[k];
        return Array.isArray(val) ? JSON.stringify(val) : val;
      });
      this.db.prepare(`UPDATE supply_chain SET ${sets} WHERE assetId = ?`).run(...values, assetId);
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM supply_chain").all().map((r) => {
        r.history = JSON.parse(r.history || "[]");
        return r;
      });
    },
  };

  // ── Voting ─────────────────────────────────────────────

  voting = {
    push: (proposal) => {
      this.db.prepare(
        "INSERT INTO voting (id, title, description, options, creatorId, vaultId, votes, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(proposal.id, proposal.title, proposal.description || "", JSON.stringify(proposal.options || []), proposal.creatorId, proposal.vaultId || null, JSON.stringify(proposal.votes || []), proposal.status || "ACTIVE", proposal.createdAt);
    },

    findById: (id) => {
      const row = this.db.prepare("SELECT * FROM voting WHERE id = ?").get(id);
      if (!row) return null;
      row.options = JSON.parse(row.options || "[]");
      row.votes = JSON.parse(row.votes || "[]");
      return row;
    },

    updateVotes: (id, votes) => {
      this.db.prepare("UPDATE voting SET votes = ? WHERE id = ?").run(JSON.stringify(votes), id);
    },

    findAll: () => {
      return this.db.prepare("SELECT * FROM voting").all().map((r) => {
        r.options = JSON.parse(r.options || "[]");
        r.votes = JSON.parse(r.votes || "[]");
        return r;
      });
    },
  };

  close() {
    this.db.close();
  }
}

const db = new DatabaseService();
export default db;
