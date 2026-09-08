import blockchain from "./Blockchain.js";
import Transaction from "./Transaction.js";

class Miner {
  constructor() {
    this.blockchain = blockchain;
  }

  mine(minerAddress = "demo-miner", difficulty = null) {
    if (difficulty !== null) {
      this.blockchain.difficulty = difficulty;
    }

    const txCount = this.blockchain.pendingTransactions.length;
    if (txCount === 0) {
      return { success: false, message: "No pending transactions to mine" };
    }

    const startTime = Date.now();
    const result = this.blockchain.minePendingTransactions(minerAddress);
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      blockIndex: result.block.index,
      nonce: result.nonce,
      hash: result.hash,
      difficulty: this.blockchain.difficulty,
      transactions: txCount,
      elapsed: `${elapsed}ms`,
      message: "Block successfully mined",
    };
  }

  getStatus() {
    return {
      chainLength: this.blockchain.chain.length,
      pendingTransactions: this.blockchain.pendingTransactions.length,
      difficulty: this.blockchain.difficulty,
      isValid: this.blockchain.isChainValid(),
      latestBlockHash: this.blockchain.getLatestBlock().hash,
    };
  }

  addTransaction(type, vaultId, actor, data = {}) {
    const tx = new Transaction({ type, vaultId, actor, data });
    this.blockchain.addTransaction(tx);
    return tx;
  }
}

const miner = new Miner();
export default miner;
