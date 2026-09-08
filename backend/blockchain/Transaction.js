import crypto from "crypto";
import { sha256 } from "./sha256.js";

class Transaction {
  constructor({ type, vaultId, actor, data = {}, timestamp = null, id = null, dataHash = null }) {
    this.id = id || crypto.randomUUID();
    this.type = type;
    this.vaultId = vaultId;
    this.actor = actor;
    this.data = data;
    this.timestamp = timestamp || Date.now();
    // The dataHash is a fingerprint of the transaction's stable payload (its own
    // id), so it does not change when the object is round-tripped through JSON.
    this.dataHash = dataHash || sha256(JSON.stringify(this.toData()));
  }

  // Stable, canonical payload used for hashing. Field order must never change,
  // or every block hash and merkle leaf changes on the next run.
  toData() {
    return {
      id: this.id,
      type: this.type,
      vaultId: this.vaultId,
      actor: this.actor,
      data: this.data,
      timestamp: this.timestamp,
    };
  }

  // Round-trips exactly: fromJSON(toJSON(x)) reproduces an identical hash input.
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      vaultId: this.vaultId,
      actor: this.actor,
      data: this.data,
      timestamp: this.timestamp,
      dataHash: this.dataHash,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}

export default Transaction;
