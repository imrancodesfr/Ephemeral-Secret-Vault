class Peer {
  constructor({ name, organization, url }) {
    this.name = name;
    this.organization = organization;
    this.url = url;
    this.ledger = [];
    this.connected = false;
  }

  connect() {
    this.connected = true;
    return { peer: this.name, status: "connected" };
  }

  disconnect() {
    this.connected = false;
    return { peer: this.name, status: "disconnected" };
  }

  endorseTransaction(transaction) {
    if (!this.connected) throw new Error("Peer not connected");
    return {
      peer: this.name,
      transactionId: transaction.id,
      endorsement: "VALID",
      timestamp: Date.now(),
    };
  }

  getStatus() {
    return {
      name: this.name,
      organization: this.organization,
      connected: this.connected,
      ledgerEntries: this.ledger.length,
    };
  }
}

export default Peer;
