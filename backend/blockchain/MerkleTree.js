import { sha256, sha256Buffer } from "./sha256.js";

function canonicalTx(tx) {
  if (tx && typeof tx.toJSON === "function") return JSON.stringify(tx.toJSON());
  return JSON.stringify(tx);
}

class MerkleTree {
  constructor(transactions) {
    this.leaves = transactions.map((tx) =>
      Buffer.from(sha256(canonicalTx(tx)), "hex")
    );
    this.root = this.buildTree(this.leaves);
  }

  // A single canonical serialization shared by live Transaction instances and
  // rehydrated plain JSON objects, so the same payload always hashes the same.
  static canonical(tx) {
    if (tx && typeof tx.toJSON === "function") return JSON.stringify(tx.toJSON());
    return JSON.stringify(tx);
  }

  buildTree(nodes) {
    if (nodes.length === 0) return Buffer.from(sha256(""), "hex");
    if (nodes.length === 1) return nodes[0];

    const nextLevel = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      // When a level has an odd number of nodes, the last node is paired with itself
      // (the standard Bitcoin convention).
      const right = i + 1 < nodes.length ? nodes[i + 1] : left;
      nextLevel.push(Buffer.from(sha256Buffer(Buffer.concat([left, right])), "hex"));
    }
    return this.buildTree(nextLevel);
  }

  getRoot() {
    return this.root.toString("hex");
  }

  getLeaves() {
    return this.leaves.map((l) => l.toString("hex"));
  }

  // Verifies that the transaction at `index` hashes to `hash` within the tree.
  static verifyTransaction(transactions, index, hash) {
    const tree = new MerkleTree(transactions);
    if (index < 0 || index >= tree.leaves.length) return false;
    return tree.leaves[index].toString("hex") === hash;
  }
}

export default MerkleTree;