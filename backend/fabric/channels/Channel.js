class Channel {
  constructor({ name, organizations }) {
    this.name = name;
    this.organizations = organizations || [];
    this.peers = [];
    this.transactions = [];
    this.createdAt = Date.now();
  }

  addPeer(peer) {
    this.peers.push(peer);
    return { channel: this.name, peer: peer.name, status: "added" };
  }

  removePeer(peerName) {
    this.peers = this.peers.filter((p) => p.name !== peerName);
    return { channel: this.name, peer: peerName, status: "removed" };
  }

  broadcastTransaction(transaction) {
    this.transactions.push(transaction);
    const endorsements = this.peers.map((peer) => peer.endorseTransaction(transaction));
    return {
      channel: this.name,
      transactionId: transaction.id,
      endorsements,
      committed: true,
    };
  }

  getTransactions() {
    return this.transactions;
  }

  getStatus() {
    return {
      name: this.name,
      organizations: this.organizations,
      peerCount: this.peers.length,
      transactionCount: this.transactions.length,
      createdAt: this.createdAt,
    };
  }
}

export default Channel;
