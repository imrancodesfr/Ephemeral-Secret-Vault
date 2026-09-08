import { sha256 } from "./sha256.js";
import MerkleTree from "./MerkleTree.js";

class Block {
  constructor({ index, transactions, previousHash, nonce = 0, difficulty = 4, timestamp = null }) {
    this.index = index;
    this.timestamp = timestamp || Date.now();
    this.transactions = transactions || [];
    this.previousHash = previousHash;
    this.difficulty = difficulty;
    this.nonce = nonce;

    const merkleTree = new MerkleTree(this.transactions);
    this.merkleRoot = merkleTree.getRoot();
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return sha256(
      this.index +
        this.timestamp +
        JSON.stringify(this.transactions) +
        this.previousHash +
        this.merkleRoot +
        this.nonce +
        this.difficulty
    );
  }

  mineBlock() {
    const prefix = "0".repeat(this.difficulty);
    while (!this.hash.startsWith(prefix)) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
    return { nonce: this.nonce, hash: this.hash };
  }

  toJSON() {
    return {
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions.map((tx) =>
        typeof tx.toJSON === "function" ? tx.toJSON() : tx
      ),
      merkleRoot: this.merkleRoot,
      previousHash: this.previousHash,
      nonce: this.nonce,
      difficulty: this.difficulty,
      hash: this.hash,
    };
  }
}

export default Block;
