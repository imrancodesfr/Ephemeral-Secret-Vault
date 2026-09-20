import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Block from "./Block.js";
import Transaction from "./Transaction.js";
import MerkleTree from "./MerkleTree.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEDGER_PATH = process.env.BLOCKCHAIN_PATH || path.join(__dirname, "..", "data", "blockchain.json");

class Blockchain {
  constructor() {
    this.chain = [];
    this.difficulty = 4;
    this.pendingTransactions = [];
    this.miningReward = 100;
    this.load();
    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }
  }

  createGenesisBlock() {
    const genesis = new Block({
      index: 0,
      transactions: [new Transaction({ type: "GENESIS", vaultId: "0", actor: "SYSTEM", data: { message: "Genesis Block" } })],
      previousHash: "0",
      nonce: 0,
      difficulty: this.difficulty,
      timestamp: Date.now(),
    });
    genesis.mineBlock();
    this.chain.push(genesis);
    this.save();
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addTransaction(transaction) {
    if (!(transaction instanceof Transaction)) {
      transaction = new Transaction(transaction);
    }
    this.pendingTransactions.push(transaction);
    return transaction;
  }

  minePendingTransactions(minerAddress) {
    const rewardTx = new Transaction({
      type: "MINING_REWARD",
      vaultId: "0",
      actor: minerAddress,
      data: { reward: this.miningReward },
    });

    const block = new Block({
      index: this.chain.length,
      transactions: [...this.pendingTransactions, rewardTx],
      previousHash: this.getLatestBlock().hash,
      nonce: 0,
      difficulty: this.difficulty,
      timestamp: Date.now(),
    });

    const result = block.mineBlock();
    this.chain.push(block);

    this.pendingTransactions = [];
    this.save();

    return { block: block.toJSON(), result };
  }

  addBlock(block) {
    block.previousHash = this.getLatestBlock().hash;
    block.mineBlock();
    this.chain.push(block);
    this.save();
  }

  isChainValid() {
    if (this.chain.length === 0) return true;

    // Genesis integrity: must reference the void previous hash and carry valid PoW.
    const genesis = this.chain[0];
    if (genesis.index !== 0 || genesis.previousHash !== "0") return false;
    if (genesis.hash !== genesis.calculateHash()) return false;
    if (!genesis.hash.startsWith("0".repeat(genesis.difficulty))) return false;
    if (new MerkleTree(genesis.transactions).getRoot() !== genesis.merkleRoot) return false;

    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== current.calculateHash()) return false;
      if (current.previousHash !== previous.hash) return false;

      // The hash must satisfy the proof-of-work difficulty the block was mined at.
      // Validating per-block means changing the difficulty never retroactively
      // invalidates blocks mined under an earlier difficulty setting.
      if (!current.hash.startsWith("0".repeat(current.difficulty))) return false;

      // The stored merkle root must match a recomputation over the block's transactions.
      const expectedRoot = new MerkleTree(current.transactions).getRoot();
      if (current.merkleRoot !== expectedRoot) return false;
    }
    return true;
  }

  getBlock(index) {
    return this.chain[index] || null;
  }

  getBlockByHash(hash) {
    return this.chain.find((b) => b.hash === hash) || null;
  }

  getTransactionsByType(type) {
    const transactions = [];
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.type === type) transactions.push(tx);
      }
    }
    return transactions;
  }

  getMerkleRoot(index) {
    const block = this.chain[index];
    if (!block) return null;
    return { merkleRoot: block.merkleRoot, transactions: block.transactions };
  }

  save() {
    const dir = path.dirname(LEDGER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = {
      chain: this.chain.map((b) => b.toJSON()),
      difficulty: this.difficulty,
      pendingTransactions: this.pendingTransactions.map((tx) =>
        typeof tx.toJSON === "function" ? tx.toJSON() : tx
      ),
    };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
  }

  load() {
    try {
      if (fs.existsSync(LEDGER_PATH)) {
        const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
        this.difficulty = raw.difficulty || 4;
        this.chain = (raw.chain || []).map(
          (b) =>
            new Block({
              index: b.index,
              // Rehydrate transactions into real instances so their canonical
              // serialization is stable across save/load. Without this, merkle
              // leaves and block hashes would diverge after every restart.
              transactions: (b.transactions || []).map((tx) => new Transaction(tx)),
              previousHash: b.previousHash,
              nonce: b.nonce,
              difficulty: b.difficulty,
              timestamp: b.timestamp,
            })
        );
        this.pendingTransactions = (raw.pendingTransactions || []).map(
          (tx) => new Transaction(tx)
        );
      }
    } catch {
      this.chain = [];
    }
  }

  getFullChain() {
    return this.chain.map((b) => b.toJSON());
  }
}

const blockchain = new Blockchain();
export default blockchain;
